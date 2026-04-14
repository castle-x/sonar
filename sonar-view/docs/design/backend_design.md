# sonar-view 后端架构设计文档

> 版本：v1.0  
> 日期：2026-04-13  
> 作者：Expert-C（后端架构设计）

---

## 目录

1. [整体架构](#1-整体架构)
2. [聚合引擎设计](#2-聚合引擎设计)
3. [快照（Snapshot）存储设计](#3-快照snapshot存储设计)
4. [评分系统设计](#4-评分系统设计)
5. [WebSocket 实时推送设计](#5-websocket-实时推送设计)
6. [Tap 代理设计](#6-tap-代理设计)
7. [API 接口清单](#7-api-接口清单)
8. [模块来源说明](#8-模块来源说明)
9. [配置结构](#9-配置结构)
10. [依赖关系图](#10-依赖关系图)

---

## 1. 整体架构

### 1.1 GVE 目录约定

```
sonar-view/
├── cmd/
│   └── server/
│       └── main.go                     # 入口：组装所有模块
├── internal/
│   ├── handler/                        # HTTP Handler 层（Hertz）
│   │   ├── snapshot_handler.go         # 快照管理
│   │   ├── scoring_handler.go          # 评分接口
│   │   ├── metrics_handler.go          # 指标查询（代理 sonar-store）
│   │   ├── tap_handler.go              # Tap 列表 + 代理管理 API
│   │   ├── ws_handler.go               # WebSocket 连接入口
│   │   └── system_handler.go           # 健康检查、系统状态
│   ├── service/                        # 业务逻辑层
│   │   ├── aggregation_service.go      # 聚合服务（启动 Manager、Trigger）
│   │   ├── snapshot_service.go         # 快照创建/查询
│   │   ├── scoring_service.go          # 评分计算
│   │   ├── tap_proxy_service.go        # Tap 代理服务
│   │   └── store_client_service.go     # sonar-store 客户端封装
│   ├── repo/
│   │   ├── snapshot_repo.go            # 快照 MongoDB 存储
│   │   └── scoring_config_repo.go      # 评分配置 MongoDB 存储
│   └── ws/
│       ├── hub.go                      # WebSocket Hub（连接管理）
│       └── message.go                  # 消息类型定义
├── pkg/
│   ├── aggregator/                     # 聚合引擎（从 monitor_hub copy + 适配）
│   │   ├── aggregator.go
│   │   ├── manager.go
│   │   ├── collector.go                # 改造为从 sonar-store 采集
│   │   ├── config.go
│   │   ├── types.go
│   │   ├── quality.go
│   │   └── trigger.go
│   ├── storage/                        # 泛型 TSDB 存储（直接 copy）
│   │   ├── interface.go
│   │   ├── prometheus.go
│   │   └── utils.go
│   ├── dataprocess/                    # 数据处理工具（直接 copy）
│   │   ├── aggregation.go
│   │   ├── rate.go
│   │   └── summary.go
│   ├── scoring/                        # 评分引擎（直接 copy）
│   │   ├── calculator.go
│   │   └── extractor.go
│   └── mongodb/                        # MongoDB 封装（直接 copy）
│       └── mongodb.go
├── api/
│   └── sonar-view/                     # Thrift IDL（本项目 API 契约）
│       ├── snapshot/v1/snapshot.thrift
│       ├── scoring/v1/scoring.thrift
│       ├── metrics/v1/metrics.thrift
│       ├── tap/v1/tap.thrift
│       └── ws/v1/ws.thrift
├── site/                               # React 前端（GVE 标准）
├── go.mod
└── gve.lock
```

### 1.2 模块职责划分

```
┌─────────────────────────────────────────────────────────┐
│                      sonar-view                         │
│                                                         │
│  ┌──────────┐   ┌────────────┐   ┌───────────────────┐ │
│  │  Handler │──▶│  Service   │──▶│ Store Client      │ │
│  │  (Hertz) │   │  Layer     │   │ (HTTP→sonar-store)│ │
│  └──────────┘   └────────────┘   └───────────────────┘ │
│       │               │                                 │
│  ┌────▼──────┐   ┌────▼────────┐  ┌────────────────┐   │
│  │ WebSocket │   │ Aggregation │  │  MongoDB Repo  │   │
│  │   Hub     │   │  Manager   │  │ (Snapshot/Score│   │
│  └───────────┘   └────────────┘  └────────────────┘   │
│                       │                                 │
│                  ┌────▼───────────────────────┐         │
│                  │  Local TSDB (Prometheus)   │         │
│                  │  (聚合后数据，15s→1d)       │         │
│                  └────────────────────────────┘         │
└─────────────────────────────────────────────────────────┘
         │                           │
         ▼                           ▼
  sonar-store:8082             sonar-tap:9090
  (拉取原始数据)               (代理管理 API)
```

---

## 2. 聚合引擎设计

### 2.1 从 sonar-store 拉取数据的机制

#### 核心改造点
旧版 `DatasourceCollector` 从 Pushgateway（sonar-store 的前身）拉取数据。新版改为从 **sonar-store** 拉取，适配 `api/sonar-store/metrics/v1/metrics.thrift` 接口。

```go
// pkg/aggregator/collector.go（改造版）

// StoreCollector 从 sonar-store 采集原始数据
type StoreCollector struct {
    storeClient StoreMetricsClient  // sonar-store HTTP 客户端
    tapRepo     TapRegistry         // Tap 注册表（从 sonar-store 同步）
}

// StoreMetricsClient sonar-store 客户端接口
type StoreMetricsClient interface {
    // POST /apis/v1/metrics/query
    QueryMetrics(ctx context.Context, req *MetricQueryRequest) ([]*MetricPoint, error)
}

// MetricQueryRequest 适配 sonar-store 的查询请求
type MetricQueryRequest struct {
    AppID      string            // 从 Tap 注册表获取
    StartTime  int64             // Unix 秒
    EndTime    int64             // Unix 秒
    Labels     []string          // label_list 格式
}

// Collect 实现 Collector 接口
func (c *StoreCollector) Collect(ctx context.Context, startTime, endTime time.Time) ([]RawMetricPoint, error) {
    // 1. 获取所有活跃的 app_id（来自 Tap 注册表）
    appIDs, err := c.tapRepo.GetActiveAppIDs(ctx)
    // 2. 并发查询每个 app_id 的数据
    // 3. 转换为 RawMetricPoint
}
```

#### 定时触发机制
```go
// pkg/aggregator/trigger.go

// AggregationTrigger 聚合触发器
type AggregationTrigger struct {
    manager     *Manager
    minInterval time.Duration   // 等于 config.Levels[0].Interval（15s）
    ticker      *time.Ticker
}

func (t *AggregationTrigger) Run(ctx context.Context) {
    t.ticker = time.NewTicker(t.minInterval)
    for {
        select {
        case now := <-t.ticker.C:
            t.manager.RunOnce(ctx, now)
        case <-ctx.Done():
            return
        }
    }
}
```

### 2.2 多级聚合策略

与 monitor_hub 完全一致，保留级联聚合逻辑：

```
原始数据（sonar-store）
    │  每 15s 拉取一次，聚合为 15s 级别
    ▼
15s TSDB（保留 15min）
    │  每 30s，从 15s 聚合
    ▼
1m TSDB（保留 1h）
    │  每 1m，从 30s 聚合
    ▼
5m TSDB（保留 6h）
    │  每 1h，从 5m 聚合
    ▼
1h TSDB（保留 7d）
    │  每 6h，从 1h 聚合
    ▼
6h TSDB（保留 30d）
    │  每 1d，从 6h 聚合
    ▼
1d TSDB（保留 90d）
```

### 2.3 聚合配置（yaml）

```yaml
aggregation:
  enabled: true
  collect_timeout: 12s    # 采集超时（<最小间隔）
  query_delay: 40s        # 查询延迟（等待迟到数据）
  levels:
    - name: "15s"
      interval: 15s
      retention: 15m
      source: raw
      min_points: 1
      fallback_mode: skip
    - name: "1m"
      interval: 1m
      retention: 1h
      source: 15s
      min_points: 2
      fallback_mode: partial
    - name: "5m"
      interval: 5m
      retention: 6h
      source: 1m
      min_points: 5
      fallback_mode: partial
    - name: "1h"
      interval: 1h
      retention: 7d
      source: 5m
      min_points: 12
      fallback_mode: skip
    - name: "1d"
      interval: 24h
      retention: 90d
      source: 1h
      min_points: 4
      fallback_mode: skip
```

### 2.4 关键数据结构

```go
// pkg/aggregator/types.go（直接复用）

// AggregatedPoint 聚合后的数据点
type AggregatedPoint struct {
    DatasourceId    string          // tap_id（对应 sonar-store 的 app_id+instance）
    Name            string          // 指标名称
    Labels          storage.Labels  // 标签集合
    Level           string          // 15s/1m/5m/1h/1d
    Timestamp       UnixMilliTime   // 对齐到级别边界
    AggregationType AggregationType // avg/min/max/count/last
    Value           float64
    Quality         DataQuality
}
```

---

## 3. 快照（Snapshot）存储设计

快照即"测试报告"，对应 monitor_hub 的 Report + Chunk 机制。重命名为 Snapshot，语义更通用。

### 3.1 MongoDB Schema

#### SnapshotMeta（快照元数据）

```go
// internal/repo/snapshot_repo.go

type SnapshotMeta struct {
    // 基础信息
    ID          string            `bson:"_id"`
    Name        string            `bson:"name"`           // 快照名称
    Description string            `bson:"description"`
    Tags        []string          `bson:"tags"`
    CreatedAt   int64             `bson:"created_at"`     // Unix 毫秒
    UpdatedAt   int64             `bson:"updated_at"`
    MarkDeleted bool              `bson:"mark_deleted"`

    // 时间范围
    StartTime   int64             `bson:"start_time"`     // 压测/采集开始时间（Unix 秒）
    EndTime     int64             `bson:"end_time"`       // 压测/采集结束时间（Unix 秒）

    // 数据来源
    AppID       string            `bson:"app_id"`         // 关联的 app_id
    TapIDs      []string          `bson:"tap_ids"`        // 关联的 tap 实例

    // 状态
    Status      SnapshotStatus    `bson:"status"`         // pending/building/done/failed
    ErrorMsg    string            `bson:"error_msg"`
    TaskID      string            `bson:"task_id"`        // 异步任务 ID

    // 数据统计
    ChunkCount  int               `bson:"chunk_count"`    // Chunk 总数
    TotalBytes  int64             `bson:"total_bytes"`    // 原始数据总大小（bytes）

    // 评分结果
    ScoringConfig *ScoringConfig  `bson:"scoring_config"` // 评分配置（快照级别）
    Score         *SnapshotScore  `bson:"score"`          // 评分结果

    // 指标配置（用于报告展示）
    MetricLayout  []*MetricPanel  `bson:"metric_layout"`  // 面板布局配置
}

type SnapshotStatus string
const (
    SnapshotStatusPending  SnapshotStatus = "pending"
    SnapshotStatusBuilding SnapshotStatus = "building"
    SnapshotStatusDone     SnapshotStatus = "done"
    SnapshotStatusFailed   SnapshotStatus = "failed"
)
```

#### SnapshotChunk（数据分块）

```go
type SnapshotChunk struct {
    ID         string `bson:"_id"`
    SnapshotID string `bson:"snapshot_id"`  // 关联 SnapshotMeta
    Index      int    `bson:"index"`         // 分块序号（从 0 开始）
    Data       []byte `bson:"data"`          // gzip 压缩后的原始数据
    Checksum   string `bson:"checksum"`      // MD5 校验
    CreatedAt  int64  `bson:"created_at"`
}
```

### 3.2 gzip 分块存储逻辑

```go
// internal/service/snapshot_service.go

const MaxChunkSize = 4 * 1024 * 1024  // 4MB per chunk（MongoDB 16MB 限制）

func (s *SnapshotService) storeData(ctx context.Context, snapshotID string, data interface{}) error {
    // 1. JSON 序列化
    jsonBytes, _ := json.Marshal(data)
    
    // 2. gzip 压缩
    var buf bytes.Buffer
    w := gzip.NewWriter(&buf)
    w.Write(jsonBytes)
    w.Close()
    compressed := buf.Bytes()
    
    // 3. 分块存储
    chunks := splitChunks(compressed, MaxChunkSize)
    for i, chunk := range chunks {
        s.chunkRepo.Create(ctx, &SnapshotChunk{
            SnapshotID: snapshotID,
            Index:      i,
            Data:       chunk,
            Checksum:   md5sum(chunk),
        })
    }
    
    // 4. 更新 SnapshotMeta.ChunkCount
    return s.metaRepo.UpdateChunkInfo(ctx, snapshotID, len(chunks), int64(len(compressed)))
}

func (s *SnapshotService) loadData(ctx context.Context, snapshotID string) ([]byte, error) {
    // 1. 按 index 顺序获取所有 chunk
    chunks, _ := s.chunkRepo.ListBySnapshotID(ctx, snapshotID)
    
    // 2. 合并
    var combined []byte
    for _, chunk := range chunks {
        combined = append(combined, chunk.Data...)
    }
    
    // 3. gzip 解压
    r, _ := gzip.NewReader(bytes.NewReader(combined))
    return io.ReadAll(r)
}
```

### 3.3 快照创建触发机制

```go
// 手动触发（HTTP POST /api/v1/snapshots）
// 异步任务模式：
//   1. 创建 SnapshotMeta（status=pending）
//   2. 返回 snapshot_id
//   3. 后台 goroutine 执行数据采集 + 写入
//   4. 更新 status=done / failed

// 自动触发（预留，暂未实现）：
// - 基于 tap 状态变化（DOWN 事件）
// - 基于时间计划（cron）
```

### 3.4 快照查询 API

详见第 7 节 API 接口清单中的 Snapshot 相关接口。

---

## 4. 评分系统设计

### 4.1 ScoringConfig 数据结构

```go
// pkg/scoring/types.go（新建，汇总评分相关类型）

// ScoringConfig 快照级别评分总配置
type ScoringConfig struct {
    Version    string           `json:"version"`      // 配置版本
    Cases      []*CaseScoringConfig `json:"cases"`    // 各测试用例配置
}

// CaseScoringConfig 单个用例评分配置
type CaseScoringConfig struct {
    CaseName      string               `json:"case_name"`
    Weight        float64              `json:"weight"`         // 用例权重（相对值）
    MetricConfigs []*MetricScoringConfig `json:"metric_configs"`
}

// MetricScoringConfig 单个指标评分配置
type MetricScoringConfig struct {
    Name           string               `json:"name"`           // 指标名
    Alias          *string              `json:"alias"`          // 展示名
    Weight         float64              `json:"weight"`         // 指标权重
    Unit           *string              `json:"unit"`           // 单位
    ScoringType    string               `json:"scoring_type"`   // range / threshold
    AggregationTypes []string           `json:"aggregation_types"` // avg/min/max
    Ranges         []*ScoringRange      `json:"ranges"`         // 区间评分配置
    Thresholds     []*ThresholdCondition `json:"thresholds"`    // 阈值评分配置
    NaHandling     *string              `json:"na_handling"`    // skip / use_value
    NaValue        *float64             `json:"na_value"`       // N/A 时使用的值
    Source         *string              `json:"source"`         // summary / rate
}

// ScoringRange 区间评分
type ScoringRange struct {
    Min   float64 `json:"min"`
    Max   float64 `json:"max"`
    Score int32   `json:"score"`  // 0-100
    Level string  `json:"level"`  // excellent/good/normal/warning/danger
}

// ThresholdCondition 阈值条件
type ThresholdCondition struct {
    Operator string  `json:"operator"` // < <= = >= >
    Value    float64 `json:"value"`
    Score    int32   `json:"score"`
    Level    string  `json:"level"`
}
```

### 4.2 评分计算引擎

直接从 `monitor_hub/pkg/scoring/` **copy** `calculator.go` 和 `extractor.go`，适配类型引用后可直接复用。

```go
// 评分入口（internal/service/scoring_service.go）

func (s *ScoringService) CalculateScore(
    ctx context.Context,
    snapshotID string,
    config *ScoringConfig,
) (*SnapshotScore, error) {
    // 1. 加载快照数据（从 chunk 解压）
    data, _ := s.snapshotService.LoadData(ctx, snapshotID)
    
    // 2. 构建 SummaryTable（按 case 分组的聚合数据）
    tables := buildSummaryTables(data, config)
    
    // 3. 计算每个 case 的得分
    caseScores := make([]*CaseScore, 0)
    for _, caseConfig := range config.Cases {
        caseScore, err := scoring.CalculateCaseScore(
            tables[caseConfig.CaseName],
            caseConfig,
            caseConfig.CaseName,
            nil,
        )
        if err != nil { continue }
        caseScores = append(caseScores, caseScore)
    }
    
    // 4. 计算总分
    reportScore := scoring.CalculateReportScore(caseScores)
    
    // 5. 持久化评分结果到 SnapshotMeta
    return s.saveScore(ctx, snapshotID, reportScore)
}
```

### 4.3 配置存储

评分配置有两个存储位置：

| 位置 | 用途 |
|------|------|
| `SnapshotMeta.ScoringConfig` | 快照级别配置（每个快照独立配置） |
| MongoDB `scoring_templates` 集合 | 可复用的评分模板 |

---

## 5. WebSocket 实时推送设计

### 5.1 连接管理（Hub 模式）

```go
// internal/ws/hub.go

// Hub WebSocket 连接中心
type Hub struct {
    // 所有活跃连接
    clients    map[*Client]bool
    mu         sync.RWMutex

    // 消息广播 channel
    broadcast  chan *Message

    // 注册/注销 channel
    register   chan *Client
    unregister chan *Client
}

// Client 单个 WebSocket 连接
type Client struct {
    hub         *Hub
    conn        *websocket.Conn
    send        chan *Message     // 发送队列（buffered，1024）
    subscriptions map[string]bool // 订阅的 topic 集合
    mu          sync.RWMutex
}

func (h *Hub) Run() {
    for {
        select {
        case client := <-h.register:
            h.mu.Lock()
            h.clients[client] = true
            h.mu.Unlock()
            
        case client := <-h.unregister:
            h.mu.Lock()
            if _, ok := h.clients[client]; ok {
                delete(h.clients, client)
                close(client.send)
            }
            h.mu.Unlock()
            
        case message := <-h.broadcast:
            h.mu.RLock()
            for client := range h.clients {
                // 仅推送给已订阅该 topic 的客户端
                if client.IsSubscribed(message.Topic) {
                    select {
                    case client.send <- message:
                    default:
                        // 队列满，断开连接
                        close(client.send)
                        delete(h.clients, client)
                    }
                }
            }
            h.mu.RUnlock()
        }
    }
}
```

### 5.2 订阅主题设计

```
topic 格式：{category}/{app_id}/{metric_name}/{level}

示例：
  points/my_app/*/*         # 订阅 my_app 所有指标所有粒度
  points/my_app/cpu_usage/1m  # 订阅 my_app 的 cpu_usage 1m 粒度
  taps/*                    # 订阅所有 tap 状态变化
  taps/my_app               # 订阅 my_app 的 tap 状态
  snapshots/my_app          # 订阅 my_app 的快照事件（创建/完成）
```

### 5.3 消息格式

```go
// internal/ws/message.go

type MessageType string
const (
    MsgTypePoints       MessageType = "points"        // 聚合数据推送
    MsgTypeTapStatus    MessageType = "tap_status"    // tap 状态变化
    MsgTypeSnapshot     MessageType = "snapshot"      // 快照事件
    MsgTypeSubscribe    MessageType = "subscribe"     // 客户端订阅请求
    MsgTypeUnsubscribe  MessageType = "unsubscribe"   // 客户端取消订阅
    MsgTypePing         MessageType = "ping"          // 心跳
    MsgTypePong         MessageType = "pong"          // 心跳响应
)

// Message WebSocket 消息
type Message struct {
    Type      MessageType     `json:"type"`
    Topic     string          `json:"topic"`
    Timestamp int64           `json:"timestamp"`   // Unix 毫秒
    Data      json.RawMessage `json:"data"`
}

// PointsPayload 聚合数据 payload
type PointsPayload struct {
    Level  string             `json:"level"`    // 15s/1m/5m/1h/1d
    Points []*AggregatedPoint `json:"points"`
    Count  int                `json:"count"`
}

// TapStatusPayload tap 状态 payload
type TapStatusPayload struct {
    TapID   string `json:"tap_id"`
    AppID   string `json:"app_id"`
    State   string `json:"state"`    // UP/DOWN/UNKNOWN
    Message string `json:"message"`
}

// 客户端订阅请求（从前端发送到后端）
type SubscribeRequest struct {
    Topics []string `json:"topics"`
}
```

### 5.4 推送时机

聚合完成后，`aggregator.Manager` 通过 `EventPublisher` 接口将事件推送到 Hub：

```go
// 聚合管理器实现 EventPublisher 接口
// internal/ws/event_publisher.go

type WSEventPublisher struct {
    hub *Hub
}

func (p *WSEventPublisher) PublishEvent(topic string, event interface{}) error {
    data, _ := json.Marshal(event)
    p.hub.broadcast <- &Message{
        Type:      MsgTypePoints,
        Topic:     topic,           // "points"
        Timestamp: time.Now().UnixMilli(),
        Data:      data,
    }
    return nil
}
```

### 5.5 断线重连策略（前端负责）

后端无需特殊处理，保持以下约定：
- WebSocket 连接断开后，前端负责指数退避重连（1s→2s→4s→max 30s）
- 重连后需重新发送 Subscribe 消息
- 后端不缓存断线期间的数据，重连后只推送新数据

---

## 6. Tap 代理设计

### 6.1 代理转发原理

```
前端/用户 → sonar-view:8283/api/v1/proxy/taps/{tap_id}/* 
         → sonar-view 后端（查找 tap 地址）
         → tap:9090/api/v1/*（透明转发）
```

```go
// internal/service/tap_proxy_service.go

type TapProxyService struct {
    tapRegistry TapRegistry     // Tap 注册表（从 sonar-store 同步）
    httpClient  *http.Client
}

// Forward 转发请求到指定 tap
func (s *TapProxyService) Forward(
    ctx context.Context,
    tapID string,
    method string,
    path string,          // "/api/v1/config"
    body io.Reader,
) (*http.Response, error) {
    // 1. 从注册表查找 tap 地址
    tap, err := s.tapRegistry.GetTap(ctx, tapID)
    if err != nil {
        return nil, fmt.Errorf("tap %s not found: %w", tapID, err)
    }
    
    // 2. 构造转发 URL
    targetURL := fmt.Sprintf("http://%s%s", tap.ManagementAddr, path)
    
    // 3. 透明转发
    req, _ := http.NewRequestWithContext(ctx, method, targetURL, body)
    return s.httpClient.Do(req)
}
```

### 6.2 Tap 注册表

Tap 注册表数据来源于 sonar-store，通过周期性同步保持最新：

```go
// internal/service/tap_registry.go

type TapRegistry interface {
    GetTap(ctx context.Context, tapID string) (*TapInfo, error)
    GetActiveAppIDs(ctx context.Context) ([]string, error)
    ListTaps(ctx context.Context) ([]*TapInfo, error)
    Sync(ctx context.Context) error // 从 sonar-store 同步
}

// TapInfo Tap 实例信息
type TapInfo struct {
    ID             string            // tap 唯一 ID（app_id+instance 哈希）
    AppID          string
    Instance       string            // IP:Port（数据上报端口）
    ManagementAddr string            // tap 管理 API 地址，格式 IP:9090
    Labels         map[string]string
    State          string            // UP/DOWN/UNKNOWN
    LastScrape     int64
}

// TapRegistryImpl 实现（内存缓存 + 定期同步）
type TapRegistryImpl struct {
    storeClient StoreClient
    cache       sync.Map          // tapID -> *TapInfo
    syncInterval time.Duration    // 默认 30s
}

func (r *TapRegistryImpl) startSyncLoop(ctx context.Context) {
    ticker := time.NewTicker(r.syncInterval)
    for {
        select {
        case <-ticker.C:
            r.Sync(ctx)
        case <-ctx.Done():
            return
        }
    }
}
```

### 6.3 ManagementAddr 推导规则

sonar-store 存储的是数据上报的 `instance`（格式 `IP:DataPort`），需推导管理端口（9090）：

```go
// 推导：取 instance 的 IP 部分，拼接固定管理端口
func inferManagementAddr(instance string) string {
    host, _, err := net.SplitHostPort(instance)
    if err != nil {
        return instance // fallback
    }
    return fmt.Sprintf("%s:9090", host)
}
```

> 注：后续可在 sonar-store 的 Tap 结构中增加 `management_addr` 字段，由 tap 上报时携带。

---

## 7. API 接口清单

### 7.1 指标查询（代理 sonar-store）

| Method | Path | 描述 |
|--------|------|------|
| POST | `/api/v1/metrics/query` | 查询原始指标数据（透传到 sonar-store） |
| GET | `/api/v1/metrics/aggregated` | 查询聚合后数据（本地 TSDB） |
| GET | `/api/v1/metrics/stats` | 查询本地 TSDB 统计信息 |

### 7.2 Tap 管理

| Method | Path | 描述 |
|--------|------|------|
| GET | `/api/v1/taps` | 获取 tap 列表（从 sonar-store 同步） |
| GET | `/api/v1/taps/:tap_id` | 获取单个 tap 详情 |
| GET | `/api/v1/taps/stats` | tap 统计（UP/DOWN 数量） |
| GET | `/api/v1/proxy/taps/:tap_id/config` | 代理：获取 tap 配置 |
| PUT | `/api/v1/proxy/taps/:tap_id/config` | 代理：更新 tap 配置 |
| PATCH | `/api/v1/proxy/taps/:tap_id/config/node` | 代理：更新 tap node 配置 |
| PATCH | `/api/v1/proxy/taps/:tap_id/config/process` | 代理：更新 tap process 配置 |
| PATCH | `/api/v1/proxy/taps/:tap_id/config/log` | 代理：更新 tap log 配置 |
| POST | `/api/v1/proxy/taps/:tap_id/config/reload` | 代理：重载 tap 配置 |
| GET | `/api/v1/proxy/taps/:tap_id/status` | 代理：获取 tap 运行状态 |
| GET | `/api/v1/proxy/taps/:tap_id/processes` | 代理：获取 tap 进程列表 |
| POST | `/api/v1/proxy/taps/:tap_id/debug/regex` | 代理：正则调试 |
| POST | `/api/v1/proxy/taps/:tap_id/debug/match_process` | 代理：进程匹配调试 |

### 7.3 快照管理

| Method | Path | 描述 |
|--------|------|------|
| POST | `/api/v1/snapshots` | 创建快照（异步，返回 snapshot_id） |
| GET | `/api/v1/snapshots` | 快照列表（支持分页、过滤） |
| GET | `/api/v1/snapshots/:id` | 获取快照详情（含元数据） |
| PUT | `/api/v1/snapshots/:id` | 更新快照信息（名称/标签/描述） |
| DELETE | `/api/v1/snapshots/:id` | 删除快照 |
| GET | `/api/v1/snapshots/:id/data` | 获取快照原始数据（解压后分页返回） |
| GET | `/api/v1/snapshots/:id/status` | 获取快照构建状态 |

### 7.4 评分系统

| Method | Path | 描述 |
|--------|------|------|
| POST | `/api/v1/snapshots/:id/score` | 触发评分计算 |
| GET | `/api/v1/snapshots/:id/score` | 获取评分结果 |
| PUT | `/api/v1/snapshots/:id/scoring-config` | 更新快照评分配置 |
| GET | `/api/v1/scoring-templates` | 评分模板列表 |
| POST | `/api/v1/scoring-templates` | 创建评分模板 |
| GET | `/api/v1/scoring-templates/:id` | 获取评分模板 |
| PUT | `/api/v1/scoring-templates/:id` | 更新评分模板 |
| DELETE | `/api/v1/scoring-templates/:id` | 删除评分模板 |

### 7.5 WebSocket

| Method | Path | 描述 |
|--------|------|------|
| GET | `/api/v1/ws` | WebSocket 连接入口 |

连接后通过 JSON 消息订阅/取消订阅 topic。

### 7.6 系统

| Method | Path | 描述 |
|--------|------|------|
| GET | `/api/v1/health` | 健康检查 |
| GET | `/api/v1/status` | 系统状态（聚合引擎、连接数等） |

### 7.7 Thrift IDL 位置建议

```
sonar-view/api/sonar-view/
├── snapshot/v1/snapshot.thrift     # Snapshot CRUD
├── scoring/v1/scoring.thrift       # 评分 API
├── metrics/v1/metrics.thrift       # 指标查询（聚合后数据）
├── tap/v1/tap.thrift               # Tap 列表（view 侧视图）
└── ws/v1/ws.thrift                 # WebSocket 消息类型定义（仅用于文档）
```

---

## 8. 模块来源说明

| 模块 | 来源 | 处理方式 |
|------|------|---------|
| `pkg/aggregator/` | monitor_hub/pkg/aggregator/ | **Copy + 适配**：`collector.go` 改为从 sonar-store 拉取 |
| `pkg/storage/` | monitor_hub/pkg/storage/ | **直接 Copy**：泛型 TSDB 存储，无需改动 |
| `pkg/dataprocess/` | monitor_hub/pkg/dataprocess/ | **直接 Copy**：聚合计算工具函数 |
| `pkg/scoring/` | monitor_hub/pkg/scoring/ | **直接 Copy + 类型适配**：移除 thrift 生成类型依赖，改为本地类型 |
| `pkg/mongodb/` | monitor_hub/pkg/mongodb/ | **直接 Copy**：MongoDB 泛型文档封装 |
| `internal/repo/snapshot_repo.go` | monitor_hub/pkg/repo/report_repo.go | **重新设计**：Report→Snapshot，去除多余字段 |
| `internal/ws/` | monitor_hub（无对应）| **全新设计**：旧版无 WebSocket，新建 Hub 模式 |
| `internal/service/tap_proxy_service.go` | monitor_hub（无对应）| **全新设计**：旧版无 tap 代理 |
| `internal/service/aggregation_service.go` | monitor_hub 散落各处 | **重新整合**：将触发器、manager 启动统一到 service 层 |

---

## 9. 配置结构

```yaml
# sonar-view config.yaml

server:
  port: 8283
  read_timeout: 30s
  write_timeout: 30s

# sonar-store 连接
store:
  addr: "http://localhost:8082"
  timeout: 10s

# MongoDB 配置
mongodb:
  uri: "mongodb://localhost:27017"
  database: "sonar_view"
  connect_timeout: 10s

# 聚合配置
aggregation:
  enabled: true
  collect_timeout: 12s
  query_delay: 40s
  tsdb_data_dir: "/data/sonar-view/tsdb"
  levels: [...]   # 见第 2.3 节

# WebSocket 配置
websocket:
  max_connections: 1000
  ping_interval: 30s
  pong_timeout: 10s
  send_buffer_size: 1024

# Tap 注册表同步
tap_registry:
  sync_interval: 30s
  management_port: 9090   # tap 管理 API 端口
```

---

## 10. 依赖关系图

```
cmd/server/main.go
    │
    ├── 初始化 MongoDB 连接
    ├── 初始化 sonar-store 客户端
    ├── 初始化 TapRegistry（+ 启动同步 goroutine）
    │
    ├── 初始化 local TSDB（Prometheus）
    ├── 初始化 StoreCollector（依赖 store 客户端 + TapRegistry）
    ├── 初始化 aggregator.Manager（依赖 TSDB + StoreCollector）
    ├── 初始化 WSEventPublisher（依赖 Hub）
    ├── 注入 EventPublisher 到 Manager
    ├── 启动 AggregationTrigger（定时触发 Manager.RunOnce）
    │
    ├── 初始化 WebSocket Hub（+ 启动 Run goroutine）
    │
    ├── 初始化 Repos（SnapshotRepo, ScoringConfigRepo）
    ├── 初始化 Services（SnapshotService, ScoringService, TapProxyService）
    │
    └── 初始化 Hertz Server
        ├── 注册 Handler 路由
        └── 启动 HTTP + WebSocket 服务
```

---

## 附录：关键 Thrift IDL 草稿

### snapshot.thrift（核心接口）

```thrift
namespace go sonar_view.snapshot.v1

struct SnapshotMeta {
    1: required string id
    2: required string name
    3: optional string description
    4: optional list<string> tags
    5: required i64 start_time
    6: required i64 end_time
    7: required string app_id
    8: required string status          // pending/building/done/failed
    9: optional string error_msg
    10: required i64 created_at
    11: required i64 updated_at
    12: optional SnapshotScore score
}

struct CreateSnapshotRequest {
    1: required string name
    2: required string app_id
    3: required i64 start_time
    4: required i64 end_time
    5: optional string description
    6: optional list<string> tags
}

service SnapshotService {
    base.Response CreateSnapshot(1: CreateSnapshotRequest req)
        (api.post="/api/v1/snapshots")
    base.Response ListSnapshots(1: ListSnapshotsRequest req)
        (api.get="/api/v1/snapshots")
    base.Response GetSnapshot(1: GetSnapshotRequest req)
        (api.get="/api/v1/snapshots/:id")
    base.Response DeleteSnapshot(1: DeleteSnapshotRequest req)
        (api.delete="/api/v1/snapshots/:id")
}
```
