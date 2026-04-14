package scoring

import (
	"fmt"
	"math"
	"strings"
)

// CalculateCaseScore 计算单个用例得分
func CalculateCaseScore(tables []*SummaryTable, config *CaseScoringConfig, caseName string) (*CaseScore, error) {
	if len(config.MetricConfigs) == 0 {
		return nil, fmt.Errorf("用例 %s 没有配置任何指标", caseName)
	}

	totalMetricItems := 0
	for _, mc := range config.MetricConfigs {
		totalMetricItems += len(mc.AggregationTypes)
	}
	if totalMetricItems == 0 {
		return nil, fmt.Errorf("用例 %s 没有配置任何聚合类型", caseName)
	}

	weights := make([]float64, 0, totalMetricItems)
	for _, mc := range config.MetricConfigs {
		weightPerAggType := mc.Weight / float64(len(mc.AggregationTypes))
		for range mc.AggregationTypes {
			weights = append(weights, weightPerAggType)
		}
	}
	normalizedWeights := NormalizeWeights(weights)

	metricScores := make([]*MetricScore, 0, totalMetricItems)
	weightIndex := 0

	for _, metricConfig := range config.MetricConfigs {
		for _, aggType := range metricConfig.AggregationTypes {
			displayName := metricConfig.Name
			if metricConfig.Alias != nil && *metricConfig.Alias != "" {
				displayName = *metricConfig.Alias
			}
			rows, extractErr := ExtractMetricRowsWithAlias(tables, metricConfig.Name, displayName, aggType)
			if extractErr != nil || len(rows) == 0 {
				weightIndex++
				continue
			}

			baseWeight := normalizedWeights[weightIndex]
			for _, row := range rows {
				rowWeight := baseWeight
				if len(rows) > 1 {
					rowWeight = baseWeight / float64(len(rows))
				}
				if row.IsNA {
					weightIndex++
					continue
				}
				ms := CalculateMetricScore(row.Value, row.Value, metricConfig, aggType)
				ms.Weight = rowWeight
				metricScores = append(metricScores, ms)
			}
			weightIndex++
		}
	}

	if len(metricScores) == 0 {
		return nil, fmt.Errorf("用例 %s 无法计算任何指标得分", caseName)
	}

	matchedWeightSum := 0.0
	for _, ms := range metricScores {
		if ms.Matched == nil || *ms.Matched {
			matchedWeightSum += ms.Weight
		}
	}

	totalWeightedScore := 0.0
	for _, ms := range metricScores {
		if ms.Matched == nil || *ms.Matched {
			if matchedWeightSum > 0 {
				ms.Weight = ms.Weight / matchedWeightSum
				ms.WeightedScore = float64(ms.Score) * ms.Weight
				totalWeightedScore += ms.WeightedScore
			}
		} else {
			ms.Weight = 0
			ms.WeightedScore = 0
		}
	}

	caseScore := math.Round(totalWeightedScore*100) / 100
	return &CaseScore{
		CaseName:     caseName,
		Score:        caseScore,
		Level:        GetScoreLevel(caseScore),
		MetricScores: metricScores,
	}, nil
}

// ExtractMetricRowsWithAlias 从汇总表格中提取指标值（支持别名匹配）
func ExtractMetricRowsWithAlias(tables []*SummaryTable, metricName string, alias string, aggType string) ([]MetricRowValue, error) {
	if alias != "" && alias != metricName {
		rows, err := extractMetricRowsByName(tables, alias, aggType)
		if err == nil && len(rows) > 0 {
			return rows, nil
		}
	}
	return extractMetricRowsByName(tables, metricName, aggType)
}

func extractMetricRowsByName(tables []*SummaryTable, metricName string, aggType string) ([]MetricRowValue, error) {
	for _, table := range tables {
		if table == nil || table.Table == nil || len(table.Table) < 2 {
			continue
		}
		header := table.Table[0]
		targetColIdx := -1
		labelColIdx := -1

		for colIdx, colName := range header {
			colNameLower := strings.ToLower(colName)
			if strings.Contains(colNameLower, strings.ToLower(metricName)) {
				if strings.Contains(colNameLower, "("+strings.ToLower(aggType)+")") {
					targetColIdx = colIdx
				} else if targetColIdx == -1 {
					targetColIdx = colIdx
				}
			}
			if labelColIdx == -1 {
				if colNameLower == "name" || colNameLower == "host" || colNameLower == "ip" || colNameLower == "pid" {
					labelColIdx = colIdx
				}
			}
		}

		if targetColIdx == -1 {
			continue
		}

		rows := make([]MetricRowValue, 0, len(table.Table)-1)
		for i := 1; i < len(table.Table); i++ {
			row := table.Table[i]
			if targetColIdx >= len(row) {
				continue
			}
			valueStr := row[targetColIdx]
			label := fmt.Sprintf("行%d", i)
			if labelColIdx >= 0 && labelColIdx < len(row) && row[labelColIdx] != "" {
				label = row[labelColIdx]
			}
			rowData := make(map[string]string)
			for colIdx, colName := range header {
				if colIdx < len(row) && colName != "" {
					rowData[colName] = row[colIdx]
				}
			}
			if isNAValue(valueStr) {
				rows = append(rows, MetricRowValue{Value: 0, Label: label, RowData: rowData, IsNA: true})
			} else {
				value, err := parseNumericValue(valueStr)
				if err != nil {
					continue
				}
				rows = append(rows, MetricRowValue{Value: value, Label: label, RowData: rowData})
			}
		}
		if len(rows) > 0 {
			return rows, nil
		}
	}
	return nil, fmt.Errorf("在汇总表格中未找到指标: %s", metricName)
}

func isNAValue(s string) bool {
	s = strings.TrimSpace(strings.ToUpper(s))
	return s == "N/A" || s == "NA" || s == "-" || s == ""
}

func parseNumericValue(s string) (float64, error) {
	s = strings.TrimSpace(s)
	for _, suffix := range []string{"%", "ms", "MB", "GB", "KB", "s"} {
		s = strings.TrimSuffix(s, suffix)
	}
	s = strings.TrimSpace(s)
	var f float64
	_, err := fmt.Sscanf(s, "%f", &f)
	return f, err
}
