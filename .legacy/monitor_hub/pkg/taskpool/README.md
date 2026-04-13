# TaskPool 任务池

通用的异步任务管理模块，支持并发控制、状态查询、进度跟踪等功能。

## 📁 文件组织

```
pkg/taskpool/
├── pool.go       # 任务池核心逻辑
├── task.go       # 任务状态定义
└── README.md     # 本文件
```

---

## 🎯 核心功能

### 1. 并发控制
- 限制同时运行的任务数（避免系统过载）
- 支持任务队列（超出并发数的任务排队等待）
- 自动调度等待任务

### 2. 状态管理
- 5种任务状态：waiting, running, completed, failed, cancelled
- 实时查询任务状态和进度
- 任务历史记录

### 3. 进度跟踪
- 0-100 进度百分比
- 任务耗时统计
- 预计剩余时间

### 4. 扩展性
- 支持任务元数据
- 支持回调函数（进度、完成、错误）
- 支持任务超时
- 支持优雅关闭

---

## 📦 快速开始

### 1. 创建任务池

```go
import "monitor_hub/pkg/taskpool"

// 创建任务池（默认5个并发）
pool := taskpool.New()

// 自定义配置
pool := taskpool.New(
    taskpool.WithMaxWorkers(10),           // 最大10个并发
    taskpool.WithMaxTaskHistory(2000),     // 保留2000个历史任务
    taskpool.WithTaskTimeout(30*time.Minute), // 任务超时30分钟
)
```

### 2. 提交任务

```go
// 提交简单任务
taskID := pool.Submit("create_report", func(task *taskpool.Task) error {
    // 执行任务逻辑
    
    // 更新进度
    task.UpdateProgress(50)
    
    // 设置元数据
    task.SetMetadata("report_id", "xxx")
    
    return nil
})

// 提交带选项的任务
taskID := pool.SubmitWithOptions(
    "create_report",                    // 任务类型
    "生成压测报告-2024-11-27",           // 任务名称
    map[string]any{                     // 元数据
        "report_id": "xxx",
        "operator": "test-engine",
    },
    func(task *taskpool.Task) error {
        // 任务逻辑
        return nil
    },
)
```

### 3. 查询任务

```go
// 获取单个任务信息
taskInfo, exists := pool.GetTask(taskID)
if exists {
    fmt.Printf("Status: %s, Progress: %d%%\n", taskInfo.Status, taskInfo.Progress)
}

// 获取所有运行中的任务
runningTasks := pool.ListTasks(taskpool.TaskStatusRunning, 0)

// 获取最近10个失败的任务
failedTasks := pool.ListTasks(taskpool.TaskStatusFailed, 10)

// 获取所有任务（不限制状态和数量）
allTasks := pool.ListTasks("", 0)
```

### 4. 统计信息

```go
// 获取任务池统计
stats := pool.GetStats()
fmt.Printf("Running: %d/%d, Waiting: %d, Completed: %d, Failed: %d\n",
    stats.RunningCount, stats.MaxWorkers, stats.WaitingCount, 
    stats.CompletedCount, stats.FailedCount)
```

### 5. 取消任务

```go
// 取消指定任务
err := pool.CancelTask(taskID)
```

### 6. 关闭任务池

```go
// 立即停止（不等待）
pool.Stop()

// 优雅关闭（等待所有任务完成）
pool.StopWait()
```

---

## 🔄 完整使用示例

### 示例1: Report 服务中使用

```go
package v1

import (
    "monitor_hub/pkg/taskpool"
)

type ReportService struct {
    taskPool *taskpool.TaskPool
    repo     ReportRepo
}

func NewReportService(repo ReportRepo) *ReportService {
    return &ReportService{
        taskPool: taskpool.New(
            taskpool.WithMaxWorkers(5),
            taskpool.WithTaskTimeout(30 * time.Minute),
        ),
        repo: repo,
    }
}

// CreateReport 创建报告（异步）
func (s *ReportService) CreateReport(ctx context.Context, req *Report) (*CreateReportResponse, error) {
    // 1. 创建报告记录
    reportID, err := s.repo.InsertReport(ctx, &Report{
        Name:   req.Name,
        Status: "processing",
        ...
    })
    if err != nil {
        return nil, err
    }

    // 2. 提交异步任务
    taskID := s.taskPool.SubmitWithOptions(
        "create_report",
        fmt.Sprintf("生成报告: %s", req.Name),
        map[string]any{
            "report_id": reportID,
            "operator":  req.Operator,
        },
        func(task *taskpool.Task) error {
            return s.processReport(ctx, reportID, req, task)
        },
    )

    return &CreateReportResponse{
        ReportID: reportID,
        Status:   "processing",
        Message:  "报告正在后台生成中",
    }, nil
}

// processReport 处理报告生成
func (s *ReportService) processReport(ctx context.Context, reportID string, 
    req *Report, task *taskpool.Task) error {
    
    totalCases := len(req.Cases)
    
    for i, singleCase := range req.Cases {
        // 处理单个用例
        if err := s.processSingleCase(ctx, reportID, singleCase); err != nil {
            return err
        }
        
        // 更新进度
        progress := int32((i + 1) * 100 / totalCases)
        task.UpdateProgress(progress)
        
        // 更新数据库中的进度
        s.repo.UpdateReportProgress(ctx, reportID, progress)
    }
    
    // 标记报告为完成
    s.repo.UpdateReportStatus(ctx, reportID, "completed", "")
    return nil
}

// GetReportProgress 查询报告进度
func (s *ReportService) GetReportProgress(ctx context.Context, reportID string) (*ReportProgress, error) {
    // 1. 从报告元数据中获取关联的任务ID
    // （可以在 report.Metadata 中存储 task_id，或者直接用 report_id 查询）
    
    // 方案1: 遍历任务找到对应的 report_id
    tasks := s.taskPool.ListTasks("", 0)
    for _, taskInfo := range tasks {
        if rid, ok := taskInfo.Metadata["report_id"]; ok && rid == reportID {
            return &ReportProgress{
                ReportID:        reportID,
                Status:          string(taskInfo.Status),
                Progress:        taskInfo.Progress,
                EstimatedTime:   taskInfo.EstimatedTime,
            }, nil
        }
    }
    
    // 方案2: 从数据库查询报告状态
    report, err := s.repo.GetReport(ctx, reportID)
    if err != nil {
        return nil, err
    }
    
    return &ReportProgress{
        ReportID: reportID,
        Status:   report.Status,
        Progress: report.Progress,
    }, nil
}
```

### 示例2: 批量数据导出

```go
// 批量导出数据
func (s *ExportService) BatchExport(dataIDs []string) string {
    taskID := s.taskPool.SubmitWithOptions(
        "batch_export",
        "批量导出数据",
        map[string]any{
            "data_ids": dataIDs,
            "total":    len(dataIDs),
        },
        func(task *taskpool.Task) error {
            for i, dataID := range dataIDs {
                // 导出单个数据
                if err := s.exportSingle(dataID); err != nil {
                    return err
                }
                
                // 更新进度
                progress := int32((i + 1) * 100 / len(dataIDs))
                task.UpdateProgress(progress)
            }
            return nil
        },
    )
    
    return taskID
}
```

---

## 📊 任务状态流转

```
创建任务
    ↓
[waiting] 等待队列
    ↓
[running] 正在执行
    ↓
┌───────────┬──────────┬──────────┐
│           │          │          │
[completed] [failed]  [cancelled]
成功完成     执行失败   已取消
```

---

## 🎯 使用场景

### 适合的场景 ✅

1. **报告生成** - 耗时较长，需要进度反馈
2. **数据导出** - 批量处理，需要并发控制
3. **数据聚合** - 大数据量计算，需要异步处理
4. **定时任务** - 周期性执行，需要状态管理
5. **批量操作** - 需要限制并发数

### 不适合的场景 ❌

1. **实时查询** - 应该同步返回
2. **简单操作** - 不需要异步处理
3. **轻量任务** - 执行时间 < 100ms

---

## ⚙️ 配置建议

### 并发数设置

| 场景 | 建议并发数 | 说明 |
|-----|-----------|------|
| **CPU密集型** | CPU核心数 | 聚合计算 |
| **IO密集型** | CPU核心数 × 2-4 | 数据库查询 |
| **混合型** | 5-10 | 报告生成 |
| **轻量级** | 10-20 | 简单任务 |

### 历史任务数设置

- **开发环境**: 100-500
- **生产环境**: 1000-2000
- **大流量**: 5000-10000

### 超时设置

- **短任务**: 1-5分钟
- **中等任务**: 10-30分钟
- **长任务**: 1-3小时
- **不限制**: 0（默认）

---

## 🛡️ 线程安全

- ✅ 所有公开方法都是线程安全的
- ✅ 使用 `sync.RWMutex` 保护共享数据
- ✅ 支持多协程并发提交任务
- ✅ 支持多协程并发查询任务

---

## 🧪 测试

```bash
# 运行测试
go test ./pkg/taskpool/...

# 运行基准测试
go test -bench=. ./pkg/taskpool/...
```

---

## 📝 注意事项

1. **任务函数应该支持取消**：检查 `task.cancelChan`
2. **进度更新**：定期调用 `task.UpdateProgress()`
3. **错误处理**：任务函数应返回错误，不要 panic
4. **资源清理**：任务完成后清理资源
5. **并发数**：根据系统资源合理设置
6. **历史任务**：定期清理，避免内存泄漏

---

## 🚀 高级用法

### 1. 支持任务取消

```go
taskID := pool.Submit("long_task", func(task *taskpool.Task) error {
    for i := 0; i < 100; i++ {
        // 检查是否被取消
        select {
        case <-task.cancelChan:
            return fmt.Errorf("task cancelled by user")
        default:
        }
        
        // 执行任务步骤
        doStep(i)
        task.UpdateProgress(int32(i))
    }
    return nil
})

// 取消任务
pool.CancelTask(taskID)
```

### 2. 等待任务完成

```go
// 同步等待任务完成（带超时）
err := pool.WaitTask(taskID, 5*time.Minute)
if err != nil {
    fmt.Printf("等待失败: %v\n", err)
}
```

### 3. 监控任务状态

```go
// 定期查询统计信息
ticker := time.NewTicker(10 * time.Second)
for range ticker.C {
    stats := pool.GetStats()
    if stats.FailedCount > 10 {
        // 触发告警
        alert("任务失败过多")
    }
}
```

---

## 💡 设计特点

1. **轻量级**: 无外部依赖，只使用标准库
2. **高性能**: channel 和 goroutine 实现高效调度
3. **易用性**: 简单的 API，开箱即用
4. **可观测**: 完善的状态查询和统计功能
5. **可扩展**: 支持元数据和回调函数
6. **生产就绪**: 支持超时、取消、优雅关闭

---

## 🔧 与 Report 模块集成

```go
// 初始化 Report 服务时创建任务池
func NewReportService(repo ReportRepo) *ReportService {
    return &ReportService{
        repo:     repo,
        taskPool: taskpool.New(taskpool.WithMaxWorkers(5)),
    }
}

// 创建报告
func (s *ReportService) CreateReport(ctx context.Context, req *Report) (*CreateReportResponse, error) {
    reportID := s.createReportRecord(req)
    
    taskID := s.taskPool.Submit("create_report", func(task *taskpool.Task) error {
        task.SetMetadata("report_id", reportID)
        return s.processReport(ctx, reportID, req, task)
    })
    
    return &CreateReportResponse{
        ReportID: reportID,
        Status:   "processing",
    }, nil
}

// 查询进度
func (s *ReportService) GetReportProgress(reportID string) (*ReportProgress, error) {
    tasks := s.taskPool.ListTasks("", 0)
    for _, t := range tasks {
        if rid, ok := t.Metadata["report_id"]; ok && rid == reportID {
            return &ReportProgress{
                ReportID:      reportID,
                Status:        string(t.Status),
                Progress:      t.Progress,
                EstimatedTime: t.EstimatedTime,
            }, nil
        }
    }
    return nil, fmt.Errorf("task not found")
}
```

---

## 🎨 最佳实践

### 1. 任务粒度

```go
// ❌ 不好：任务太细，调度开销大
for _, item := range items {
    pool.Submit("process_item", func(task) { processItem(item) })
}

// ✅ 好：批量处理，减少任务数
pool.Submit("process_batch", func(task) {
    for i, item := range items {
        processItem(item)
        task.UpdateProgress(int32(i * 100 / len(items)))
    }
})
```

### 2. 进度更新频率

```go
// ✅ 定期更新，不要太频繁
func processReport(task *taskpool.Task) error {
    for i := 0; i < 1000; i++ {
        doWork(i)
        
        // 每10个更新一次进度，而不是每次都更新
        if i % 10 == 0 {
            task.UpdateProgress(int32(i * 100 / 1000))
        }
    }
    return nil
}
```

### 3. 错误处理

```go
// ✅ 返回有意义的错误信息
func processData(task *taskpool.Task) error {
    data, err := fetchData()
    if err != nil {
        return fmt.Errorf("fetch data failed: %w", err)
    }
    
    if err := validateData(data); err != nil {
        return fmt.Errorf("validate data failed: %w", err)
    }
    
    return nil
}
```

---

## 📈 性能特性

- **调度延迟**: < 100ms（等待队列调度间隔）
- **状态查询**: O(1) 时间复杂度
- **并发提交**: 支持，线程安全
- **内存占用**: ~1KB/任务（取决于元数据大小）
- **历史清理**: 每5分钟自动清理

---

## 🔍 监控指标

建议监控以下指标：
- 运行中任务数 (`stats.RunningCount`)
- 等待队列长度 (`stats.WaitingCount`)
- 失败任务数 (`stats.FailedCount`)
- 任务执行时长 (`taskInfo.Duration`)
- 任务成功率 (`CompletedCount / TotalTasks`)

