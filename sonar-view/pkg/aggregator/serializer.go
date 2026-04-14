package aggregator

import (
	"fmt"
	"sonar-view/pkg/storage"
	"strconv"
	"time"

	"github.com/prometheus/prometheus/model/labels"
)

type AggregatedPointSerializer struct{}

func NewAggregatedPointSerializer() storage.Serializer[AggregatedPoint] {
	return &AggregatedPointSerializer{}
}

func (s *AggregatedPointSerializer) ToLabels(point AggregatedPoint) storage.Labels {
	builder := labels.NewBuilder(point.Labels)
	builder.Set("__name__", point.Name)
	builder.Set(string(AggregatedInternalLabelStatisticSuffix), string(point.AggregationType))
	builder.Set(string(AggregatedInternalLabelDatasourceId), point.DatasourceId)
	builder.Set(string(AggregatedInternalLabelAggregationLevel), point.Level)
	builder.Set(string(AggregatedInternalLabelDataStatus), string(point.Quality.Status))
	builder.Set(string(AggregatedInternalLabelDataScore), fmt.Sprintf("%.0f", point.Quality.Score))
	return builder.Labels()
}

func (s *AggregatedPointSerializer) ToTimestamp(point AggregatedPoint) int64 {
	return point.Timestamp.Time().UnixMilli()
}

func (s *AggregatedPointSerializer) ToValue(point AggregatedPoint) float64 {
	return point.Value
}

func (s *AggregatedPointSerializer) FromDataPoint(dp *storage.DataPoint) AggregatedPoint {
	builder := labels.NewBuilder(dp.Labels)
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
			builder.Del(l.Name)
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
		Name:            dp.MetricName,
		Labels:          builder.Labels(),
		Level:           level,
		DatasourceId:    datasourceId,
		Timestamp:       UnixMilliTime(time.UnixMilli(dp.Timestamp)),
		Date:            time.UnixMilli(dp.Timestamp).Format(time.DateTime),
		Quality:         DataQuality{Status: status, Score: score},
		AggregationType: aggregationType,
		Value:           dp.Value,
	}
}

func extractBaseName(metricName string) string {
	suffixes := []string{"_avg", "_min", "_max", "_sum", "_last"}
	for _, suffix := range suffixes {
		if endsWith(metricName, suffix) {
			return metricName[:len(metricName)-len(suffix)]
		}
	}
	return metricName
}

func endsWith(s, suffix string) bool {
	return len(s) >= len(suffix) && s[len(s)-len(suffix):] == suffix
}
