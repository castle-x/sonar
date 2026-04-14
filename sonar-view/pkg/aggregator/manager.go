package aggregator

import (
	"context"
	"fmt"
	"sonar-view/pkg/storage"
	"sync"
	"time"

	"github.com/prometheus/prometheus/model/labels"
)

type EventPublisher interface {
	PublishEvent(topic string, event interface{}) error
}

type AggregationEvent struct {
	Level     string
	Timestamp time.Time
	Points    []AggregatedPoint
	Count     int
}

type Manager struct {
	config          *Config
	tsdb            storage.Storage[AggregatedPoint]
	collector       Collector
	eventPublisher  EventPublisher
	lastAggregation map[string]time.Time
	mu              sync.RWMutex
	minInterval     time.Duration
}

type ManagerOption func(*Manager)

func WithEventPublisher(publisher EventPublisher) ManagerOption {
	return func(m *Manager) {
		m.eventPublisher = publisher
	}
}

func NewManager(
	config *Config,
	tsdb storage.Storage[AggregatedPoint],
	collector Collector,
	opts ...ManagerOption,
) (*Manager, error) {
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
	for _, opt := range opts {
		opt(m)
	}
	return m, nil
}

func (m *Manager) RunOnce(ctx context.Context, now time.Time) error {
	allAggregatedPoints := make([]AggregatedPoint, 0)
	firstLevel := m.config.Levels[0]
	points, err := m.aggregateLevel(ctx, &firstLevel, now)
	if err != nil {
		fmt.Printf("[ERROR] aggregator: failed to aggregate %s: %v\n", firstLevel.Name, err)
	} else if len(points) > 0 {
		allAggregatedPoints = append(allAggregatedPoints, points...)
	}
	for i := 1; i < len(m.config.Levels); i++ {
		level := &m.config.Levels[i]
		if m.isTimeBoundary(level, now) {
			pts, err := m.aggregateLevel(ctx, level, now)
			if err != nil {
				fmt.Printf("[ERROR] aggregator: failed to aggregate %s: %v\n", level.Name, err)
			} else if len(pts) > 0 {
				allAggregatedPoints = append(allAggregatedPoints, pts...)
			}
		}
	}
	if len(allAggregatedPoints) > 0 {
		m.publishAggregationEvent("all", now, allAggregatedPoints)
	}
	return nil
}

func (m *Manager) aggregateLevel(ctx context.Context, level *LevelConfig, now time.Time) ([]AggregatedPoint, error) {
	queryDelay := m.config.QueryDelay
	if queryDelay == 0 {
		queryDelay = 40 * time.Second
	}
	adjustedNow := now.Add(-queryDelay)
	timestamp := AlignTimestamp(adjustedNow, level.Interval)
	m.mu.RLock()
	lastTime, exists := m.lastAggregation[level.Name]
	m.mu.RUnlock()
	if exists && !timestamp.After(lastTime) {
		return nil, nil
	}
	if level.Source == "raw" {
		return m.collectAndAggregate(ctx, level, timestamp)
	}
	return m.cascadeAggregate(ctx, level, timestamp)
}

func (m *Manager) collectAndAggregate(ctx context.Context, level *LevelConfig, timestamp time.Time) ([]AggregatedPoint, error) {
	endTime := timestamp
	startTime := timestamp.Add(-level.Interval)
	collectCtx, cancel := context.WithTimeout(ctx, m.config.CollectTimeout)
	defer cancel()
	rawPoints, err := m.collector.Collect(collectCtx, startTime, endTime)
	if err != nil {
		if collectCtx.Err() == context.DeadlineExceeded {
			return nil, fmt.Errorf("collect timeout after %v: %w", m.config.CollectTimeout, err)
		}
		return nil, fmt.Errorf("collect failed: %w", err)
	}
	if len(rawPoints) == 0 {
		return nil, nil
	}
	aggregated := AggregateRaw(rawPoints, level.Name, timestamp)
	if err := m.tsdb.Write(ctx, aggregated); err != nil {
		return nil, fmt.Errorf("write failed: %w", err)
	}
	m.mu.Lock()
	m.lastAggregation[level.Name] = timestamp
	m.mu.Unlock()
	return aggregated, nil
}

func (m *Manager) cascadeAggregate(ctx context.Context, level *LevelConfig, timestamp time.Time) ([]AggregatedPoint, error) {
	endTime := timestamp
	startTime := timestamp.Add(-level.Interval)
	sourcePoints, err := m.tsdb.QueryByLabels(ctx, &storage.LabelQuery{
		Labels:    labels.FromStrings(string(AggregatedInternalLabelAggregationLevel), level.Source),
		StartTime: startTime.UnixMilli(),
		EndTime:   endTime.UnixMilli(),
	})
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	actualCount := len(sourcePoints)
	sourceLevel := m.config.GetSourceLevel(level.Name)
	if sourceLevel == nil {
		return nil, fmt.Errorf("source level not found: %s", level.Source)
	}
	baseExpectedPoints := CalculateExpectedPoints(level.Interval, sourceLevel.Interval)
	if baseExpectedPoints < level.MinPoints {
		baseExpectedPoints = level.MinPoints
	}
	uniqueMetrics := countUniqueMetrics(sourcePoints)
	expectedCount := baseExpectedPoints * 4 * uniqueMetrics
	quality := EvaluateDataQuality(actualCount, expectedCount, level.FallbackMode)
	if !quality.IsValid() {
		return nil, nil
	}
	aggregated := Aggregate(sourcePoints, level.Name, timestamp, quality)
	if len(aggregated) == 0 {
		return nil, nil
	}
	if err := m.tsdb.Write(ctx, aggregated); err != nil {
		return nil, fmt.Errorf("write failed: %w", err)
	}
	m.mu.Lock()
	m.lastAggregation[level.Name] = timestamp
	m.mu.Unlock()
	return aggregated, nil
}

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
	_ = m.eventPublisher.PublishEvent("points", event)
}

func (m *Manager) isTimeBoundary(level *LevelConfig, now time.Time) bool {
	return IsTimeBoundary(now, level.Interval, m.minInterval)
}

func (m *Manager) GetLastAggregationTime(level string) (time.Time, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	t, ok := m.lastAggregation[level]
	return t, ok
}

func (m *Manager) GetConfig() *Config {
	return m.config
}

func (m *Manager) CleanupExpiredData(ctx context.Context, now time.Time) error {
	for _, level := range m.config.Levels {
		cutoffTime := now.Add(-level.Retention)
		err := m.tsdb.Delete(ctx, 0, cutoffTime.UnixMilli(), map[string]string{
			string(AggregatedInternalLabelAggregationLevel): level.Name,
		})
		if err != nil {
			fmt.Printf("[ERROR] aggregator: cleanup level %s failed: %v\n", level.Name, err)
		}
	}
	return nil
}
