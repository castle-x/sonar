package aggregator

import (
	"fmt"
	"math"
	"sonar-view/pkg/storage"
	"time"

	"github.com/prometheus/prometheus/model/labels"
)

func Aggregate(points []AggregatedPoint, level string, timestamp time.Time, quality DataQuality) []AggregatedPoint {
	if len(points) == 0 {
		return nil
	}
	groups := groupByMetric(points)
	result := make([]AggregatedPoint, 0, len(groups))
	for datasourceId, group := range groups {
		for _, pointsGroup := range group {
			for _type, pts := range pointsGroup {
				aggregated := aggregateGroup(datasourceId, pts, level, timestamp, quality, _type)
				result = append(result, aggregated)
			}
		}
	}
	return result
}

func AggregateRaw(rawPoints []RawMetricPoint, level string, timestamp time.Time) []AggregatedPoint {
	if len(rawPoints) == 0 {
		return nil
	}
	groups := groupRawByMetric(rawPoints)
	result := make([]AggregatedPoint, 0, len(groups))
	for datasourceId, group := range groups {
		for _, pts := range group {
			for _, _type := range AggregationTypeList {
				aggregated := aggregateRawGroup(datasourceId, pts, level, timestamp, _type)
				result = append(result, aggregated)
			}
		}
	}
	return result
}

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
		groups[point.DatasourceId][key][point.AggregationType] = append(groups[point.DatasourceId][key][point.AggregationType], point)
	}
	return groups
}

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

func aggregateGroup(datasourceId string, points []AggregatedPoint, level string, timestamp time.Time, quality DataQuality, aggregationType AggregationType) AggregatedPoint {
	if len(points) == 0 {
		return AggregatedPoint{}
	}
	first := points[0]
	var value float64
	switch aggregationType {
	case AggregationTypeMin:
		value = math.MaxFloat64
	case AggregationTypeMax:
		value = -math.MaxFloat64
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
		case AggregationTypeCount:
			value += p.Value
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

func aggregateRawGroup(datasourceId string, points []RawMetricPoint, level string, timestamp time.Time, aggregationType AggregationType) AggregatedPoint {
	if len(points) == 0 {
		return AggregatedPoint{}
	}
	first := points[0]
	stats := ValueStats{Min: math.MaxFloat64, Max: -math.MaxFloat64}
	for _, p := range points {
		stats.Sum += p.Value
		stats.Min = math.Min(stats.Min, p.Value)
		stats.Max = math.Max(stats.Max, p.Value)
		stats.Last = p.Value
	}
	stats.Avg = stats.Sum / float64(len(points))
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
	case AggregationTypeCount:
		point.Value = float64(len(points))
	case AggregationTypeLast:
		point.Value = stats.Last
	}
	return point
}

func countUniqueMetrics(points []AggregatedPoint) int {
	uniqueKeys := make(map[string]struct{})
	for _, point := range points {
		businessLabels := filterBusinessLabels(point.Labels)
		key := fmt.Sprintf("%s|%s", point.DatasourceId, generateMetricKey(point.Name, businessLabels))
		uniqueKeys[key] = struct{}{}
	}
	return len(uniqueKeys)
}

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

func generateMetricKey(name string, lbls storage.Labels) string {
	return name + lbls.String()
}

func AlignTimestamp(t time.Time, interval time.Duration) time.Time {
	return t.Truncate(interval)
}

func IsTimeBoundary(now time.Time, interval, minInterval time.Duration) bool {
	aligned := now.Truncate(interval)
	return now.Sub(aligned) < minInterval
}

func CalculateExpectedPoints(interval, sourceInterval time.Duration) int {
	if sourceInterval == 0 {
		return 1
	}
	return int(interval / sourceInterval)
}

func ValidateAggregationChain(levels []LevelConfig) error {
	if len(levels) == 0 {
		return fmt.Errorf("no levels configured")
	}
	if levels[0].Source != "raw" {
		return fmt.Errorf("first level must be 'raw'")
	}
	for i := 1; i < len(levels); i++ {
		found := false
		for j := 0; j < i; j++ {
			if levels[j].Name == levels[i].Source {
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("level '%s' references unknown source '%s'", levels[i].Name, levels[i].Source)
		}
	}
	return nil
}
