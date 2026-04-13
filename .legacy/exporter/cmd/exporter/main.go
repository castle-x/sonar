package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"exporter/config"
	"exporter/pkg/api"
	"exporter/pkg/chanutil"
	"exporter/pkg/collector"
	"exporter/pkg/configstore"
	"exporter/pkg/datasource"
	v1 "exporter/pkg/datasource/apis/metrics/v1"
	"exporter/pkg/metricsbuf"
	"exporter/pkg/nodeexporter"
	"exporter/pkg/watcher"

	"git.woa.com/castlexu/goutils/ablog"
	"github.com/spf13/cobra"
)

var logger = ablog.NewLogger("exporter")

func main() {
	var configFile string
	var adminAddr string
	rootCmd := &cobra.Command{
		Use:   "exporter",
		Short: "Unified node/process/log metrics exporter",
		Run: func(cmd *cobra.Command, args []string) {
			run(configFile, adminAddr)
		},
	}
	rootCmd.Flags().StringVarP(&configFile, "config", "c", "config.yaml", "path to config file")
	rootCmd.Flags().StringVarP(&adminAddr, "admin-addr", "a", "0.0.0.0:9090", "management API listen address")
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

func run(configFile, adminAddr string) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 信号处理
	signalHandler(cancel)

	// 初始化配置存储
	store, err := configstore.New(configFile)
	if err != nil {
		logger.Fatal("load config failed: %v", err)
		return
	}
	cfg := store.Get()

	// 通道容量
	channelSize := cfg.PushGateway.ChannelSize
	if channelSize == 0 {
		channelSize = 10000
	}

	// rawCh：所有 exporter/watcher 写入此通道
	// mainCh：datasource 从此通道消费
	// preview 缓冲区：TeeToPreview 从 rawCh 抄写一份
	rawCh := make(chan *v1.RequestMetricPoint, channelSize)
	mainCh := make(chan *v1.RequestMetricPoint, channelSize)
	preview := metricsbuf.New(200)

	// 启动 datasource（消费 mainCh）
	runDatasource(ctx, cfg, mainCh)

	// TeeToPreview：rawCh → preview + mainCh
	chanutil.TeeToPreview(ctx, rawCh, mainCh, preview)

	// 收集器列表（node + process 共用）
	collectors := []collector.Collector{
		collector.NewCPUCollector(),
		collector.NewMemCollector(),
		collector.NewNetworkCollector(),
		collector.NewDiskCollector(),
	}

	// 构建 exporter 列表
	exporters := buildExporters(ctx, cfg, collectors)

	// 创建 watcher 管理器
	watchManager := watcher.NewWatcherManager()
	runWatchers(ctx, cfg, rawCh, watchManager)

	// 启动 HTTP 管理 API
	apiServer := api.New(adminAddr, store, watchManager, preview)

	apiServer.Start()
	// 订阅配置热更新
	go handleConfigReload(ctx, store, collectors, watchManager, rawCh)

	// 定时采集 ticker（阻塞主 goroutine 直到 ctx cancel）
	recordTick(ctx, cfg.Step, rawCh, exporters)
}

// handleConfigReload 监听配置变更，动态更新 watcher
func handleConfigReload(ctx context.Context, store *configstore.Store, collectors []collector.Collector, watchManager *watcher.WatcherManager, ch chan *v1.RequestMetricPoint) {
	cfgCh := store.Subscribe()
	for {
		select {
		case <-ctx.Done():
			return
		case newCfg, ok := <-cfgCh:
			if !ok {
				return
			}
			logger.Info("config changed, applying hot reload for log watchers...")
			watchManager.StopAll()
			runWatchers(ctx, newCfg, ch, watchManager)
			logger.Info("hot reload completed")
			_ = collectors
		}
	}
}

func signalHandler(cancel context.CancelFunc) {
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		sig := <-sigCh
		logger.Info("received signal %v, shutting down gracefully...", sig)
		cancel()
	}()
}

func runDatasource(ctx context.Context, cfg *config.Config, ch chan *v1.RequestMetricPoint) {
	datasource.Run(ctx, cfg.PushGateway.Host, cfg.PushGateway.AppId, ch,
		datasource.WithPushEnabled(cfg.PushGateway.Enabled),
		datasource.WithPrintMetrics(cfg.PushGateway.PrintMetrics),
		datasource.WithBufSize(cfg.PushGateway.BufSize),
		datasource.WithLabels(cfg.PushGateway.Labels),
		datasource.WithReqTimeout(cfg.PushGateway.ReqTimeout),
		datasource.WithReportInterval(cfg.PushGateway.ReportInterval),
	)
}

func buildExporters(ctx context.Context, cfg *config.Config, collectors []collector.Collector) []nodeexporter.Exporter {
	var exporters []nodeexporter.Exporter

	if cfg.NodeExporter.Enabled {
		e := nodeexporter.NewNodeExporter(ctx, collectors,
			nodeexporter.WithLabels(cfg.NodeExporter.Labels),
		)
		exporters = append(exporters, e)
		logger.Info("NodeExporter enabled")
	}

	if cfg.ProcessExporter.Enabled {
		e := nodeexporter.NewProcessExporter(ctx, collectors,
			cfg.ProcessExporter.Rules,
			nodeexporter.WithDynamicInterval(cfg.ProcessExporter.DynamicInterval),
		)
		exporters = append(exporters, e)
		logger.Info("ProcessExporter enabled with %d rules", len(cfg.ProcessExporter.Rules))
	}

	return exporters
}

func runWatchers(ctx context.Context, cfg *config.Config, ch chan *v1.RequestMetricPoint, watchManager *watcher.WatcherManager) {
	for _, logCfg := range cfg.LogConfig {
		if !logCfg.Enabled {
			continue
		}
		if logCfg.FilePath != "" {
			watchManager.AddWatcher(ctx, ch, logCfg, logCfg.Name, logCfg.FilePath, -1, nil)
		}
		if len(logCfg.Rules) > 0 {
			go watchManager.WatcherProcessManagerRoutine(ctx, ch, logCfg)
		}
	}
}

func recordTick(ctx context.Context, step int, ch chan *v1.RequestMetricPoint, exporters []nodeexporter.Exporter) {
	if step == 0 {
		step = 15
	}
	interval := time.Duration(step) * time.Second
	logger.Info("recordTick started with interval: %v", interval)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.Info("recordTick exiting...")
			close(ch)
			return
		case <-ticker.C:
			ts := time.Now().Unix()
			for _, e := range exporters {
				e.Record(ch, ts)
			}
		}
	}
}
