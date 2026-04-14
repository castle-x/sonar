package scoring

import (
	"math"
	"testing"
)

// ────────────────────────────────────────────────────────────
// NormalizeWeights
// ────────────────────────────────────────────────────────────

func TestWeightNormalization(t *testing.T) {
	tests := []struct {
		name    string
		input   []float64
		wantSum float64
		wantLen int
	}{
		{name: "empty slice", input: []float64{}, wantSum: 0, wantLen: 0},
		{name: "equal weights", input: []float64{1, 1, 1, 1}, wantSum: 1.0, wantLen: 4},
		{name: "different weights", input: []float64{1, 2, 3}, wantSum: 1.0, wantLen: 3},
		{name: "all zeros -> uniform", input: []float64{0, 0, 0}, wantSum: 1.0, wantLen: 3},
		{name: "single weight", input: []float64{5}, wantSum: 1.0, wantLen: 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := NormalizeWeights(tt.input)
			if len(got) != tt.wantLen {
				t.Fatalf("len = %d, want %d", len(got), tt.wantLen)
			}
			if tt.wantLen == 0 {
				return
			}
			sum := 0.0
			for _, w := range got {
				sum += w
			}
			if math.Abs(sum-tt.wantSum) > 1e-9 {
				t.Errorf("sum = %f, want %f", sum, tt.wantSum)
			}
		})
	}
}

func TestWeightNormalizationProportions(t *testing.T) {
	got := NormalizeWeights([]float64{1, 2, 3})
	expected := []float64{1.0 / 6, 2.0 / 6, 3.0 / 6}
	for i, w := range got {
		if math.Abs(w-expected[i]) > 1e-9 {
			t.Errorf("weight[%d] = %f, want %f", i, w, expected[i])
		}
	}
}

// ────────────────────────────────────────────────────────────
// GetScoreLevel
// ────────────────────────────────────────────────────────────

func TestGetScoreLevel(t *testing.T) {
	tests := []struct {
		score float64
		want  string
	}{
		{100, "excellent"},
		{90, "excellent"},
		{89.9, "good"},
		{75, "good"},
		{74.9, "normal"},
		{60, "normal"},
		{59.9, "warning"},
		{40, "warning"},
		{39.9, "danger"},
		{0, "danger"},
	}
	for _, tt := range tests {
		got := GetScoreLevel(tt.score)
		if got != tt.want {
			t.Errorf("GetScoreLevel(%v) = %q, want %q", tt.score, got, tt.want)
		}
	}
}

// ────────────────────────────────────────────────────────────
// Range scoring via CalculateMetricScore
// ────────────────────────────────────────────────────────────

func makeRangeConfig(ranges []*ScoringRange) *MetricScoringConfig {
	return &MetricScoringConfig{
		Name:        "test_metric",
		ScoringType: "range",
		Ranges:      ranges,
	}
}

func TestRangeScoring_ExactMatch(t *testing.T) {
	cfg := makeRangeConfig([]*ScoringRange{
		{Min: 0, Max: 50, Score: 40, Level: "warning"},
		{Min: 51, Max: 100, Score: 90, Level: "excellent"},
	})
	result := CalculateMetricScore(30, 30, cfg, "avg")
	if result.Score != 40 {
		t.Errorf("score = %d, want 40", result.Score)
	}
	if result.Level != "warning" {
		t.Errorf("level = %q, want warning", result.Level)
	}
}

func TestRangeScoring_UpperBandMatch(t *testing.T) {
	cfg := makeRangeConfig([]*ScoringRange{
		{Min: 0, Max: 50, Score: 40, Level: "warning"},
		{Min: 51, Max: 100, Score: 90, Level: "excellent"},
	})
	result := CalculateMetricScore(80, 80, cfg, "avg")
	if result.Score != 90 {
		t.Errorf("score = %d, want 90", result.Score)
	}
	if result.Level != "excellent" {
		t.Errorf("level = %q, want excellent", result.Level)
	}
}

func TestRangeScoring_OutOfRange_Interpolated(t *testing.T) {
	cfg := makeRangeConfig([]*ScoringRange{
		{Min: 10, Max: 20, Score: 80, Level: "good"},
		{Min: 30, Max: 40, Score: 60, Level: "normal"},
	})
	result := CalculateMetricScore(200, 200, cfg, "avg")
	if result == nil {
		t.Fatal("expected non-nil result")
	}
}

func TestRangeScoring_EmptyRanges_DefaultScore(t *testing.T) {
	cfg := makeRangeConfig([]*ScoringRange{})
	result := CalculateMetricScore(50, 50, cfg, "avg")
	if result.Score != 60 {
		t.Errorf("score = %d, want 60 (default)", result.Score)
	}
}

func TestRangeScoring_MetricIdentifier(t *testing.T) {
	cfg := makeRangeConfig([]*ScoringRange{
		{Min: 0, Max: 100, Score: 80, Level: "good"},
	})
	result := CalculateMetricScore(50, 50, cfg, "max")
	want := "test_metric_max"
	if result.MetricName != want {
		t.Errorf("MetricName = %q, want %q", result.MetricName, want)
	}
}

func TestRangeScoring_WithAlias(t *testing.T) {
	alias := "My Metric"
	cfg := &MetricScoringConfig{
		Name:        "raw_metric",
		Alias:       &alias,
		ScoringType: "range",
		Ranges:      []*ScoringRange{{Min: 0, Max: 100, Score: 80, Level: "good"}},
	}
	result := CalculateMetricScore(50, 50, cfg, "avg")
	if result.DisplayName != alias {
		t.Errorf("DisplayName = %q, want %q", result.DisplayName, alias)
	}
}

// ────────────────────────────────────────────────────────────
// Threshold scoring
// ────────────────────────────────────────────────────────────

func makeThresholdConfig(thresholds []*ThresholdCondition) *MetricScoringConfig {
	return &MetricScoringConfig{
		Name:        "test_threshold",
		ScoringType: "threshold",
		Thresholds:  thresholds,
	}
}

func TestThresholdScoring_LessThan(t *testing.T) {
	cfg := makeThresholdConfig([]*ThresholdCondition{
		{Operator: "<", Value: 100, Score: 90, Level: "excellent"},
		{Operator: ">=", Value: 100, Score: 40, Level: "warning"},
	})
	result := CalculateMetricScore(50, 50, cfg, "avg")
	if result.Score != 90 {
		t.Errorf("score = %d, want 90", result.Score)
	}
	if result.Level != "excellent" {
		t.Errorf("level = %q, want excellent", result.Level)
	}
}

func TestThresholdScoring_GreaterThanEqual(t *testing.T) {
	cfg := makeThresholdConfig([]*ThresholdCondition{
		{Operator: "<", Value: 100, Score: 90, Level: "excellent"},
		{Operator: ">=", Value: 100, Score: 40, Level: "warning"},
	})
	result := CalculateMetricScore(150, 150, cfg, "avg")
	if result.Score != 40 {
		t.Errorf("score = %d, want 40", result.Score)
	}
}

func TestThresholdScoring_Equal(t *testing.T) {
	cfg := makeThresholdConfig([]*ThresholdCondition{
		{Operator: "=", Value: 42, Score: 100, Level: "excellent"},
		{Operator: ">", Value: 0, Score: 50, Level: "normal"},
	})
	result := CalculateMetricScore(42, 42, cfg, "avg")
	if result.Score != 100 {
		t.Errorf("score = %d, want 100", result.Score)
	}
}

func TestThresholdScoring_AllOperators(t *testing.T) {
	tests := []struct {
		op    string
		val   float64
		input float64
		want  bool
	}{
		{"<", 10, 5, true},
		{"<", 10, 10, false},
		{"<=", 10, 10, true},
		{"<=", 10, 11, false},
		{"=", 5, 5, true},
		{"=", 5, 6, false},
		{">=", 10, 10, true},
		{">=", 10, 9, false},
		{">", 10, 11, true},
		{">", 10, 10, false},
	}
	for _, tt := range tests {
		cfg := makeThresholdConfig([]*ThresholdCondition{
			{Operator: tt.op, Value: tt.val, Score: 99, Level: "excellent"},
		})
		result := CalculateMetricScore(tt.input, tt.input, cfg, "avg")
		matched := result.Score == 99
		if matched != tt.want {
			t.Errorf("op=%q val=%v input=%v: matched=%v, want=%v", tt.op, tt.val, tt.input, matched, tt.want)
		}
	}
}

// ────────────────────────────────────────────────────────────
// CalculateReportScore
// ────────────────────────────────────────────────────────────

func TestCalculateReportScore_Empty(t *testing.T) {
	result := CalculateReportScore([]*CaseScore{})
	if result.TotalScore != 0 {
		t.Errorf("TotalScore = %f, want 0", result.TotalScore)
	}
	if len(result.CaseScores) != 0 {
		t.Errorf("CaseScores len = %d, want 0", len(result.CaseScores))
	}
}

func TestCalculateReportScore_EqualWeight(t *testing.T) {
	cases := []*CaseScore{
		{CaseName: "case1", Score: 80},
		{CaseName: "case2", Score: 60},
	}
	result := CalculateReportScore(cases)
	// each weight = 0.5, total = 80*0.5 + 60*0.5 = 70
	if math.Abs(result.TotalScore-70.0) > 0.01 {
		t.Errorf("TotalScore = %f, want 70.0", result.TotalScore)
	}
	if result.Level != "normal" {
		t.Errorf("level = %q, want normal", result.Level)
	}
}

func TestCalculateReportScore_Single(t *testing.T) {
	cases := []*CaseScore{
		{CaseName: "only", Score: 95},
	}
	result := CalculateReportScore(cases)
	if math.Abs(result.TotalScore-95.0) > 0.01 {
		t.Errorf("TotalScore = %f, want 95.0", result.TotalScore)
	}
	if result.Level != "excellent" {
		t.Errorf("level = %q, want excellent", result.Level)
	}
}

func TestCalculateReportScore_WeightsAssigned(t *testing.T) {
	cases := []*CaseScore{
		{CaseName: "a", Score: 100},
		{CaseName: "b", Score: 100},
		{CaseName: "c", Score: 100},
	}
	result := CalculateReportScore(cases)
	for _, cs := range result.CaseScores {
		if math.Abs(cs.Weight-1.0/3) > 1e-9 {
			t.Errorf("case %s weight = %f, want 0.333...", cs.CaseName, cs.Weight)
		}
	}
}
