package taskpool

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
)

// EventPublisher 事件发布器接口
// 与 websocket.Manager.PublishEvent 保持一致
type EventPublisher interface {
	// PublishEvent 发布事件到指定 topic
	// topic: 主题名称（任务池使用 task.Type 作为 topic）
	// event: 事件数据（任务池发布 TaskInfo）
	PublishEvent(topic string, event interface{}) error
}

// TaskPool 任务池，管理异步任务的执行
type TaskPool struct {
	// ============================================
	// 配置
	// ============================================
	maxWorkers int // 最大并发 worker 数

	// ============================================
	// 任务管理
	// ============================================
	tasks        map[string]*Task // 所有任务（包括等待、运行、完成）
	waitingQueue []*Task          // 等待队列
	runningCount int              // 当前正在运行的任务数

	// ============================================
	// 通道
	// ============================================
	taskChan chan *Task    // 任务提交通道
	stopChan chan struct{} // 停止信号通道

	// ============================================
	// 同步
	// ============================================
	mu     sync.RWMutex // 保护 tasks 和 waitingQueue
	wg     sync.WaitGroup
	ctx    context.Context
	cancel context.CancelFunc

	// ============================================
	// 配置选项
	// ============================================
	maxTaskHistory int           // 保留的历史任务数（默认1000）
	taskTimeout    time.Duration // 任务超时时间（0表示不超时）

	// ============================================
	// 事件发布
	// ============================================
	eventPublisher EventPublisher // 事件发布器（可选）
}

// Option 任务池配置选项
type Option func(*TaskPool)

// WithMaxWorkers 设置最大并发数
func WithMaxWorkers(n int) Option {
	return func(p *TaskPool) {
		if n > 0 {
			p.maxWorkers = n
		}
	}
}

// WithMaxTaskHistory 设置保留的历史任务数
func WithMaxTaskHistory(n int) Option {
	return func(p *TaskPool) {
		if n > 0 {
			p.maxTaskHistory = n
		}
	}
}

// WithTaskTimeout 设置任务超时时间
func WithTaskTimeout(d time.Duration) Option {
	return func(p *TaskPool) {
		p.taskTimeout = d
	}
}

// WithEventPublisher 设置事件发布器
// 当任务状态变化时，会自动通过此发布器推送事件
func WithEventPublisher(publisher EventPublisher) Option {
	return func(p *TaskPool) {
		p.eventPublisher = publisher
	}
}

// SetEventPublisher 设置事件发布器（可在运行时设置）
func (p *TaskPool) SetEventPublisher(publisher EventPublisher) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.eventPublisher = publisher
}

// New 创建一个新的任务池
//
// 调用场景:
// - main.go: 应用启动时初始化全局任务池
// - biz/report/v1: 初始化报告服务时创建任务池
func New(opts ...Option) *TaskPool {
	ctx, cancel := context.WithCancel(context.Background())

	pool := &TaskPool{
		maxWorkers:     5,    // 默认5个并发
		maxTaskHistory: 1000, // 默认保留1000个历史任务
		tasks:          make(map[string]*Task),
		waitingQueue:   make([]*Task, 0),
		taskChan:       make(chan *Task, 100), // 缓冲100个任务
		stopChan:       make(chan struct{}),
		ctx:            ctx,
		cancel:         cancel,
	}

	// 应用配置选项
	for _, opt := range opts {
		opt(pool)
	}

	// 启动 worker
	for i := 0; i < pool.maxWorkers; i++ {
		pool.wg.Add(1)
		go pool.worker(i)
	}

	// 启动任务调度器
	go pool.scheduler()

	// 启动清理器（定期清理历史任务）
	go pool.cleaner()

	return pool
}

// newTask 内部方法：创建任务结构并应用选项（不提交到队列）
func (p *TaskPool) newTask(taskType string, fn func(*Task) error, opts ...TaskOption) *Task {
	taskID := uuid.New().String()

	task := &Task{
		ID:         taskID,
		Type:       taskType,
		Status:     TaskStatusWaiting,
		Progress:   0,
		CreatedAt:  time.Now(),
		Metadata:   make(map[string]any),
		cancelChan: make(chan struct{}),
	}

	// 设置执行函数（需要在 task 创建后设置，避免闭包引用问题）
	task.fn = func() error {
		return fn(task) // 传入 task 对象，方便更新进度
	}

	// 设置事件发布函数（用于进度更新时推送事件）
	task.eventPublisher = func(t *Task) {
		p.publishTaskEvent(t)
	}

	for _, opt := range opts {
		opt(task)
	}
	return task
}

// dispatchTask 内部方法：将任务提交到执行队列
func (p *TaskPool) dispatchTask(task *Task) {
	p.mu.Lock()
	p.tasks[task.ID] = task
	p.mu.Unlock()

	// 提交到任务通道
	select {
	case p.taskChan <- task:
		// 成功提交
	default:
		// 通道满了，加入等待队列
		p.mu.Lock()
		p.waitingQueue = append(p.waitingQueue, task)
		p.mu.Unlock()
	}
}

// TaskOption 任务配置选项
type TaskOption func(*Task)

// WithTaskName 设置任务名称
func WithTaskName(name string) TaskOption {
	return func(t *Task) {
		t.Name = name
	}
}

// WithTaskMetadata 设置任务元数据
func WithTaskMetadata(metadata map[string]any) TaskOption {
	return func(t *Task) {
		if metadata != nil {
			t.Metadata = metadata
		}
	}
}

// WithOnProgress 设置进度回调（每次 UpdateProgress 时调用）
func WithOnProgress(fn func(int32)) TaskOption {
	return func(t *Task) {
		t.onProgress = fn
	}
}

// WithOnComplete 设置完成回调（任务成功完成时调用）
func WithOnComplete(fn func()) TaskOption {
	return func(t *Task) {
		t.onComplete = fn
	}
}

// WithOnError 设置错误回调（任务失败时调用）
func WithOnError(fn func(error)) TaskOption {
	return func(t *Task) {
		t.onError = fn
	}
}

// WithEstimatedTime 设置预计执行时间（秒）
func WithEstimatedTime(seconds int64) TaskOption {
	return func(t *Task) {
		t.estimatedTime = seconds
	}
}

// Submit 提交任务并设置额外选项
//
// 参数:
// - taskType: 任务类型（如 "create_report"）
// - fn: 任务执行函数
// - opts: 任务配置选项
//
// 示例:
//
//	taskID := pool.Submit(
//		"create_report",
//		func(task *Task) error { return nil },
//		WithTaskName("生成报告"),
//		WithTaskMetadata(map[string]any{"report_id": "xxx"}),
//		WithOnProgress(func(p int32) { log.Printf("progress: %d%%", p) }),
//		WithOnComplete(func() { log.Println("completed") }),
//		WithOnError(func(err error) { log.Printf("error: %v", err) }),
//	)
func (p *TaskPool) Submit(taskType string, fn func(*Task) error, opts ...TaskOption) string {
	// 1. 创建任务结构并应用选项（先设置回调再提交）
	task := p.newTask(taskType, fn, opts...)
	// 2. 提交任务到执行队列
	p.dispatchTask(task)
	return task.ID
}

// GetTask 获取任务信息
//
// 调用场景:
// - biz/report/v1: GetReportProgress 中查询任务状态
func (p *TaskPool) GetTask(taskID string) (*TaskInfo, bool) {
	p.mu.RLock()
	defer p.mu.RUnlock()

	task, exists := p.tasks[taskID]
	if !exists {
		return nil, false
	}

	return task.ToInfo(), true
}

// ListTasks 获取所有任务列表
//
// 参数:
// - status: 状态过滤（空字符串表示不过滤）
// - limit: 返回数量限制（0表示不限制）
//
// 调用场景:
// - 管理后台：查看所有任务状态
// - 监控告警：检查失败的任务
func (p *TaskPool) ListTasks(status TaskStatus, limit int) []*TaskInfo {
	p.mu.RLock()
	defer p.mu.RUnlock()

	tasks := make([]*TaskInfo, 0)

	for _, task := range p.tasks {
		// 状态过滤
		if status != "" && task.Status != status {
			continue
		}

		tasks = append(tasks, task.ToInfo())

		// 数量限制
		if limit > 0 && len(tasks) >= limit {
			break
		}
	}

	return tasks
}

// GetStats 获取任务池统计信息
//
// 调用场景:
// - 监控和告警
// - 管理后台展示
func (p *TaskPool) GetStats() *PoolStats {
	p.mu.RLock()
	defer p.mu.RUnlock()

	stats := &PoolStats{
		MaxWorkers:   p.maxWorkers,
		RunningCount: p.runningCount,
		WaitingCount: len(p.waitingQueue),
		TotalTasks:   len(p.tasks),
	}

	// 统计各状态任务数
	for _, task := range p.tasks {
		switch task.Status {
		case TaskStatusCompleted:
			stats.CompletedCount++
		case TaskStatusFailed:
			stats.FailedCount++
		case TaskStatusCancelled:
			stats.CancelledCount++
		}
	}

	return stats
}

// CancelTask 取消一个任务
//
// 调用场景:
// - 用户手动取消报告生成
func (p *TaskPool) CancelTask(taskID string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	task, exists := p.tasks[taskID]
	if !exists {
		return fmt.Errorf("task not found: %s", taskID)
	}

	if task.IsDone() {
		return fmt.Errorf("task already done: %s", task.Status)
	}

	// 发送取消信号
	select {
	case <-task.cancelChan:
		// 已经关闭
	default:
		close(task.cancelChan)
	}

	// 如果任务还在等待，直接标记为取消
	if task.Status == TaskStatusWaiting {
		task.Status = TaskStatusCancelled
		task.CompletedAt = time.Now()
	}
	// 如果任务正在运行，让 executeTask 处理取消状态

	return nil
}

// Stop 停止任务池（不等待任务完成）
func (p *TaskPool) Stop() {
	p.cancel()
	close(p.stopChan)
}

// StopWait 停止任务池并等待所有任务完成
//
// 调用场景:
// - 应用优雅关闭时调用
func (p *TaskPool) StopWait() {
	p.cancel()
	close(p.stopChan)
	p.wg.Wait()
}

// worker 工作协程，处理任务
func (p *TaskPool) worker(workerID int) {
	defer p.wg.Done()

	for {
		select {
		case <-p.ctx.Done():
			return
		case task := <-p.taskChan:
			p.executeTask(workerID, task)
		}
	}
}

// executeTask 执行单个任务
func (p *TaskPool) executeTask(workerID int, task *Task) {
	// 更新为运行状态
	p.mu.Lock()
	task.Status = TaskStatusRunning
	task.StartedAt = time.Now()
	p.runningCount++
	publisher := p.eventPublisher // 获取发布器引用
	p.mu.Unlock()

	// 发布任务开始事件
	p.publishTaskEvent(task)

	// 执行任务（带超时控制）
	var err error
	done := make(chan struct{})

	go func() {
		defer func() {
			if r := recover(); r != nil {
				err = fmt.Errorf("task panic: %v", r)
			}
			close(done)
		}()
		err = task.fn()
	}()

	// 等待任务完成或超时/取消
	if p.taskTimeout > 0 {
		select {
		case <-done:
			// 任务完成
		case <-task.cancelChan:
			err = fmt.Errorf("task cancelled")
		case <-time.After(p.taskTimeout):
			err = fmt.Errorf("task timeout after %v", p.taskTimeout)
		}
	} else {
		select {
		case <-done:
			// 任务完成
		case <-task.cancelChan:
			err = fmt.Errorf("task cancelled")
		}
	}

	// 更新任务状态
	p.mu.Lock()
	task.CompletedAt = time.Now()
	p.runningCount--

	// 如果任务已经被标记为取消，保持取消状态
	if task.Status == TaskStatusCancelled {
		p.mu.Unlock()
		p.publishTaskEvent(task) // 发布取消事件
		return
	}

	if err != nil {
		// 检查是否是取消错误
		if err.Error() == "task cancelled" {
			task.Status = TaskStatusCancelled
		} else {
			task.Status = TaskStatusFailed
		}
		task.Error = err
		if task.onError != nil {
			task.onError(err)
		}
	} else {
		task.Status = TaskStatusCompleted
		task.Progress = 100
		if task.onComplete != nil {
			task.onComplete()
		}
	}
	p.mu.Unlock()

	// 发布任务完成/失败事件
	p.publishTaskEvent(task)
	_ = publisher // 避免未使用警告
}

// publishTaskEvent 发布任务状态事件
// 使用 task.Type 作为 topic，发布 TaskInfo 到事件发布器
func (p *TaskPool) publishTaskEvent(task *Task) {
	p.mu.RLock()
	publisher := p.eventPublisher
	p.mu.RUnlock()

	if publisher != nil {
		// 使用 task.Type 作为 topic（如 "export"）
		// 发布 TaskInfo 作为 event
		if err := publisher.PublishEvent(task.Type, task.ToInfo()); err != nil {
			// 静默处理错误（可能是 topic 不存在或 channel 满）
			// 不阻塞任务执行
		}
	}
}

// scheduler 调度器，从等待队列中取任务
func (p *TaskPool) scheduler() {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-p.stopChan:
			return
		case <-ticker.C:
			p.scheduleWaitingTasks()
		}
	}
}

// scheduleWaitingTasks 调度等待队列中的任务
func (p *TaskPool) scheduleWaitingTasks() {
	p.mu.Lock()
	defer p.mu.Unlock()

	// 如果没有等待任务，直接返回
	if len(p.waitingQueue) == 0 {
		return
	}

	// 尝试将等待任务提交到任务通道
	for len(p.waitingQueue) > 0 {
		select {
		case p.taskChan <- p.waitingQueue[0]:
			// 成功提交，从队列中移除
			p.waitingQueue = p.waitingQueue[1:]
		default:
			// 通道满了，停止调度
			return
		}
	}
}

// cleaner 定期清理已完成的历史任务
func (p *TaskPool) cleaner() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-p.stopChan:
			return
		case <-ticker.C:
			p.cleanOldTasks()
		}
	}
}

// cleanOldTasks 清理旧的已完成任务
func (p *TaskPool) cleanOldTasks() {
	p.mu.Lock()
	defer p.mu.Unlock()

	// 如果任务总数未超过限制，不清理
	if len(p.tasks) <= p.maxTaskHistory {
		return
	}

	// 收集已完成的任务，按完成时间排序
	completedTasks := make([]*Task, 0)
	for _, task := range p.tasks {
		if task.IsDone() {
			completedTasks = append(completedTasks, task)
		}
	}

	// 按完成时间排序（最旧的在前）
	for i := 0; i < len(completedTasks); i++ {
		for j := i + 1; j < len(completedTasks); j++ {
			if completedTasks[i].CompletedAt.After(completedTasks[j].CompletedAt) {
				completedTasks[i], completedTasks[j] = completedTasks[j], completedTasks[i]
			}
		}
	}

	// 删除最旧的任务，直到总数小于限制
	deleteCount := len(p.tasks) - p.maxTaskHistory
	if deleteCount > len(completedTasks) {
		deleteCount = len(completedTasks)
	}

	for i := 0; i < deleteCount; i++ {
		delete(p.tasks, completedTasks[i].ID)
	}
}

// PoolStats 任务池统计信息
type PoolStats struct {
	MaxWorkers     int `json:"max_workers"`     // 最大 worker 数
	RunningCount   int `json:"running_count"`   // 正在运行的任务数
	WaitingCount   int `json:"waiting_count"`   // 等待中的任务数
	TotalTasks     int `json:"total_tasks"`     // 总任务数
	CompletedCount int `json:"completed_count"` // 已完成任务数
	FailedCount    int `json:"failed_count"`    // 失败任务数
	CancelledCount int `json:"cancelled_count"` // 已取消任务数
}

// DeleteTask 删除指定任务（只能删除已完成的任务）
//
// 调用场景:
// - 手动清理不需要的历史任务
func (p *TaskPool) DeleteTask(taskID string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	task, exists := p.tasks[taskID]
	if !exists {
		return fmt.Errorf("task not found: %s", taskID)
	}

	if !task.IsDone() {
		return fmt.Errorf("cannot delete running task: %s", taskID)
	}

	delete(p.tasks, taskID)
	return nil
}

// WaitTask 等待指定任务完成
//
// 调用场景:
// - 同步等待某个任务完成
// - 测试场景
func (p *TaskPool) WaitTask(taskID string, timeout time.Duration) error {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	deadline := time.Now().Add(timeout)

	for {
		task, exists := p.GetTask(taskID)
		if !exists {
			return fmt.Errorf("task not found: %s", taskID)
		}

		if task.Status == TaskStatusCompleted {
			return nil
		}

		if task.Status == TaskStatusFailed {
			return fmt.Errorf("task failed: %s", task.ErrorMsg)
		}

		if task.Status == TaskStatusCancelled {
			return fmt.Errorf("task cancelled")
		}

		// 检查超时
		if timeout > 0 && time.Now().After(deadline) {
			return fmt.Errorf("wait timeout")
		}

		<-ticker.C
	}
}
