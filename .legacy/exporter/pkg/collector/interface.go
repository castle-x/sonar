package collector

import (
	"exporter/pkg/process"
)

// NodeMetric 节点级指标数据
type NodeMetric struct {
	// 采集时附带的标签（如网卡名、磁盘设备名）
	Labels     map[string]string
	MetricName  string
	MetricValue float64
}

// Collector 采集器接口
type Collector interface {
	// CollectNode 采集节点级指标
	CollectNode() ([]NodeMetric, error)
	// CollectProcess 采集进程级指标
	CollectProcess(process *process.Process) (map[string]any, error)
}
