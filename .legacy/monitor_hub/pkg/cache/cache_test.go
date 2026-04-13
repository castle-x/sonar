package cache

import (
	"fmt"
	"sync"
	"testing"
	"time"
)

func TestCache_BasicOperations(t *testing.T) {
	// 创建容量为 3 的缓存
	cache := NewCache[string](WithMaxSize(3))

	// 测试 Put 和 Get
	cache.Put("key1", "value1")
	cache.Put("key2", "value2")
	cache.Put("key3", "value3")

	if val, ok := cache.Get("key1"); !ok || val != "value1" {
		t.Errorf("expected value1, got %v", val)
	}

	// 测试长度
	if cache.Len() != 3 {
		t.Errorf("expected length 3, got %d", cache.Len())
	}
}

func TestCache_Eviction(t *testing.T) {
	// 创建容量为 3 的缓存
	cache := NewCache[int](WithMaxSize(3))

	// 填满缓存
	cache.Put("key1", 1)
	cache.Put("key2", 2)
	cache.Put("key3", 3)

	// 添加第 4 个元素，应该淘汰 key1
	cache.Put("key4", 4)

	// key1 应该不存在了
	if _, ok := cache.Get("key1"); ok {
		t.Error("key1 should have been evicted")
	}

	// key2, key3, key4 应该存在
	if _, ok := cache.Get("key2"); !ok {
		t.Error("key2 should exist")
	}
	if _, ok := cache.Get("key3"); !ok {
		t.Error("key3 should exist")
	}
	if _, ok := cache.Get("key4"); !ok {
		t.Error("key4 should exist")
	}

	// 检查队列顺序
	keys := cache.Keys()
	expected := []string{"key2", "key3", "key4"}
	for i, key := range keys {
		if key != expected[i] {
			t.Errorf("expected key %s at position %d, got %s", expected[i], i, key)
		}
	}
}

func TestCache_Update(t *testing.T) {
	cache := NewCache[string](WithMaxSize(3))

	cache.Put("key1", "value1")
	cache.Put("key1", "value1_updated")

	if val, ok := cache.Get("key1"); !ok || val != "value1_updated" {
		t.Errorf("expected value1_updated, got %v", val)
	}

	// 更新不应该改变长度
	if cache.Len() != 1 {
		t.Errorf("expected length 1, got %d", cache.Len())
	}
}

func TestCache_Delete(t *testing.T) {
	cache := NewCache[string](WithMaxSize(3))

	cache.Put("key1", "value1")
	cache.Put("key2", "value2")

	cache.Delete("key1")

	if _, ok := cache.Get("key1"); ok {
		t.Error("key1 should have been deleted")
	}

	if cache.Len() != 1 {
		t.Errorf("expected length 1, got %d", cache.Len())
	}
}

func TestCache_Clear(t *testing.T) {
	cache := NewCache[string](WithMaxSize(3))

	cache.Put("key1", "value1")
	cache.Put("key2", "value2")

	cache.Clear()

	if cache.Len() != 0 {
		t.Errorf("expected length 0 after clear, got %d", cache.Len())
	}

	if _, ok := cache.Get("key1"); ok {
		t.Error("cache should be empty after clear")
	}
}

func TestCache_Concurrent(t *testing.T) {
	cache := NewCache[int](WithMaxSize(100))
	var wg sync.WaitGroup

	// 并发写入
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			cache.Put(string(rune('A'+n)), n)
		}(i)
	}

	// 并发读取
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			cache.Get(string(rune('A' + n)))
		}(i)
	}

	wg.Wait()

	// 检查最终状态
	if cache.Len() > 100 {
		t.Errorf("cache size exceeded max size: %d", cache.Len())
	}
}

func TestCache_GenericTypes(t *testing.T) {
	// 测试不同类型的泛型

	// struct 类型
	type User struct {
		Name string
		Age  int
	}
	userCache := NewCache[User](WithMaxSize(5))
	userCache.Put("user1", User{Name: "Alice", Age: 30})
	if user, ok := userCache.Get("user1"); !ok || user.Name != "Alice" {
		t.Error("struct type cache failed")
	}

	// slice 类型
	sliceCache := NewCache[[]int](WithMaxSize(5))
	sliceCache.Put("slice1", []int{1, 2, 3})
	if slice, ok := sliceCache.Get("slice1"); !ok || len(slice) != 3 {
		t.Error("slice type cache failed")
	}

	// map 类型
	mapCache := NewCache[map[string]string](WithMaxSize(5))
	mapCache.Put("map1", map[string]string{"key": "value"})
	if m, ok := mapCache.Get("map1"); !ok || m["key"] != "value" {
		t.Error("map type cache failed")
	}
}

func TestCache_Range(t *testing.T) {
	cache := NewCache[int](WithMaxSize(5))

	// 添加元素
	cache.Put("key1", 1)
	cache.Put("key2", 2)
	cache.Put("key3", 3)

	// 测试完整遍历
	visited := make(map[string]int)
	cache.Range(func(key string, value int) bool {
		visited[key] = value
		return true // 继续遍历
	})

	if len(visited) != 3 {
		t.Errorf("expected to visit 3 items, visited %d", len(visited))
	}
	if visited["key1"] != 1 || visited["key2"] != 2 || visited["key3"] != 3 {
		t.Error("visited values don't match")
	}

	// 测试提前终止遍历
	count := 0
	cache.Range(func(key string, value int) bool {
		count++
		return count < 2 // 只遍历前 2 个
	})

	if count != 2 {
		t.Errorf("expected to visit 2 items before stopping, visited %d", count)
	}

	// 测试遍历顺序（应该按插入顺序）
	cache.Clear()
	cache.Put("a", 1)
	cache.Put("b", 2)
	cache.Put("c", 3)

	keys := []string{}
	cache.Range(func(key string, value int) bool {
		keys = append(keys, key)
		return true
	})

	expected := []string{"a", "b", "c"}
	for i, key := range keys {
		if key != expected[i] {
			t.Errorf("expected key %s at position %d, got %s", expected[i], i, key)
		}
	}
}

func TestCache_Expiration(t *testing.T) {
	// 创建带默认 TTL 的缓存
	cache := NewCache[string](WithMaxSize(10), WithDefaultTTL(200*time.Millisecond))
	defer cache.Stop()

	// 添加元素（使用默认 TTL）
	cache.Put("key1", "value1")

	// 立即获取应该成功
	if val, ok := cache.Get("key1"); !ok || val != "value1" {
		t.Error("should get value immediately after put")
	}

	// 等待过期
	time.Sleep(300 * time.Millisecond)

	// 现在应该获取不到
	if _, ok := cache.Get("key1"); ok {
		t.Error("key1 should have expired")
	}

	// 长度应该为 0（过期元素在 Get 时被删除）
	if cache.Len() != 0 {
		t.Errorf("expected length 0 after expiration, got %d", cache.Len())
	}
}

func TestCache_CustomTTL(t *testing.T) {
	// 创建缓存（不设置默认 TTL）
	cache := NewCache[string](WithMaxSize(10))

	// 添加永不过期的元素
	cache.Put("key1", "value1")

	// 添加 100ms 后过期的元素
	cache.PutWithTTL("key2", "value2", 100*time.Millisecond)

	// 添加 300ms 后过期的元素
	cache.PutWithTTL("key3", "value3", 300*time.Millisecond)

	// 等待 150ms
	time.Sleep(150 * time.Millisecond)

	// key1 应该存在（永不过期）
	if _, ok := cache.Get("key1"); !ok {
		t.Error("key1 should still exist")
	}

	// key2 应该过期
	if _, ok := cache.Get("key2"); ok {
		t.Error("key2 should have expired")
	}

	// key3 应该存在
	if _, ok := cache.Get("key3"); !ok {
		t.Error("key3 should still exist")
	}

	// 等待 key3 过期
	time.Sleep(200 * time.Millisecond)

	if _, ok := cache.Get("key3"); ok {
		t.Error("key3 should have expired")
	}
}

func TestCache_AutoCleanup(t *testing.T) {
	// 创建带自动清理的缓存
	cache := NewCache[int](WithMaxSize(10), WithDefaultTTL(100*time.Millisecond))
	defer cache.Stop()

	// 添加多个元素
	for i := 0; i < 5; i++ {
		cache.Put(fmt.Sprintf("key%d", i), i)
	}

	// 确认都存在
	if cache.Len() != 5 {
		t.Errorf("expected length 5, got %d", cache.Len())
	}

	// 等待过期 + 清理周期（清理器每分钟运行一次，但我们可以手动触发）
	time.Sleep(150 * time.Millisecond)

	// 手动触发清理
	cache.removeExpired()

	// 所有元素应该被清理
	if cache.Len() != 0 {
		t.Errorf("expected length 0 after cleanup, got %d", cache.Len())
	}
}

func TestCache_RangeSkipExpired(t *testing.T) {
	cache := NewCache[string](WithMaxSize(10))

	// 添加永不过期的元素
	cache.Put("key1", "value1")

	// 添加快速过期的元素
	cache.PutWithTTL("key2", "value2", 50*time.Millisecond)

	// 添加永不过期的元素
	cache.Put("key3", "value3")

	// 等待 key2 过期
	time.Sleep(100 * time.Millisecond)

	// Range 应该跳过过期元素
	visited := []string{}
	cache.Range(func(key string, value string) bool {
		visited = append(visited, key)
		return true
	})

	// 只应该访问 key1 和 key3
	if len(visited) != 2 {
		t.Errorf("expected to visit 2 items, visited %d", len(visited))
	}
	if visited[0] != "key1" || visited[1] != "key3" {
		t.Errorf("unexpected visited keys: %v", visited)
	}
}
