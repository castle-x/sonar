// Package chanutil 提供 channel 工具函数。
package chanutil

import (
	"context"

	metrics "sonar-tap/internal/api/sonar-store/metrics/v1"
	"sonar-tap/pkg/metricsbuf"
)

// TeeToPreview 将从 src 流出的每条指标同时推入 preview 缓冲区，并转发到 dst。
// src 由上游写入（通常是 nodeexporter/watcher），dst 由 datasource 消费。
// 这样 preview 可以看到最近采集的指标，不影响原有链路。
func TeeToPreview(ctx context.Context, src <-chan *metrics.MetricPoint, dst chan<- *metrics.MetricPoint, preview *metricsbuf.RingBuffer) {
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case pt, ok := <-src:
				if !ok {
					return
				}
				// 推入预览缓冲（非阻塞）
				preview.Push(pt)
				// 转发给 datasource
				select {
				case dst <- pt:
				case <-ctx.Done():
					return
				}
			}
		}
	}()
}
