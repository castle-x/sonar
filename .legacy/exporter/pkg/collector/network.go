package collector

import (
	"exporter/pkg/process"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"

	"git.woa.com/castlexu/goutils/tools"
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
	// 获取所有网卡的流量统计，pernic=true 表示按网卡分别统计
	netIOList, err := net.IOCounters(true)
	if err != nil || len(netIOList) == 0 {
		return []NodeMetric{}, nil
	}

	now := time.Now().UnixNano()
	metrics := make([]NodeMetric, 0)

	// 初始化 preNetIO map
	if c.preNetIO == nil {
		c.preNetIO = make(map[string]*net.IOCountersStat)
	}

	// 遍历每个网卡
	for _, currentNetIO := range netIOList {
		interfaceName := currentNetIO.Name

		// 跳过 lo 回环网卡（可选）
		// 跳过不需要监控的网卡
		if interfaceName == "lo" || 
			strings.HasPrefix(interfaceName, "docker") || 
			strings.HasPrefix(interfaceName, "br-") || 
			strings.HasPrefix(interfaceName, "veth") {
			continue
		}

		// 如果有历史数据，计算流量速率
		if preNetIO, exists := c.preNetIO[interfaceName]; exists && c.lastNetIOTime > 0 {
			timeDelta := float64(now-c.lastNetIOTime) / 1e9 // 转换为秒

			if timeDelta > 0 {
				// 计算字节差值
				bytesSentDelta := float64(currentNetIO.BytesSent - preNetIO.BytesSent)
				bytesRecvDelta := float64(currentNetIO.BytesRecv - preNetIO.BytesRecv)

				// 计算速率：(字节差值 / 1024) / 时间间隔 = KB/s
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

		// 保存当前网卡数据
		netIOCopy := currentNetIO
		c.preNetIO[interfaceName] = &netIOCopy
	}

	c.lastNetIOTime = now
	return metrics, nil
}

func (c *NetworkCollector) CollectProcess(process *process.Process) (map[string]any, error) {
	/* metrics:=map[string]any{
		"process_net_rx_kbs": 0.0,
		"process_net_tx_kbs": 0.0,
	}
	if process == nil || process.GetProcess() == nil {
		return metrics, nil
	}
	if !process.IsAlive() {
		return metrics, nil
	}
	rxRate, txRate := c.getNetworkTraffic(process)
	metrics["process_net_rx_kbs"] = tools.RoundFloat64(rxRate, 3)
	metrics["process_net_tx_kbs"] = tools.RoundFloat64(txRate, 3)
	return metrics, nil */
	// 进程流量, 暂时不支持, 基本跟网卡流量是一样的.
	return nil, nil
}

// getNetworkTraffic 获取进程的网络流量统计
func (c *NetworkCollector) getNetworkTraffic(process *process.Process) (float64, float64) {
	if runtime.GOOS != "linux" {
		return 0.0, 0.0
	}

	if process == nil || process.GetProcess() == nil {
		return 0.0, 0.0
	}

	// 检查进程是否还存在
	if !process.IsAlive() {
		return 0.0, 0.0
	}

	// 读取 /proc/{pid}/net/dev 文件获取网络统计信息
	netDevPath := "/proc/" + strconv.Itoa(int(process.GetPID())) + "/net/dev"
	data, err := os.ReadFile(netDevPath)
	if err != nil {
		return 0.0, 0.0
	}

	lines := strings.Split(string(data), "\n")
	var totalRxBytes, totalTxBytes int64

	// 解析网络接口统计信息
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "Inter-") || strings.HasPrefix(line, "face") {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) < 17 {
			continue
		}

		// 字段格式: interface rx_bytes rx_packets rx_errs rx_drop ... tx_bytes tx_packets ...
		// rx_bytes 在第2个字段，tx_bytes 在第10个字段
		rxBytes, _ := strconv.ParseInt(fields[1], 10, 64)
		txBytes, _ := strconv.ParseInt(fields[9], 10, 64)

		totalRxBytes += rxBytes
		totalTxBytes += txBytes
	}

	now := time.Now().Unix()

	// 第一次调用，保存基准值
	if process.GetNetLastUpdate() == 0 {
		process.SetNetLastRxBytes(totalRxBytes)
		process.SetNetLastTxBytes(totalTxBytes)
		process.SetNetLastUpdate(now)
		return 0.0, 0.0
	}

	// 计算网络速率
	timeDelta := float64(now - process.GetNetLastUpdate())
	if timeDelta > 0 {
		rxDelta := float64(totalRxBytes - process.GetNetLastRxBytes())
		txDelta := float64(totalTxBytes - process.GetNetLastTxBytes())

		// 转换为KB/s
		rxRate := rxDelta / 1024 / timeDelta
		txRate := txDelta / 1024 / timeDelta

		// 更新上次值
		process.SetNetLastRxBytes(totalRxBytes)
		process.SetNetLastTxBytes(totalTxBytes)
		process.SetNetLastUpdate(now)

		return rxRate, txRate
	}

	return 0.0, 0.0
}
