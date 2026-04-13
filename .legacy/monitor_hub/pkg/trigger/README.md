# Trigger - 通用触发器系统

一个灵活、可扩展的触发器系统，支持定时任务、事件驱动、延迟执行等多种触发方式。

## 📋 功能特性

- ✅ **多种触发类型**：定时（Interval）、Cron、事件（Event）、一次性（Once）
- ✅ **并发安全**：支持多个触发器并发运行
- ✅ **生命周期管理**：注册、启动、停止、注销
- ✅ **上下文传递**：支持 context 取消和超时
- ✅ **错误处理**：统一的错误处理机制
- ✅ **手动触发**：支持手动触发任何触发器
- ✅ **查询接口**：查询触发器状态和列表

## 🎯 触发器类型

### 1. 定时触发器（Interval）

固定时间间隔执行任务。

```go
type MyIntervalTrigger struct {
    name string
}

func (t *MyIntervalTrigger) Name() string {
    return t.name
}

func (t *MyIntervalTrigger) Type() TriggerType {
    return TriggerTypeInterval
}

func (t *MyIntervalTrigger) Interval() time.Duration {
    return 10 * time.Second  // 每 10 秒执行一次
}

func (t *MyIntervalTrigger) Execute(ctx context.Context) error {
    // 执行任务逻辑
    fmt.Println("Task executed")
    return nil
}
```

### 2. Cron 触发器（Cron）

使用 Cron 表达式定时执行。支持秒级精度（6 个字段）。

**Cron 表达式格式**：`秒 分 时 日 月 周`

```go
type MyCronTrigger struct {
    name string
}

func (t *MyCronTrigger) Name() string {
    return t.name
}

func (t *MyCronTrigger) Type() TriggerType {
    return TriggerTypeCron
}

func (t *MyCronTrigger) CronExpr() string {
    // 支持秒级 Cron 表达式（6 个字段）
    return "0 */5 * * * *"  // 每 5 分钟执行一次
    
    // 其他示例：
    // "*/10 * * * * *"  - 每 10 秒执行一次
    // "0 0 * * * *"     - 每小时整点执行
    // "0 0 0 * * *"     - 每天午夜执行
    // "0 30 9 * * 1-5"  - 周一到周五上午 9:30 执行
}

func (t *MyCronTrigger) Execute(ctx context.Context) error {
    // 执行任务逻辑
    return nil
}
```

**Cron 表达式字段说明**：
- 秒：0-59
- 分：0-59
- 时：0-23
- 日：1-31
- 月：1-12
- 周：0-6（0 = 周日）

**特殊字符**：
- `*`：匹配所有值
- `*/N`：每 N 个单位
- `N-M`：范围（N 到 M）
- `N,M,O`：列表（N、M、O）

### 3. 事件触发器（Event）

手动触发执行。

```go
type MyEventTrigger struct {
    name string
}

func (t *MyEventTrigger) Name() string {
    return t.name
}

func (t *MyEventTrigger) Type() TriggerType {
    return TriggerTypeEvent
}

func (t *MyEventTrigger) Execute(ctx context.Context) error {
    // 执行任务逻辑
    return nil
}

// 使用
manager.Register(trigger)
manager.Trigger("my-event-trigger")  // 手动触发
```

### 4. 一次性触发器（Once）

延迟执行一次。

```go
type MyOnceTrigger struct {
    name string
}

func (t *MyOnceTrigger) Name() string {
    return t.name
}

func (t *MyOnceTrigger) Type() TriggerType {
    return TriggerTypeOnce
}

func (t *MyOnceTrigger) Delay() time.Duration {
    return 5 * time.Second  // 5 秒后执行一次
}

func (t *MyOnceTrigger) Execute(ctx context.Context) error {
    // 执行任务逻辑
    return nil
}
```

## 🚀 基本使用

### 1. 创建管理器

```go
ctx := context.Background()
manager := trigger.NewTriggerManager(ctx)
defer manager.Shutdown()
```

### 2. 注册触发器

```go
// 注册定时触发器
intervalTrigger := NewMyIntervalTrigger("health-check")
manager.Register(intervalTrigger)

// 注册事件触发器
eventTrigger := NewMyEventTrigger("on-subscribe")
manager.Register(eventTrigger)
```

### 3. 启动触发器

```go
// 启动单个触发器
manager.Start("health-check")

// 启动所有触发器
manager.StartAll()
```

### 4. 停止触发器

```go
// 停止单个触发器
manager.Stop("health-check")

// 停止所有触发器
manager.StopAll()
```

### 5. 手动触发

```go
// 手动触发任意触发器
manager.Trigger("on-subscribe")
```

### 6. 查询状态

```go
// 获取触发器
trigger, exists := manager.Get("health-check")

// 检查是否正在运行
isRunning := manager.IsRunning("health-check")

// 列出所有触发器
triggers := manager.List()
```

## 📊 实际应用场景

### 场景 1：替代 Broadcaster

将现有的 Broadcaster 改造为触发器：

```go
// 原来的 Broadcaster
type StatusBroadcaster struct {
    datasourceRepo repo.DatasourceRepo
}

func (b *StatusBroadcaster) Interval() time.Duration {
    return 10 * time.Second
}

func (b *StatusBroadcaster) Message(ctx context.Context) *ws.BroadcasterMessage {
    // 查询状态并广播
    return message
}

// 改造为 Trigger
type StatusCheckTrigger struct {
    name           string
    datasourceRepo repo.DatasourceRepo
    wsServer       *ws.Server
}

func (t *StatusCheckTrigger) Name() string {
    return t.name
}

func (t *StatusCheckTrigger) Type() TriggerType {
    return TriggerTypeInterval
}

func (t *StatusCheckTrigger) Interval() time.Duration {
    return 10 * time.Second
}

func (t *StatusCheckTrigger) Execute(ctx context.Context) error {
    // 1. 获取订阅者
    subscriptions := t.wsServer.GetSubscriptionManager().GetSubscriptionsByTopic("datasource.status")
    
    // 2. 按 datasource_ids 分组
    // 3. 并发查询和推送
    
    return nil
}
```

### 场景 2：订阅时立即推送

```go
// 创建事件触发器
type OnSubscribeTrigger struct {
    name           string
    datasourceRepo repo.DatasourceRepo
    wsServer       *ws.Server
}

func (t *OnSubscribeTrigger) Type() TriggerType {
    return TriggerTypeEvent
}

func (t *OnSubscribeTrigger) Execute(ctx context.Context) error {
    // 立即查询并推送当前状态
    return nil
}

// 在订阅 handler 中触发
func (h *Handler) WsSubscribeStatus(ctx context.Context, conn *ws.Connection, env *ws.Envelope) error {
    // 1. 订阅
    subManager.Subscribe(conn.ID, env.Topic, metadata)
    
    // 2. 触发立即推送
    triggerManager.Trigger("on-subscribe-datasource-status")
    
    return nil
}
```

### 场景 3：延迟任务

```go
// 创建一次性触发器
onceTrigger := NewCleanupTrigger("cleanup-temp-data", 1*time.Hour)
manager.Register(onceTrigger)
manager.Start("cleanup-temp-data")
// 1 小时后自动执行清理任务
```

## 🎨 高级特性

### 1. 动态调整触发器

```go
// 停止旧触发器
manager.Stop("health-check")
manager.Unregister("health-check")

// 注册新的触发器（不同间隔）
newTrigger := NewMyIntervalTrigger("health-check", 5*time.Second)
manager.Register(newTrigger)
manager.Start("health-check")
```

### 2. 并发控制

```go
func (t *MyTrigger) Execute(ctx context.Context) error {
    // 使用 context 控制超时
    ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
    defer cancel()
    
    select {
    case <-ctx.Done():
        return ctx.Err()
    case result := <-doWork():
        return result
    }
}
```

### 3. 错误处理

```go
func (t *MyTrigger) Execute(ctx context.Context) error {
    if err := doSomething(); err != nil {
        // 记录错误
        logger.Error("Task failed: %v", err)
        // 返回错误（Manager 会记录日志）
        return err
    }
    return nil
}
```

## 📈 性能优化

1. **避免阻塞**：Execute 方法应该快速返回，避免长时间阻塞
2. **并发执行**：多个触发器在独立的 goroutine 中运行
3. **资源清理**：使用 defer 确保资源正确释放
4. **上下文传递**：使用 context 支持取消和超时

## 🔧 最佳实践

1. **触发器命名**：使用清晰的命名，如 `health-check-datasource`
2. **错误恢复**：在 Execute 中捕获 panic，避免触发器崩溃
3. **日志记录**：记录关键操作和错误信息
4. **优雅关闭**：使用 Shutdown() 等待所有触发器完成
5. **避免重复**：同一个触发器只注册一次

## 🎯 对比 Broadcaster

| 特性 | Broadcaster | Trigger |
|-----|------------|---------|
| **触发方式** | 仅定时 | 定时/Cron/事件/一次性 |
| **生命周期** | 全局启动 | 独立管理 |
| **手动触发** | ❌ 不支持 | ✅ 支持 |
| **动态调整** | ❌ 困难 | ✅ 简单 |
| **并发控制** | 统一管理 | 独立控制 |
| **扩展性** | 受限 | 灵活 |

## 📚 完整示例

查看 `example.go` 获取完整的使用示例。

## 🔗 相关代码

- `trigger.go` - 核心实现
- `errors.go` - 错误定义
- `example.go` - 使用示例

