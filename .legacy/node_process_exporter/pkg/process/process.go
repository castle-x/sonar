package process

/*
	动态进程管理器
*/

import (
	"fmt"
	"node_process_exporter/config"
	"os"
	"regexp"
	"strings"
	"path/filepath"
	"git.woa.com/castlexu/goutils/tools"
	"github.com/shirou/gopsutil/v4/process"
	"time"
)

type Process struct {
	pid            int32
	name           string
	process        *process.Process
	labels         map[string]string
	createTime     int64   // 进程创建时间
	lastCPUTime    float64 // /proc/stat方式的上次CPU时间
	lastSampleTime int64   // 上次采样时间(纳秒)
	// 内存采集间隔
	ussInterval   int // USS采集间隔（秒）
	pssInterval   int // PSS采集间隔（秒）
	ussLastValue  float64
	ussLastUpdate int64
	pssLastValue  float64
	pssLastUpdate int64
	//
	netInterval    int     // 网络流量采集间隔（秒）
	netLastRxBytes int64   // 上次接收字节数
	netLastTxBytes int64   // 上次发送字节数
	netLastUpdate  int64   // 上次网络流量更新时间
	netRxRate      float64 // 接收速率 (KB/s)
	netTxRate      float64 // 发送速率 (KB/s)
	// 磁盘IO采集状态
	diskLastReadBytes  int64 // 上次读取字节数
	diskLastWriteBytes int64 // 上次写入字节数
	diskLastUpdate     int64 // 上次更新时间
}

func (p *Process) IsAlive() bool {
	alive, err := p.process.IsRunning()
	if err != nil {
		return false
	}
	return alive
}

func (p *Process) GetLabels() map[string]string {
	return p.labels
}

func (p *Process) GetName() string {
	return p.name
}

func (p *Process) GetPID() int32 {
	return p.pid
}

func (p *Process) GetProcess() *process.Process {
	return p.process
}

func (p *Process) GetLastCPUTime() float64 {
	return p.lastCPUTime
}

func (p *Process) GetLastSampleTime() int64 {
	return p.lastSampleTime
}

func (p *Process) SetLastCPUTime(lastCPUTime float64) {
	p.lastCPUTime = lastCPUTime
}

func (p *Process) SetLastSampleTime(lastSampleTime int64) {
	p.lastSampleTime = lastSampleTime
}

func (p *Process) GetUSSInterval() int {
	return p.ussInterval
}

func (p *Process) GetPSSInterval() int {
	return p.pssInterval
}

func (p *Process) GetUSSLastValue() float64 {
	return p.ussLastValue
}

func (p *Process) GetPSSLastValue() float64 {
	return p.pssLastValue
}

func (p *Process) GetUSSLastUpdate() int64 {
	return p.ussLastUpdate
}

func (p *Process) GetPSSLastUpdate() int64 {
	return p.pssLastUpdate
}

func (p *Process) SetUSSInterval(ussInterval int) {
	p.ussInterval = ussInterval
}

func (p *Process) SetPSSInterval(pssInterval int) {
	p.pssInterval = pssInterval
}

func (p *Process) SetUSSLastValue(ussLastValue float64) {
	p.ussLastValue = ussLastValue
}

func (p *Process) SetPSSLastValue(pssLastValue float64) {
	p.pssLastValue = pssLastValue
}

func (p *Process) SetUSSLastUpdate(ussLastUpdate int64) {
	p.ussLastUpdate = ussLastUpdate
}

func (p *Process) SetPSSLastUpdate(pssLastUpdate int64) {
	p.pssLastUpdate = pssLastUpdate
}

func (p *Process) GetNetInterval() int {
	return p.netInterval
}

func (p *Process) GetNetLastRxBytes() int64 {
	return p.netLastRxBytes
}

func (p *Process) GetNetLastTxBytes() int64 {
	return p.netLastTxBytes
}

func (p *Process) GetNetLastUpdate() int64 {
	return p.netLastUpdate
}

func (p *Process) GetNetRxRate() float64 {
	return p.netRxRate
}

func (p *Process) GetNetTxRate() float64 {
	return p.netTxRate
}

func (p *Process) SetNetInterval(netInterval int) {
	p.netInterval = netInterval
}

func (p *Process) SetNetLastRxBytes(netLastRxBytes int64) {
	p.netLastRxBytes = netLastRxBytes
}

func (p *Process) SetNetLastTxBytes(netLastTxBytes int64) {
	p.netLastTxBytes = netLastTxBytes
}

func (p *Process) SetNetLastUpdate(netLastUpdate int64) {
	p.netLastUpdate = netLastUpdate
}

func (p *Process) SetNetRxRate(netRxRate float64) {
	p.netRxRate = netRxRate
}

func (p *Process) SetNetTxRate(netTxRate float64) {
	p.netTxRate = netTxRate
}

// 磁盘IO相关的Getter/Setter方法
func (p *Process) GetDiskLastReadBytes() int64 {
	return p.diskLastReadBytes
}

func (p *Process) GetDiskLastWriteBytes() int64 {
	return p.diskLastWriteBytes
}

func (p *Process) GetDiskLastUpdate() int64 {
	return p.diskLastUpdate
}

func (p *Process) SetDiskLastReadBytes(diskLastReadBytes int64) {
	p.diskLastReadBytes = diskLastReadBytes
}

func (p *Process) SetDiskLastWriteBytes(diskLastWriteBytes int64) {
	p.diskLastWriteBytes = diskLastWriteBytes
}

func (p *Process) SetDiskLastUpdate(diskLastUpdate int64) {
	p.diskLastUpdate = diskLastUpdate
}

// 这里应该是已经找到了进程，只需要整合Labels就行
func newProcessByPid(pid int32, rule config.Rule) (*Process, error) {
	process, err := process.NewProcess(pid)
	if err != nil {
		return nil, err
	}
	createTime, err := process.CreateTime()
	if err != nil {
		return nil, err
	}
	p := &Process{pid: pid, name: rule.Name, process: process, labels: make(map[string]string), createTime: createTime}
	return p.mergeLabels(rule)
}

// 根据cmdline配置的过滤条件找到进程
func NewProcesses(rule config.Rule, allprocesses []*process.Process) ([]*Process, error) {
	results := make([]*Process, 0)
	if rule.Pid != 0 {
		p, err := newProcessByPid(int32(rule.Pid), rule)
		if err != nil {
			return nil, err
		}
		results = append(results, p)
		return results, nil
	}
	// 过滤条件和名称不能同时为空
	if len(rule.Cmdlines) == 0 && rule.Name == "" {
		return nil, fmt.Errorf("match cmdline and name is empty")
	}
	filterList := rule.Cmdlines
	name := rule.Name
	processes := allprocesses
	for _, process := range processes {
		// 过滤掉当前监控进程
		if process.Pid == int32(os.Getpid()) {
			continue
		}
		processPath, err := process.Exe()
		if err != nil {
			continue
		}
		processName := filepath.Base(processPath)
		cmdline, err := process.Cmdline()
		if err != nil {
			continue
		}
		// 过滤掉不符合指定名称的进程
		if name != "" {
			if processName != name {
				logger.Debug("skip by process name (%s) not match (%s)", processName, name)
				continue
			}
		}
		//
		if len(filterList) == 0 {
			logger.Debug("skip by filterList is empty, process name (%s) pid (%d) cmdline (%s)", processName, process.Pid, cmdline)
			continue
		}

		match := true
		for _, filter := range filterList {
			// !代表反选, 优先级最高
			if strings.HasPrefix(filter, "!") {
				// 去掉感叹号后再比较
				filterContent := strings.TrimPrefix(filter, "!")
				if strings.Contains(strings.ToLower(cmdline), strings.ToLower(filterContent)) {
					match = false
					logger.Info("!filter process name (%s) pid (%d) cmdline (%s)", processName, process.Pid, cmdline)
					break
				}
				continue
			}
			if !strings.Contains(cmdline, filter) {
				match = false
				logger.Debug("skip by cmdline not match (%s), process name (%s) pid (%d) cmdline (%s)", filter, processName, process.Pid, cmdline)
				break
			}
		}

		if !match {
			continue
		}
		logger.Info("match process name (%s) pid (%d) cmdline (%s)", processName, process.Pid, cmdline)
		// 找到进程，整合Labels
		p, err := newProcessByPid(process.Pid, rule)
		if err != nil {
			continue
		}
		results = append(results, p)
	}
	return results, nil
}

// 根据规则，整合Labels
func (p *Process) mergeLabels(rule config.Rule) (*Process, error) {
	cmdline, err := p.process.Cmdline()
	if err != nil {
		return nil, err
	}
	for _, extract := range rule.Extracts {
		switch extract.Type {
		case config.ExtractTypeDefault:
			for k, v := range extract.Labels {
				p.labels[k] = v
			}
		case config.ExtractTypeSplit:
			if extract.Sep == "" {
				continue
			}
			cmdlineItems := strings.Split(cmdline, extract.Sep)
			for k, v := range extract.Labels {
				index := tools.Atoi(ExtractDigits(v))
				if index >= len(cmdlineItems) {
					continue
				}
				p.labels[k] = cmdlineItems[index]
			}
		case config.ExtractTypeRegex:
			if extract.Pattern == "" {
				continue
			}
			re, err := regexp.Compile(extract.Pattern)
			if err != nil {
				continue
			}
			matches := re.FindStringSubmatch(cmdline)
			if len(matches) == 0 {
				continue
			}
			for k, v := range extract.Labels {
				if tools.Atoi(ExtractDigits(v)) >= len(matches) {
					continue
				}
				p.labels[k] = matches[tools.Atoi(ExtractDigits(v))]
			}
		}
	}
	p.labels["pid"] = fmt.Sprintf("%d", p.pid)
	p.labels["name"] = p.name
	p.labels["create_date"] = time.UnixMilli(p.createTime).Format(time.DateTime)
	return p, nil
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
