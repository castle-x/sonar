package scoring

import (
	"fmt"
	"math"
	"sort"
	"time"

	pointsV1 "monitor_hub/apis/monitor_hub/points/v1"
	reportV1 "monitor_hub/apis/monitor_hub/report/v1"
)

// NormalizeWeights 权重归一化
// 将任意正数权重转换为总和为1的比例
func NormalizeWeights(weights []float64) []float64 {
	if len(weights) == 0 {
		return []float64{}
	}

	// 计算总权重
	totalWeight := 0.0
	for _, w := range weights {
		if w > 0 {
			totalWeight += w
		}
	}

	// 如果总权重为0，平均分配
	if totalWeight == 0 {
		normalized := make([]float64, len(weights))
		avg := 1.0 / float64(len(weights))
		for i := range normalized {
			normalized[i] = avg
		}
		return normalized
	}

	// 归一化
	normalized := make([]float64, len(weights))
	for i, w := range weights {
		if w > 0 {
			normalized[i] = w / totalWeight
		} else {
			normalized[i] = 0
		}
	}

	return normalized
}

// GetScoreLevel 根据分数获取健康等级
func GetScoreLevel(score float64) string {
	if score >= 90 {
		return "excellent"
	} else if score >= 75 {
		return "good"
	} else if score >= 60 {
		return "normal"
	} else if score >= 40 {
		return "warning"
	}
	return "danger"
}

// interpolateScore 使用线性插值计算不在区间内的值的分数
// value: 待评分的值
// sortedRanges: 已按最小值排序的区间列表
func interpolateScore(value float64, sortedRanges []*reportV1.ScoringRange) int32 {
	if len(sortedRanges) == 0 {
		return 60 // 默认分数
	}

	// 找到左右两个最近的区间
	var leftRange, rightRange *reportV1.ScoringRange

	for i, r := range sortedRanges {
		if value < r.Min {
			// 当前值小于这个区间的最小值
			rightRange = r
			if i > 0 {
				leftRange = sortedRanges[i-1]
			}
			break
		} else if value > r.Max {
			// 当前值大于这个区间的最大值
			leftRange = r
			// 继续找右边的区间
		}
	}

	// 情况1：值小于所有区间（只有右边区间）
	if leftRange == nil && rightRange != nil {
		return rightRange.Score
	}

	// 情况2：值大于所有区间（只有左边区间）
	if rightRange == nil && leftRange != nil {
		return leftRange.Score
	}

	// 情况3：值在两个区间之间，进行线性插值
	if leftRange != nil && rightRange != nil {
		// 计算插值
		// leftRange.Max 到 rightRange.Min 之间的位置比例
		leftPoint := leftRange.Max
		rightPoint := rightRange.Min
		leftScore := float64(leftRange.Score)
		rightScore := float64(rightRange.Score)

		// 如果两个点重合，返回平均分
		if rightPoint-leftPoint < 0.0001 {
			return int32((leftScore + rightScore) / 2)
		}

		// 线性插值公式：score = leftScore + (value - leftPoint) * (rightScore - leftScore) / (rightPoint - leftPoint)
		ratio := (value - leftPoint) / (rightPoint - leftPoint)
		interpolatedScore := leftScore + ratio*(rightScore-leftScore)

		// 限制在0-100之间
		if interpolatedScore < 0 {
			interpolatedScore = 0
		}
		if interpolatedScore > 100 {
			interpolatedScore = 100
		}

		return int32(math.Round(interpolatedScore))
	}

	// 兜底：返回默认分数
	return 60
}

// calculateThresholdScore 计算阈值评分
// value: 待评分的值
// thresholds: 阈值条件列表（按顺序匹配，第一个匹配的生效）
// 返回: 分数、等级、是否命中
func calculateThresholdScore(value float64, thresholds []*reportV1.ThresholdCondition) (int32, string, bool) {
	for _, t := range thresholds {
		matched := false
		switch t.Operator {
		case "<":
			matched = value < t.Value
		case "<=":
			matched = value <= t.Value
		case "=":
			// 对于浮点数比较，使用一个小的容差
			matched = math.Abs(value-t.Value) < 0.0001
		case ">=":
			matched = value >= t.Value
		case ">":
			matched = value > t.Value
		}
		if matched {
			return t.Score, t.Level, true
		}
	}
	// 没有匹配的条件，返回0分和unmatched标记
	return 0, "unmatched", false
}

// CalculateMetricScore 计算单个指标的得分
// originalValue: 指标的原始值（从表格提取）
// transformedValue: 经过transform转换后的值（用于区间判断）
// config: 指标的评分配置
// aggType: 当前使用的聚合类型
func CalculateMetricScore(originalValue, transformedValue float64, config *reportV1.MetricScoringConfig, aggType string) *reportV1.MetricScore {
	var score int32
	var level string
	matched := true // 默认命中（区间评分总是命中）

	// 根据评分类型选择计算方式
	scoringType := config.ScoringType
	if scoringType == "threshold" && len(config.Thresholds) > 0 {
		// 阈值评分
		score, level, matched = calculateThresholdScore(transformedValue, config.Thresholds)
	} else {
		// 区间评分（默认，向后兼容）
		var matchedRange *reportV1.ScoringRange
		for _, r := range config.Ranges {
			if transformedValue >= r.Min && transformedValue <= r.Max {
				matchedRange = r
				break
			}
		}

		// 如果没有匹配的区间，使用线性插值
		if matchedRange == nil {
			if len(config.Ranges) == 0 {
				// 没有配置区间，给默认分数
				matchedRange = &reportV1.ScoringRange{
					Score: 60,
					Level: "normal",
				}
			} else {
				// 排序区间（按最小值排序）
				sortedRanges := make([]*reportV1.ScoringRange, len(config.Ranges))
				copy(sortedRanges, config.Ranges)
				sort.Slice(sortedRanges, func(i, j int) bool {
					return sortedRanges[i].Min < sortedRanges[j].Min
				})

				// 线性插值计算分数
				interpolatedScore := interpolateScore(transformedValue, sortedRanges)
				matchedRange = &reportV1.ScoringRange{
					Score: interpolatedScore,
					Level: GetScoreLevel(float64(interpolatedScore)),
				}
			}
		}
		score = matchedRange.Score
		level = matchedRange.Level
	}

	// 构建显示名称：如果有alias用alias，否则用name
	displayName := config.Alias
	if displayName == nil || *displayName == "" {
		displayName = &config.Name
	}

	// 构建指标标识（包含聚合类型）
	metricIdentifier := fmt.Sprintf("%s_%s", config.Name, aggType)

	// 处理unit（可能为nil）
	unit := ""
	if config.Unit != nil {
		unit = *config.Unit
	}

	return &reportV1.MetricScore{
		MetricName:    metricIdentifier, // 指标名_聚合类型
		DisplayName:   *displayName,     // 使用alias或name
		Value:         transformedValue, // 转换后的值（用于区间判断）
		Score:         score,
		WeightedScore: 0, // 稍后计算
		Level:         level,
		Weight:        0, // 稍后计算
		Unit:          unit,
		OriginalValue: &originalValue, // 原始值（转换前）
		Matched:       &matched,       // 是否命中评分规则
	}
}

// CalculateMetricScoreWithRowData 计算单个指标的得分（带原始行数据）
// 用于多行数据时保存原始表格行，供前端展开查看
func CalculateMetricScoreWithRowData(originalValue, transformedValue float64, config *reportV1.MetricScoringConfig, aggType string, rowData map[string]string) *reportV1.MetricScore {
	// 复用基础计算逻辑
	score := CalculateMetricScore(originalValue, transformedValue, config, aggType)

	// 设置原始行数据（不再拼接标签到显示名称，用户可以展开查看详情）
	if len(rowData) > 0 {
		score.RowData = rowData
	}

	return score
}

// CalculateCaseScore 计算单个用例的得分
// tables: 该用例的汇总表格数据
// config: 用例的评分配置
// caseName: 用例名称
// rateStatistics: 该用例的 Rate 统计数据（可选）
func CalculateCaseScore(tables []*pointsV1.SummaryTable, config *reportV1.CaseScoringConfig, caseName string, rateStatistics *reportV1.CaseRateStatistics) (*reportV1.CaseScore, error) {
	if len(config.MetricConfigs) == 0 {
		return nil, fmt.Errorf("用例 %s 没有配置任何指标", caseName)
	}

	// 计算总的指标评分项数量（每个指标 * 聚合类型数量）
	totalMetricItems := 0
	for _, mc := range config.MetricConfigs {
		totalMetricItems += len(mc.AggregationTypes)
	}

	if totalMetricItems == 0 {
		return nil, fmt.Errorf("用例 %s 没有配置任何聚合类型", caseName)
	}

	// 收集所有指标项的权重（每个指标的权重会被其聚合类型数量平分）
	weights := make([]float64, 0, totalMetricItems)
	for _, mc := range config.MetricConfigs {
		// 每个指标的权重按聚合类型数量平分
		weightPerAggType := mc.Weight / float64(len(mc.AggregationTypes))
		for range mc.AggregationTypes {
			weights = append(weights, weightPerAggType)
		}
	}

	// 权重归一化
	normalizedWeights := NormalizeWeights(weights)

	// 计算每个指标的得分（先收集所有得分，再统一计算权重）
	metricScores := make([]*reportV1.MetricScore, 0, totalMetricItems)
	weightIndex := 0

	for _, metricConfig := range config.MetricConfigs {
		// 遍历该指标的所有聚合类型
		for _, aggType := range metricConfig.AggregationTypes {
			// 确定数据来源
			source := DataSourceSummary // 默认从汇总表格提取
			if metricConfig.Source != nil && *metricConfig.Source != "" {
				source = *metricConfig.Source
			}

			// 优先使用 alias 匹配，如果没有 alias 则使用 name
			displayName := metricConfig.Name
			if metricConfig.Alias != nil && *metricConfig.Alias != "" {
				displayName = *metricConfig.Alias
			}

			var rows []MetricRowValue
			var extractErr error

			// 根据数据来源提取数据
			if source == DataSourceRate {
				// 从 Rate 统计中提取
				rateRows, found := ExtractRateMetricRows(rateStatistics, metricConfig.Name)
				if !found {
					// Rate 数据不存在，检查 N/A 处理策略
					naValue, shouldScore := HandleNAValue(metricConfig.NaHandling, metricConfig.NaValue, source)
					if shouldScore {
						// 创建一个 N/A 行用于评分
						rows = []MetricRowValue{
							{
								Value:   naValue,
								Label:   metricConfig.Name,
								RowData: map[string]string{"metric_name": metricConfig.Name, "rate": fmt.Sprintf("%.4f", naValue)},
								IsNA:    true,
							},
						}
						fmt.Printf("[评分信息] 用例 %s 指标 %s(Rate) 数据不存在，按 N/A 策略处理为 %.2f\n",
							caseName, metricConfig.Name, naValue)
					} else {
						fmt.Printf("[评分警告] 用例 %s 指标 %s(Rate) 数据不存在且 N/A 策略为跳过，不参与评分\n",
							caseName, metricConfig.Name)
						weightIndex++
						continue
					}
				} else {
					rows = rateRows
				}
			} else {
				// 从汇总表格提取
				rows, extractErr = ExtractMetricRowsWithAlias(tables, metricConfig.Name, displayName, aggType)
				if extractErr != nil || len(rows) == 0 {
					fmt.Printf("[评分警告] 用例 %s 无法提取指标 %s(%s) [别名:%s]: %v\n",
						caseName, metricConfig.Name, aggType, displayName, extractErr)
					weightIndex++
					continue
				}
			}

			// 该指标配置的基础权重（暂存，后面统一归一化）
			baseWeight := normalizedWeights[weightIndex]

			// 处理提取到的数据行
			for i, row := range rows {
				// 计算行权重
				rowWeight := baseWeight
				if len(rows) > 1 {
					rowWeight = baseWeight / float64(len(rows))
				}

				// 处理 N/A 值
				if row.IsNA {
					naValue, shouldScore := HandleNAValue(metricConfig.NaHandling, metricConfig.NaValue, source)
					if !shouldScore {
						fmt.Printf("[评分信息] 用例 %s 指标 %s 第%d行为 N/A，策略为跳过，不参与评分\n",
							caseName, metricConfig.Name, i+1)
						continue
					}
					// 使用 N/A 处理后的值
					row.Value = naValue
					fmt.Printf("[评分信息] 用例 %s 指标 %s 第%d行为 N/A，按策略处理为 %.2f\n",
						caseName, metricConfig.Name, i+1, naValue)
				}

				tableValue := row.Value
				metricScore := CalculateMetricScoreWithRowData(tableValue, tableValue, metricConfig, aggType, row.RowData)
				metricScore.Weight = rowWeight

				// 标记来自 Rate 统计的指标
				if source == DataSourceRate {
					metricScore.MetricName = fmt.Sprintf("%s_rate", metricConfig.Name)
				}

				metricScores = append(metricScores, metricScore)
			}

			weightIndex++
		}
	}

	// 重新计算权重：只有命中的指标参与评分
	matchedWeightSum := 0.0
	for _, ms := range metricScores {
		if ms.Matched == nil || *ms.Matched {
			matchedWeightSum += ms.Weight
		}
	}

	// 计算加权得分
	totalWeightedScore := 0.0
	for _, ms := range metricScores {
		if ms.Matched == nil || *ms.Matched {
			// 命中的指标：归一化权重后参与评分
			if matchedWeightSum > 0 {
				ms.Weight = ms.Weight / matchedWeightSum // 归一化权重
				ms.WeightedScore = float64(ms.Score) * ms.Weight
				totalWeightedScore += ms.WeightedScore
			}
		} else {
			// 未命中的指标：权重和加权得分都设为0
			ms.Weight = 0
			ms.WeightedScore = 0
			fmt.Printf("[评分信息] 用例 %s 指标 %s 值 %.2f 未命中任何评分规则，不参与评分\n",
				caseName, ms.DisplayName, ms.Value)
		}
	}

	// 如果没有任何指标得分，返回错误
	if len(metricScores) == 0 {
		// 构建更详细的错误信息
		configuredMetrics := make([]string, 0)
		for _, mc := range config.MetricConfigs {
			for _, agg := range mc.AggregationTypes {
				configuredMetrics = append(configuredMetrics, fmt.Sprintf("%s(%s)", mc.Name, agg))
			}
		}
		return nil, fmt.Errorf("用例 %s 无法计算任何指标得分，配置的指标: [%s]，但在汇总表格中均未找到对应数据",
			caseName, fmt.Sprintf("%v", configuredMetrics))
	}

	// 用例总分 = 各指标加权得分之和
	caseScore := math.Round(totalWeightedScore*100) / 100 // 保留2位小数

	return &reportV1.CaseScore{
		CaseName:      caseName,
		Score:         caseScore,
		WeightedScore: 0, // 稍后在报告级别计算
		Level:         GetScoreLevel(caseScore),
		Weight:        0, // 稍后在报告级别计算
		MetricScores:  metricScores,
	}, nil
}

// CalculateReportScore 计算报告总分
// caseScores: 所有用例的得分
func CalculateReportScore(caseScores []*reportV1.CaseScore) *reportV1.ReportScore {
	if len(caseScores) == 0 {
		return &reportV1.ReportScore{
			TotalScore:  0,
			Level:       "normal",
			CaseScores:  []*reportV1.CaseScore{},
			EvaluatedAt: getCurrentTimestampMillis(),
		}
	}

	// 用例权重：自动平均分配
	caseWeight := 1.0 / float64(len(caseScores))

	// 计算报告总分
	totalScore := 0.0
	for _, cs := range caseScores {
		cs.Weight = caseWeight
		cs.WeightedScore = cs.Score * cs.Weight
		totalScore += cs.WeightedScore
	}

	// 保留2位小数
	totalScore = math.Round(totalScore*100) / 100

	return &reportV1.ReportScore{
		TotalScore:  totalScore,
		Level:       GetScoreLevel(totalScore),
		CaseScores:  caseScores,
		EvaluatedAt: getCurrentTimestampMillis(),
	}
}

// getCurrentTimestampMillis 获取当前时间戳（毫秒）
func getCurrentTimestampMillis() int64 {
	return time.Now().UnixNano() / 1e6
}
