# Storage Package - 通用 TSDB 存储工具包

这是一个基于 **Prometheus TSDB** 的通用时序数据库存储包，采用**泛型设计**，完全解耦具体业务数据结构，支持任意数据类型的存储和查询。

## ✨ 特性

- 🎯 **泛型设计**: 完全解耦业务数据结构，支持任意数据类型
- 🚀 **高性能**: 基于 Prometheus TSDB，支持百万级时序数据
- 💾 **自动压缩**: 内置压缩算法，节省存储空间
- 🔄 **定时清理**: 集成 Trigger 系统，自动清理过期数据
- 🔧 **易于扩展**: 通过 Serializer 接口轻松适配不同数据格式
- ⚙️ **配置灵活**: 集成框架配置系统 (config/v1)
- 📊 **统计监控**: 提供详细的存储统计信息
- 🔒 **线程安全**: 内置并发控制，支持高并发写入

---

## 📐 架构设计

### 核心接口

```
Storage[T, Q, R]         泛型存储接口
    ├── T: 数据点类型（由外部定义）
    ├── Q: 查询请求类型（由外部定义）
    └── R: 查询结果类型（由外部定义）

Serializer[T]            数据序列化接口
    ├── ToLabels()       转换为 Prometheus Labels
    ├── ToTimestamp()    提取时间戳
    ├── ToValue()        提取指标值
    └── FromLabels()     从 Labels 构造数据点
```

### 实现层次

```
应用层
  ├── 定义数据类型 (MetricPoint, Query, Result)
  ├── 实现 Serializer 接口
  └── 调用 Storage API
       ↓
存储层 (本包)
  ├── PrometheusStorage[T, Q, R]
  ├── 定时压缩 (Trigger)
  ├── 定时清理 (Trigger)
  └── Prometheus TSDB
```

---

## 🚀 快速开始

### 1. 定义数据类型

```go
// 定义你的数据点类型
type MetricPoint struct {
    Name      string
    Labels    map[string]string
    Timestamp int64
    Value     float64
}

// 定义查询类型
type Query struct {
    Selector  map[string]string
    StartTime int64
    EndTime   int64
}

// 定义结果类型
type Result struct {
    Points []MetricPoint
}
```

### 2. 实现 Serializer 接口

```go
type MySerializer struct{}

func (s *MySerializer) ToLabels(point MetricPoint) map[string]string {
    labels := make(map[string]string, len(point.Labels)+1)
    labels["__name__"] = point.Name
    for k, v := range point.Labels {
        labels[k] = v
    }
    return labels
}

func (s *MySerializer) ToTimestamp(point MetricPoint) int64 {
    return point.Timestamp
}

func (s *MySerializer) ToValue(point MetricPoint) float64 {
    return point.Value
}

func (s *MySerializer) FromLabels(labels map[string]string, timestamp int64, value float64) MetricPoint {
    name := labels["__name__"]
    delete(labels, "__name__")
    return MetricPoint{
        Name:      name,
        Labels:    labels,
        Timestamp: timestamp,
        Value:     value,
    }
}
```

### 3. 创建存储实例

```go
import (
    "monitor_hub/config/v1"
    "monitor_hub/internal/trigger"
    "monitor_hub/pkg/storage"
)

// 加载配置
cfg := v1.New("./config.yaml")

// 创建触发器管理器
triggerManager := trigger.NewTriggerManager()

// 创建存储（使用工厂函数）
store, err := storage.NewPrometheusFromConfig[MetricPoint, Query, Result](
    cfg,
    &MySerializer{},
    triggerManager,
)
if err != nil {
    log.Fatal(err)
}
defer store.Close()

// 启动触发器（自动压缩和清理）
triggerManager.StartAll()
defer triggerManager.StopAll()
```

### 4. 写入数据

```go
points := []MetricPoint{
    {
        Name:      "cpu_usage",
        Labels:    map[string]string{"host": "server1", "zone": "cn-south"},
        Timestamp: time.Now().Unix(),
        Value:     45.2,
    },
    {
        Name:      "memory_usage",
        Labels:    map[string]string{"host": "server1", "zone": "cn-south"},
        Timestamp: time.Now().Unix(),
        Value:     8589934592,
    },
}

seriesRefs, err := store.Write(context.Background(), points)
if err != nil {
    log.Printf("Write failed: %v", err)
}
log.Printf("Written %d series", len(seriesRefs))
```

### 5. 查询数据（需要自定义实现）

```go
// 注意：Query 方法需要根据你的查询类型自定义实现
// 可以通过组合模式或装饰器模式扩展存储功能

// 方式 1：组合模式
type MyStorageWithQuery struct {
    *storage.PrometheusStorage[MetricPoint, Query, Result]
}

func (s *MyStorageWithQuery) Query(ctx context.Context, query Query) (Result, error) {
    // 实现你的查询逻辑
    // 可以直接访问底层 s.DB() 执行 PromQL 查询
    return Result{}, nil
}

// 方式 2：使用 Prometheus 原生 API
// 直接通过 HTTP API 查询（推荐用于复杂查询）
```

### 6. 获取统计信息

```go
stats, err := store.GetStats(context.Background())
if err != nil {
    log.Fatal(err)
}

fmt.Printf("Total Series: %d\n", stats.TotalSeries)
fmt.Printf("Total Samples: %d\n", stats.TotalSamples)
fmt.Printf("Disk Size: %d bytes\n", stats.DiskSize)
```

---

## ⚙️ 配置说明

### config.yaml 配置示例

```yaml
storage:
  type: "prometheus"                      # 存储类型
  data_dir: "./data/tsdb"                 # 数据目录
  retention_days: 15                      # 数据保留天数
  compaction_interval: "2h"               # 压缩间隔
  max_chunk_size: 536870912               # 最大块大小 (512MB)
  write_buffer_size: 4096                 # 写缓冲区大小
  mix_block_duration: "2h"                # 混合块时长
  max_block_duration: "24h"               # 最大块时长
  memory_cleanup_interval: "6h"           # 内存清理间隔
```

### 配置项说明

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `type` | string | prometheus | 存储类型 |
| `data_dir` | string | ./data/tsdb | 数据存储目录 |
| `retention_days` | int | 15 | 数据保留天数 |
| `compaction_interval` | string | 2h | 数据压缩间隔 |
| `max_chunk_size` | int64 | 512MB | 最大块大小 |
| `write_buffer_size` | int | 4096 | 写缓冲区大小 |
| `mix_block_duration` | string | 2h | 混合块时长 |
| `max_block_duration` | string | 24h | 最大块时长 |
| `memory_cleanup_interval` | string | 6h | 内存清理间隔 |

---

## 🔧 高级用法

### 自定义触发器

```go
// 除了内置的压缩和清理触发器，你可以添加自定义触发器

type CustomTrigger struct {
    storage *storage.PrometheusStorage[MetricPoint, Query, Result]
}

func (t *CustomTrigger) Name() string {
    return "custom-backup"
}

func (t *CustomTrigger) Type() trigger.TriggerType {
    return trigger.TriggerTypeInterval
}

func (t *CustomTrigger) Interval() time.Duration {
    return 24 * time.Hour
}

func (t *CustomTrigger) Execute(ctx context.Context) error {
    // 自定义逻辑：如备份数据
    return nil
}

// 注册到触发器管理器
triggerManager.Register(&CustomTrigger{storage: store})
```

### 标签工具函数

```go
import "monitor_hub/pkg/storage"

// 标准化标签（去除空值、排序）
labels := storage.NormalizeLabels(map[string]string{
    "env":  "prod",
    "zone": "cn-south",
    "":     "empty", // 会被移除
})

// 合并标签
merged := storage.MergeLabels(
    map[string]string{"env": "prod"},
    map[string]string{"zone": "cn-south"},
)

// 标签匹配
matched := storage.MatchLabels(
    map[string]string{"env": "prod", "zone": "cn-south"},
    map[string]string{"env": "prod"}, // 选择器
) // true

// 时间戳对齐
aligned := storage.AlignTimestamp(1699876823, 60) // 对齐到分钟
```

---

## 📊 性能优化

### 写入优化

1. **批量写入**: 使用批量写入减少系统调用
   ```go
   // 好：批量写入
   store.Write(ctx, points) // points 包含 100 个数据点
   
   // 差：单点写入
   for _, point := range points {
       store.Write(ctx, []MetricPoint{point})
   }
   ```

2. **异步写入**: 数据自动通过 Channel 异步写入，无需额外处理

3. **缓冲区调整**: 根据写入速率调整 `write_buffer_size`
   ```yaml
   write_buffer_size: 8192  # 高吞吐场景
   ```

### 查询优化

1. **标签选择**: 使用精确的标签选择器减少扫描范围
   ```go
   // 好：精确选择器
   selector := map[string]string{"host": "server1", "metric": "cpu"}
   
   // 差：空选择器
   selector := map[string]string{}
   ```

2. **时间范围**: 限制查询时间范围
   ```go
   query := Query{
       StartTime: now - 3600,  // 1小时
       EndTime:   now,
   }
   ```

### 存储优化

1. **合理设置保留期**: 避免存储过多历史数据
   ```yaml
   retention_days: 7  # 短期数据
   ```

2. **定期压缩**: 压缩可以显著减少磁盘占用
   ```yaml
   compaction_interval: "2h"
   ```

---

## 🐛 故障排查

### 常见问题

**Q: 写入失败，提示 "storage is closed"**

A: 检查是否在 `Close()` 后继续写入，确保程序退出前正确处理

**Q: 磁盘占用过大**

A: 检查 `retention_days` 和 `compaction_interval` 配置，启用自动压缩

**Q: 内存占用过高**

A: 调整 `memory_cleanup_interval`，定期清理缓存

**Q: 查询性能慢**

A: 使用精确的标签选择器，限制时间范围，考虑添加索引

---

## 📚 API 文档

### Storage 接口

```go
type Storage[T any, Q any, R any] interface {
    // Write 批量写入数据点
    Write(ctx context.Context, points []T) ([]string, error)
    
    // Query 查询数据
    Query(ctx context.Context, query Q) (R, error)
    
    // Delete 删除数据
    Delete(ctx context.Context, query Q) (int64, error)
    
    // GetStats 获取统计信息
    GetStats(ctx context.Context) (*Stats, error)
    
    // Close 关闭存储
    Close() error
}
```

### Serializer 接口

```go
type Serializer[T any] interface {
    // ToLabels 将数据点转换为 Prometheus Labels
    ToLabels(point T) map[string]string
    
    // ToTimestamp 提取时间戳
    ToTimestamp(point T) int64
    
    // ToValue 提取指标值
    ToValue(point T) float64
    
    // FromLabels 从 Labels 构造数据点
    FromLabels(labels map[string]string, timestamp int64, value float64) T
}
```

---

## 🔗 相关资源

- [Prometheus TSDB 文档](https://prometheus.io/docs/prometheus/latest/storage/)
- [Monitor Hub 项目](../../../README.md)
- [Trigger 系统文档](../../internal/trigger/README.md)

---

## 📝 版本历史

- **v2.0.0** (2025-11-11): 重构为泛型版本，完全解耦业务依赖
- **v1.0.0** (2024-XX-XX): 初始版本，基于 Datasource metrics

---

## 📄 License

MIT License - 详见项目根目录 LICENSE 文件
