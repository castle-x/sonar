package storage

import (
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sync"
	"time"

	"monitor_hub/internal/trigger"

	"git.woa.com/castlexu/goutils/ablog"
	"github.com/prometheus/prometheus/model/labels"
	"github.com/prometheus/prometheus/promql"
	"github.com/prometheus/prometheus/promql/parser"
	"github.com/prometheus/prometheus/storage"
	"github.com/prometheus/prometheus/tsdb"
	"github.com/prometheus/prometheus/tsdb/chunkenc"
)

var logger *ablog.Logger

func init() {
	logger_level := ablog.DebugLevel
	if v, ok := ablog.String2level[os.Getenv("ABLOG_LEVEL")]; ok {
		logger_level = v
	}
	logger = ablog.NewLogger("storage", ablog.WithLevel(logger_level))
}

// ============================================
// Prometheus TSDB 存储实现（泛型版本）
// ============================================

// PrometheusStorage 基于 Prometheus TSDB 的存储实现
//
// T: 数据点类型（由外部定义）
//
// 🎯 设计理念：
// - 零业务依赖：通过 Serializer 接口解耦具体数据结构
// - 高性能：直接依赖 Prometheus TSDB 的高效索引和压缩
// - 完整查询：内置标签查询和 PromQL 查询支持
//
// 🚀 性能特点：
// - Series 查找：TSDB 内部使用哈希表 O(1) 查找
// - 标签去重：TSDB 内部 Symbol Table 自动去重
// - 内存效率：TSDB 统一管理内存使用
type PrometheusStorage[T any] struct {
	// TSDB 实例
	db *tsdb.DB

	// 配置
	config *Config

	// 序列化器（由外部提供）
	serializer Serializer[T]

	// 统计信息
	stats     *Stats
	statsLock sync.RWMutex

	// 数据管道
	dataChan chan *pendingDataPoint
	stopChan chan struct{}
	wg       sync.WaitGroup

	// 触发器管理器
	triggerManager *trigger.TriggerManager

	// 是否已关闭
	closed bool
	mu     sync.RWMutex
}

// pendingDataPoint 待存储的数据点（内部使用）
type pendingDataPoint struct {
	labels    labels.Labels
	timestamp int64
	value     float64
}

// ============================================
// 构造函数
// ============================================

// NewPrometheusStorage 创建新的 Prometheus 存储实例
//
// 参数:
//   - config: 存储配置
//   - serializer: 数据序列化器
//   - triggerManager: 触发器管理器（用于定时清理和压缩）
//
// 返回:
//   - *PrometheusStorage[T]: 存储实例
//   - error: 错误信息
func NewPrometheusStorage[T any](
	config *Config,
	serializer Serializer[T],
	triggerManager *trigger.TriggerManager,
) (*PrometheusStorage[T], error) {
	// 验证参数
	if err := ValidateConfig(config); err != nil {
		return nil, err
	}

	if serializer == nil {
		return nil, ErrSerializerNil
	}
	execPath, _ := os.Executable()
	rootDir := filepath.Dir(execPath)
	dataDir := filepath.Join(rootDir, config.DataDir)
	// 确保数据目录存在
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("create data dir failed: %w", err)
	}

	// 创建 TSDB
	retentionDuration := time.Duration(config.RetentionDays) * 24 * time.Hour
	db, err := tsdb.Open(
		dataDir,
		nil, // logger (使用 nil，TSDB 会使用默认日志或不输出)
		nil, // registry
		&tsdb.Options{
			RetentionDuration:              int64(retentionDuration / time.Millisecond),
			MinBlockDuration:               int64(config.MixBlockDuration / time.Millisecond),
			MaxBlockDuration:               int64(config.MaxBlockDuration / time.Millisecond),
			NoLockfile:                     false,
			StripeSize:                     config.WriteBufferSize,
			HeadChunksWriteBufferSize:      1024 * 1024, // 1MB
			MaxExemplars:                   0,
			EnableExemplarStorage:          false,
			EnableMemorySnapshotOnShutdown: true,
		},
		nil, // stats
	)
	if err != nil {
		return nil, fmt.Errorf("open TSDB failed: %w", err)
	}

	s := &PrometheusStorage[T]{
		db:             db,
		config:         config,
		serializer:     serializer,
		stats:          &Stats{},
		dataChan:       make(chan *pendingDataPoint, config.WriteBufferSize),
		stopChan:       make(chan struct{}),
		triggerManager: triggerManager,
		closed:         false,
	}

	// 启动后台写入任务
	s.wg.Add(1)
	go s.writeWorker()

	// 注册定时任务
	if triggerManager != nil {
		s.registerTriggers()
	}

	logger.Info("Prometheus storage initialized: dataDir=%s, retention=%d days",
		config.DataDir, config.RetentionDays)

	return s, nil
}

// ============================================
// Storage 接口实现
// ============================================

// Write 批量写入数据点
func (s *PrometheusStorage[T]) Write(ctx context.Context, points []T) error {
	s.mu.RLock()
	if s.closed {
		s.mu.RUnlock()
		return ErrStorageClosed
	}
	s.mu.RUnlock()

	if len(points) == 0 {
		return ErrEmptyPoints
	}

	for _, point := range points {
		// 使用序列化器转换数据
		lbls := s.serializer.ToLabels(point)
		timestamp := s.serializer.ToTimestamp(point)
		value := s.serializer.ToValue(point)

		// 验证时间戳
		if timestamp <= 0 {
			logger.Warn("Invalid timestamp: %d, skip", timestamp)
			continue
		}

		// 发送到写入队列
		select {
		case s.dataChan <- &pendingDataPoint{
			labels:    lbls,
			timestamp: timestamp,
			value:     value,
		}:
		case <-ctx.Done():
			return ctx.Err()
		default:
			// 队列满时丢弃（避免阻塞）
			logger.Warn("Write buffer full, dropping data point")
		}
	}

	return nil
}

// QueryByLabels 通过标签查询数据
func (s *PrometheusStorage[T]) QueryByLabels(ctx context.Context, req *LabelQuery) ([]T, error) {
	s.mu.RLock()
	if s.closed {
		s.mu.RUnlock()
		return nil, ErrStorageClosed
	}
	s.mu.RUnlock()

	// 标准化查询时间
	startTime, endTime := normalizeQueryTime(req.StartTime, req.EndTime)

	/* logger.Debug("Label query: metric=%s, labels=%v, time=%s ~ %s",
		req.MetricName, req.Labels, formatTimestamp(startTime), formatTimestamp(endTime)) */

	// 构建标签匹配器
	matchers := s.buildMatchers(req.MetricName, req.Labels)

	// 创建查询器
	querier, err := s.db.Querier(startTime, endTime)
	if err != nil {
		return nil, fmt.Errorf("create querier failed: %w", err)
	}
	defer querier.Close()

	// 查询提示
	hints := &storage.SelectHints{
		Start: startTime,
		End:   endTime,
	}

	seriesSet := querier.Select(ctx, false, hints, matchers...)

	var result []T

	for seriesSet.Next() {
		series := seriesSet.At()
		it := series.Iterator(nil)

		for it.Next() != chunkenc.ValNone {
			t, v := it.At()

			// 创建 DataPoint（内部使用）
			dp := &DataPoint{
				MetricName: series.Labels().Get("__name__"),
				Labels:     series.Labels(),
				Timestamp:  t,
				Value:      v,
			}

			// ✅ 在 Storage 内部调用反序列化
			point := s.serializer.FromDataPoint(dp)
			result = append(result, point)

			// 检查限制
			if req.Limit > 0 && len(result) >= req.Limit {
				break
			}
		}

		if err := it.Err(); err != nil {
			return nil, fmt.Errorf("iterator error: %w", err)
		}

		if req.Limit > 0 && len(result) >= req.Limit {
			break
		}
	}

	if err := seriesSet.Err(); err != nil {
		return nil, fmt.Errorf("series set error: %w", err)
	}

	// logger.Debug("Label query returned %d points", len(result))

	return result, nil
}

// QueryByPromQL 通过 PromQL 查询数据
func (s *PrometheusStorage[T]) QueryByPromQL(ctx context.Context, req *PromQLQuery) ([]T, error) {
	s.mu.RLock()
	if s.closed {
		s.mu.RUnlock()
		return nil, ErrStorageClosed
	}
	s.mu.RUnlock()

	// 解析 PromQL
	_, err := parser.ParseExpr(req.Query)
	if err != nil {
		return nil, fmt.Errorf("parse PromQL failed: %w", err)
	}

	// 标准化查询时间
	startTime, endTime := normalizeQueryTime(req.StartTime, req.EndTime)

	logger.Debug("PromQL query: %s, time=%s ~ %s",
		req.Query, formatTimestamp(startTime), formatTimestamp(endTime))

	// 创建查询引擎
	engine := promql.NewEngine(promql.EngineOpts{
		MaxSamples: 50000000,
		Timeout:    5 * time.Minute,
	})

	// 转换时间戳为 time.Time
	start := time.UnixMilli(startTime)
	end := time.UnixMilli(endTime)

	// 确定步长
	step := req.Step
	if step == 0 {
		step = time.Second // 默认 1 秒步长
	}

	// 执行范围查询
	q, err := engine.NewRangeQuery(ctx, s.db, nil, req.Query, start, end, step)
	if err != nil {
		return nil, fmt.Errorf("create query failed: %w", err)
	}

	promResult := q.Exec(ctx)
	if promResult.Err != nil {
		return nil, fmt.Errorf("query execution failed: %w", promResult.Err)
	}

	// 转换结果
	dataPoints := s.convertPromQLResult(promResult)

	// ✅ 在 Storage 内部调用反序列化
	result := make([]T, 0, len(dataPoints))
	for _, dp := range dataPoints {
		point := s.serializer.FromDataPoint(dp)
		result = append(result, point)
	}

	logger.Debug("PromQL query returned %d points", len(result))

	return result, nil
}

// GetStats 获取存储统计信息
func (s *PrometheusStorage[T]) GetStats(ctx context.Context) (*Stats, error) {
	s.mu.RLock()
	if s.closed {
		s.mu.RUnlock()
		return nil, ErrStorageClosed
	}
	s.mu.RUnlock()

	s.statsLock.RLock()
	defer s.statsLock.RUnlock()

	// 更新实时统计
	dbStats := s.db.Head().Stats("__name__", 1000)
	diskSize, _ := s.calculateDiskSize()

	// 计算总采样点数
	minTime := s.getMinTime()
	maxTime := s.getMaxTime()
	totalSamples, _ := s.getTotalSamples(minTime, maxTime)

	stats := &Stats{
		TotalSeries:        int64(dbStats.NumSeries),
		TotalSamples:       totalSamples,
		DiskSize:           diskSize,
		MinTime:            minTime,
		MaxTime:            maxTime,
		LastCompactionTime: s.stats.LastCompactionTime,
		LastCleanupTime:    s.stats.LastCleanupTime,
		TotalBlocks:        int64(len(s.db.Blocks())),
	}

	return stats, nil
}

// Delete 删除指定时间范围和标签的数据
func (s *PrometheusStorage[T]) Delete(ctx context.Context, startTime, endTime int64, labelFilters map[string]string) error {
	s.mu.RLock()
	if s.closed {
		s.mu.RUnlock()
		return ErrStorageClosed
	}
	s.mu.RUnlock()

	// 构建标签匹配器
	matchers := make([]*labels.Matcher, 0, len(labelFilters))
	for k, v := range labelFilters {
		matchers = append(matchers, labels.MustNewMatcher(labels.MatchEqual, k, v))
	}

	// 如果没有任何匹配器，拒绝删除（避免误删全部数据）
	if len(matchers) == 0 {
		return fmt.Errorf("delete requires at least one label filter")
	}

	// 执行删除
	if err := s.db.Delete(ctx, startTime, endTime, matchers...); err != nil {
		return fmt.Errorf("delete failed: %w", err)
	}
	return nil
}

// Close 关闭存储
func (s *PrometheusStorage[T]) Close() error {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return nil
	}
	s.closed = true
	s.mu.Unlock()

	logger.Info("Closing Prometheus storage...")

	// 停止后台任务
	close(s.stopChan)
	s.wg.Wait()

	// 关闭 TSDB
	if err := s.db.Close(); err != nil {
		logger.Error("Close TSDB failed: %v", err)
		return err
	}

	logger.Info("Prometheus storage closed")
	return nil
}

// ============================================
// 内部方法 - 数据写入
// ============================================

// writeWorker 后台写入任务
func (s *PrometheusStorage[T]) writeWorker() {
	defer s.wg.Done()

	batch := make([]*pendingDataPoint, 0, 100)
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	flush := func() {
		if len(batch) == 0 {
			return
		}

		if err := s.writeBatch(batch); err != nil {
			logger.Error("Write batch failed: %v", err)
		}

		batch = batch[:0]
	}

	for {
		select {
		case <-s.stopChan:
			flush()
			return

		case point := <-s.dataChan:
			batch = append(batch, point)
			if len(batch) >= 100 {
				flush()
			}

		case <-ticker.C:
			flush()
		}
	}
}

// writeBatch 批量写入数据
func (s *PrometheusStorage[T]) writeBatch(points []*pendingDataPoint) error {
	if len(points) == 0 {
		return nil
	}

	appender := s.db.Appender(context.Background())

	for _, point := range points {
		_, err := appender.Append(0, point.labels, point.timestamp, point.value)
		if err != nil {
			logger.Warn("Append failed for series %v at %d: %v", point.labels, point.timestamp, err)
			continue
		}
	}

	// 提交
	if err := appender.Commit(); err != nil {
		return fmt.Errorf("commit failed: %w", err)
	}

	return nil
}

// ============================================
// 内部方法 - 查询辅助
// ============================================

// buildMatchers 构建标签匹配器
func (s *PrometheusStorage[T]) buildMatchers(metricName string, labelFilters Labels) []*labels.Matcher {
	var matchers []*labels.Matcher

	// 添加指标名称过滤
	if metricName != "" {
		matchers = append(matchers, labels.MustNewMatcher(labels.MatchEqual, "__name__", metricName))
	}

	// 添加标签过滤
	for _, label := range labelFilters {
		matchers = append(matchers, labels.MustNewMatcher(labels.MatchEqual, label.Name, label.Value))
	}

	// 如果没有任何匹配器，添加通配符
	if len(matchers) == 0 {
		matchers = append(matchers, labels.MustNewMatcher(labels.MatchRegexp, "__name__", ".*"))
	}

	return matchers
}

// convertPromQLResult 转换 PromQL 查询结果
func (s *PrometheusStorage[T]) convertPromQLResult(result *promql.Result) []*DataPoint {
	var points []*DataPoint

	switch v := result.Value.(type) {
	case promql.Vector:
		for _, sample := range v {
			point := &DataPoint{
				MetricName: sample.Metric.Get("__name__"),
				Labels:     sample.Metric,
				Timestamp:  sample.T,
				Value:      sample.F,
			}
			points = append(points, point)
		}

	case promql.Matrix:
		for _, series := range v {
			for _, point := range series.Floats {
				resultPoint := &DataPoint{
					MetricName: series.Metric.Get("__name__"),
					Labels:     series.Metric,
					Timestamp:  point.T,
					Value:      point.F,
				}
				points = append(points, resultPoint)
			}
		}

	default:
		logger.Warn("Unknown PromQL result type: %T", result.Value)
	}

	return points
}

// ============================================
// 内部方法 - 统计
// ============================================

// getMinTime 获取最小时间戳
func (s *PrometheusStorage[T]) getMinTime() int64 {
	minTime := s.db.Head().MinTime()
	for _, block := range s.db.Blocks() {
		if block.MinTime() < minTime {
			minTime = block.MinTime()
		}
	}
	// 如果数据库为空，返回 0 而不是 math.MaxInt64
	if minTime == math.MaxInt64 {
		return 0
	}
	return minTime
}

// getMaxTime 获取最大时间戳
func (s *PrometheusStorage[T]) getMaxTime() int64 {
	maxTime := s.db.Head().MaxTime()
	for _, block := range s.db.Blocks() {
		if block.MaxTime() > maxTime {
			maxTime = block.MaxTime()
		}
	}
	// 如果数据库为空，返回 0 而不是 math.MinInt64
	if maxTime == math.MinInt64 {
		return 0
	}
	return maxTime
}

// getTotalSamples 获取总采样点数
func (s *PrometheusStorage[T]) getTotalSamples(startMS, endMS int64) (int64, error) {
	q, err := s.db.Querier(startMS, endMS)
	if err != nil {
		return 0, err
	}
	defer q.Close()

	hints := &storage.SelectHints{Start: startMS, End: endMS}
	m := []*labels.Matcher{labels.MustNewMatcher(labels.MatchRegexp, "__name__", ".*")}
	ss := q.Select(context.Background(), false, hints, m...)

	var n int64
	for ss.Next() {
		it := ss.At().Iterator(nil)
		for it.Next() != chunkenc.ValNone {
			n++
		}
		if err := it.Err(); err != nil {
			return 0, err
		}
	}
	if err := ss.Err(); err != nil {
		return 0, err
	}

	return n, nil
}

// calculateDiskSize 计算磁盘占用
func (s *PrometheusStorage[T]) calculateDiskSize() (int64, error) {
	var size int64
	err := filepath.Walk(s.config.DataDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() {
			size += info.Size()
		}
		return nil
	})
	return size, err
}

// ============================================
// 内部方法 - 触发器
// ============================================

// registerTriggers 注册定时任务
func (s *PrometheusStorage[T]) registerTriggers() {
	// 注册压缩触发器
	compactionTrigger := &compactionTrigger[T]{
		storage:  s,
		interval: s.config.CompactionInterval,
	}
	s.triggerManager.Register(compactionTrigger)

	// 注册清理触发器
	cleanupTrigger := &cleanupTrigger[T]{
		storage:  s,
		interval: s.config.MemoryCleanupInterval,
	}
	s.triggerManager.Register(cleanupTrigger)

	logger.Info("Storage triggers registered: compaction=%v, cleanup=%v",
		s.config.CompactionInterval, s.config.MemoryCleanupInterval)
}

// ============================================
// 工具方法
// ============================================

// normalizeQueryTime 标准化查询时间
func normalizeQueryTime(start, end int64) (int64, int64) {
	if start == 0 {
		start = time.Now().Add(-24 * time.Hour).UnixMilli()
	}
	if end == 0 {
		end = time.Now().UnixMilli()
	}
	return start, end
}

// formatTimestamp 格式化时间戳
func formatTimestamp(timestamp int64) string {
	return time.UnixMilli(timestamp).Format("2006-01-02 15:04:05")
}

// ============================================
// 触发器实现
// ============================================

// compactionTrigger 压缩触发器
type compactionTrigger[T any] struct {
	storage  *PrometheusStorage[T]
	interval time.Duration
}

func (t *compactionTrigger[T]) Name() string {
	return "storage-compaction"
}

func (t *compactionTrigger[T]) Type() trigger.TriggerType {
	return trigger.TriggerTypeInterval
}

func (t *compactionTrigger[T]) Interval() time.Duration {
	return t.interval
}

func (t *compactionTrigger[T]) Execute(ctx context.Context) error {
	logger.Info("Starting TSDB compaction...")

	start := time.Now()
	err := t.storage.db.Compact(ctx)
	duration := time.Since(start)

	if err != nil {
		logger.Error("TSDB compaction failed (took %v): %v", duration, err)
		return err
	}

	t.storage.statsLock.Lock()
	t.storage.stats.LastCompactionTime = time.Now().Unix()
	t.storage.statsLock.Unlock()

	logger.Info("TSDB compaction completed (took %v)", duration)
	return nil
}

// cleanupTrigger 清理触发器
type cleanupTrigger[T any] struct {
	storage  *PrometheusStorage[T]
	interval time.Duration
}

func (t *cleanupTrigger[T]) Name() string {
	return "storage-cleanup"
}

func (t *cleanupTrigger[T]) Type() trigger.TriggerType {
	return trigger.TriggerTypeInterval
}

func (t *cleanupTrigger[T]) Interval() time.Duration {
	return t.interval
}

func (t *cleanupTrigger[T]) Execute(ctx context.Context) error {
	logger.Info("Starting storage cleanup...")

	// 清理 Series 缓存
	// 这里可以添加更复杂的 LRU 清理逻辑

	t.storage.statsLock.Lock()
	t.storage.stats.LastCleanupTime = time.Now().Unix()
	t.storage.statsLock.Unlock()

	logger.Info("Storage cleanup completed")
	return nil
}
