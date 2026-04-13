package main

import (
	"log_exporter/config"
	"log_exporter/pkg/watcher"
	"context"
	"git.woa.com/castlexu/goutils/ablog"
	"github.com/spf13/cobra"
	v1 "log_exporter/pkg/pushgateway/apis/metrics/v1"
	"log_exporter/pkg/pushgateway"
	"os"
	"time"
	"os/signal"
	"syscall"
)

var logger = ablog.NewLogger("log_exporter")

func main() {
	// 使用cobra构造一个可以传递case文件路径的启动器
	var caseFile string
	rootCmd := &cobra.Command{
		Use:   "log_exporter",
		Short: "log_exporter is a tool for running log_exporter",
		Run: func(cmd *cobra.Command, args []string) {
			run(caseFile)
		},
	}
	rootCmd.Flags().StringVarP(&caseFile, "config", "c", "config.yaml", "path to config file")
	rootCmd.Execute()
}

func signalHandler(cancel context.CancelFunc) {
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		sig := <-sigCh
		logger.Info("Received signal: %v, shutting down gracefully...", sig)
		cancel() // 取消context，通知所有goroutine优雅退出
	}()
}

func run(caseFile string) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel() // 确保退出时取消context
	// 启动信号处理
	signalHandler(cancel)
	cfg, err := config.LoadConfig(caseFile)
	if err != nil {
		logger.Error("load config failed, %v", err)
		return
	}
	ch := make(chan *v1.RequestMetricPoint, cfg.PushGateway.ChannelSize)
	runPushGateway(ctx, cfg, ch)
	runWatcherManager(ctx, cfg, ch)
}

func runWatcherManager(ctx context.Context, config *config.Config,ch chan *v1.RequestMetricPoint){
	watchManager := watcher.NewWatcherManager()
	for _, logConfig := range config.Logconfig {
		if !logConfig.Enabled {
			continue
		}
		// 判断获取日志的方式
		if logConfig.FilePath != "" {
			watchManager.AddWatcher(ctx, ch, logConfig, logConfig.Name, logConfig.FilePath,-1,nil)
		}
		if len(logConfig.Rules) > 0 {
			// 注入到WatcherManager中
			go watchManager.WatcherProcessManagerRoutine(ctx,ch,logConfig)
		}
	}
	// watchManager.StartAll(ctx)
	defer watchManager.StopAll()
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			watchManager.PrintStats(true)
		}
	}
}

func runPushGateway(ctx context.Context, config *config.Config, ch chan *v1.RequestMetricPoint) {
	pushgateway.Run(ctx, config.PushGateway.Host, config.PushGateway.AppId, ch,
		pushgateway.WithPushEnabled(config.PushGateway.Enabled),
		pushgateway.WithPrintMetrics(config.PushGateway.PrintMetrics),
		pushgateway.WithBufSize(config.PushGateway.BufSize),
		pushgateway.WithLabels(config.PushGateway.Labels),
		pushgateway.WithReqTimeout(config.PushGateway.ReqTimeout),
		pushgateway.WithReportInterval(config.PushGateway.ReportInterval))
}