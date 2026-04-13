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

	"sonar-tap/config"

	"github.com/castle-x/goutils/ablog"
	"github.com/castle-x/goutils/tools"

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
	FilesWatched       int64             `json:"files_watched"`
	LinesProcessed     int64             `json:"lines_processed"`
	Errors             int64             `json:"errors"`
	Retries            int64             `json:"retries"`
	FileRotations      int64             `json:"file_rotations"`
	LastProcessTime    time.Time         `json:"last_process_time"`
	Uptime             time.Duration     `json:"uptime"`
	CurrentFiles       []string          `json:"current_files"`
	CurrentFilesPidMap map[int32]string  `json:"current_files_pid_map"`
}

// HandlerStopper 支持停止的Handler接口
type HandlerStopper interface {
	Stop()
}

// FileWatcherImpl 文件监视器实现
type FileWatcherImpl struct {
	logConfig       config.LogConfig
	filePath        string
	name            string
	pid             int32
	handlers        []LineHandler
	handlerStoppers []HandlerStopper
	fsWatcher       *fsnotify.Watcher
	files           map[string]*os.File
	readers         map[string]*bufio.Reader
	offsets         map[string]int64
	fileInfos       map[string]os.FileInfo
	stats           WatcherStats
	stopCh          chan struct{}
	doneCh          chan struct{}
	mutex           sync.RWMutex
	startTime       time.Time
	logger          *ablog.Logger
	retryCounters   map[string]int
	processedFiles  map[string]bool
	lineCh          chan lineEvent
	workerWg        sync.WaitGroup
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
		lineCh:          make(chan lineEvent, 4096),
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

	if w.logConfig.WatchConfig.UseInotify {
		var err error
		w.fsWatcher, err = fsnotify.NewWatcher()
		if err != nil {
			return fmt.Errorf("failed to create fsnotify watcher: %w", err)
		}
	}

	if err := w.discoverAndOpenFiles(); err != nil {
		return fmt.Errorf("failed to discover files: %w", err)
	}

	for i := 0; i < workerPoolSize; i++ {
		w.workerWg.Add(1)
		go w.lineWorker()
	}

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

	close(w.stopCh)
	<-w.doneCh

	close(w.lineCh)
	w.workerWg.Wait()

	w.mutex.Lock()
	defer w.mutex.Unlock()

	for _, stopper := range w.handlerStoppers {
		stopper.Stop()
	}
	w.logger.Info("Stopped %d handler stopper(s)", len(w.handlerStoppers))

	if w.fsWatcher != nil {
		w.fsWatcher.Close()
	}

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
