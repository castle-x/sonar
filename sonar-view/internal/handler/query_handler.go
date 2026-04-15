package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"

	"sonar-view/pkg/aggregator"
	"sonar-view/pkg/dataprocess"
	"sonar-view/pkg/storage"

	"github.com/prometheus/prometheus/model/labels"
)

// QueryFilter - filter for metric name and labels in V2 queries
type QueryFilter struct {
	Name   string   `json:"name,omitempty"`
	Labels []string `json:"labels,omitempty"` // [key1, val1, key2, val2, ...]
}

// QueryPointsV2Request - monitor_hub compatible request format
type QueryPointsV2Request struct {
	DatasourceID     string        `json:"datasource_id"`
	Levels           []string      `json:"levels"`
	StartTime        *int64        `json:"start_time"` // ms
	EndTime          *int64        `json:"end_time"`   // ms
	Filters          []QueryFilter `json:"filters"`
	AggregationTypes []string      `json:"aggregation_types"`
	Limit            *int32        `json:"limit"`
}

// QueryPointsV2Response - monitor_hub compatible response: {p: PointsResponse, t: SummaryTable[]}
type QueryPointsV2Response struct {
	P *dataprocess.PointsResponse `json:"p"`
	T []*dataprocess.SummaryTable `json:"t"`
}

// QueryPointsHandler implements the QueryPoints API endpoint with compression.
type QueryPointsHandler struct {
	tsdb storage.Storage[aggregator.AggregatedPoint]
}

// NewQueryPointsHandler creates a new query points handler.
func NewQueryPointsHandler(tsdb storage.Storage[aggregator.AggregatedPoint]) *QueryPointsHandler {
	return &QueryPointsHandler{tsdb: tsdb}
}

// QueryPointsRequest represents the query request parameters.
type QueryPointsRequest struct {
	AppId       string
	MetricNames []string
	StartTime   int64
	EndTime     int64
	Level       string
	ExtraLabels map[string]string
}

// QueryPointsResponse represents the compressed response format.
type QueryPointsResponse struct {
	Metrics *dataprocess.PointsResponse `json:"metrics"`
	Level   string                       `json:"level"`
	StartT  int64                        `json:"start_time"`
	EndT    int64                        `json:"end_time"`
}

// QueryPoints handles GET /api/v1/aggregation/metrics
// Query parameters:
//   - app_id (optional): filter by app_id label
//   - metric_names (optional): comma-separated metric names; if empty, queries all metrics
//   - start_time (required): query start time in milliseconds
//   - end_time (required): query end time in milliseconds
//   - level (optional, default "1m"): aggregation level
//   - labels (optional): comma-separated key=value pairs for extra label filters
//
// Returns compressed PointsResponse format:
//   {
//     "code": 0,
//     "data": {
//       "metrics": { "k": [...], "v": [...] },
//       "level": "1m",
//       "start_time": 1234567890,
//       "end_time": 1234567900
//     }
//   }
func (h *QueryPointsHandler) QueryPoints(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
	q := r.URL.Query()

	startMs, err := strconv.ParseInt(q.Get("start_time"), 10, 64)
	if err != nil || startMs <= 0 {
		writeError(w, http.StatusBadRequest, "start_time is required (positive ms timestamp)")
		return
	}
	endMs, err := strconv.ParseInt(q.Get("end_time"), 10, 64)
	if err != nil || endMs <= 0 {
		writeError(w, http.StatusBadRequest, "end_time is required (positive ms timestamp)")
		return
	}

	if startMs >= endMs {
		writeError(w, http.StatusBadRequest, "start_time must be less than end_time")
		return
	}

	level := q.Get("level")
	if level == "" {
		level = "1m"
	}

	appId := q.Get("app_id")

	// Parse metric names
	var metricNames []string
	if metricNamesStr := q.Get("metric_names"); metricNamesStr != "" {
		for _, n := range strings.Split(metricNamesStr, ",") {
			n = strings.TrimSpace(n)
			if n != "" {
				metricNames = append(metricNames, n)
			}
		}
	}

	// Parse extra labels
	extraLabels := make(map[string]string)
	if labelsStr := q.Get("labels"); labelsStr != "" {
		for _, pair := range strings.Split(labelsStr, ",") {
			kv := strings.SplitN(strings.TrimSpace(pair), "=", 2)
			if len(kv) == 2 {
				extraLabels[kv[0]] = kv[1]
			}
		}
	}

	// Build TSDB queries
	queries := buildTsdbQueryList(metricNames, level, startMs, endMs, appId, "", extraLabels)
	if len(queries) == 0 {
		writeJSON(w, http.StatusOK, &QueryPointsResponse{
			Metrics: &dataprocess.PointsResponse{K: []string{}, V: [][][]dataprocess.RawData{}},
			Level:   level,
			StartT:  startMs,
			EndT:    endMs,
		})
		return
	}

	// Execute queries in parallel and collect results
	var allPoints []aggregator.AggregatedPoint
	for _, query := range queries {
		pts, err := h.tsdb.QueryByLabels(r.Context(), &query)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "query failed: "+err.Error())
			return
		}
		allPoints = append(allPoints, pts...)
	}

	// Compress data using BuildCompressedData
	compressedData := dataprocess.BuildCompressedData(allPoints)

	// Filter to requested metrics if specified
	if len(metricNames) > 0 {
		compressedData = dataprocess.FilterCompressedData(compressedData, metricNames)
	}

	writeJSON(w, http.StatusOK, &QueryPointsResponse{
		Metrics: compressedData,
		Level:   level,
		StartT:  startMs,
		EndT:    endMs,
	})
}

// QueryPointsBatch handles batch queries with multiple levels
// POST /api/v1/aggregation/metrics/batch
// Body: {
//   "app_id": "app1",
//   "metric_names": ["cpu", "memory"],
//   "time_range": {"start": 1234567890, "end": 1234567900},
//   "levels": ["1m", "5m"]
// }
//
// Returns array of PointsResponse for each level
func (h *QueryPointsHandler) QueryPointsBatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "only POST allowed")
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to read body: "+err.Error())
		return
	}

	var batchReq struct {
		AppId       string   `json:"app_id"`
		MetricNames []string `json:"metric_names"`
		TimeRange   struct {
			Start int64 `json:"start"`
			End   int64 `json:"end"`
		} `json:"time_range"`
		Levels []string `json:"levels"`
	}

	if err := json.Unmarshal(body, &batchReq); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json: "+err.Error())
		return
	}

	if batchReq.TimeRange.Start <= 0 || batchReq.TimeRange.End <= 0 {
		writeError(w, http.StatusBadRequest, "time_range.start and time_range.end required")
		return
	}

	if batchReq.TimeRange.Start >= batchReq.TimeRange.End {
		writeError(w, http.StatusBadRequest, "time_range.start must be less than time_range.end")
		return
	}

	if len(batchReq.Levels) == 0 {
		batchReq.Levels = []string{"1m"}
	}

	results := make([]QueryPointsResponse, 0, len(batchReq.Levels))

	for _, level := range batchReq.Levels {
		queries := buildTsdbQueryList(
			batchReq.MetricNames,
			level,
			batchReq.TimeRange.Start,
			batchReq.TimeRange.End,
			batchReq.AppId,
			"",
			nil,
		)

		var allPoints []aggregator.AggregatedPoint
		for _, query := range queries {
			pts, err := h.tsdb.QueryByLabels(r.Context(), &query)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "query failed for level "+level+": "+err.Error())
				return
			}
			allPoints = append(allPoints, pts...)
		}

		compressedData := dataprocess.BuildCompressedData(allPoints)
		if len(batchReq.MetricNames) > 0 {
			compressedData = dataprocess.FilterCompressedData(compressedData, batchReq.MetricNames)
		}

		results = append(results, QueryPointsResponse{
			Metrics: compressedData,
			Level:   level,
			StartT:  batchReq.TimeRange.Start,
			EndT:    batchReq.TimeRange.End,
		})
	}

	writeJSON(w, http.StatusOK, results)
}

// QueryPointsV2 handles POST /api/v1/points/query
// monitor_hub compatible format with compressed {p, t} response.
//
// Request body:
//
//	{
//	  "datasource_id": "...",
//	  "levels": ["1m"],
//	  "start_time": 1234567890000,
//	  "end_time":   1234567950000,
//	  "filters": [{"name": "cpu_usage"}, {"name": "mem_used", "labels": ["host", "server1"]}],
//	  "aggregation_types": ["avg", "min", "max"],
//	  "limit": 1000
//	}
//
// Response:
//
//	{"code":0,"data":{"p":{"k":[...],"v":[[[...]]]}, "t":[]}}
func (h *QueryPointsHandler) QueryPointsV2(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to read body: "+err.Error())
		return
	}

	var req QueryPointsV2Request
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json: "+err.Error())
		return
	}

	if req.StartTime == nil || *req.StartTime <= 0 {
		writeError(w, http.StatusBadRequest, "start_time is required (positive ms timestamp)")
		return
	}
	if req.EndTime == nil || *req.EndTime <= 0 {
		writeError(w, http.StatusBadRequest, "end_time is required (positive ms timestamp)")
		return
	}
	if *req.StartTime >= *req.EndTime {
		writeError(w, http.StatusBadRequest, "start_time must be less than end_time")
		return
	}

	startMs := *req.StartTime
	endMs := *req.EndTime

	// Default level to "1m"
	if len(req.Levels) == 0 {
		req.Levels = []string{"1m"}
	}

	// Resolve aggregation types
	aggTypes := resolveAggTypes(req.AggregationTypes)

	// Build limit
	var limit int
	if req.Limit != nil && *req.Limit > 0 {
		limit = int(*req.Limit)
	}

	// Build and execute all queries
	var allPoints []aggregator.AggregatedPoint
	for _, level := range req.Levels {
		queries := buildTsdbQueryListV2(req.DatasourceID, level, startMs, endMs, req.Filters, aggTypes, limit)
		for _, query := range queries {
			pts, err := h.tsdb.QueryByLabels(r.Context(), &query)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "query failed: "+err.Error())
				return
			}
			allPoints = append(allPoints, pts...)
		}
	}

	compressedData := dataprocess.BuildCompressedData(allPoints)

	// Generate summary tables for the response
	summaryTables := dataprocess.GenerateSummaryTables(compressedData)

	writeJSON(w, http.StatusOK, &QueryPointsV2Response{
		P: compressedData,
		T: summaryTables,
	})
}

// resolveAggTypes converts string list to AggregationType list, defaulting to all types.
func resolveAggTypes(types []string) []aggregator.AggregationType {
	if len(types) == 0 {
		return aggregator.AggregationTypeList
	}
	result := make([]aggregator.AggregationType, 0, len(types))
	for _, t := range types {
		switch strings.ToLower(t) {
		case "avg":
			result = append(result, aggregator.AggregationTypeAvg)
		case "min":
			result = append(result, aggregator.AggregationTypeMin)
		case "max":
			result = append(result, aggregator.AggregationTypeMax)
		case "count":
			result = append(result, aggregator.AggregationTypeCount)
		case "last":
			result = append(result, aggregator.AggregationTypeLast)
		}
	}
	if len(result) == 0 {
		return aggregator.AggregationTypeList
	}
	return result
}

// buildTsdbQueryListV2 builds queries for the V2 endpoint (monitor_hub compatible).
func buildTsdbQueryListV2(
	datasourceID string,
	level string,
	startTime int64,
	endTime int64,
	filters []QueryFilter,
	aggTypes []aggregator.AggregationType,
	limit int,
) []storage.LabelQuery {
	queries := make([]storage.LabelQuery, 0)

	if len(filters) == 0 {
		// No filters: query all metrics for each agg type
		for _, aggType := range aggTypes {
			lq := buildBaseQuery(datasourceID, level, string(aggType), "", nil, startTime, endTime, limit)
			queries = append(queries, lq)
		}
		return queries
	}

	// Per-filter queries
	for _, filter := range filters {
		extraLabels := parseFilterLabels(filter.Labels)
		for _, aggType := range aggTypes {
			lq := buildBaseQuery(datasourceID, level, string(aggType), filter.Name, extraLabels, startTime, endTime, limit)
			queries = append(queries, lq)
		}
	}

	return queries
}

// buildBaseQuery creates one LabelQuery with the internal label set.
func buildBaseQuery(
	datasourceID string,
	level string,
	aggType string,
	metricName string,
	extraLabels map[string]string,
	startTime int64,
	endTime int64,
	limit int,
) storage.LabelQuery {
	b := labels.NewBuilder(nil)
	b.Set(string(aggregator.AggregatedInternalLabelAggregationLevel), level)
	b.Set(string(aggregator.AggregatedInternalLabelStatisticSuffix), aggType)
	if datasourceID != "" {
		b.Set(string(aggregator.AggregatedInternalLabelDatasourceId), datasourceID)
	}
	for k, v := range extraLabels {
		b.Set(k, v)
	}
	return storage.LabelQuery{
		MetricName: metricName,
		Labels:     b.Labels(),
		StartTime:  startTime,
		EndTime:    endTime,
		Limit:      limit,
	}
}

// parseFilterLabels converts [k1, v1, k2, v2, ...] flat slice into a map.
func parseFilterLabels(labelPairs []string) map[string]string {
	if len(labelPairs) < 2 {
		return nil
	}
	m := make(map[string]string, len(labelPairs)/2)
	for i := 0; i+1 < len(labelPairs); i += 2 {
		m[labelPairs[i]] = labelPairs[i+1]
	}
	return m
}
