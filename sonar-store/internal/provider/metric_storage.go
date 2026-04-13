package provider

import (
	metricsv1 "sonar-store/internal/api/sonar-store/metrics/v1"
	"sonar-store/pkg/serializer"
	"sonar-store/pkg/storage"

	"go.uber.org/zap"
)

// MetricStorage MetricPoint 的存储封装（避免 storage→serializer 循环依赖）
type MetricStorage struct {
	store  storage.Storage[*metricsv1.MetricPoint]
	logger *zap.Logger
}

// NewMetricStorage 创建 MetricStorage
func NewMetricStorage(config *storage.Config, logger *zap.Logger) (*MetricStorage, error) {
	ser := serializer.NewMetricPointSerializer()
	store, err := storage.NewPrometheusStorage[*metricsv1.MetricPoint](config, ser)
	if err != nil {
		return nil, err
	}
	return &MetricStorage{
		store:  store,
		logger: logger,
	}, nil
}

// Store 返回底层 Storage 接口，供 handler 直接使用
func (m *MetricStorage) Store() storage.Storage[*metricsv1.MetricPoint] {
	return m.store
}

// Close 关闭存储
func (m *MetricStorage) Close() error {
	return m.store.Close()
}
