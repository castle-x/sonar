package aggregator

import (
	"encoding/json"
	"sonar-view/pkg/storage"
	"time"
)

type UnixMilliTime time.Time

func (t UnixMilliTime) MarshalJSON() ([]byte, error) {
	return json.Marshal(time.Time(t).UnixMilli())
}

func (t *UnixMilliTime) UnmarshalJSON(data []byte) error {
	var timestamp int64
	if err := json.Unmarshal(data, &timestamp); err != nil {
		return err
	}
	*t = UnixMilliTime(time.UnixMilli(timestamp))
	return nil
}

func (t UnixMilliTime) Time() time.Time {
	return time.Time(t)
}

func (t UnixMilliTime) String() string {
	return time.Time(t).Format(time.RFC3339)
}

type AggregatedInternalLabel string

const (
	AggregatedInternalLabelName             AggregatedInternalLabel = "__name__"
	AggregatedInternalLabelAggregationLevel AggregatedInternalLabel = "__aggregation_level__"
	AggregatedInternalLabelDataStatus       AggregatedInternalLabel = "__data_status__"
	AggregatedInternalLabelDataScore        AggregatedInternalLabel = "__data_score__"
	AggregatedInternalLabelStatisticSuffix  AggregatedInternalLabel = "__statistic_suffix__"
	AggregatedInternalLabelDatasourceId     AggregatedInternalLabel = "__datasource_id__"
)

type AggregationType string

func (a AggregationType) Index() int {
	switch a {
	case AggregationTypeAvg:
		return 0
	case AggregationTypeMin:
		return 1
	case AggregationTypeMax:
		return 2
	case AggregationTypeCount:
		return 3
	case AggregationTypeLast:
		return 4
	default:
		return 0
	}
}

const (
	AggregationTypeAvg   AggregationType = "avg"
	AggregationTypeMin   AggregationType = "min"
	AggregationTypeMax   AggregationType = "max"
	AggregationTypeCount AggregationType = "count"
	AggregationTypeLast  AggregationType = "last"
)

var AggregationTypeList = []AggregationType{
	AggregationTypeAvg,
	AggregationTypeMin,
	AggregationTypeMax,
	AggregationTypeCount,
	AggregationTypeLast,
}

var AggregationTypeStringList = []string{
	string(AggregationTypeAvg),
	string(AggregationTypeMin),
	string(AggregationTypeMax),
	string(AggregationTypeCount),
	string(AggregationTypeLast),
}

type AggregatedPoint struct {
	DatasourceId    string          `json:"datasource_id"`
	Name            string          `json:"name"`
	Labels          storage.Labels  `json:"labels"`
	Level           string          `json:"level"`
	Timestamp       UnixMilliTime   `json:"timestamp"`
	Date            string          `json:"date"`
	AggregationType AggregationType `json:"aggregation_type"`
	Value           float64         `json:"value"`
	Quality         DataQuality     `json:"quality"`
}

type ValueStats struct {
	Avg  float64 `json:"avg,omitempty"`
	Min  float64 `json:"min,omitempty"`
	Max  float64 `json:"max,omitempty"`
	Sum  float64 `json:"sum,omitempty"`
	Last float64 `json:"last,omitempty"`
	P50  float64 `json:"p50,omitempty"`
	P95  float64 `json:"p95,omitempty"`
	P99  float64 `json:"p99,omitempty"`
}

type RawMetricPoint struct {
	DatasourceId string         `json:"datasource_id"`
	Name         string         `json:"name"`
	Labels       storage.Labels `json:"labels"`
	Timestamp    int64          `json:"timestamp"`
	Value        float64        `json:"value"`
}

type QueryRequest struct {
	Level      string
	MetricName string
	Labels     storage.Labels
	StartTime  time.Time
	EndTime    time.Time
}

type QueryResult struct {
	Points     []AggregatedPoint
	TotalCount int64
}
