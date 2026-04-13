package collector

import (
	"time"
	"runtime"
	"os"
	"strconv"
	"strings"
	"bufio"
	"git.woa.com/castlexu/goutils/tools"
	"exporter/pkg/process"
	"github.com/shirou/gopsutil/v4/mem"
)
/* 
	1. 机器内存 , (USE%, RES,USS, PSS)
	2. 进程内存 , (RES, USS, PSS)
*/

type MemCollector struct {}

func NewMemCollector() Collector {
	return &MemCollector{}
}

func (c *MemCollector) CollectNode() ([]NodeMetric,error) {
	vmem, err := mem.VirtualMemory()
	if err != nil {
		return []NodeMetric{
			{
				MetricName: "node_mem_percent",
				MetricValue: 0.0,
			},
			{
				MetricName: "node_mem_used_mb",
				MetricValue: 0.0,
			},
		}, nil
	}

	return []NodeMetric{
		{
			MetricName: "node_mem_percent",
			MetricValue: tools.RoundFloat64(vmem.UsedPercent/100.0, 3),
		},
		{
			MetricName: "node_mem_used_mb",
			MetricValue: tools.RoundFloat64(float64(vmem.Used)/1024/1024, 3),
		},
	}, nil
}

func (c *MemCollector) CollectProcess(process *process.Process) (map[string]any,error) {
	metrics:=map[string]any{
		"process_mem_mb":      0.0,
		"process_uss_mem_mb":  0.0,
		"process_pss_mem_mb":  0.0,
	}
	if process == nil || process.GetProcess() == nil {
		return metrics, nil
	}
	if !process.IsAlive() {
		return metrics, nil
	}
	// 获取内存信息
	memInfo, err := process.GetProcess().MemoryInfo()
	var physicalMem float64
	if err != nil {
		physicalMem = 0
	} else {
		physicalMem = float64(memInfo.RSS) / 1024 / 1024 // MB
	}
	metrics["process_mem_mb"] = tools.RoundFloat64(physicalMem, 3)
	// 按间隔获取USS和PSS
	now := time.Now().Unix()
	if now-process.GetUSSLastUpdate() >= int64(process.GetUSSInterval()) {
		// 根据操作系统获取USS/PSS
		switch runtime.GOOS {
		case "linux":
			pss, uss := c.getPSSUSSMemoryForProcess(process)
			process.SetPSSLastValue(pss / 1024 / 1024) // 转换为MB
			process.SetUSSLastValue(uss / 1024 / 1024) // 转换为MB
		case "windows", "darwin":
			// Windows和macOS下不支持USS/PSS，设为0
			process.SetUSSLastValue(0)
			process.SetPSSLastValue(0)
		default:
			// 其他系统设为0
			process.SetUSSLastValue(0)
			process.SetPSSLastValue(0)
		}
		process.SetUSSLastUpdate(now)
		process.SetPSSLastUpdate(now)
	}
	metrics["process_uss_mem_mb"] = tools.RoundFloat64(process.GetUSSLastValue(), 3)
	metrics["process_pss_mem_mb"] = tools.RoundFloat64(process.GetPSSLastValue(), 3)
	return metrics, nil
}

// getPSSUSSMemoryForProcess 获取特定进程的PSS和USS内存
func (c *MemCollector) getPSSUSSMemoryForProcess(process *process.Process) (float64, float64) {
	if process == nil || process.GetProcess() == nil {
		return 0, 0
	}

	return readProcSmaps(process.GetPID())
}

// readProcSmaps 读取进程的/proc/[pid]/smaps文件获取PSS和USS
func readProcSmaps(pid int32) (float64, float64) {
	smapsPath := "/proc/" + strconv.Itoa(int(pid)) + "/smaps"

	file, err := os.Open(smapsPath)
	if err != nil {
		return 0, 0
	}
	defer file.Close()

	var pss, uss float64
	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "Pss:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				if value, err := strconv.ParseFloat(fields[1], 64); err == nil {
					pss += value * 1024 // 转换为字节
				}
			}
		} else if strings.HasPrefix(line, "Private_Clean:") || strings.HasPrefix(line, "Private_Dirty:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				if value, err := strconv.ParseFloat(fields[1], 64); err == nil {
					uss += value * 1024 // 转换为字节
				}
			}
		}
	}

	return pss, uss
}
