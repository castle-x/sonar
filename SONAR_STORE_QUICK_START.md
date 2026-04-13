# sonar-store 快速参考指南

## 📊 核心概念速览

### Mark 数据流（5秒聚合周期）

```
客户端 POST Mark
    ↓ MarkHandler.CreateMark()
    ↓ MarkAggregator.Mark() [内存缓冲]
    ↓ 每 5 秒定时任务 aggregatorMetrics()
    ↓ 将 RequestMetrics 转换为 11 个 MetricPoint
    ↓ Storage[*MetricPoint].Write() [Prometheus TSDB]
    ↓ 前端查询 PromQL / 标签查询
```

### RequestMetrics 的 11 个字段

```go
type RequestMetrics struct {
    TotalNum    uint64  // 总请求数
    FailedNum   uint64  // 失败数
    RttAvgMs    uint64  // 平均响应时间（ms）
    RttMaxMs    uint64  // 最大响应时间（ms）
    RttMinMs    uint64  // 最小响应时间（ms）
    RttP50Ms    uint64  // P50 响应时间（ms）
    RttP70Ms    uint64  // P70 响应时间（ms）
    RttP90Ms    uint64  // P90 响应时间（ms）
    RttP99Ms    uint64  // P99 响应时间（ms）
    QpsAvg      float64 // 平均 QPS
    SuccessRate float64 // 成功率
}
```

→ 每个字段都会成为一个独立的 MetricPoint：
- `metric_name`: total_num / failed_num / rtt_avg_ms / ...
- `labels`: {app_id, stress_id, request_name}
- `timestamp`: 毫秒级 Unix 时间戳
- `value`: 指标值

---

## 🏗️ 项目结构（GVE 规范）

```
sonar-store/
├── api/
│   └── sonar-store/
│       └── metrics/v1/
│           └── metrics.thrift      ← Thrift IDL 定义
├── cmd/
│   └── server/
│       └── main.go                 ← 服务入口
├── internal/
│   ├── api/                        ← 生成的代码（gve api generate）
│   ├── handler/                    ← HTTP 请求处理
│   │   ├── metrics/
│   │   └── exporter/
│   ├── service/                    ← 业务逻辑（由 hzx 生成）
│   ├── repo/                       ← 数据仓储层
│   ├── provider/                   ← Wire 依赖注入
│   └── ...
├── pkg/
│   ├── storage/                    ← 泛型 TSDB 接口 + Prometheus 实现
│   ├── aggregator/                 ← Mark 聚合引擎
│   ├── serializer/                 ← 数据序列化
│   └── exporter/                   ← Exporter 生命周期管理
└── go.mod
```

---

## 🔧 核心接口速查

### Storage[T] - 泛型 TSDB 接口

```go
type Storage[T any] interface {
    // 批量写入数据点
    Write(ctx context.Context, points []T) error
    
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
```

**实现**：`PrometheusStorage` - 基于 Prometheus TSDB

### Serializer[T] - 类型转换接口

```go
type Serializer[T any] interface {
    // 转换为 Prometheus Labels
    ToLabels(point T) Labels
    
    // 提取时间戳（毫秒）
    ToTimestamp(point T) int64
    
    // 提取指标值
    ToValue(point T) float64
    
    // 反序列化
    FromDataPoint(dp *DataPoint) T
}
```

**实现**：`RequestMetricPointSerializer` - MetricPoint 序列化器

---

## 📡 HTTP API 端点

### Mark 相关

```
POST /apis/v1/mark
  请求: Mark { app_id, stress_id, start_time, end_time, request_name?, error_msg? }
  响应: { code, message, data? }

POST /apis/v1/mark/batch
  请求: MarkList { mark_list: [Mark, ...] }
  响应: { code, message }

POST /apis/v1/mark/list
  请求: QueryRequest { query: "json string with filters" }
  响应: { code, message, data: ListMarkResponse }
    → ListMarkResponse { items: [StressMetricsItem], total }
    → StressMetricsItem { stress_id, app_id, metrics: {request_name: RequestMetrics} }

POST /apis/v1/mark/set_expired
  请求: SetMarkExpiredRequest { stress_id }
  响应: { code, message }
```

### Exporter 相关

```
GET /apis/v1/exporters?app_id=...&state=...&page=...&page_size=...
  响应: { code, message, data: ListExportersResponse }

GET /apis/v1/exporters/:id
  响应: { code, message, data: GetExporterResponse }

GET /apis/v1/exporters/stats?app_id=...
  响应: { code, message, data: GetExporterStatsResponse }
```

---

## 🔄 Exporter 生命周期

```
初始化（第一次上报）
    ↓ RecordScrape(appId, instance, labels)
    ↓
UP 状态（正常上报中）
    ↓ 5 分钟无上报 → DOWN 状态
    ↓
DOWN 状态（已下线）
    ↓ 1 小时后 → 自动删除
    ↓
已清理
```

**记录上报**：`ExporterManager.RecordScrape(appId, instance, labels)`
- 更新 `last_scrape` 时间
- 递增 `scrape_count`
- 更新 `state`（UP/DOWN/UNKNOWN）

---

## ⚙️ 配置参数

### Mark 聚合配置

```yaml
mark:
  aggregate_interval: "5s"       # 聚合周期
  ttl: "5m"                      # Mark 数据 TTL（内存缓冲）
  channel_size: 10000            # 接收 channel 缓冲区
  cleanup_interval: "1m"         # RecorderManager 清理周期
```

### 存储配置

```yaml
storage:
  data_dir: "./data/tsdb"        # TSDB 数据目录
  retention_days: 7              # 数据保留天数
  compaction_interval: "1h"      # 压缩间隔
  max_chunk_size: 4194304        # 最大块大小（4MB）
  write_buffer_size: 30000       # 写缓冲区大小
  mix_block_duration: "2h"       # 混合块时长
  max_block_duration: "24h"      # 最大块时长
  memory_cleanup_interval: "10m" # 内存清理间隔
```

### Exporter 配置

```yaml
exporter:
  stale_timeout: "5m"            # 无数据超时
  cleanup_interval: "1m"         # 检查间隔
  cleanup_after: "1h"            # DOWN 状态保留时长
```

---

## 🚀 实现步骤

### Step 1: 定义 Thrift IDL

📄 `api/sonar-store/metrics/v1/metrics.thrift`

```thrift
namespace go sonar.store.metrics.v1

// 指标点
struct MetricPoint {
    1: string name,                    // 指标名称
    2: map<string, string> labels,     // 标签
    3: i64 timestamp,                  // 时间戳（毫秒）
    4: double value,                   // 指标值
}

// 查询请求
struct MetricQueryRequest {
    1: string metric_name,
    2: map<string, string> labels,
    3: i64 start_time,
    4: i64 end_time,
}

// 查询响应
struct MetricQueryResponse {
    1: list<MetricPoint> points,
    2: i64 total,
}

// API 服务
service MetricService {
    // 写入数据点
    base.Response WriteMetrics(1: list<MetricPoint> points)
        (api.post="/apis/v1/metrics/write");
    
    // 查询数据
    base.Response QueryMetrics(1: MetricQueryRequest req)
        (api.get="/apis/v1/metrics/query");
}
```

### Step 2: 生成代码

```bash
cd sonar-store
gve api generate
```

### Step 3: 实现 Handler

📄 `internal/handler/metrics/handler.go`

```go
type MetricsHandler struct {
    storage *storage.MetricStorage
    aggregator *aggregator.MarkAggregator
}

func (h *MetricsHandler) WriteMetrics(ctx context.Context, 
    points []*v1.MetricPoint) *baseV1.Response {
    if err := h.storage.Write(ctx, points); err != nil {
        return baseV1.Failed(err)
    }
    return baseV1.Success()
}

func (h *MetricsHandler) QueryMetrics(ctx context.Context,
    req *v1.MetricQueryRequest) *baseV1.Response {
    // 实现查询逻辑
    // 支持标签查询和 PromQL 查询
    ...
}
```

### Step 4: Wire 依赖注入

📄 `internal/provider/custom_provider.go`

```go
func ProvideMarkAggregator(
    ctx context.Context,
    storage *MetricStorage,
) *MarkAggregator {
    return aggregator.NewMarkAggregator(
        ctx,
        5 * time.Second,  // tickInterval
        storage,
    )
}

func ProvideMetricsHandler(
    storage *MetricStorage,
    aggregator *MarkAggregator,
) *handler.MetricsHandler {
    return handler.NewMetricsHandler(storage, aggregator)
}
```

### Step 5: main.go 启动

```go
func main() {
    cfg := loadConfig()
    app, err := initializeApp(cfg)
    if err != nil {
        log.Fatal(err)
    }
    
    if err := app.Run(":8281"); err != nil {
        log.Fatal(err)
    }
}
```

---

## 🧪 测试用例

### 创建 Mark

```bash
curl -X POST http://localhost:8281/apis/v1/mark/batch \
  -H "Content-Type: application/json" \
  -d '{
    "mark_list": [
      {
        "app_id": "myapp",
        "stress_id": "stress_001",
        "start_time": 1700000000000,
        "end_time": 1700000001000,
        "request_name": "login",
        "error_msg": ""
      }
    ]
  }'
```

### 查询 Mark 数据

```bash
curl -X POST http://localhost:8281/apis/v1/mark/list \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{\"app_id\": \"myapp\", \"stress_id\": \"stress_001\"}"
  }'
```

### 查询 Exporter

```bash
curl -X GET "http://localhost:8281/apis/v1/exporters?app_id=myapp"
```

---

## 📝 关键代码片段

### 聚合逻辑（最核心）

```go
// pkg/aggregator/aggregator.go
func (a *MarkAggregator) aggregatorMetrics(ctx context.Context) error {
    // 1. 获取所有 metrics
    allMetrics, _ := a.ListMetrics()
    
    // 2. 预估容量（每个 stressId 多个 request，每个 11 个指标）
    estimatedSize := len(allMetrics) * 10 * 11
    metricPoints := make([]*v1.MetricPoint, 0, estimatedSize)
    
    // 3. 遍历并转换
    timestamp := time.Now().UnixMilli()
    for stressId, stressMetrics := range allMetrics {
        appId := a.getAppIdByStressId(stressId)
        
        for requestName, m := range stressMetrics {
            points := a.convertRequestMetricsToPoints(
                appId, stressId, requestName, m, timestamp)
            metricPoints = append(metricPoints, points...)
        }
    }
    
    // 4. 写入 TSDB
    return a.tsdb.Write(ctx, metricPoints)
}
```

### 转换逻辑

```go
func (a *MarkAggregator) convertRequestMetricsToPoints(
    appId, stressId, requestName string,
    m recorder.RequestMetrics,
    timestamp int64,
) []*v1.MetricPoint {
    labels := map[string]string{
        "app_id":       appId,
        "stress_id":    stressId,
        "request_name": requestName,
    }
    
    points := make([]*v1.MetricPoint, 0, 11)
    
    // 添加所有 11 个指标
    addMetric := func(name string, value float64) {
        metricName := name
        points = append(points, &v1.MetricPoint{
            Name:      &metricName,
            Labels:    labels,
            Timestamp: timestamp,
            Value:     value,
        })
    }
    
    addMetric("total_num", float64(m.TotalNum))
    addMetric("failed_num", float64(m.FailedNum))
    addMetric("rtt_avg_ms", float64(m.RttAvgMs))
    // ... 其余 8 个字段 ...
    
    return points
}
```

---

## 📚 参考资源

| 文件 | 功能 | 位置 |
|------|------|------|
| interface.go | Storage[T] 接口定义 | pkg/storage/ |
| prometheus.go | Prometheus TSDB 实现 | pkg/storage/ |
| aggregator.go | Mark 聚合核心 | pkg/aggregator/ |
| handler.go | Mark HTTP 处理 | biz/mark/v1/ |
| mark.thrift | Mark API IDL | apis/datasource/mark/v1/ |
| aggregator_test.go | 聚合器测试 | pkg/aggregator/ |

---

## ⚡ 常见问题

**Q: Mark 数据为什么要缓冲 5 分钟？**
A: 压测通常持续较长时间，缓冲允许聚合器等待更多数据，提高聚合效率。

**Q: 11 个指标点为什么要分开存储？**
A: 分开存储便于单独查询和告警，例如可以单独查询 P99 的变化趋势。

**Q: Exporter 5 分钟无数据就标记为 DOWN 的原因？**
A: 快速发现离线实例，避免错误的数据汇总。

**Q: RecorderManager 的 TTL 是什么意思？**
A: 内存缓冲中 Mark 数据的有效期，超期自动删除，防止内存持续增长。

---

## 🎯 下一步

1. ✅ 理解核心概念（本文档）
2. ⏳ 定义 Thrift IDL
3. ⏳ 复制核心包
4. ⏳ 实现业务逻辑层
5. ⏳ 集成依赖注入
6. ⏳ 编写单元测试
7. ⏳ 集成测试
