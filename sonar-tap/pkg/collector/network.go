package collector

import (
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"

	"sonar-tap/pkg/process"

	"github.com/castle-x/goutils/tools"
	"github.com/shirou/gopsutil/v4/net"
)

/*
	1. 机器网络流量
*/

type NetworkCollector struct {
	preNetIO      map[string]*net.IOCountersStat // 按网卡名称存储历史数据
	lastNetIOTime int64                          // 上次网络IO采样时间(纳秒)
}

func NewNetworkCollector() Collector {
	return &NetworkCollector{}
}

func (c *NetworkCollector) CollectNode() ([]NodeMetric, error) {
	netIOList, err := net.IOCounters(true)
	if err != nil || len(netIOList) == 0 {
		return []NodeMetric{}, nil
	}

	now := time.Now().UnixNano()
	metrics := make([]NodeMetric, 0)

	if c.preNetIO == nil {
		c.preNetIO = make(map[string]*net.IOCountersStat)
	}

	for _, currentNetIO := range netIOList {
		interfaceName := currentNetIO.Name

		if interfaceName == "lo" ||
			strings.HasPrefix(interfaceName, "docker") ||
			strings.HasPrefix(interfaceName, "br-") ||
			strings.HasPrefix(interfaceName, "veth") {
			continue
		}

		if preNetIO, exists := c.preNetIO[interfaceName]; exists && c.lastNetIOTime > 0 {
			timeDelta := float64(now-c.lastNetIOTime) / 1e9

			if timeDelta > 0 {
				bytesSentDelta := float64(currentNetIO.BytesSent - preNetIO.BytesSent)
				bytesRecvDelta := float64(currentNetIO.BytesRecv - preNetIO.BytesRecv)

				netSent := (bytesSentDelta / 1024) / timeDelta
				netRecv := (bytesRecvDelta / 1024) / timeDelta

				metrics = append(metrics, NodeMetric{
					MetricName:  "node_net_traffic_kbs",
					MetricValue: tools.RoundFloat64(netSent, 3),
					Labels: map[string]string{
						"direction": "tx",
						"interface": interfaceName,
					},
				}, NodeMetric{
					MetricName:  "node_net_traffic_kbs",
					MetricValue: tools.RoundFloat64(netRecv, 3),
					Labels: map[string]string{
						"direction": "rx",
						"interface": interfaceName,
					},
				})
			}
		}

		netIOCopy := currentNetIO
		c.preNetIO[interfaceName] = &netIOCopy
	}

	c.lastNetIOTime = now
	return metrics, nil
}

func (c *NetworkCollector) CollectProcess(process *process.Process) (map[string]any, error) {
	// 进程流量, 暂时不支持, 基本跟网卡流量是一样的.
	return nil, nil
}

// getNetworkTraffic 获取进程的网络流量统计（保留但未使用）
func (c *NetworkCollector) getNetworkTraffic(process *process.Process) (float64, float64) {
	if runtime.GOOS != "linux" {
		return 0.0, 0.0
	}

	if process == nil || process.GetProcess() == nil {
		return 0.0, 0.0
	}

	if !process.IsAlive() {
		return 0.0, 0.0
	}

	netDevPath := "/proc/" + strconv.Itoa(int(process.GetPID())) + "/net/dev"
	data, err := os.ReadFile(netDevPath)
	if err != nil {
		return 0.0, 0.0
	}

	lines := strings.Split(string(data), "\n")
	var totalRxBytes, totalTxBytes int64

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "Inter-") || strings.HasPrefix(line, "face") {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) < 17 {
			continue
		}

		rxBytes, _ := strconv.ParseInt(fields[1], 10, 64)
		txBytes, _ := strconv.ParseInt(fields[9], 10, 64)

		totalRxBytes += rxBytes
		totalTxBytes += txBytes
	}

	now := time.Now().Unix()

	if process.GetNetLastUpdate() == 0 {
		process.SetNetLastRxBytes(totalRxBytes)
		process.SetNetLastTxBytes(totalTxBytes)
		process.SetNetLastUpdate(now)
		return 0.0, 0.0
	}

	timeDelta := float64(now - process.GetNetLastUpdate())
	if timeDelta > 0 {
		rxDelta := float64(totalRxBytes - process.GetNetLastRxBytes())
		txDelta := float64(totalTxBytes - process.GetNetLastTxBytes())

		rxRate := rxDelta / 1024 / timeDelta
		txRate := txDelta / 1024 / timeDelta

		process.SetNetLastRxBytes(totalRxBytes)
		process.SetNetLastTxBytes(totalTxBytes)
		process.SetNetLastUpdate(now)

		return rxRate, txRate
	}

	return 0.0, 0.0
}
