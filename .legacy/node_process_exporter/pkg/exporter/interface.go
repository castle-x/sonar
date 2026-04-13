package exporter

import (
	v1 "node_process_exporter/pkg/pushgateway/apis/metrics/v1"
)

type Exporter interface {
	Record(ch chan *v1.RequestMetricPoint, timestamp int64)
}