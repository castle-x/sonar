package exporter

import (
	"context"
	"node_process_exporter/config"
	"node_process_exporter/pkg/collector"
	"node_process_exporter/pkg/process"
	v1 "node_process_exporter/pkg/pushgateway/apis/metrics/v1"

	"git.woa.com/castlexu/goutils/ablog"
)

var logger = ablog.NewLogger("processExporter")

type ProcessExporterOpt func(*ProcessExporter)

type ProcessExporter struct {
	collectors      []collector.Collector
	processManager  *process.ProcessManager // 进程管理
	dynamicInterval int                     // 动态增减进程开关
	rules           []config.Rule           // 进程匹配规则
}

func WithDynamicInterval(dynamicInterval int) ProcessExporterOpt {
	return func(e *ProcessExporter) {
		e.dynamicInterval = dynamicInterval
	}
}

func NewProcessExporter(ctx context.Context, collectors []collector.Collector, rules []config.Rule, opts ...ProcessExporterOpt) Exporter {
	processExporter := &ProcessExporter{collectors: collectors, rules: rules}
	for _, opt := range opts {
		opt(processExporter)
	}
	processExporter.processManager = process.NewProcessManager(ctx, processExporter.rules, processExporter.dynamicInterval)
	return processExporter
}

func (e *ProcessExporter) Record(ch chan *v1.RequestMetricPoint, timestamp int64) {
	// 搞个计数器,记录一下总共收集了多少个指标
	count := 0
	e.processManager.GetProcessMap().Range(func(pid int32, process *process.Process) bool {
		for _, collector := range e.collectors {
			metrics, err := collector.CollectProcess(process)
			if err != nil {
				continue
			}
			for k, v := range metrics {
				count++
				ch <- &v1.RequestMetricPoint{
					Timestamp: timestamp,
					Name:      &k,
					Value:     v.(float64),
					Labels:    process.GetLabels(),
				}
			}
		}
		return true
	})
	logger.Info("ProcessExporter Record (%d) metrics", count)
}
