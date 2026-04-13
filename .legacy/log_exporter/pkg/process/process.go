package process

/*
	动态进程管理器
*/

import (
	"fmt"
	"log_exporter/config"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"git.woa.com/castlexu/goutils/tools"
	"github.com/shirou/gopsutil/v4/process"
)

type Process struct {
	pid            int32
	name           string
	process        *process.Process
	createTime     int64
	labels         map[string]string
	// 无需采样
	logPath 		string
	cmdline 		string
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

func (p *Process) GetLogPath() string {
	return p.logPath
}

func (p *Process) SetLogPath(logPath string) {
	p.logPath = logPath
}

// 这里应该是已经找到了进程，只需要整合Labels就行
func newProcessByPid(pid int32, rule config.Rule) (*Process, error) {
	process, err := process.NewProcess(pid)
	if err != nil {
		return nil, err
	}
	cmdline, err := process.Cmdline()
	if err != nil {
		return nil, err
	}
	createTime, err := process.CreateTime()
	if err != nil {
		return nil, err
	}
	p := &Process{pid: pid, name: rule.Name, process: process, labels: make(map[string]string), cmdline: cmdline, createTime: createTime}
	if p.matchLogPath(rule.LogPathPattern) {
		return p.mergeLabels(rule)
	}
	return nil, fmt.Errorf("match log path failed, skip this process (%v) (%v)", pid, p.name)
}

// 根据cmdline配置的过滤条件找到进程
func NewProcesses(rule config.Rule, allprocesses []*process.Process) ([]*Process, error) {
	results := make([]*Process, 0)
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
		// logger.Debug("process name (%s) pid (%d) cmdline (%s)", processName, process.Pid, cmdline)
		// 过滤掉不符合指定名称的进程
		if name != "" {
			if processName != name {
				continue
			}
		}
		//
		if len(filterList) == 0 {
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
			logger.Error("newProcessByPid , %v", err)
			continue
		}
		results = append(results, p)
	}
	return results, nil
}

// 根据规则，整合Labels
func (p *Process) mergeLabels(rule config.Rule) (*Process, error) {
	cmdline := p.cmdline
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
	p.labels["name"] = p.name
	p.labels["pid"] = fmt.Sprintf("%d", p.pid)
	p.labels["create_date"] = time.UnixMilli(p.createTime).Format(time.DateTime)
	return p, nil
}

func (p *Process) matchLogPath(pattern string) bool {
	re, err := regexp.Compile(pattern)
	if err != nil {
		return false
	}
	matches := re.FindStringSubmatch(p.cmdline)
	if len(matches) == 0 {
		return false
	}
	p.logPath = matches[1]
	return true
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