package collector

import (
	"bufio"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"

	"sonar-tap/pkg/process"

	"github.com/castle-x/goutils/tools"
)

/*
磁盘IO采集器
 1. 节点级: 磁盘读写速率 (KB/s)、IOPS、IO使用率
 2. 进程级: 进程磁盘读写速率 (KB/s)
*/

type DiskCollector struct {
	// 节点级历史数据
	preDiskStats   map[string]*DiskStat
	lastUpdateTime int64
}

type DiskStat struct {
	ReadBytes  uint64
	WriteBytes uint64
	ReadCount  uint64 // 读操作次数
	WriteCount uint64 // 写操作次数
	IoTime     uint64 // IO花费的时间(ms)
}

func NewDiskCollector() Collector {
	return &DiskCollector{
		preDiskStats: make(map[string]*DiskStat),
	}
}

// CollectNode 采集节点级磁盘IO指标
func (c *DiskCollector) CollectNode() ([]NodeMetric, error) {
	metrics := make([]NodeMetric, 0)

	if runtime.GOOS != "linux" {
		return metrics, nil
	}

	diskStats, err := c.readDiskStats()
	if err != nil {
		return metrics, nil
	}

	now := time.Now().UnixNano()

	for device, stat := range diskStats {
		if !c.isPhysicalDisk(device) {
			continue
		}

		if preStat, exists := c.preDiskStats[device]; exists && c.lastUpdateTime > 0 {
			timeDelta := float64(now-c.lastUpdateTime) / 1e9

			if timeDelta > 0 {
				readKBs := float64(stat.ReadBytes-preStat.ReadBytes) / 1024 / timeDelta
				writeKBs := float64(stat.WriteBytes-preStat.WriteBytes) / 1024 / timeDelta

				readIOPS := float64(stat.ReadCount-preStat.ReadCount) / timeDelta
				writeIOPS := float64(stat.WriteCount-preStat.WriteCount) / timeDelta

				ioTimeDelta := float64(stat.IoTime - preStat.IoTime)
				ioUtil := (ioTimeDelta / 1000) / timeDelta

				metrics = append(metrics,
					NodeMetric{
						MetricName:  "node_disk_read_kbs",
						MetricValue: tools.RoundFloat64(readKBs, 4),
						Labels:      map[string]string{"device": device},
					},
					NodeMetric{
						MetricName:  "node_disk_write_kbs",
						MetricValue: tools.RoundFloat64(writeKBs, 4),
						Labels:      map[string]string{"device": device},
					},
					NodeMetric{
						MetricName:  "node_disk_read_iops",
						MetricValue: tools.RoundFloat64(readIOPS, 4),
						Labels:      map[string]string{"device": device},
					},
					NodeMetric{
						MetricName:  "node_disk_write_iops",
						MetricValue: tools.RoundFloat64(writeIOPS, 4),
						Labels:      map[string]string{"device": device},
					},
					NodeMetric{
						MetricName:  "node_disk_io_util",
						MetricValue: tools.RoundFloat64(ioUtil, 4),
						Labels:      map[string]string{"device": device},
					},
				)
			}
		}

		c.preDiskStats[device] = stat
	}

	c.lastUpdateTime = now
	return metrics, nil
}

// CollectProcess 采集进程级磁盘IO指标
func (c *DiskCollector) CollectProcess(p *process.Process) (map[string]any, error) {
	metrics := map[string]any{
		"process_disk_read_kbs":  0.0,
		"process_disk_write_kbs": 0.0,
	}

	if runtime.GOOS != "linux" {
		return metrics, nil
	}

	if p == nil || p.GetProcess() == nil || !p.IsAlive() {
		return metrics, nil
	}

	ioPath := "/proc/" + strconv.Itoa(int(p.GetPID())) + "/io"
	data, err := os.ReadFile(ioPath)
	if err != nil {
		return metrics, nil
	}

	var readBytes, writeBytes int64
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		fields := strings.Split(line, ":")
		if len(fields) != 2 {
			continue
		}
		key := strings.TrimSpace(fields[0])
		value, _ := strconv.ParseInt(strings.TrimSpace(fields[1]), 10, 64)

		switch key {
		case "read_bytes":
			readBytes = value
		case "write_bytes":
			writeBytes = value
		}
	}

	now := time.Now().Unix()

	if p.GetDiskLastUpdate() == 0 {
		p.SetDiskLastReadBytes(readBytes)
		p.SetDiskLastWriteBytes(writeBytes)
		p.SetDiskLastUpdate(now)
		return metrics, nil
	}

	timeDelta := float64(now - p.GetDiskLastUpdate())
	if timeDelta > 0 {
		readKBs := float64(readBytes-p.GetDiskLastReadBytes()) / 1024 / timeDelta
		writeKBs := float64(writeBytes-p.GetDiskLastWriteBytes()) / 1024 / timeDelta

		if readKBs < 0 {
			readKBs = 0
		}
		if writeKBs < 0 {
			writeKBs = 0
		}

		p.SetDiskLastReadBytes(readBytes)
		p.SetDiskLastWriteBytes(writeBytes)
		p.SetDiskLastUpdate(now)

		metrics["process_disk_read_kbs"] = tools.RoundFloat64(readKBs, 3)
		metrics["process_disk_write_kbs"] = tools.RoundFloat64(writeKBs, 3)
	}

	return metrics, nil
}

// readDiskStats 读取 /proc/diskstats
func (c *DiskCollector) readDiskStats() (map[string]*DiskStat, error) {
	file, err := os.Open("/proc/diskstats")
	if err != nil {
		return nil, err
	}
	defer file.Close()

	stats := make(map[string]*DiskStat)
	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 14 {
			continue
		}

		device := fields[2]
		readCount, _ := strconv.ParseUint(fields[3], 10, 64)
		readSectors, _ := strconv.ParseUint(fields[5], 10, 64)
		writeCount, _ := strconv.ParseUint(fields[7], 10, 64)
		writeSectors, _ := strconv.ParseUint(fields[9], 10, 64)
		ioTime, _ := strconv.ParseUint(fields[12], 10, 64)

		stats[device] = &DiskStat{
			ReadBytes:  readSectors * 512,
			WriteBytes: writeSectors * 512,
			ReadCount:  readCount,
			WriteCount: writeCount,
			IoTime:     ioTime,
		}
	}

	return stats, nil
}

// isPhysicalDisk 判断是否为物理磁盘（排除分区）
func (c *DiskCollector) isPhysicalDisk(device string) bool {
	if strings.HasPrefix(device, "loop") {
		return false
	}
	if strings.HasPrefix(device, "ram") {
		return false
	}
	if strings.HasPrefix(device, "dm-") {
		return false
	}

	if strings.HasPrefix(device, "sd") && len(device) == 3 {
		return true
	}
	if strings.HasPrefix(device, "vd") && len(device) == 3 {
		return true
	}
	if strings.HasPrefix(device, "xvd") && len(device) == 4 {
		return true
	}
	if strings.HasPrefix(device, "nvme") && strings.Contains(device, "n") && !strings.Contains(device, "p") {
		return true
	}
	if strings.HasPrefix(device, "hd") && len(device) == 3 {
		return true
	}

	return false
}
