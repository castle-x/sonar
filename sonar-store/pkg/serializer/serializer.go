package serializer

import (
	metricsv1 "sonar-store/internal/api/sonar-store/metrics/v1"
	"sonar-store/pkg/storage"

	"github.com/prometheus/prometheus/model/labels"
)

// ============================================
// MetricPoint Serializer
// ============================================

// MetricPointSerializer 实现 storage.Serializer[*metricsv1.MetricPoint] 接口
type MetricPointSerializer struct{}

// NewMetricPointSerializer 创建序列化器
func NewMetricPointSerializer() storage.Serializer[*metricsv1.MetricPoint] {
	return &MetricPointSerializer{}
}

// ToLabels 实现 Serializer 接口
//
// 将 MetricPoint 转换为 Prometheus Labels
func (s *MetricPointSerializer) ToLabels(point *metricsv1.MetricPoint, lbs ...string) storage.Labels {
	var builder *labels.Builder
	if len(lbs) > 0 && len(lbs)%2 == 0 {
		builder = labels.NewBuilder(labels.FromStrings(lbs...))
	} else {
		builder = labels.NewBuilder(labels.EmptyLabels())
	}
	builder.Set("__name__", point.GetName())
	if point.IsSetLabelList() && len(point.GetLabelList())%2 == 0 {
		// 新的标签结构
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

// ToTimestamp 实现 Serializer 接口
// 自动识别时间戳格式并转换为毫秒级
func (s *MetricPointSerializer) ToTimestamp(point *metricsv1.MetricPoint) int64 {
	timestamp := point.GetTimestamp()

	// 如果时间戳小于10位数(小于10000000000)，认为是秒级时间戳，需要转换为毫秒
	if timestamp < 10000000000 {
		return timestamp * 1000
	}

	// 否则认为是毫秒级时间戳，直接返回
	return timestamp
}

// ToValue 实现 Serializer 接口
func (s *MetricPointSerializer) ToValue(point *metricsv1.MetricPoint) float64 {
	return point.Value
}

// FromDataPoint 实现 Serializer 接口 - 反序列化
// 从 TSDB 查询结果转换回 MetricPoint
func (s *MetricPointSerializer) FromDataPoint(dp *storage.DataPoint) *metricsv1.MetricPoint {
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
