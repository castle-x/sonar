package metrics

import (
	"context"
	"fmt"
	"exporter/config"
	v1 "exporter/pkg/datasource/apis/metrics/v1"
	"regexp"
	"strings"
	"sync"
	"time"

	"git.woa.com/castlexu/goutils/ablog"
	"git.woa.com/castlexu/goutils/tools"
)

var logger = ablog.NewLogger("metrics_handler")

// Handler 指标处理器
type Handler struct {
	metricConfig config.MetricConfig
	ch           chan *v1.RequestMetricPoint
	// lastPointMap 按文件存储最后一个数据点，用于采样密度控制。
	// 由 8 个 lineWorker 并发调用 Handle()，必须加锁保护。
	lastPointMutex sync.Mutex
	lastPointMap   map[string]*v1.RequestMetricPoint
	labels         map[string]string // 默认初始化标签（只读，不可修改）

	// 编译好的正则表达式（缓存）
	pattern *regexp.Regexp

	// 每分钟出现次数统计（按文件区分，需要并发保护）
	minuteCountMutex sync.Mutex
	minuteCountMap   map[string]int64
	ctx              context.Context
	cancel           context.CancelFunc
	wg               sync.WaitGroup
}

func NewHandler(ch chan *v1.RequestMetricPoint, metricConfig config.MetricConfig, labels map[string]string) *Handler {
	return NewHandlerWithContext(context.Background(), ch, metricConfig, labels)
}

// NewHandlerWithContext 创建 Handler，minuteCountReporter goroutine 受 parent context 控制。
// 主要用于测试中精确控制 goroutine 生命周期，避免 context 字段竞争。
func NewHandlerWithContext(parent context.Context, ch chan *v1.RequestMetricPoint, metricConfig config.MetricConfig, labels map[string]string) *Handler {
	ctx, cancel := context.WithCancel(parent)

	// 预编译正则表达式
	var pattern *regexp.Regexp
	if metricConfig.Pattern != "" {
		var err error
		pattern, err = regexp.Compile(metricConfig.Pattern)
		if err != nil {
			logger.Error("failed to compile pattern for metric %s: %v, pattern: %s",
				metricConfig.Name, err, metricConfig.Pattern)
			pattern = nil
		}
	}

	h := &Handler{
		metricConfig:   metricConfig,
		labels:         labels,
		ch:             ch,
		lastPointMap:   make(map[string]*v1.RequestMetricPoint),
		pattern:        pattern,
		minuteCountMap: make(map[string]int64),
		ctx:            ctx,
		cancel:         cancel,
	}

	// 如果启用了每分钟计数统计，启动定时上报协程
	if metricConfig.IsRecordMinuteCount {
		h.wg.Add(1)
		go h.minuteCountReporter()
	}

	return h
}

// Stop 停止 Handler，优雅关闭定时器协程
func (h *Handler) Stop() {
	if h.cancel != nil {
		h.cancel()
	}
	h.wg.Wait()
}

// minuteCountReporter 每分钟定时上报计数协程
func (h *Handler) minuteCountReporter() {
	defer h.wg.Done()

	// 计算下一个整数分钟的时间点
	now := time.Now()
	nextMinute := now.Truncate(time.Minute).Add(time.Minute)

	// 等待到下一个整数分钟
	timer := time.NewTimer(time.Until(nextMinute))
	defer timer.Stop()

	logger.Info("metrics handler [%s] minute count reporter started, first tick at %s",
		h.metricConfig.Name, nextMinute.Format("2006-01-02 15:04:05"))

	for {
		select {
		case <-h.ctx.Done():
			logger.Info("metrics handler [%s] minute count reporter stopped", h.metricConfig.Name)
			return
		case <-timer.C:
			// 获取并重置计数（持锁操作）
			h.minuteCountMutex.Lock()
			logger.Info("metrics handler [%s] minute count reporter tick, minute count map size: %v", h.metricConfig.Name, len(h.minuteCountMap))
			for filename, count := range h.minuteCountMap {
				// 上报数据点
				timestamp := time.Now().Truncate(time.Minute).Unix()
				h.ch <- h.newMinutePoint(filename, timestamp, float64(count))
				logger.Debug("metrics handler [%s] [%s] reported minute count: %d at %s",
					h.metricConfig.Name, filename, count, time.Unix(timestamp, 0).Format("2006-01-02 15:04:05"))
				h.minuteCountMap[filename] = 0
			}
			h.minuteCountMutex.Unlock()
			// 重置定时器为下一分钟
			timer.Reset(time.Minute)
		}
	}
}

func (h *Handler) Handle(line string, filename string) error {
	// 根据配置处理指标, 通过采样密度处理好，写入ch
	if !h.metricConfig.Enabled {
		return nil
	}
	if h.metricConfig.IsRecordMinuteCount {
		// 先初始化0值，后面可以上报0值
		h.minuteCountMutex.Lock()
		if _, ok := h.minuteCountMap[filename]; !ok {
			h.minuteCountMap[filename] = 0
		}
		h.minuteCountMutex.Unlock()
	}
	// 复制初始标签，避免并发修改问题
	labels := make(map[string]string)
	if h.labels != nil {
		for k, v := range h.labels {
			labels[k] = v
		}
	}
	labels["filename"] = filename // 文件名必须作为固定标签

	// 正则匹配（使用预编译的正则表达式）
	if h.pattern == nil {
		return nil
	}
	matches := h.pattern.FindStringSubmatch(line)
	if len(matches) == 0 {
		return nil
	}

	point := &v1.RequestMetricPoint{
		Timestamp: time.Now().Unix(),
		Labels:    labels,
		Name:      &h.metricConfig.Name,
	}

	timestampReIndex := tools.Atoi(ExtractDigits(h.metricConfig.Timestamp))
	timestampFormat := h.metricConfig.TimestampFormat
	timeZone := h.metricConfig.TimeZone
	if timeZone == "" {
		timeZone = "Asia/Shanghai"
	}
	if timestampReIndex != 0 && timestampFormat != "" {
		// 解析时区
		var location *time.Location
		var err error

		if timeZone == "Asia/Shanghai" || timeZone == "" {
			// 上海时区 UTC+8
			location = time.FixedZone("CST", 8*3600)
		} else {
			// 尝试加载其他时区
			location, err = time.LoadLocation(timeZone)
			if err != nil {
				logger.Error("failed to load timezone %s, using UTC: %v", timeZone, err)
				location = time.UTC
			}
		}

		// 处理时间戳字符串：将最后一个冒号替换为点，以支持毫秒解析
		// 例如：2025.11.25-15.00.49:640 -> 2025.11.25-15.00.49.640
		timestampStr := matches[timestampReIndex]
		// 所有冒号全部替换为.
		timestampStr = strings.ReplaceAll(timestampStr, ":", ".")
		timestampFormat = strings.ReplaceAll(timestampFormat, ":", ".")

		timestamp, err := time.ParseInLocation(timestampFormat, timestampStr, location)
		if err != nil {
			logger.Error("metrics handler parse timestamp failed, format: %s, value: %s, timezone: %s, error: %v",
				timestampFormat, matches[timestampReIndex], timeZone, err)
			return err
		}
		point.Timestamp = timestamp.UnixMilli() // 要精确到毫秒，避免一秒内重复上传数据点导致数据丢失
		// logger.Debug("parsed timestamp: %s -> %d (%s)", matches[timestampReIndex], point.Timestamp, timestamp.Format("2006-01-02 15:04:05"))
	}
	//
	valueReIndex := tools.Atoi(ExtractDigits(h.metricConfig.Value))
	if valueReIndex != 0 {
		point.Value = tools.Atof64(matches[valueReIndex])
	}

	for key, value := range h.metricConfig.Labels {
		if value == "" {
			continue
		}
		index := tools.Atoi(ExtractDigits(value))
		if index > len(matches) {
			continue
		}
		labels[key] = matches[index]
	}
	// logger.Info("metrics handler handle line: %s, filename: %s", line, filename)

	// 如果启用了每分钟计数统计，原子累加计数（并发安全）
	if h.metricConfig.IsRecordMinuteCount {
		h.minuteCountMutex.Lock()
		h.minuteCountMap[filename]++
		h.minuteCountMutex.Unlock()
	}

	// 根据采样密度处理（按文件区分）。
	// lastPointMap 由多个 lineWorker 并发访问，需要加锁。
	h.lastPointMutex.Lock()
	if lastPoint, exists := h.lastPointMap[filename]; exists && h.metricConfig.Density != 0 {
		if point.Timestamp-lastPoint.Timestamp < int64(h.metricConfig.Density) {
			h.lastPointMutex.Unlock()
			return nil
		}
	}
	h.lastPointMap[filename] = point
	h.lastPointMutex.Unlock()

	h.ch <- point
	return nil
}

func (h *Handler) newMinutePoint(filename string, timestamp int64, value float64) *v1.RequestMetricPoint {
	name := fmt.Sprintf("%s_count_per_minute", h.metricConfig.Name)
	// 复制 labels，避免并发修改问题
	labels := make(map[string]string)
	for k, v := range h.labels {
		labels[k] = v
	}
	labels["filename"] = filename
	return &v1.RequestMetricPoint{
		Timestamp: timestamp,
		Name:      &name,
		Value:     value,
		Labels:    labels,
	}
}

// ExtractDigits 从字符串中提取所有数字
func ExtractDigits(s string) string {
	result := ""
	for _, char := range s {
		if char >= '0' && char <= '9' {
			result += string(char)
		}
	}
	return result
}
