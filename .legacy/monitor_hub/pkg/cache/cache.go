package cache

import (
	"sync"
	"time"
)

// cacheItem 缓存项，包含值和过期时间
type cacheItem[T any] struct {
	value    T
	expireAt time.Time // 过期时间（零值表示永不过期）
}

// Cache 有限长度的缓存结构，支持通过 key 快速查找 value，并发读写安全
// 当队列满时，新加入的元素会替换掉队列头部的元素（FIFO策略）
type Cache[T any] struct {
	maxSize    int                     // 最大容量
	defaultTTL time.Duration           // 默认过期时间（0 表示永不过期）
	queue      []string                // key 队列，维护插入顺序（最旧的在前）
	data       map[string]cacheItem[T] // key -> cacheItem 映射
	mu         sync.RWMutex            // 读写锁
	stopChan   chan struct{}           // 停止清理协程的信号
	cleanOnce  sync.Once               // 确保清理协程只启动一次
}

// Option 缓存配置选项
type Option func(*cacheOptions)

type cacheOptions struct {
	maxSize    int
	defaultTTL time.Duration
}

// WithMaxSize 设置最大容量
func WithMaxSize(size int) Option {
	return func(o *cacheOptions) {
		o.maxSize = size
	}
}

// WithDefaultTTL 设置默认过期时间
func WithDefaultTTL(ttl time.Duration) Option {
	return func(o *cacheOptions) {
		o.defaultTTL = ttl
	}
}

// NewCache 创建一个新的缓存实例
func NewCache[T any](opts ...Option) *Cache[T] {
	options := &cacheOptions{
		maxSize:    100, // 默认容量
		defaultTTL: 0,   // 默认永不过期
	}

	for _, opt := range opts {
		opt(options)
	}

	cache := &Cache[T]{
		maxSize:    options.maxSize,
		defaultTTL: options.defaultTTL,
		queue:      make([]string, 0, options.maxSize),
		data:       make(map[string]cacheItem[T]),
		stopChan:   make(chan struct{}),
	}

	// 如果设置了默认 TTL，启动后台清理
	if options.defaultTTL > 0 {
		cache.startCleaner()
	}
	if cache.maxSize <= 0 {
		cache.maxSize = 100
	}
	if cache.defaultTTL <= 0 {
		cache.defaultTTL = 0
	}
	return cache
}

// Get 获取缓存值
// 返回值和是否存在的标志
// 如果元素已过期，返回零值和 false
func (c *Cache[T]) Get(key string) (T, bool) {
	c.mu.RLock()
	item, exists := c.data[key]
	c.mu.RUnlock()

	if !exists {
		var zero T
		return zero, false
	}

	// 检查是否过期
	if !item.expireAt.IsZero() && time.Now().After(item.expireAt) {
		// 已过期，删除并返回不存在
		c.Delete(key)
		var zero T
		return zero, false
	}

	return item.value, true
}

// Put 添加或更新缓存值（使用默认 TTL）
// 如果 key 已存在，则更新值
// 如果队列已满，则移除最旧的元素
func (c *Cache[T]) Put(key string, value T) {
	c.PutWithTTL(key, value, c.defaultTTL)
}

// PutWithTTL 添加或更新缓存值，并指定过期时间
// ttl: 过期时间，0 表示永不过期
func (c *Cache[T]) PutWithTTL(key string, value T, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// 计算过期时间
	var expireAt time.Time
	if ttl > 0 {
		expireAt = time.Now().Add(ttl)
	}

	item := cacheItem[T]{
		value:    value,
		expireAt: expireAt,
	}

	// 如果 key 已存在，只更新值，不改变队列顺序
	if _, exists := c.data[key]; exists {
		c.data[key] = item
		return
	}

	// 如果队列已满，移除最旧的元素（队列头部）
	if len(c.queue) >= c.maxSize {
		oldestKey := c.queue[0]
		c.queue = c.queue[1:] // 移除队列头部
		delete(c.data, oldestKey)
	}

	// 添加新元素到队列尾部
	c.queue = append(c.queue, key)
	c.data[key] = item
}

// Delete 删除指定 key 的缓存
func (c *Cache[T]) Delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// 从 map 中删除
	if _, exists := c.data[key]; !exists {
		return
	}
	delete(c.data, key)

	// 从队列中删除
	for i, k := range c.queue {
		if k == key {
			c.queue = append(c.queue[:i], c.queue[i+1:]...)
			break
		}
	}
}

// Len 返回当前缓存的元素数量
func (c *Cache[T]) Len() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.data)
}

// Clear 清空所有缓存
func (c *Cache[T]) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.queue = make([]string, 0, c.maxSize)
	c.data = make(map[string]cacheItem[T])
}

// Keys 返回所有 key 的列表（按插入顺序）
func (c *Cache[T]) Keys() []string {
	c.mu.RLock()
	defer c.mu.RUnlock()

	keys := make([]string, len(c.queue))
	copy(keys, c.queue)
	return keys
}

// Range 遍历缓存中的所有元素（按插入顺序）
// 回调函数返回 false 时停止遍历
// 自动跳过已过期的元素
// 类似于 sync.Map.Range
func (c *Cache[T]) Range(fn func(key string, value T) bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	now := time.Now()
	for _, key := range c.queue {
		item := c.data[key]

		// 跳过已过期的元素
		if !item.expireAt.IsZero() && now.After(item.expireAt) {
			continue
		}

		if !fn(key, item.value) {
			break
		}
	}
}

// startCleaner 启动后台清理协程
func (c *Cache[T]) startCleaner() {
	c.cleanOnce.Do(func() {
		go c.cleanExpired()
	})
}

// cleanExpired 定期清理过期元素
func (c *Cache[T]) cleanExpired() {
	ticker := time.NewTicker(time.Minute) // 每分钟清理一次
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			c.removeExpired()
		case <-c.stopChan:
			return
		}
	}
}

// removeExpired 移除所有过期元素
func (c *Cache[T]) removeExpired() {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	newQueue := make([]string, 0, len(c.queue))

	for _, key := range c.queue {
		item, exists := c.data[key]
		if !exists {
			continue
		}

		// 检查是否过期
		if !item.expireAt.IsZero() && now.After(item.expireAt) {
			delete(c.data, key) // 删除过期元素
		} else {
			newQueue = append(newQueue, key) // 保留未过期元素
		}
	}

	c.queue = newQueue
}

// Stop 停止后台清理协程
// 应在不再使用缓存时调用，避免 goroutine 泄漏
func (c *Cache[T]) Stop() {
	close(c.stopChan)
}
