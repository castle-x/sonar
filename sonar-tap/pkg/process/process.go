package process

/*
	动态进程管理器
*/

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"sonar-tap/config"

	"github.com/castle-x/goutils/tools"
	"github.com/shirou/gopsutil/v4/process"
)

// Process 进程包装，保留核心字段用于采集
type Process struct {
	pid        int32
	name       string
	process    *process.Process
	labels     map[string]string
	createTime int64 // 进程创建时间

	// CPU 采集状态
	lastCPUTime    float64 // /proc/stat方式的上次CPU时间
	lastSampleTime int64   // 上次采样时间(纳秒)

	// 内存采集间隔状态
	ussInterval   int // USS采集间隔（秒）
	pssInterval   int // PSS采集间隔（秒）
	ussLastValue  float64
	ussLastUpdate int64
	pssLastValue  float64
	pssLastUpdate int64

	// 网络流量采集状态
	netLastRxBytes int64
	netLastTxBytes int64
	netLastUpdate  int64

	// 磁盘IO采集状态
	diskLastReadBytes  int64
	diskLastWriteBytes int64
	diskLastUpdate     int64

	// 日志路径（log watcher 通过进程 cmdline 提取）
	logPath string
}

func (p *Process) IsAlive() bool {
	alive, err := p.process.IsRunning()
	if err != nil {
		return false
	}
	return alive
}

func (p *Process) GetLabels() map[string]string  { return p.labels }
func (p *Process) GetName() string               { return p.name }
func (p *Process) GetPID() int32                 { return p.pid }
func (p *Process) GetProcess() *process.Process  { return p.process }
func (p *Process) GetLogPath() string            { return p.logPath }
func (p *Process) SetLogPath(logPath string)     { p.logPath = logPath }

// CPU 状态访问
func (p *Process) GetLastCPUTime() float64            { return p.lastCPUTime }
func (p *Process) GetLastSampleTime() int64            { return p.lastSampleTime }
func (p *Process) SetLastCPUTime(v float64)            { p.lastCPUTime = v }
func (p *Process) SetLastSampleTime(v int64)           { p.lastSampleTime = v }

// 内存状态访问
func (p *Process) GetUSSInterval() int                 { return p.ussInterval }
func (p *Process) GetPSSInterval() int                 { return p.pssInterval }
func (p *Process) GetUSSLastValue() float64            { return p.ussLastValue }
func (p *Process) GetPSSLastValue() float64            { return p.pssLastValue }
func (p *Process) GetUSSLastUpdate() int64             { return p.ussLastUpdate }
func (p *Process) GetPSSLastUpdate() int64             { return p.pssLastUpdate }
func (p *Process) SetUSSInterval(v int)                { p.ussInterval = v }
func (p *Process) SetPSSInterval(v int)                { p.pssInterval = v }
func (p *Process) SetUSSLastValue(v float64)           { p.ussLastValue = v }
func (p *Process) SetPSSLastValue(v float64)           { p.pssLastValue = v }
func (p *Process) SetUSSLastUpdate(v int64)            { p.ussLastUpdate = v }
func (p *Process) SetPSSLastUpdate(v int64)            { p.pssLastUpdate = v }

// 网络状态访问
func (p *Process) GetNetLastRxBytes() int64            { return p.netLastRxBytes }
func (p *Process) GetNetLastTxBytes() int64            { return p.netLastTxBytes }
func (p *Process) GetNetLastUpdate() int64             { return p.netLastUpdate }
func (p *Process) SetNetLastRxBytes(v int64)           { p.netLastRxBytes = v }
func (p *Process) SetNetLastTxBytes(v int64)           { p.netLastTxBytes = v }
func (p *Process) SetNetLastUpdate(v int64)            { p.netLastUpdate = v }

// 磁盘状态访问
func (p *Process) GetDiskLastReadBytes() int64         { return p.diskLastReadBytes }
func (p *Process) GetDiskLastWriteBytes() int64        { return p.diskLastWriteBytes }
func (p *Process) GetDiskLastUpdate() int64            { return p.diskLastUpdate }
func (p *Process) SetDiskLastReadBytes(v int64)        { p.diskLastReadBytes = v }
func (p *Process) SetDiskLastWriteBytes(v int64)       { p.diskLastWriteBytes = v }
func (p *Process) SetDiskLastUpdate(v int64)           { p.diskLastUpdate = v }

// newProcessByPid 通过 PID 创建 Process，整合 Labels
func newProcessByPid(pid int32, rule config.Rule) (*Process, error) {
	proc, err := process.NewProcess(pid)
	if err != nil {
		return nil, err
	}
	createTime, err := proc.CreateTime()
	if err != nil {
		return nil, err
	}
	p := &Process{pid: pid, name: rule.Name, process: proc, labels: make(map[string]string), createTime: createTime}
	// 如果规则中配置了日志路径正则（log watcher 专用），尝试从 cmdline 提取
	if rule.LogPathPattern != "" {
		if !p.matchLogPath(rule.LogPathPattern) {
			return nil, fmt.Errorf("process (%d) cmdline does not match log_path_pattern (%s)", pid, rule.LogPathPattern)
		}
	}
	return p.mergeLabels(rule)
}

// NewProcesses 根据 cmdline 配置的过滤条件找到进程
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
	for _, proc := range allprocesses {
		// 过滤掉当前监控进程
		if proc.Pid == int32(os.Getpid()) {
			continue
		}
		processPath, err := proc.Exe()
		if err != nil {
			continue
		}
		processName := filepath.Base(processPath)
		cmdline, err := proc.Cmdline()
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
		if len(filterList) == 0 {
			logger.Debug("skip by filterList is empty, process name (%s) pid (%d) cmdline (%s)", processName, proc.Pid, cmdline)
			continue
		}

		match := true
		for _, filter := range filterList {
			// !代表反选, 优先级最高
			if strings.HasPrefix(filter, "!") {
				filterContent := strings.TrimPrefix(filter, "!")
				if strings.Contains(strings.ToLower(cmdline), strings.ToLower(filterContent)) {
					match = false
					logger.Info("!filter process name (%s) pid (%d) cmdline (%s)", processName, proc.Pid, cmdline)
					break
				}
				continue
			}
			if !strings.Contains(cmdline, filter) {
				match = false
				logger.Debug("skip by cmdline not match (%s), process name (%s) pid (%d) cmdline (%s)", filter, processName, proc.Pid, cmdline)
				break
			}
		}

		if !match {
			continue
		}
		logger.Info("match process name (%s) pid (%d) cmdline (%s)", processName, proc.Pid, cmdline)
		p, err := newProcessByPid(proc.Pid, rule)
		if err != nil {
			continue
		}
		results = append(results, p)
	}
	return results, nil
}

// mergeLabels 根据规则，整合 Labels
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

// matchLogPath 从进程 cmdline 中通过正则提取日志路径
func (p *Process) matchLogPath(pattern string) bool {
	if pattern == "" {
		return false
	}
	re, err := regexp.Compile(pattern)
	if err != nil {
		return false
	}
	cmdline, err := p.process.Cmdline()
	if err != nil {
		return false
	}
	matches := re.FindStringSubmatch(cmdline)
	if len(matches) < 2 {
		return false
	}
	p.logPath = matches[1]
	return true
}
