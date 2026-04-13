package watcher

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"sync"
	"time"

	"log_exporter/config"

	"git.woa.com/castlexu/goutils/ablog"
	"git.woa.com/castlexu/goutils/tools"

	"github.com/fsnotify/fsnotify"
)

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
type FileWatcherImpl struct {
	// 配置信息
	logConfig config.LogConfig

	// 文件路径
	filePath string

	// 文件名称
	name string

	// 如果PID不为0，则表示是通过PID获取的文件
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

	// 互斥锁
	mutex sync.RWMutex

	// 启动时间
	startTime time.Time

	// 日志记录器
	logger *ablog.Logger

	// 重试计数器
	retryCounters map[string]int

	// 文件轮转跟踪（记录已处理过的文件，避免重复计数）
	processedFiles map[string]bool
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

// Start 启动监视器
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

	// 启动监视协程
	go w.watchLoop(ctx)

	w.logger.Info("File watcher started successfully")
	return nil
}

// Stop 停止监视器
func (w *FileWatcherImpl) Stop() error {
	w.logger.Info("Stopping file watcher for: %s", w.name)

	// 发送停止信号
	close(w.stopCh)

	// 等待监视循环结束
	<-w.doneCh

	w.mutex.Lock()
	defer w.mutex.Unlock()

	// 停止所有 Handler（清理资源，如关闭定时器协程）
	for _, stopper := range w.handlerStoppers {
		stopper.Stop()
	}
	w.logger.Info("Stopped %d handler(s)", len(w.handlerStoppers))

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
		// 好看的格式，而非JSON，需要带说明 用类似目录tree的格式
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
