package aggregator

import (
	"fmt"
	"math"
	"monitor_hub/pkg/storage"
	"time"

	"github.com/prometheus/prometheus/model/labels"
)

// ============================================
// 聚合算法
// ============================================

// Aggregate 聚合多个数据点
//
// 参数:
//   - points: 源数据点列表
//   - level: 目标聚合级别
//   - timestamp: 聚合时间戳
//   - quality: 数据质量
//
// 返回:
//   - []AggregatedPoint: 聚合后的数据点
func Aggregate(points []AggregatedPoint, level string, timestamp time.Time, quality DataQuality) []AggregatedPoint {
	if len(points) == 0 {
		return nil
	}

	// 按指标唯一键（name + labels）分组
	groups := groupByMetric(points)

	// 对每组进行聚合
	result := make([]AggregatedPoint, 0, len(groups))
	for datasourceId, group := range groups {
		for _, pointsGroup := range group {
			for _type, points := range pointsGroup {
				aggregated := aggregateGroup(datasourceId, points, level, timestamp, quality, _type)
				result = append(result, aggregated)
			}
		}
	}

	return result
}

// AggregateRaw 聚合原始数据点
//
// 参数:
//   - rawPoints: 原始数据点列表
//   - level: 目标聚合级别
//   - timestamp: 聚合时间戳
//
// 返回:
//   - []AggregatedPoint: 聚合后的数据点
func AggregateRaw(rawPoints []RawMetricPoint, level string, timestamp time.Time) []AggregatedPoint {
	if len(rawPoints) == 0 {
		return nil
	}

	// 按指标唯一键分组
	groups := groupRawByMetric(rawPoints)

	// 对每组进行聚合
	result := make([]AggregatedPoint, 0, len(groups))
	for datasourceId, group := range groups {
		for _, points := range group {
			for _, _type := range AggregationTypeList {
				aggregated := aggregateRawGroup(datasourceId, points, level, timestamp, _type)
				result = append(result, aggregated)
			}
		}
	}

	return result
}

// ============================================
// 内部方法 - 分组
// ============================================

// groupByMetric 按指标分组
func groupByMetric(points []AggregatedPoint) map[string]map[string]map[AggregationType][]AggregatedPoint {
	groups := make(map[string]map[string]map[AggregationType][]AggregatedPoint)

	for _, point := range points {
		key := generateMetricKey(point.Name, point.Labels)
		if _, ok := groups[point.DatasourceId]; !ok {
			groups[point.DatasourceId] = make(map[string]map[AggregationType][]AggregatedPoint)
		}
		if _, ok := groups[point.DatasourceId][key]; !ok {
			groups[point.DatasourceId][key] = make(map[AggregationType][]AggregatedPoint)
		}
		if _, ok := groups[point.DatasourceId][key][point.AggregationType]; !ok {
			groups[point.DatasourceId][key][point.AggregationType] = make([]AggregatedPoint, 0)
		}
		groups[point.DatasourceId][key][point.AggregationType] = append(groups[point.DatasourceId][key][point.AggregationType], point)
	}

	return groups
}

// groupRawByMetric 按指标分组（原始数据）
func groupRawByMetric(points []RawMetricPoint) map[string]map[string][]RawMetricPoint {
	groups := make(map[string]map[string][]RawMetricPoint)

	for _, point := range points {
		if _, ok := groups[point.DatasourceId]; !ok {
			groups[point.DatasourceId] = make(map[string][]RawMetricPoint)
		}
		key := generateMetricKey(point.Name, point.Labels)
		groups[point.DatasourceId][key] = append(groups[point.DatasourceId][key], point)
	}

	return groups
}

// ============================================
// 内部方法 - 聚合
// ============================================

// aggregateGroup 聚合同一指标的多个点
func aggregateGroup(datasourceId string, points []AggregatedPoint, level string, timestamp time.Time, quality DataQuality, aggregationType AggregationType) AggregatedPoint {
	if len(points) == 0 {
		return AggregatedPoint{}
	}

	first := points[0]

	// 根据聚合类型初始化 value
	var value float64
	switch aggregationType {
	case AggregationTypeMin:
		value = math.MaxFloat64 // Min 初始化为最大值
	case AggregationTypeMax:
		value = -math.MaxFloat64 // Max 初始化为最小值
	default:
		value = 0.0
	}

	for _, p := range points {
		switch aggregationType {
		case AggregationTypeAvg:
			value += p.Value
		case AggregationTypeMin:
			value = math.Min(value, p.Value)
		case AggregationTypeMax:
			value = math.Max(value, p.Value)
		//case AggregationTypeSum:
		//	value += p.Value
		case AggregationTypeCount:
			value += p.Value // 级联聚合时，因为使用的Count是已经计算过的点数，需要累加数据点数量。
		case AggregationTypeLast:
			value = p.Value
		}
	}

	if aggregationType == AggregationTypeAvg {
		value = value / float64(len(points))
	}

	return AggregatedPoint{
		DatasourceId:    datasourceId,
		Name:            first.Name,
		Labels:          first.Labels,
		Level:           level,
		Timestamp:       UnixMilliTime(timestamp),
		Date:            timestamp.Format(time.DateTime),
		Quality:         quality,
		AggregationType: aggregationType,
		Value:           value,
	}
}

// aggregateRawGroup 聚合原始数据点组
func aggregateRawGroup(datasourceId string, points []RawMetricPoint, level string, timestamp time.Time, aggregationType AggregationType) AggregatedPoint {
	if len(points) == 0 {
		return AggregatedPoint{}
	}

	first := points[0]

	// 计算统计值
	stats := ValueStats{
		Min: math.MaxFloat64,
		Max: -math.MaxFloat64,
		Sum: 0,
	}

	for _, p := range points {
		stats.Sum += p.Value
		stats.Min = math.Min(stats.Min, p.Value)
		stats.Max = math.Max(stats.Max, p.Value)
		stats.Last = p.Value
	}

	stats.Avg = stats.Sum / float64(len(points))

	// 原始数据默认质量为 100
	quality := DataQuality{
		ActualPoints:   len(points),
		ExpectedPoints: len(points),
		Score:          100.0,
		Status:         DataStatusComplete,
	}
	point := AggregatedPoint{
		DatasourceId:    datasourceId,
		Name:            first.Name,
		Labels:          first.Labels,
		Level:           level,
		Timestamp:       UnixMilliTime(timestamp),
		Date:            timestamp.Format(time.DateTime),
		Quality:         quality,
		AggregationType: aggregationType,
	}
	switch aggregationType {
	case AggregationTypeAvg:
		point.Value = stats.Avg
	case AggregationTypeMin:
		point.Value = stats.Min
	case AggregationTypeMax:
		point.Value = stats.Max
	/* case AggregationTypeSum:
	point.Value = stats.Sum */
	case AggregationTypeCount:
		// RAW是最小聚合等级，直接设置数据点数量即可
		point.Value = float64(len(points))
	case AggregationTypeLast:
		point.Value = stats.Last
	}
	return point
}

// ============================================
// 工具方法
// ============================================

// countUniqueMetrics 统计唯一指标数量（不包括聚合类型）
//
// 在扁平化设计中，每个原始指标会产生 4 个聚合点（avg/min/max/count）
// 此函数统计去重后的指标数量，用于计算期望数据点数
//
// 参数:
//   - points: 聚合数据点列表
//
// 返回:
//   - int: 唯一指标数量
func countUniqueMetrics(points []AggregatedPoint) int {
	// 使用 map 去重，key = datasource_id + name + business_labels
	uniqueKeys := make(map[string]struct{})

	for _, point := range points {
		// 过滤业务标签（排除内部标签）
		businessLabels := filterBusinessLabels(point.Labels)

		// 生成唯一键（datasource_id + name + business_labels）
		key := fmt.Sprintf("%s|%s", point.DatasourceId, generateMetricKey(point.Name, businessLabels))
		uniqueKeys[key] = struct{}{}
	}

	return len(uniqueKeys)
}

// filterBusinessLabels 过滤业务标签（排除内部标签）
func filterBusinessLabels(lbs storage.Labels) storage.Labels {
	builder := labels.NewBuilder(lbs)
	builder.Range(func(l labels.Label) {
		if l.Name == string(AggregatedInternalLabelAggregationLevel) ||
			l.Name == string(AggregatedInternalLabelDataStatus) ||
			l.Name == string(AggregatedInternalLabelDataScore) ||
			l.Name == string(AggregatedInternalLabelStatisticSuffix) ||
			l.Name == string(AggregatedInternalLabelDatasourceId) {
			builder.Del(l.Name)
		}
	})
	return builder.Labels()
}

// generateMetricKey 生成指标唯一键
func generateMetricKey(name string, labels storage.Labels) string {
	return name + labels.String()
}

// AlignTimestamp 对齐时间戳到指定间隔
func AlignTimestamp(t time.Time, interval time.Duration) time.Time {
	return t.Truncate(interval)
}

// IsTimeBoundary 检查是否到达时间边界
func IsTimeBoundary(now time.Time, interval, minInterval time.Duration) bool {
	aligned := now.Truncate(interval)
	// 当前时间与对齐时间的差值小于最小间隔，认为到达边界
	return now.Sub(aligned) < minInterval
}

// CalculateExpectedPoints 计算期望的数据点数
//
// 参数:
//   - interval: 当前级别的间隔
//   - sourceInterval: 源级别的间隔
//
// 返回:
//   - int: 期望的数据点数
func CalculateExpectedPoints(interval, sourceInterval time.Duration) int {
	if sourceInterval == 0 {
		return 1
	}
	return int(interval / sourceInterval)
}

// ValidateAggregationChain 验证聚合链是否有效
func ValidateAggregationChain(levels []LevelConfig) error {
	if len(levels) == 0 {
		return fmt.Errorf("no levels configured")
	}

	// 第一个必须是 raw
	if levels[0].Source != "raw" {
		return fmt.Errorf("first level must be 'raw'")
	}

	// 检查每个级别的源是否存在
	for i := 1; i < len(levels); i++ {
		found := false
		for j := 0; j < i; j++ {
			if levels[j].Name == levels[i].Source {
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("level '%s' references unknown source '%s'",
				levels[i].Name, levels[i].Source)
		}
	}

	return nil
}
