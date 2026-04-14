package aggregator

import (
	"testing"
	"time"

	"github.com/prometheus/prometheus/model/labels"
	"sonar-view/pkg/storage"
)

func emptyLabels() storage.Labels {
	return labels.EmptyLabels()
}

func makeLabels(pairs ...string) storage.Labels {
	return labels.FromStrings(pairs...)
}

// ────────────────────────────────────────────────────────────
// AggregateRaw — basic aggregation types
// ────────────────────────────────────────────────────────────

func rawPoints(datasourceId, name string, values []float64) []RawMetricPoint {
	pts := make([]RawMetricPoint, len(values))
	for i, v := range values {
		pts[i] = RawMetricPoint{
			DatasourceId: datasourceId,
			Name:         name,
			Labels:       emptyLabels(),
			Timestamp:    time.Now().UnixMilli(),
			Value:        v,
		}
	}
	return pts
}

func findAggPoint(points []AggregatedPoint, aggType AggregationType) *AggregatedPoint {
	for i := range points {
		if points[i].AggregationType == aggType {
			return &points[i]
		}
	}
	return nil
}

func TestAggregateRaw_Empty(t *testing.T) {
	result := AggregateRaw(nil, "15s", time.Now())
	if len(result) != 0 {
		t.Errorf("expected empty result for nil input, got %d points", len(result))
	}
}

func TestAggregateRaw_SinglePoint(t *testing.T) {
	pts := rawPoints("app1", "cpu_usage", []float64{42.0})
	result := AggregateRaw(pts, "15s", time.Now())
	if len(result) != len(AggregationTypeList) {
		t.Errorf("expected %d aggregated points, got %d", len(AggregationTypeList), len(result))
	}
	avg := findAggPoint(result, AggregationTypeAvg)
	if avg == nil {
		t.Fatal("avg point not found")
	}
	if avg.Value != 42.0 {
		t.Errorf("avg = %f, want 42.0", avg.Value)
	}
}

func TestAggregateRaw_AvgCalculation(t *testing.T) {
	pts := rawPoints("app1", "cpu", []float64{10, 20, 30})
	result := AggregateRaw(pts, "15s", time.Now())
	avg := findAggPoint(result, AggregationTypeAvg)
	if avg == nil {
		t.Fatal("avg point not found")
	}
	if avg.Value != 20.0 {
		t.Errorf("avg = %f, want 20.0", avg.Value)
	}
}

func TestAggregateRaw_MinCalculation(t *testing.T) {
	pts := rawPoints("app1", "cpu", []float64{10, 5, 30})
	result := AggregateRaw(pts, "15s", time.Now())
	min := findAggPoint(result, AggregationTypeMin)
	if min == nil {
		t.Fatal("min point not found")
	}
	if min.Value != 5.0 {
		t.Errorf("min = %f, want 5.0", min.Value)
	}
}

func TestAggregateRaw_MaxCalculation(t *testing.T) {
	pts := rawPoints("app1", "cpu", []float64{10, 5, 30})
	result := AggregateRaw(pts, "15s", time.Now())
	max := findAggPoint(result, AggregationTypeMax)
	if max == nil {
		t.Fatal("max point not found")
	}
	if max.Value != 30.0 {
		t.Errorf("max = %f, want 30.0", max.Value)
	}
}

func TestAggregateRaw_CountCalculation(t *testing.T) {
	pts := rawPoints("app1", "cpu", []float64{1, 2, 3, 4, 5})
	result := AggregateRaw(pts, "15s", time.Now())
	count := findAggPoint(result, AggregationTypeCount)
	if count == nil {
		t.Fatal("count point not found")
	}
	if count.Value != 5.0 {
		t.Errorf("count = %f, want 5.0", count.Value)
	}
}

func TestAggregateRaw_LastCalculation(t *testing.T) {
	pts := rawPoints("app1", "cpu", []float64{1, 2, 99})
	result := AggregateRaw(pts, "15s", time.Now())
	last := findAggPoint(result, AggregationTypeLast)
	if last == nil {
		t.Fatal("last point not found")
	}
	if last.Value != 99.0 {
		t.Errorf("last = %f, want 99.0", last.Value)
	}
}

func TestAggregateRaw_LevelAndDatasourcePreserved(t *testing.T) {
	pts := rawPoints("ds-001", "mem", []float64{50})
	result := AggregateRaw(pts, "1m", time.Now())
	for _, p := range result {
		if p.Level != "1m" {
			t.Errorf("level = %q, want 1m", p.Level)
		}
		if p.DatasourceId != "ds-001" {
			t.Errorf("datasourceId = %q, want ds-001", p.DatasourceId)
		}
	}
}

// ────────────────────────────────────────────────────────────
// Aggregate — re-aggregate AggregatedPoint slices
// ────────────────────────────────────────────────────────────

func makeAggPoints(datasourceId, name string, aggType AggregationType, values []float64) []AggregatedPoint {
	q := DataQuality{Score: 100, Status: DataStatusComplete, ActualPoints: len(values), ExpectedPoints: len(values)}
	pts := make([]AggregatedPoint, len(values))
	now := time.Now()
	for i, v := range values {
		pts[i] = AggregatedPoint{
			DatasourceId:    datasourceId,
			Name:            name,
			Labels:          emptyLabels(),
			Level:           "15s",
			Timestamp:       UnixMilliTime(now),
			AggregationType: aggType,
			Value:           v,
			Quality:         q,
		}
	}
	return pts
}

func TestAggregate_Empty(t *testing.T) {
	result := Aggregate(nil, "30s", time.Now(), DataQuality{})
	if len(result) != 0 {
		t.Errorf("expected empty result for nil input, got %d points", len(result))
	}
}

func TestAggregate_AvgOfAvg(t *testing.T) {
	pts := makeAggPoints("app1", "cpu", AggregationTypeAvg, []float64{10, 20, 30})
	q := DataQuality{Score: 100, Status: DataStatusComplete}
	result := Aggregate(pts, "30s", time.Now(), q)
	avg := findAggPoint(result, AggregationTypeAvg)
	if avg == nil {
		t.Fatal("avg not found in re-aggregated result")
	}
	if avg.Value != 20.0 {
		t.Errorf("re-aggregated avg = %f, want 20.0", avg.Value)
	}
}

// ────────────────────────────────────────────────────────────
// AlignTimestamp
// ────────────────────────────────────────────────────────────

func TestAlignTimestamp(t *testing.T) {
	base := time.Date(2024, 1, 1, 0, 0, 42, 0, time.UTC)
	aligned := AlignTimestamp(base, 15*time.Second)
	expected := time.Date(2024, 1, 1, 0, 0, 30, 0, time.UTC)
	if !aligned.Equal(expected) {
		t.Errorf("aligned = %v, want %v", aligned, expected)
	}
}

func TestAlignTimestamp_AlreadyAligned(t *testing.T) {
	base := time.Date(2024, 1, 1, 0, 1, 0, 0, time.UTC)
	aligned := AlignTimestamp(base, 1*time.Minute)
	if !aligned.Equal(base) {
		t.Errorf("aligned = %v, want %v", aligned, base)
	}
}

// ────────────────────────────────────────────────────────────
// CalculateExpectedPoints
// ────────────────────────────────────────────────────────────

func TestCalculateExpectedPoints(t *testing.T) {
	tests := []struct {
		interval       time.Duration
		sourceInterval time.Duration
		want           int
	}{
		{30 * time.Second, 15 * time.Second, 2},
		{1 * time.Minute, 15 * time.Second, 4},
		{5 * time.Minute, 1 * time.Minute, 5},
		{1 * time.Hour, 5 * time.Minute, 12},
		{30 * time.Second, 0, 1},
	}
	for _, tt := range tests {
		got := CalculateExpectedPoints(tt.interval, tt.sourceInterval)
		if got != tt.want {
			t.Errorf("CalculateExpectedPoints(%v, %v) = %d, want %d",
				tt.interval, tt.sourceInterval, got, tt.want)
		}
	}
}

// ────────────────────────────────────────────────────────────
// ValidateAggregationChain
// ────────────────────────────────────────────────────────────

func TestValidateAggregationChain_Valid(t *testing.T) {
	levels := []LevelConfig{
		{Name: "15s", Source: "raw"},
		{Name: "30s", Source: "15s"},
		{Name: "1m", Source: "30s"},
	}
	if err := ValidateAggregationChain(levels); err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestValidateAggregationChain_Empty(t *testing.T) {
	if err := ValidateAggregationChain(nil); err == nil {
		t.Error("expected error for empty levels")
	}
}

func TestValidateAggregationChain_FirstNotRaw(t *testing.T) {
	levels := []LevelConfig{
		{Name: "15s", Source: "other"},
	}
	if err := ValidateAggregationChain(levels); err == nil {
		t.Error("expected error when first level source is not 'raw'")
	}
}

func TestValidateAggregationChain_UnknownSource(t *testing.T) {
	levels := []LevelConfig{
		{Name: "15s", Source: "raw"},
		{Name: "1m", Source: "unknown"},
	}
	if err := ValidateAggregationChain(levels); err == nil {
		t.Error("expected error for unknown source reference")
	}
}

// ────────────────────────────────────────────────────────────
// Config.Validate
// ────────────────────────────────────────────────────────────

func TestConfigValidate_DefaultConfig(t *testing.T) {
	cfg := DefaultConfig()
	if err := cfg.Validate(); err != nil {
		t.Errorf("DefaultConfig should be valid, got: %v", err)
	}
}

func TestConfigValidate_Disabled(t *testing.T) {
	cfg := &Config{Enabled: false}
	if err := cfg.Validate(); err != nil {
		t.Errorf("disabled config should pass validation: %v", err)
	}
}

func TestConfigValidate_EmptyLevels(t *testing.T) {
	cfg := &Config{Enabled: true, Levels: []LevelConfig{}}
	if err := cfg.Validate(); err == nil {
		t.Error("expected error for enabled config with no levels")
	}
}

func TestConfigGetLevel(t *testing.T) {
	cfg := DefaultConfig()
	level := cfg.GetLevel("1m")
	if level == nil {
		t.Fatal("expected to find level '1m'")
	}
	if level.Name != "1m" {
		t.Errorf("name = %q, want 1m", level.Name)
	}
	if cfg.GetLevel("nonexistent") != nil {
		t.Error("expected nil for unknown level")
	}
}

func TestConfigGetSourceLevel(t *testing.T) {
	cfg := DefaultConfig()
	src := cfg.GetSourceLevel("30s")
	if src == nil {
		t.Fatal("expected source level for 30s")
	}
	if src.Name != "15s" {
		t.Errorf("source level name = %q, want 15s", src.Name)
	}
	if cfg.GetSourceLevel("15s") != nil {
		t.Error("expected nil for level with source=raw")
	}
}

// ────────────────────────────────────────────────────────────
// AggregationType helpers
// ────────────────────────────────────────────────────────────

func TestAggregationTypeIndex(t *testing.T) {
	tests := []struct {
		t    AggregationType
		want int
	}{
		{AggregationTypeAvg, 0},
		{AggregationTypeMin, 1},
		{AggregationTypeMax, 2},
		{AggregationTypeCount, 3},
		{AggregationTypeLast, 4},
	}
	for _, tt := range tests {
		if got := tt.t.Index(); got != tt.want {
			t.Errorf("%s.Index() = %d, want %d", tt.t, got, tt.want)
		}
	}
}

// ────────────────────────────────────────────────────────────
// filterBusinessLabels (internal helper, tested indirectly)
// ────────────────────────────────────────────────────────────

func TestFilterBusinessLabels_InternalLabelsRemoved(t *testing.T) {
	lbs := makeLabels(
		string(AggregatedInternalLabelAggregationLevel), "15s",
		string(AggregatedInternalLabelDatasourceId), "app1",
		"custom_label", "value1",
	)
	filtered := filterBusinessLabels(lbs)
	if filtered.Get(string(AggregatedInternalLabelAggregationLevel)) != "" {
		t.Error("expected aggregation level label to be removed")
	}
	if filtered.Get(string(AggregatedInternalLabelDatasourceId)) != "" {
		t.Error("expected datasource id label to be removed")
	}
	if filtered.Get("custom_label") != "value1" {
		t.Errorf("expected custom_label=value1 to be preserved, got %q", filtered.Get("custom_label"))
	}
}

