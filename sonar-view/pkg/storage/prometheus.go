package storage

import (
	"context"
	"fmt"
	"github.com/castle-x/goutils/ablog"
	"math"
	"os"
	"path/filepath"
	"sync"
	"time"

	"sonar-view/pkg/trigger"

	"github.com/prometheus/prometheus/model/labels"
	"github.com/prometheus/prometheus/promql"
	"github.com/prometheus/prometheus/promql/parser"
	promstorage "github.com/prometheus/prometheus/storage"
	"github.com/prometheus/prometheus/tsdb"
	"github.com/prometheus/prometheus/tsdb/chunkenc"
)

var logger = ablog.NewLogger("storage")

type PrometheusStorage[T any] struct {
	db             *tsdb.DB
	config         *Config
	serializer     Serializer[T]
	stats          *Stats
	statsLock      sync.RWMutex
	dataChan       chan *pendingDataPoint
	stopChan       chan struct{}
	wg             sync.WaitGroup
	triggerManager *trigger.TriggerManager
	closed         bool
	mu             sync.RWMutex
}

type pendingDataPoint struct {
	labels    labels.Labels
	timestamp int64
	value     float64
}

func NewPrometheusStorage[T any](
	config *Config,
	serializer Serializer[T],
	triggerManager *trigger.TriggerManager,
) (*PrometheusStorage[T], error) {
	if err := ValidateConfig(config); err != nil {
		return nil, err
	}
	if serializer == nil {
		return nil, ErrSerializerNil
	}
	execPath, _ := os.Executable()
	rootDir := filepath.Dir(execPath)
	dataDir := filepath.Join(rootDir, config.DataDir)
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("create data dir failed: %w", err)
	}
	retentionDuration := time.Duration(config.RetentionDays) * 24 * time.Hour
	db, err := tsdb.Open(
		dataDir,
		nil,
		nil,
		&tsdb.Options{
			RetentionDuration:              int64(retentionDuration / time.Millisecond),
			MinBlockDuration:               int64(config.MixBlockDuration / time.Millisecond),
			MaxBlockDuration:               int64(config.MaxBlockDuration / time.Millisecond),
			NoLockfile:                     false,
			StripeSize:                     config.WriteBufferSize,
			HeadChunksWriteBufferSize:      1024 * 1024,
			MaxExemplars:                   0,
			EnableExemplarStorage:          false,
			EnableMemorySnapshotOnShutdown: true,
		},
		nil,
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
	s.wg.Add(1)
	go s.writeWorker()
	if triggerManager != nil {
		s.registerTriggers()
	}
	logger.Info("storage: Prometheus storage initialized: dataDir=%s, retention=%d days", config.DataDir, config.RetentionDays)
	return s, nil
}

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
		lbls := s.serializer.ToLabels(point)
		timestamp := s.serializer.ToTimestamp(point)
		value := s.serializer.ToValue(point)
		if timestamp <= 0 {
			continue
		}
		select {
		case s.dataChan <- &pendingDataPoint{labels: lbls, timestamp: timestamp, value: value}:
		case <-ctx.Done():
			return ctx.Err()
		default:
			logger.Warn("storage: write buffer full, dropping data point")
		}
	}
	return nil
}

func (s *PrometheusStorage[T]) QueryByLabels(ctx context.Context, req *LabelQuery) ([]T, error) {
	s.mu.RLock()
	if s.closed {
		s.mu.RUnlock()
		return nil, ErrStorageClosed
	}
	s.mu.RUnlock()
	startTime, endTime := normalizeQueryTime(req.StartTime, req.EndTime)
	matchers := s.buildMatchers(req.MetricName, req.Labels)
	querier, err := s.db.Querier(startTime, endTime)
	if err != nil {
		return nil, fmt.Errorf("create querier failed: %w", err)
	}
	defer querier.Close()
	hints := &promstorage.SelectHints{Start: startTime, End: endTime}
	seriesSet := querier.Select(ctx, false, hints, matchers...)
	var result []T
	for seriesSet.Next() {
		series := seriesSet.At()
		it := series.Iterator(nil)
		for it.Next() != chunkenc.ValNone {
			t, v := it.At()
			dp := &DataPoint{
				MetricName: series.Labels().Get("__name__"),
				Labels:     series.Labels(),
				Timestamp:  t,
				Value:      v,
			}
			point := s.serializer.FromDataPoint(dp)
			result = append(result, point)
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
	return result, nil
}

func (s *PrometheusStorage[T]) QueryByPromQL(ctx context.Context, req *PromQLQuery) ([]T, error) {
	s.mu.RLock()
	if s.closed {
		s.mu.RUnlock()
		return nil, ErrStorageClosed
	}
	s.mu.RUnlock()
	_, err := parser.ParseExpr(req.Query)
	if err != nil {
		return nil, fmt.Errorf("parse PromQL failed: %w", err)
	}
	startTime, endTime := normalizeQueryTime(req.StartTime, req.EndTime)
	engine := promql.NewEngine(promql.EngineOpts{
		MaxSamples: 50000000,
		Timeout:    5 * time.Minute,
	})
	start := time.UnixMilli(startTime)
	end := time.UnixMilli(endTime)
	step := req.Step
	if step == 0 {
		step = time.Second
	}
	q, err := engine.NewRangeQuery(ctx, s.db, nil, req.Query, start, end, step)
	if err != nil {
		return nil, fmt.Errorf("create query failed: %w", err)
	}
	promResult := q.Exec(ctx)
	if promResult.Err != nil {
		return nil, fmt.Errorf("query execution failed: %w", promResult.Err)
	}
	dataPoints := s.convertPromQLResult(promResult)
	result := make([]T, 0, len(dataPoints))
	for _, dp := range dataPoints {
		point := s.serializer.FromDataPoint(dp)
		result = append(result, point)
	}
	return result, nil
}

func (s *PrometheusStorage[T]) GetStats(ctx context.Context) (*Stats, error) {
	s.mu.RLock()
	if s.closed {
		s.mu.RUnlock()
		return nil, ErrStorageClosed
	}
	s.mu.RUnlock()
	s.statsLock.RLock()
	defer s.statsLock.RUnlock()
	dbStats := s.db.Head().Stats("__name__", 1000)
	diskSize, _ := s.calculateDiskSize()
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

func (s *PrometheusStorage[T]) Delete(ctx context.Context, startTime, endTime int64, labelFilters map[string]string) error {
	s.mu.RLock()
	if s.closed {
		s.mu.RUnlock()
		return ErrStorageClosed
	}
	s.mu.RUnlock()
	matchers := make([]*labels.Matcher, 0, len(labelFilters))
	for k, v := range labelFilters {
		matchers = append(matchers, labels.MustNewMatcher(labels.MatchEqual, k, v))
	}
	if len(matchers) == 0 {
		return fmt.Errorf("delete requires at least one label filter")
	}
	if err := s.db.Delete(ctx, startTime, endTime, matchers...); err != nil {
		return fmt.Errorf("delete failed: %w", err)
	}
	return nil
}

func (s *PrometheusStorage[T]) Close() error {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return nil
	}
	s.closed = true
	s.mu.Unlock()
	close(s.stopChan)
	s.wg.Wait()
	if err := s.db.Close(); err != nil {
		return err
	}
	return nil
}

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
			logger.Error("storage: write batch failed: %v", err)
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

func (s *PrometheusStorage[T]) writeBatch(points []*pendingDataPoint) error {
	if len(points) == 0 {
		return nil
	}
	appender := s.db.Appender(context.Background())
	for _, point := range points {
		_, err := appender.Append(0, point.labels, point.timestamp, point.value)
		if err != nil {
			logger.Warn("storage: append failed: %v", err)
			continue
		}
	}
	if err := appender.Commit(); err != nil {
		return fmt.Errorf("commit failed: %w", err)
	}
	return nil
}

func (s *PrometheusStorage[T]) buildMatchers(metricName string, labelFilters Labels) []*labels.Matcher {
	var matchers []*labels.Matcher
	if metricName != "" {
		matchers = append(matchers, labels.MustNewMatcher(labels.MatchEqual, "__name__", metricName))
	}
	for _, label := range labelFilters {
		matchers = append(matchers, labels.MustNewMatcher(labels.MatchEqual, label.Name, label.Value))
	}
	if len(matchers) == 0 {
		matchers = append(matchers, labels.MustNewMatcher(labels.MatchRegexp, "__name__", ".*"))
	}
	return matchers
}

func (s *PrometheusStorage[T]) convertPromQLResult(result *promql.Result) []*DataPoint {
	var points []*DataPoint
	switch v := result.Value.(type) {
	case promql.Vector:
		for _, sample := range v {
			points = append(points, &DataPoint{
				MetricName: sample.Metric.Get("__name__"),
				Labels:     sample.Metric,
				Timestamp:  sample.T,
				Value:      sample.F,
			})
		}
	case promql.Matrix:
		for _, series := range v {
			for _, point := range series.Floats {
				points = append(points, &DataPoint{
					MetricName: series.Metric.Get("__name__"),
					Labels:     series.Metric,
					Timestamp:  point.T,
					Value:      point.F,
				})
			}
		}
	}
	return points
}

func (s *PrometheusStorage[T]) getMinTime() int64 {
	minTime := s.db.Head().MinTime()
	for _, block := range s.db.Blocks() {
		if block.MinTime() < minTime {
			minTime = block.MinTime()
		}
	}
	if minTime == math.MaxInt64 {
		return 0
	}
	return minTime
}

func (s *PrometheusStorage[T]) getMaxTime() int64 {
	maxTime := s.db.Head().MaxTime()
	for _, block := range s.db.Blocks() {
		if block.MaxTime() > maxTime {
			maxTime = block.MaxTime()
		}
	}
	if maxTime == math.MinInt64 {
		return 0
	}
	return maxTime
}

func (s *PrometheusStorage[T]) getTotalSamples(startMS, endMS int64) (int64, error) {
	q, err := s.db.Querier(startMS, endMS)
	if err != nil {
		return 0, err
	}
	defer q.Close()
	hints := &promstorage.SelectHints{Start: startMS, End: endMS}
	m := []*labels.Matcher{labels.MustNewMatcher(labels.MatchRegexp, "__name__", ".*")}
	ss := q.Select(context.Background(), false, hints, m...)
	var n int64
	for ss.Next() {
		it := ss.At().Iterator(nil)
		for it.Next() != chunkenc.ValNone {
			n++
		}
	}
	return n, nil
}

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

func (s *PrometheusStorage[T]) registerTriggers() {
	compactionT := &compactionTrigger[T]{storage: s, interval: s.config.CompactionInterval}
	cleanupT := &cleanupTrigger[T]{storage: s, interval: s.config.MemoryCleanupInterval}
	_ = s.triggerManager.Register(compactionT)
	_ = s.triggerManager.Register(cleanupT)
}

func normalizeQueryTime(start, end int64) (int64, int64) {
	if start == 0 {
		start = time.Now().Add(-24 * time.Hour).UnixMilli()
	}
	if end == 0 {
		end = time.Now().UnixMilli()
	}
	return start, end
}

type compactionTrigger[T any] struct {
	storage  *PrometheusStorage[T]
	interval time.Duration
}

func (t *compactionTrigger[T]) Name() string                        { return "storage-compaction" }
func (t *compactionTrigger[T]) Type() trigger.TriggerType           { return trigger.TriggerTypeInterval }
func (t *compactionTrigger[T]) Interval() time.Duration             { return t.interval }
func (t *compactionTrigger[T]) Execute(ctx context.Context) error {
	if err := t.storage.db.Compact(ctx); err != nil {
		return err
	}
	t.storage.statsLock.Lock()
	t.storage.stats.LastCompactionTime = time.Now().Unix()
	t.storage.statsLock.Unlock()
	return nil
}

type cleanupTrigger[T any] struct {
	storage  *PrometheusStorage[T]
	interval time.Duration
}

func (t *cleanupTrigger[T]) Name() string              { return "storage-cleanup" }
func (t *cleanupTrigger[T]) Type() trigger.TriggerType { return trigger.TriggerTypeInterval }
func (t *cleanupTrigger[T]) Interval() time.Duration   { return t.interval }
func (t *cleanupTrigger[T]) Execute(ctx context.Context) error {
	t.storage.statsLock.Lock()
	t.storage.stats.LastCleanupTime = time.Now().Unix()
	t.storage.statsLock.Unlock()
	return nil
}
