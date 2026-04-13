package collector

import (
	"node_process_exporter/pkg/process"
)
type Type int

type NodeMetric struct {
	// 采集指标数据时会可能也会产生特殊标签
	Labels map[string]string
	MetricName string
	MetricValue float64
}

type Collector interface {
	CollectNode() ([]NodeMetric,error)
	CollectProcess(process *process.Process) (map[string]any,error)
}
