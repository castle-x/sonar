package main

import (
	"context"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"sonar-tap/config"
	"sonar-tap/internal/handler"
	"sonar-tap/pkg/chanutil"
	"sonar-tap/pkg/collector"
	"sonar-tap/pkg/configstore"
	"sonar-tap/pkg/datasource"
	"sonar-tap/pkg/metricsbuf"
	"sonar-tap/pkg/nodeexporter"
	"sonar-tap/pkg/process"
	"sonar-tap/pkg/watcher"
	"sonar-tap/site"

	metrics "sonar-tap/internal/api/sonar-store/metrics/v1"

	"github.com/castle-x/goutils/ablog"
)

var logger = ablog.NewLogger("main")

func main() {
	// 配置文件路径（默认 config/config.yaml）
	configFile := "config/config.yaml"
	if len(os.Args) > 1 {
		configFile = os.Args[1]
	}

	// 监听地址（优先 LISTEN_ADDR，其次 PORT（gve dev 注入），默认 :9090）
	listenAddr := ":9090"
	if addr := os.Getenv("LISTEN_ADDR"); addr != "" {
		listenAddr = addr
	} else if port := os.Getenv("PORT"); port != "" {
		listenAddr = ":" + port
	}

	// 加载配置
	store, err := configstore.New(configFile)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}
	cfg := store.Get()

	// 创建全局 context
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 创建 channel 和 preview buffer
	channelSize := cfg.SonarStore.ChannelSize
	if channelSize <= 0 {
		channelSize = 4096
	}
	rawCh := make(chan *metrics.MetricPoint, channelSize)
	mainCh := make(chan *metrics.MetricPoint, channelSize)
	preview := metricsbuf.New(200)

	// 双 channel: rawCh → TeeToPreview → mainCh
	chanutil.TeeToPreview(ctx, rawCh, mainCh, preview)

	// 启动 sonar-store 上报客户端
	datasource.Run(ctx, cfg.SonarStore.Host, cfg.SonarStore.AppId, mainCh,
		datasource.WithPushEnabled(cfg.SonarStore.Enabled),
		datasource.WithReportInterval(cfg.SonarStore.ReportInterval),
		datasource.WithReqTimeout(cfg.SonarStore.ReqTimeout),
		datasource.WithBufSize(cfg.SonarStore.BufSize),
		datasource.WithLabels(cfg.SonarStore.Labels),
		datasource.WithPrintMetrics(cfg.SonarStore.PrintMetrics),
	)

	// 创建采集器
	collectors := []collector.Collector{
		collector.NewCPUCollector(),
		collector.NewMemCollector(),
		collector.NewNetworkCollector(),
		collector.NewDiskCollector(),
	}

	// 启动 NodeExporter
	var nodeExp nodeexporter.Exporter
	if cfg.NodeExporter.Enabled {
		nodeExp = nodeexporter.NewNodeExporter(ctx, collectors,
			nodeexporter.WithLabels(cfg.NodeExporter.Labels),
		)
	}

	// 启动 ProcessExporter
	var procExp nodeexporter.Exporter
	var procMgr *process.ProcessManager
	if cfg.ProcessExporter.Enabled {
		procExp = nodeexporter.NewProcessExporter(ctx, collectors, cfg.ProcessExporter.Rules,
			nodeexporter.WithDynamicInterval(cfg.ProcessExporter.DynamicInterval),
		)
		if pe, ok := procExp.(*nodeexporter.ProcessExporter); ok {
			procMgr = pe.GetProcessManager()
		}
	}

	// 启动采集 ticker
	go collectLoop(ctx, cfg, rawCh, nodeExp, procExp)

	// 启动 WatcherManager（日志监控）
	watcherManager := watcher.NewWatcherManager()
	runWatchers(ctx, cfg, rawCh, watcherManager)

	// 订阅配置变更，热更新 log watcher
	configCh := store.Subscribe()
	go handleConfigReload(ctx, configCh, rawCh, watcherManager)

	// 创建 HTTP 管理 API
	tapHandler := handler.NewTapHandler(store, preview, watcherManager, procMgr)
	mux := http.NewServeMux()

	// API 路由
	mux.HandleFunc("GET /api/v1/health", tapHandler.Health)
	mux.HandleFunc("GET /api/v1/config", tapHandler.GetConfig)
	mux.HandleFunc("PUT /api/v1/config", tapHandler.UpdateConfig)
	mux.HandleFunc("PATCH /api/v1/config/node", tapHandler.PatchNodeConfig)
	mux.HandleFunc("PATCH /api/v1/config/process", tapHandler.PatchProcessConfig)
	mux.HandleFunc("PATCH /api/v1/config/log", tapHandler.PatchLogConfig)
	mux.HandleFunc("POST /api/v1/config/reload", tapHandler.ReloadConfig)
	mux.HandleFunc("GET /api/v1/status", tapHandler.GetStatus)
	mux.HandleFunc("GET /api/v1/metrics/preview", tapHandler.GetMetricsPreview)
	mux.HandleFunc("GET /api/v1/processes", tapHandler.GetProcesses)
	mux.HandleFunc("POST /api/v1/debug/regex", tapHandler.DebugRegex)

	// Static file server with SPA fallback
	staticFS := site.DistDirFS
	if staticFS != nil {
		fileServer := http.FileServer(http.FS(staticFS))
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			// 不拦截 /api 路径
			if strings.HasPrefix(r.URL.Path, "/api/") {
				http.NotFound(w, r)
				return
			}
			path := strings.TrimPrefix(r.URL.Path, "/")
			if path == "" {
				path = "index.html"
			}
			if f, err := staticFS.(fs.ReadFileFS).ReadFile(path); err == nil {
				_ = f
				fileServer.ServeHTTP(w, r)
				return
			}
			// SPA fallback
			r.URL.Path = "/"
			fileServer.ServeHTTP(w, r)
		})
	}

	// 启动 HTTP 服务
	server := &http.Server{
		Addr:    listenAddr,
		Handler: mux,
	}

	// 优雅退出
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		logger.Info("received shutdown signal")
		cancel()
		watcherManager.StopAll()
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer shutdownCancel()
		server.Shutdown(shutdownCtx)
	}()

	logger.Info("sonar-tap starting on %s", listenAddr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
	logger.Info("sonar-tap stopped")
}

// collectLoop 采集主循环
func collectLoop(ctx context.Context, cfg *config.Config, ch chan *metrics.MetricPoint, nodeExp, procExp nodeexporter.Exporter) {
	step := cfg.Step
	if step <= 0 {
		step = 3
	}
	ticker := time.NewTicker(time.Duration(step) * time.Second)
	defer ticker.Stop()

	logger.Info("collect loop started with step=%ds", step)
	for {
		select {
		case <-ctx.Done():
			logger.Info("collect loop exit")
			return
		case <-ticker.C:
			timestamp := time.Now().UnixMilli()
			if nodeExp != nil {
				nodeExp.Record(ch, timestamp)
			}
			if procExp != nil {
				procExp.Record(ch, timestamp)
			}
		}
	}
}

// runWatchers 根据配置启动日志监控
func runWatchers(ctx context.Context, cfg *config.Config, ch chan *metrics.MetricPoint, wm *watcher.WatcherManager) {
	for _, logCfg := range cfg.LogConfig {
		if !logCfg.Enabled {
			continue
		}
		logCfgCopy := logCfg
		if logCfg.FilePath != "" {
			// 静态文件路径模式
			wm.AddWatcher(ctx, ch, logCfgCopy, logCfgCopy.Name, logCfgCopy.FilePath, -1, nil)
		} else if len(logCfg.Rules) > 0 {
			// 进程动态发现模式
			go wm.WatcherProcessManagerRoutine(ctx, ch, logCfgCopy)
		}
	}
}

// handleConfigReload 处理配置热更新
func handleConfigReload(ctx context.Context, configCh <-chan *config.Config, ch chan *metrics.MetricPoint, wm *watcher.WatcherManager) {
	for {
		select {
		case <-ctx.Done():
			return
		case newCfg, ok := <-configCh:
			if !ok {
				return
			}
			logger.Info("config changed, reloading watchers...")
			if err := wm.StopAll(); err != nil {
				logger.Error("stop watchers error: %v", err)
			}
			runWatchers(ctx, newCfg, ch, wm)
			logger.Info("watchers reloaded")
		}
	}
}

func init() {
	// 防止 fmt 未使用报错
	_ = fmt.Sprintf
}
