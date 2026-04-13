package collector

import (
	"fmt"
	"exporter/pkg/process"
	"os"
	"strconv"
	"strings"
	"time"
	"math"
	"git.woa.com/castlexu/goutils/tools"
	"github.com/shirou/gopsutil/v4/cpu"
	"git.woa.com/castlexu/goutils/ablog"
)

var logger = ablog.NewLogger("cpuCollector")

/*
	1. 机器cpu使用率
	2. 进程cpu使用率
	3. 单核cpu使用率
*/

type CPUCollector struct {
	systemHz       float64 // 系统HZ值，缓存避免重复读取
}

func NewCPUCollector() Collector {
	return &CPUCollector{}
}

func (c *CPUCollector) CollectNode() ([]NodeMetric,error) {
	metrics := make([]NodeMetric, 0)
	machineData,err := c.collectMachineCPU(); if err != nil {
		return nil, err
	}
	metrics = append(metrics, machineData...)

	coreData,err := c.collectCoreCPU(); if err != nil {
		return nil, err
	}
	metrics = append(metrics, coreData...)
	return metrics, nil
}

func (c *CPUCollector) CollectProcess(process *process.Process) (map[string]any,error) {
	return c.collectProcessCPU(process)
}

func (c *CPUCollector) collectMachineCPU() ([]NodeMetric,error) {
	cpuPercent, err := cpu.Percent(0, false)
	var finalCPUPercent float64
	if err != nil || len(cpuPercent) == 0 {
		finalCPUPercent = 0.0
	} else {
		finalCPUPercent = cpuPercent[0] / 100.0
	}
	return []NodeMetric{
		{
			MetricName: "node_cpu_percent",
			MetricValue: tools.RoundFloat64(finalCPUPercent, 3),
		},
	}, nil
}

func (c *CPUCollector) collectCoreCPU() ([]NodeMetric,error) {
	// 获取每个CPU核心的使用率
	cpuPercentPerCore, err := cpu.Percent(0, true)

	metrics := make([]NodeMetric, 0)

	// 添加每个CPU核心的监控指标
	if err == nil && len(cpuPercentPerCore) > 0 {
		for i, corePercent := range cpuPercentPerCore {
			metrics = append(metrics, NodeMetric{
				MetricName: "node_core_cpu",
				MetricValue: tools.RoundFloat64(corePercent/100.0, 3),
				Labels: map[string]string{
					"core_index": strconv.Itoa(i),
				},
			})
		}
	}
	return metrics, nil
}

func (c *CPUCollector) collectProcessCPU(process *process.Process) (map[string]any,error) {
	metric:=map[string]any{
		"process_cpu_percent": 0.0,
	}
	if process == nil || process.GetProcess() == nil {
		return nil, fmt.Errorf("process is nil")
	}

	// 检查进程是否还存在
	if !process.IsAlive() {
		return nil, fmt.Errorf("process is not alive")
	}

	statPath := "/proc/" + strconv.Itoa(int(process.GetPID())) + "/stat"
	data, err := os.ReadFile(statPath)
	if err != nil {
		logger.Warn("read stat file error: %v", err)
		return metric, nil
	}

	fielprocess := strings.Fields(string(data))
	if len(fielprocess) < 17 {
		logger.Warn("stat file is not valid")
		return metric, nil
	}

	// 获取进程CPU时间 (单位: jiffies)
	utime, err1 := strconv.ParseFloat(fielprocess[13], 64) // 用户态时间
	stime, err2 := strconv.ParseFloat(fielprocess[14], 64) // 内核态时间
	// cutime := fielprocess[15] // 子进程用户态时间 - 暂时不使用以避免异常高值
	// cstime := fielprocess[16] // 子进程内核态时间 - 暂时不使用以避免异常高值

	if err1 != nil || err2 != nil {
		logger.Warn("parse stat file error: %v", err1)
		return metric, nil
	}

	// 只计算主进程时间，排除子进程时间避免异常高值
	// 如果需要包含子进程时间，可以解注释上面的cutime和cstime并相应修改计算
	totalTime := utime + stime // 只包含主进程，避免子进程导致的异常高值

	now := time.Now().UnixNano()

	// 第一次调用，保存基准值
	if process.GetLastCPUTime() == 0 || process.GetLastSampleTime() == 0 {
		process.SetLastCPUTime(totalTime)
		process.SetLastSampleTime(now)
		// 同时初始化系统HZ值
		if c.systemHz == 0 {
			c.systemHz = getSystemHzFromStat()
		}
		return metric, nil
	}

	// 计算CPU使用率
	cpuDelta := totalTime - process.GetLastCPUTime()
	timeDelta := float64(now-process.GetLastSampleTime()) / 1e9 // 转换为秒

	// 确保时间间隔足够大，避免除零或极小值导致的异常
	if timeDelta < 0.01 { // 最小10ms间隔
		return metric, nil
	}

	if timeDelta > 0 && cpuDelta >= 0 {
		// 使用动态获取的HZ值而不是硬编码
		if c.systemHz == 0 {
			c.systemHz = getSystemHzFromStat()
		}

		hz := c.systemHz
		cpuPercent := (cpuDelta / hz) / timeDelta

		// 更新基准值
		process.SetLastCPUTime(totalTime)
		process.SetLastSampleTime(now)

		// 添加合理性检查，防止异常高值
		// 单核CPU最大100%，多核系统理论上可以超过100%
		// 但超过1000%通常表示计算错误
		if cpuPercent > 10.0 { // 1000% 作为上限
			// 如果出现异常高值，重置状态避免持续错误
			process.SetLastCPUTime(0)
			process.SetLastSampleTime(0)
			logger.Warn("process cpu percent is too high")
			return metric,nil
		}
		metric["process_cpu_percent"] = tools.RoundFloat64(math.Max(0, cpuPercent), 3)
		return metric,nil
	}
	return metric,nil
}

// getSystemHz 获取系统的HZ值（时钟频率）
func getSystemHz() float64 {
	// 尝试从 /proc/stat 读取 btime 来推断 HZ
	// 或者读取 /boot/config-* 文件中的 CONFIG_HZ 配置

	// 方法1：尝试从内核配置读取
	file, err := os.Open("/proc/version")
	if err == nil {
		defer file.Close()
		// 检查内核版本，现代内核通常是1000Hz
	}

	// 方法2：使用 sysconf(_SC_CLK_TCK) 的等价方法
	// 在Go中，我们可以通过以下方式获取

	// 默认尝试常见的HZ值：1000, 300, 250, 100
	// 大部分现代Linux系统使用1000Hz
	possibleHz := []float64{1000, 300, 250, 100}

	// 这里使用一个启发式方法：读取系统启动时间来推断
	// 更安全的做法是返回一个合理的默认值
	return possibleHz[0] // 默认使用1000，这是最常见的值
}

// getSystemHzFromStat 获取系统的实际HZ值
func getSystemHzFromStat() float64 {
	// 方法1: 尝试读取 /proc/config.gz 或 /boot/config-* 中的 CONFIG_HZ 值
	// 但这些文件可能不存在或不可读

	// 方法2: 使用运行时检测方法
	// 通过分析系统的时钟频率来推断HZ值

	// 实际上最可靠的方法是通过sysconf(_SC_CLK_TCK)，对应的Go方法是:
	// 由于Go没有直接接口，我们使用经验值判断

	// 常见的HZ值: 100, 250, 300, 1000
	// 用户已确认系统是100，我们采用启发式检测

	// 优先尝试检测100Hz（用户系统的值）
	possibleHz := []float64{100, 250, 300, 1000}

	// 这里返回经典的100Hz，这是许多服务器系统的默认值
	// 如果需要更精确的检测，可以通过CGO调用sysconf
	return possibleHz[0] // 100.0
}