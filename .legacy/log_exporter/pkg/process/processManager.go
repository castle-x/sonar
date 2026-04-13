package process

import (
	"context"
	"log_exporter/config"
	"time"

	"git.woa.com/castlexu/goutils/ablog"
	"git.woa.com/castlexu/goutils/syncmap"
	"github.com/shirou/gopsutil/v4/process"
)

var logger = ablog.NewLogger("processManager")

type ProcessManager struct {
	processMap *syncmap.SyncMap[int32, *Process] // 进程缓存 pid -> process
	// 进程匹配规则
	Rules []config.Rule
	// 动态刷新间隔
	DynamicInterval time.Duration
}

func NewProcessManager(ctx context.Context, matchRules []config.Rule, dynamicInterval int) *ProcessManager {
	if dynamicInterval == 0 {
		dynamicInterval = 15
	}
	p := &ProcessManager{Rules: matchRules, processMap: syncmap.New[int32, *Process](), DynamicInterval: time.Duration(dynamicInterval) * time.Second}
	go p.dynamicFlushProcessRoutine(ctx)
	return p
}

func (m *ProcessManager) dynamicFlushProcessRoutine(ctx context.Context) {
	m.FlushProcess()
	if m.DynamicInterval == 0 {
		return
	}
	logger.Info("processManager DynamicFlushProcessRoutine started with interval: %v", m.DynamicInterval)
	ticker := time.NewTicker(m.DynamicInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			logger.Info("DynamicFlushProcessRoutine exit")
			return
		case <-ticker.C:
			m.FlushProcess()
		}
	}
}

// 刷新进程缓存
func (m *ProcessManager) FlushProcess() error {
	// 先判断一下进程是否还活着, 不存在的从缓存中删除
	m.processMap.Range(func(pid int32, process *Process) bool {
		alive, err := process.GetProcess().IsRunning()
		if err != nil {
			return true
		}
		if !alive {
			logger.Info("FlushProcess delete dead process (%d) name (%s)", pid, process.GetName())
			m.processMap.Delete(pid)
			return true
		}
		return true
	})
	processes, err := process.Processes()
	if err != nil {
		return err
	}
	for _, rule := range m.Rules {
		processes, err := NewProcesses(rule, processes)
		if err != nil {
			continue
		}
		for _, process := range processes {
			if !m.processMap.Has(process.GetPID()) {
				logger.Info("FlushProcess new process (%d) name (%s)", process.GetPID(), process.GetName())
				m.processMap.Store(process.GetPID(), process)
			}
		}
	}
	// 每次刷新时，打印一下当前正在被监控的进程列表信息
	logger.Info("================== MonitorProcess current(%v) ==================", m.processMap.Len())
	for _, process := range m.processMap.Values() {
		logger.Info("MonitorProcess process (%d) name (%s)", process.GetPID(), process.GetName())
	}
	return nil
}
 
func (m *ProcessManager) GetProcessMap() *syncmap.SyncMap[int32, *Process] {
	return m.processMap
}

func (m *ProcessManager) GetProcesses() []*Process {
	return m.processMap.Values()
}

func (m *ProcessManager) GetFilePathPidMap() map[int32]string {
	filePathPidMap := make(map[int32]string)
	m.processMap.Range(func(pid int32, process *Process) bool {
		filePathPidMap[pid] = process.GetLogPath()
		return true
	})
	return filePathPidMap
}

func (m* ProcessManager) GetProcess(pid int32) (*Process, bool) {
	return m.processMap.Load(pid)
}