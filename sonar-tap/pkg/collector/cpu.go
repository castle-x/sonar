package collector

import (
	"fmt"
	"math"
	"strconv"
	"time"

	"sonar-tap/pkg/process"

	"github.com/castle-x/goutils/ablog"
	"github.com/castle-x/goutils/tools"
	"github.com/shirou/gopsutil/v4/cpu"
)

var logger = ablog.NewLogger("cpuCollector")

/*
	1. 机器cpu使用率
	2. 进程cpu使用率（Fix Bug#4-A: 使用 gopsutil Times() 跨平台，移除 /proc 依赖）
	3. 单核cpu使用率
*/

type CPUCollector struct{}

func NewCPUCollector() Collector {
	return &CPUCollector{}
}

func (c *CPUCollector) CollectNode() ([]NodeMetric, error) {
	metrics := make([]NodeMetric, 0)
	machineData, err := c.collectMachineCPU()
	if err != nil {
		return nil, err
	}
	metrics = append(metrics, machineData...)
	coreData, err := c.collectCoreCPU()
	if err != nil {
		return nil, err
	}
	metrics = append(metrics, coreData...)
	return metrics, nil
}

func (c *CPUCollector) CollectProcess(p *process.Process) (map[string]any, error) {
	return c.collectProcessCPU(p)
}

func (c *CPUCollector) collectMachineCPU() ([]NodeMetric, error) {
	cpuPercent, err := cpu.Percent(0, false)
	var finalCPUPercent float64
	if err != nil || len(cpuPercent) == 0 {
		finalCPUPercent = 0.0
	} else {
		finalCPUPercent = cpuPercent[0] / 100.0
	}
	return []NodeMetric{
		{
			MetricName:  "node_cpu_ratio",
			MetricValue: tools.RoundFloat64(finalCPUPercent, 3),
		},
	}, nil
}

func (c *CPUCollector) collectCoreCPU() ([]NodeMetric, error) {
	cpuPercentPerCore, err := cpu.Percent(0, true)
	metrics := make([]NodeMetric, 0)
	if err == nil && len(cpuPercentPerCore) > 0 {
		for i, corePercent := range cpuPercentPerCore {
			metrics = append(metrics, NodeMetric{
				MetricName:  "node_core_cpu",
				MetricValue: tools.RoundFloat64(corePercent/100.0, 3),
				Labels: map[string]string{
					"core_index": strconv.Itoa(i),
				},
			})
		}
	}
	return metrics, nil
}

// collectProcessCPU 使用 gopsutil Times() 跨平台采集进程 CPU ratio
// Fix Bug#4-A: 不再依赖 Linux 专属 /proc/[pid]/stat，macOS/Linux/Windows 均可正常采集
// Fix Bug#4-B: 指标名从 process_cpu_percent 改为 node_process_cpu_ratio，与 sonar-store 查询名对齐
func (c *CPUCollector) collectProcessCPU(p *process.Process) (map[string]any, error) {
	metric := map[string]any{
		"node_process_cpu_ratio": 0.0,
	}
	if p == nil || p.GetProcess() == nil {
		return nil, fmt.Errorf("process is nil")
	}
	if !p.IsAlive() {
		return nil, fmt.Errorf("process is not alive")
	}

	// gopsutil Times() 在 macOS 通过 proc_pidinfo syscall 实现，Linux 通过 /proc 实现
	times, err := p.GetProcess().Times()
	if err != nil {
		logger.Warn("get process cpu times error: %v", err)
		return metric, nil
	}
	totalTime := times.User + times.System
	now := time.Now().UnixNano()

	// 第一次采集：保存基准值，无法计算差值，返回 0
	if p.GetLastCPUTime() == 0 || p.GetLastSampleTime() == 0 {
		p.SetLastCPUTime(totalTime)
		p.SetLastSampleTime(now)
		return metric, nil
	}

	cpuDelta := totalTime - p.GetLastCPUTime()
	timeDelta := float64(now-p.GetLastSampleTime()) / 1e9
	if timeDelta < 0.01 {
		return metric, nil
	}

	cpuRatio := cpuDelta / timeDelta
	// 异常值保护：超过 10.0（1000% CPU）视为抖动，重置状态
	if cpuRatio > 10.0 {
		p.SetLastCPUTime(0)
		p.SetLastSampleTime(0)
		logger.Warn("process cpu ratio is too high (%v), reset", cpuRatio)
		return metric, nil
	}

	p.SetLastCPUTime(totalTime)
	p.SetLastSampleTime(now)
	metric["node_process_cpu_ratio"] = tools.RoundFloat64(math.Max(0, cpuRatio), 6)
	return metric, nil
}
