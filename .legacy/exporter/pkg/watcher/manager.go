package watcher

import (
	"context"
	"fmt"
	"exporter/config"
	"exporter/pkg/metrics"
	"exporter/pkg/process"
	v1 "exporter/pkg/datasource/apis/metrics/v1"
	"strings"
	"sync"
	"time"

	"git.woa.com/castlexu/goutils/ablog"
)

// WatcherManager 监视器管理器
type WatcherManager struct {
	watchers map[string]FileWatcher
	mutex    sync.RWMutex
	logger   *ablog.Logger
}

// NewWatcherManager 创建监视器管理器
func NewWatcherManager() *WatcherManager {
	return &WatcherManager{
		watchers: make(map[string]FileWatcher),
		logger:   ablog.NewLogger("watcher_manager"),
	}
}

// AddWatcher 添加监视器
func (wm *WatcherManager) addWatcher(name string, watcher FileWatcher) {
	wm.mutex.Lock()
	defer wm.mutex.Unlock()

	wm.watchers[name] = watcher
	wm.logger.Info("Added watcher: %s", name)
}

// RemoveWatcher 移除监视器
func (wm *WatcherManager) RemoveWatcher(name string) error {
	wm.mutex.Lock()
	defer wm.mutex.Unlock()

	if watcher, ok := wm.watchers[name]; ok {
		if err := watcher.Stop(); err != nil {
			return fmt.Errorf("failed to stop watcher %s: %w", name, err)
		}
		delete(wm.watchers, name)
		wm.logger.Info("Removed watcher: %s", name)
	}

	return nil
}

// StartAll 启动所有监视器
/* func (wm *WatcherManager) StartAll(ctx context.Context) error {
	wm.mutex.RLock()
	defer wm.mutex.RUnlock()

	for name, watcher := range wm.watchers {
		if err := watcher.Start(ctx); err != nil {
			return fmt.Errorf("failed to start watcher %s: %w", name, err)
		}
	}

	wm.logger.Info("Started %d watchers", len(wm.watchers))
	return nil
} */

// StopAll 停止所有监视器并清空 watcher map（热更新后调用）
func (wm *WatcherManager) StopAll() error {
	wm.mutex.Lock()
	defer wm.mutex.Unlock()

	var errors []string
	for name, watcher := range wm.watchers {
		if err := watcher.Stop(); err != nil {
			errors = append(errors, fmt.Sprintf("watcher %s: %v", name, err))
		}
	}

	// 清空 map，确保热更新后 /api/v1/watchers 不返回已停止的条目
	wm.watchers = make(map[string]FileWatcher)

	if len(errors) > 0 {
		return fmt.Errorf("failed to stop some watchers: %s", strings.Join(errors, ", "))
	}

	wm.logger.Info("Stopped all watchers")
	return nil
}

// GetWatcher 获取指定监视器
func (wm *WatcherManager) GetWatcher(name string) (FileWatcher, bool) {
	wm.mutex.RLock()
	defer wm.mutex.RUnlock()

	watcher, ok := wm.watchers[name]
	return watcher, ok
}

// GetAllStats 获取所有监视器统计信息
func (wm *WatcherManager) GetAllStats() map[string]WatcherStats {
	wm.mutex.RLock()
	defer wm.mutex.RUnlock()

	stats := make(map[string]WatcherStats)
	for name, watcher := range wm.watchers {
		stats[name] = watcher.GetStats()
	}

	return stats
}

// GetWatcherNames 获取所有监视器名称
func (wm *WatcherManager) GetWatcherNames() []string {
	wm.mutex.RLock()
	defer wm.mutex.RUnlock()

	names := make([]string, 0, len(wm.watchers))
	for name := range wm.watchers {
		names = append(names, name)
	}

	return names
}

// GetWatcherCount 获取监视器数量
func (wm *WatcherManager) GetWatcherCount() int {
	wm.mutex.RLock()
	defer wm.mutex.RUnlock()

	return len(wm.watchers)
}

// HasWatcher 检查是否存在指定名称的监视器
func (wm *WatcherManager) HasWatcher(name string) bool {
	wm.mutex.RLock()
	defer wm.mutex.RUnlock()

	_, ok := wm.watchers[name]
	return ok
}

// RestartWatcher 重启指定监视器
func (wm *WatcherManager) RestartWatcher(ctx context.Context, name string) error {
	wm.mutex.Lock()
	defer wm.mutex.Unlock()

	watcher, ok := wm.watchers[name]
	if !ok {
		return fmt.Errorf("watcher %s not found", name)
	}

	// 停止监视器
	if err := watcher.Stop(); err != nil {
		wm.logger.Error("Failed to stop watcher %s: %v", name, err)
	}

	// 重新启动监视器
	if err := watcher.Start(ctx); err != nil {
		return fmt.Errorf("failed to restart watcher %s: %w", name, err)
	}

	wm.logger.Info("Restarted watcher: %s", name)
	return nil
}

// GetTotalStats 获取所有监视器的汇总统计信息
func (wm *WatcherManager) GetTotalStats() WatcherStats {
	wm.mutex.RLock()
	defer wm.mutex.RUnlock()

	var totalStats WatcherStats
	allFiles := make([]string, 0)
	allPidFilePathMap := make(map[int32]string)

	for _, watcher := range wm.watchers {
		stats := watcher.GetStats()
		totalStats.FilesWatched += stats.FilesWatched
		totalStats.LinesProcessed += stats.LinesProcessed
		totalStats.Errors += stats.Errors
		totalStats.Retries += stats.Retries

		// 更新最后处理时间（取最新的）
		if stats.LastProcessTime.After(totalStats.LastProcessTime) {
			totalStats.LastProcessTime = stats.LastProcessTime
		}

		// 合并文件列表
		allFiles = append(allFiles, stats.CurrentFiles...)
		for pid, filePath := range stats.CurrentFilesPidMap {
			allPidFilePathMap[pid] = filePath
		}
	}

	totalStats.CurrentFiles = allFiles
	totalStats.CurrentFilesPidMap = allPidFilePathMap
	return totalStats
}

func (w *WatcherManager) PrintStats(pretty bool) {
	totalStats := w.GetTotalStats()
	allStats := w.GetAllStats()

	if pretty {
		w.printPrettyStats(totalStats, allStats)
	} else {
		w.printSimpleStats(totalStats, allStats)
	}
}

// printPrettyStats 打印格式化的统计信息
func (w *WatcherManager) printPrettyStats(totalStats WatcherStats, allStats map[string]WatcherStats) {
	w.logger.Info("=== WatcherManager 统计信息 ===")
	w.logger.Info("总监视器数量: %d", len(allStats))
	w.logger.Info("总监视文件数: %d", totalStats.FilesWatched)
	w.logger.Info("总处理行数: %d", totalStats.LinesProcessed)
	w.logger.Info("总错误数: %d", totalStats.Errors)
	w.logger.Info("总重试次数: %d", totalStats.Retries)
	w.logger.Info("总文件轮转次数: %d", totalStats.FileRotations)
	w.logger.Info("最后处理时间: %s", totalStats.LastProcessTime.Format("2006-01-02 15:04:05"))
	w.logger.Info("运行时长: %s", totalStats.Uptime.String())

	/* if len(totalStats.CurrentFiles) > 0 {
		w.logger.Info("当前监视的文件:")
		for i, file := range totalStats.CurrentFiles {
			w.logger.Info("  [%d] %s", i+1, file)
		}
	} */

	w.logger.Info("=== 各监视器详细信息 ===")
	for name, stats := range allStats {
		w.logger.Info("监视器: %s", name)
		w.logger.Info("  监视文件数: %d", stats.FilesWatched)
		w.logger.Info("  处理行数: %d", stats.LinesProcessed)
		w.logger.Info("  错误数: %d", stats.Errors)
		w.logger.Info("  重试次数: %d", stats.Retries)
		w.logger.Info("  文件轮转次数: %d", stats.FileRotations)
		w.logger.Info("  最后处理时间: %s", stats.LastProcessTime.Format("2006-01-02 15:04:05"))
		w.logger.Info("  运行时长: %s", stats.Uptime.String())
		if len(stats.CurrentFiles) > 0 {
			w.logger.Info("  当前文件:")
			for i, file := range stats.CurrentFiles {
				w.logger.Info("    (%d) %s", i+1, file)
			}
		}
		w.logger.Info("")
	}
}

// printSimpleStats 打印简单格式的统计信息
func (w *WatcherManager) printSimpleStats(totalStats WatcherStats, allStats map[string]WatcherStats) {
	w.logger.Info("WatcherManager Stats - Watchers: %d, Files: %d, Lines: %d, Errors: %d, Retries: %d, Rotations: %d, LastProcess: %s, Uptime: %s",
		len(allStats),
		totalStats.FilesWatched,
		totalStats.LinesProcessed,
		totalStats.Errors,
		totalStats.Retries,
		totalStats.FileRotations,
		totalStats.LastProcessTime.Format("2006-01-02 15:04:05"),
		totalStats.Uptime.String())

	for name, stats := range allStats {
		w.logger.Info("Watcher[%s] - Files: %d, Lines: %d, Errors: %d, Retries: %d, Rotations: %d, LastProcess: %s, Uptime: %s",
			name,
			stats.FilesWatched,
			stats.LinesProcessed,
			stats.Errors,
			stats.Retries,
			stats.FileRotations,
			stats.LastProcessTime.Format("2006-01-02 15:04:05"),
			stats.Uptime.String())
	}
}

func (w *WatcherManager) WatcherProcessManagerRoutine(ctx context.Context, ch chan *v1.RequestMetricPoint, logConfig config.LogConfig) {
	processManager := process.NewProcessManager(ctx, logConfig.Rules, logConfig.DynamicInterval)
	processManager.FlushProcess() // 收到刷新 初始化一次

	// 如果 DynamicInterval 为 0，不创建 ticker，直接返回
	if processManager.DynamicInterval == 0 {
		w.logger.Warn("WatcherProcessManagerRoutine: DynamicInterval is 0, skip ticker creation")
		return
	}
	// 立即触发一次
	w.FlushWatcherByProcess(ctx, processManager, ch, logConfig)

	ticker := time.NewTicker(processManager.DynamicInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			w.logger.Info("WatcherProcessManagerRoutine exit")
			return
		case <-ticker.C:
			w.FlushWatcherByProcess(ctx, processManager, ch, logConfig)
		}
	}
}

func (w *WatcherManager) FlushWatcherByProcess(ctx context.Context, processManager *process.ProcessManager, ch chan *v1.RequestMetricPoint, logConfig config.LogConfig) {
	//
	currentWatcherPidFilePathMap := w.GetTotalStats().CurrentFilesPidMap
	currentProcessManagerPidFilePathMap := processManager.GetFilePathPidMap()
	// 对比当前进程列表的日志，是否有新增
	for pid, filePath := range currentWatcherPidFilePathMap {
		if _, ok := currentProcessManagerPidFilePathMap[pid]; !ok {
			// 已经监视的文件，在进程列表中不存在，需要删除
			w.logger.Info("RemoveWatcher delete file by process (%v) (%v)", pid, filePath)
			w.RemoveWatcher(fmt.Sprintf("%v-%v", logConfig.Name, pid))
		}
	}
	for pid, filePath := range currentProcessManagerPidFilePathMap {
		if _, ok := currentWatcherPidFilePathMap[pid]; !ok {
			// 反过来，是需要新增的
			w.logger.Info("AddWatcher new file by process (%v) (%v)", pid, filePath)
			process, ok := processManager.GetProcess(pid)
			if !ok {
				w.logger.Error("GetProcess failed, %v", pid)
				continue
			}
			w.AddWatcher(ctx, ch, logConfig, fmt.Sprintf("%v-%v", logConfig.Name, pid), filePath, pid, process.GetLabels())
		}
	}
}

func (w *WatcherManager) AddHandlers(watcher FileWatcher, ch chan *v1.RequestMetricPoint, logConfig config.LogConfig, labels map[string]string) {
	for _, metricConfig := range logConfig.Metrics {
		handler := metrics.NewHandler(ch, metricConfig, labels)
		watcher.AddHandler(handler.Handle)
		// 如果 watcher 支持添加 HandlerStopper，则注册（用于资源清理）
		if watcherImpl, ok := watcher.(*FileWatcherImpl); ok {
			watcherImpl.AddHandlerStopper(handler)
		}
	}
}

func (w *WatcherManager) AddWatcher(ctx context.Context, ch chan *v1.RequestMetricPoint, logConfig config.LogConfig, name string, filepath string, pid int32, labels map[string]string) {
	watcher := NewFileWatcher(logConfig, name, filepath, pid)
	w.AddHandlers(watcher, ch, logConfig, labels)
	w.addWatcher(name, watcher)
	watcher.Start(ctx)
}
