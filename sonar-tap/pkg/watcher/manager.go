package watcher

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"sonar-tap/config"
	metrics "sonar-tap/internal/api/sonar-store/metrics/v1"
	metricshandler "sonar-tap/pkg/metrics"
	"sonar-tap/pkg/process"

	"github.com/castle-x/goutils/ablog"
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

// addWatcher 添加监视器
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

	if err := watcher.Stop(); err != nil {
		wm.logger.Error("Failed to stop watcher %s: %v", name, err)
	}

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

		if stats.LastProcessTime.After(totalStats.LastProcessTime) {
			totalStats.LastProcessTime = stats.LastProcessTime
		}

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

func (w *WatcherManager) WatcherProcessManagerRoutine(ctx context.Context, ch chan *metrics.MetricPoint, logConfig config.LogConfig) {
	processManager := process.NewProcessManager(ctx, logConfig.Rules, logConfig.DynamicInterval)
	processManager.FlushProcess()

	if processManager.DynamicInterval == 0 {
		w.logger.Warn("WatcherProcessManagerRoutine: DynamicInterval is 0, skip ticker creation")
		return
	}
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

func (w *WatcherManager) FlushWatcherByProcess(ctx context.Context, processManager *process.ProcessManager, ch chan *metrics.MetricPoint, logConfig config.LogConfig) {
	currentWatcherPidFilePathMap := w.GetTotalStats().CurrentFilesPidMap
	currentProcessManagerPidFilePathMap := processManager.GetFilePathPidMap()
	for pid, filePath := range currentWatcherPidFilePathMap {
		if _, ok := currentProcessManagerPidFilePathMap[pid]; !ok {
			w.logger.Info("RemoveWatcher delete file by process (%v) (%v)", pid, filePath)
			w.RemoveWatcher(fmt.Sprintf("%v-%v", logConfig.Name, pid))
		}
	}
	for pid, filePath := range currentProcessManagerPidFilePathMap {
		if _, ok := currentWatcherPidFilePathMap[pid]; !ok {
			w.logger.Info("AddWatcher new file by process (%v) (%v)", pid, filePath)
			proc, ok := processManager.GetProcess(pid)
			if !ok {
				w.logger.Error("GetProcess failed, %v", pid)
				continue
			}
			w.AddWatcher(ctx, ch, logConfig, fmt.Sprintf("%v-%v", logConfig.Name, pid), filePath, pid, proc.GetLabels())
		}
	}
}

func (w *WatcherManager) AddHandlers(watcher FileWatcher, ch chan *metrics.MetricPoint, logConfig config.LogConfig, labels map[string]string) {
	for _, metricConfig := range logConfig.Metrics {
		handler := metricshandler.NewHandler(ch, metricConfig, labels)
		watcher.AddHandler(handler.Handle)
		if watcherImpl, ok := watcher.(*FileWatcherImpl); ok {
			watcherImpl.AddHandlerStopper(handler)
		}
	}
}

func (w *WatcherManager) AddWatcher(ctx context.Context, ch chan *metrics.MetricPoint, logConfig config.LogConfig, name string, filepath string, pid int32, labels map[string]string) {
	watcher := NewFileWatcher(logConfig, name, filepath, pid)
	w.AddHandlers(watcher, ch, logConfig, labels)
	w.addWatcher(name, watcher)
	watcher.Start(ctx)
}
