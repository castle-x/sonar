package dataprocess

import (
	reportv1 "monitor_hub/apis/monitor_hub/report/v1"
	pkgaggregator "monitor_hub/pkg/aggregator"
)

// CalculateRateStatistics 计算指定指标的 rate 统计
// rate = 总数据点数 / 时间范围(分钟)
//
// 参数:
//   - compressedData: 压缩后的聚合数据（包含 count 聚合类型）
//   - rateMetrics: 需要计算 rate 的指标名列表
//   - startTimeMs: 开始时间（毫秒时间戳）
//   - endTimeMs: 结束时间（毫秒时间戳）
//
// 返回:
//   - rate 统计列表（只包含配置的指标）
//
// 计算逻辑:
//  1. 遍历 rateMetrics 中的每个指标
//  2. 在 compressedData 中找到该指标的所有标签组合
//  3. 累加所有标签组合的 count 值（count 是每个聚合窗口内的原始数据点数）
//  4. rate = totalCount / durationMinutes
//
// 调用场景:
//   - biz/report/v1/handler.go: 报告生成完成后，计算 rate 统计
func CalculateRateStatistics(
	compressedData *PointsResponse,
	rateMetrics []string,
	startTimeMs, endTimeMs int64,
) []*reportv1.RateStatistic {
	results := make([]*reportv1.RateStatistic, 0)

	// 计算时间范围（分钟）
	durationMinutes := float64(endTimeMs-startTimeMs) / 60000.0
	if durationMinutes <= 0 {
		logger.Warn("CalculateRateStatistics: invalid duration, start=%d, end=%d", startTimeMs, endTimeMs)
		return results
	}

	// 空数据检查
	if compressedData == nil || len(compressedData.K) == 0 {
		return results
	}

	// 构建 rateMetrics 的快速查找表
	rateMetricSet := make(map[string]bool)
	for _, name := range rateMetrics {
		rateMetricSet[name] = true
	}

	// 构建指标名 -> 数据索引列表的映射
	// 同一个指标名可能有多个标签组合
	metricIndexMap := make(map[string][]int)
	for i := 0; i < len(compressedData.K); i += 2 {
		name := compressedData.K[i]
		dataIndex := i / 2
		metricIndexMap[name] = append(metricIndexMap[name], dataIndex)
	}

	// count 聚合类型的索引
	countIndex := pkgaggregator.AggregationTypeCount.Index()

	// 遍历需要计算 rate 的指标
	for _, metricName := range rateMetrics {
		indices, ok := metricIndexMap[metricName]
		if !ok {
			// 指标不存在于数据中，跳过
			continue
		}

		// 累加该指标所有标签组合的 count 值
		var totalCount int64 = 0
		for _, dataIndex := range indices {
			// 检查索引有效性
			if dataIndex >= len(compressedData.V) {
				continue
			}
			aggData := compressedData.V[dataIndex]

			// 检查 count 聚合类型是否存在
			if countIndex >= len(aggData) {
				continue
			}
			countData := aggData[countIndex]

			// 累加所有时间点的 count 值
			for _, point := range countData {
				totalCount += int64(point.V)
			}
		}

		// 计算 rate（每分钟出现次数）
		rate := float64(totalCount) / durationMinutes

		results = append(results, &reportv1.RateStatistic{
			MetricName:      metricName,
			Rate:            rate,
			TotalCount:      totalCount,
			DurationMinutes: durationMinutes,
		})
	}

	logger.Info("CalculateRateStatistics: calculated %d rate metrics, duration=%.2f min",
		len(results), durationMinutes)

	return results
}

// CalculateCaseRateStatistics 计算单个用例的 rate 统计
// 封装 CalculateRateStatistics，返回带用例名的统计结构
//
// 参数:
//   - caseName: 用例名称
//   - compressedData: 压缩后的聚合数据
//   - rateMetrics: 需要计算 rate 的指标名列表
//   - startTimeMs: 开始时间（毫秒时间戳）
//   - endTimeMs: 结束时间（毫秒时间戳）
//
// 返回:
//   - CaseRateStatistics 结构（如果 rateMetrics 为空或无有效数据，返回 nil）
func CalculateCaseRateStatistics(
	caseName string,
	compressedData *PointsResponse,
	rateMetrics []string,
	startTimeMs, endTimeMs int64,
) *reportv1.CaseRateStatistics {
	// 如果没有配置 rate_metrics，返回 nil
	if len(rateMetrics) == 0 {
		return nil
	}

	statistics := CalculateRateStatistics(compressedData, rateMetrics, startTimeMs, endTimeMs)

	// 如果没有有效的统计结果，返回 nil
	if len(statistics) == 0 {
		return nil
	}

	return &reportv1.CaseRateStatistics{
		CaseName:   caseName,
		Statistics: statistics,
	}
}
