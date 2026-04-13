package aggregator

import (
	"encoding/json"
	"monitor_hub/pkg/storage"
	"time"
)

// ============================================
// 自定义时间类型
// ============================================

// UnixMilliTime 以 Unix 毫秒时间戳序列化的时间类型
type UnixMilliTime time.Time

// MarshalJSON 实现 json.Marshaler 接口，序列化为 Unix 毫秒时间戳
func (t UnixMilliTime) MarshalJSON() ([]byte, error) {
	timestamp := time.Time(t).UnixMilli()
	return json.Marshal(timestamp)
}

// UnmarshalJSON 实现 json.Unmarshaler 接口，从 Unix 毫秒时间戳反序列化
func (t *UnixMilliTime) UnmarshalJSON(data []byte) error {
	var timestamp int64
	if err := json.Unmarshal(data, &timestamp); err != nil {
		return err
	}
	*t = UnixMilliTime(time.UnixMilli(timestamp))
	return nil
}

// Time 转换为 time.Time
func (t UnixMilliTime) Time() time.Time {
	return time.Time(t)
}

// String 实现 Stringer 接口
func (t UnixMilliTime) String() string {
	return time.Time(t).Format(time.RFC3339)
}

// ============================================
// 聚合数据类型
// ============================================

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
	//case AggregationTypeSum:
	//	return 3
	case AggregationTypeCount:
		return 3
	case AggregationTypeLast:
		return 4
	default:
		return 0
	}
}

const (
	AggregationTypeAvg AggregationType = "avg"
	AggregationTypeMin AggregationType = "min"
	AggregationTypeMax AggregationType = "max"
	// AggregationTypeSum AggregationType = "sum"
	AggregationTypeCount AggregationType = "count" // 聚合这段时间数据点的数量
	AggregationTypeLast  AggregationType = "last"
)

var AggregationTypeList = []AggregationType{
	AggregationTypeAvg,
	AggregationTypeMin,
	AggregationTypeMax,
	// AggregationTypeSum,
	AggregationTypeCount,
	AggregationTypeLast,  
}
var AggregationTypeStringList = []string{
	string(AggregationTypeAvg),
	string(AggregationTypeMin),
	string(AggregationTypeMax),
	// AggregationTypeSum,
	string(AggregationTypeCount),
	string(AggregationTypeLast),  
}
// AggregatedPoint 聚合后的数据点
type AggregatedPoint struct {
	// 数据源标识
	DatasourceId string `json:"datasource_id"`

	// ===== 指标标识 =====
	Name   string         `json:"name"`   // 指标名称
	Labels storage.Labels `json:"labels"` // 标签集合

	// ===== 时间和级别 =====
	Level     string        `json:"level"`     // 聚合级别: 15s/30s/1m/5m/1h/6h/1d
	Timestamp UnixMilliTime `json:"timestamp"` // 时间戳（Unix 毫秒，对齐到级别边界）
	Date      string        `json:"date"`      // 日期(调试查看使用)

	// 聚合类型
	AggregationType AggregationType `json:"aggregation_type"` // 聚合类型: avg/min/max/count/last

	Value float64 `json:"value"` // 聚合后的值

	// ===== 质量标记 =====
	Quality DataQuality `json:"quality"`
}

// ValueStats 统计值
type ValueStats struct {
	Avg  float64 `json:"avg,omitempty"`  // 平均值
	Min  float64 `json:"min,omitempty"`  // 最小值
	Max  float64 `json:"max,omitempty"`  // 最大值
	Sum  float64 `json:"sum,omitempty"`  // 总和
	Last float64 `json:"last,omitempty"` // 最后一个值

	// 可选的百分位数（暂未实现）
	P50 float64 `json:"p50,omitempty"` // 中位数
	P95 float64 `json:"p95,omitempty"` // 95分位
	P99 float64 `json:"p99,omitempty"` // 99分位
}

// RawMetricPoint 原始指标数据点（从 Pushgateway 采集）
type RawMetricPoint struct {
	DatasourceId string         `json:"datasource_id"`
	Name         string         `json:"name"`
	Labels       storage.Labels `json:"labels"`
	Timestamp    int64          `json:"timestamp"` // Unix 毫秒
	Value        float64        `json:"value"`
}

// ============================================
// 查询请求和结果
// ============================================

// QueryRequest 查询请求
type QueryRequest struct {
	// Level 聚合级别
	Level string

	// MetricName 指标名称（可选）
	MetricName string

	// Labels 标签过滤器
	Labels storage.Labels

	// StartTime 开始时间
	StartTime time.Time

	// EndTime 结束时间
	EndTime time.Time
}

// QueryResult 查询结果
type QueryResult struct {
	Points     []AggregatedPoint
	TotalCount int64
}
