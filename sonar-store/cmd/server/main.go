package main

import (
	"flag"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/cloudwego/hertz/pkg/app/server"
	"go.uber.org/zap"

	"sonar-store/config"
	metricshandler "sonar-store/internal/handler/metrics"
	taphandler "sonar-store/internal/handler/tap"
	"sonar-store/internal/provider"
	"sonar-store/internal/router"
	"sonar-store/pkg/storage"
	"sonar-store/pkg/tap"
)

func main() {
	var configPath string
	flag.StringVar(&configPath, "config", "config/config.yaml", "path to config file")
	flag.Parse()

	// 初始化 logger
	logger, err := zap.NewProduction()
	if err != nil {
		panic("failed to create logger: " + err.Error())
	}
	defer logger.Sync() //nolint:errcheck
	sugar := logger.Sugar()

	// 加载配置
	cfg, err := config.Load(configPath)
	if err != nil {
		sugar.Warnw("failed to load config, using defaults", "error", err)
		cfg, _ = config.Load("")
	}

	sugar.Infow("starting sonar-store", "addr", cfg.Addr)

	// 初始化存储配置
	storageCfg := &storage.Config{
		DataDir:               cfg.Storage.DataDir,
		RetentionDays:         cfg.Storage.RetentionDays,
		WriteBufferSize:       cfg.Storage.WriteBufferSize,
		CompactionInterval:    time.Duration(cfg.Storage.CompactionIntervalSec) * time.Second,
		MemoryCleanupInterval: time.Duration(cfg.Storage.CleanupIntervalSec) * time.Second,
		MixBlockDuration:      time.Duration(cfg.Storage.MinBlockDurationSec) * time.Second,
		MaxBlockDuration:      time.Duration(cfg.Storage.MaxBlockDurationSec) * time.Second,
		MaxChunkSize:          cfg.Storage.MaxChunkSizeMB * 1024 * 1024,
	}

	// 创建 MetricStorage（在 internal/provider 中，避免循环依赖）
	metricStorage, err := provider.NewMetricStorage(storageCfg, logger)
	if err != nil {
		sugar.Fatalw("failed to create metric storage", "error", err)
		os.Exit(1)
	}
	defer metricStorage.Close() //nolint:errcheck

	// 初始化 tap manager
	tapCfg := &tap.ManagerConfig{
		StaleTimeout:    time.Duration(cfg.Tap.StaleTimeoutSec) * time.Second,
		CleanupInterval: time.Duration(cfg.Tap.CleanupIntervalSec) * time.Second,
		CleanupAfter:    time.Duration(cfg.Tap.CleanupAfterSec) * time.Second,
	}
	tapManager := tap.NewManager(tapCfg, logger)
	defer tapManager.Stop()

	// 初始化 handlers
	mh := metricshandler.NewMetricsHandler(metricStorage, tapManager, sugar)
	th := taphandler.NewTapHandler(tapManager, sugar)

	// 初始化 Hertz server
	h := server.Default(
		server.WithHostPorts(cfg.Addr),
	)

	// 注册路由
	router.Register(h, mh, th)

	// 启动 server（非阻塞）
	go func() {
		if err := h.Run(); err != nil {
			sugar.Errorw("server exited with error", "error", err)
		}
	}()

	// 等待退出信号
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	sugar.Info("shutting down sonar-store...")
}
