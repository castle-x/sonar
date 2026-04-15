package aggregator

import (
	"context"
	"fmt"
	"testing"
	"time"

	"sonar-view/pkg/storage"
)

// ────────────────────────────────────────────────────────────
// In-memory mock TSDB for Manager tests
// ────────────────────────────────────────────────────────────

type mockTSDB struct {
	written []AggregatedPoint
}

func (m *mockTSDB) Write(_ context.Context, points []AggregatedPoint) error {
	m.written = append(m.written, points...)
	return nil
}

func (m *mockTSDB) QueryByLabels(_ context.Context, req *storage.LabelQuery) ([]AggregatedPoint, error) {
	var out []AggregatedPoint
	for _, p := range m.written {
		lvl := req.Labels.Get(string(AggregatedInternalLabelAggregationLevel))
		if lvl != "" && p.Level != lvl {
			continue
		}
		ts := p.Timestamp.Time().UnixMilli()
		if ts < req.StartTime || ts > req.EndTime {
			continue
		}
		out = append(out, p)
	}
	return out, nil
}

func (m *mockTSDB) QueryByPromQL(_ context.Context, _ *storage.PromQLQuery) ([]AggregatedPoint, error) {
	return nil, fmt.Errorf("not implemented")
}

func (m *mockTSDB) GetStats(_ context.Context) (*storage.Stats, error) {
	return &storage.Stats{}, nil
}

func (m *mockTSDB) Delete(_ context.Context, _, _ int64, _ map[string]string) error {
	return nil
}

func (m *mockTSDB) Close() error { return nil }

// ────────────────────────────────────────────────────────────
// Failing collector helper
// ────────────────────────────────────────────────────────────

type failCollector struct{ msg string }

func (c *failCollector) Collect(_ context.Context, _, _ time.Time) ([]RawMetricPoint, error) {
	return nil, fmt.Errorf("%s", c.msg)
}

// ────────────────────────────────────────────────────────────
// RegisterCollector tests
// ────────────────────────────────────────────────────────────

func newTestManager(t *testing.T) (*Manager, *mockTSDB) {
	t.Helper()
	cfg := DefaultConfig()
	db := &mockTSDB{}
	primary := NewMockCollector(nil)
	mgr, err := NewManager(cfg, db, primary)
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}
	return mgr, db
}

func TestRegisterCollector_Success(t *testing.T) {
	mgr, _ := newTestManager(t)
	col := NewMockCollector(nil)
	if err := mgr.RegisterCollector("extra", col); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	mgr.mu.RLock()
	_, ok := mgr.collectors["extra"]
	_, statusOk := mgr.collectorStatus["extra"]
	mgr.mu.RUnlock()
	if !ok {
		t.Error("expected collector to be registered")
	}
	if !statusOk {
		t.Error("expected status entry to be created")
	}
}

func TestRegisterCollector_EmptyName(t *testing.T) {
	mgr, _ := newTestManager(t)
	if err := mgr.RegisterCollector("", NewMockCollector(nil)); err == nil {
		t.Error("expected error for empty name")
	}
}

func TestRegisterCollector_NilCollector(t *testing.T) {
	mgr, _ := newTestManager(t)
	if err := mgr.RegisterCollector("nilcol", nil); err == nil {
		t.Error("expected error for nil collector")
	}
}

func TestUnregisterCollector(t *testing.T) {
	mgr, _ := newTestManager(t)
	_ = mgr.RegisterCollector("temp", NewMockCollector(nil))
	mgr.UnregisterCollector("temp")

	mgr.mu.RLock()
	_, hasCol := mgr.collectors["temp"]
	_, hasSt := mgr.collectorStatus["temp"]
	mgr.mu.RUnlock()

	if hasCol {
		t.Error("expected collector to be removed")
	}
	if hasSt {
		t.Error("expected status entry to be removed")
	}
}

func TestRegisterCollector_OverwritePreservesStatus(t *testing.T) {
	mgr, _ := newTestManager(t)
	_ = mgr.RegisterCollector("c1", NewMockCollector(nil))

	// Manually set some status
	mgr.mu.Lock()
	mgr.collectorStatus["c1"].FailureCount = 3
	mgr.mu.Unlock()

	// Re-register same name — must not reset existing status
	_ = mgr.RegisterCollector("c1", NewMockCollector(nil))
	mgr.mu.RLock()
	fc := mgr.collectorStatus["c1"].FailureCount
	mgr.mu.RUnlock()
	if fc != 3 {
		t.Errorf("expected failure count preserved as 3, got %d", fc)
	}
}

// ────────────────────────────────────────────────────────────
// Multi-source aggregation test
// ────────────────────────────────────────────────────────────

func TestMultiSourceAggregation_MergesResults(t *testing.T) {
	mgr, db := newTestManager(t)

	now := time.Now()
	ds1Points := rawPoints("ds1", "cpu", []float64{10, 20})
	ds2Points := rawPoints("ds2", "cpu", []float64{30, 40})

	// Replace primary collector data
	mgr.collector = NewMockCollector(ds1Points)

	// Register second source
	_ = mgr.RegisterCollector("source2", NewMockCollector(ds2Points))

	level := mgr.config.Levels[0] // "15s", source=raw
	_, err := mgr.collectAndAggregate(context.Background(), &level, AlignTimestamp(now, level.Interval))
	if err != nil {
		t.Fatalf("collectAndAggregate: %v", err)
	}

	// AggregateRaw preserves per-datasource identity: ds1→avg=15, ds2→avg=35.
	// Verify that both datasources contributed points.
	if len(db.written) == 0 {
		t.Fatal("expected aggregated points to be written to TSDB")
	}

	avgByDS := make(map[string]float64)
	for _, p := range db.written {
		if p.AggregationType == AggregationTypeAvg {
			avgByDS[p.DatasourceId] = p.Value
		}
	}
	if v, ok := avgByDS["ds1"]; !ok || v != 15.0 {
		t.Errorf("ds1 avg = %v (ok=%v), want 15.0", v, ok)
	}
	if v, ok := avgByDS["ds2"]; !ok || v != 35.0 {
		t.Errorf("ds2 avg = %v (ok=%v), want 35.0", v, ok)
	}
}

// ────────────────────────────────────────────────────────────
// Failure isolation tests
// ────────────────────────────────────────────────────────────

func TestMultiSource_FailingCollectorDoesNotBlockOthers(t *testing.T) {
	mgr, db := newTestManager(t)

	now := time.Now()
	goodPoints := rawPoints("ds-good", "mem", []float64{100})
	mgr.collector = NewMockCollector(goodPoints)

	// Add a collector that always fails
	_ = mgr.RegisterCollector("bad-source", &failCollector{msg: "connection refused"})

	level := mgr.config.Levels[0]
	_, err := mgr.collectAndAggregate(context.Background(), &level, AlignTimestamp(now, level.Interval))
	if err != nil {
		t.Fatalf("collectAndAggregate should not return error on partial failure: %v", err)
	}

	// Good data should still be written
	if len(db.written) == 0 {
		t.Error("expected points from good collector to be written")
	}
}

func TestMultiSource_FailingCollectorStatusTracked(t *testing.T) {
	mgr, _ := newTestManager(t)

	now := time.Now()
	mgr.collector = NewMockCollector(rawPoints("ds-ok", "cpu", []float64{50}))
	_ = mgr.RegisterCollector("flaky", &failCollector{msg: "timeout"})

	level := mgr.config.Levels[0]
	_, _ = mgr.collectAndAggregate(context.Background(), &level, AlignTimestamp(now, level.Interval))

	statuses := mgr.GetCollectorStatuses()
	var flakyStatus *CollectorStatus
	for i := range statuses {
		if statuses[i].Name == "flaky" {
			flakyStatus = &statuses[i]
			break
		}
	}
	if flakyStatus == nil {
		t.Fatal("expected status entry for 'flaky' collector")
	}
	if flakyStatus.FailureCount != 1 {
		t.Errorf("expected failure_count=1, got %d", flakyStatus.FailureCount)
	}
	if flakyStatus.LastError == "" {
		t.Error("expected last_error to be set")
	}
}

func TestMultiSource_SuccessfulCollectorStatusTracked(t *testing.T) {
	mgr, _ := newTestManager(t)

	now := time.Now()
	mgr.collector = NewMockCollector(rawPoints("ds1", "cpu", []float64{1}))
	_ = mgr.RegisterCollector("healthy", NewMockCollector(rawPoints("ds2", "cpu", []float64{2})))

	level := mgr.config.Levels[0]
	_, _ = mgr.collectAndAggregate(context.Background(), &level, AlignTimestamp(now, level.Interval))

	statuses := mgr.GetCollectorStatuses()
	var healthySt *CollectorStatus
	for i := range statuses {
		if statuses[i].Name == "healthy" {
			healthySt = &statuses[i]
			break
		}
	}
	if healthySt == nil {
		t.Fatal("expected status for 'healthy' collector")
	}
	if healthySt.FailureCount != 0 {
		t.Errorf("expected 0 failures, got %d", healthySt.FailureCount)
	}
	if healthySt.LastSuccess.IsZero() {
		t.Error("expected last_success to be set after successful collect")
	}
}

func TestGetCollectorStatuses_Empty(t *testing.T) {
	mgr, _ := newTestManager(t)
	statuses := mgr.GetCollectorStatuses()
	if len(statuses) != 0 {
		t.Errorf("expected empty statuses for new manager, got %d", len(statuses))
	}
}

func TestGetCollectorStatuses_MultipleCollectors(t *testing.T) {
	mgr, _ := newTestManager(t)
	_ = mgr.RegisterCollector("a", NewMockCollector(nil))
	_ = mgr.RegisterCollector("b", NewMockCollector(nil))
	_ = mgr.RegisterCollector("c", NewMockCollector(nil))

	statuses := mgr.GetCollectorStatuses()
	if len(statuses) != 3 {
		t.Errorf("expected 3 statuses, got %d", len(statuses))
	}
}

// ────────────────────────────────────────────────────────────
// Datasource ID label preserved during aggregation
// ────────────────────────────────────────────────────────────

func TestMultiSource_DatasourceIDLabelPreserved(t *testing.T) {
	mgr, db := newTestManager(t)

	now := time.Now()
	mgr.collector = NewMockCollector(rawPoints("datasource-A", "latency", []float64{10}))

	level := mgr.config.Levels[0]
	_, err := mgr.collectAndAggregate(context.Background(), &level, AlignTimestamp(now, level.Interval))
	if err != nil {
		t.Fatalf("collectAndAggregate: %v", err)
	}

	if len(db.written) == 0 {
		t.Fatal("no points written")
	}

	for _, p := range db.written {
		if p.DatasourceId != "datasource-A" {
			t.Errorf("expected DatasourceId=datasource-A, got %q", p.DatasourceId)
		}
	}
}
