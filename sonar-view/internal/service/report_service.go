package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/prometheus/prometheus/model/labels"

	"sonar-view/internal/repo"
	"sonar-view/pkg/aggregator"
	"sonar-view/pkg/dataprocess"
	"sonar-view/pkg/storage"
)

// ReportService generates test reports from aggregated time series data
type ReportService struct {
	tsdb         storage.Storage[aggregator.AggregatedPoint]
	snapshotRepo *repo.SnapshotRepo
	chunkRepo    *repo.ChunkRepo
}

// NewReportService creates a new report service
func NewReportService(
	tsdb storage.Storage[aggregator.AggregatedPoint],
	snapshotRepo *repo.SnapshotRepo,
	chunkRepo *repo.ChunkRepo,
) *ReportService {
	return &ReportService{
		tsdb:         tsdb,
		snapshotRepo: snapshotRepo,
		chunkRepo:    chunkRepo,
	}
}

// GenerateReportReq represents a report generation request
type GenerateReportReq struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	AppID       string   `json:"app_id"`
	StartTime   int64    `json:"start_time"`   // milliseconds
	EndTime     int64    `json:"end_time"`     // milliseconds
	MetricNames []string `json:"metric_names"` // if empty, include all metrics
	Tags        []string `json:"tags"`
	Level       string   `json:"level"` // aggregation level (default "1m")
}

// ReportData represents the complete report with compressed points and summary tables
type ReportData struct {
	Points    *dataprocess.PointsResponse  `json:"points"`
	Summaries []*dataprocess.SummaryTable  `json:"summaries"`
	Metadata  map[string]interface{}      `json:"metadata"`
}

// GenerateReport generates a test report from time series data in a given time range
// It queries the TSDB for aggregated data, compresses it, generates summary tables,
// and stores the result as a snapshot
func (s *ReportService) GenerateReport(ctx context.Context, req *GenerateReportReq) (string, error) {
	if req.Name == "" {
		return "", fmt.Errorf("report name is required")
	}
	if req.StartTime >= req.EndTime {
		return "", fmt.Errorf("start_time must be less than end_time")
	}
	if req.Level == "" {
		req.Level = "1m"
	}

	startMs := req.StartTime
	endMs := req.EndTime

	log.Printf("[INFO] report: generating report '%s' for %s (level=%s, %d-%d)",
		req.Name, req.AppID, req.Level, startMs, endMs)

	// Build queries for the specified metrics and aggregation level
	queries := buildReportQueries(req.AppID, req.Level, startMs, endMs, req.MetricNames)
	if len(queries) == 0 {
		return "", fmt.Errorf("no queries built for report")
	}

	// Execute queries in parallel and collect all points
	var allPoints []aggregator.AggregatedPoint
	for _, query := range queries {
		pts, err := s.tsdb.QueryByLabels(ctx, &query)
		if err != nil {
			log.Printf("[WARN] report: query failed: %v", err)
			continue
		}
		allPoints = append(allPoints, pts...)
	}

	if len(allPoints) == 0 {
		log.Printf("[WARN] report: no data found for report")
	}

	// Compress the data
	compressedData := dataprocess.BuildCompressedData(allPoints)

	// Filter to requested metrics if specified
	if len(req.MetricNames) > 0 {
		compressedData = dataprocess.FilterCompressedData(compressedData, req.MetricNames)
	}

	// Generate summary tables
	summaryTables := dataprocess.GenerateSummaryTables(compressedData)

	// Create report data structure
	reportData := &ReportData{
		Points:    compressedData,
		Summaries: summaryTables,
		Metadata: map[string]interface{}{
			"app_id":     req.AppID,
			"level":      req.Level,
			"start_time": startMs,
			"end_time":   endMs,
			"metrics":    dataprocess.CountMetrics(compressedData),
			"points":     dataprocess.CountPoints(compressedData),
			"generated":  time.Now().Unix(),
		},
	}

	// Marshal report data to JSON
	reportJSON, err := json.Marshal(reportData)
	if err != nil {
		return "", fmt.Errorf("marshal report data: %w", err)
	}

	// Create snapshot with compressed data
	snapshotReq := &CreateSnapshotReq{
		Name:        req.Name,
		Description: req.Description,
		StartTime:   startMs,
		EndTime:     endMs,
		AppID:       req.AppID,
		Tags:        req.Tags,
		MetricsJSON: reportJSON,
	}

	snapshotService := NewSnapshotService(s.snapshotRepo, s.chunkRepo)
	snapshot, err := snapshotService.Create(ctx, snapshotReq)
	if err != nil {
		return "", fmt.Errorf("create snapshot: %w", err)
	}

	log.Printf("[INFO] report: generated report '%s' (id=%s, size=%d bytes)",
		req.Name, snapshot.ID, snapshot.TotalBytes)

	return snapshot.ID, nil
}

// GetReport retrieves a generated report by ID
func (s *ReportService) GetReport(ctx context.Context, reportID string) (*ReportData, error) {
	meta, err := s.snapshotRepo.Get(ctx, reportID)
	if err != nil {
		return nil, err
	}
	if meta == nil {
		return nil, fmt.Errorf("report not found: %s", reportID)
	}

	// Load the compressed JSON data
	jsonData, err := s.chunkRepo.Load(ctx, reportID)
	if err != nil {
		return nil, fmt.Errorf("load report data: %w", err)
	}

	var reportData ReportData
	if err := json.Unmarshal(jsonData, &reportData); err != nil {
		return nil, fmt.Errorf("unmarshal report data: %w", err)
	}

	return &reportData, nil
}

// ListReports lists all generated reports for an app
func (s *ReportService) ListReports(ctx context.Context, appID string) ([]*SnapshotWithSize, error) {
	metas, err := s.snapshotRepo.List(ctx)
	if err != nil {
		return nil, err
	}

	results := make([]*SnapshotWithSize, 0)
	for _, m := range metas {
		if appID == "" || m.AppID == appID {
			results = append(results, &SnapshotWithSize{
				ID:          m.ID,
				Name:        m.Name,
				Description: m.Description,
				StartTime:   m.StartTime,
				EndTime:     m.EndTime,
				AppID:       m.AppID,
				Tags:        m.Tags,
				TotalBytes:  m.TotalBytes,
				ChunkCount:  m.ChunkCount,
				CreatedAt:   m.CreatedAt,
			})
		}
	}
	return results, nil
}

// DeleteReport deletes a generated report
func (s *ReportService) DeleteReport(ctx context.Context, reportID string) error {
	if err := s.chunkRepo.Delete(ctx, reportID); err != nil {
		return fmt.Errorf("delete chunks: %w", err)
	}
	if err := s.snapshotRepo.Delete(ctx, reportID); err != nil {
		return fmt.Errorf("delete snapshot: %w", err)
	}
	return nil
}

// ExportReportAsCSV exports a report as CSV format
func (s *ReportService) ExportReportAsCSV(ctx context.Context, reportID string) ([]byte, error) {
	reportData, err := s.GetReport(ctx, reportID)
	if err != nil {
		return nil, err
	}

	var buf bytes.Buffer

	// Write summary tables as CSV sections
	for i, table := range reportData.Summaries {
		if i > 0 {
			buf.WriteString("\n\n")
		}

		// Section header
		buf.WriteString(fmt.Sprintf("# %s\n", table.Name))

		// Table rows
		for _, row := range table.Table {
			for j, cell := range row {
				if j > 0 {
					buf.WriteString(",")
				}
				// Simple CSV escaping
				if bytes.ContainsAny([]byte(cell), ",\"\n") {
					buf.WriteString("\"")
					buf.WriteString(escapeCSV(cell))
					buf.WriteString("\"")
				} else {
					buf.WriteString(cell)
				}
			}
			buf.WriteString("\n")
		}
	}

	return buf.Bytes(), nil
}

// buildReportQueries builds TSDB queries for report generation
func buildReportQueries(
	appID string,
	level string,
	startMs int64,
	endMs int64,
	metricNames []string,
) []storage.LabelQuery {
	queries := make([]storage.LabelQuery, 0)

	// If no specific metrics requested, query all metrics at this level
	if len(metricNames) == 0 {
		for _, aggType := range aggregator.AggregationTypeList {
			lq := buildReportBaseQuery(appID, level, string(aggType), "", startMs, endMs)
			queries = append(queries, lq)
		}
		return queries
	}

	// For each metric, query all aggregation types
	for _, metricName := range metricNames {
		for _, aggType := range aggregator.AggregationTypeList {
			lq := buildReportBaseQuery(appID, level, string(aggType), metricName, startMs, endMs)
			queries = append(queries, lq)
		}
	}

	return queries
}

// buildReportBaseQuery creates a single LabelQuery for report generation
func buildReportBaseQuery(
	appID string,
	level string,
	aggType string,
	metricName string,
	startMs int64,
	endMs int64,
) storage.LabelQuery {
	b := labels.NewBuilder(nil)
	b.Set(string(aggregator.AggregatedInternalLabelAggregationLevel), level)
	b.Set(string(aggregator.AggregatedInternalLabelStatisticSuffix), aggType)
	if appID != "" {
		b.Set("app_id", appID)
	}

	return storage.LabelQuery{
		MetricName: metricName,
		Labels:     b.Labels(),
		StartTime:  startMs,
		EndTime:    endMs,
	}
}

// escapeCSV escapes double quotes in a CSV field
func escapeCSV(s string) string {
	return string(bytes.ReplaceAll([]byte(s), []byte("\""), []byte("\"\"")))
}

// SnapshotWithSize represents a snapshot with size information
type SnapshotWithSize struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	StartTime   int64    `json:"start_time"`
	EndTime     int64    `json:"end_time"`
	AppID       string   `json:"app_id"`
	Tags        []string `json:"tags"`
	TotalBytes  int64    `json:"total_bytes"`
	ChunkCount  int      `json:"chunk_count"`
	CreatedAt   int64    `json:"created_at"`
}
