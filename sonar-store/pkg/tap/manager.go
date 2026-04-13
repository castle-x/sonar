// Package tap 提供 tap 缓存管理功能
// 用于追踪所有上报数据的 tap 实例状态
package tap

import (
	"crypto/md5"
	"encoding/hex"
	"sort"
	"sync"
	"time"

	tapv1 "sonar-store/internal/api/sonar-store/tap/v1"

	"go.uber.org/zap"
)

// Manager 管理所有 tap 的缓存
type Manager struct {
	mu   sync.RWMutex
	taps map[string]*tapv1.Tap // key = tap ID

	// 配置
	staleTimeout    time.Duration // 超时阈值，超过此时间没上报标记为 down
	cleanupInterval time.Duration // 清理间隔
	cleanupAfter    time.Duration // down 状态超过此时间后从内存中删除

	logger *zap.Logger
	stopCh chan struct{}
}

// ManagerConfig 管理器配置
type ManagerConfig struct {
	StaleTimeout    time.Duration // 默认 5 分钟
	CleanupInterval time.Duration // 默认 1 分钟
	CleanupAfter    time.Duration // 默认 1 小时
}

// DefaultConfig 返回默认配置
func DefaultConfig() *ManagerConfig {
	return &ManagerConfig{
		StaleTimeout:    5 * time.Minute,
		CleanupInterval: 1 * time.Minute,
		CleanupAfter:    1 * time.Hour,
	}
}

// NewManager 创建新的 tap 管理器
func NewManager(cfg *ManagerConfig, logger *zap.Logger) *Manager {
	if cfg == nil {
		cfg = DefaultConfig()
	}
	if logger == nil {
		logger, _ = zap.NewProduction()
	}

	m := &Manager{
		taps:            make(map[string]*tapv1.Tap),
		staleTimeout:    cfg.StaleTimeout,
		cleanupInterval: cfg.CleanupInterval,
		cleanupAfter:    cfg.CleanupAfter,
		logger:          logger,
		stopCh:          make(chan struct{}),
	}

	// 启动后台健康检查
	go m.runHealthChecker()

	return m
}

// generateID 生成 tap 的唯一标识
func generateID(appID, instance string, labels map[string]string) string {
	// 使用 app_id + instance + 排序后的 labels 生成 MD5 哈希
	h := md5.New()
	h.Write([]byte(appID))
	h.Write([]byte("|"))
	h.Write([]byte(instance))

	if len(labels) > 0 {
		// 按 key 排序
		keys := make([]string, 0, len(labels))
		for k := range labels {
			keys = append(keys, k)
		}
		sort.Strings(keys)

		h.Write([]byte("|"))
		for _, k := range keys {
			h.Write([]byte(k))
			h.Write([]byte("="))
			h.Write([]byte(labels[k]))
			h.Write([]byte(","))
		}
	}

	return hex.EncodeToString(h.Sum(nil))[:16] // 使用前 16 位
}

// RecordScrape 记录一次上报
// 每次 tap 上报指标时调用此方法
func (m *Manager) RecordScrape(appID, instance string, labels map[string]string) {
	id := generateID(appID, instance, labels)
	now := time.Now().Unix()

	m.mu.Lock()
	defer m.mu.Unlock()

	tap, exists := m.taps[id]
	if !exists {
		// 新的 tap
		tap = &tapv1.Tap{
			ID:          id,
			AppID:       appID,
			Instance:    instance,
			Labels:      labels,
			State:       tapv1.TapState_UP,
			FirstScrape: now,
			LastScrape:  now,
			ScrapeCount: 1,
		}
		m.taps[id] = tap
	} else {
		// 更新现有 tap
		tap.LastScrape = now
		tap.ScrapeCount++
		tap.State = tapv1.TapState_UP
		tap.LastError = nil // 清除错误
		// 更新 labels（可能有变化）
		if len(labels) > 0 {
			tap.Labels = labels
		}
	}
}

// RecordError 记录上报错误
func (m *Manager) RecordError(appID, instance string, labels map[string]string, errMsg string) {
	id := generateID(appID, instance, labels)
	now := time.Now().Unix()

	m.mu.Lock()
	defer m.mu.Unlock()

	tap, exists := m.taps[id]
	if !exists {
		tap = &tapv1.Tap{
			ID:          id,
			AppID:       appID,
			Instance:    instance,
			Labels:      labels,
			State:       tapv1.TapState_UNKNOWN,
			FirstScrape: now,
			LastScrape:  now,
			ScrapeCount: 1,
			LastError:   &errMsg,
		}
		m.taps[id] = tap
	} else {
		tap.LastScrape = now
		tap.ScrapeCount++
		tap.LastError = &errMsg
	}
}

// GetTaps 获取所有 tap 列表
func (m *Manager) GetTaps() []*tapv1.Tap {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*tapv1.Tap, 0, len(m.taps))
	for _, tap := range m.taps {
		result = append(result, copyTap(tap))
	}
	return result
}

// GetTapsByAppID 按 app_id 过滤获取 tap 列表
func (m *Manager) GetTapsByAppID(appID string) []*tapv1.Tap {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*tapv1.Tap, 0)
	for _, tap := range m.taps {
		if tap.AppID == appID {
			result = append(result, copyTap(tap))
		}
	}
	return result
}

// GetTapsByState 按状态过滤获取 tap 列表
func (m *Manager) GetTapsByState(state tapv1.TapState) []*tapv1.Tap {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*tapv1.Tap, 0)
	for _, tap := range m.taps {
		if tap.State == state {
			result = append(result, copyTap(tap))
		}
	}
	return result
}

// GetTap 获取单个 tap
func (m *Manager) GetTap(id string) *tapv1.Tap {
	m.mu.RLock()
	defer m.mu.RUnlock()

	tap, exists := m.taps[id]
	if !exists {
		return nil
	}
	return copyTap(tap)
}

// GetStats 获取统计信息
func (m *Manager) GetStats() *tapv1.TapStats {
	m.mu.RLock()
	defer m.mu.RUnlock()

	stats := &tapv1.TapStats{
		Total:        int64(len(m.taps)),
		UpCount:      0,
		DownCount:    0,
		UnknownCount: 0,
	}

	for _, tap := range m.taps {
		switch tap.State {
		case tapv1.TapState_UP:
			stats.UpCount++
		case tapv1.TapState_DOWN:
			stats.DownCount++
		case tapv1.TapState_UNKNOWN:
			stats.UnknownCount++
		}
	}

	return stats
}

// GetStatsByAppID 按 app_id 获取统计信息
func (m *Manager) GetStatsByAppID(appID string) *tapv1.TapStats {
	m.mu.RLock()
	defer m.mu.RUnlock()

	stats := &tapv1.TapStats{}

	for _, tap := range m.taps {
		if tap.AppID != appID {
			continue
		}
		stats.Total++
		switch tap.State {
		case tapv1.TapState_UP:
			stats.UpCount++
		case tapv1.TapState_DOWN:
			stats.DownCount++
		case tapv1.TapState_UNKNOWN:
			stats.UnknownCount++
		}
	}

	return stats
}

// runHealthChecker 后台健康检查
func (m *Manager) runHealthChecker() {
	ticker := time.NewTicker(m.cleanupInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			m.checkHealth()
		case <-m.stopCh:
			return
		}
	}
}

// checkHealth 检查所有 tap 的健康状态
func (m *Manager) checkHealth() {
	now := time.Now().Unix()
	staleThreshold := now - int64(m.staleTimeout.Seconds())
	cleanupThreshold := now - int64(m.cleanupAfter.Seconds())

	m.mu.Lock()
	defer m.mu.Unlock()

	toDelete := make([]string, 0)

	for id, tap := range m.taps {
		if tap.LastScrape < staleThreshold {
			// 超时，标记为 down
			if tap.State == tapv1.TapState_UP {
				tap.State = tapv1.TapState_DOWN
			}
		}

		// 如果已经 down 很久，删除
		if tap.State == tapv1.TapState_DOWN && tap.LastScrape < cleanupThreshold {
			toDelete = append(toDelete, id)
		}
	}

	// 删除过期的 tap
	for _, id := range toDelete {
		m.logger.Info("removing stale tap", zap.String("id", id))
		delete(m.taps, id)
	}
}

// Stop 停止管理器
func (m *Manager) Stop() {
	close(m.stopCh)
}

// copyTap 返回 tap 的副本
func copyTap(tap *tapv1.Tap) *tapv1.Tap {
	copied := &tapv1.Tap{
		ID:          tap.ID,
		AppID:       tap.AppID,
		Instance:    tap.Instance,
		State:       tap.State,
		FirstScrape: tap.FirstScrape,
		LastScrape:  tap.LastScrape,
		ScrapeCount: tap.ScrapeCount,
	}

	if tap.Labels != nil {
		copied.Labels = make(map[string]string, len(tap.Labels))
		for k, v := range tap.Labels {
			copied.Labels[k] = v
		}
	}

	if tap.LastError != nil {
		errCopy := *tap.LastError
		copied.LastError = &errCopy
	}

	if tap.ScrapeInterval != nil {
		intervalCopy := *tap.ScrapeInterval
		copied.ScrapeInterval = &intervalCopy
	}

	return copied
}

// Filter 用于过滤 tap 列表
type Filter struct {
	AppID    string
	State    *tapv1.TapState
	Page     int64
	PageSize int64
}

// ListTaps 根据过滤条件获取 tap 列表
func (m *Manager) ListTaps(filter *Filter) ([]*tapv1.Tap, int64) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// 收集满足条件的 tap
	filtered := make([]*tapv1.Tap, 0)
	for _, tap := range m.taps {
		// 按 app_id 过滤
		if filter.AppID != "" && tap.AppID != filter.AppID {
			continue
		}
		// 按状态过滤
		if filter.State != nil && tap.State != *filter.State {
			continue
		}
		filtered = append(filtered, tap)
	}

	total := int64(len(filtered))

	// 排序（按 LastScrape 降序）
	sort.Slice(filtered, func(i, j int) bool {
		return filtered[i].LastScrape > filtered[j].LastScrape
	})

	// 分页
	if filter.PageSize > 0 {
		page := filter.Page
		if page < 1 {
			page = 1
		}
		start := (page - 1) * filter.PageSize
		if start >= total {
			return []*tapv1.Tap{}, total
		}
		end := start + filter.PageSize
		if end > total {
			end = total
		}
		filtered = filtered[start:end]
	}

	// 返回副本
	result := make([]*tapv1.Tap, len(filtered))
	for i, tap := range filtered {
		result[i] = copyTap(tap)
	}

	return result, total
}
