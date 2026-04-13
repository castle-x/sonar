package router

import (
	"context"
	"net/http"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"
	metricshandler "sonar-store/internal/handler/metrics"
	taphandler "sonar-store/internal/handler/tap"
)

// Register 注册所有路由
func Register(h *server.Hertz, mh *metricshandler.MetricsHandler, th *taphandler.TapHandler) {
	// 健康检查
	h.GET("/health", func(ctx context.Context, c *app.RequestContext) {
		c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})

	// 指标相关路由
	v1 := h.Group("/apis/v1")
	{
		metrics := v1.Group("/metrics")
		{
			metrics.POST("/batch", mh.ReportMetrics)
			metrics.POST("/query", mh.QueryMetrics)
			metrics.POST("/query_stats", mh.GetStats)
		}

		// tap 相关路由（注意 /stats 必须在 /:id 前注册）
		taps := v1.Group("/taps")
		{
			taps.GET("", th.ListTaps)
			taps.GET("/stats", th.GetTapStats)
			taps.GET("/:id", th.GetTap)
		}
	}
}
