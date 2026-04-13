// Package exporter 提供 exporter 缓存管理功能
// 用于追踪所有上报数据的 exporter 实例状态
package exporter

import (
	"crypto/md5"
	"encoding/hex"
	"sort"
	"sync"
	"time"

	v1 "datasource/apis/datasource/exporter/v1"
)

// Manager 管理所有 exporter 的缓存
type Manager struct {
	mu       sync.RWMutex
	exporters map[string]*v1.Exporter // key = exporter ID

	// 配置
	staleTimeout    time.Duration // 超时阈值，超过此时间没上报标记为 down
	cleanupInterval time.Duration // 清理间隔
	cleanupAfter    time.Duration // down 状态超过此时间后从内存中删除

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

// NewManager 创建新的 exporter 管理器
func NewManager(cfg *ManagerConfig) *Manager {
	if cfg == nil {
		cfg = DefaultConfig()
	}

	m := &Manager{
		exporters:       make(map[string]*v1.Exporter),
		staleTimeout:    cfg.StaleTimeout,
		cleanupInterval: cfg.CleanupInterval,
		cleanupAfter:    cfg.CleanupAfter,
		stopCh:          make(chan struct{}),
	}

	// 启动后台健康检查
	go m.runHealthChecker()

	return m
}

// generateID 生成 exporter 的唯一标识
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
// 每次 exporter 上报指标时调用此方法
func (m *Manager) RecordScrape(appID, instance string, labels map[string]string) {
	id := generateID(appID, instance, labels)
	now := time.Now().Unix()

	m.mu.Lock()
	defer m.mu.Unlock()

	exp, exists := m.exporters[id]
	if !exists {
		// 新的 exporter
		exp = &v1.Exporter{
			ID:          id,
			AppID:       appID,
			Instance:    instance,
			Labels:      labels,
			State:       v1.ExporterState_UP,
			FirstScrape: now,
			LastScrape:  now,
			ScrapeCount: 1,
		}
		m.exporters[id] = exp
	} else {
		// 更新现有 exporter
		exp.LastScrape = now
		exp.ScrapeCount++
		exp.State = v1.ExporterState_UP
		exp.LastError = nil // 清除错误
		// 更新 labels（可能有变化）
		if len(labels) > 0 {
			exp.Labels = labels
		}
	}
}

// RecordError 记录上报错误
func (m *Manager) RecordError(appID, instance string, labels map[string]string, errMsg string) {
	id := generateID(appID, instance, labels)
	now := time.Now().Unix()

	m.mu.Lock()
	defer m.mu.Unlock()

	exp, exists := m.exporters[id]
	if !exists {
		exp = &v1.Exporter{
			ID:          id,
			AppID:       appID,
			Instance:    instance,
			Labels:      labels,
			State:       v1.ExporterState_UNKNOWN,
			FirstScrape: now,
			LastScrape:  now,
			ScrapeCount: 1,
			LastError:   &errMsg,
		}
		m.exporters[id] = exp
	} else {
		exp.LastScrape = now
		exp.ScrapeCount++
		exp.LastError = &errMsg
	}
}

// GetExporters 获取所有 exporter 列表
func (m *Manager) GetExporters() []*v1.Exporter {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*v1.Exporter, 0, len(m.exporters))
	for _, exp := range m.exporters {
		// 返回副本
		result = append(result, copyExporter(exp))
	}
	return result
}

// GetExportersByAppID 按 app_id 过滤获取 exporter 列表
func (m *Manager) GetExportersByAppID(appID string) []*v1.Exporter {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*v1.Exporter, 0)
	for _, exp := range m.exporters {
		if exp.AppID == appID {
			result = append(result, copyExporter(exp))
		}
	}
	return result
}

// GetExportersByState 按状态过滤获取 exporter 列表
func (m *Manager) GetExportersByState(state v1.ExporterState) []*v1.Exporter {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*v1.Exporter, 0)
	for _, exp := range m.exporters {
		if exp.State == state {
			result = append(result, copyExporter(exp))
		}
	}
	return result
}

// GetExporter 获取单个 exporter
func (m *Manager) GetExporter(id string) *v1.Exporter {
	m.mu.RLock()
	defer m.mu.RUnlock()

	exp, exists := m.exporters[id]
	if !exists {
		return nil
	}
	return copyExporter(exp)
}

// GetStats 获取统计信息
func (m *Manager) GetStats() *v1.ExporterStats {
	m.mu.RLock()
	defer m.mu.RUnlock()

	stats := &v1.ExporterStats{
		Total:        int64(len(m.exporters)),
		UpCount:      0,
		DownCount:    0,
		UnknownCount: 0,
	}

	for _, exp := range m.exporters {
		switch exp.State {
		case v1.ExporterState_UP:
			stats.UpCount++
		case v1.ExporterState_DOWN:
			stats.DownCount++
		case v1.ExporterState_UNKNOWN:
			stats.UnknownCount++
		}
	}

	return stats
}

// GetStatsByAppID 按 app_id 获取统计信息
func (m *Manager) GetStatsByAppID(appID string) *v1.ExporterStats {
	m.mu.RLock()
	defer m.mu.RUnlock()

	stats := &v1.ExporterStats{}

	for _, exp := range m.exporters {
		if exp.AppID != appID {
			continue
		}
		stats.Total++
		switch exp.State {
		case v1.ExporterState_UP:
			stats.UpCount++
		case v1.ExporterState_DOWN:
			stats.DownCount++
		case v1.ExporterState_UNKNOWN:
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

// checkHealth 检查所有 exporter 的健康状态
func (m *Manager) checkHealth() {
	now := time.Now().Unix()
	staleThreshold := now - int64(m.staleTimeout.Seconds())
	cleanupThreshold := now - int64(m.cleanupAfter.Seconds())

	m.mu.Lock()
	defer m.mu.Unlock()

	toDelete := make([]string, 0)

	for id, exp := range m.exporters {
		if exp.LastScrape < staleThreshold {
			// 超时，标记为 down
			if exp.State == v1.ExporterState_UP {
				exp.State = v1.ExporterState_DOWN
			}
		}

		// 如果已经 down 很久，删除
		if exp.State == v1.ExporterState_DOWN && exp.LastScrape < cleanupThreshold {
			toDelete = append(toDelete, id)
		}
	}

	// 删除过期的 exporter
	for _, id := range toDelete {
		delete(m.exporters, id)
	}
}

// Stop 停止管理器
func (m *Manager) Stop() {
	close(m.stopCh)
}

// copyExporter 返回 exporter 的副本
func copyExporter(exp *v1.Exporter) *v1.Exporter {
	copied := &v1.Exporter{
		ID:          exp.ID,
		AppID:       exp.AppID,
		Instance:    exp.Instance,
		State:       exp.State,
		FirstScrape: exp.FirstScrape,
		LastScrape:  exp.LastScrape,
		ScrapeCount: exp.ScrapeCount,
	}

	if exp.Labels != nil {
		copied.Labels = make(map[string]string, len(exp.Labels))
		for k, v := range exp.Labels {
			copied.Labels[k] = v
		}
	}

	if exp.LastError != nil {
		errCopy := *exp.LastError
		copied.LastError = &errCopy
	}

	if exp.ScrapeInterval != nil {
		intervalCopy := *exp.ScrapeInterval
		copied.ScrapeInterval = &intervalCopy
	}

	return copied
}

// Filter 用于过滤 exporter 列表
type Filter struct {
	AppID    string
	State    *v1.ExporterState
	Page     int64
	PageSize int64
}

// ListExporters 根据过滤条件获取 exporter 列表
func (m *Manager) ListExporters(filter *Filter) ([]*v1.Exporter, int64) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// 收集满足条件的 exporter
	filtered := make([]*v1.Exporter, 0)
	for _, exp := range m.exporters {
		// 按 app_id 过滤
		if filter.AppID != "" && exp.AppID != filter.AppID {
			continue
		}
		// 按状态过滤
		if filter.State != nil && exp.State != *filter.State {
			continue
		}
		filtered = append(filtered, exp)
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
			return []*v1.Exporter{}, total
		}
		end := start + filter.PageSize
		if end > total {
			end = total
		}
		filtered = filtered[start:end]
	}

	// 返回副本
	result := make([]*v1.Exporter, len(filtered))
	for i, exp := range filtered {
		result[i] = copyExporter(exp)
	}

	return result, total
}
