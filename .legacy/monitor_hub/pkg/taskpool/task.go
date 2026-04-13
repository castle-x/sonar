package taskpool

import (
	"time"
)

// TaskStatus 任务状态
type TaskStatus string

const (
	TaskStatusWaiting   TaskStatus = "waiting"   // 等待执行
	TaskStatusRunning   TaskStatus = "running"   // 正在执行
	TaskStatusCompleted TaskStatus = "completed" // 已完成
	TaskStatusFailed    TaskStatus = "failed"    // 执行失败
	TaskStatusCancelled TaskStatus = "cancelled" // 已取消
)

// Task 表示一个异步任务
type Task struct {
	// ============================================
	// 基础信息
	// ============================================
	ID   string // 任务唯一标识
	Type string // 任务类型（如 "create_report", "export_data"）
	Name string // 任务名称（可选，便于识别）

	// ============================================
	// 状态信息
	// ============================================
	Status   TaskStatus // 任务状态
	Progress int32      // 进度百分比（0-100）
	Error    error      // 错误信息（失败时）

	// ============================================
	// 时间信息
	// ============================================
	CreatedAt   time.Time // 创建时间
	StartedAt   time.Time // 开始执行时间
	CompletedAt time.Time // 完成时间

	// ============================================
	// 扩展信息
	// ============================================
	Metadata map[string]any // 自定义元数据（如 report_id, user_id 等）

	// ============================================
	// 内部字段
	// ============================================
	fn             func() error          // 任务执行函数
	onProgress     func(int32)           // 进度回调函数（可选）
	onComplete     func()                // 完成回调函数（可选）
	onError        func(error)           // 错误回调函数（可选）
	cancelChan     chan struct{}         // 取消信号通道
	estimatedTime  int64                 // 预计执行时间（秒，可选）
	eventPublisher func(*Task)           // 事件发布函数（由任务池设置，用于进度更新时推送）
	message        string                // 当前状态消息
}

// TaskInfo 任务信息（用于外部查询，不包含内部字段）
type TaskInfo struct {
	ID            string         `json:"id"`
	Type          string         `json:"type"`
	Name          string         `json:"name"`
	Status        TaskStatus     `json:"status"`
	Progress      int32          `json:"progress"`
	Message       string         `json:"message,omitempty"`   // 当前状态消息
	ErrorMsg      string         `json:"error_msg,omitempty"`
	CreatedAt     int64          `json:"created_at"`     // Unix 毫秒时间戳
	StartedAt     int64          `json:"started_at"`     // Unix 毫秒时间戳
	CompletedAt   int64          `json:"completed_at"`   // Unix 毫秒时间戳
	Duration      int64          `json:"duration"`       // 执行时长（毫秒）
	EstimatedTime int64          `json:"estimated_time"` // 预计剩余时间（秒）
	Metadata      map[string]any `json:"metadata,omitempty"`
}

// ToInfo 将 Task 转换为 TaskInfo（用于外部返回）
func (t *Task) ToInfo() *TaskInfo {
	info := &TaskInfo{
		ID:            t.ID,
		Type:          t.Type,
		Name:          t.Name,
		Status:        t.Status,
		Progress:      t.Progress,
		Message:       t.message,
		CreatedAt:     t.CreatedAt.UnixMilli(),
		EstimatedTime: t.estimatedTime,
		Metadata:      t.Metadata,
	}

	if !t.StartedAt.IsZero() {
		info.StartedAt = t.StartedAt.UnixMilli()
	}

	if !t.CompletedAt.IsZero() {
		info.CompletedAt = t.CompletedAt.UnixMilli()
		info.Duration = t.CompletedAt.Sub(t.StartedAt).Milliseconds()
	} else if t.Status == TaskStatusRunning {
		// 正在运行中，计算已运行时长
		info.Duration = time.Since(t.StartedAt).Milliseconds()
	}

	if t.Error != nil {
		info.ErrorMsg = t.Error.Error()
	}

	return info
}

// IsDone 判断任务是否已完成（包括成功、失败、取消）
func (t *Task) IsDone() bool {
	return t.Status == TaskStatusCompleted ||
		t.Status == TaskStatusFailed ||
		t.Status == TaskStatusCancelled
}

// IsRunning 判断任务是否正在运行
func (t *Task) IsRunning() bool {
	return t.Status == TaskStatusRunning
}

// UpdateProgress 更新任务进度
// 调用场景:
// - biz/report/v1: 报告生成过程中更新进度
// - 任务执行函数内部调用
func (t *Task) UpdateProgress(progress int32) {
	t.UpdateProgressWithMessage(progress, "")
}

// UpdateProgressWithMessage 更新任务进度和状态消息
// 调用场景:
// - 导出任务：更新进度和当前步骤说明
// - 任何需要详细进度信息的任务
func (t *Task) UpdateProgressWithMessage(progress int32, message string) {
	if progress < 0 {
		progress = 0
	}
	if progress > 100 {
		progress = 100
	}

	t.Progress = progress
	if message != "" {
		t.message = message
	}

	// 调用进度回调
	if t.onProgress != nil {
		t.onProgress(progress)
	}

	// 发布进度事件
	if t.eventPublisher != nil {
		t.eventPublisher(t)
	}
}

// SetMessage 设置状态消息（不更新进度）
func (t *Task) SetMessage(message string) {
	t.message = message
}

// SetMetadata 设置元数据
func (t *Task) SetMetadata(key string, value any) {
	if t.Metadata == nil {
		t.Metadata = make(map[string]any)
	}
	t.Metadata[key] = value
}

// GetMetadata 获取元数据
func (t *Task) GetMetadata(key string) (any, bool) {
	if t.Metadata == nil {
		return nil, false
	}
	value, ok := t.Metadata[key]
	return value, ok
}

// CancelChan 返回取消信号通道（用于任务内部检查是否被取消）
// 调用场景:
// - 任务函数内部检查取消信号
func (t *Task) CancelChan() <-chan struct{} {
	return t.cancelChan
}

