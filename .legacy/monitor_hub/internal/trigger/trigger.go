package trigger

import (
	"context"
	"errors"
	"sync"
	"time"

	"git.woa.com/castlexu/goutils/ablog"
	"github.com/robfig/cron/v3"
)

var logger = ablog.NewLogger("trigger")

var (
	// ErrTriggerAlreadyExists 触发器已存在
	ErrTriggerAlreadyExists = errors.New("trigger already exists")

	// ErrTriggerNotFound 触发器不存在
	ErrTriggerNotFound = errors.New("trigger not found")

	// ErrTriggerAlreadyRunning 触发器已经在运行
	ErrTriggerAlreadyRunning = errors.New("trigger already running")

	// ErrTriggerNotRunning 触发器未运行
	ErrTriggerNotRunning = errors.New("trigger not running")

	// ErrUnsupportedTriggerType 不支持的触发器类型
	ErrUnsupportedTriggerType = errors.New("unsupported trigger type")
)

// ============================================
// 触发器接口
// ============================================

// Trigger 触发器接口
//
// 所有触发器都需要实现此接口
type Trigger interface {
	// Name 触发器名称（唯一标识）
	Name() string

	// Type 触发器类型
	Type() TriggerType

	// Execute 执行触发器任务
	// 返回 error 表示执行失败，nil 表示成功
	Execute(ctx context.Context) error
}

// TriggerType 触发器类型
type TriggerType string

const (
	// TriggerTypeInterval 定时触发器（固定间隔）
	TriggerTypeInterval TriggerType = "interval"

	// TriggerTypeCron Cron 表达式触发器
	TriggerTypeCron TriggerType = "cron"

	// TriggerTypeEvent 事件触发器（手动触发）
	TriggerTypeEvent TriggerType = "event"

	// TriggerTypeOnce 一次性触发器（延迟执行）
	TriggerTypeOnce TriggerType = "once"
)

// ============================================
// 定时触发器接口
// ============================================

// IntervalTrigger 定时触发器接口
//
// 支持固定间隔的定时任务
type IntervalTrigger interface {
	Trigger

	// Interval 返回触发间隔
	Interval() time.Duration
}

// CronTrigger Cron 触发器接口
//
// 支持 Cron 表达式的定时任务
type CronTrigger interface {
	Trigger

	// CronExpr 返回 Cron 表达式（如 "0 */5 * * * *"）
	CronExpr() string
}

// OnceTrigger 一次性触发器接口
//
// 延迟执行一次
type OnceTrigger interface {
	Trigger

	// Delay 返回延迟时间
	Delay() time.Duration
}

// EventTrigger 事件触发器接口
//
// 通过监听 channel 来触发任务执行
type EventTrigger interface {
	Trigger

	// EventChannel 返回事件接收 channel
	// 当 channel 中有数据时触发 Execute
	EventChannel() <-chan interface{}
}

// EventDataHandler 可选接口：处理事件数据
//
// 如果 EventTrigger 同时实现了此接口，会优先调用 ExecuteWithEvent
// 否则回退到普通的 Execute 方法（不传递事件数据）
type EventDataHandler interface {
	// ExecuteWithEvent 执行触发器任务并传递事件数据
	//
	// 参数:
	//   - ctx: 上下文
	//   - event: 事件数据（具体类型由实现者定义）
	//
	// 返回:
	//   - error: 执行错误
	ExecuteWithEvent(ctx context.Context, event interface{}) error
}

// ============================================
// 触发器管理器
// ============================================

// TriggerManager 触发器管理器
//
// 负责注册、启动、停止所有触发器
type TriggerManager struct {
	triggers map[string]triggerContext
	mu       sync.RWMutex
	ctx      context.Context
	cancel   context.CancelFunc
	wg       sync.WaitGroup
}

// triggerContext 触发器上下文
type triggerContext struct {
	trigger Trigger
	cancel  context.CancelFunc
	started bool
}

// NewTriggerManager 创建触发器管理器
func NewTriggerManager(ctx context.Context) *TriggerManager {
	ctx, cancel := context.WithCancel(ctx)

	return &TriggerManager{
		triggers: make(map[string]triggerContext),
		ctx:      ctx,
		cancel:   cancel,
	}
}

// ============================================
// 注册和注销
// ============================================

func (tm *TriggerManager) RegisterTriggers(triggers ...Trigger) error {
	var errs []error
	for _, trigger := range triggers {
		if err := tm.Register(trigger); err != nil {
			errs = append(errs, err)
		}
	}
	if len(errs) > 0 {
		return errors.Join(errs...)
	}
	return nil
}

// Register 注册触发器
//
// 参数：
//   - trigger: 触发器实例
//
// 返回：
//   - error: 如果触发器已存在则返回错误
func (tm *TriggerManager) Register(trigger Trigger) error {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	name := trigger.Name()
	if _, exists := tm.triggers[name]; exists {
		return ErrTriggerAlreadyExists
	}

	tm.triggers[name] = triggerContext{
		trigger: trigger,
		started: false,
	}

	// logger.Info("Registered trigger: (%s) type: (%s)", name, trigger.Type())
	return nil
}

// Unregister 注销触发器
//
// 会自动停止正在运行的触发器
func (tm *TriggerManager) Unregister(name string) error {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	ctx, exists := tm.triggers[name]
	if !exists {
		return ErrTriggerNotFound
	}

	// 如果正在运行，先停止
	if ctx.started && ctx.cancel != nil {
		ctx.cancel()
	}

	delete(tm.triggers, name)
	// logger.Info("Unregistered trigger: (%s)", name)
	return nil
}

// ============================================
// 启动和停止
// ============================================

// Start 启动触发器
//
// 根据触发器类型选择相应的启动方式
func (tm *TriggerManager) Start(name string) error {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	ctx, exists := tm.triggers[name]
	if !exists {
		return ErrTriggerNotFound
	}

	if ctx.started {
		return ErrTriggerAlreadyRunning
	}

	// 创建独立的上下文
	triggerCtx, cancel := context.WithCancel(tm.ctx)
	ctx.cancel = cancel
	ctx.started = true
	tm.triggers[name] = ctx

	// 根据类型启动
	switch ctx.trigger.Type() {
	case TriggerTypeInterval:
		if it, ok := ctx.trigger.(IntervalTrigger); ok {
			tm.startIntervalTrigger(triggerCtx, it)
		}
	case TriggerTypeCron:
		if ct, ok := ctx.trigger.(CronTrigger); ok {
			tm.startCronTrigger(triggerCtx, ct)
		}
	case TriggerTypeOnce:
		if ot, ok := ctx.trigger.(OnceTrigger); ok {
			tm.startOnceTrigger(triggerCtx, ot)
		}
	case TriggerTypeEvent:
		if et, ok := ctx.trigger.(EventTrigger); ok {
			tm.startEventTrigger(triggerCtx, et)
		}
	default:
		return ErrUnsupportedTriggerType
	}

	// logger.Info("Started trigger: (%s)", name)
	return nil
}

// Stop 停止触发器
func (tm *TriggerManager) Stop(name string) error {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	ctx, exists := tm.triggers[name]
	if !exists {
		return ErrTriggerNotFound
	}

	if !ctx.started {
		return ErrTriggerNotRunning
	}

	if ctx.cancel != nil {
		ctx.cancel()
	}

	ctx.started = false
	ctx.cancel = nil
	tm.triggers[name] = ctx

	logger.Info("Stopped trigger: (%s)", name)
	return nil
}

// StartAll 启动所有触发器
func (tm *TriggerManager) StartAll() {
	tm.mu.RLock()
	names := make([]string, 0, len(tm.triggers))
	for name := range tm.triggers {
		names = append(names, name)
	}
	tm.mu.RUnlock()

	for _, name := range names {
		if err := tm.Start(name); err != nil {
			logger.Warn("Failed to start trigger (%s): %v", name, err)
		}
	}

	// logger.Info("Started (%d) triggers", len(names))
}

// StopAll 停止所有触发器
func (tm *TriggerManager) StopAll() {
	tm.mu.RLock()
	names := make([]string, 0, len(tm.triggers))
	for name := range tm.triggers {
		names = append(names, name)
	}
	tm.mu.RUnlock()

	for _, name := range names {
		if err := tm.Stop(name); err != nil {
			logger.Warn("Failed to stop trigger (%s): %v", name, err)
		}
	}

	logger.Info("Stopped (%d) triggers", len(names))
}

// Shutdown 关闭触发器管理器
//
// 停止所有触发器并等待完成
func (tm *TriggerManager) Shutdown() {
	logger.Info("Shutting down trigger manager...")
	tm.cancel()
	tm.StopAll()
	tm.wg.Wait()
	logger.Info("Trigger manager shutdown complete")
}

// ============================================
// 手动触发
// ============================================

// Trigger 手动触发执行
//
// 用于事件触发器或手动触发其他类型的触发器
func (tm *TriggerManager) Trigger(name string) error {
	tm.mu.RLock()
	ctx, exists := tm.triggers[name]
	tm.mu.RUnlock()

	if !exists {
		return ErrTriggerNotFound
	}

	// 在新的 goroutine 中执行，避免阻塞
	go func() {
		if err := ctx.trigger.Execute(tm.ctx); err != nil {
			logger.Warn("Trigger (%s) execution failed: %v", name, err)
		} else {
			logger.Debug("Trigger (%s) executed successfully", name)
		}
	}()

	return nil
}

// ============================================
// 查询方法
// ============================================

// Get 获取触发器
func (tm *TriggerManager) Get(name string) (Trigger, bool) {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	ctx, exists := tm.triggers[name]
	if !exists {
		return nil, false
	}

	return ctx.trigger, true
}

// List 列出所有触发器
func (tm *TriggerManager) List() []Trigger {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	triggers := make([]Trigger, 0, len(tm.triggers))
	for _, ctx := range tm.triggers {
		triggers = append(triggers, ctx.trigger)
	}

	return triggers
}

// IsRunning 检查触发器是否正在运行
func (tm *TriggerManager) IsRunning(name string) bool {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	ctx, exists := tm.triggers[name]
	if !exists {
		return false
	}

	return ctx.started
}

// ============================================
// 内部启动方法
// ============================================

// startIntervalTrigger 启动定时触发器
func (tm *TriggerManager) startIntervalTrigger(ctx context.Context, trigger IntervalTrigger) {
	tm.wg.Add(1)
	go func() {
		defer tm.wg.Done()

		ticker := time.NewTicker(trigger.Interval())
		defer ticker.Stop()

		logger.Info("Interval trigger (%s) started with interval (%s)", trigger.Name(), trigger.Interval())

		for {
			select {
			case <-ctx.Done():
				logger.Info("Interval trigger (%s) stopped", trigger.Name())
				return
			case <-ticker.C:
				if err := trigger.Execute(ctx); err != nil {
					logger.Warn("Interval trigger (%s) execution failed: %v", trigger.Name(), err)
				}
			}
		}
	}()
}

// startCronTrigger 启动 Cron 触发器
func (tm *TriggerManager) startCronTrigger(ctx context.Context, trigger CronTrigger) {
	tm.wg.Add(1)
	go func() {
		defer tm.wg.Done()

		// 创建 Cron 调度器（使用秒级支持）
		c := cron.New(cron.WithSeconds())

		// 添加任务
		entryID, err := c.AddFunc(trigger.CronExpr(), func() {
			// 在独立的 goroutine 中执行，避免阻塞 Cron 调度
			go func() {
				if err := trigger.Execute(ctx); err != nil {
					logger.Warn("Cron trigger (%s) execution failed: %v", trigger.Name(), err)
				}
			}()
		})

		if err != nil {
			logger.Error("Failed to parse cron expression (%s) for trigger (%s): %v",
				trigger.CronExpr(), trigger.Name(), err)
			return
		}

		logger.Info("Cron trigger (%s) started with expr (%s), entry ID: %d",
			trigger.Name(), trigger.CronExpr(), entryID)

		// 启动 Cron 调度器
		c.Start()

		// 等待取消信号
		<-ctx.Done()

		// 停止调度器（等待正在执行的任务完成）
		cronCtx := c.Stop()
		<-cronCtx.Done()

		logger.Info("Cron trigger (%s) stopped", trigger.Name())
	}()
}

// startOnceTrigger 启动一次性触发器
func (tm *TriggerManager) startOnceTrigger(ctx context.Context, trigger OnceTrigger) {
	tm.wg.Add(1)
	go func() {
		defer tm.wg.Done()

		logger.Info("Once trigger (%s) scheduled to run after (%s)", trigger.Name(), trigger.Delay())

		timer := time.NewTimer(trigger.Delay())
		defer timer.Stop()

		select {
		case <-ctx.Done():
			logger.Info("Once trigger (%s) cancelled", trigger.Name())
			return
		case <-timer.C:
			if err := trigger.Execute(ctx); err != nil {
				logger.Warn("Once trigger (%s) execution failed: %v", trigger.Name(), err)
			} else {
				logger.Info("Once trigger (%s) executed successfully", trigger.Name())
			}
		}
	}()
}

// startEventTrigger 启动事件触发器
func (tm *TriggerManager) startEventTrigger(ctx context.Context, trigger EventTrigger) {
	tm.wg.Add(1)
	go func() {
		defer tm.wg.Done()

		eventChan := trigger.EventChannel()
		logger.Info("Event trigger (%s) started, listening for events", trigger.Name())

		// 检查是否实现了 EventDataHandler 接口
		handler, hasEventHandler := trigger.(EventDataHandler)

		for {
			select {
			case <-ctx.Done():
				logger.Info("Event trigger (%s) stopped", trigger.Name())
				return
			case event, ok := <-eventChan:
				if !ok {
					logger.Warn("Event trigger (%s) channel closed", trigger.Name())
					return
				}

				// 收到事件，执行触发器任务
				var err error
				if hasEventHandler {
					// 优先调用 ExecuteWithEvent（传递事件数据）
					err = handler.ExecuteWithEvent(ctx, event)
				} else {
					// 回退到普通 Execute（不传递事件数据，向后兼容）
					err = trigger.Execute(ctx)
				}

				if err != nil {
					logger.Warn("Event trigger (%s) execution failed: %v", trigger.Name(), err)
				} else {
					// logger.Debug("Event trigger (%s) executed for event: %T", trigger.Name(), event)
				}
			}
		}
	}()
}
