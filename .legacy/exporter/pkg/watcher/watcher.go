// Package watcher 提供日志文件监控能力。
// 使用固定 worker pool（8 worker + buffered channel）处理行事件，
// 避免为每个 log handler 单独启动 goroutine 导致 goroutine 爆炸。
package watcher

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"sync"
	"time"

	"exporter/config"

	"git.woa.com/castlexu/goutils/ablog"
	"git.woa.com/castlexu/goutils/tools"

	"github.com/fsnotify/fsnotify"
)

// workerPoolSize 固定 worker 数量
const workerPoolSize = 8

// lineEvent 行事件，用于 worker pool 处理
type lineEvent struct {
	line     string
	filename string
}

// LineHandler 行处理器函数类型
type LineHandler func(line string, filename string) error

// FileWatcher 文件监视器接口
type FileWatcher interface {
	// Start 启动监视器
	Start(ctx context.Context) error

	// Stop 停止监视器
	Stop() error

	// AddHandler 添加行处理器
	AddHandler(handler LineHandler)

	// GetStats 获取统计信息
	GetStats() WatcherStats

	// PrintStats 打印统计信息
	PrintStats(pretty bool)
}

// WatcherStats 监视器统计信息
type WatcherStats struct {
	// 处理的文件数量
	FilesWatched int64 `json:"files_watched"`

	// 处理的行数
	LinesProcessed int64 `json:"lines_processed"`

	// 错误数量
	Errors int64 `json:"errors"`

	// 重试次数
	Retries int64 `json:"retries"`

	// 文件轮转次数
	FileRotations int64 `json:"file_rotations"`

	// 最后处理时间
	LastProcessTime time.Time `json:"last_process_time"`

	// 运行时长
	Uptime time.Duration `json:"uptime"`

	// 当前监视的文件列表
	CurrentFiles []string `json:"current_files"`

	// 当前通过PID获取的文件列表
	CurrentFilesPidMap map[int32]string `json:"current_files_pid_map"`
}

// HandlerStopper 支持停止的Handler接口
type HandlerStopper interface {
	Stop()
}

// FileWatcherImpl 文件监视器实现
// 使用固定 worker pool 处理行事件，防止 goroutine 爆炸。
type FileWatcherImpl struct {
	// 配置信息
	logConfig config.LogConfig

	// 文件路径
	filePath string

	// 文件名称
	name string

	// 如果PID不为-1，则表示是通过PID获取的文件
	pid int32

	// 行处理器列表
	handlers []LineHandler

	// 需要停止的Handler列表（用于清理资源）
	handlerStoppers []HandlerStopper

	// fsnotify监视器
	fsWatcher *fsnotify.Watcher

	// 文件句柄映射
	files map[string]*os.File

	// 文件读取器映射
	readers map[string]*bufio.Reader

	// 文件偏移量映射
	offsets map[string]int64

	// 文件信息映射
	fileInfos map[string]os.FileInfo

	// 统计信息
	stats WatcherStats

	// 控制通道
	stopCh chan struct{}
	doneCh chan struct{}

	// 互斥锁（保护文件相关状态）
	mutex sync.RWMutex

	// 启动时间
	startTime time.Time

	// 日志记录器
	logger *ablog.Logger

	// 重试计数器
	retryCounters map[string]int

	// 文件轮转跟踪（记录已处理过的文件，避免重复计数）
	processedFiles map[string]bool

	// worker pool 行事件 channel（固定大小缓冲，防止背压阻塞）
	lineCh chan lineEvent

	// worker pool 完成等待
	workerWg sync.WaitGroup
}

// NewFileWatcher 创建新的文件监视器
func NewFileWatcher(logConfig config.LogConfig, name string, filePath string, pid int32) FileWatcher {
	return &FileWatcherImpl{
		logConfig:       logConfig,
		filePath:        filePath,
		name:            name,
		pid:             pid,
		handlers:        make([]LineHandler, 0),
		handlerStoppers: make([]HandlerStopper, 0),
		files:           make(map[string]*os.File),
		readers:         make(map[string]*bufio.Reader),
		offsets:         make(map[string]int64),
		fileInfos:       make(map[string]os.FileInfo),
		retryCounters:   make(map[string]int),
		processedFiles:  make(map[string]bool),
		stopCh:          make(chan struct{}),
		doneCh:          make(chan struct{}),
		lineCh:          make(chan lineEvent, 4096), // 固定 4096 缓冲
		logger:          ablog.NewLogger("file_watcher"),
	}
}

// AddHandler 添加行处理器
func (w *FileWatcherImpl) AddHandler(handler LineHandler) {
	w.mutex.Lock()
	defer w.mutex.Unlock()
	w.handlers = append(w.handlers, handler)
}

// AddHandlerStopper 添加需要停止的Handler（用于资源清理）
func (w *FileWatcherImpl) AddHandlerStopper(stopper HandlerStopper) {
	w.mutex.Lock()
	defer w.mutex.Unlock()
	w.handlerStoppers = append(w.handlerStoppers, stopper)
}

// Start 启动监视器（含固定 worker pool）
func (w *FileWatcherImpl) Start(ctx context.Context) error {
	w.mutex.Lock()
	defer w.mutex.Unlock()

	w.startTime = time.Now()
	w.logger.Info("Starting file watcher for: %s", w.name)

	// 初始化fsnotify监视器（如果启用）
	if w.logConfig.WatchConfig.UseInotify {
		var err error
		w.fsWatcher, err = fsnotify.NewWatcher()
		if err != nil {
			return fmt.Errorf("failed to create fsnotify watcher: %w", err)
		}
	}

	// 查找并打开文件
	if err := w.discoverAndOpenFiles(); err != nil {
		return fmt.Errorf("failed to discover files: %w", err)
	}

	// 启动固定 worker pool（替代每个 handler 独立 goroutine）
	for i := 0; i < workerPoolSize; i++ {
		w.workerWg.Add(1)
		go w.lineWorker()
	}

	// 启动监视循环
	go w.watchLoop(ctx)

	w.logger.Info("File watcher started with %d workers", workerPoolSize)
	return nil
}

// lineWorker 固定 worker，从 lineCh 取行事件并分发给所有 handlers
func (w *FileWatcherImpl) lineWorker() {
	defer w.workerWg.Done()
	for event := range w.lineCh {
		w.mutex.RLock()
		handlers := w.handlers
		w.mutex.RUnlock()
		for _, handler := range handlers {
			if err := handler(event.line, event.filename); err != nil {
				w.logger.Error("handler error for line from %s: %v", event.filename, err)
			}
		}
	}
}

// Stop 停止监视器
func (w *FileWatcherImpl) Stop() error {
	w.logger.Info("Stopping file watcher for: %s", w.name)

	// 发送停止信号
	close(w.stopCh)

	// 等待监视循环结束
	<-w.doneCh

	// 关闭行事件 channel，等待 workers 退出
	close(w.lineCh)
	w.workerWg.Wait()

	w.mutex.Lock()
	defer w.mutex.Unlock()

	// 停止所有 HandlerStopper（清理资源）
	for _, stopper := range w.handlerStoppers {
		stopper.Stop()
	}
	w.logger.Info("Stopped %d handler stopper(s)", len(w.handlerStoppers))

	// 关闭fsnotify监视器
	if w.fsWatcher != nil {
		w.fsWatcher.Close()
	}

	// 关闭所有文件
	for filename, file := range w.files {
		if err := file.Close(); err != nil {
			w.logger.Error("Failed to close file %s: %v", filename, err)
		}
	}

	w.logger.Info("File watcher stopped")
	return nil
}

// GetStats 获取统计信息
func (w *FileWatcherImpl) GetStats() WatcherStats {
	w.mutex.RLock()
	defer w.mutex.RUnlock()

	stats := w.stats
	stats.Uptime = time.Since(w.startTime)
	stats.CurrentFiles = make([]string, 0, len(w.files))
	stats.CurrentFilesPidMap = make(map[int32]string)
	for filename := range w.files {
		stats.CurrentFiles = append(stats.CurrentFiles, filename)
		if w.pid != -1 {
			stats.CurrentFilesPidMap[w.pid] = filename
		}
	}

	return stats
}

func (w *FileWatcherImpl) PrintStats(pretty bool) {
	stats := w.GetStats()
	if pretty {
		fmt.Println("FileWatcherStats: ", w.name)
		fmt.Println("├──FilesWatched: ", stats.FilesWatched)
		fmt.Println("├──LinesProcessed: ", stats.LinesProcessed)
		fmt.Println("├──Errors: ", stats.Errors)
		fmt.Println("├──Retries: ", stats.Retries)
		fmt.Println("├──FileRotations: ", stats.FileRotations)
		fmt.Println("├──LastProcessTime: ", stats.LastProcessTime)
		fmt.Println("├──Uptime: ", stats.Uptime)
		fmt.Println("└──CurrentFiles: ", stats.CurrentFiles)
	} else {
		w.logger.Info("Stats: %s", tools.Json(stats))
	}
}
