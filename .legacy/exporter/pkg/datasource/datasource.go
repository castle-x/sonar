package datasource

import (
	"context"
	"fmt"
	v1 "exporter/pkg/datasource/apis/metrics/v1"
	"exporter/pkg/datasource/hzcli"
	"time"

	"git.woa.com/castlexu/goutils/ablog"
	"git.woa.com/castlexu/goutils/tools"
)

var logger = ablog.NewLogger("datasource-client")

/*
	pushgateway client sdk
*/

// 数据点格式
type Opt func(*Client)

type Client struct {
	pushEnabled bool
	host        string
	appId       string
	timeout     time.Duration
	cli         hzcli.Client
	labels      map[string]string // 全局Labels,批量上报指标时候携带的全局label
	buf         []*v1.RequestMetricPoint
	bufSize     int
	// 上报间隔
	reportInterval time.Duration
	// 是否打印指标
	isPrint bool
}

func WithPushEnabled(enabled bool) Opt {
	return func(c *Client) {
		c.pushEnabled = enabled
	}
}

func WithPrintMetrics(isPrint bool) Opt {
	return func(c *Client) {
		c.isPrint = isPrint
	}
}

func WithBufSize(size int) Opt {
	return func(c *Client) {
		c.bufSize = size
	}
}

func WithLabels(labels map[string]string) Opt {
	return func(c *Client) {
		for k, v := range labels {
			c.labels[k] = v
		}
	}
}

func WithReqTimeout(timeout int) Opt {
	return func(c *Client) {
		c.timeout = time.Duration(timeout) * time.Second
	}
}

func WithReportInterval(interval int) Opt {
	return func(c *Client) {
		c.reportInterval = time.Duration(interval) * time.Second
	}
}

func Run(ctx context.Context, host, appId string, ch chan *v1.RequestMetricPoint, opts ...Opt) {
	cli, err := hzcli.NewMetricsServiceClient(host)
	if err != nil {
		logger.Fatal("new metrics service client failed , %v", err)
		return
	}
	client := &Client{
		host:           host,
		appId:          appId,
		cli:            cli,
		timeout:        5 * time.Second,
		labels:         defaultLabels(),
		bufSize:        1000,             // 默认最大缓冲1000个指标
		reportInterval: 15 * time.Second, // 默认上报间隔15秒
		isPrint:        false,
		pushEnabled:    true,
	}
	for _, opt := range opts {
		opt(client)
	}
	client.buf = make([]*v1.RequestMetricPoint, 0, client.bufSize)
	go client.reportRoutine(ctx, ch)
}

func (c *Client) reportRoutine(ctx context.Context, ch chan *v1.RequestMetricPoint) {
	// 1. 缓冲满了立即刷新
	// 2. 上报间隔到了刷新
	// 3. 手动刷新
	// 注：上报失败了就不要了。不需要重试，避免重复写入（其实后面可以考虑重复写入，对于tsdb，只要时间戳一致，会进行覆盖的）。
	logger.Info("pushgateway report routine started with interval: %v", c.reportInterval)

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
			c.buf = append(c.buf, metric)
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
		c.buf = make([]*v1.RequestMetricPoint, 0, c.bufSize)
	}()

	if c.isPrint {
		c.printMetrics()
	}
	if !c.pushEnabled {
		return
	}
	// 组装请求
	req := &v1.ReportMetricsRequest{
		AppID:   c.appId,
		Metrics: c.buf,
		Labels:  c.labels,
	}
	ctx, cancel := context.WithTimeout(context.Background(), c.timeout)
	resp, _, err := c.cli.ReportMetrics(ctx, req)
	cancel()
	if err != nil {
		logger.Error("report error: %v", err)
		return
	}
	if resp.GetCode() != 0 {
		logger.Error("report bad code=%d msg=%s", resp.GetCode(), resp.GetMessage())
		return
	}
	logger.Info("action(%v) report metrics success, code=%d, msg=%s report count (%v)", action, resp.GetCode(), resp.GetMessage(), len(c.buf))
}

func (c *Client) printMetrics() {
	for _, metric := range c.buf {
		newLabels := make(map[string]string)
		for k, v := range c.labels {
			newLabels[k] = v
		}
		labels := mergeLabels(newLabels, metric.Labels)
		labels["app_id"] = c.appId
		printBuf := map[string]any{
			"timestamp": metric.Timestamp,
			"name":      metric.Name,
			"value":     metric.Value,
			"labels":    labels,
		}
		fmt.Println(tools.Json(printBuf))
	}
}

func mergeLabels(llabels, rlabels map[string]string) map[string]string {
	for k, v := range rlabels {
		llabels[k] = v
	}
	return llabels
}

func defaultLabels() map[string]string {
	return map[string]string{
		"host": tools.GetLocalHost(),
		"ip":   tools.GetLocalIp(),
		"os":   tools.GetLocalOs(),
	}
}
