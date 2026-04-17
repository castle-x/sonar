package trigger

import (
	"context"
	"errors"
	"github.com/castle-x/goutils/ablog"
	"sync"
	"time"

	"github.com/robfig/cron/v3"
)

var logger = ablog.NewLogger("trigger")

var (
	ErrTriggerAlreadyExists   = errors.New("trigger already exists")
	ErrTriggerNotFound        = errors.New("trigger not found")
	ErrTriggerAlreadyRunning  = errors.New("trigger already running")
	ErrTriggerNotRunning      = errors.New("trigger not running")
	ErrUnsupportedTriggerType = errors.New("unsupported trigger type")
)

type Trigger interface {
	Name() string
	Type() TriggerType
	Execute(ctx context.Context) error
}

type TriggerType string

const (
	TriggerTypeInterval TriggerType = "interval"
	TriggerTypeCron     TriggerType = "cron"
	TriggerTypeEvent    TriggerType = "event"
	TriggerTypeOnce     TriggerType = "once"
)

type IntervalTrigger interface {
	Trigger
	Interval() time.Duration
}

type CronTrigger interface {
	Trigger
	CronExpr() string
}

type OnceTrigger interface {
	Trigger
	Delay() time.Duration
}

type EventTrigger interface {
	Trigger
	EventChannel() <-chan interface{}
}

type EventDataHandler interface {
	ExecuteWithEvent(ctx context.Context, event interface{}) error
}

type TriggerManager struct {
	triggers map[string]triggerContext
	mu       sync.RWMutex
	ctx      context.Context
	cancel   context.CancelFunc
	wg       sync.WaitGroup
}

type triggerContext struct {
	trigger Trigger
	cancel  context.CancelFunc
	started bool
}

func NewTriggerManager(ctx context.Context) *TriggerManager {
	ctx, cancel := context.WithCancel(ctx)
	return &TriggerManager{
		triggers: make(map[string]triggerContext),
		ctx:      ctx,
		cancel:   cancel,
	}
}

func (tm *TriggerManager) RegisterTriggers(triggers ...Trigger) error {
	var errs []error
	for _, t := range triggers {
		if err := tm.Register(t); err != nil {
			errs = append(errs, err)
		}
	}
	if len(errs) > 0 {
		return errors.Join(errs...)
	}
	return nil
}

func (tm *TriggerManager) Register(t Trigger) error {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	name := t.Name()
	if _, exists := tm.triggers[name]; exists {
		return ErrTriggerAlreadyExists
	}
	tm.triggers[name] = triggerContext{trigger: t, started: false}
	return nil
}

func (tm *TriggerManager) Unregister(name string) error {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	ctx, exists := tm.triggers[name]
	if !exists {
		return ErrTriggerNotFound
	}
	if ctx.started && ctx.cancel != nil {
		ctx.cancel()
	}
	delete(tm.triggers, name)
	return nil
}

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
	triggerCtx, cancel := context.WithCancel(tm.ctx)
	ctx.cancel = cancel
	ctx.started = true
	tm.triggers[name] = ctx
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
	return nil
}

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
	return nil
}

func (tm *TriggerManager) StartAll() {
	tm.mu.RLock()
	names := make([]string, 0, len(tm.triggers))
	for name := range tm.triggers {
		names = append(names, name)
	}
	tm.mu.RUnlock()
	logger.Info("trigger: StartAll called, %d triggers registered: %v", len(names), names)
	for _, name := range names {
		if err := tm.Start(name); err != nil {
			logger.Warn("trigger: failed to start trigger (%s): %v", name, err)
		} else {
			logger.Info("trigger: started trigger (%s)", name)
		}
	}
}

func (tm *TriggerManager) StopAll() {
	tm.mu.RLock()
	names := make([]string, 0, len(tm.triggers))
	for name := range tm.triggers {
		names = append(names, name)
	}
	tm.mu.RUnlock()
	for _, name := range names {
		if err := tm.Stop(name); err != nil {
			logger.Warn("trigger: failed to stop trigger (%s): %v", name, err)
		}
	}
}

func (tm *TriggerManager) Shutdown() {
	tm.cancel()
	tm.StopAll()
	tm.wg.Wait()
}

func (tm *TriggerManager) Trigger(name string) error {
	tm.mu.RLock()
	ctx, exists := tm.triggers[name]
	tm.mu.RUnlock()
	if !exists {
		return ErrTriggerNotFound
	}
	go func() {
		if err := ctx.trigger.Execute(tm.ctx); err != nil {
			logger.Warn("trigger: trigger (%s) execution failed: %v", name, err)
		}
	}()
	return nil
}

func (tm *TriggerManager) Get(name string) (Trigger, bool) {
	tm.mu.RLock()
	defer tm.mu.RUnlock()
	ctx, exists := tm.triggers[name]
	if !exists {
		return nil, false
	}
	return ctx.trigger, true
}

func (tm *TriggerManager) List() []Trigger {
	tm.mu.RLock()
	defer tm.mu.RUnlock()
	triggers := make([]Trigger, 0, len(tm.triggers))
	for _, ctx := range tm.triggers {
		triggers = append(triggers, ctx.trigger)
	}
	return triggers
}

func (tm *TriggerManager) IsRunning(name string) bool {
	tm.mu.RLock()
	defer tm.mu.RUnlock()
	ctx, exists := tm.triggers[name]
	if !exists {
		return false
	}
	return ctx.started
}

func (tm *TriggerManager) startIntervalTrigger(ctx context.Context, t IntervalTrigger) {
	tm.wg.Add(1)
	go func() {
		defer tm.wg.Done()
		ticker := time.NewTicker(t.Interval())
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := t.Execute(ctx); err != nil {
					logger.Warn("trigger: interval trigger (%s) failed: %v", t.Name(), err)
				}
			}
		}
	}()
}

func (tm *TriggerManager) startCronTrigger(ctx context.Context, t CronTrigger) {
	tm.wg.Add(1)
	go func() {
		defer tm.wg.Done()
		c := cron.New(cron.WithSeconds())
		_, err := c.AddFunc(t.CronExpr(), func() {
			go func() {
				if err := t.Execute(ctx); err != nil {
					logger.Warn("trigger: cron trigger (%s) failed: %v", t.Name(), err)
				}
			}()
		})
		if err != nil {
			logger.Error("trigger: failed to parse cron expr for trigger (%s): %v", t.Name(), err)
			return
		}
		c.Start()
		<-ctx.Done()
		cronCtx := c.Stop()
		<-cronCtx.Done()
	}()
}

func (tm *TriggerManager) startOnceTrigger(ctx context.Context, t OnceTrigger) {
	tm.wg.Add(1)
	go func() {
		defer tm.wg.Done()
		timer := time.NewTimer(t.Delay())
		defer timer.Stop()
		select {
		case <-ctx.Done():
		case <-timer.C:
			if err := t.Execute(ctx); err != nil {
				logger.Warn("trigger: once trigger (%s) failed: %v", t.Name(), err)
			}
		}
	}()
}

func (tm *TriggerManager) startEventTrigger(ctx context.Context, t EventTrigger) {
	tm.wg.Add(1)
	go func() {
		defer tm.wg.Done()
		eventChan := t.EventChannel()
		handler, hasEventHandler := t.(EventDataHandler)
		for {
			select {
			case <-ctx.Done():
				return
			case event, ok := <-eventChan:
				if !ok {
					return
				}
				var err error
				if hasEventHandler {
					err = handler.ExecuteWithEvent(ctx, event)
				} else {
					err = t.Execute(ctx)
				}
				if err != nil {
					logger.Warn("trigger: event trigger (%s) failed: %v", t.Name(), err)
				}
			}
		}
	}()
}
