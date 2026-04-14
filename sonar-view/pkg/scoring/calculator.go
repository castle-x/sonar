package scoring

import (
	"math"
	"sort"
	"time"
)

func NormalizeWeights(weights []float64) []float64 {
	if len(weights) == 0 {
		return []float64{}
	}
	totalWeight := 0.0
	for _, w := range weights {
		if w > 0 {
			totalWeight += w
		}
	}
	if totalWeight == 0 {
		normalized := make([]float64, len(weights))
		avg := 1.0 / float64(len(weights))
		for i := range normalized {
			normalized[i] = avg
		}
		return normalized
	}
	normalized := make([]float64, len(weights))
	for i, w := range weights {
		if w > 0 {
			normalized[i] = w / totalWeight
		}
	}
	return normalized
}

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

func interpolateScore(value float64, sortedRanges []*ScoringRange) int32 {
	if len(sortedRanges) == 0 {
		return 60
	}
	var leftRange, rightRange *ScoringRange
	for i, r := range sortedRanges {
		if value < r.Min {
			rightRange = r
			if i > 0 {
				leftRange = sortedRanges[i-1]
			}
			break
		} else if value > r.Max {
			leftRange = r
		}
	}
	if leftRange == nil && rightRange != nil {
		return rightRange.Score
	}
	if rightRange == nil && leftRange != nil {
		return leftRange.Score
	}
	if leftRange != nil && rightRange != nil {
		leftPoint := leftRange.Max
		rightPoint := rightRange.Min
		leftScore := float64(leftRange.Score)
		rightScore := float64(rightRange.Score)
		if rightPoint-leftPoint < 0.0001 {
			return int32((leftScore + rightScore) / 2)
		}
		ratio := (value - leftPoint) / (rightPoint - leftPoint)
		interpolatedScore := leftScore + ratio*(rightScore-leftScore)
		if interpolatedScore < 0 {
			interpolatedScore = 0
		}
		if interpolatedScore > 100 {
			interpolatedScore = 100
		}
		return int32(math.Round(interpolatedScore))
	}
	return 60
}

func calculateThresholdScore(value float64, thresholds []*ThresholdCondition) (int32, string, bool) {
	for _, t := range thresholds {
		matched := false
		switch t.Operator {
		case "<":
			matched = value < t.Value
		case "<=":
			matched = value <= t.Value
		case "=":
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
	return 0, "unmatched", false
}

func CalculateMetricScore(originalValue, transformedValue float64, config *MetricScoringConfig, aggType string) *MetricScore {
	var score int32
	var level string
	matched := true
	scoringType := config.ScoringType
	if scoringType == "threshold" && len(config.Thresholds) > 0 {
		score, level, matched = calculateThresholdScore(transformedValue, config.Thresholds)
	} else {
		var matchedRange *ScoringRange
		for _, r := range config.Ranges {
			if transformedValue >= r.Min && transformedValue <= r.Max {
				matchedRange = r
				break
			}
		}
		if matchedRange == nil {
			if len(config.Ranges) == 0 {
				matchedRange = &ScoringRange{Score: 60, Level: "normal"}
			} else {
				sortedRanges := make([]*ScoringRange, len(config.Ranges))
				copy(sortedRanges, config.Ranges)
				sort.Slice(sortedRanges, func(i, j int) bool {
					return sortedRanges[i].Min < sortedRanges[j].Min
				})
				interpolatedScore := interpolateScore(transformedValue, sortedRanges)
				matchedRange = &ScoringRange{
					Score: interpolatedScore,
					Level: GetScoreLevel(float64(interpolatedScore)),
				}
			}
		}
		score = matchedRange.Score
		level = matchedRange.Level
	}
	displayName := config.Name
	if config.Alias != nil && *config.Alias != "" {
		displayName = *config.Alias
	}
	metricIdentifier := config.Name + "_" + aggType
	unit := ""
	if config.Unit != nil {
		unit = *config.Unit
	}
	return &MetricScore{
		MetricName:    metricIdentifier,
		DisplayName:   displayName,
		Value:         transformedValue,
		Score:         score,
		WeightedScore: 0,
		Level:         level,
		Weight:        0,
		Unit:          unit,
		OriginalValue: &originalValue,
		Matched:       &matched,
	}
}

func CalculateReportScore(caseScores []*CaseScore) *ReportScore {
	if len(caseScores) == 0 {
		return &ReportScore{
			TotalScore:  0,
			Level:       "normal",
			CaseScores:  []*CaseScore{},
			EvaluatedAt: time.Now().UnixMilli(),
		}
	}
	caseWeight := 1.0 / float64(len(caseScores))
	totalScore := 0.0
	for _, cs := range caseScores {
		cs.Weight = caseWeight
		cs.WeightedScore = cs.Score * cs.Weight
		totalScore += cs.WeightedScore
	}
	totalScore = math.Round(totalScore*100) / 100
	return &ReportScore{
		TotalScore:  totalScore,
		Level:       GetScoreLevel(totalScore),
		CaseScores:  caseScores,
		EvaluatedAt: time.Now().UnixMilli(),
	}
}
