package metricshandler

import (
	"context"
	"net/http"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/prometheus/prometheus/model/labels"
	basev1 "sonar-store/internal/api/sonar-store/base/v1"
	metricsv1 "sonar-store/internal/api/sonar-store/metrics/v1"
	"sonar-store/internal/provider"
	"sonar-store/pkg/storage"
	"sonar-store/pkg/tap"

	"go.uber.org/zap"
)

// MetricsHandler 处理指标相关请求
type MetricsHandler struct {
	storage *provider.MetricStorage
	tap     *tap.Manager
	logger  *zap.SugaredLogger
}

// NewMetricsHandler 创建 MetricsHandler
func NewMetricsHandler(s *provider.MetricStorage, m *tap.Manager, logger *zap.SugaredLogger) *MetricsHandler {
	return &MetricsHandler{
		storage: s,
		tap:     m,
		logger:  logger,
	}
}

// ReportMetrics 批量上报指标
// POST /apis/v1/metrics/batch
func (h *MetricsHandler) ReportMetrics(ctx context.Context, c *app.RequestContext) {
	var req metricsv1.ReportMetricsRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, basev1.Failed(err, int64(basev1.BaseErrorCode_BAD_REQUEST)))
		return
	}

	if len(req.Metrics) == 0 {
		c.JSON(http.StatusOK, basev1.Success())
		return
	}

	// 构建全局标签列表：优先 LabelList，否则从 Labels map 转换
	globalLabels := req.LabelList
	if len(globalLabels) == 0 && len(req.Labels) > 0 {
		for k, v := range req.Labels {
			globalLabels = append(globalLabels, k, v)
		}
	}

	// 写入存储
	if err := h.storage.Store().Write(ctx, req.Metrics, globalLabels...); err != nil {
		h.logger.Errorw("failed to write metrics", "error", err)
		c.JSON(http.StatusInternalServerError, basev1.Failed(err, int64(basev1.BaseErrorCode_INTERNAL)))
		return
	}

	// 记录 tap scrape
	instance := extractLabelFromList(globalLabels, "instance")
	appID := req.AppID
	if appID == "" {
		appID = extractLabelFromList(globalLabels, "app_id")
	}
	if appID != "" && instance != "" {
		extraLabels := labelsListToMap(globalLabels, "app_id", "instance")
		h.tap.RecordScrape(appID, instance, extraLabels)
	}

	c.JSON(http.StatusOK, basev1.Success())
}

// QueryMetrics 查询指标
// POST /apis/v1/metrics/query
func (h *MetricsHandler) QueryMetrics(ctx context.Context, c *app.RequestContext) {
	var req metricsv1.MetricQuery
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, basev1.Failed(err, int64(basev1.BaseErrorCode_BAD_REQUEST)))
		return
	}

	var points []*metricsv1.MetricPoint
	var err error

	if req.IsSetPromql() {
		// PromQL 查询
		q := &storage.PromQLQuery{
			Query:     *req.Promql,
			StartTime: req.StartTime,
			EndTime:   req.EndTime,
			Step:      time.Second,
		}
		points, err = h.storage.Store().QueryByPromQL(ctx, q)
	} else {
		// 标签查询
		limit := 0
		if req.Limit != nil {
			limit = int(*req.Limit)
		}
		q := &storage.LabelQuery{
			MetricName: req.MetricName,
			Labels:     buildLabelsFromList(req.Labels),
			StartTime:  req.StartTime,
			EndTime:    req.EndTime,
			Limit:      limit,
		}
		points, err = h.storage.Store().QueryByLabels(ctx, q)
	}

	if err != nil {
		h.logger.Errorw("failed to query metrics", "error", err)
		c.JSON(http.StatusInternalServerError, basev1.Failed(err, int64(basev1.BaseErrorCode_INTERNAL)))
		return
	}

	resp := &metricsv1.QueryMetricsResponse{
		Points:     points,
		TotalCount: int64(len(points)),
	}
	c.JSON(http.StatusOK, basev1.Success(basev1.WithData(resp)))
}

// GetStats 获取存储统计信息
// POST /apis/v1/metrics/query_stats
func (h *MetricsHandler) GetStats(ctx context.Context, c *app.RequestContext) {
	stats, err := h.storage.Store().GetStats(ctx)
	if err != nil {
		h.logger.Errorw("failed to get stats", "error", err)
		c.JSON(http.StatusInternalServerError, basev1.Failed(err, int64(basev1.BaseErrorCode_INTERNAL)))
		return
	}

	resp := &metricsv1.GetStatsResponse{
		Stats: &metricsv1.StorageStats{
			TotalSeries:   stats.TotalSeries,
			TotalSamples:  stats.TotalSamples,
			DiskSize:      stats.DiskSize,
			TotalBlocks:   stats.TotalBlocks,
			MinTime:       stats.MinTime,
			MaxTime:       stats.MaxTime,
			MinTimeDate:   time.UnixMilli(stats.MinTime).Format("2006-01-02 15:04:05"),
			MaxTimeDate:   time.UnixMilli(stats.MaxTime).Format("2006-01-02 15:04:05"),
			RetentionDays: 7,
		},
	}
	c.JSON(http.StatusOK, basev1.Success(basev1.WithData(resp)))
}

// extractLabelFromList 从 k/v 列表中提取指定 key 的值
func extractLabelFromList(list []string, key string) string {
	for i := 0; i+1 < len(list); i += 2 {
		if list[i] == key {
			return list[i+1]
		}
	}
	return ""
}

// labelsListToMap 将 k/v 列表转为 map，排除指定 key
func labelsListToMap(list []string, excludeKeys ...string) map[string]string {
	exclude := make(map[string]bool, len(excludeKeys))
	for _, k := range excludeKeys {
		exclude[k] = true
	}
	result := make(map[string]string)
	for i := 0; i+1 < len(list); i += 2 {
		k := list[i]
		if !exclude[k] {
			result[k] = list[i+1]
		}
	}
	return result
}

// buildLabelsFromList 从 k/v 列表构建 prometheus Labels
func buildLabelsFromList(list []string) storage.Labels {
	if len(list) == 0 {
		return labels.EmptyLabels()
	}
	lb := labels.NewBuilder(labels.EmptyLabels())
	for i := 0; i+1 < len(list); i += 2 {
		lb.Set(list[i], list[i+1])
	}
	return lb.Labels()
}
