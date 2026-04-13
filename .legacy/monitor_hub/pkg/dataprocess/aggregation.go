package dataprocess

import (
	"math"
	pkgaggregator "monitor_hub/pkg/aggregator"
	"monitor_hub/pkg/utils"
)

// AggregateValues 对数据点列表进行聚合计算
// 使用 aggregator 包定义的聚合类型枚举
//
// 调用场景:
// - pkg/dataprocess: 内部计算指标值
// - biz/report/v1: 重新聚合数据时使用
// - pkg/aggregation: 数据聚合服务中计算窗口内的值
func AggregateValues(values []RawData, aggType pkgaggregator.AggregationType) float64 {
	if len(values) == 0 {
		return 0
	}

	min := math.MaxFloat64
	max := -math.MaxFloat64
	sum := 0.0

	for _, point := range values {
		value := point.V
		sum += value
		if value < min {
			min = value
		}
		if value > max {
			max = value
		}
	}

	switch aggType {
	case pkgaggregator.AggregationTypeAvg:
		return sum / float64(len(values))
	case pkgaggregator.AggregationTypeMin:
		return min
	case pkgaggregator.AggregationTypeMax:
		return max
	case pkgaggregator.AggregationTypeCount:
		return sum // count类型累加
	case pkgaggregator.AggregationTypeLast:
		return values[len(values)-1].V
	default:
		return 0
	}
}

// CalculateMetricValue 根据聚合类型和转换表达式计算指标值
// 结合了聚合计算和表达式转换
//
// 调用场景:
// - pkg/dataprocess/summary.go: BuildSummaryTable 中计算表格单元格的值
// - biz/report/v1: 报告生成时计算统计值
func CalculateMetricValue(aggType pkgaggregator.AggregationType, transform string, values []RawData) float64 {
	if len(values) == 0 {
		return 0
	}

	// 第一步：根据聚合类型计算聚合值
	aggregatedValue := AggregateValues(values, aggType)

	// 第二步：应用转换表达式（如果有配置）
	if transform != "" {
		return utils.EvaluateTransform(transform, aggregatedValue)
	}

	return aggregatedValue
}

// CalculatePercentile 计算百分位数
// p: 0-100 之间的百分位（如 95 表示 P95）
//
// 调用场景:
// - pkg/aggregation: 聚合时计算 P50, P95, P99
// - biz/report/v1: 生成统计报告时计算百分位
func CalculatePercentile(values []RawData, p float64) float64 {
	if len(values) == 0 {
		return 0
	}

	// 提取数值并排序
	nums := make([]float64, len(values))
	for i, v := range values {
		nums[i] = v.V
	}

	// 简单冒泡排序（小数据量可用）
	for i := 0; i < len(nums); i++ {
		for j := i + 1; j < len(nums); j++ {
			if nums[i] > nums[j] {
				nums[i], nums[j] = nums[j], nums[i]
			}
		}
	}

	// 计算百分位索引
	idx := int(float64(len(nums)-1) * p / 100)
	return nums[idx]
}

// AggregateByWindow 对时间窗口内的数据进行聚合
// 常用于重新聚合原始数据时按时间窗口分组计算
//
// 调用场景:
// - biz/report/v1: 重新聚合原始数据时使用
// - pkg/aggregation: 数据聚合服务中计算窗口值
func AggregateByWindow(values []RawData, aggTypes []pkgaggregator.AggregationType) map[pkgaggregator.AggregationType]float64 {
	result := make(map[pkgaggregator.AggregationType]float64)

	for _, aggType := range aggTypes {
		result[aggType] = AggregateValues(values, aggType)
	}

	return result
}

// AggregateAllTypes 对数据点计算所有聚合类型的值
// 一次性计算 avg, min, max, count, last 等所有类型
//
// 调用场景:
// - biz/report/v1: 创建报告时计算所有聚合类型
func AggregateAllTypes(values []RawData) map[pkgaggregator.AggregationType]float64 {
	return AggregateByWindow(values, []pkgaggregator.AggregationType{
		pkgaggregator.AggregationTypeAvg,
		pkgaggregator.AggregationTypeMin,
		pkgaggregator.AggregationTypeMax,
		pkgaggregator.AggregationTypeCount,
		pkgaggregator.AggregationTypeLast,
	})
}
