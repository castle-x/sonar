package watcher

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"sonar-tap/config"

	"github.com/fsnotify/fsnotify"
)

// discoverAndOpenFiles 发现并打开文件
func (w *FileWatcherImpl) discoverAndOpenFiles() error {
	var filesToWatch []string

	if w.logConfig.IsPattern() {
		matches, err := filepath.Glob(w.filePath)
		if err != nil {
			return fmt.Errorf("failed to glob pattern %s: %w", w.filePath, err)
		}
		filesToWatch = matches
	} else {
		filesToWatch = []string{w.filePath}
	}

	for _, filename := range filesToWatch {
		if _, exists := w.files[filename]; exists {
			continue
		}
		if err := w.openFile(filename); err != nil {
			w.logger.Error("Failed to open file %s: %v", filename, err)
			w.incrementError()
		}
	}

	return nil
}

// openFile 打开单个文件
func (w *FileWatcherImpl) openFile(filename string) error {
	fileInfo, err := os.Stat(filename)
	if err != nil {
		if os.IsNotExist(err) {
			w.logger.Warn("File %s does not exist, will retry later", filename)
			return nil
		}
		return fmt.Errorf("failed to stat file %s: %w", filename, err)
	}

	if w.logConfig.MaxFileSizeMB != 0 && fileInfo.Size() > w.logConfig.MaxFileSizeMB*1024*1024 {
		w.logger.Warn("File %s exceeds size limit (%d MB), skipping", filename, w.logConfig.MaxFileSizeMB)
		return nil
	}

	file, err := os.Open(filename)
	if err != nil {
		return fmt.Errorf("failed to open file %s: %w", filename, err)
	}

	var offset int64
	if w.logConfig.ReadMode == string(config.ReadModeTail) {
		offset = fileInfo.Size()
	} else {
		offset = 0
	}

	if _, err := file.Seek(offset, 0); err != nil {
		file.Close()
		return fmt.Errorf("failed to seek file %s: %w", filename, err)
	}

	w.files[filename] = file
	w.readers[filename] = bufio.NewReader(file)
	w.offsets[filename] = offset
	w.fileInfos[filename] = fileInfo

	if w.fsWatcher != nil {
		if err := w.fsWatcher.Add(filename); err != nil {
			w.logger.Error("Failed to add file %s to fsnotify: %v", filename, err)
		}
	}

	if !w.processedFiles[filename] {
		w.stats.FilesWatched++
		w.processedFiles[filename] = true
		w.logger.Info("Opened new file %s for watching (mode: %s, offset: %d)", filename, w.logConfig.ReadMode, offset)
	} else {
		w.logger.Info("Reopened rotated file %s for watching (mode: %s, offset: %d)", filename, w.logConfig.ReadMode, offset)
	}

	if w.logConfig.ReadMode == string(config.ReadModeHead) {
		w.readNewLines(filename)
	}

	return nil
}

// watchLoop 主监视循环
func (w *FileWatcherImpl) watchLoop(ctx context.Context) {
	defer close(w.doneCh)

	pollTicker := time.NewTicker(w.getPollInterval())
	rotateTicker := time.NewTicker(w.getRotateCheckInterval())

	defer pollTicker.Stop()
	defer rotateTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			w.logger.Info("Context cancelled, stopping watcher")
			return

		case <-w.stopCh:
			w.logger.Info("Stop signal received, stopping watcher")
			return

		case event, ok := <-w.getEventChannel():
			if !ok {
				continue
			}
			w.handleFsnotifyEvent(event)

		case <-pollTicker.C:
			w.pollFiles()

		case <-rotateTicker.C:
			w.checkFileRotation()
		}
	}
}

// getEventChannel 获取事件通道
func (w *FileWatcherImpl) getEventChannel() <-chan fsnotify.Event {
	if w.fsWatcher != nil {
		return w.fsWatcher.Events
	}
	return make(chan fsnotify.Event)
}

// handleFsnotifyEvent 处理fsnotify事件
func (w *FileWatcherImpl) handleFsnotifyEvent(event fsnotify.Event) {
	w.mutex.Lock()
	defer w.mutex.Unlock()

	filename := event.Name

	switch {
	case event.Op&fsnotify.Write == fsnotify.Write:
		w.logger.Debug("File %s was written", filename)
		w.readNewLines(filename)

	case event.Op&fsnotify.Create == fsnotify.Create:
		w.logger.Info("File %s was created", filename)
		if err := w.openFile(filename); err != nil {
			w.logger.Error("Failed to open created file %s: %v", filename, err)
		}

	case event.Op&fsnotify.Remove == fsnotify.Remove:
		w.logger.Warn("File %s was removed", filename)
		w.closeFile(filename)

	case event.Op&fsnotify.Rename == fsnotify.Rename:
		w.logger.Info("File %s was renamed (possible rotation)", filename)
		w.closeFile(filename)
	}
}

// pollFiles 轮询文件变化
func (w *FileWatcherImpl) pollFiles() {
	w.mutex.Lock()
	defer w.mutex.Unlock()

	for filename := range w.files {
		w.checkFileChanges(filename)
	}

	if err := w.discoverAndOpenFiles(); err != nil {
		w.logger.Error("Failed to rediscover files: %v", err)
	}
}

// checkFileChanges 检查文件变化
func (w *FileWatcherImpl) checkFileChanges(filename string) {
	fileInfo, err := os.Stat(filename)
	if err != nil {
		if os.IsNotExist(err) {
			w.logger.Warn("File %s no longer exists (possible rotation)", filename)
			w.stats.FileRotations++
			w.closeFile(filename)
		} else {
			w.logger.Error("Failed to stat file %s: %v", filename, err)
		}
		return
	}

	oldInfo := w.fileInfos[filename]
	if fileInfo.Size() > oldInfo.Size() || fileInfo.ModTime().After(oldInfo.ModTime()) {
		w.readNewLines(filename)
		w.fileInfos[filename] = fileInfo
	}
}

// readNewLines 读取新行
func (w *FileWatcherImpl) readNewLines(filename string) {
	file, ok := w.files[filename]
	if !ok {
		return
	}

	reader, ok := w.readers[filename]
	if !ok {
		return
	}

	currentOffset := w.offsets[filename]
	if _, err := file.Seek(currentOffset, 0); err != nil {
		w.logger.Error("Failed to seek file %s to offset %d: %v", filename, currentOffset, err)
		return
	}

	reader.Reset(file)

	for {
		line, isPrefix, err := reader.ReadLine()
		if err != nil {
			if err == io.EOF {
				break
			}
			w.logger.Error("Failed to read line from %s: %v, isPrefix: %v", filename, err, isPrefix)
			w.incrementError()
			break
		}

		w.offsets[filename] += int64(len(line)) + 1

		lineStr := string(line)
		w.processLine(lineStr, filename)
	}

	w.stats.LastProcessTime = time.Now()
}

// processLine 处理单行内容
func (w *FileWatcherImpl) processLine(line, filename string) {
	line = strings.TrimSpace(line)
	if line == "" {
		return
	}

	w.stats.LinesProcessed++

	event := lineEvent{line: line, filename: filename}
	select {
	case w.lineCh <- event:
	default:
		w.incrementError()
		w.logger.Warn("lineCh full, dropping line from %s", filename)
	}
}

// checkFileRotation 检查文件轮转
func (w *FileWatcherImpl) checkFileRotation() {
	w.mutex.Lock()
	defer w.mutex.Unlock()

	for filename := range w.files {
		fileInfo, err := os.Stat(filename)
		if err != nil {
			if os.IsNotExist(err) {
				w.logger.Info("File %s rotated (deleted), reopening", filename)
				w.stats.FileRotations++
				w.closeFile(filename)
				w.retryOpenFile(filename)
			}
			continue
		}

		oldInfo := w.fileInfos[filename]
		if !os.SameFile(oldInfo, fileInfo) {
			w.logger.Info("File %s rotated (inode changed), reopening", filename)
			w.stats.FileRotations++
			w.closeFile(filename)
			if err := w.openFile(filename); err != nil {
				w.logger.Error("Failed to reopen rotated file %s: %v", filename, err)
			}
		}
	}
}

// retryOpenFile 重试打开文件
func (w *FileWatcherImpl) retryOpenFile(filename string) {
	retryCount := w.retryCounters[filename]
	maxRetries := w.logConfig.WatchConfig.MaxRetries

	if retryCount >= maxRetries {
		w.logger.Error("Max retries (%d) reached for file %s", maxRetries, filename)
		delete(w.retryCounters, filename)
		return
	}

	if err := w.openFile(filename); err != nil {
		w.retryCounters[filename]++
		w.stats.Retries++
		w.logger.Warn("Retry %d/%d failed for file %s: %v", retryCount+1, maxRetries, filename, err)
	} else {
		delete(w.retryCounters, filename)
	}
}

// closeFile 关闭文件
func (w *FileWatcherImpl) closeFile(filename string) {
	if file, ok := w.files[filename]; ok {
		file.Close()
		delete(w.files, filename)
	}

	delete(w.readers, filename)
	delete(w.offsets, filename)
	delete(w.fileInfos, filename)

	if w.fsWatcher != nil {
		w.fsWatcher.Remove(filename)
	}

	w.logger.Info("Closed file %s", filename)
}

// incrementError 增加错误计数
func (w *FileWatcherImpl) incrementError() {
	w.stats.Errors++
}

// getPollInterval 获取轮询间隔
func (w *FileWatcherImpl) getPollInterval() time.Duration {
	duration, err := time.ParseDuration(w.logConfig.WatchConfig.PollInterval)
	if err != nil {
		return time.Second
	}
	return duration
}

// getRotateCheckInterval 获取轮转检查间隔
func (w *FileWatcherImpl) getRotateCheckInterval() time.Duration {
	duration, err := time.ParseDuration(w.logConfig.WatchConfig.RotateCheckInterval)
	if err != nil {
		return 10 * time.Second
	}
	return duration
}
