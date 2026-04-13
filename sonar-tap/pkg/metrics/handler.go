package metrics

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"

	"sonar-tap/config"
	metricsapi "sonar-tap/internal/api/sonar-store/metrics/v1"

	"github.com/castle-x/goutils/ablog"
	"github.com/castle-x/goutils/tools"
)

var logger = ablog.NewLogger("metrics_handler")

// Handler 指标处理器
type Handler struct {
	metricConfig config.MetricConfig
	ch           chan *metricsapi.MetricPoint
	// lastPointMap 按文件存储最后一个数据点，用于采样密度控制。
	// 由 8 个 lineWorker 并发调用 Handle()，必须加锁保护。
	lastPointMutex sync.Mutex
	lastPointMap   map[string]*metricsapi.MetricPoint
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

func NewHandler(ch chan *metricsapi.MetricPoint, metricConfig config.MetricConfig, labels map[string]string) *Handler {
	return NewHandlerWithContext(context.Background(), ch, metricConfig, labels)
}

// NewHandlerWithContext 创建 Handler，minuteCountReporter goroutine 受 parent context 控制。
func NewHandlerWithContext(parent context.Context, ch chan *metricsapi.MetricPoint, metricConfig config.MetricConfig, labels map[string]string) *Handler {
	ctx, cancel := context.WithCancel(parent)

	// 预编译正则表达式
	var pat *regexp.Regexp
	if metricConfig.Pattern != "" {
		var err error
		pat, err = regexp.Compile(metricConfig.Pattern)
		if err != nil {
			logger.Error("failed to compile pattern for metric %s: %v, pattern: %s",
				metricConfig.Name, err, metricConfig.Pattern)
			pat = nil
		}
	}

	h := &Handler{
		metricConfig:   metricConfig,
		labels:         labels,
		ch:             ch,
		lastPointMap:   make(map[string]*metricsapi.MetricPoint),
		pattern:        pat,
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

	now := time.Now()
	nextMinute := now.Truncate(time.Minute).Add(time.Minute)

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
			h.minuteCountMutex.Lock()
			logger.Info("metrics handler [%s] minute count reporter tick, minute count map size: %v", h.metricConfig.Name, len(h.minuteCountMap))
			for filename, count := range h.minuteCountMap {
				timestamp := time.Now().Truncate(time.Minute).UnixMilli()
				h.ch <- h.newMinutePoint(filename, timestamp, float64(count))
				logger.Debug("metrics handler [%s] [%s] reported minute count: %d",
					h.metricConfig.Name, filename, count)
				h.minuteCountMap[filename] = 0
			}
			h.minuteCountMutex.Unlock()
			timer.Reset(time.Minute)
		}
	}
}

func (h *Handler) Handle(line string, filename string) error {
	if !h.metricConfig.Enabled {
		return nil
	}
	if h.metricConfig.IsRecordMinuteCount {
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
	labels["filename"] = filename

	// 正则匹配（使用预编译的正则表达式）
	if h.pattern == nil {
		return nil
	}
	matches := h.pattern.FindStringSubmatch(line)
	if len(matches) == 0 {
		return nil
	}

	point := &metricsapi.MetricPoint{
		Timestamp: time.Now().UnixMilli(),
		Labels:    labels,
		Name:      h.metricConfig.Name,
	}

	timestampReIndex := tools.Atoi(ExtractDigits(h.metricConfig.Timestamp))
	timestampFormat := h.metricConfig.TimestampFormat
	timeZone := h.metricConfig.TimeZone
	if timeZone == "" {
		timeZone = "Asia/Shanghai"
	}
	if timestampReIndex != 0 && timestampFormat != "" {
		var location *time.Location
		var err error

		if timeZone == "Asia/Shanghai" || timeZone == "" {
			location = time.FixedZone("CST", 8*3600)
		} else {
			location, err = time.LoadLocation(timeZone)
			if err != nil {
				logger.Error("failed to load timezone %s, using UTC: %v", timeZone, err)
				location = time.UTC
			}
		}

		timestampStr := matches[timestampReIndex]
		timestampStr = strings.ReplaceAll(timestampStr, ":", ".")
		timestampFormat = strings.ReplaceAll(timestampFormat, ":", ".")

		timestamp, err := time.ParseInLocation(timestampFormat, timestampStr, location)
		if err != nil {
			logger.Error("metrics handler parse timestamp failed, format: %s, value: %s, timezone: %s, error: %v",
				timestampFormat, matches[timestampReIndex], timeZone, err)
			return err
		}
		point.Timestamp = timestamp.UnixMilli()
	}

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

	// 如果启用了每分钟计数统计
	if h.metricConfig.IsRecordMinuteCount {
		h.minuteCountMutex.Lock()
		h.minuteCountMap[filename]++
		h.minuteCountMutex.Unlock()
	}

	// 根据采样密度处理（按文件区分）
	h.lastPointMutex.Lock()
	if lastPoint, exists := h.lastPointMap[filename]; exists && h.metricConfig.Density != 0 {
		// Density 单位秒，Timestamp 单位毫秒
		if point.Timestamp-lastPoint.Timestamp < int64(h.metricConfig.Density)*1000 {
			h.lastPointMutex.Unlock()
			return nil
		}
	}
	h.lastPointMap[filename] = point
	h.lastPointMutex.Unlock()

	h.ch <- point
	return nil
}

func (h *Handler) newMinutePoint(filename string, timestamp int64, value float64) *metricsapi.MetricPoint {
	name := fmt.Sprintf("%s_count_per_minute", h.metricConfig.Name)
	labels := make(map[string]string)
	for k, v := range h.labels {
		labels[k] = v
	}
	labels["filename"] = filename
	return &metricsapi.MetricPoint{
		Timestamp: timestamp,
		Name:      name,
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
