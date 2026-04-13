package storage

import (
	metricsv1 "sonar-store/internal/api/sonar-store/metrics/v1"

	"github.com/prometheus/prometheus/model/labels"
)

// metricPointSerializer 实现 Serializer[*metricsv1.MetricPoint]，内置于 storage 包避免循环依赖
type metricPointSerializer struct{}

func newMetricPointSerializer() Serializer[*metricsv1.MetricPoint] {
	return &metricPointSerializer{}
}

func (s *metricPointSerializer) ToLabels(point *metricsv1.MetricPoint, lbs ...string) Labels {
	var builder *labels.Builder
	if len(lbs) > 0 && len(lbs)%2 == 0 {
		builder = labels.NewBuilder(labels.FromStrings(lbs...))
	} else {
		builder = labels.NewBuilder(labels.EmptyLabels())
	}
	builder.Set("__name__", point.GetName())
	if point.IsSetLabelList() && len(point.GetLabelList())%2 == 0 {
		for i := 0; i < len(point.GetLabelList()); i += 2 {
			builder.Set(point.GetLabelList()[i], point.GetLabelList()[i+1])
		}
	}
	if point.IsSetLabels() {
		for k, v := range point.GetLabels() {
			builder.Set(k, v)
		}
	}
	return builder.Labels()
}

func (s *metricPointSerializer) ToTimestamp(point *metricsv1.MetricPoint) int64 {
	ts := point.GetTimestamp()
	if ts < 10000000000 {
		return ts * 1000
	}
	return ts
}

func (s *metricPointSerializer) ToValue(point *metricsv1.MetricPoint) float64 {
	return point.Value
}

func (s *metricPointSerializer) FromDataPoint(dp *DataPoint) *metricsv1.MetricPoint {
	point := &metricsv1.MetricPoint{}
	point.Timestamp = dp.Timestamp
	point.Value = dp.Value
	for _, l := range dp.Labels {
		if l.Name == "__name__" {
			point.Name = &l.Value
		} else {
			point.LabelList = append(point.LabelList, l.Name, l.Value)
		}
	}
	return point
}
