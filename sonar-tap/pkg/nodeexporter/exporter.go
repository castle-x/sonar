package nodeexporter

import (
	"context"

	"sonar-tap/config"
	metrics "sonar-tap/internal/api/sonar-store/metrics/v1"
	"sonar-tap/pkg/collector"
	"sonar-tap/pkg/process"

	"github.com/castle-x/goutils/ablog"
)

var logger = ablog.NewLogger("node-exporter")

// Exporter 采集器接口
type Exporter interface {
	// Record 触发一次采集，将指标写入 ch
	Record(ch chan *metrics.MetricPoint, timestamp int64)
}

// ============================================================
// NodeExporter - 节点级采集器
// ============================================================

// NodeExporterOpt 选项函数
type NodeExporterOpt func(*NodeExporter)

// NodeExporter 节点级采集器
type NodeExporter struct {
	collectors []collector.Collector
	labels     map[string]string
}

// WithLabels 设置固定标签
func WithLabels(labels map[string]string) NodeExporterOpt {
	return func(e *NodeExporter) {
		e.labels = labels
	}
}

// NewNodeExporter 创建节点采集器
func NewNodeExporter(_ context.Context, collectors []collector.Collector, opts ...NodeExporterOpt) Exporter {
	e := &NodeExporter{collectors: collectors}
	for _, opt := range opts {
		opt(e)
	}
	return e
}

// Record 触发一次节点指标采集
func (e *NodeExporter) Record(ch chan *metrics.MetricPoint, timestamp int64) {
	count := 0
	for _, c := range e.collectors {
		nodeMetrics, err := c.CollectNode()
		if err != nil {
			continue
		}
		for _, metric := range nodeMetrics {
			count++
			labels := make(map[string]string, len(e.labels)+len(metric.Labels))
			for k, v := range e.labels {
				labels[k] = v
			}
			for k, v := range metric.Labels {
				labels[k] = v
			}
			ch <- &metrics.MetricPoint{
				Timestamp: timestamp,
				Name:      metric.MetricName,
				Value:     metric.MetricValue,
				Labels:    labels,
			}
		}
	}
	logger.Info("NodeExporter.Record: %d metrics collected", count)
}

// ============================================================
// ProcessExporter - 进程级采集器
// ============================================================

// ProcessExporterOpt 选项函数
type ProcessExporterOpt func(*ProcessExporter)

// ProcessExporter 进程级采集器
type ProcessExporter struct {
	collectors      []collector.Collector
	processManager  *process.ProcessManager
	dynamicInterval int
}

// WithDynamicInterval 设置进程动态刷新间隔
func WithDynamicInterval(dynamicInterval int) ProcessExporterOpt {
	return func(e *ProcessExporter) {
		e.dynamicInterval = dynamicInterval
	}
}

// NewProcessExporter 创建进程采集器
func NewProcessExporter(ctx context.Context, collectors []collector.Collector, rules []config.Rule, opts ...ProcessExporterOpt) Exporter {
	e := &ProcessExporter{collectors: collectors}
	for _, opt := range opts {
		opt(e)
	}
	e.processManager = process.NewProcessManager(ctx, rules, e.dynamicInterval)
	return e
}

// GetProcessManager 返回进程管理器
func (e *ProcessExporter) GetProcessManager() *process.ProcessManager {
	return e.processManager
}

// Record 触发一次进程指标采集
func (e *ProcessExporter) Record(ch chan *metrics.MetricPoint, timestamp int64) {
	if e.processManager == nil {
		return
	}
	count := 0
	e.processManager.GetProcessMap().Range(func(_ int32, proc *process.Process) bool {
		for _, c := range e.collectors {
			procMetrics, err := c.CollectProcess(proc)
			if err != nil {
				continue
			}
			for k, v := range procMetrics {
				count++
				val, _ := v.(float64)
				ch <- &metrics.MetricPoint{
					Timestamp: timestamp,
					Name:      k,
					Value:     val,
					Labels:    proc.GetLabels(),
				}
			}
		}
		return true
	})
	logger.Info("ProcessExporter.Record: %d metrics collected", count)
}
