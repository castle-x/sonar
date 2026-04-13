package aggregator

import (
	"fmt"
	"strconv"
	"time"

	"monitor_hub/pkg/storage"
	"github.com/prometheus/prometheus/model/labels"
)

// ============================================
// AggregatedPoint Serializer
// ============================================

// AggregatedPointSerializer AggregatedPoint 的序列化器
//
// 实现 storage.Serializer[AggregatedPoint] 接口
type AggregatedPointSerializer struct{}

// NewAggregatedPointSerializer 创建序列化器
func NewAggregatedPointSerializer() storage.Serializer[AggregatedPoint] {
	return &AggregatedPointSerializer{}
}

// ToLabels 实现 Serializer 接口
//
// 将 AggregatedPoint 转换为 Prometheus Labels
// 策略：使用多个指标名称存储统计值
func (s *AggregatedPointSerializer) ToLabels(point AggregatedPoint) storage.Labels {
	builder:=labels.NewBuilder(point.Labels)
	// 设置指标名称
	builder.Set("__name__", point.Name)
	// 添加统计类型
	builder.Set(string(AggregatedInternalLabelStatisticSuffix), string(point.AggregationType))
	// 添加数据源ID标签（内部标签）
	builder.Set(string(AggregatedInternalLabelDatasourceId), point.DatasourceId)
	// 添加聚合级别标签（内部标签）
	builder.Set(string(AggregatedInternalLabelAggregationLevel), point.Level)

	// 添加数据质量标签（内部标签）
	builder.Set(string(AggregatedInternalLabelDataStatus), string(point.Quality.Status))
	builder.Set(string(AggregatedInternalLabelDataScore), fmt.Sprintf("%.0f", point.Quality.Score))
	// 合并标签
	return builder.Labels()
}

// ToTimestamp 实现 Serializer 接口
func (s *AggregatedPointSerializer) ToTimestamp(point AggregatedPoint) int64 {
	return point.Timestamp.Time().UnixMilli()
}

// ToValue 实现 Serializer 接口
//
// 默认使用 Avg 作为主要值
func (s *AggregatedPointSerializer) ToValue(point AggregatedPoint) float64 {
	return point.Value
}

// FromDataPoint 实现 Serializer 接口 - 反序列化
// 从 TSDB 查询结果转换回 AggregatedPoint
func (s *AggregatedPointSerializer) FromDataPoint(dp *storage.DataPoint) AggregatedPoint {
	// 提取业务标签（过滤掉内部标签）
	builder:=labels.NewBuilder(dp.Labels)
	var level string
	var status DataStatus
	var score float64
	var aggregationType AggregationType
	var datasourceId string
	builder.Range(func(l labels.Label) {
		switch AggregatedInternalLabel(l.Name) {
		case AggregatedInternalLabelName:
			builder.Del(l.Name)
		case AggregatedInternalLabelAggregationLevel:
			level = l.Value
			builder.Del(string(AggregatedInternalLabelAggregationLevel))
		case AggregatedInternalLabelDataStatus:
			status = DataStatus(l.Value)
			builder.Del(l.Name)
		case AggregatedInternalLabelDataScore:
			score, _ = strconv.ParseFloat(l.Value, 64)
			builder.Del(l.Name)
		case AggregatedInternalLabelStatisticSuffix:
			aggregationType = AggregationType(l.Value)
			builder.Del(l.Name)
		case AggregatedInternalLabelDatasourceId:
			datasourceId = l.Value
			builder.Del(l.Name)
		}
	})

	return AggregatedPoint{
		Name:      dp.MetricName, // TSDB 中的 __name__ 是基础名称（不带 _avg 后缀）
		Labels:    builder.Labels(),
		Level:     level,
		DatasourceId: datasourceId,
		Timestamp: UnixMilliTime(time.UnixMilli(dp.Timestamp)),
		Date:      time.UnixMilli(dp.Timestamp).Format(time.DateTime),
		Quality: DataQuality{
			Status: status,
			Score:  score,
		},
		AggregationType: aggregationType,
		Value: dp.Value,
	}
}

// ============================================
// 扩展：存储所有统计值
// ============================================

// ToMultiplePoints 将 AggregatedPoint 转换为多个存储点
//
// 每个统计值（Avg, Min, Max, Sum, Last）作为独立的指标存储
//
// 返回:
//   - []storage-compatible point: 多个可存储的点
//
// 注意：这个方法不是 Serializer 接口的一部分，
// 而是用于需要存储所有统计值的场景
/* func ToMultiplePoints(point AggregatedPoint) []AggregatedPoint {
	base := point
	base.Labels = copyLabels(point.Labels)

	points := []AggregatedPoint{
		// Avg
		{
			Name:      point.Name + "_avg",
			Labels:    base.Labels,
			Level:     point.Level,
			Timestamp: point.Timestamp,
			Stats:     ValueStats{Avg: point.Stats.Avg},
			Quality:   point.Quality,
		},
		// Min
		{
			Name:      point.Name + "_min",
			Labels:    base.Labels,
			Level:     point.Level,
			Timestamp: point.Timestamp,
			Stats:     ValueStats{Avg: point.Stats.Min},
			Quality:   point.Quality,
		},
		// Max
		{
			Name:      point.Name + "_max",
			Labels:    base.Labels,
			Level:     point.Level,
			Timestamp: point.Timestamp,
			Stats:     ValueStats{Avg: point.Stats.Max},
			Quality:   point.Quality,
		},
		// Sum
		{
			Name:      point.Name + "_sum",
			Labels:    base.Labels,
			Level:     point.Level,
			Timestamp: point.Timestamp,
			Stats:     ValueStats{Avg: point.Stats.Sum},
			Quality:   point.Quality,
		},
		// Last
		{
			Name:      point.Name + "_last",
			Labels:    base.Labels,
			Level:     point.Level,
			Timestamp: point.Timestamp,
			Stats:     ValueStats{Avg: point.Stats.Last},
			Quality:   point.Quality,
		},
	}

	return points
} */

// ExpandPoints 展开多个聚合点为存储点
//
// 用于存储完整统计信息
/* func ExpandPoints(points []AggregatedPoint) []AggregatedPoint {
	expanded := make([]AggregatedPoint, 0, len(points)*5)
	for _, point := range points {
		expanded = append(expanded, ToMultiplePoints(point)...)
	}
	return expanded
}

// copyLabels 复制标签
func copyLabels(labels map[string]string) map[string]string {
	copied := make(map[string]string, len(labels))
	for k, v := range labels {
		copied[k] = v
	}
	return copied
} */

// ============================================
// 辅助：查询时重建 AggregatedPoint
// ============================================

// RebuildFromQueryResult 从查询结果重建 AggregatedPoint
//
// 参数:
//   - points: 查询结果（可能包含 _avg, _min, _max, _sum, _last 多个指标）
//
// 返回:
//   - []AggregatedPoint: 重建的聚合点
/* func RebuildFromQueryResult(points []*storage.DataPoint) []AggregatedPoint {
	// 按 (metric_base_name, labels, timestamp, level) 分组
	groups := make(map[string]*AggregatedPoint)

	for _, dp := range points {
		// 提取基础指标名称
		baseName := extractBaseName(dp.MetricName)

		// 提取聚合级别（内部标签）
		level := dp.Labels[string(AggregatedInternalLabelAggregationLevel)]

		// 提取数据质量（内部标签）
		status := DataStatus(dp.Labels[string(AggregatedInternalLabelDataStatus)])
		score, _ := strconv.ParseFloat(dp.Labels[string(AggregatedInternalLabelDataScore)], 64)

		// 生成分组键
		key := fmt.Sprintf("%s|%d|%s", baseName, dp.Timestamp, level)

		// 获取或创建 AggregatedPoint
		agg, exists := groups[key]
		if !exists {
			agg = &AggregatedPoint{
				Name:      baseName,
				Labels:    filterAggregationLabels(dp.Labels),
				Level:     level,
				Timestamp: time.UnixMilli(dp.Timestamp),
				Stats:     ValueStats{},
				Quality: DataQuality{
					Status: status,
					Score:  score,
				},
			}
			groups[key] = agg
		}

		// 根据指标后缀填充统计值
		switch {
		case endsWith(dp.MetricName, "_avg"):
			agg.Stats.Avg = dp.Value
		case endsWith(dp.MetricName, "_min"):
			agg.Stats.Min = dp.Value
		case endsWith(dp.MetricName, "_max"):
			agg.Stats.Max = dp.Value
		case endsWith(dp.MetricName, "_sum"):
			agg.Stats.Sum = dp.Value
		case endsWith(dp.MetricName, "_last"):
			agg.Stats.Last = dp.Value
		}
	}

	// 转换为数组
	result := make([]AggregatedPoint, 0, len(groups))
	for _, agg := range groups {
		result = append(result, *agg)
	}

	return result
}
*/
// extractBaseName 提取基础指标名称
func extractBaseName(metricName string) string {
	suffixes := []string{"_avg", "_min", "_max", "_sum", "_last"}
	for _, suffix := range suffixes {
		if endsWith(metricName, suffix) {
			return metricName[:len(metricName)-len(suffix)]
		}
	}
	return metricName
}

// endsWith 检查字符串是否以指定后缀结尾
func endsWith(s, suffix string) bool {
	return len(s) >= len(suffix) && s[len(s)-len(suffix):] == suffix
}

/* // filterAggregationLabels 过滤聚合相关的内部标签
func filterAggregationLabels(labels map[string]string) map[string]string {
	filtered := make(map[string]string, len(labels))
	for k, v := range labels {
		// 排除内部标签（以 __ 开头和结尾的标签）
		if k != string(AggregatedInternalLabelAggregationLevel) && k != string(AggregatedInternalLabelDataStatus) && k != string(AggregatedInternalLabelDataScore) && k != string(AggregatedInternalLabelStatisticSuffix) {
			filtered[k] = v
		}
	}
	return filtered
} */
