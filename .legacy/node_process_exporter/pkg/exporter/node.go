package exporter

import (
	"node_process_exporter/pkg/collector"
	"context"
	v1 "node_process_exporter/pkg/pushgateway/apis/metrics/v1"
)

type NodeExporterOpt func(*NodeExporter)

type NodeExporter struct {
	collectors []collector.Collector
	labels map[string]string // 固定配置的Node类型专属标签
}

func WithLabels(labels map[string]string) NodeExporterOpt {
	return func(e *NodeExporter) {
		e.labels = labels
	}
}

func NewNodeExporter(ctx context.Context, collectors []collector.Collector, opts ...NodeExporterOpt) Exporter {
	nodeExporter := &NodeExporter{collectors: collectors}
	for _, opt := range opts {
		opt(nodeExporter)
	}
	return nodeExporter
}

// 触发
func (e *NodeExporter) Record(ch chan *v1.RequestMetricPoint, timestamp int64) {
	count := 0
	for _, collector := range e.collectors {
		metrics, err := collector.CollectNode()
		if err != nil {
			continue
		}
		// 拼装请求, node没有额外的标签，所以不需要额外处理
		for _, metric := range metrics {
			count++
			// 合并标签
			labels := make(map[string]string)
			for k, v := range e.labels {
				labels[k] = v
			}
			for k, v := range metric.Labels {
				labels[k] = v
			}
			ch <- &v1.RequestMetricPoint{
				Timestamp: timestamp,
				Name:      &metric.MetricName,
				Value:     metric.MetricValue,
				Labels:    labels,
			}
		}
	}
	logger.Info("NodeExporter Record (%d) metrics", count)
}
