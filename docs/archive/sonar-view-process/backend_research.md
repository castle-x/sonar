# sonar-view 后端能力调研报告

> 调研对象：`/Users/castlexu/github/sonar/.legacy/monitor_hub/`
> 调研日期：2026-04-13
> 调研人：sonar-view 设计团队后端调研专家

---

## 目录

1. [pkg 目录清单](#1-pkg-目录清单)
2. [聚合引擎详解](#2-聚合引擎详解)
3. [MongoDB 存储详解](#3-mongodb-存储详解)
4. [评分系统详解](#4-评分系统详解)
5. [WebSocket 推送详解](#5-websocket-推送详解)
6. [可直接复用的 pkg 清单](#6-可直接复用的-pkg-清单)
7. [废弃不复用的部分](#7-废弃不复用的部分)
8. [sonar-view 与 sonar-store 对接建议](#8-sonar-view-与-sonar-store-对接建议)

---

## 1. pkg 目录清单

| 包路径 | 职责一句话 |
|---|---|
| `pkg/aggregator/` | 级联多级聚合引擎：从 raw 数据向上逐级聚合（15s→30s→1m→5m→1h→6h→1d），写入本地 Prometheus TSDB |
| `pkg/cache/` | 通用 TTL 内存缓存，用于减少重复查询 TSDB 的开销 |
| `pkg/client/pushgateway/` | HTTP 客户端，调用 sonar-store（原 pushgateway）的 metrics 和 stats 接口 |
| `pkg/dataprocess/` | 数据后处理层：将 TSDB 压缩点位数据转换为汇总表格（SummaryTable）、速率统计（Rate）、聚合计算 |
| `pkg/export/` | 基于 chromedp（无头 Chrome）将报告页面截图导出为 PDF/PNG，支持分段截图拼接大页面 |
| `pkg/mongodb/` | 泛型 MongoDB CRUD 封装（软删除、分页、去重、异步索引创建），供报告/任务/数据源元数据存储使用 |
| `pkg/repo/` | 业务 Repository 层：`DatasourceRepo`（数据源管理）、`ReportRepo`（报告元数据+分块存储）、`TaskRepo`（任务记录） |
| `pkg/scoring/` | 评分系统：支持 range（区间线性插值）和 threshold（阈值条件）两种评分模式，计算指标→用例→报告三级得分 |
| `pkg/siteserver/` | 嵌入式静态文件服务，将前端 dist 内嵌到二进制（go:embed） |
| `pkg/storage/` | 泛型 Prometheus TSDB 存储接口定义 + 具体实现，支持 Write/QueryByLabels/QueryByPromQL/Delete |
| `pkg/taskpool/` | 通用异步任务池（带优先队列、并发控制、超时、取消、进度回调、状态事件发布） |
| `pkg/trigger/` | 触发器管理器：支持 interval / cron / event / once 四种触发类型，统一管理聚合和广播的定时任务 |
| `pkg/utils/` | 工具函数：标签解析/格式化、指标值格式化、gzip 压缩/解压 |

内部包（`internal/`）：

| 包路径 | 职责 |
|---|---|
| `internal/websocket/` | WebSocket 核心层：Connection、Hub、Router、SubscriptionManager、Server、Manager（广播管理器）全部在此文件 |
| `internal/trigger/` | 触发器接口定义和 TriggerManager 实现（被 `pkg/trigger/` 的具体触发器使用） |
| `internal/provider/` | Wire 依赖注入 Provider 集合 |
| `internal/hzapp/` | Hertz HTTP 服务器初始化 |
| `internal/middleware/` | HTTP 中间件（日志、鉴权等） |

---

## 2. 聚合引擎详解

### 2.1 核心文件

```
pkg/aggregator/
├── config.go      # 聚合配置和默认级别定义
├── types.go       # 数据类型定义（AggregatedPoint、AggregationType 等）
├── aggregator.go  # 纯函数聚合算法（Aggregate / AggregateRaw）
├── manager.go     # Manager：级联调度核心
├── collector.go   # Collector 接口（从 sonar-store 拉取原始数据）
├── serializer.go  # AggregatedPoint ↔ Prometheus TSDB 序列化/反序列化
├── trigger.go     # AggregationTrigger（定时触发 Manager.RunOnce）
├── quality.go     # 数据质量评估（DataQuality）
```

### 2.2 多级聚合策略（默认配置）

```
raw（sonar-store）
  └─→ 15s  [retention: 15min]   ← 每个 ticker 周期必定执行
        └─→ 30s  [retention: 30min]   ← 每 30s 边界触发
              └─→ 1m   [retention: 1h]    ← 每 1min 边界触发
                    └─→ 5m   [retention: 6h]    ← 每 5min 边界触发
                          └─→ 1h   [retention: 7d]    ← 每 1h 边界触发
                                └─→ 6h   [retention: 30d]   ← 每 6h 边界触发
                                      └─→ 1d   [retention: 90d]   ← 每 1d 边界触发
```

每个级别的 `FallbackMode`：
- `skip`（15s/1h/6h/1d）：数据不足时跳过，保证质量
- `single`（30s）：允许单点聚合，保证连续性
- `partial`（1m/5m）：允许 ≥50% 数据点时聚合

### 2.3 触发机制

```
TriggerManager
  └── AggregationTrigger (interval = 15s)
        └── Manager.RunOnce(ctx, now)
              ├── 始终执行：aggregateLevel("15s", raw → TSDB)
              └── 按时间边界：aggregateLevel("30s"|"1m"|..., TSDB → TSDB)
```

**时间对齐逻辑**：
- `AlignTimestamp(t, interval)` = `t.Truncate(interval)`
- `IsTimeBoundary(now, interval, minInterval)` = `now - now.Truncate(interval) < minInterval(15s)`
- 全局 `QueryDelay = 40s`：实际查询窗口向前偏移 40 秒，等待迟到数据

**防重复执行**：`Manager.lastAggregation[level]` 记录最后聚合时间戳，相同时间点不重复聚合。

### 2.4 聚合算法摘要

**原始数据聚合（`AggregateRaw`）**：
1. 按 `(datasourceId, metricName, labels)` 分组
2. 对每组同时计算 avg/min/max/count/last 五种聚合类型
3. 原始数据默认质量 100 分（DataStatusComplete）
4. 每个指标产生 **5 个** AggregatedPoint（扁平化设计）

**级联聚合（`cascadeAggregate`）**：
1. 从 TSDB 按 `__aggregation_level__=<sourceLevel>` 查询源数据
2. 计算期望点数 = `(level.Interval / source.Interval) × 4 × uniqueMetrics`
3. 评估数据质量 → 根据 FallbackMode 决定是否跳过
4. 调用 `Aggregate()` 对同名指标按聚合类型分组合并
5. 写入 TSDB，更新 `lastAggregation`

**内部标签（存储在 Prometheus Labels 中）**：

| 标签名 | 含义 |
|---|---|
| `__aggregation_level__` | 聚合级别（15s/30s/1m/...） |
| `__data_status__` | 数据状态（complete/partial/missing） |
| `__data_score__` | 数据质量分数（0~100） |
| `__statistic_suffix__` | 聚合类型（avg/min/max/count/last） |
| `__datasource_id__` | 数据源 ID |

### 2.5 数据清理

`Manager.CleanupExpiredData(ctx, now)` 按每个 level 的 `Retention` 调用 `tsdb.Delete()`，由独立的 CleanupTrigger 定期执行。

---

## 3. MongoDB 存储详解

### 3.1 用途

MongoDB **仅存储元数据和报告文档**，不存储时序数据（时序数据在 Prometheus TSDB）：

- 数据源（Datasource）注册信息
- 报告（Report）元数据 + 报告正文分块数据
- 任务（Task）执行记录
- 评分配置（ScoringConfig）

### 3.2 泛型文档结构

```go
// TypedDocument[T] — 所有集合的统一文档格式
type TypedDocument[T any] struct {
    Id          string `bson:"_id"`
    MarkDeleted bool   `bson:"markDeleted"`  // 软删除标记
    DeletedAt   int64  `bson:"deletedAt"`
    CreatedAt   int64  `bson:"createdAt"`
    UpdatedAt   int64  `bson:"updatedAt"`
    Resource    T      `bson:"_,inline"`     // 业务数据内联展开
}
```

业务数据通过泛型参数 `T` 内联到文档，避免嵌套层级。

### 3.3 报告数据结构与 gzip 分块

报告数据量可超过 50MB（大量时序数据点），使用 gzip + 分块方案存储：

```
Collection: reports           → 报告元数据（标题、时间范围、状态、评分）
Collection: report_chunks     → 报告正文分块（reportId + chunkIndex + gzip数据）
```

**写入流程（ReportRepo）**：
1. 将报告完整 JSON 序列化
2. gzip 压缩（`pkg/utils/compress.go`）
3. 按固定大小分块（每块 ~1MB）
4. 每块写入一条 `report_chunks` 文档，字段：`{ reportId, chunkIndex, totalChunks, data: []byte }`

**读取流程**：
1. 按 `reportId` 查询所有 chunks，按 `chunkIndex` 排序
2. 拼接所有 chunk 字节流
3. gzip 解压，反序列化为报告对象

### 3.4 CRUD 工具函数

`pkg/mongodb/mongodb.go` 提供全套泛型工具函数：

| 函数 | 说明 |
|---|---|
| `CreateDocumentTyped[T]` | 创建文档，自动填充 ID 和时间戳 |
| `GetDocumentTyped[T]` | 按 ID 查询（自动过滤软删除） |
| `UpdateDocumentTyped[T]` | 先查后更新，保留 createdAt |
| `DeleteDocumentTyped[T]` | 软删除（设置 markDeleted=true） |
| `HardDeleteDocument` | 硬删除 |
| `ListDocumentsTyped[T]` | 分页+排序+投影+去重，默认按 createdAt 降序 |
| `CountDocuments` | 带条件的总数统计 |

索引：异步后台构建（`CreateIndexesAsyncWithMonitoring`），不阻塞启动。

---

## 4. 评分系统详解

### 4.1 核心文件

```
pkg/scoring/
├── calculator.go  # 评分计算核心逻辑
├── extractor.go   # 从汇总表格中提取指标值
```

### 4.2 配置结构（来自 Thrift IDL `apis/monitor_hub/report/v1`）

```
ReportScoringConfig
  └── CaseScoringConfig[]           # 多个测试用例
        └── MetricScoringConfig[]   # 每个用例多个指标
              ├── name              # 指标名（对应表格列头）
              ├── alias             # 别名（可选，用于展示）
              ├── weight            # 权重（任意正数，自动归一化）
              ├── unit              # 单位（如 ms、%）
              ├── source            # 数据来源：summary（默认）| rate
              ├── aggregation_types # 聚合类型列表（如 ["avg", "p99"]）
              ├── scoring_type      # 评分类型：range | threshold
              ├── ranges[]          # 区间评分配置 {min, max, score, level}
              ├── thresholds[]      # 阈值评分配置 {operator, value, score, level}
              └── na_handling       # N/A 处理策略：skip | use_value
```

### 4.3 评分类型详解

**区间评分（range，默认）**：
```
transformedValue 落在 [min, max] → 直接取 range.score
落在区间间隙 → 线性插值（interpolateScore）
无匹配区间 → 默认 60 分
```

**阈值评分（threshold）**：
```
按顺序遍历 thresholds，第一个满足 operator 的条件生效：
  < | <= | = | >= | >  value → 取 threshold.score + level
未命中 → 0分 + "unmatched"（不参与加权）
```

### 4.4 三级评分计算逻辑

```
1. 指标得分（CalculateMetricScore）
   └── 按 scoring_type 选 range/threshold 算法
   └── 返回 MetricScore{score, level, weight, weighted_score, original_value}

2. 用例得分（CalculateCaseScore）
   └── 收集所有指标（含各 aggregation_type）的原始权重
   └── NormalizeWeights() → 归一化
   └── 未命中的指标（threshold unmatched）weight=0，不参与加权
   └── 用例总分 = Σ(score × normalized_weight)，保留 2 位小数

3. 报告总分（CalculateReportScore）
   └── 用例权重：自动平均分配（1/N）
   └── 报告总分 = Σ(case_score × case_weight)
   └── 等级映射：≥90=excellent | ≥75=good | ≥60=normal | ≥40=warning | else=danger
```

### 4.5 数据提取（extractor.go）

从 `SummaryTable`（二维字符串数组）提取指标值：
- 支持按指标名或 alias 匹配列头
- 支持多行（多标签维度）提取，每行单独评分，权重平分
- 支持从 Rate 统计数据中提取（`source=rate`）
- 支持 transform 字段对值进行预处理（如单位换算）

---

## 5. WebSocket 推送详解

### 5.1 核心文件

```
internal/websocket/websocket.go  # 单文件包含所有组件：
  - Envelope / 消息协议
  - Connection / 连接管理
  - Router / 路由
  - SubscriptionManager / 订阅管理
  - Hub / 连接池
  - Server / WebSocket 服务器
  - Manager / 广播管理器（含触发器集成）
  - BroadcastIntervalTrigger / 定时广播触发器
  - BroadcastEventTrigger / 事件广播触发器
```

### 5.2 消息协议（Envelope）

```json
{
  "type": "request|response|broadcast|heartbeat",
  "topic": "points",
  "path": "/api/points/query",
  "request_id": "uuid",
  "timestamp": 1700000000000,
  "data": { /* JSON payload */ }
}
```

- **request**：客户端发起 RPC 调用（需要 topic + path）
- **response**：服务端响应 request（含 code + message + data）
- **broadcast**：服务端主动推送（含 topic + data）
- **heartbeat**：ping/pong 保活（含 client_time + server_time）

### 5.3 Hub 设计

```
Hub（连接池）
├── connections: map[connID]*Connection    # 所有连接
├── userConnections: map[userID][]connID   # 用户→连接多对多
├── register/unregister chan               # 注册/注销事件通道
├── broadcast chan *BroadcastMessage       # 广播消息通道
└── router *Router                         # 消息路由

Router（路由器）
└── handlers: map[topic+path]Handler       # topic+path 精确匹配路由表
```

**Connection 生命周期**：
- `NewConnection` → `hub.Register` → 启动 `go WritePump` + `ReadPump`
- `ReadPump`：接收消息 → `ParseEnvelope` → `hub.RouteEnvelope` → `conn.SendResponseWithEnvelope`
- `WritePump`：从 `send chan` 消费消息写入 WebSocket + 定时 Ping
- 断开：`Close` → `hub.Unregister` → `subscriptionManager.UnsubscribeAll`

### 5.4 订阅管理（SubscriptionManager）

- 双向索引：`topicSubs[topic][connID]` + `connSubs[connID][topic]`
- `Subscribe(connID, topic, metadata)` / `Unsubscribe(connID, topic)` / `UnsubscribeAll(connID)`
- `GetConnIDsByTopic(topic)` → 按 topic 获取所有订阅者（广播用）

### 5.5 广播机制

**两种触发方式**：

| 触发器类型 | 适用场景 | 实现 |
|---|---|---|
| `BroadcastIntervalTrigger` | 定时推送（如每 5s 推送聚合数据） | `time.NewTicker` |
| `BroadcastEventTrigger` | 事件驱动推送（如聚合完成立即推送） | `chan interface{}` 缓冲 4096 |

**广播路径**：
```
TriggerManager.startIntervalTrigger / startEventTrigger
  └── BroadcastIntervalTrigger.Execute / BroadcastEventTrigger.ExecuteWithEvent
        └── wsServer.BroadcastOne(bctx, broadcaster)   # 对每个订阅者单独推送
        └── wsServer.BroadcastRange(bctx, broadcaster) # 全量推送
              └── conn.SendPush(topic, data)
                    └── conn.send <- payload            # 非阻塞写入发送队列
```

**聚合事件驱动推送**（aggregator → WebSocket）：
```
aggregator.Manager.publishAggregationEvent
  └── EventPublisher.PublishEvent("points", AggregationEvent{})
        └── BroadcastEventTrigger.PublishEvent(event)
              └── eventChan <- event（非阻塞）
```

### 5.6 Broadcaster 接口

```go
type Broadcaster interface {
    Name() string
    Options() []BroadcastOption          // 声明 topic、触发类型、间隔
    BroadcastOne(bctx *BroadcastContext) *BroadcasterMessage  // 对单个订阅者推送
    BroadcastRange(bctx *BroadcastContext) *BroadcasterMessage // 广播给所有人
}
```

---

## 6. 可直接复用的 pkg 清单

| 路径 | 复用方式 | 适配工作量 |
|---|---|---|
| `internal/websocket/websocket.go` | **直接复制**，替换 `configv1.Config` 为 sonar-view 的配置结构 | 低：只需替换配置类型 |
| `internal/trigger/trigger.go` | **直接复制**，零依赖纯接口+实现 | 无 |
| `pkg/aggregator/`（全部） | **直接复制**，依赖 `pkg/storage/` 接口，与具体存储解耦 | 低：替换 `configV1` import |
| `pkg/storage/interface.go` | **直接复制**，泛型接口零业务依赖 | 无 |
| `pkg/storage/prometheus.go` | **直接复制**，Prometheus TSDB 实现 | 低：替换 logger 依赖 |
| `pkg/scoring/calculator.go` | **直接复制**，依赖 Thrift IDL 生成的 struct，需重新定义评分配置结构 | 中：用 Go struct 替代 Thrift struct |
| `pkg/scoring/extractor.go` | **同上** | 中 |
| `pkg/taskpool/pool.go` + `task.go` | **直接复制**，零外部业务依赖 | 无 |
| `pkg/mongodb/mongodb.go` | **直接复制**，替换 `configV1.Config` | 低 |
| `pkg/dataprocess/summary.go` | **直接复制**，需适配新的 SummaryConfig 结构 | 中 |
| `pkg/dataprocess/rate.go` | **直接复制** | 低 |
| `pkg/dataprocess/aggregation.go` | **直接复制** | 低 |
| `pkg/export/export.go` | **直接复制**，仅依赖 chromedp，零业务耦合 | 低：替换配置类型 |
| `pkg/utils/compress.go` | **直接复制** | 无 |
| `pkg/utils/label.go` | **直接复制** | 无 |
| `pkg/utils/metric.go` | **直接复制** | 无 |
| `pkg/cache/cache.go` | **直接复制**，泛型 TTL 缓存 | 无 |

### 复用优先级建议

**第一优先级（核心，必须复用）**：
1. `internal/trigger/trigger.go` — 触发器框架
2. `internal/websocket/websocket.go` — WebSocket 基础设施
3. `pkg/aggregator/` — 多级聚合引擎（sonar-view 的核心价值）
4. `pkg/storage/` — Prometheus TSDB 存储层

**第二优先级（重要功能）**：
5. `pkg/scoring/` — 评分系统
6. `pkg/taskpool/` — 报告生成异步任务
7. `pkg/mongodb/` — 报告/元数据存储
8. `pkg/export/` — PDF/PNG 导出

**第三优先级（工具支撑）**：
9. `pkg/dataprocess/` — 数据格式处理
10. `pkg/cache/` + `pkg/utils/` — 通用工具

---

## 7. 废弃不复用的部分

| 内容 | 废弃原因 |
|---|---|
| `biz/` 下所有 handler/service/router | 旧版 Hertz 路由层，sonar-view 将按 GVE 规范重新组织 API 层 |
| `internal/provider/` Wire 依赖注入 | Wire 生成代码与具体业务强绑定，sonar-view 重新编写 Wire provider |
| `internal/hzapp/` | 服务器初始化与旧配置耦合，重新实现 |
| `pkg/client/pushgateway/` | 调用旧 pushgateway 接口；sonar-view 应通过 sonar-store 的 GVE API 接口访问，重新生成客户端 |
| `pkg/trigger/datasource_status.go` | 旧版数据源状态检查逻辑（轮询 pushgateway `/stats`），sonar-store 新版通过心跳/注册机制管理，逻辑改变 |
| `pkg/repo/datasource_repo.go` | 旧版将数据源注册信息存 MongoDB；sonar-view 直接从配置文件读取 tap/store 地址列表 |
| `pkg/repo/task_repo.go` | 旧版将任务持久化到 MongoDB；新版可先使用内存存储（`pkg/taskpool/` 已支持） |
| `config/v1/` 旧配置结构 | 旧版与 Consul 服务注册、旧 MongoDB 等耦合，sonar-view 按 GVE 规范重写配置 |
| `apis/` Thrift IDL（旧版） | 旧版 IDL 在 `sonar/api/` 中统一重新定义，共享给三端 |
| `pkg/siteserver/` | GVE 框架已内置前端静态文件服务，不需要独立实现 |
| `pkg/aggregator/collector.go` 中旧 Collector 实现 | 接口可复用，但具体实现（调用旧 pushgateway）需替换为调用 sonar-store 的新 API |

---

## 8. sonar-view 与 sonar-store 对接建议

### 8.1 数据拉取架构

```
sonar-view 后端
  ├── AggregationCollector（实现 aggregator.Collector 接口）
  │     └── 每 15s 调用 sonar-store HTTP API 拉取原始指标点
  │           URL: POST /api/metrics/query  （sonar-store 查询接口）
  │           参数: { datasource_id, start_time, end_time }
  │
  ├── aggregator.Manager
  │     └── 接收 Collector 数据 → 多级聚合 → 写本地 TSDB
  │
  └── WebSocket Manager
        └── 聚合完成事件 → BroadcastEventTrigger → 推送给订阅客户端
```

### 8.2 推荐的接口约定（与 sonar-store 对接）

| 接口 | 方向 | 说明 |
|---|---|---|
| `GET /api/store/health` | view → store | 探活，监控 store 连通状态 |
| `GET /api/store/stats` | view → store | 获取 store 的 TSDB 统计信息（Series 数、磁盘用量） |
| `POST /api/metrics/query` | view → store | 按时间范围 + labels 查询原始指标，返回 `[]RawMetricPoint` |
| `POST /api/metrics/query/promql` | view → store | PromQL 查询（高级用法，可选） |
| `GET /api/datasources` | view → store | 获取已注册的 tap 数据源列表（store 作为注册中心） |

### 8.3 本地 TSDB 分配建议

sonar-view 维护**独立的本地 TSDB**（不与 sonar-store 共用），原因：
- sonar-store 只保留短期原始数据（建议 7 天）
- sonar-view 的聚合数据保留更长（1d 级别可保留 90 天）
- 聚合计算在 view 侧完成，减少 store 的计算负担

```
sonar-view 本地存储：
  data/tsdb/        ← Prometheus TSDB，存放聚合后数据（15s~1d 各级别）
  data/mongodb/     ← 报告元数据、评分配置（生产用真实 MongoDB URI）
```

### 8.4 WebSocket 主题规划（前端订阅）

| Topic | 触发方式 | 数据内容 | 建议间隔 |
|---|---|---|---|
| `points` | 事件驱动（聚合完成立即推送） | `AggregationEvent{level, points[]}` | 随聚合周期 |
| `datasource_status` | 定时 | 各 store/tap 连通状态 | 10s |
| `task_progress` | 事件驱动（任务状态变化） | `TaskInfo{id, status, progress}` | 即时 |

### 8.5 报告生成流程建议

```
前端触发 → POST /api/report/create
  → taskpool.Submit("create_report", func)
        → 1. 从 sonar-view 本地 TSDB 查询测试时段聚合数据
        → 2. dataprocess.BuildSummaryTable → 生成汇总表格
        → 3. scoring.CalculateReportScore → 计算评分
        → 4. 序列化报告 → gzip 分块 → 写入 MongoDB
        → 5. 任务完成事件 → WebSocket 推送 task_progress
  ← 返回 task_id 给前端
前端轮询/订阅 task_progress → 任务完成后跳转报告详情页
```

### 8.6 关键依赖版本

来自 `go.mod`（需在 sonar-view 中继续使用）：

| 依赖 | 版本 | 用途 |
|---|---|---|
| `github.com/prometheus/prometheus` | v0.53.3 | 本地 TSDB 存储 |
| `github.com/cloudwego/hertz` | v0.9.6 | HTTP 框架 |
| `github.com/hertz-contrib/websocket` | v0.2.0 | WebSocket 升级器 |
| `go.mongodb.org/mongo-driver` | v1.17.4 | 报告存储 |
| `github.com/bytedance/sonic` | v1.14.1 | 高性能 JSON |
| `github.com/chromedp/chromedp` | v0.9.5 | PDF/PNG 导出 |
| `github.com/robfig/cron/v3` | v3.0.1 | Cron 触发器 |
| `github.com/google/uuid` | v1.6.0 | ID 生成 |

---

*报告完毕。建议下一步：基于本报告制定 sonar-view GVE 项目初始化方案，优先搭建 aggregator + WebSocket 骨架，再接入 scoring 和 export 功能。*
