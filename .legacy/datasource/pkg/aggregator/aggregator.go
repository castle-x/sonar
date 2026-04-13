package aggregator

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	v1 "datasource/apis/datasource/metrics/v1"
	storage "datasource/pkg/storage"

	"git.woa.com/castlexu/goutils/ablog"
	"git.woa.com/castlexu/goutils/recorder"
)

var logger = ablog.NewLogger("MarkAggregator")

// MarkAggregator mark聚合器，将一组mark数据聚合为metrics数据
// 定期将 RequestMetrics 转化为 MetricPoint 存储到 TSDB 中
type MarkAggregator struct {
	recorderMgr  *recorder.RecorderManager
	tsdb         storage.Storage[*v1.MetricPoint]
	tickInterval time.Duration
	ctx          context.Context
	cancel       context.CancelFunc

	// stressId 到 appId 的映射表
	stressIdToAppId map[string]string
	mappingLock     sync.RWMutex

	// 统计指标
	aggregateCount    atomic.Int64
	aggregateErrors   atomic.Int64
	lastAggregateTime atomic.Int64
	totalPoints       atomic.Int64
}

// 注意: 以下方法中的参数名 appId 对应 mark.thrift 中的 app_id 字段
// 与 metrics.thrift 中的 app_id 保持一致

// NewMarkAggregator 创建 MarkAggregator
func NewMarkAggregator(
	ctx context.Context,
	tickInterval time.Duration,
	tsdb storage.Storage[*v1.MetricPoint],
	options ...recorder.Option,
) *MarkAggregator {
	recorderMgr := recorder.NewRecorderManager(ctx, options...)

	// 创建可取消的 context
	runCtx, cancel := context.WithCancel(ctx)

	markAggregator := &MarkAggregator{
		recorderMgr:     recorderMgr,
		tsdb:            tsdb,
		tickInterval:    tickInterval,
		ctx:             runCtx,
		cancel:          cancel,
		stressIdToAppId: make(map[string]string),
	}

	go markAggregator.run(runCtx)
	return markAggregator
}

// run 定时器，每N秒执行一次Aggregator
func (a *MarkAggregator) run(ctx context.Context) {
	defer func() {
		if r := recover(); r != nil {
			logger.Error("MarkAggregator panic recovered: %v", r)
		}
	}()

	ticker := time.NewTicker(a.tickInterval)
	defer ticker.Stop()

	logger.Info("MarkAggregator started with interval: %v", a.tickInterval)

	for {
		select {
		case <-ctx.Done():
			logger.Info("MarkAggregator stopped by context")
			return

		case <-ticker.C:
			start := time.Now()
			if err := a.aggregatorMetrics(ctx); err != nil {
				a.aggregateErrors.Add(1)
				logger.Error("Aggregate metrics failed (took %v): %v", time.Since(start), err)
			} else {
				a.aggregateCount.Add(1)
				a.lastAggregateTime.Store(time.Now().Unix())
				logger.Info("Aggregate metrics success (took %v, total runs=%d)", time.Since(start), a.aggregateCount.Load())
			}
		}
	}
}

// aggregatorMetrics 聚合指标并写入TSDB
func (a *MarkAggregator) aggregatorMetrics(ctx context.Context) error {
	// 通过 recorderMgr 获取所有 metrics 数据（key 是 stressId）
	allMetrics, err := a.ListMetrics()
	if err != nil {
		return fmt.Errorf("list metrics failed: %w", err)
	}

	if len(allMetrics) == 0 {
		logger.Info("No metrics to aggregate (no data in recorder)")
		return nil
	}

	// 清理过期的映射关系
	a.cleanExpiredMappings()

	logger.Info("Starting aggregation: found %d stress IDs", len(allMetrics))

	// 预估容量：每个 stressId 可能有多个请求，每个请求有 11 个指标
	estimatedSize := len(allMetrics) * 10 * 11
	metricPoints := make([]*v1.MetricPoint, 0, estimatedSize)

	// 使用毫秒级时间戳
	timestamp := time.Now().UnixMilli()

	// 遍历所有 stressId 的指标
	for stressId, stressMetrics := range allMetrics {
		// 查找对应的 appId
		appId := a.getAppIdByStressId(stressId)
		if appId == "" {
			logger.Warn("No appId found for stressId=%s, skipping", stressId)
			continue
		}

		logger.Info("Processing stress_id=%s, app_id=%s with %d requests", stressId, appId, len(stressMetrics))
		for requestName, m := range stressMetrics {
			// 将 RequestMetrics 结构体的每个字段转换为独立的 MetricPoint
			points := a.convertRequestMetricsToPoints(appId, stressId, requestName, m, timestamp)
			logger.Debug("  - request_name=%s: converted %d metric points (total_num=%d)",
				requestName, len(points), m.TotalNum)
			metricPoints = append(metricPoints, points...)
		}
	}

	if len(metricPoints) == 0 {
		logger.Info("No valid metric points to write (data conversion issue?)")
		return nil
	}

	// 写入 TSDB
	if err := a.tsdb.Write(ctx, metricPoints); err != nil {
		return fmt.Errorf("write to tsdb failed: %w", err)
	}

	a.totalPoints.Add(int64(len(metricPoints)))
	logger.Info("Aggregated %d metric points from %d stress IDs",
		len(metricPoints), len(allMetrics))
	return nil
}

// convertRequestMetricsToPoints 将 RequestMetrics 结构体转换为 MetricPoint 列表
//
// 每个 RequestMetrics 字段都会转换为一个独立的 MetricPoint：
// - total_num: 总请求数
// - failed_num: 失败请求数
// - rtt_avg_ms: 平均响应时间
// - rtt_max_ms: 最大响应时间
// - rtt_min_ms: 最小响应时间
// - rtt_p50_ms: P50 响应时间
// - rtt_p70_ms: P70 响应时间
// - rtt_p90_ms: P90 响应时间
// - rtt_p99_ms: P99 响应时间
// - qps_avg: 平均 QPS（float64，保留小数精度）
// - success_rate: 成功率（float64，保留小数精度）
func (a *MarkAggregator) convertRequestMetricsToPoints(
	appId, stressId, requestName string,
	m recorder.RequestMetrics,
	timestamp int64,
) []*v1.MetricPoint {
	// 基础标签：同时包含 app_id 和 stress_id
	labels := map[string]string{
		"app_id":       appId,
		"stress_id":    stressId,
		"request_name": requestName,
	}

	points := make([]*v1.MetricPoint, 0, 11)

	// 辅助函数：创建 MetricPoint（统一使用 float64）
	addMetric := func(name string, value float64) {
		metricName := name
		points = append(points, &v1.MetricPoint{
			Name:      &metricName,
			Labels:    labels,
			Timestamp: timestamp,
			Value:     value,
		})
	}

	// 转换所有字段（uint64 类型自动转换为 float64）
	addMetric("total_num", float64(m.TotalNum))
	addMetric("failed_num", float64(m.FailedNum))
	addMetric("rtt_avg_ms", float64(m.RttAvgMs))
	addMetric("rtt_max_ms", float64(m.RttMaxMs))
	addMetric("rtt_min_ms", float64(m.RttMinMs))
	addMetric("rtt_p50_ms", float64(m.RttP50Ms))
	addMetric("rtt_p70_ms", float64(m.RttP70Ms))
	addMetric("rtt_p90_ms", float64(m.RttP90Ms))
	addMetric("rtt_p99_ms", float64(m.RttP99Ms))
	addMetric("qps_avg", m.QpsAvg)           // QpsAvg 已经是 float64，直接使用
	addMetric("success_rate", m.SuccessRate) // SuccessRate 已经是 float64，直接使用

	return points
}

// Mark 记录请求标记
// stressId: 压测ID，作为 recorder 的 key
// appId: 应用ID，用于 metrics 标签
func (a *MarkAggregator) Mark(stressId, appId string, requestTimeMeta recorder.RequestTimeMeta) error {
	if a.recorderMgr == nil {
		return fmt.Errorf("recorderMgr is nil")
	}

	// 优化：先用读锁检查映射是否已存在且未过期
	needUpdate := false
	a.mappingLock.RLock()
	existingAppId, exists := a.stressIdToAppId[stressId]
	a.mappingLock.RUnlock()

	if !exists || existingAppId != appId || a.recorderMgr.IsStressIdExpired(stressId) {
		needUpdate = true
	}

	// 只在需要时才获取写锁
	if needUpdate {
		a.mappingLock.Lock()
		a.stressIdToAppId[stressId] = appId
		a.mappingLock.Unlock()
	}

	return a.recorderMgr.Mark(stressId, requestTimeMeta)
}

// SetMarkExpired 设置标记过期（基于 stressId）
func (a *MarkAggregator) SetMarkExpired(stressId string) {
	if a.recorderMgr != nil {
		a.recorderMgr.SetMarkExpired(stressId)
	}
}

// GetMetricsByStressId 获取指定 stressId 的指标
func (a *MarkAggregator) GetMetricsByStressId(stressId string) (map[string]recorder.RequestMetrics, error) {
	if a.recorderMgr == nil {
		return nil, fmt.Errorf("recorderMgr is nil")
	}
	if !a.recorderMgr.IsStressIdAlive(stressId) {
		return nil, fmt.Errorf("stressId %s is not alive", stressId)
	}
	return a.recorderMgr.GetRequestMetrics(stressId)
}

// GetMetricsByAppId 获取指定 appId 下所有 stressId 的指标
func (a *MarkAggregator) GetMetricsByAppId(appId string) (map[string]map[string]recorder.RequestMetrics, error) {
	if a.recorderMgr == nil {
		return nil, fmt.Errorf("recorderMgr is nil")
	}

	result := make(map[string]map[string]recorder.RequestMetrics)

	a.mappingLock.RLock()
	defer a.mappingLock.RUnlock()

	for stressId, mappedAppId := range a.stressIdToAppId {
		if mappedAppId != appId {
			continue
		}
		if !a.recorderMgr.IsStressIdAlive(stressId) {
			continue
		}
		metrics, err := a.recorderMgr.GetRequestMetrics(stressId)
		if err != nil {
			continue
		}
		result[stressId] = metrics
	}

	return result, nil
}

// ListMetrics 列出所有指标（key 是 stressId）
func (a *MarkAggregator) ListMetrics() (map[string]map[string]recorder.RequestMetrics, error) {
	if a.recorderMgr == nil {
		return nil, fmt.Errorf("recorderMgr is nil")
	}
	return a.recorderMgr.GetAllMetrics(), nil
}

// ListMetricsWithAppId 列出所有指标，返回格式包含 appId 信息
// 返回格式: map[appId]map[stressId]map[requestName]RequestMetrics
func (a *MarkAggregator) ListMetricsWithAppId() (map[string]map[string]map[string]recorder.RequestMetrics, error) {
	if a.recorderMgr == nil {
		return nil, fmt.Errorf("recorderMgr is nil")
	}

	allMetrics := a.recorderMgr.GetAllMetrics()
	result := make(map[string]map[string]map[string]recorder.RequestMetrics)

	a.mappingLock.RLock()
	defer a.mappingLock.RUnlock()

	for stressId, stressMetrics := range allMetrics {
		appId := a.stressIdToAppId[stressId]
		if appId == "" {
			appId = "unknown"
		}

		if result[appId] == nil {
			result[appId] = make(map[string]map[string]recorder.RequestMetrics)
		}
		result[appId][stressId] = stressMetrics
	}

	return result, nil
}

// IsStressIdAlive 检查 stressId 是否存活
func (a *MarkAggregator) IsStressIdAlive(stressId string) bool {
	if a.recorderMgr == nil {
		return false
	}
	return a.recorderMgr.IsStressIdAlive(stressId)
}

// IsStressIdExpired 检查 stressId 是否已过期
func (a *MarkAggregator) IsStressIdExpired(stressId string) bool {
	if a.recorderMgr == nil {
		return false
	}
	return a.recorderMgr.IsStressIdExpired(stressId)
}

// GetAppIdByStressId 根据 stressId 获取对应的 appId（公开方法）
func (a *MarkAggregator) GetAppIdByStressId(stressId string) string {
	return a.getAppIdByStressId(stressId)
}

// GetStats 获取聚合器统计信息
func (a *MarkAggregator) GetStats() map[string]interface{} {
	a.mappingLock.RLock()
	mappingCount := len(a.stressIdToAppId)
	a.mappingLock.RUnlock()

	return map[string]interface{}{
		"aggregate_count":     a.aggregateCount.Load(),
		"aggregate_errors":    a.aggregateErrors.Load(),
		"last_aggregate_time": a.lastAggregateTime.Load(),
		"total_points":        a.totalPoints.Load(),
		"tick_interval":       a.tickInterval.String(),
		"mapping_count":       mappingCount,
	}
}

// getAppIdByStressId 根据 stressId 获取对应的 appId
func (a *MarkAggregator) getAppIdByStressId(stressId string) string {
	a.mappingLock.RLock()
	defer a.mappingLock.RUnlock()
	return a.stressIdToAppId[stressId]
}

// cleanExpiredMappings 清理过期的 stressId -> appId 映射
func (a *MarkAggregator) cleanExpiredMappings() {
	a.mappingLock.Lock()
	defer a.mappingLock.Unlock()

	expiredCount := 0
	for stressId := range a.stressIdToAppId {
		if a.recorderMgr.IsStressIdExpired(stressId) {
			delete(a.stressIdToAppId, stressId)
			expiredCount++
		}
	}

	if expiredCount > 0 {
		logger.Info("Cleaned %d expired stressId mappings", expiredCount)
	}
}

// Close 优雅关闭聚合器
func (a *MarkAggregator) Close() error {
	logger.Info("Closing MarkAggregator...")

	if a.cancel != nil {
		a.cancel()
	}

	// 最后执行一次聚合，确保数据不丢失
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := a.aggregatorMetrics(ctx); err != nil {
		logger.Warn("Final aggregation failed: %v", err)
	}

	logger.Info("MarkAggregator closed (total aggregations: %d, errors: %d, points: %d)",
		a.aggregateCount.Load(), a.aggregateErrors.Load(), a.totalPoints.Load())
	return nil
}
