package aggregator

import (
	"context"
	"fmt"
	"sync"
	"time"

	"monitor_hub/pkg/storage"

	"git.woa.com/castlexu/goutils/ablog"
	"github.com/prometheus/prometheus/model/labels"
)

var logger = ablog.NewLogger("aggregator")

// EventPublisher 事件发布器接口（避免循环依赖）
type EventPublisher interface {
	PublishEvent(topic string, event interface{}) error
}

// AggregationEvent 聚合事件数据
type AggregationEvent struct {
	Level     string            // 聚合级别
	Timestamp time.Time         // 聚合时间戳
	Points    []AggregatedPoint // 聚合后的数据点
	Count     int               // 数据点数量
}

// ============================================
// 聚合管理器
// ============================================

// Manager 级联聚合管理器
type Manager struct {
	// 配置
	config *Config

	// TSDB 存储（负责序列化和反序列化）
	tsdb storage.Storage[AggregatedPoint]

	// 数据采集器
	collector Collector

	// 事件发布器（可选，用于推送聚合事件到 WebSocket）
	eventPublisher EventPublisher

	// 最后一次聚合时间（每个级别）
	lastAggregation map[string]time.Time
	mu              sync.RWMutex

	// 最小间隔
	minInterval time.Duration
}

// ManagerOption 管理器选项
type ManagerOption func(*Manager)

// WithEventPublisher 设置事件发布器
func WithEventPublisher(publisher EventPublisher) ManagerOption {
	return func(m *Manager) {
		m.eventPublisher = publisher
	}
}

// NewManager 创建聚合管理器
//
// 参数:
//   - config: 聚合配置
//   - tsdb: TSDB 存储
//   - collector: 数据采集器
//   - opts: 可选配置
//
// 返回:
//   - *Manager: 管理器实例
//   - error: 错误信息
func NewManager(
	config *Config,
	tsdb storage.Storage[AggregatedPoint],
	collector Collector,
	opts ...ManagerOption,
) (*Manager, error) {
	// 验证配置
	if err := config.Validate(); err != nil {
		return nil, fmt.Errorf("invalid config: %w", err)
	}

	if tsdb == nil {
		return nil, fmt.Errorf("tsdb cannot be nil")
	}

	if collector == nil {
		return nil, fmt.Errorf("collector cannot be nil")
	}

	m := &Manager{
		config:          config,
		tsdb:            tsdb,
		collector:       collector,
		lastAggregation: make(map[string]time.Time),
		minInterval:     config.GetMinInterval(),
	}

	// 应用选项
	for _, opt := range opts {
		opt(m)
	}

	logger.Info("Aggregation manager created with %d levels, min_interval=%v, event_publisher=%v",
		len(config.Levels), m.minInterval, m.eventPublisher != nil)

	return m, nil
}

// ============================================
// 核心方法
// ============================================

// RunOnce 执行一次聚合检查（由触发器调用）
//
// 参数:
//   - ctx: 上下文
//   - now: 当前时间
//
// 返回:
//   - error: 错误信息
func (m *Manager) RunOnce(ctx context.Context, now time.Time) error {
	// 收集所有聚合的数据点
	allAggregatedPoints := make([]AggregatedPoint, 0)

	// 1️⃣ 始终执行最小级别的聚合（15s）
	firstLevel := m.config.Levels[0]
	points, err := m.aggregateLevel(ctx, &firstLevel, now)
	if err != nil {
		logger.Error("Failed to aggregate %s: %v", firstLevel.Name, err)
		// 不返回错误，继续执行其他级别
	} else if len(points) > 0 {
		allAggregatedPoints = append(allAggregatedPoints, points...)
	}

	// 2️⃣ 遍历其他级别，检查时间边界
	for i := 1; i < len(m.config.Levels); i++ {
		level := &m.config.Levels[i]

		// 🔑 检查是否到达该级别的时间边界
		if m.isTimeBoundary(level, now) {
			/* logger.Info("Time boundary reached for level %s at %s",
				level.Name, now.Format(time.DateTime)) */

			points, err := m.aggregateLevel(ctx, level, now)
			if err != nil {
				logger.Error("Failed to aggregate %s: %v", level.Name, err)
				// 继续执行其他级别
			} else if len(points) > 0 {
				allAggregatedPoints = append(allAggregatedPoints, points...)
			}
		}
	}

	// 3️⃣ 统一推送聚合事件（合并所有级别的数据点）
	if len(allAggregatedPoints) > 0 {
		m.publishAggregationEvent("all", now, allAggregatedPoints)
	}

	return nil
}

// ============================================
// 内部方法 - 聚合执行
// ============================================

// aggregateLevel 执行单个级别的聚合
//
// 返回:
//   - []AggregatedPoint: 聚合后的数据点
//   - error: 错误信息
func (m *Manager) aggregateLevel(ctx context.Context, level *LevelConfig, now time.Time) ([]AggregatedPoint, error) {
	// 1️⃣ 应用查询延迟（将当前时间向前移动，用于等待迟到数据）
	queryDelay := m.config.QueryDelay
	if queryDelay == 0 {
		queryDelay = 40 * time.Second // 默认 40 秒
	}

	adjustedNow := now.Add(-queryDelay)

	/* logger.Debug("Aggregating level %s: actual_time=%s, adjusted_time=%s (query_delay=%v)",
		level.Name,
		now.Format(time.DateTime),
		adjustedNow.Format(time.DateTime),
		queryDelay) */

	// 2️⃣ 对齐到时间边界（使用调整后的时间）
	timestamp := AlignTimestamp(adjustedNow, level.Interval)

	// 检查是否已经聚合过这个时间点
	m.mu.RLock()
	lastTime, exists := m.lastAggregation[level.Name]
	m.mu.RUnlock()

	if exists && !timestamp.After(lastTime) {
		/* logger.Debug("Level %s at %s already aggregated, skip", level.Name, timestamp.Format(time.DateTime)) */
		return nil, nil
	}

	/* logger.Debug("Aggregating level %s at %s", level.Name, timestamp.Format(time.DateTime)) */

	// 3️⃣ 判断数据来源
	if level.Source == "raw" {
		// 从 Pushgateway 采集原始数据
		return m.collectAndAggregate(ctx, level, timestamp)
	}

	// 4️⃣ 从 TSDB 查询源级别数据
	return m.cascadeAggregate(ctx, level, timestamp)
}

// collectAndAggregate 采集并聚合原始数据
//
// 返回:
//   - []AggregatedPoint: 聚合后的数据点
//   - error: 错误信息
func (m *Manager) collectAndAggregate(ctx context.Context, level *LevelConfig, timestamp time.Time) ([]AggregatedPoint, error) {
	// 计算时间范围
	endTime := timestamp
	startTime := timestamp.Add(-level.Interval)

	/* logger.Debug("Collecting raw data for level %s from [%s, %s) with timeout %v",
		level.Name,
		startTime.Format(time.DateTime),
		endTime.Format(time.DateTime),
		m.config.CollectTimeout) */

	// 创建带超时的 context
	collectCtx, cancel := context.WithTimeout(ctx, m.config.CollectTimeout)
	defer cancel()

	// 采集原始数据（传递时间范围和超时 context）
	rawPoints, err := m.collector.Collect(collectCtx, startTime, endTime)
	if err != nil {
		// 检查是否是超时错误
		if collectCtx.Err() == context.DeadlineExceeded {
			return nil, fmt.Errorf("collect timeout after %v: %w", m.config.CollectTimeout, err)
		}
		return nil, fmt.Errorf("collect failed: %w", err)
	}

	if len(rawPoints) == 0 {
		logger.Warn("No data collected for level %s at %s", level.Name, timestamp.Format(time.DateTime))
		return nil, nil
	}

	/* logger.Debug("Collected %d raw points for level %s", len(rawPoints), level.Name) */

	// 聚合原始数据
	aggregated := AggregateRaw(rawPoints, level.Name, timestamp)

	// 写入 TSDB
	if err := m.tsdb.Write(ctx, aggregated); err != nil {
		return nil, fmt.Errorf("write failed: %w", err)
	}

	// 更新最后聚合时间
	m.mu.Lock()
	m.lastAggregation[level.Name] = timestamp
	m.mu.Unlock()

	logger.Info("Aggregated %d points to level %s at %s (from %d raw points)",
		len(aggregated), level.Name, timestamp.Format(time.DateTime), len(rawPoints))

	// 返回聚合后的数据点（不在这里推送事件）
	return aggregated, nil
}

// cascadeAggregate 级联聚合（从源级别聚合）
//
// 返回:
//   - []AggregatedPoint: 聚合后的数据点
//   - error: 错误信息
func (m *Manager) cascadeAggregate(ctx context.Context, level *LevelConfig, timestamp time.Time) ([]AggregatedPoint, error) {
	// 1️⃣ 计算查询时间范围
	endTime := timestamp
	startTime := timestamp.Add(-level.Interval)

	/* logger.Debug("Cascading %s: query %s from [%s, %s)",
		level.Name, level.Source,
		startTime.Format(time.DateTime),
		endTime.Format(time.DateTime)) */

	// 2️⃣ 从 TSDB 查询源级别数据
	// ✅ 关键：必须过滤 __aggregation_level__ 标签，只查询源级别的数据
	// ✅ QueryByLabels 会在内部调用 serializer.FromDataPoint() 进行反序列化
	sourcePoints, err := m.tsdb.QueryByLabels(ctx, &storage.LabelQuery{
		Labels:    labels.FromStrings(string(AggregatedInternalLabelAggregationLevel), level.Source),
		StartTime: startTime.UnixMilli(),
		EndTime:   endTime.UnixMilli(),
	})
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}

	actualCount := len(sourcePoints)

	// 3️⃣ 计算期望的数据点数
	sourceLevel := m.config.GetSourceLevel(level.Name)
	if sourceLevel == nil {
		return nil, fmt.Errorf("source level not found: %s", level.Source)
	}

	// 计算基础期望时间点数
	baseExpectedPoints := CalculateExpectedPoints(level.Interval, sourceLevel.Interval)
	if baseExpectedPoints < level.MinPoints {
		baseExpectedPoints = level.MinPoints
	}

	// 🔑 关键修复：统计实际有多少个唯一指标（不包括聚合类型）
	// 扁平化设计中，每个指标会产生 4 种聚合类型（avg/min/max/count）
	uniqueMetrics := countUniqueMetrics(sourcePoints)

	// 期望数据点数 = 基础时间点数 × 4（聚合类型） × 指标数量
	expectedCount := baseExpectedPoints * 4 * uniqueMetrics

	/* logger.Debug("Level %s: got %d points, expected %d (base_time_points=%d, aggregation_types=4, unique_metrics=%d)",
		level.Name, actualCount, expectedCount, baseExpectedPoints, uniqueMetrics) */

	// 4️⃣ 评估数据质量
	quality := EvaluateDataQuality(actualCount, expectedCount, level.FallbackMode)

	if !quality.IsValid() {
		logger.Warn("Skipping %s at %s: %s", level.Name, timestamp.Format(time.DateTime), quality.MissingReason)
		return nil, nil
	}

	// 5️⃣ 聚合数据
	aggregated := Aggregate(sourcePoints, level.Name, timestamp, quality)

	if len(aggregated) == 0 {
		logger.Warn("No data to aggregate for level %s at %s", level.Name, timestamp.Format(time.DateTime))
		return nil, nil
	}

	// 6️⃣ 写入 TSDB
	if err := m.tsdb.Write(ctx, aggregated); err != nil {
		return nil, fmt.Errorf("write failed: %w", err)
	}

	// 7️⃣ 更新最后聚合时间
	m.mu.Lock()
	m.lastAggregation[level.Name] = timestamp
	m.mu.Unlock()

	logger.Info("Aggregated %d points to level %s at %s (%s)",
		len(aggregated), level.Name, timestamp.Format(time.DateTime), quality.String())

	// 返回聚合后的数据点（不在这里推送事件）
	return aggregated, nil
}

// ============================================
// 内部方法 - 辅助
// ============================================

// countLevels 统计数据点中包含的不同聚合级别数量
func countLevels(points []AggregatedPoint) int {
	levels := make(map[string]struct{})
	for _, point := range points {
		levels[point.Level] = struct{}{}
	}
	return len(levels)
}

// publishAggregationEvent 推送聚合事件
func (m *Manager) publishAggregationEvent(level string, timestamp time.Time, points []AggregatedPoint) {
	if m.eventPublisher == nil {
		return
	}

	event := &AggregationEvent{
		Level:     level,
		Timestamp: timestamp,
		Points:    points,
		Count:     len(points),
	}

	// points
	topic := "points"

	if err := m.eventPublisher.PublishEvent(topic, event); err != nil {
		logger.Error("Failed to publish aggregation event for %s: %v", topic, err)
	} /* else {
		logger.Debug("Published aggregation event: topic=%s, count=%d", topic, len(points))
	} */
}

// isTimeBoundary 检查是否到达时间边界
func (m *Manager) isTimeBoundary(level *LevelConfig, now time.Time) bool {
	return IsTimeBoundary(now, level.Interval, m.minInterval)
}

// GetLastAggregationTime 获取指定级别的最后聚合时间
func (m *Manager) GetLastAggregationTime(level string) (time.Time, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	t, ok := m.lastAggregation[level]
	return t, ok
}

// GetConfig 获取配置
func (m *Manager) GetConfig() *Config {
	return m.config
}

// CleanupExpiredData 清理所有级别的过期数据
//
// 参数:
//   - ctx: 上下文
//   - now: 当前时间
//
// 返回:
//   - error: 错误信息
func (m *Manager) CleanupExpiredData(ctx context.Context, now time.Time) error {
	logger.Info("Starting cleanup of expired aggregation data at %s", now.Format(time.DateTime))

	var totalDeleted int
	var errors []error

	// 遍历所有级别，清理过期数据
	for _, level := range m.config.Levels {
		// 计算该级别的过期时间点
		cutoffTime := now.Add(-level.Retention)

		// 删除该级别在截止时间之前的所有数据
		err := m.tsdb.Delete(ctx,
			0,                      // 从最早的时间开始
			cutoffTime.UnixMilli(), // 到截止时间
			map[string]string{
				string(AggregatedInternalLabelAggregationLevel): level.Name,
			},
		)

		if err != nil {
			logger.Error("Failed to cleanup level %s: %v", level.Name, err)
			errors = append(errors, fmt.Errorf("level %s: %w", level.Name, err))
		} else {
			logger.Info("Cleaned level %s: deleted data before %s , (retention=%v)", level.Name, cutoffTime.Format(time.DateTime), level.Retention)
			totalDeleted++
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("cleanup completed with %d errors: %v", len(errors), errors)
	}

	logger.Info("Cleanup completed: processed %d levels", totalDeleted)
	return nil
}
