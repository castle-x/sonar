# Sonar 项目架构探索报告

## 目录概览

### 1. sonar-store 当前状态（空壳子）

```
sonar-store/
├── Makefile
├── go.mod                          # Go 1.23.0
├── api/
│   └── sonar-store/
│       └── metrics/
│           └── v1/
│               └── metrics.thrift  # API 契约定义（待补充）
├── cmd/
│   └── server/
│       └── main.go                 # 简单 HTTP 服务骨架（:8281）
└── internal/
    ├── api/
    │   └── sonar-store/
    │       └── metrics/v1/
    │           ├── client.go       # 已生成的 HTTP 客户端
    │           └── metrics.go      # 已生成的 Thrift 数据结构
    ├── handler/                     # 空目录（待补充）
    ├── repo/                        # 空目录（待补充）
    └── service/                     # 空目录（待补充）
```

**现状**：仅有 GVE 项目框架骨架，缺少核心业务逻辑

---

## 2. legacy/datasource 完整项目结构

```
.legacy/datasource/
├── go.mod                          # 依赖配置
├── Makefile
├── README.md
├── TESTING.md
├── CLAUDE.md
├── cmd/
│   └── datasource/
│       └── main.go                 # 服务入口
├── apis/                           # Thrift IDL 定义
│   └── datasource/
│       ├── base/v1/
│       │   └── base.thrift         # 基础响应结构
│       ├── mark/v1/
│       │   └── mark.thrift         # Mark API 契约
│       ├── exporter/v1/
│       │   └── exporter.thrift     # Exporter API 契约
│       └── metrics/v1/
│           └── metrics.thrift      # Metrics API 契约
├── biz/                            # 业务逻辑层
│   ├── exporter/v1/
│   │   ├── handler.go              # HTTP 请求处理
│   │   ├── service.go              # 服务层（由 hzx 生成）
│   │   ├── router.go
│   │   └── middleware.go
│   ├── mark/v1/
│   │   ├── handler.go              # 核心 Mark 处理逻辑
│   │   ├── service.go
│   │   ├── router.go
│   │   └── middleware.go
│   └── metrics/v1/
│       └── ...
├── internal/                       # 内部支持模块
│   ├── provider/
│   │   ├── custom_provider.go      # Wire 依赖注入配置
│   │   ├── gen_provider.go
│   │   └── trigger_provider.go
│   ├── hzapp/                      # Hertz 应用初始化
│   ├── mongodb/                    # MongoDB 连接
│   ├── middleware/
│   ├── websocket/                  # WebSocket 支持
│   ├── exporter/v1/
│   ├── mark/v1/
│   └── metrics/v1/
├── pkg/                            # 可复用包
│   ├── aggregator/
│   │   └── aggregator.go           # Mark 聚合核心逻辑
│   ├── storage/
│   │   ├── interface.go            # 泛型 Storage[T] 接口
│   │   ├── prometheus.go           # Prometheus TSDB 实现
│   │   ├── metric_storage.go
│   │   ├── errors.go
│   │   ├── utils.go
│   │   └── README.md
│   ├── serializer/                 # 数据序列化器
│   ├── exporter/                   # Exporter 生命周期管理
│   └── siteserver/                 # 静态文件服务
├── site/                           # React 前端
│   ├── src/
│   ├── public/
│   └── package.json
├── config/                         # 配置文件
├── script/                         # 脚本工具
├── tests/                          # 测试代码
└── docs/                           # 文档
```

---

## 3. 核心架构设计

### 3.1 数据流架构

```
压测客户端
    ↓
POST /apis/v1/mark/batch
    ↓
MarkHandler.BatchCreateMark()
    ↓
MarkAggregator.Mark() → RecorderManager（内存缓冲，TTL=5min）
    ↓
MarkAggregator.aggregatorMetrics()（每5秒定时执行）
    ↓
转换 RequestMetrics → 11 个 MetricPoint
    ↓
Storage[T].Write() → Prometheus TSDB
    ↓
前端查询 /metrics/query（PromQL 或标签查询）
```

### 3.2 Mark 聚合流程（最关键的业务逻辑）

```go
// 1. 接收单条或批量 Mark 请求
POST /apis/v1/mark
POST /apis/v1/mark/batch
  ↓
// 2. 存储到内存 RecorderManager（按 stressId 分组）
MarkAggregator.Mark(stressId, appId, requestTimeMeta)
  ├─ stressId → 压测ID（recorder 的 key）
  ├─ appId → 应用ID（用于 metrics 标签）
  └─ requestTimeMeta → {startTime, endTime, requestName, success}
  ↓
// 3. 定期聚合（每 5 秒）
MarkAggregator.aggregatorMetrics()
  ├─ 读取所有活跃 stressId 的 RequestMetrics
  ├─ 每个 stressId 可包含多个 requestName
  ├─ 每个 requestName 的 RequestMetrics 包含 11 个字段
  └─ 转换为 11 个独立的 MetricPoint（每个字段一个）
    {
      name: "total_num",
      labels: {app_id, stress_id, request_name},
      timestamp: 1234567890000,  // 毫秒级时间戳
      value: 1000
    },
    {
      name: "failed_num",
      ...
    },
    ...11 个字段...
  ↓
// 4. 写入 Prometheus TSDB
Storage[*MetricPoint].Write(ctx, metricPoints)
  ↓
// 5. 前端查询展示
/metrics/query?metric=total_num&app_id=xxx&stress_id=yyy
```

### 3.3 Exporter 生命周期管理

```
Exporter 状态机：
  UP ──(无数据 > 5min)──→ DOWN ──(> 1hour)──→ 删除

RecordScrape(appId, instance, labels)
  ↓
  更新 Exporter 最后上报时间和计数
  ↓
定期检查：
  - IsAlive() → 计算是否 UP/DOWN/UNKNOWN
  - Clean() → 删除过期 DOWN 状态的 Exporter
```

---

## 4. 关键接口和数据结构

### 4.1 泛型存储接口（pkg/storage/interface.go）

```go
// 核心接口：支持任意数据类型 T
type Storage[T any] interface {
    // 批量写入
    Write(ctx context.Context, points []T, labels ...string) error
    
    // 标签查询
    QueryByLabels(ctx context.Context, req *LabelQuery) ([]T, error)
    
    // PromQL 查询
    QueryByPromQL(ctx context.Context, req *PromQLQuery) ([]T, error)
    
    // 统计信息
    GetStats(ctx context.Context) (*Stats, error)
    
    // 删除数据
    Delete(ctx context.Context, startTime, endTime int64, labels map[string]string) error
    
    // 关闭
    Close() error
}

// 序列化器：将外部类型转换为 Prometheus 格式
type Serializer[T any] interface {
    // 转换为标签
    ToLabels(point T, labels ...string) Labels
    
    // 提取时间戳（毫秒）
    ToTimestamp(point T) int64
    
    // 提取指标值
    ToValue(point T) float64
    
    // 反序列化
    FromDataPoint(dp *DataPoint) T
}
```

### 4.2 Mark 相关 Thrift IDL

#### mark.thrift

```thrift
namespace go datasource.mark.v1

// 单条 Mark 数据
struct Mark {
    1: string app_id,              // 应用ID
    2: i64 start_time,             // 开始时间（毫秒）
    3: i64 end_time,               // 结束时间（毫秒）
    4: string stress_id,           // 压测ID
    5: optional string request_name, // 请求名称
    6: optional string error_msg,   // 错误信息
}

// 单个请求的聚合指标（11 个字段）
struct RequestMetrics {
    1: i64 total_num,              // 总请求数
    2: i64 failed_num,             // 失败数
    3: i64 rtt_avg_ms,             // 平均响应时间
    4: i64 rtt_max_ms,             // 最大响应时间
    5: i64 rtt_min_ms,             // 最小响应时间
    6: i64 rtt_p50_ms,             // P50 响应时间
    7: i64 rtt_p70_ms,             // P70 响应时间
    8: i64 rtt_p90_ms,             // P90 响应时间
    9: i64 rtt_p99_ms,             // P99 响应时间
    10: double qps_avg,            // 平均 QPS
    11: double success_rate,       // 成功率
}

// 压测数据（多个请求名称）
struct StressMetricsItem {
    1: string stress_id,
    2: string app_id,
    3: map<string, RequestMetrics> metrics,  // key: request_name
}

// API 接口
service MarkService {
    CreateMark(1: Mark req)
        (api.post="/apis/v1/mark");
    
    BatchCreateMark(1: MarkList req)
        (api.post="/apis/v1/mark/batch");
    
    ListMark(1: QueryRequest req)
        (api.post="/apis/v1/mark/list");
    
    SetMarkExpired(1: SetMarkExpiredRequest req)
        (api.post="/apis/v1/mark/set_expired");
}
```

#### exporter.thrift

```thrift
namespace go datasource.exporter.v1

enum ExporterState {
    UP = 1,        // 正常运行
    DOWN = 2,      // 已下线（5min 无上报）
    UNKNOWN = 3,   // 未知状态
}

struct Exporter {
    1: string id,                  // 唯一标识
    2: string app_id,              // 应用ID
    3: string instance,            // 实例（IP:Port）
    4: optional map<string, string> labels,  // 标签
    5: ExporterState state,        // 状态
    6: i64 last_scrape,            // 最后上报时间戳
    7: i64 first_scrape,           // 首次上报时间戳
    8: i64 scrape_count,           // 累计上报次数
    9: optional string last_error, // 最后错误
    10: optional i64 scrape_interval,  // 预期上报间隔
}

// API 接口
service ExporterService {
    ListExporters(1: ListExportersRequest request)
        (api.get="/apis/v1/exporters");
    
    GetExporter(1: GetExporterRequest request)
        (api.get="/apis/v1/exporters/:id");
    
    GetExporterStats(1: GetExporterStatsRequest request)
        (api.get="/apis/v1/exporters/stats");
}
```

---

## 5. 核心组件详解

### 5.1 MarkAggregator（pkg/aggregator/aggregator.go）

**职责**：将 Mark 数据聚合为 MetricPoint 并写入 TSDB

**关键属性**：
- `recorderMgr`: 内存缓冲管理器（按 stressId 分组）
- `tsdb`: Prometheus TSDB 存储实例
- `stressIdToAppId`: stressId ↔ appId 映射表
- `tickInterval`: 聚合周期（通常 5 秒）

**关键方法**：
```go
// 记录单条 Mark
Mark(stressId, appId string, requestTimeMeta RequestTimeMeta) error

// 定时聚合（每 tickInterval 执行一次）
aggregatorMetrics(ctx context.Context) error

// 转换逻辑：RequestMetrics → 11 个 MetricPoint
convertRequestMetricsToPoints(appId, stressId, requestName string, 
    m RequestMetrics, timestamp int64) []*MetricPoint

// 查询接口
GetMetricsByStressId(stressId string) (map[string]RequestMetrics, error)
GetMetricsByAppId(appId string) (map[string]map[string]RequestMetrics, error)
ListMetrics() (map[string]map[string]RequestMetrics, error)
```

**数据转换示例**：
```
输入：RequestMetrics {
  TotalNum: 1000,
  FailedNum: 10,
  RttAvgMs: 50,
  ...11 个字段...
}

输出：11 个 MetricPoint
  MetricPoint { Name: "total_num", Value: 1000, Labels: {...} }
  MetricPoint { Name: "failed_num", Value: 10, Labels: {...} }
  MetricPoint { Name: "rtt_avg_ms", Value: 50, Labels: {...} }
  ...
```

### 5.2 Storage[T] 泛型存储（pkg/storage/）

**实现**：`PrometheusStorage` 基于 Prometheus TSDB

**特点**：
- 完全泛型化：支持任意数据类型
- 通过 `Serializer[T]` 接口实现类型转换
- 支持标签查询和 PromQL 查询
- 包含自动数据保留期管理和压缩

**核心接口**：
```go
Storage[*MetricPoint].Write()
Storage[*MetricPoint].QueryByLabels()
Storage[*MetricPoint].QueryByPromQL()
```

### 5.3 MarkHandler（biz/mark/v1/handler.go）

**职责**：处理 Mark 相关的 HTTP 请求

**关键方法**：
```go
// 创建单条 Mark
CreateMark(ctx context.Context, c *RequestContext, req *Mark) *Response

// 批量创建 Mark
BatchCreateMark(ctx context.Context, c *RequestContext, req *MarkList) *Response

// 查询 Mark 列表（支持按 app_id 或 stress_id 过滤）
ListMark(ctx context.Context, req *QueryRequest) *Response

// 设置 Mark 过期（停止后续聚合）
SetMarkExpired(ctx context.Context, req *SetMarkExpiredRequest) *Response
```

**关键逻辑**：
1. 提取客户端 IP 作为 instance
2. 更新 ExporterManager 的上报统计
3. 调用 MarkAggregator.Mark() 将数据存入内存缓冲
4. 返回统一的响应格式

### 5.4 ExporterHandler 和 Manager（biz/exporter/v1/handler.go + pkg/exporter/）

**职责**：管理 Exporter 的生命周期（UP/DOWN 状态转换）

**关键方法**：
```go
// 记录上报
RecordScrape(appId, instance string, labels map[string]string)

// 查询 Exporter 列表（支持按 state 和 app_id 过滤）
ListExporters(filter *Filter) ([]Exporter, int64)

// 获取统计信息
GetStats() *ExporterStats
GetStatsByAppID(appId string) *ExporterStats

// 生命周期管理
- IsAlive() → UP/DOWN 判定
- Clean() → 删除过期 DOWN 状态（> 1 hour）
```

---

## 6. 依赖注入配置（internal/provider/custom_provider.go）

**使用工具**：Google Wire

```go
// 核心组件注入顺序：
1. Serializer[*MetricPoint] → RequestMetricPointSerializer
2. MetricPointStorage → ProvideMetricPointStorage()
   - 创建 PrometheusStorage 实例
   - 包装为 MetricStorage
3. MarkAggregator → ProvideMarkAggregator()
   - 注入 MetricPointStorage
   - 配置参数：TTL、ChannelSize、CleanupInterval 等
4. ExporterManager → ProvideExporterManager()
   - StaleTimeout: 5 分钟
   - CleanupInterval: 1 分钟
   - CleanupAfter: 1 小时
```

---

## 7. HTTP 路由设计

| 端点 | 方法 | 功能 | 输入 | 输出 |
|------|------|------|------|------|
| `/apis/v1/mark` | POST | 创建单条 Mark | Mark | Response |
| `/apis/v1/mark/batch` | POST | 批量创建 Mark | MarkList | Response |
| `/apis/v1/mark/list` | POST | 查询 Mark 数据 | QueryRequest (JSON) | ListMarkResponse |
| `/apis/v1/mark/set_expired` | POST | 设置 Mark 过期 | SetMarkExpiredRequest | Response |
| `/apis/v1/exporters` | GET | 查询 Exporter 列表 | ListExportersRequest (query/form) | ListExportersResponse |
| `/apis/v1/exporters/:id` | GET | 获取单个 Exporter | GetExporterRequest (path) | GetExporterResponse |
| `/apis/v1/exporters/stats` | GET | Exporter 统计信息 | GetExporterStatsRequest (query/form) | GetExporterStatsResponse |

---

## 8. 配置结构（参考 legacy/datasource）

```yaml
# config.yaml

mark:
  aggregate_interval: "5s"      # 聚合周期
  ttl: "5m"                     # Mark 数据在内存中的 TTL
  channel_size: 10000           # 接收 channel 缓冲区大小
  cleanup_interval: "1m"        # RecorderManager 清理间隔

storage:
  data_dir: "./data/tsdb"       # TSDB 数据目录
  retention_days: 7             # 数据保留天数
  compaction_interval: "1h"     # 压缩间隔
  max_chunk_size: 4194304       # 最大块大小（4MB）
  write_buffer_size: 30000      # 写缓冲区大小
  mix_block_duration: "2h"      # 混合块时长
  max_block_duration: "24h"     # 最大块时长
  memory_cleanup_interval: "10m" # 内存清理间隔

exporter:
  stale_timeout: "5m"           # 无数据超时，标记为 DOWN
  cleanup_interval: "1m"        # 检查间隔
  cleanup_after: "1h"           # DOWN 超过 1 小时后删除
```

---

## 9. 重构指南（sonar-store 实现路线）

### Phase 1：复制核心模块

1. **pkg/storage** ✓
   - 复制 `interface.go`（泛型存储接口）
   - 复制 `prometheus.go`（TSDB 实现）
   - 复制辅助文件

2. **pkg/aggregator** ✓
   - 复制 `aggregator.go`（Mark 聚合核心逻辑）
   - 更新导入路径

3. **pkg/exporter** 
   - 复制 Exporter 生命周期管理代码

4. **pkg/serializer**
   - 复制 MetricPoint 序列化器

### Phase 2：定义 API 契约

1. **apis/sonar-store/metrics/v1/metrics.thrift**
   - 定义 MetricPoint 数据结构
   - 定义查询请求/响应
   - 定义服务接口

2. **apis/sonar-store/exporter/v1/exporter.thrift**
   - 参考 datasource 的 exporter.thrift

### Phase 3：实现业务逻辑层

1. **internal/handler/metrics/**
   - 实现 `/apis/v1/metrics/*` 系列 endpoint

2. **internal/service/metrics/**
   - 实现业务逻辑（由 hzx 生成）

3. **internal/provider/**
   - Wire 依赖注入配置

### Phase 4：实现 main.go

```go
func main() {
    // 1. 加载配置
    cfg := loadConfig()
    
    // 2. 初始化依赖（Wire）
    app, err := initializeApp(cfg)
    
    // 3. 启动服务
    app.Run()
    
    // 4. 优雅关闭
    app.Close()
}
```

---

## 10. 关键差异点对比

| 功能 | legacy/datasource | sonar-store | 说明 |
|------|-------------------|-------------|------|
| 存储后端 | Prometheus TSDB | Prometheus TSDB | 保持一致 |
| Mark 聚合 | 每 5s 聚合一次 | 每 5s 聚合一次 | 保持一致 |
| Exporter 管理 | 支持 | 支持 | 保持一致 |
| HTTP 框架 | Hertz | Hertz（GVE） | GVE 规范 |
| 项目结构 | 自定义 | GVE 标准 | 按 GVE 约定 |
| API 版本管理 | Thrift IDL | Thrift IDL | 保持一致 |
| 前端 | 有（内嵌） | 无（store 纯 API） | 设计不同 |

---

## 11. 下一步行动

### 立即可做：

1. ✅ **理解 legacy/datasource 架构**（本报告完成）

2. **准备 Thrift IDL**
   - 创建 `api/sonar-store/metrics/v1/metrics.thrift`
   - 运行 `gve api generate` 生成 Go struct + HTTP client

3. **复制核心包**
   - `pkg/storage/` → sonar-store
   - `pkg/aggregator/` → sonar-store
   - `pkg/exporter/` → sonar-store
   - `pkg/serializer/` → sonar-store
   - 更新导入路径

4. **实现业务逻辑层**
   - 创建 `internal/handler/metrics/`
   - 创建 `internal/service/metrics/`
   - 实现 HTTP endpoint

5. **集成依赖注入**
   - 更新 `internal/provider/`
   - 生成 Wire 代码

---

## 12. 文件清单（需复制的关键文件）

### 从 legacy/datasource 复制：

**核心包**：
- [ ] `pkg/storage/interface.go` - 泛型存储接口
- [ ] `pkg/storage/prometheus.go` - TSDB 实现（需要验证 Prometheus SDK 版本）
- [ ] `pkg/storage/errors.go`
- [ ] `pkg/storage/utils.go`
- [ ] `pkg/storage/README.md`
- [ ] `pkg/aggregator/aggregator.go` - Mark 聚合核心
- [ ] `pkg/exporter/*` - Exporter 生命周期管理
- [ ] `pkg/serializer/*` - 序列化器实现

**Thrift IDL**（需适配）：
- [ ] `apis/datasource/base/v1/base.thrift` → `apis/sonar-store/base/v1/`
- [ ] `apis/datasource/metrics/v1/metrics.thrift` → 复制并适配

**参考代码**（不直接复制，参考逻辑）：
- [ ] `biz/mark/v1/handler.go` - Mark 处理逻辑参考
- [ ] `biz/exporter/v1/handler.go` - Exporter 处理逻辑参考
- [ ] `internal/provider/custom_provider.go` - Wire 配置参考

