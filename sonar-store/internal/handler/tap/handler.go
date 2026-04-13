package taphandler

import (
	"net/http"

	"github.com/cloudwego/hertz/pkg/app"
	basev1 "sonar-store/internal/api/sonar-store/base/v1"
	tapv1 "sonar-store/internal/api/sonar-store/tap/v1"
	"sonar-store/pkg/tap"

	"context"

	"go.uber.org/zap"
)

// TapHandler 处理 tap 相关请求
type TapHandler struct {
	manager *tap.Manager
	logger  *zap.SugaredLogger
}

// NewTapHandler 创建 TapHandler
func NewTapHandler(m *tap.Manager, logger *zap.SugaredLogger) *TapHandler {
	return &TapHandler{
		manager: m,
		logger:  logger,
	}
}

// ListTaps 获取 tap 列表
// GET /apis/v1/taps
func (h *TapHandler) ListTaps(ctx context.Context, c *app.RequestContext) {
	var req tapv1.ListTapsRequest
	if err := c.BindQuery(&req); err != nil {
		c.JSON(http.StatusBadRequest, basev1.Failed(err, int64(basev1.BaseErrorCode_BAD_REQUEST)))
		return
	}

	filter := &tap.Filter{
		AppID:    req.AppID,
		Page:     req.Page,
		PageSize: req.PageSize,
	}
	if req.IsSetState() {
		state := req.GetState()
		filter.State = &state
	}

	taps, total := h.manager.ListTaps(filter)

	page := req.Page
	pageSize := req.PageSize
	resp := &tapv1.ListTapsResponse{
		Taps:     taps,
		Total:    total,
		Page:     &page,
		PageSize: &pageSize,
	}
	c.JSON(http.StatusOK, basev1.Success(basev1.WithData(resp)))
}

// GetTap 获取单个 tap
// GET /apis/v1/taps/:id
func (h *TapHandler) GetTap(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, basev1.Failed(nil, int64(basev1.BaseErrorCode_BAD_REQUEST)))
		return
	}

	t := h.manager.GetTap(id)
	if t == nil {
		c.JSON(http.StatusNotFound, basev1.Failed(nil, int64(basev1.BaseErrorCode_NOT_FOUND)))
		return
	}

	resp := &tapv1.GetTapResponse{Tap: t}
	c.JSON(http.StatusOK, basev1.Success(basev1.WithData(resp)))
}

// GetTapStats 获取 tap 统计信息
// GET /apis/v1/taps/stats
func (h *TapHandler) GetTapStats(ctx context.Context, c *app.RequestContext) {
	var req tapv1.GetTapStatsRequest
	if err := c.BindQuery(&req); err != nil {
		c.JSON(http.StatusBadRequest, basev1.Failed(err, int64(basev1.BaseErrorCode_BAD_REQUEST)))
		return
	}

	var stats *tapv1.TapStats
	if req.AppID != "" {
		stats = h.manager.GetStatsByAppID(req.AppID)
	} else {
		stats = h.manager.GetStats()
	}

	resp := &tapv1.GetTapStatsResponse{Stats: stats}
	c.JSON(http.StatusOK, basev1.Success(basev1.WithData(resp)))
}
