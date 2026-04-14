# sonar-view 总体设计方案

> 版本：v1.0  
> 日期：2026-04-14  
> 状态：**Lead 审核通过**  
> 涉及子文档：backend_design.md | frontend_design.md | backend_research.md | frontend_research.md

---

## 一、项目定位

sonar-view 是 Sonar 产品的可视化平台，定位为：

- **实时监控看板**：从 sonar-store 拉取原始指标，经多级聚合后通过 WebSocket 推送到前端实时展示
- **快照（Snapshot）**：对压测时段的指标数据进行快照保存、评分、回顾（取代 monitor_hub 中的"测试报告"概念）
- **Tap 远程管理**：代理转发 sonar-tap 的管理 API，统一在 sonar-view 前端操作多台 tap

> **不实现**：测试任务（Task）管理功能（monitor_hub 中的 `/task`）

---

## 二、参考来源与复用策略

| 来源 | 复用方式 | 说明 |
|------|---------|------|
| `monitor_hub/pkg/aggregator/` | **直接 copy + 改造 collector** | 聚合算法不变，DatasourceCollector → StoreCollector |
| `monitor_hub/pkg/storage/` | **直接 copy** | 泛型 TSDB Storage[T] + Prometheus 后端 |
| `monitor_hub/pkg/scoring/` | **直接 copy** | range/threshold 双评分引擎 |
| `monitor_hub/pkg/mongodb/` | **直接 copy** | MongoDB 连接封装 |
| `monitor_hub/pkg/dataprocess/` | **直接 copy** | Rate/Summary/Aggregation 工具 |
| `monitor_hub/internal/websocket/` | **参考重写** | Hub/Router 模式保留，协议简化 |
| `monitor_hub/internal/trigger/` | **直接 copy** | Interval/Cron/Event 触发器框架 |
| `monitor_hub/site/` (前端图表) | **参考移植** | MetricChartsGrid、WebSocketClient、图表组件 |
| `monitor_hub/biz/task/` | **废弃** | 测试任务不在 sonar-view 范围内 |
| `monitor_hub/pkg/export/` | **废弃** | headless browser 截图暂不实现 |

---

## 三、整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         sonar-view :8283                        │
│                                                                 │
│  React 前端 (site/)                                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  /monitor    /snapshots    /taps    /settings           │    │
│  │  实时监控      快照列表    Tap管理   系统配置             │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                             │ HTTP + WebSocket                  │
│  Go 后端 (Hertz)            ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Handler → Service → Repo                               │   │
│  │  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐   │   │
│  │  │ WS Hub   │  │ Aggregation  │  │  MongoDB Repo    │   │   │
│  │  │(实时推送)│  │  Manager     │  │(Snapshot/Scoring)│   │   │
│  │  └──────────┘  └──────┬───────┘  └──────────────────┘   │   │
│  │                       │                                  │   │
│  │                  ┌────▼──────────────┐                   │   │
│  │                  │ Local TSDB        │                   │   │
│  │                  │ (聚合后 15s→1d)   │                   │   │
│  │                  └───────────────────┘                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────┬────────────────────┬─────────────────────┘
                       │                    │
                       ▼                    ▼
              sonar-store:8082       sonar-tap:9090
              (原始指标查询)         (管理 API 代理)
```

---

## 四、后端模块设计（详见 backend_design.md）

### 4.1 GVE 目录结构

```
sonar-view/
├── cmd/server/main.go
├── internal/
│   ├── handler/         # HTTP 层（Hertz）
│   │   ├── snapshot_handler.go
│   │   ├── scoring_handler.go
│   │   ├── metrics_handler.go
│   │   ├── tap_handler.go
│   │   ├── ws_handler.go
│   │   └── system_handler.go
│   ├── service/         # 业务层
│   │   ├── aggregation_service.go
│   │   ├── snapshot_service.go
│   │   ├── scoring_service.go
│   │   ├── tap_proxy_service.go
│   │   └── store_client_service.go
│   ├── repo/            # 存储层
│   │   ├── snapshot_repo.go
│   │   └── scoring_config_repo.go
│   └── ws/              # WebSocket
│       ├── hub.go
│       └── message.go
├── pkg/
│   ├── aggregator/      # copy from monitor_hub + 改造 collector
│   ├── storage/         # copy from monitor_hub (泛型 TSDB)
│   ├── scoring/         # copy from monitor_hub
│   ├── dataprocess/     # copy from monitor_hub
│   └── mongodb/         # copy from monitor_hub
├── site/                # React 前端
├── go.mod
└── gve.lock
```

### 4.2 核心模块

#### 聚合引擎
- **直接复用** `monitor_hub/pkg/aggregator/` 的聚合算法（avg/min/max/count/last × 6级）
- **关键改造**：`DatasourceCollector` → `StoreCollector`，从 sonar-store `POST /apis/v1/metrics/query` 拉取数据
- 聚合级别：15s → 1m → 5m → 1h → 6h → 1d
- 每 15s 由 IntervalTrigger 驱动，QueryDelay=40s 等待 store 数据就绪
- 聚合结果写入本地 Prometheus TSDB

#### 快照存储（MongoDB）
- `SnapshotMeta`（元数据，MongoDB `snapshots` 集合）
- `SnapshotChunk`（数据分块，gzip 压缩，4MB/块，MongoDB `snapshot_chunks` 集合）
- 快照创建：异步任务模式（POST 返回 ID，后台填充，WebSocket 推送 status 变化）
- 快照触发：手动创建 或 自动（压测结束后触发）

#### 评分系统
- 直接复用 `pkg/scoring/calculator.go`（range 线性插值 + threshold 条件评分）
- 三级打分：指标 → 用例 → 快照总分（0-100，健康等级 A/B/C/D/F）
- 评分配置：内嵌于快照（专属）+ MongoDB `scoring_templates`（可复用模板）

#### WebSocket 实时推送
- Hub 模式，Topic 格式：`points/{app_id}/{metric}/{level}`
- 聚合完成 → EventPublisher → Hub.Broadcast(topic, data)
- 消息格式：`{ type, topic, data: MetricPoint[], timestamp }`
- 心跳 30s Ping，60s 超时断线

#### Tap 代理
- `httputil.ReverseProxy` 透明转发到 `tap:9090/api/v1/*`
- `TapRegistry`：内存缓存 + 定时从 sonar-store `/apis/v1/taps` 同步
- 路由：`/api/v1/proxy/taps/:tap_id/*`

### 4.3 HTTP API 清单（共 ~31 个）

| 分组 | Method | Path | 说明 |
|------|--------|------|------|
| System | GET | /health | 健康检查 |
| System | GET | /api/v1/status | 聚合引擎状态 |
| Metrics | GET | /api/v1/metrics | 查聚合后数据（本地TSDB） |
| Metrics | GET | /api/v1/metrics/levels | 可用聚合级别 |
| Snapshot | GET | /api/v1/snapshots | 快照列表 |
| Snapshot | POST | /api/v1/snapshots | 创建快照 |
| Snapshot | GET | /api/v1/snapshots/:id | 快照详情 |
| Snapshot | DELETE | /api/v1/snapshots/:id | 删除快照 |
| Snapshot | GET | /api/v1/snapshots/:id/metrics | 快照内指标 |
| Snapshot | GET | /api/v1/snapshots/:id/score | 快照评分结果 |
| Snapshot | POST | /api/v1/snapshots/:id/score | 重新评分 |
| Scoring | GET | /api/v1/scoring/templates | 评分模板列表 |
| Scoring | POST | /api/v1/scoring/templates | 创建模板 |
| Scoring | PUT | /api/v1/scoring/templates/:id | 更新模板 |
| Scoring | DELETE | /api/v1/scoring/templates/:id | 删除模板 |
| Scoring | POST | /api/v1/scoring/preview | 预览评分 |
| Tap | GET | /api/v1/taps | Tap 实例列表（来自sonar-store） |
| Tap | GET | /api/v1/taps/:id | 单个 Tap 信息 |
| Tap Proxy | ANY | /api/v1/proxy/taps/:id/* | 透明代理到 tap:9090 |
| WebSocket | GET | /ws | WebSocket 连接入口 |

---

## 五、前端模块设计（详见 frontend_design.md）

### 5.1 技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| React | 19 | |
| TypeScript | 5.x | |
| Tailwind CSS | v4 | 与 sonar-tap 完全一致 |
| Vite | 7.x | GVE 规范 |
| React Router | v7 | createBrowserRouter |
| TanStack Query | v5 | 服务端数据状态 |
| Zustand | v5 | WS 实时数据缓存 |
| recharts | 3.4 | **与 monitor_hub 一致，无需新增依赖** |
| shadcn/ui | latest | Radix 组件 |
| Hugeicons | | 与 sonar-tap 一致 |

**图表库选型理由**：monitor_hub 已有成熟的 recharts 封装（MetricChartsGrid、AreaChart、虚拟化图例），可直接移植，无需引入 echarts 增加包体积。

### 5.2 路由结构

| 路径 | 页面名 | 功能 |
|------|--------|------|
| / | 重定向 | → /monitor |
| /monitor | 实时监控 | 选 tap + 多指标折线图 + 聚合级别切换 |
| /monitor/:tapId | 指定tap监控 | 同上，锁定tap |
| /snapshots | 快照列表 | 卡片列表 + 评分 + 筛选 |
| /snapshots/:id | 快照详情 | 指标图 + 评分分解 + 原始数据 |
| /taps | Tap 管理 | tap 列表 + 状态 |
| /taps/:id/* | Tap 配置代理 | 复用 sonar-tap 表单组件 |
| /settings | 系统配置 | sonar-view 连接配置 |

### 5.3 实时监控页面布局

```
┌─────────────────────────────────────────────────────────────┐
│ ◉ Sonar View      实时监控                      [重载] [设置]│
├───────────────────┬─────────────────────────────────────────┤
│                   │                                         │
│  TAP 实例         │  时间粒度:  [15s] [1m] [5m] [1h]        │
│  ┌─────────────┐  │  ─────────────────────────────────────  │
│  │● server-001 │  │                                         │
│  │○ server-002 │  │  ┌─────────────────────────────────┐   │
│  │○ server-003 │  │  │  多指标折线图 (recharts)          │   │
│  └─────────────┘  │  │  avg_fps / active_users /        │   │
│                   │  │  latency_ms / node_cpu_ratio     │   │
│  指标筛选         │  └─────────────────────────────────┘   │
│  ┌─────────────┐  │                                         │
│  │✓ avg_fps    │  │  ┌────────┐ ┌────────┐ ┌────────┐      │
│  │✓ active_... │  │  │CPU     │ │MEM     │ │FPS     │      │
│  │✓ latency_ms │  │  │0.32    │ │78.5%   │ │45      │      │
│  │✓ node_cpu.. │  │  │ratio   │ │used    │ │avg     │      │
│  └─────────────┘  │  └────────┘ └────────┘ └────────┘      │
│                   │                                         │
│  连接状态: ● WS   │  Users: 342  Latency: 45ms              │
└───────────────────┴─────────────────────────────────────────┘
```

### 5.4 快照列表页布局

```
┌─────────────────────────────────────────────────────────────┐
│ ◉ Sonar View      快照                          [+ 创建快照]│
├─────────────────────────────────────────────────────────────┤
│  筛选: [全部 tap ▼]  [全部状态 ▼]  [日期范围]              │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐  ┌──────────────────────┐        │
│  │ 压测-20260414-001    │  │ 压测-20260413-002    │        │
│  │ tap: server-001      │  │ tap: server-001      │        │
│  │ 2026-04-14 10:30     │  │ 2026-04-13 18:00     │        │
│  │ 时长: 30min          │  │ 时长: 60min          │        │
│  │ ┌────────────────┐   │  │ ┌────────────────┐   │        │
│  │ │ 评分: 87 / A   │   │  │ │ 评分: 72 / B   │   │        │
│  │ └────────────────┘   │  │ └────────────────┘   │        │
│  │  [查看详情]  [删除]   │  │  [查看详情]  [删除]   │        │
│  └──────────────────────┘  └──────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### 5.5 快照详情页布局

```
┌─────────────────────────────────────────────────────────────┐
│ ← 快照列表   压测-20260414-001   总分: 87/A    [重新评分]   │
├───────────────────────────────────┬─────────────────────────┤
│                                   │                         │
│  指标图表区                        │  评分分解               │
│  ┌─────────────────────────────┐  │  ┌───────────────────┐ │
│  │  avg_fps 折线图 (30min)     │  │  │ avg_fps   90/A    │ │
│  └─────────────────────────────┘  │  │ latency   82/B    │ │
│  ┌─────────────────────────────┐  │  │ users     88/A    │ │
│  │  active_users 折线图        │  │  │ cpu_ratio 85/A    │ │
│  └─────────────────────────────┘  │  └───────────────────┘ │
│  ┌─────────────────────────────┐  │                         │
│  │  latency_ms 折线图          │  │  评分雷达图             │
│  └─────────────────────────────┘  │  ┌───────────────────┐ │
│                                   │  │   (ScoreRadar)    │ │
│  时间范围: 10:30 ~ 11:00          │  └───────────────────┘ │
└───────────────────────────────────┴─────────────────────────┘
```

### 5.6 核心 TypeScript 接口

```typescript
// WebSocket 实时数据流
interface MetricPoint {
  name: string;
  value: number;
  timestamp: number;
  labels: Record<string, string>;
}

interface WSMessage {
  type: 'points' | 'tap_status' | 'snapshot_status' | 'heartbeat';
  topic: string;
  data: MetricPoint[] | TapStatus | SnapshotStatus;
  timestamp: number;
}

// 快照
interface SnapshotMeta {
  id: string;
  name: string;
  tapId: string;
  appId: string;
  startTime: number;
  endTime: number;
  status: 'creating' | 'ready' | 'failed';
  score?: SnapshotScore;
  createdAt: number;
}

interface SnapshotScore {
  total: number;        // 0-100
  grade: 'A'|'B'|'C'|'D'|'F';
  metrics: MetricScore[];
}

// Tap 实例
interface TapInstance {
  id: string;
  appId: string;
  instance: string;    // IP:port
  state: 1|2|3;       // UP/DOWN/UNKNOWN
  lastScrape: number;
}

// 图表组件
interface TimeSeriesChartProps {
  data: MetricPoint[];
  metrics: string[];       // 要展示的指标名
  granularity: '15s'|'1m'|'5m'|'1h'|'6h'|'1d';
  height?: number;
  onBrush?: (range: [number, number]) => void;
}
```

### 5.7 WebSocket Hook

```typescript
function useMonitorStream(tapId: string, metrics: string[], granularity: string) {
  // 返回
  return {
    data: MetricPoint[],      // 最近 N 帧缓冲
    status: 'connecting' | 'connected' | 'disconnected',
    subscribe: (topic: string) => void,
    unsubscribe: (topic: string) => void,
  }
}
```

---

## 六、迭代计划建议

### Sprint 1（后端基础 ~2周）
- [ ] go.mod 初始化，copy pkg (aggregator/storage/scoring/mongodb)
- [ ] 改造 StoreCollector（对接 sonar-store）
- [ ] 聚合引擎启动验证
- [ ] MongoDB 连接 + snapshot_repo
- [ ] WebSocket Hub + 基础推送
- [ ] 基础 HTTP API（健康检查、指标查询、tap列表）

### Sprint 2（快照与评分 ~1.5周）
- [ ] 快照创建/查询完整链路
- [ ] 评分计算（复用 scoring/）
- [ ] 评分模板 CRUD
- [ ] Tap 代理转发

### Sprint 3（前端 ~2周）
- [ ] 项目脚手架（gve init，主题与 sonar-tap 对齐）
- [ ] 路由结构 + 布局骨架（sidebar）
- [ ] WebSocket hook + Zustand store
- [ ] 实时监控页（图表 + 指标卡片 + tap 选择器）
- [ ] 快照列表页

### Sprint 4（前端补全 ~1.5周）
- [ ] 快照详情页（指标回放 + 评分分解）
- [ ] 评分配置管理页
- [ ] Tap 管理代理页（复用 sonar-tap 表单）
- [ ] 整体 UI 打磨

---

## 七、关键决策与风险

| 决策 | 结论 | 风险 |
|------|------|------|
| 聚合引擎复用策略 | 直接 copy monitor_hub/pkg/aggregator/ | 低，算法稳定 |
| 从 sonar-store 拉取 vs 订阅 | HTTP 轮询拉取（QueryDelay=40s） | 延迟略高，可后续改 WS push |
| 图表库 | recharts（monitor_hub 已有） | 低，无新依赖 |
| MongoDB 版本 | 沿用 monitor_hub 的驱动版本 | 低 |
| Tap 管理UI | 纯代理+复用 sonar-tap 组件 | 中，跨项目组件需封装 |
| 快照命名 | "快照"取代"报告"术语 | 低，API 统一用 snapshot |

---

## 八、子文档索引

| 文档 | 路径 | 内容 |
|------|------|------|
| 后端调研报告 | `docs/research/backend_research.md` | monitor_hub pkg 完整分析，复用清单 |
| 前端调研报告 | `docs/research/frontend_research.md` | monitor_hub 前端技术栈，组件清单 |
| 后端架构设计 | `docs/design/backend_design.md` | 模块设计，数据结构，API 清单 |
| 前端架构设计 | `docs/design/frontend_design.md` | 路由，布局草图，TS 接口，组件树 |

---

*Lead 审核意见：四位专家的调研与设计互相印证，方案完整，可进入开发阶段。*
