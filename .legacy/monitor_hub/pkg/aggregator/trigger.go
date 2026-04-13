package aggregator

import (
	"context"
	"time"

	"monitor_hub/internal/trigger"
)

// ============================================
// 聚合触发器
// ============================================

// AggregationTrigger 聚合触发器
//
// 定时触发聚合管理器的 RunOnce 方法
type AggregationTrigger struct {
	manager  *Manager
	interval time.Duration
}

// NewAggregationTrigger 创建聚合触发器
//
// 参数:
//   - manager: 聚合管理器
//
// 返回:
//   - trigger.Trigger: 触发器实例
func NewAggregationTrigger(manager *Manager) *AggregationTrigger {
	return &AggregationTrigger{
		manager:  manager,
		interval: manager.config.GetMinInterval(),
	}
}

// Name 实现 Trigger 接口
func (t *AggregationTrigger) Name() string {
	return "aggregation-collector"
}

// Type 实现 Trigger 接口
func (t *AggregationTrigger) Type() trigger.TriggerType {
	return trigger.TriggerTypeInterval
}

// Interval 实现 IntervalTrigger 接口
func (t *AggregationTrigger) Interval() time.Duration {
	return t.interval
}

// Execute 实现 Trigger 接口
func (t *AggregationTrigger) Execute(ctx context.Context) error {
	now := time.Now()
	/* logger.Debug("Aggregation trigger fired at %s", now.Format(time.DateTime)) */

	if err := t.manager.RunOnce(ctx, now); err != nil {
		logger.Error("Aggregation RunOnce failed: %v", err)
		return err
	}

	return nil
}

// ============================================
// 清理触发器
// ============================================

// CleanupTrigger 数据清理触发器
//
// 定时清理各级别的过期数据
type CleanupTrigger struct {
	manager  *Manager
	interval time.Duration
}

// NewCleanupTrigger 创建清理触发器
//
// 参数:
//   - manager: 聚合管理器
//
// 返回:
//   - trigger.Trigger: 触发器实例
func NewCleanupTrigger(manager *Manager) *CleanupTrigger {
	// 清理间隔设置为最小保留时长
	// 这样可以确保及时清理过期数据，避免磁盘占用过大
	interval := manager.config.GetMinRetention()
	// 使用interval的一半
	interval = interval / 2
	// 如果最小保留时长过短（< 1分钟），设置一个合理的下限
	if interval < time.Minute {
		interval = time.Minute
	}
	t:=&CleanupTrigger{
		manager:  manager,
		interval: interval,
	}
	return t
}

// Name 实现 Trigger 接口
func (t *CleanupTrigger) Name() string {
	return "aggregation-cleanup"
}

// Type 实现 Trigger 接口
func (t *CleanupTrigger) Type() trigger.TriggerType {
	return trigger.TriggerTypeInterval
}

// Interval 实现 IntervalTrigger 接口
func (t *CleanupTrigger) Interval() time.Duration {
	return t.interval
}

// Execute 实现 Trigger 接口
func (t *CleanupTrigger) Execute(ctx context.Context) error {
	now := time.Now()
	// logger.Debug("Cleanup trigger fired at %s", now.Format(time.DateTime))

	if err := t.manager.CleanupExpiredData(ctx, now); err != nil {
		logger.Error("Cleanup failed: %v", err)
		return err
	}

	return nil
}
