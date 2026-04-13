package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"node_process_exporter/config"
	"node_process_exporter/pkg/collector"
	"node_process_exporter/pkg/exporter"
	"node_process_exporter/pkg/pushgateway"
	v1 "node_process_exporter/pkg/pushgateway/apis/metrics/v1"

	"git.woa.com/castlexu/goutils/ablog"
	"github.com/spf13/cobra"
)

var logger = ablog.NewLogger("log_exporter")

func main() {
	// 使用cobra构造一个可以传递case文件路径的启动器
	var configFile string
	rootCmd := &cobra.Command{
		Use:   "node_process_exporter",
		Short: "node_process_exporter is a tool for running node_process_exporter",
		Run: func(cmd *cobra.Command, args []string) {
			run(configFile)
		},
	}
	rootCmd.Flags().StringVarP(&configFile, "config", "c", "config.yaml", "path to config file")
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
	config := config.InitConfig(caseFile)
	exporterList := make([]exporter.Exporter, 0)
	ch := make(chan *v1.RequestMetricPoint, config.PushGateway.ChannelSize)
	if config.NodeExporter.Enabled {
		// 创建NodeExporter
		nodeExporter, err := createNodeExporter(ctx, config)
		if err != nil {
			logger.Error("create NodeExporter failed, %v", err)
			return
		}
		exporterList = append(exporterList, nodeExporter)
	}
	if config.ProcessExporter.Enabled {
		// 创建ProcessExporter
		processExporter, err := createProcessExporter(ctx, config)
		if err != nil {
			logger.Error("create ProcessExporter failed, %v", err)
			return
		}
		exporterList = append(exporterList, processExporter)
	}
	runPushGateway(ctx, config, ch)
	recordTick(ctx, config.Step, ch, exporterList)
}

func recordTick(ctx context.Context, step int, ch chan *v1.RequestMetricPoint, exporterList []exporter.Exporter) {
	if step == 0 {
		// 默认15秒
		step = 15
	}
	stepInterval := time.Duration(step) * time.Second
	logger.Info("recordTick started with interval: %v", stepInterval)
	ticker := time.NewTicker(stepInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.Info("recordTick received shutdown signal, exiting gracefully...")
			close(ch) // 关闭channel通知pushgateway退出
			return
		case <-ticker.C:
			for _, exporter := range exporterList {
				exporter.Record(ch, time.Now().Unix())
			}
		}
	}
}

func createNodeExporter(ctx context.Context, config *config.Config) (exporter.Exporter, error) {
	exporter := exporter.NewNodeExporter(ctx, []collector.Collector{
		collector.NewCPUCollector(),
		collector.NewMemCollector(),
		collector.NewNetworkCollector(),
		collector.NewDiskCollector(),
	}, exporter.WithLabels(config.NodeExporter.Labels))
	return exporter, nil
}

func createProcessExporter(ctx context.Context, config *config.Config) (exporter.Exporter, error) {
	exporter := exporter.NewProcessExporter(ctx, []collector.Collector{
		collector.NewCPUCollector(),
		collector.NewMemCollector(),
		collector.NewNetworkCollector(),
		collector.NewDiskCollector(),
	}, config.ProcessExporter.Rules, exporter.WithDynamicInterval(config.ProcessExporter.DynamicInterval))
	return exporter, nil
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
