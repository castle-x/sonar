package storage

import (
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/prometheus/prometheus/model/labels"
	"github.com/prometheus/prometheus/promql"
	"github.com/prometheus/prometheus/promql/parser"
	"github.com/prometheus/prometheus/storage"
	"github.com/prometheus/prometheus/tsdb"
	"github.com/prometheus/prometheus/tsdb/chunkenc"
	"go.uber.org/zap"
)

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

	// logger
	logger *zap.SugaredLogger

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
//
// 返回:
//   - *PrometheusStorage[T]: 存储实例
//   - error: 错误信息
func NewPrometheusStorage[T any](
	config *Config,
	serializer Serializer[T],
) (*PrometheusStorage[T], error) {
	// 验证参数
	if err := ValidateConfig(config); err != nil {
		return nil, err
	}

	if serializer == nil {
		return nil, ErrSerializerNil
	}

	// 初始化 logger
	zapLogger, err := zap.NewProduction()
	if err != nil {
		return nil, fmt.Errorf("create logger failed: %w", err)
	}
	sugar := zapLogger.Sugar()

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
		db:         db,
		config:     config,
		serializer: serializer,
		stats:      &Stats{},
		dataChan:   make(chan *pendingDataPoint, config.WriteBufferSize),
		stopChan:   make(chan struct{}),
		logger:     sugar,
		closed:     false,
	}

	// 启动后台写入任务
	s.wg.Add(1)
	go s.writeWorker()

	// 启动定时压缩/清理任务（替代 TriggerManager）
	if config.CompactionInterval > 0 {
		s.wg.Add(1)
		go s.compactionWorker()
	}
	if config.MemoryCleanupInterval > 0 {
		s.wg.Add(1)
		go s.cleanupWorker()
	}

	sugar.Infow("Prometheus storage initialized",
		"dataDir", config.DataDir,
		"retentionDays", config.RetentionDays,
	)

	return s, nil
}

// ============================================
// Storage 接口实现
// ============================================

// Write 批量写入数据点
func (s *PrometheusStorage[T]) Write(ctx context.Context, points []T, labels ...string /* 全局标签列表，可选 */) error {
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
		lbls := s.serializer.ToLabels(point, labels...)
		timestamp := s.serializer.ToTimestamp(point)
		value := s.serializer.ToValue(point)

		// 验证时间戳
		if timestamp <= 0 {
			s.logger.Warnw("Invalid timestamp, skip", "timestamp", timestamp)
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
			s.logger.Warn("Write buffer full, dropping data point")
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

	s.logger.Debugw("Label query",
		"metric", req.MetricName,
		"labels", req.Labels,
		"start", formatTimestamp(startTime),
		"end", formatTimestamp(endTime),
	)

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

	s.logger.Debugw("Label query result", "count", len(result))

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

	s.logger.Debugw("PromQL query",
		"query", req.Query,
		"start", formatTimestamp(startTime),
		"end", formatTimestamp(endTime),
	)

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

	s.logger.Debugw("PromQL query result", "count", len(result))

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

	// 从 block meta 读取采样点数，O(block数)，避免全量扫描
	totalSamples := s.estimateTotalSamples()
	minTime := s.getMinTime()
	maxTime := s.getMaxTime()

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

	s.logger.Info("Closing Prometheus storage...")

	// 停止后台任务
	close(s.stopChan)
	s.wg.Wait()

	// 关闭 TSDB
	if err := s.db.Close(); err != nil {
		s.logger.Errorw("Close TSDB failed", "err", err)
		return err
	}

	s.logger.Info("Prometheus storage closed")
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
			s.logger.Errorw("Write batch failed", "err", err)
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
			s.logger.Warnw("Append failed", "labels", point.labels, "timestamp", point.timestamp, "err", err)
			continue
		}
	}

	// 提交
	if err := appender.Commit(); err != nil {
		return fmt.Errorf("commit failed: %w", err)
	}
	s.logger.Debugw("flush success", "count", len(points))
	return nil
}

// ============================================
// 内部方法 - 定时任务（替代 TriggerManager）
// ============================================

// compactionWorker 定时压缩 goroutine
func (s *PrometheusStorage[T]) compactionWorker() {
	defer s.wg.Done()
	ticker := time.NewTicker(s.config.CompactionInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			if err := s.db.Compact(context.Background()); err != nil {
				s.logger.Warnw("TSDB compaction failed", "err", err)
			} else {
				s.statsLock.Lock()
				s.stats.LastCompactionTime = time.Now().Unix()
				s.statsLock.Unlock()
			}
		case <-s.stopChan:
			return
		}
	}
}

// cleanupWorker 定时内存清理 goroutine
func (s *PrometheusStorage[T]) cleanupWorker() {
	defer s.wg.Done()
	ticker := time.NewTicker(s.config.MemoryCleanupInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			s.statsLock.Lock()
			s.stats.LastCleanupTime = time.Now().Unix()
			s.statsLock.Unlock()
		case <-s.stopChan:
			return
		}
	}
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
		s.logger.Warnw("Unknown PromQL result type", "type", fmt.Sprintf("%T", result.Value))
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

// estimateTotalSamples 从 block meta 统计采样点数，O(block数)，代价极低。
func (s *PrometheusStorage[T]) estimateTotalSamples() int64 {
	var n int64
	for _, block := range s.db.Blocks() {
		n += int64(block.Meta().Stats.NumSamples)
	}
	return n
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
// 工具方法
// ============================================

// toMilliseconds 将时间戳统一转换为毫秒
func toMilliseconds(timestamp int64) int64 {
	if timestamp == 0 {
		return 0
	}
	if timestamp < 1e11 {
		return timestamp * 1000
	}
	return timestamp
}

// normalizeQueryTime 标准化查询时间
func normalizeQueryTime(start, end int64) (int64, int64) {
	start = toMilliseconds(start)
	end = toMilliseconds(end)

	if start == 0 {
		start = time.Now().Add(-24 * time.Hour).UnixMilli()
	}
	if end == 0 {
		end = time.Now().UnixMilli()
	}

	if start > end {
		end = time.Now().UnixMilli()
		start = time.Now().Add(-24 * time.Hour).UnixMilli()
	}

	return start, end
}

// formatTimestamp 格式化时间戳
func formatTimestamp(timestamp int64) string {
	return time.UnixMilli(timestamp).Format("2006-01-02 15:04:05")
}
