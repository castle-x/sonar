package handler

import (
	"strings"

	"sonar-view/pkg/aggregator"
	"sonar-view/pkg/storage"

	"github.com/prometheus/prometheus/model/labels"
)

// newLabelBuilder returns a fresh label builder with empty base labels.
func newLabelBuilder() *labels.Builder {
	return labels.NewBuilder(nil)
}

// buildTsdbQueryList constructs a list of LabelQuery objects for batch execution against TSDB.
//
// For each unique metric name, it creates queries for all 5 aggregation types (avg, min, max, count, last).
// This enables efficient parallel querying of compressed data.
//
// Parameters:
//   - metricNames: list of metric names to query (if empty, queries all metrics at the level)
//   - level: aggregation level (e.g., "1m", "5m", "1h")
//   - startTime: query start time in milliseconds
//   - endTime: query end time in milliseconds
//   - appId: optional app_id label filter
//   - datasourceId: optional datasource_id filter
//   - extraLabels: additional label filters (key=value pairs)
//
// Returns:
//   - []storage.LabelQuery: list of queries ready for TSDB execution
func buildTsdbQueryList(
	metricNames []string,
	level string,
	startTime int64,
	endTime int64,
	appId string,
	datasourceId string,
	extraLabels map[string]string,
) []storage.LabelQuery {
	queries := make([]storage.LabelQuery, 0)

	// If no specific metrics requested, create a single query for all metrics at this level
	if len(metricNames) == 0 {
		for _, aggType := range aggregator.AggregationTypeList {
			builder := labels.NewBuilder(nil)
			builder.Set(string(aggregator.AggregatedInternalLabelAggregationLevel), level)
			builder.Set(string(aggregator.AggregatedInternalLabelStatisticSuffix), string(aggType))

			if appId != "" {
				builder.Set("app_id", appId)
			}
			if datasourceId != "" {
				builder.Set(string(aggregator.AggregatedInternalLabelDatasourceId), datasourceId)
			}
			for k, v := range extraLabels {
				builder.Set(k, v)
			}

			queries = append(queries, storage.LabelQuery{
				Labels:    builder.Labels(),
				StartTime: startTime,
				EndTime:   endTime,
			})
		}
		return queries
	}

	// For each metric name, create queries for all aggregation types
	for _, metricName := range metricNames {
		if strings.TrimSpace(metricName) == "" {
			continue
		}

		for _, aggType := range aggregator.AggregationTypeList {
			builder := labels.NewBuilder(nil)
			builder.Set(string(aggregator.AggregatedInternalLabelName), strings.TrimSpace(metricName))
			builder.Set(string(aggregator.AggregatedInternalLabelAggregationLevel), level)
			builder.Set(string(aggregator.AggregatedInternalLabelStatisticSuffix), string(aggType))

			if appId != "" {
				builder.Set("app_id", appId)
			}
			if datasourceId != "" {
				builder.Set(string(aggregator.AggregatedInternalLabelDatasourceId), datasourceId)
			}
			for k, v := range extraLabels {
				builder.Set(k, v)
			}

			queries = append(queries, storage.LabelQuery{
				Labels:    builder.Labels(),
				StartTime: startTime,
				EndTime:   endTime,
			})
		}
	}

	return queries
}
