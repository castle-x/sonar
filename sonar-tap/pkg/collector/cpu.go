package collector

import (
	"fmt"
	"math"
	"os"
	"strconv"
	"strings"
	"time"

	"sonar-tap/pkg/process"

	"github.com/castle-x/goutils/ablog"
	"github.com/castle-x/goutils/tools"
	"github.com/shirou/gopsutil/v4/cpu"
)

var logger = ablog.NewLogger("cpuCollector")

/*
	1. 机器cpu使用率
	2. 进程cpu使用率
	3. 单核cpu使用率
*/

type CPUCollector struct {
	systemHz float64 // 系统HZ值，缓存避免重复读取
}

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

func (c *CPUCollector) CollectProcess(process *process.Process) (map[string]any, error) {
	return c.collectProcessCPU(process)
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

func (c *CPUCollector) collectProcessCPU(process *process.Process) (map[string]any, error) {
	metric := map[string]any{
		"process_cpu_percent": 0.0,
	}
	if process == nil || process.GetProcess() == nil {
		return nil, fmt.Errorf("process is nil")
	}

	if !process.IsAlive() {
		return nil, fmt.Errorf("process is not alive")
	}

	statPath := "/proc/" + strconv.Itoa(int(process.GetPID())) + "/stat"
	data, err := os.ReadFile(statPath)
	if err != nil {
		logger.Warn("read stat file error: %v", err)
		return metric, nil
	}

	fields := strings.Fields(string(data))
	if len(fields) < 17 {
		logger.Warn("stat file is not valid")
		return metric, nil
	}

	utime, err1 := strconv.ParseFloat(fields[13], 64)
	stime, err2 := strconv.ParseFloat(fields[14], 64)

	if err1 != nil || err2 != nil {
		logger.Warn("parse stat file error: %v", err1)
		return metric, nil
	}

	totalTime := utime + stime
	now := time.Now().UnixNano()

	if process.GetLastCPUTime() == 0 || process.GetLastSampleTime() == 0 {
		process.SetLastCPUTime(totalTime)
		process.SetLastSampleTime(now)
		if c.systemHz == 0 {
			c.systemHz = getSystemHzFromStat()
		}
		return metric, nil
	}

	cpuDelta := totalTime - process.GetLastCPUTime()
	timeDelta := float64(now-process.GetLastSampleTime()) / 1e9

	if timeDelta < 0.01 {
		return metric, nil
	}

	if timeDelta > 0 && cpuDelta >= 0 {
		if c.systemHz == 0 {
			c.systemHz = getSystemHzFromStat()
		}

		hz := c.systemHz
		cpuPercent := (cpuDelta / hz) / timeDelta

		process.SetLastCPUTime(totalTime)
		process.SetLastSampleTime(now)

		if cpuPercent > 10.0 {
			process.SetLastCPUTime(0)
			process.SetLastSampleTime(0)
			logger.Warn("process cpu percent is too high")
			return metric, nil
		}
		metric["process_cpu_percent"] = tools.RoundFloat64(math.Max(0, cpuPercent), 3)
		return metric, nil
	}
	return metric, nil
}

// getSystemHzFromStat 获取系统的实际HZ值
func getSystemHzFromStat() float64 {
	// 常见的HZ值: 100, 250, 300, 1000
	// 返回经典的100Hz，这是许多服务器系统的默认值
	return 100.0
}
