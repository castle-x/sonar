// Package datasource 提供 sonar-store 的上报客户端。
// 使用标准 net/http + JSON，替代旧版 Hertz + Thrift 依赖。
package datasource

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	metrics "sonar-tap/internal/api/sonar-store/metrics/v1"

	"github.com/castle-x/goutils/ablog"
	"github.com/castle-x/goutils/tools"
)

var logger = ablog.NewLogger("datasource-client")

// Opt 客户端选项函数
type Opt func(*Client)

// Client 数据上报客户端
type Client struct {
	pushEnabled    bool
	host           string
	appId          string
	timeout        time.Duration
	httpClient     *http.Client
	labels         map[string]string // 全局标签
	buf            []metrics.MetricPoint
	bufSize        int
	reportInterval time.Duration
	isPrint        bool
}

func WithPushEnabled(enabled bool) Opt {
	return func(c *Client) { c.pushEnabled = enabled }
}

func WithPrintMetrics(isPrint bool) Opt {
	return func(c *Client) { c.isPrint = isPrint }
}

func WithBufSize(size int) Opt {
	return func(c *Client) { c.bufSize = size }
}

func WithLabels(labels map[string]string) Opt {
	return func(c *Client) {
		for k, v := range labels {
			c.labels[k] = v
		}
	}
}

func WithReqTimeout(timeout int) Opt {
	return func(c *Client) { c.timeout = time.Duration(timeout) * time.Second }
}

func WithReportInterval(interval int) Opt {
	return func(c *Client) { c.reportInterval = time.Duration(interval) * time.Second }
}

// Run 启动上报客户端，从 ch 消费 MetricPoint 并批量上报到 sonar-store
func Run(ctx context.Context, host, appId string, ch chan *metrics.MetricPoint, opts ...Opt) {
	client := &Client{
		host:           host,
		appId:          appId,
		httpClient:     &http.Client{},
		timeout:        5 * time.Second,
		labels:         defaultLabels(),
		bufSize:        1000,
		reportInterval: 15 * time.Second,
		isPrint:        false,
		pushEnabled:    true,
	}
	for _, opt := range opts {
		opt(client)
	}
	client.buf = make([]metrics.MetricPoint, 0, client.bufSize)
	go client.reportRoutine(ctx, ch)
}

func (c *Client) reportRoutine(ctx context.Context, ch chan *metrics.MetricPoint) {
	if c.reportInterval <= 0 {
		c.reportInterval = 15 * time.Second
	}
	logger.Info("report routine started with interval: %v", c.reportInterval)

	ticker := time.NewTicker(c.reportInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.Info("report routine exit")
			c.flushMetrics("ctx done")
			return
		case metric, ok := <-ch:
			if !ok {
				logger.Info("channel closed, report routine exit.")
				c.flushMetrics("channel closed")
				return
			}
			c.buf = append(c.buf, *metric)
			if len(c.buf) >= c.bufSize {
				c.flushMetrics("buffer full")
			}
		case <-ticker.C:
			c.flushMetrics("ticker")
		}
	}
}

func (c *Client) flushMetrics(action string) {
	defer func() {
		c.buf = make([]metrics.MetricPoint, 0, c.bufSize)
	}()

	if len(c.buf) == 0 {
		return
	}

	if c.isPrint {
		c.printMetrics()
	}
	if !c.pushEnabled {
		return
	}

	req := metrics.ReportMetricsRequest{
		AppID:   c.appId,
		Metrics: c.buf,
		Labels:  c.labels,
	}

	payload, err := json.Marshal(req)
	if err != nil {
		logger.Error("marshal report request error: %v", err)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), c.timeout)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.host+"/apis/v1/metrics/batch", bytes.NewReader(payload))
	if err != nil {
		logger.Error("create request error: %v", err)
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		logger.Error("report error: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		logger.Error("report bad status=%d", resp.StatusCode)
		return
	}

	var respBody metrics.ReportMetricsResponse
	if err := json.NewDecoder(resp.Body).Decode(&respBody); err != nil {
		logger.Error("decode report response error: %v", err)
		return
	}

	if respBody.Code != 0 {
		logger.Error("report bad code=%d msg=%s", respBody.Code, respBody.Message)
		return
	}
	logger.Info("action(%v) report metrics success, code=%d, msg=%s count=%v", action, respBody.Code, respBody.Message, len(c.buf))
}

func (c *Client) printMetrics() {
	for _, metric := range c.buf {
		newLabels := make(map[string]string)
		for k, v := range c.labels {
			newLabels[k] = v
		}
		for k, v := range metric.Labels {
			newLabels[k] = v
		}
		newLabels["app_id"] = c.appId
		printBuf := map[string]any{
			"timestamp": metric.Timestamp,
			"name":      metric.Name,
			"value":     metric.Value,
			"labels":    newLabels,
		}
		fmt.Println(tools.Json(printBuf))
	}
}

func defaultLabels() map[string]string {
	return map[string]string{
		"host":     tools.GetLocalHost(),
		"ip":       tools.GetLocalIp(),
		"os":       tools.GetLocalOs(),
		"instance": tools.GetLocalIp() + ":9090", // sonar-tap 管理端口
	}
}
