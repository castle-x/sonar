package metricsv1

type MetricPoint struct {
	Timestamp int64             `json:"timestamp"`
	Value     float64           `json:"value"`
	Name      *string           `json:"name,omitempty"`
	Labels    map[string]string `json:"labels,omitempty"`
	LabelList []string          `json:"label_list,omitempty"`
}

func (m *MetricPoint) GetName() string {
	if m.Name != nil {
		return *m.Name
	}
	return ""
}
func (m *MetricPoint) GetTimestamp() int64           { return m.Timestamp }
func (m *MetricPoint) GetValue() float64             { return m.Value }
func (m *MetricPoint) GetLabels() map[string]string  { return m.Labels }
func (m *MetricPoint) GetLabelList() []string        { return m.LabelList }
func (m *MetricPoint) IsSetLabels() bool             { return len(m.Labels) > 0 }
func (m *MetricPoint) IsSetLabelList() bool          { return len(m.LabelList) > 0 }

type ReportMetricsRequest struct {
	AppID     string            `json:"app_id"`
	Labels    map[string]string `json:"labels,omitempty"`
	LabelList []string          `json:"label_list,omitempty"`
	Metrics   []*MetricPoint    `json:"metrics"`
}

func (r *ReportMetricsRequest) GetAppID() string                  { return r.AppID }
func (r *ReportMetricsRequest) GetLabels() map[string]string      { return r.Labels }
func (r *ReportMetricsRequest) GetLabelList() []string            { return r.LabelList }
func (r *ReportMetricsRequest) IsSetLabels() bool                 { return len(r.Labels) > 0 }
func (r *ReportMetricsRequest) IsSetLabelList() bool              { return len(r.LabelList) > 0 }

type MetricQuery struct {
	AppID      string   `json:"app_id"`
	MetricName string   `json:"metric_name,omitempty"`
	StartTime  int64    `json:"start_time"`
	EndTime    int64    `json:"end_time"`
	Labels     []string `json:"labels,omitempty"`
	Promql     *string  `json:"promql,omitempty"`
	Limit      *int64   `json:"limit,omitempty"`
}

func (q *MetricQuery) GetAppID() string      { return q.AppID }
func (q *MetricQuery) GetMetricName() string { return q.MetricName }
func (q *MetricQuery) GetStartTime() int64   { return q.StartTime }
func (q *MetricQuery) GetEndTime() int64     { return q.EndTime }
func (q *MetricQuery) GetLabels() []string   { return q.Labels }
func (q *MetricQuery) GetPromql() string {
	if q.Promql != nil {
		return *q.Promql
	}
	return ""
}
func (q *MetricQuery) GetLimit() int64 {
	if q.Limit != nil {
		return *q.Limit
	}
	return 0
}
func (q *MetricQuery) IsSetPromql() bool { return q.Promql != nil && *q.Promql != "" }

type ReportMetricResponse struct {
	Code    int32  `json:"code"`
	Message string `json:"message"`
}

type StorageStats struct {
	TotalSeries   int64  `json:"total_series"`
	DiskSize      int64  `json:"disk_size"`
	RetentionDays int32  `json:"retention_days"`
	TotalSamples  int64  `json:"total_samples"`
	TotalBlocks   int64  `json:"total_blocks"`
	MinTimeDate   string `json:"min_time_date"`
	MaxTimeDate   string `json:"max_time_date"`
	MinTime       int64  `json:"min_time"`
	MaxTime       int64  `json:"max_time"`
}

type QueryMetricsResponse struct {
	Points     []*MetricPoint `json:"points,omitempty"`
	TotalCount int64          `json:"total_count"`
	StartTime  *int64         `json:"start_time,omitempty"`
	EndTime    *int64         `json:"end_time,omitempty"`
}

func (r *QueryMetricsResponse) GetTotalCount() int64  { return r.TotalCount }
func (r *QueryMetricsResponse) GetStartTime() *int64  { return r.StartTime }
func (r *QueryMetricsResponse) GetEndTime() *int64    { return r.EndTime }

type GetStatsRequest struct {
	AppID *string `json:"app_id,omitempty"`
}

type GetStatsResponse struct {
	Stats *StorageStats `json:"stats,omitempty"`
}
