// Package api 提供 exporter HTTP 管理接口（Hertz 框架）。
//
// 完整路由列表：
//
//	GET  /api/v1/config                 获取当前完整配置
//	PUT  /api/v1/config                 全量更新配置并持久化（触发热更新）
//	PATCH /api/v1/config/node           修改 node_exporter 配置段
//	PATCH /api/v1/config/process        修改 process_exporter 配置段
//	PATCH /api/v1/config/log            修改 log_config 配置段
//
//	GET  /api/v1/processes              实时查询当前机器所有进程
//	POST /api/v1/debug/match_process    测试：给定 rule，返回匹配进程 + labels
//	POST /api/v1/debug/match_log        测试：给定 pattern + 文本，返回提取值
//	POST /api/v1/debug/regex            在线正则调试（pattern + input → groups + named_groups + highlights）
//
//	GET  /api/v1/status                 agent 各 collector 健康状态和上报统计
//	GET  /api/v1/metrics/preview        最近采集到的 N 条指标预览（?limit=N，默认20）
//	                                    注意：此接口直接返回 {"metrics":[...]}，不使用其他接口的 {"code":0,"data":...} 通用包装格式
//
//	POST /api/v1/config/reload          从磁盘重新加载配置（热更新，不写盘）
//	GET  /api/v1/health                 健康检查
package api

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"time"

	"exporter/config"
	"exporter/pkg/configstore"
	"exporter/pkg/metricsbuf"
	"exporter/pkg/process"
	"exporter/pkg/watcher"

	gopsutil_process "github.com/shirou/gopsutil/v4/process"

	"git.woa.com/castlexu/goutils/ablog"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"
)

var logger = ablog.NewLogger("api-server")

// Server HTTP 管理服务
type Server struct {
	hz             *server.Hertz
	configStore    *configstore.Store
	watcherManager *watcher.WatcherManager
	metricsPreview *metricsbuf.RingBuffer
	addr           string
	startTime      time.Time
}

// New 创建 HTTP 管理服务
func New(addr string, store *configstore.Store, wm *watcher.WatcherManager, preview *metricsbuf.RingBuffer) *Server {
	h := server.Default(server.WithHostPorts(addr))
	s := &Server{
		hz:             h,
		configStore:    store,
		watcherManager: wm,
		metricsPreview: preview,
		addr:           addr,
		startTime:      time.Now(),
	}
	s.registerRoutes()
	return s
}

// registerRoutes 注册所有路由
func (s *Server) registerRoutes() {
	v1 := s.hz.Group("/api/v1")

	// 健康检查
	v1.GET("/health", s.health)

	// 配置管理
	v1.GET("/config", s.getConfig)
	v1.PUT("/config", s.putConfig)
	v1.PATCH("/config/node", s.patchConfigNode)
	v1.PATCH("/config/process", s.patchConfigProcess)
	v1.PATCH("/config/log", s.patchConfigLog)
	v1.POST("/config/reload", s.reloadConfig)

	// 进程查询
	v1.GET("/processes", s.listProcesses)

	// 调试接口
	v1.POST("/debug/match_process", s.debugMatchProcess)
	v1.POST("/debug/match_log", s.debugMatchLog)
	v1.POST("/debug/regex", s.debugRegex)

	// 状态 + 指标预览
	v1.GET("/status", s.getStatus)
	v1.GET("/metrics/preview", s.metricsPreviewHandler)
}

// Start 启动服务（非阻塞）
func (s *Server) Start() {
	go func() {
		logger.Info("management API server starting on %s", s.addr)
		s.hz.Spin()
	}()
}

// Shutdown 优雅关闭
func (s *Server) Shutdown(ctx context.Context) {
	if err := s.hz.Shutdown(ctx); err != nil {
		logger.Error("shutdown error: %v", err)
	}
}

// ============================================================
// 健康检查
// ============================================================

func (s *Server) health(_ context.Context, ctx *app.RequestContext) {
	ctx.JSON(http.StatusOK, map[string]string{
		"status": "ok",
		"uptime": time.Since(s.startTime).String(),
	})
}

// ============================================================
// 配置管理
// ============================================================

func (s *Server) getConfig(_ context.Context, ctx *app.RequestContext) {
	cfg := s.configStore.Get()
	ctx.JSON(http.StatusOK, okResp(cfg))
}

// putConfig 全量更新配置并持久化（触发热更新）
func (s *Server) putConfig(_ context.Context, ctx *app.RequestContext) {
	var newCfg config.Config
	if err := ctx.BindJSON(&newCfg); err != nil {
		ctx.JSON(http.StatusBadRequest, errResp(-1, "invalid request body: "+err.Error()))
		return
	}
	if err := s.configStore.UpdateAndSave(&newCfg); err != nil {
		ctx.JSON(http.StatusInternalServerError, errResp(-1, "save config failed: "+err.Error()))
		return
	}
	ctx.JSON(http.StatusOK, msgResp("config updated and saved"))
}

// patchConfigNode 仅更新 node_exporter 配置段
func (s *Server) patchConfigNode(_ context.Context, ctx *app.RequestContext) {
	var patch config.NodeExporter
	if err := ctx.BindJSON(&patch); err != nil {
		ctx.JSON(http.StatusBadRequest, errResp(-1, err.Error()))
		return
	}
	cfg := s.configStore.Get()
	newCfg := *cfg
	newCfg.NodeExporter = patch
	if err := s.configStore.UpdateAndSave(&newCfg); err != nil {
		ctx.JSON(http.StatusInternalServerError, errResp(-1, err.Error()))
		return
	}
	ctx.JSON(http.StatusOK, msgResp("node_exporter config updated"))
}

// patchConfigProcess 仅更新 process_exporter 配置段
func (s *Server) patchConfigProcess(_ context.Context, ctx *app.RequestContext) {
	var patch config.ProcessExporter
	if err := ctx.BindJSON(&patch); err != nil {
		ctx.JSON(http.StatusBadRequest, errResp(-1, err.Error()))
		return
	}
	cfg := s.configStore.Get()
	newCfg := *cfg
	newCfg.ProcessExporter = patch
	if err := s.configStore.UpdateAndSave(&newCfg); err != nil {
		ctx.JSON(http.StatusInternalServerError, errResp(-1, err.Error()))
		return
	}
	ctx.JSON(http.StatusOK, msgResp("process_exporter config updated"))
}

// patchConfigLog 仅更新 log_config 配置段
func (s *Server) patchConfigLog(_ context.Context, ctx *app.RequestContext) {
	var patch []config.LogConfig
	if err := ctx.BindJSON(&patch); err != nil {
		ctx.JSON(http.StatusBadRequest, errResp(-1, err.Error()))
		return
	}
	cfg := s.configStore.Get()
	newCfg := *cfg
	newCfg.LogConfig = patch
	if err := s.configStore.UpdateAndSave(&newCfg); err != nil {
		ctx.JSON(http.StatusInternalServerError, errResp(-1, err.Error()))
		return
	}
	ctx.JSON(http.StatusOK, msgResp("log_config updated"))
}

func (s *Server) reloadConfig(_ context.Context, ctx *app.RequestContext) {
	if err := s.configStore.Reload(); err != nil {
		ctx.JSON(http.StatusInternalServerError, errResp(-1, err.Error()))
		return
	}
	ctx.JSON(http.StatusOK, msgResp("config reloaded from disk"))
}

// ============================================================
// 进程查询
// ============================================================

// ProcessInfo 进程简要信息
type ProcessInfo struct {
	PID     int32  `json:"pid"`
	Name    string `json:"name"`
	Cmdline string `json:"cmdline"`
	Status  string `json:"status"`
}

func (s *Server) listProcesses(_ context.Context, ctx *app.RequestContext) {
	procs, err := gopsutil_process.Processes()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, errResp(-1, err.Error()))
		return
	}

	self := int32(os.Getpid())
	result := make([]ProcessInfo, 0, len(procs))
	for _, p := range procs {
		if p.Pid == self {
			continue
		}
		name, _ := p.Name()
		cmdline, _ := p.Cmdline()
		statuses, _ := p.Status()
		status := ""
		if len(statuses) > 0 {
			status = statuses[0]
		}
		result = append(result, ProcessInfo{
			PID:     p.Pid,
			Name:    name,
			Cmdline: cmdline,
			Status:  status,
		})
	}
	// 响应格式：{ "processes": [...] }
	ctx.JSON(http.StatusOK, map[string]any{
		"processes": result,
	})
}

// ============================================================
// 调试接口
// ============================================================

// DebugMatchProcessReq 进程规则测试请求
// cmdlines: 过滤条件列表，!开头为反选，与 config.Rule.Cmdlines 语义相同
type DebugMatchProcessReq struct {
	Cmdlines []string `json:"cmdlines"`
	// Name 可选，进程名过滤（与 config.Rule.Name 对应）
	Name string `json:"name,omitempty"`
}

// MatchedProcess 匹配结果
type MatchedProcess struct {
	PID     int32             `json:"pid"`
	Name    string            `json:"name"`
	Cmdline string            `json:"cmdline"`
	Labels  map[string]string `json:"labels"`
}

func (s *Server) debugMatchProcess(_ context.Context, ctx *app.RequestContext) {
	var req DebugMatchProcessReq
	if err := ctx.BindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, errResp(-1, err.Error()))
		return
	}

	// 将请求的 cmdlines 组装成 config.Rule
	rule := config.Rule{
		Name:     req.Name,
		Cmdlines: req.Cmdlines,
	}

	allProcs, err := gopsutil_process.Processes()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, errResp(-1, err.Error()))
		return
	}

	matched, err := process.NewProcesses(rule, allProcs)
	if err != nil {
		ctx.JSON(http.StatusOK, map[string]any{
			"processes": []any{},
			"error":     err.Error(),
		})
		return
	}

	result := make([]MatchedProcess, 0, len(matched))
	for _, p := range matched {
		result = append(result, MatchedProcess{
			PID:     p.GetPID(),
			Name:    p.GetName(),
			Labels:  p.GetLabels(),
		})
	}

	// 响应格式：{ "processes": [...] }
	ctx.JSON(http.StatusOK, map[string]any{
		"processes": result,
	})
}

// DebugMatchLogReq 日志匹配测试请求
type DebugMatchLogReq struct {
	// Pattern 日志行正则表达式
	Pattern string `json:"pattern"`
	// Text 单条日志样本
	Text string `json:"text"`
}

// DebugMatchLogResp 日志匹配结果
type DebugMatchLogResp struct {
	Matched  bool              `json:"matched"`
	Value    string            `json:"value,omitempty"`    // 第一个捕获组的值（通常是指标值）
	Captures map[string]string `json:"captures,omitempty"` // 命名捕获组 + 索引捕获组（$1/$2/...）
	Error    string            `json:"error,omitempty"`
}

func (s *Server) debugMatchLog(_ context.Context, ctx *app.RequestContext) {
	var req DebugMatchLogReq
	if err := ctx.BindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, errResp(-1, err.Error()))
		return
	}
	if req.Pattern == "" {
		ctx.JSON(http.StatusBadRequest, errResp(-1, "pattern is required"))
		return
	}

	re, err := regexp.Compile(req.Pattern)
	if err != nil {
		ctx.JSON(http.StatusOK, DebugMatchLogResp{
			Matched: false,
			Error:   "invalid pattern: " + err.Error(),
		})
		return
	}

	matches := re.FindStringSubmatch(req.Text)
	if len(matches) == 0 {
		ctx.JSON(http.StatusOK, DebugMatchLogResp{Matched: false})
		return
	}

	// 收集 captures：同时提供索引名（$1/$2/...）和命名组
	captures := make(map[string]string)
	names := re.SubexpNames()
	for i := 1; i < len(matches); i++ {
		// 索引名 $1, $2, ...
		captures[fmt.Sprintf("$%d", i)] = matches[i]
		// 命名组（如有）
		if i < len(names) && names[i] != "" {
			captures[names[i]] = matches[i]
		}
	}

	value := ""
	if len(matches) > 1 {
		value = matches[1]
	}

	ctx.JSON(http.StatusOK, DebugMatchLogResp{
		Matched:  true,
		Value:    value,
		Captures: captures,
	})
}

// DebugRegexReq 在线正则调试请求
type DebugRegexReq struct {
	Pattern string `json:"pattern"`
	Input   string `json:"input"`
}

// DebugRegexResp 在线正则调试结果
// 响应字段（以实际返回为准）：
//   - matched      bool               是否匹配
//   - groups       []string           索引捕获组，对应 $1/$2/...
//   - named_groups map[string]string  命名捕获组（如 (?P<name>...)）
//   - highlights   []HighlightRange   每个捕获组在 input 中的起止偏移
//   - error        string             正则编译失败时的错误信息
type DebugRegexResp struct {
	Matched      bool              `json:"matched"`
	Groups       []string          `json:"groups,omitempty"`       // 索引捕获组 $1/$2/...
	NamedGroups  map[string]string `json:"named_groups,omitempty"` // 命名捕获组
	Highlights   []HighlightRange  `json:"highlights,omitempty"`
	Error        string            `json:"error,omitempty"`
}

// HighlightRange 高亮范围（字节偏移）
type HighlightRange struct {
	Start int    `json:"start"`
	End   int    `json:"end"`
	Group int    `json:"group"`
	Text  string `json:"text"`
}

func (s *Server) debugRegex(_ context.Context, ctx *app.RequestContext) {
	var req DebugRegexReq
	if err := ctx.BindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, errResp(-1, err.Error()))
		return
	}
	if req.Pattern == "" {
		ctx.JSON(http.StatusBadRequest, errResp(-1, "pattern is required"))
		return
	}

	re, compileErr := regexp.Compile(req.Pattern)
	if compileErr != nil {
		ctx.JSON(http.StatusOK, DebugRegexResp{
			Matched: false,
			Error:   compileErr.Error(),
		})
		return
	}

	matches := re.FindStringSubmatch(req.Input)
	resp := DebugRegexResp{}
	if len(matches) == 0 {
		ctx.JSON(http.StatusOK, resp)
		return
	}

	resp.Matched = true

	// groups: 索引捕获组（$1, $2, ...）
	if len(matches) > 1 {
		resp.Groups = matches[1:]
	}

	// named_groups
	names := re.SubexpNames()
	namedGroups := make(map[string]string)
	for i, name := range names {
		if name != "" && i < len(matches) {
			namedGroups[name] = matches[i]
		}
	}
	if len(namedGroups) > 0 {
		resp.NamedGroups = namedGroups
	}

	// highlights: 每个捕获组的位置高亮
	indices := re.FindStringSubmatchIndex(req.Input)
	for i := 0; i+1 < len(indices); i += 2 {
		start, end := indices[i], indices[i+1]
		if start < 0 {
			continue
		}
		resp.Highlights = append(resp.Highlights, HighlightRange{
			Start: start,
			End:   end,
			Group: i / 2,
			Text:  req.Input[start:end],
		})
	}

	ctx.JSON(http.StatusOK, resp)
}

// ============================================================
// 状态 + 指标预览
// ============================================================

func (s *Server) getStatus(_ context.Context, ctx *app.RequestContext) {
	cfg := s.configStore.Get()
	total := s.watcherManager.GetTotalStats()

	ctx.JSON(http.StatusOK, okResp(map[string]any{
		"uptime":        time.Since(s.startTime).String(),
		"config_file":   s.configStore.GetConfigFile(),
		"node_exporter": map[string]any{
			"enabled": cfg.NodeExporter.Enabled,
		},
		"process_exporter": map[string]any{
			"enabled":          cfg.ProcessExporter.Enabled,
			"rules_count":      len(cfg.ProcessExporter.Rules),
			"dynamic_interval": cfg.ProcessExporter.DynamicInterval,
		},
		"log_watcher": map[string]any{
			"watcher_count":   s.watcherManager.GetWatcherCount(),
			"files_watched":   total.FilesWatched,
			"lines_processed": total.LinesProcessed,
			"errors":          total.Errors,
			"last_process":    total.LastProcessTime.Format(time.RFC3339),
		},
		"metrics_preview_buf": map[string]any{
			"size": s.metricsPreview.Len(),
		},
	}))
}

func (s *Server) metricsPreviewHandler(_ context.Context, ctx *app.RequestContext) {
	// query param: ?limit=20（默认20，最大200）
	limitStr := string(ctx.Query("limit"))
	limit := 20
	if limitStr != "" {
		if parsed, err := strconv.Atoi(limitStr); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	if limit > 200 {
		limit = 200
	}

	entries := s.metricsPreview.Latest(limit)

	// 将 Entry 转换为规格要求的字段名
	type MetricItem struct {
		Name      string            `json:"name"`
		Value     float64           `json:"value"`
		Labels    map[string]string `json:"labels"`
		Timestamp int64             `json:"timestamp"`
	}
	metrics := make([]MetricItem, 0, len(entries))
	for _, e := range entries {
		metrics = append(metrics, MetricItem{
			Name:      e.Name,
			Value:     e.Value,
			Labels:    e.Labels,
			Timestamp: e.Timestamp,
		})
	}

	// 响应格式：{ "metrics": [...] }
	ctx.JSON(http.StatusOK, map[string]any{
		"metrics": metrics,
	})
}

// ============================================================
// 辅助函数
// ============================================================

func okResp(data any) map[string]any {
	return map[string]any{"code": 0, "data": data}
}

func errResp(code int, msg string) map[string]any {
	return map[string]any{"code": code, "message": msg}
}

func msgResp(msg string) map[string]any {
	return map[string]any{"code": 0, "message": msg}
}

// 静默引入，防止编译器抱怨
var _ = filepath.Ext
