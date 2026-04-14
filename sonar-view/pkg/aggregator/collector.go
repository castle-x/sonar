package aggregator

import (
	"context"
	"time"
)

// Collector 数据采集器接口
type Collector interface {
	Collect(ctx context.Context, startTime, endTime time.Time) ([]RawMetricPoint, error)
}

// MockCollector 模拟采集器（用于测试）
type MockCollector struct {
	data []RawMetricPoint
}

func NewMockCollector(data []RawMetricPoint) *MockCollector {
	return &MockCollector{data: data}
}

func (c *MockCollector) Collect(ctx context.Context, startTime, endTime time.Time) ([]RawMetricPoint, error) {
	return c.data, nil
}
