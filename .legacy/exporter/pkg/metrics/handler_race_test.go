package metrics

import (
	"context"
	"sync"
	"testing"
	"time"

	"exporter/config"
	v1 "exporter/pkg/datasource/apis/metrics/v1"
)

// TestHandleConcurrentRace 验证 8 个 goroutine 并发调用 Handle() 时
// lastPointMap 和 minuteCountMap 不发生 data race。
// 运行方式：go test -race ./pkg/metrics/...
func TestHandleConcurrentRace(t *testing.T) {
	ch := make(chan *v1.RequestMetricPoint, 10000)
	// 消费 ch，防止 Handle() 阻塞
	done := make(chan struct{})
	go func() {
		defer close(done)
		for range ch {
		}
	}()

	metricCfg := config.MetricConfig{
		Name:                "test_metric",
		Pattern:             `\[(\d+)\] value=(\d+\.\d+)`,
		Enabled:             true,
		Density:             0, // 不做密度限制，全量写入 lastPointMap
		IsRecordMinuteCount: true,
		Value:               "$2",
	}

	// 用短超时 context 控制 handler 内部 minuteCountReporter goroutine 的生命周期
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// NewHandler 内部使用独立的 context.WithCancel，此处仅用于测试驱动 Stop()
	h := NewHandlerWithContext(ctx, ch, metricCfg, map[string]string{"env": "test"})

	lines := []string{
		"[1234567890] value=3.14",
		"[1234567891] value=2.72",
		"[1234567892] value=1.41",
		"[1234567893] value=9.99",
	}
	filenames := []string{"file_a.log", "file_b.log", "file_c.log"}

	const workers = 8
	const iterations = 500

	var wg sync.WaitGroup
	for w := range workers {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for i := range iterations {
				line := lines[i%len(lines)]
				file := filenames[i%len(filenames)]
				if err := h.Handle(line, file); err != nil {
					t.Errorf("worker %d: Handle() error: %v", id, err)
				}
			}
		}(w)
	}

	wg.Wait()
	h.Stop()
	close(ch)
	<-done
}
