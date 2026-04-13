package serializer

import (
	v1 "datasource/apis/datasource/metrics/v1"
	"datasource/pkg/storage"

	"github.com/prometheus/prometheus/model/labels"
)

// ============================================
// RequestMetricPoint Serializer
// ============================================

// 实现 storage.Serializer[RequestMetricPoint] 接口
type RequestMetricPointSerializer struct{}

// NewRequestMetricPointSerializer 创建序列化器
func NewRequestMetricPointSerializer() storage.Serializer[*v1.MetricPoint] {
	return &RequestMetricPointSerializer{}
}

// ToLabels 实现 Serializer 接口
//
// 将 RequestMetricPoint 转换为 Prometheus Labels
// 策略：使用多个指标名称存储统计值
func (s *RequestMetricPointSerializer) ToLabels(point *v1.MetricPoint, lbs ...string) storage.Labels {
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
func (s *RequestMetricPointSerializer) ToTimestamp(point *v1.MetricPoint) int64 {
	timestamp := point.GetTimestamp()

	// 如果时间戳小于10位数(小于10000000000)，认为是秒级时间戳，需要转换为毫秒
	// 10000000000 对应 2001-09-09，在此之前的都认为是秒级
	if timestamp < 10000000000 {
		return timestamp * 1000
	}

	// 否则认为是毫秒级时间戳，直接返回
	return timestamp
}

// ToValue 实现 Serializer 接口
//
// 默认使用 Avg 作为主要值
func (s *RequestMetricPointSerializer) ToValue(point *v1.MetricPoint) float64 {
	return point.Value
}

// FromDataPoint 实现 Serializer 接口 - 反序列化
// 从 TSDB 查询结果转换回 RequestMetricPoint
func (s *RequestMetricPointSerializer) FromDataPoint(dp *storage.DataPoint) *v1.MetricPoint {
	point := &v1.MetricPoint{}
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
