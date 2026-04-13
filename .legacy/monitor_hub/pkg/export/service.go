package export

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"monitor_hub/pkg/taskpool"
)

// 任务类型常量
const (
	TaskTypeExport = "export" // 导出任务类型
)

// ExportService 导出服务
// 负责：
// 1. 接收导出请求，创建任务并提交到任务池
// 2. 管理导出文件的生命周期（存储、过期清理）
// 3. 提供文件下载
//
// 不负责：
// 1. 任务调度（由 TaskPool 负责）
// 2. 事件推送（由 TaskPool + EventPublisher 负责）
type ExportService struct {
	exporter  *Exporter          // chromedp 导出器
	config    *ExportConfig      // 配置
	taskPool  *taskpool.TaskPool // 任务池（外部注入）
	taskFiles sync.Map           // map[taskID]*ExportTaskFile - 存储任务文件信息
	ctx       context.Context
	cancel    context.CancelFunc
}

// ExportTaskFile 导出任务文件信息（与 taskpool.Task 分离，仅存储文件相关信息）
type ExportTaskFile struct {
	TaskID      string    // 关联的任务 ID
	FilePath    string    // 文件路径
	DownloadURL string    // 下载 URL
	ExpiresAt   time.Time // 过期时间
}

// NewExportService 创建导出服务
//
// 参数:
// - config: 导出配置（可选，nil 则使用默认配置）
// - taskPool: 任务池（必须，用于调度导出任务）
//
// 示例:
//
//	pool := taskpool.New(taskpool.WithMaxWorkers(3))
//	pool.SetEventPublisher(wsManager) // 设置事件发布器
//	exportService := export.NewExportService(nil, pool)
func NewExportService(config *ExportConfig, taskPool *taskpool.TaskPool) *ExportService {
	if config == nil {
		config = DefaultConfig()
	}

	// 确保输出目录存在
	if err := os.MkdirAll(config.OutputDir, 0755); err != nil {
		logger.Warn("[ExportService] Failed to create output directory: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())

	service := &ExportService{
		exporter: NewExporter(config),
		config:   config,
		taskPool: taskPool,
		ctx:      ctx,
		cancel:   cancel,
	}

	// 启动文件清理器
	go service.fileCleaner()

	return service
}

// SubmitExport 提交导出任务到任务池
//
// 参数:
// - req: 导出请求（reportID, reportName, format, pageURL）
//
// 返回:
// - taskID: 任务 ID（可用于查询任务状态和下载文件）
//
// 示例:
//
//	taskID := service.SubmitExport(&export.ExportRequest{
//		ReportID:   "report123",
//		ReportName: "性能测试报告",
//		Format:     export.FormatPDF,
//		PageURL:    "http://localhost:5173/report/report123?export=true",
//		PreActions: export.DefaultReportExportActions(), // 可选：导出前操作
//	})
func (s *ExportService) SubmitExport(req *ExportRequest) string {
	// 提交任务到任务池
	taskID := s.taskPool.Submit(
		TaskTypeExport,
		func(task *taskpool.Task) error {
			return s.executeExport(task, req)
		},
		taskpool.WithTaskName(fmt.Sprintf("导出: %s (%s)", req.ReportName, req.Format)),
		taskpool.WithTaskMetadata(map[string]any{
			"report_id":   req.ReportID,
			"report_name": req.ReportName,
			"format":      string(req.Format),
			"page_url":    req.PageURL,
		}),
		taskpool.WithEstimatedTime(60), // 预计 60 秒
	)

	logger.Info("[ExportService] Export task submitted: taskID=%s, reportID=%s, format=%s", taskID, req.ReportID, req.Format)

	return taskID
}

// executeExport 执行导出任务（由任务池调用）
func (s *ExportService) executeExport(task *taskpool.Task, req *ExportRequest) error {
	// 进度回调 - 更新任务进度
	onProgress := func(progress int32, message string) {
		task.UpdateProgressWithMessage(progress, message)
	}

	// 执行导出
	result, err := s.exporter.Export(s.ctx, req, onProgress)
	if err != nil {
		return fmt.Errorf("export failed: %w", err)
	}

	// 保存文件信息
	fileInfo := &ExportTaskFile{
		TaskID:      task.ID,
		FilePath:    result.FilePath,
		DownloadURL: result.DownloadURL,
		ExpiresAt:   time.Now().Add(time.Duration(s.config.FileExpiration) * time.Hour),
	}
	s.taskFiles.Store(task.ID, fileInfo)

	// 更新任务元数据（供前端查询下载链接）
	task.SetMetadata("download_url", result.DownloadURL)
	task.SetMetadata("file_size", result.FileSize)

	logger.Info("[ExportService] Export completed: taskID=%s, file=%s", task.ID, result.FilePath)

	return nil
}

// ExportSync 同步导出（阻塞等待导出完成）
// 适合简单场景，不需要任务管理
func (s *ExportService) ExportSync(ctx context.Context, req *ExportRequest) (*ExportResult, error) {
	return s.exporter.Export(ctx, req, nil)
}

// GetTask 获取任务信息
func (s *ExportService) GetTask(taskID string) (*taskpool.TaskInfo, bool) {
	return s.taskPool.GetTask(taskID)
}

// GetTaskFile 获取任务文件内容
func (s *ExportService) GetTaskFile(taskID string) ([]byte, string, error) {
	// 检查任务状态
	taskInfo, ok := s.taskPool.GetTask(taskID)
	if !ok {
		return nil, "", fmt.Errorf("task not found: %s", taskID)
	}

	if taskInfo.Status != taskpool.TaskStatusCompleted {
		return nil, "", fmt.Errorf("task not completed: %s", taskInfo.Status)
	}

	// 获取文件信息
	fileValue, ok := s.taskFiles.Load(taskID)
	if !ok {
		return nil, "", fmt.Errorf("file info not found for task: %s", taskID)
	}
	fileInfo := fileValue.(*ExportTaskFile)

	// 检查文件是否过期
	if time.Now().After(fileInfo.ExpiresAt) {
		return nil, "", fmt.Errorf("file has expired")
	}

	// 检查文件是否存在
	if _, err := os.Stat(fileInfo.FilePath); os.IsNotExist(err) {
		return nil, "", fmt.Errorf("file not found: %s", fileInfo.FilePath)
	}

	// 读取文件
	data, err := os.ReadFile(fileInfo.FilePath)
	if err != nil {
		return nil, "", fmt.Errorf("failed to read file: %w", err)
	}

	filename := filepath.Base(fileInfo.FilePath)

	return data, filename, nil
}

// DeleteTaskFile 删除任务文件
func (s *ExportService) DeleteTaskFile(taskID string) error {
	fileValue, ok := s.taskFiles.Load(taskID)
	if !ok {
		return nil // 文件不存在，视为已删除
	}

	fileInfo := fileValue.(*ExportTaskFile)

	// 删除文件目录
	if fileInfo.FilePath != "" {
		dir := filepath.Dir(fileInfo.FilePath)
		if err := os.RemoveAll(dir); err != nil {
			logger.Warn("[ExportService] Failed to delete file: %v", err)
		}
	}

	// 删除记录
	s.taskFiles.Delete(taskID)

	logger.Info("[ExportService] Task file deleted: %s", taskID)
	return nil
}

// fileCleaner 定期清理过期文件
func (s *ExportService) fileCleaner() {
	ticker := time.NewTicker(30 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			s.cleanExpiredFiles()
		}
	}
}

// cleanExpiredFiles 清理过期文件
func (s *ExportService) cleanExpiredFiles() {
	now := time.Now()
	var expiredTaskIDs []string

	s.taskFiles.Range(func(key, value interface{}) bool {
		fileInfo := value.(*ExportTaskFile)
		if now.After(fileInfo.ExpiresAt) {
			expiredTaskIDs = append(expiredTaskIDs, key.(string))
		}
		return true
	})

	for _, taskID := range expiredTaskIDs {
		s.DeleteTaskFile(taskID)
	}

	if len(expiredTaskIDs) > 0 {
		logger.Info("[ExportService] Cleaned %d expired files", len(expiredTaskIDs))
	}
}

// Stop 停止服务
func (s *ExportService) Stop() {
	s.cancel()
	logger.Info("[ExportService] Stopped")
}

// GetStats 获取统计信息
func (s *ExportService) GetStats() map[string]interface{} {
	var fileCount int
	s.taskFiles.Range(func(key, value interface{}) bool {
		fileCount++
		return true
	})

	poolStats := s.taskPool.GetStats()

	return map[string]interface{}{
		"file_count":  fileCount,
		"pool_stats":  poolStats,
		"output_dir":  s.config.OutputDir,
		"file_expiry": s.config.FileExpiration,
	}
}
