// Package repo 提供数据访问层封装
package repo

import (
	"context"

	metricsv1 "sonar-store/internal/api/sonar-store/metrics/v1"
	"sonar-store/pkg/storage"
)

// MetricsRepo 指标存储仓库，薄封装 Storage 接口
type MetricsRepo struct {
	store storage.Storage[*metricsv1.MetricPoint]
}

// NewMetricsRepo 创建指标仓库
func NewMetricsRepo(store storage.Storage[*metricsv1.MetricPoint]) *MetricsRepo {
	return &MetricsRepo{store: store}
}

// Write 批量写入指标点
// globalLabels: 全局标签，交替 key/value 字符串列表（可选）
func (r *MetricsRepo) Write(ctx context.Context, points []*metricsv1.MetricPoint, globalLabels ...string) error {
	return r.store.Write(ctx, points, globalLabels...)
}

// QueryByLabels 通过标签查询
func (r *MetricsRepo) QueryByLabels(ctx context.Context, req *storage.LabelQuery) ([]*metricsv1.MetricPoint, error) {
	return r.store.QueryByLabels(ctx, req)
}

// QueryByPromQL 通过 PromQL 查询
func (r *MetricsRepo) QueryByPromQL(ctx context.Context, req *storage.PromQLQuery) ([]*metricsv1.MetricPoint, error) {
	return r.store.QueryByPromQL(ctx, req)
}

// GetStats 获取存储统计信息
func (r *MetricsRepo) GetStats(ctx context.Context) (*storage.Stats, error) {
	return r.store.GetStats(ctx)
}
