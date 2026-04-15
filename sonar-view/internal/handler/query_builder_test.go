package handler

import (
	"testing"

	"sonar-view/pkg/aggregator"
	"sonar-view/pkg/storage"
)

func TestBuildTsdbQueryList(t *testing.T) {
	tests := []struct {
		name           string
		metricNames    []string
		level          string
		startTime      int64
		endTime        int64
		appId          string
		datasourceId   string
		extraLabels    map[string]string
		expectedCount  int
		validateLabels func(t *testing.T, queries []any)
	}{
		{
			name:          "no metrics - should create 5 queries for all agg types",
			metricNames:   []string{},
			level:         "1m",
			startTime:     1000,
			endTime:       2000,
			appId:         "",
			datasourceId:  "",
			extraLabels:   nil,
			expectedCount: 5, // 5 agg types: avg, min, max, count, last
			validateLabels: func(t *testing.T, queries []any) {
				// All 5 should have __aggregation_level__=1m
				for i, q := range queries {
					query := q.(storage.LabelQuery)
					level := query.Labels.Get(string(aggregator.AggregatedInternalLabelAggregationLevel))
					if level != "1m" {
						t.Errorf("query %d: expected level=1m, got %s", i, level)
					}
				}
			},
		},
		{
			name:          "single metric - should create 5 queries",
			metricNames:   []string{"cpu"},
			level:         "5m",
			startTime:     1000,
			endTime:       2000,
			appId:         "app1",
			datasourceId:  "ds1",
			extraLabels:   nil,
			expectedCount: 5,
			validateLabels: func(t *testing.T, queries []any) {
				// All should have __name__=cpu, __aggregation_level__=5m, app_id=app1
				for i, q := range queries {
					query := q.(storage.LabelQuery)
					name := query.Labels.Get(string(aggregator.AggregatedInternalLabelName))
					level := query.Labels.Get(string(aggregator.AggregatedInternalLabelAggregationLevel))
					appId := query.Labels.Get("app_id")

					if name != "cpu" {
						t.Errorf("query %d: expected name=cpu, got %s", i, name)
					}
					if level != "5m" {
						t.Errorf("query %d: expected level=5m, got %s", i, level)
					}
					if appId != "app1" {
						t.Errorf("query %d: expected app_id=app1, got %s", i, appId)
					}
				}
			},
		},
		{
			name:          "multiple metrics - should create 10 queries",
			metricNames:   []string{"cpu", "memory"},
			level:         "1h",
			startTime:     1000,
			endTime:       2000,
			appId:         "",
			datasourceId:  "",
			extraLabels:   nil,
			expectedCount: 10, // 2 metrics × 5 agg types
			validateLabels: func(t *testing.T, queries []any) {
				if len(queries) != 10 {
					t.Errorf("expected 10 queries, got %d", len(queries))
				}
			},
		},
		{
			name:          "with extra labels",
			metricNames:   []string{"disk"},
			level:         "30m",
			startTime:     1000,
			endTime:       2000,
			appId:         "app2",
			datasourceId:  "",
			extraLabels:   map[string]string{"host": "server1", "region": "us-east"},
			expectedCount: 5,
			validateLabels: func(t *testing.T, queries []any) {
				for i, q := range queries {
					query := q.(storage.LabelQuery)
					host := query.Labels.Get("host")
					region := query.Labels.Get("region")

					if host != "server1" {
						t.Errorf("query %d: expected host=server1, got %s", i, host)
					}
					if region != "us-east" {
						t.Errorf("query %d: expected region=us-east, got %s", i, region)
					}
				}
			},
		},
		{
			name:          "metrics with whitespace - should be trimmed",
			metricNames:   []string{"  cpu  ", "memory"},
			level:         "1m",
			startTime:     1000,
			endTime:       2000,
			appId:         "",
			datasourceId:  "",
			extraLabels:   nil,
			expectedCount: 10,
			validateLabels: func(t *testing.T, queries []any) {
				// First metric should be "cpu" (trimmed)
				if len(queries) > 0 {
					query := queries[0].(storage.LabelQuery)
					name := query.Labels.Get(string(aggregator.AggregatedInternalLabelName))
					if name != "cpu" {
						t.Errorf("expected trimmed name='cpu', got %q", name)
					}
				}
			},
		},
		{
			name:          "empty metric names in list - should be skipped",
			metricNames:   []string{"cpu", "", "memory", "  "},
			level:         "1m",
			startTime:     1000,
			endTime:       2000,
			appId:         "",
			datasourceId:  "",
			extraLabels:   nil,
			expectedCount: 10, // only cpu and memory, empty strings skipped: 2 * 5
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			queries := buildTsdbQueryList(
				tt.metricNames,
				tt.level,
				tt.startTime,
				tt.endTime,
				tt.appId,
				tt.datasourceId,
				tt.extraLabels,
			)

			if len(queries) != tt.expectedCount {
				t.Errorf("expected %d queries, got %d", tt.expectedCount, len(queries))
			}

			// Verify all queries have correct time range
			for i, q := range queries {
				if q.StartTime != tt.startTime {
					t.Errorf("query %d: expected start_time=%d, got %d", i, tt.startTime, q.StartTime)
				}
				if q.EndTime != tt.endTime {
					t.Errorf("query %d: expected end_time=%d, got %d", i, tt.endTime, q.EndTime)
				}
			}

			// Run custom validation if provided
			if tt.validateLabels != nil {
				var queryInterfaces []any
				for _, q := range queries {
					queryInterfaces = append(queryInterfaces, q)
				}
				tt.validateLabels(t, queryInterfaces)
			}
		})
	}
}

func TestBuildTsdbQueryListAggregationTypes(t *testing.T) {
	// Verify that all 5 aggregation types are included in queries
	queries := buildTsdbQueryList(
		[]string{"metric"},
		"1m",
		1000,
		2000,
		"",
		"",
		nil,
	)

	if len(queries) != 5 {
		t.Fatalf("expected 5 queries (one per agg type), got %d", len(queries))
	}

	// Collect all aggregation types found
	aggTypesSeen := make(map[string]bool)
	for _, q := range queries {
		suffix := q.Labels.Get(string(aggregator.AggregatedInternalLabelStatisticSuffix))
		aggTypesSeen[suffix] = true
	}

	// Verify all 5 types are present
	expectedTypes := map[string]bool{
		string(aggregator.AggregationTypeAvg):   false,
		string(aggregator.AggregationTypeMin):   false,
		string(aggregator.AggregationTypeMax):   false,
		string(aggregator.AggregationTypeCount): false,
		string(aggregator.AggregationTypeLast):  false,
	}

	for aggType := range expectedTypes {
		if !aggTypesSeen[aggType] {
			t.Errorf("aggregation type %s not found in queries", aggType)
		}
	}

	if len(aggTypesSeen) != 5 {
		t.Errorf("expected exactly 5 distinct agg types, got %d", len(aggTypesSeen))
	}
}
