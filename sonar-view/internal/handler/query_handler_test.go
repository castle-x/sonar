package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"sonar-view/pkg/aggregator"
	"sonar-view/pkg/storage"

	"github.com/prometheus/prometheus/model/labels"
)

// MockStorage implements Storage[AggregatedPoint] for testing
type MockStorage struct {
	points []aggregator.AggregatedPoint
}

func (m *MockStorage) Write(ctx context.Context, points []aggregator.AggregatedPoint) error {
	m.points = append(m.points, points...)
	return nil
}

func (m *MockStorage) QueryByLabels(ctx context.Context, req *storage.LabelQuery) ([]aggregator.AggregatedPoint, error) {
	var results []aggregator.AggregatedPoint
	for _, p := range m.points {
		// Simple label matching: check if all query labels are present in point
		match := true
		for _, lbl := range req.Labels {
			found := false
			for _, pl := range p.Labels {
				if pl.Name == lbl.Name && pl.Value == lbl.Value {
					found = true
					break
				}
			}
			if !found {
				match = false
				break
			}
		}

		// Check time range
		ts := p.Timestamp.Time().UnixMilli()
		if ts < req.StartTime || ts > req.EndTime {
			match = false
		}

		if match {
			results = append(results, p)
		}
	}
	return results, nil
}

func (m *MockStorage) QueryByPromQL(ctx context.Context, req *storage.PromQLQuery) ([]aggregator.AggregatedPoint, error) {
	return nil, fmt.Errorf("not implemented")
}

func (m *MockStorage) GetStats(ctx context.Context) (*storage.Stats, error) {
	return nil, fmt.Errorf("not implemented")
}

func (m *MockStorage) Delete(ctx context.Context, startTime, endTime int64, labelMap map[string]string) error {
	return nil
}

func (m *MockStorage) Close() error {
	return nil
}

func createTestPoint(name string, aggType aggregator.AggregationType, value float64, ts time.Time, extraLabels map[string]string) aggregator.AggregatedPoint {
	builder := labels.NewBuilder(nil)
	builder.Set(string(aggregator.AggregatedInternalLabelName), name)
	builder.Set(string(aggregator.AggregatedInternalLabelAggregationLevel), "1m")
	builder.Set(string(aggregator.AggregatedInternalLabelStatisticSuffix), string(aggType))
	builder.Set("app_id", "test-app")

	for k, v := range extraLabels {
		builder.Set(k, v)
	}

	return aggregator.AggregatedPoint{
		Name:            name,
		Value:           value,
		Timestamp:       aggregator.UnixMilliTime(ts),
		AggregationType: aggType,
		Labels:          builder.Labels(),
		DatasourceId:    "ds1",
		Quality:         aggregator.DataQuality{Score: 100, Status: aggregator.DataStatusComplete},
	}
}

func TestQueryPointsHandler_BasicQuery(t *testing.T) {
	// Setup mock storage with test data
	storage := &MockStorage{}
	now := time.Now()

	// Add test data points for different agg types
	storage.points = append(storage.points,
		createTestPoint("cpu", aggregator.AggregationTypeAvg, 50.0, now, map[string]string{}),
		createTestPoint("cpu", aggregator.AggregationTypeMin, 30.0, now, map[string]string{}),
		createTestPoint("cpu", aggregator.AggregationTypeMax, 70.0, now, map[string]string{}),
		createTestPoint("cpu", aggregator.AggregationTypeCount, 100.0, now, map[string]string{}),
		createTestPoint("cpu", aggregator.AggregationTypeLast, 55.0, now, map[string]string{}),
		createTestPoint("memory", aggregator.AggregationTypeAvg, 2000.0, now, map[string]string{}),
		createTestPoint("memory", aggregator.AggregationTypeMin, 1500.0, now, map[string]string{}),
	)

	handler := NewQueryPointsHandler(storage)

	// Test basic query
	startMs := now.Add(-time.Hour).UnixMilli()
	endMs := now.Add(time.Hour).UnixMilli()

	req := httptest.NewRequest(
		http.MethodGet,
		fmt.Sprintf("/api/v1/aggregation/metrics?start_time=%d&end_time=%d&level=1m", startMs, endMs),
		nil,
	)
	w := httptest.NewRecorder()

	handler.QueryPoints(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp struct {
		Code int
		Data QueryPointsResponse
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Code != 0 {
		t.Errorf("expected code 0, got %d", resp.Code)
	}

	// Verify compressed format
	if resp.Data.Metrics == nil {
		t.Fatal("expected metrics in response")
	}

	// K should have pairs of [name, labels]
	if len(resp.Data.Metrics.K)%2 != 0 {
		t.Errorf("K array should have even length, got %d", len(resp.Data.Metrics.K))
	}

	// V should have 3D structure
	if len(resp.Data.Metrics.V) != len(resp.Data.Metrics.K)/2 {
		t.Errorf("V should have %d entries (one per metric), got %d", len(resp.Data.Metrics.K)/2, len(resp.Data.Metrics.V))
	}

	// Verify time range
	if resp.Data.StartT != startMs {
		t.Errorf("expected start_time=%d, got %d", startMs, resp.Data.StartT)
	}
	if resp.Data.EndT != endMs {
		t.Errorf("expected end_time=%d, got %d", endMs, resp.Data.EndT)
	}
}

func TestQueryPointsHandler_FilterMetrics(t *testing.T) {
	storage := &MockStorage{}
	now := time.Now()

	storage.points = append(storage.points,
		createTestPoint("cpu", aggregator.AggregationTypeAvg, 50.0, now, map[string]string{}),
		createTestPoint("memory", aggregator.AggregationTypeAvg, 2000.0, now, map[string]string{}),
		createTestPoint("disk", aggregator.AggregationTypeAvg, 8000.0, now, map[string]string{}),
	)

	handler := NewQueryPointsHandler(storage)

	startMs := now.Add(-time.Hour).UnixMilli()
	endMs := now.Add(time.Hour).UnixMilli()

	// Query only cpu and memory metrics
	req := httptest.NewRequest(
		http.MethodGet,
		fmt.Sprintf("/api/v1/aggregation/metrics?start_time=%d&end_time=%d&level=1m&metric_names=cpu,memory", startMs, endMs),
		nil,
	)
	w := httptest.NewRecorder()

	handler.QueryPoints(w, req)

	var resp struct {
		Code int
		Data QueryPointsResponse
	}
	json.NewDecoder(w.Body).Decode(&resp)

	// Should only have 2 metrics in K (4 entries total: name1, labels1, name2, labels2)
	if len(resp.Data.Metrics.K) != 4 {
		t.Errorf("expected 4 K entries (2 metrics), got %d", len(resp.Data.Metrics.K))
	}

	// Verify metric names in K
	if resp.Data.Metrics.K[0] != "cpu" && resp.Data.Metrics.K[0] != "memory" {
		t.Errorf("expected first metric to be cpu or memory, got %s", resp.Data.Metrics.K[0])
	}
}

func TestQueryPointsHandler_ValidationErrors(t *testing.T) {
	handler := NewQueryPointsHandler(&MockStorage{})

	tests := []struct {
		name           string
		query          string
		expectedStatus int
		expectedMsg    string
	}{
		{
			name:           "missing start_time",
			query:          "end_time=1234567890",
			expectedStatus: http.StatusBadRequest,
			expectedMsg:    "start_time is required",
		},
		{
			name:           "missing end_time",
			query:          "start_time=1234567890",
			expectedStatus: http.StatusBadRequest,
			expectedMsg:    "end_time is required",
		},
		{
			name:           "start_time >= end_time",
			query:          "start_time=2000&end_time=1000",
			expectedStatus: http.StatusBadRequest,
			expectedMsg:    "start_time must be less than end_time",
		},
		{
			name:           "invalid start_time",
			query:          "start_time=abc&end_time=1000",
			expectedStatus: http.StatusBadRequest,
			expectedMsg:    "start_time is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/v1/aggregation/metrics?"+tt.query, nil)
			w := httptest.NewRecorder()

			handler.QueryPoints(w, req)

			if w.Code != tt.expectedStatus {
				t.Errorf("expected status %d, got %d", tt.expectedStatus, w.Code)
			}

			var resp struct {
				Code    int
				Message string
			}
			json.NewDecoder(w.Body).Decode(&resp)

			if !bytes.Contains([]byte(resp.Message), []byte(tt.expectedMsg)) {
				t.Errorf("expected message containing %q, got %q", tt.expectedMsg, resp.Message)
			}
		})
	}
}

func TestQueryPointsHandler_CompressionFormat(t *testing.T) {
	storage := &MockStorage{}
	now := time.Now()

	// Add multiple points for same metric with different agg types
	storage.points = append(storage.points,
		createTestPoint("cpu", aggregator.AggregationTypeAvg, 50.0, now, map[string]string{}),
		createTestPoint("cpu", aggregator.AggregationTypeAvg, 55.0, now.Add(time.Minute), map[string]string{}),
		createTestPoint("cpu", aggregator.AggregationTypeMin, 30.0, now, map[string]string{}),
		createTestPoint("cpu", aggregator.AggregationTypeMax, 70.0, now, map[string]string{}),
	)

	handler := NewQueryPointsHandler(storage)

	startMs := now.Add(-time.Hour).UnixMilli()
	endMs := now.Add(time.Hour).UnixMilli()

	req := httptest.NewRequest(
		http.MethodGet,
		fmt.Sprintf("/api/v1/aggregation/metrics?start_time=%d&end_time=%d&level=1m", startMs, endMs),
		nil,
	)
	w := httptest.NewRecorder()

	handler.QueryPoints(w, req)

	var resp struct {
		Code int
		Data QueryPointsResponse
	}
	json.NewDecoder(w.Body).Decode(&resp)

	// Verify structure: K=[name1, labels1, name2, labels2, ...], V[metricIndex][aggTypeIndex][timePoints]
	// Each (metric_name, unique_label_set) combination is a key pair in K
	// Different aggregation types create different label sets, so we expect 3 entries (avg, min, max)
	if len(resp.Data.Metrics.V) != 3 {
		t.Errorf("expected 3 metrics in V (one for each agg type), got %d", len(resp.Data.Metrics.V))
	}

	// K should have 6 entries (3 pairs of name, labelstr)
	if len(resp.Data.Metrics.K) != 6 {
		t.Errorf("expected 6 K entries (3 name-label pairs), got %d", len(resp.Data.Metrics.K))
	}

	// Verify metric names in K
	if resp.Data.Metrics.K[0] != "cpu" || resp.Data.Metrics.K[2] != "cpu" || resp.Data.Metrics.K[4] != "cpu" {
		t.Errorf("expected all metrics to be 'cpu', got K=%v", resp.Data.Metrics.K[:6])
	}

	// Verify data points are present
	totalPoints := 0
	for _, metricData := range resp.Data.Metrics.V {
		for _, aggTypeData := range metricData {
			totalPoints += len(aggTypeData)
		}
	}
	if totalPoints != 4 {
		t.Errorf("expected 4 total data points, got %d", totalPoints)
	}
}

func TestQueryPointsHandler_BatchQuery(t *testing.T) {
	storage := &MockStorage{}
	now := time.Now()

	// Add test data
	storage.points = append(storage.points,
		createTestPoint("cpu", aggregator.AggregationTypeAvg, 50.0, now, map[string]string{}),
		createTestPoint("memory", aggregator.AggregationTypeAvg, 2000.0, now, map[string]string{}),
	)

	handler := NewQueryPointsHandler(storage)

	batchReq := map[string]any{
		"app_id":       "app1",
		"metric_names": []string{"cpu", "memory"},
		"time_range":   map[string]int64{"start": now.Add(-time.Hour).UnixMilli(), "end": now.Add(time.Hour).UnixMilli()},
		"levels":       []string{"1m", "5m"},
	}

	body, _ := json.Marshal(batchReq)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/aggregation/metrics/batch", io.NopCloser(bytes.NewReader(body)))
	w := httptest.NewRecorder()

	handler.QueryPointsBatch(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp struct {
		Code int
		Data []QueryPointsResponse
	}
	json.NewDecoder(w.Body).Decode(&resp)

	// Should have 2 responses (one per level)
	if len(resp.Data) != 2 {
		t.Errorf("expected 2 response items, got %d", len(resp.Data))
	}

	// Verify levels in responses
	if resp.Data[0].Level != "1m" {
		t.Errorf("expected first response level=1m, got %s", resp.Data[0].Level)
	}
	if resp.Data[1].Level != "5m" {
		t.Errorf("expected second response level=5m, got %s", resp.Data[1].Level)
	}
}
