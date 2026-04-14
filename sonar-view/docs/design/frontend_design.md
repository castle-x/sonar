# sonar-view 前端架构设计文档

> 版本：v2.0 · 日期：2026-04-13  
> 状态：设计稿（待评审）  
> 参考来源：sonar-tap globals.css、sonar-tap package.json、monitor_hub dashboard.tsx、monitor_hub report-detail.tsx

---

## 目录

1. [技术栈决策](#1-技术栈决策)
2. [路由结构](#2-路由结构)
3. [实时监控页布局](#3-实时监控页布局)
4. [快照页布局](#4-快照页布局)
5. [核心 TypeScript 接口](#5-核心-typescript-接口)
6. [WebSocket Hooks 设计](#6-websocket-hooks-设计)
7. [组件树结构](#7-组件树结构)
8. [颜色与主题规范](#8-颜色与主题规范)
9. [状态管理架构](#9-状态管理架构)
10. [数据流设计](#10-数据流设计)
11. [目录结构](#11-目录结构)
12. [开发优先级](#12-开发优先级)

---

## 1. 技术栈决策

### 1.1 核心栈（与 sonar-tap 对齐，遵循 GVE 规范）

| 层次 | 选型 | 版本 | 理由 |
|------|------|------|------|
| UI 框架 | React | ^19.x | 与 sonar-tap 一致 |
| 语言 | TypeScript | ~5.9 | 类型安全，与 tap 共享接口定义 |
| 样式 | Tailwind CSS v4 | ^4.1 | GVE 规范，Two-Layer OKLCH 主题架构 |
| 构建 | Vite | ^7.x | 快速 HMR，与 tap 一致 |
| 路由 | React Router | ^7.x | 与 tap 一致 |
| 组件库 | shadcn/ui + Radix UI | latest | 与 tap 一致，无样式 headless |
| 图标 | @hugeicons/react | ^1.x | 与 tap 一致，stroke-rounded 风格 |
| 字体 | Inter Variable + Manrope Variable | ^5.x | 与 tap globals.css 一致 |
| Lint | Biome | ^2.x | 与 tap 一致 |
| 动效 | motion | ^12.x | 指标卡片过渡、页面切换 |
| 通知 | sonner | ^2.x | 与 tap 一致 |
| 表单 | react-hook-form + zod | latest | 评分配置等表单 |

### 1.2 图表库选型：Recharts（推荐，不选 ECharts）

| 维度 | Recharts | ECharts |
|------|----------|---------|
| React 集成 | 原生 React 组件，props 驱动 | 命令式 API，需 ref + useEffect |
| Bundle 大小 | ~150KB gzip | ~800KB+ gzip |
| Tailwind 主题 | 直接用 CSS 变量填色 | 需手动同步主题变量 |
| sonar-tap 现状 | **已使用 recharts 3.8.0** | 无 |
| monitor_hub 现状 | **已使用 recharts ^3.4.1** | 无 |
| shadcn/ui 集成 | **官方 ChartContainer 支持** | 需自行封装 |
| 自定义 Tooltip | JSX 返回，样式完全可控 | formatter 字符串/HTML |
| 动画控制 | `isAnimationActive={false}` 实时模式关闭 | 有时与 React 生命周期冲突 |

**结论**：整个 sonar 系列统一使用 Recharts。sonar-tap 和 monitor_hub 均已有成熟封装（`MetricChartsGrid`、`AreaChart`、`LineChart`、`ScatterChart`），可直接复用；避免双图表库带来的 bundle 膨胀和主题不一致。

### 1.3 状态管理

| 场景 | 方案 | 理由 |
|------|------|------|
| 服务端数据（HTTP） | **TanStack Query v5** | 缓存、重试、轮询、乐观更新，tap 已用 |
| 服务端数据（WebSocket 实时流） | 自定义 hook + zustand | WS 流数据不适合 Query cache 模型 |
| 全局 UI 状态 | **Zustand v5** | tap 已用，轻量，无 Provider 嵌套 |
| 表单 | React Hook Form + Zod | tap 已用 |
| Toast | Sonner | tap 已用 |

**Zustand stores 划分：**

| Store | 职责 |
|-------|------|
| `useAppStore` | 主题、accent 颜色、侧边栏折叠状态 |
| `useTapStore` | 已注册 tap 实例列表、当前选中 tapId、tap 运行状态 |
| `useMonitorStore` | 粒度选择、图例开关、布局列数、暂停状态 |

---

## 2. 路由结构

```
/
├── /monitor                      实时监控（默认首页）
│   └── /monitor/:tapId           指定 tap 的实时监控
├── /snapshots                    快照列表
│   ├── /snapshots/:id            快照详情
│   └── /snapshots/:id/export     导出专用页（无导航，用于截图/打印）
├── /taps                         Tap 实例管理
│   └── /taps/:tapId              单个 tap 状态 + 远程配置（代理 tap:9090）
├── /stores                       Store 实例管理
├── /scoring                      评分规则模板管理
└── /settings                     全局设置（主题、accent、连接配置）
```

详细路由表：

| 路径 | 页面组件 | 功能描述 |
|------|----------|---------|
| `/` | → redirect `/monitor` | 首页重定向 |
| `/monitor` | `MonitorPage` | 自动选中第一个 tap，展示实时指标图表 |
| `/monitor/:tapId` | `MonitorPage` | 指定 tap 的实时监控，支持粒度切换 |
| `/snapshots` | `SnapshotListPage` | 快照卡片/表格列表，含评分、时间范围、所属 tap |
| `/snapshots/:id` | `SnapshotDetailPage` | 快照详情：图表 + 评分分解 + 描述结论 |
| `/snapshots/:id/export` | `SnapshotExportPage` | 无导航栏的导出视图（打印/截图用） |
| `/taps` | `TapListPage` | Tap 实例列表，状态/版本/最后上报时间 |
| `/taps/:tapId` | `TapDetailPage` | 单个 tap 状态 + 远程配置管理 |
| `/stores` | `StoreListPage` | Store 实例列表 + 健康状态 + 磁盘用量 |
| `/scoring` | `ScoringManagerPage` | 全局评分规则模板，可关联快照 |
| `/settings` | `SettingsPage` | 主题/accent/语言/tap-store 连接配置 |

---

## 3. 实时监控页布局

### 3.1 总体布局（宽屏 ≥1280px）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  HEADER (h-14, sticky top-0, backdrop-blur)                                 │
│  [🔊 Sonar]   Monitor  Snapshots  Taps  Stores              [🌙][设置]      │
└─────────────────────────────────────────────────────────────────────────────┘
┌──────────────┬──────────────────────────────────────────────────────────────┐
│  SIDEBAR     │  MAIN CONTENT                                                │
│  w-56        │                                                              │
│  ────────── ││  ┌────────────────────────────────────────────────────────┐ │
│  TAP 实例    ││  │  TAP INFO BAR                                          │ │
│  ────────── ││  │  tap-prod-01  │ ● Online  │ 🐿 game_srv  │ ⚡ 5/5 地址  │ │
│  ● tap-01   ││  │  最后上报: 3s 前               [15s ▼][👁][⊞]          │ │
│    game_srv ││  └────────────────────────────────────────────────────────┘ │
│             ││                                                              │
│  ● tap-02   ││  ┌──────────────┐ ┌──────────────┐ ┌──────────┐ ┌────────┐ │
│    game_srv ││  │ CPU  72.3%   │ │ MEM  4.2 GB  │ │QPS 1240/s│ │P99 38ms│ │
│             ││  │ ↑ +2.1%      │ │ ↓ -0.3 GB    │ │ ↑ +120   │ │→ stable│ │
│  ○ tap-03   ││  │ [sparkline]  │ │ [sparkline]  │ │[sparkline]│ │[spark] │ │
│    test_srv ││  └──────────────┘ └──────────────┘ └──────────┘ └────────┘ │
│             ││                                                              │
│  ────────── ││  ┌──────────────────────────────────────────────────────┐   │
│  STORE       ││  │  CHARTS GRID  [legend ☑] [cols: 1|2] [label 筛选▼] │   │
│  ────────── ││  │                                                      │   │
│  ■ store-1  ││  │  ┌──────────────────┐  ┌──────────────────────────┐ │   │
│    :8082    ││  │  │ cpu_usage (%)    │  │ mem_usage (GB)           │ │   │
│             ││  │  │ ╭──╮   ╭╮        │  │         ╭──────╮         │ │   │
│             ││  │  │╭╯  ╰─╮╯╰─╮      │  │╭────────╯      ╰─────    │ │   │
│             ││  │  └──────────────────┘  └──────────────────────────┘ │   │
│             ││  │                                                      │   │
│             ││  │  ┌──────────────────────────────────────────────┐   │   │
│             ││  │  │ rtt_avg / rtt_p99 / success_rate (full span) │   │   │
│             ││  │  └──────────────────────────────────────────────┘   │   │
│             ││  └──────────────────────────────────────────────────────┘   │
└──────────────┴──────────────────────────────────────────────────────────────┘
                                                ┌──────────────────────────┐
                                                │ FLOATING FAB (bottom-R)  │
                                                │ [⚙] hover展开:           │
                                                │ [粒度▼][👁图例][⊞布局][↑]│
                                                └──────────────────────────┘
```

### 3.2 侧边栏详细结构

```
┌──────────────────────┐
│  TAP INSTANCES       │
├──────────────────────┤
│ ● tap-prod-01        │  ← 绿点=在线（ping 动画），选中行高亮品牌色
│   game_server        │  ← app_id 副标题，text-muted-foreground
│                      │
│ ● tap-prod-02        │
│   game_server        │
│                      │
│ ○ tap-staging-01     │  ← 灰点=离线（静态）
│   test_server        │
│                      │
├──────────────────────┤
│  STORES              │
├──────────────────────┤
│ ■ store-main         │  ← 方块图标=store 类型
│   localhost:8082     │
└──────────────────────┘
```

### 3.3 顶部 Tap 信息栏

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  tap-prod-01  ╎ ● Online  ╎ 🐿 game_server  ╎ ⚡ 5/5 地址  ╎ 最后: 3s 前    │
│                                                              [工具栏按钮组]   │
└──────────────────────────────────────────────────────────────────────────────┘

工具栏按钮组（与 monitor_hub dashboard.tsx 一致）：
  [历史 ▼ 15s]  [👁 图例]  [⊞ 布局]

  粒度下拉菜单：
  ┌──────────────────┐
  │ ○ 15s  实时滚动  │
  │ ● 1m   近2小时   │  ← 当前选中
  │ ○ 5m   近10小时  │
  │ ○ 1h   近7天     │
  │ ○ 6h   近30天    │
  └──────────────────┘
```

### 3.4 底部指标摘要卡片行

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐
│  CPU             │  │  内存            │  │  网络 RX         │  │  网络 TX       │
│  45.2 %          │  │  6.8 / 16 GB     │  │  12.4 MB/s       │  │  8.1 MB/s      │
│  ↑ +2.1%         │  │  ── 稳定         │  │  ↑ 突增          │  │  ── 稳定       │
└──────────────────┘  └──────────────────┘  └──────────────────┘  └────────────────┘
```

> 摘要卡片仅在粒度 ≤5m（实时模式）时显示，从最新数据点取值。sparkline 高度 40px，无轴无 tooltip，`isAnimationActive={false}`。

---

## 4. 快照页布局

### 4.1 快照列表页

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  HEADER (sticky)                                                            │
└─────────────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────────────┐
│  TOOLBAR                                                                    │
│  [+ 新建快照]         [搜索快照名称...]  [tap实例▼]  [时间范围▼]  [评分≥__]│
└─────────────────────────────────────────────────────────────────────────────┘

列表默认使用表格模式，支持切换卡片模式（[≡][⊞] 切换按钮）：

【表格模式】
┌──────┬──────────────────────┬────────────┬────────┬──────────────┬─────┐
│  #   │ 快照名称             │ 时间范围   │ 时长   │ 评分         │     │
├──────┼──────────────────────┼────────────┼────────┼──────────────┼─────┤
│  1   │ 压测-2026-04-10      │ 14:00~16:30│ 2h 30m │ ████████  92 │  →  │
│  2   │ 压测-2026-04-09      │ 09:30~11:15│ 1h 45m │ ███████   78 │  →  │
│  3   │ 基线-2026-04-08      │ 16:00~19:00│ 3h 00m │ --（未评分）│  →  │
└──────┴──────────────────────┴────────────┴────────┴──────────────┴─────┘
                                                   [← 1  2  3 ... →]

【卡片模式】
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│  ╭──────────────────╮│  │  ╭──────────────────╮│  │  ╭──────────────────╮│
│  │  评分圆环         ││  │  │  评分圆环         ││  │  │  评分圆环         ││
│  │      92          ││  │  │      78          ││  │  │      --          ││
│  │    ★★★★☆         ││  │  │    ★★★☆☆         ││  │  │   待配置         ││
│  ╰──────────────────╯│  │  ╰──────────────────╯│  │  ╰──────────────────╯│
│  压测-2026-04-10      │  │  压测-2026-04-09      │  │  基线-2026-04-08     │
│  tap-prod-01         │  │  tap-prod-01         │  │  tap-prod-02         │
│  时长: 2h 30m        │  │  时长: 1h 45m        │  │  时长: 3h 00m        │
│  [查看详情]  [...]   │  │  [查看详情]  [...]   │  │  [查看详情]  [...]   │
└──────────────────────┘  └──────────────────────┘  └──────────────────────┘
```

### 4.2 快照详情页

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [← 返回列表]  压测-2026-04-10  │  ● 已完成  │  tap-prod-01  │  [重载][导出]│
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  INFO CARD                                                                  │
│  开始: 2026-04-10 14:00   结束: 2026-04-10 16:30   时长: 2h 30m            │
│  tap: tap-prod-01          store: store-main          用例数: 3             │
│  总分: 92 / 100   ████████████████████░░░░   [查看评分详情 ▼]              │
└─────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────┬──┬────────────────────────────────────┐
│  DESCRIPTION CARD (75%)           │▕▏│  CASE OVERVIEW (25%)               │
│                                   │▕▏│                                    │
│  [结论 Markdown 编辑区]           │  │  用例1: 基准测试     ★★★★★  98    │
│  支持富文本（TipTap / 纯文本）    │  │  用例2: 压力测试     ★★★★☆  85    │
│                        [AI分析 ✨]│  │  用例3: 峰值测试     ★★★☆☆  76    │
│                                   │  │                                    │
└───────────────────────────────────┴──┴────────────────────────────────────┘
     ↑ 分隔条可拖动 (40%~85% 宽度范围，与 monitor_hub 一致)

┌─────────────────────────────────────────────────────────────────────────────┐
│  CHARTS CARD                                                                │
│                                                                             │
│  [用例1: 基准测试] [用例2: 压力测试] [用例3: 峰值测试]  ← Tabs / 平铺切换  │
│  ─────────────────────────────────────────────────────                     │
│  ┌──────────────────────┐  ┌──────────────────────────────────────────┐    │
│  │ cpu_usage (%)        │  │ rtt_avg / rtt_p99 / rtt_max              │    │
│  │ ╭────────────────╮   │  │ ╭────────────────────────────────────╮   │    │
│  │ │   折线图        │   │  │ │   多线折线图                        │   │    │
│  │ ╰────────────────╯   │  │ ╰────────────────────────────────────╯   │    │
│  └──────────────────────┘  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  SUMMARY TABLE                                                              │
│  指标          avg      max      min      p99                               │
│  cpu_usage    45.2%    78.5%    12.1%    72.3%                              │
│  rtt_avg      12ms     45ms      8ms     38ms                               │
│  success_rate 99.8%   100.0%    98.2%    99.9%                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  SCORE BREAKDOWN (可折叠 ▼)                                                 │
│                                                                             │
│  指标              权重   原始值   指标分   加权分   区间配置               │
│  ───────────────────────────────────────────────────────────────────────   │
│  cpu_usage         30%    45.2%     88      26.4    [0~50%→100, >80%→0]    │
│  rtt_avg           40%    12ms      95      38.0    [<20ms→100]            │
│  success_rate      30%    99.8%     92      27.6    [>99%→100]             │
│  ───────────────────────────────────────────────────────  总分：92.0       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. 核心 TypeScript 接口

```typescript
// ============================================================
// Tap 实例
// ============================================================

/** Tap 实例注册信息（来自 sonar-view 配置） */
interface TapInstance {
  id: string                        // 唯一标识，如 "tap-prod-01"
  name: string                      // 显示名称
  address: string                   // tap 管理 API 地址，如 "http://192.168.1.10:9090"
  appId: string                     // tap 配置中的 app_id
  storeId: string                   // 该 tap 上报到的 store id
  tags: Record<string, string>      // 自定义标签，如 { env: "prod", region: "cn" }
}

/** Tap 运行时状态（通过代理查询 tap:9090/api/v1/status） */
interface TapStatus {
  tapId: string
  online: boolean
  lastReportAt: number              // Unix timestamp（秒）
  version: string
  uptimeSec: number
  subsystems: {
    nodeExporter: boolean
    processExporter: boolean
    logWatcher: boolean
  }
  watcherStats: {
    activeFiles: number
    totalLines: number
    errorCount: number
  }
}

// ============================================================
// Store 实例
// ============================================================

interface StoreInstance {
  id: string
  name: string
  address: string                   // store HTTP 地址，如 "http://store:8082"
}

interface StoreStatus {
  storeId: string
  healthy: boolean
  totalSeries: number
  diskUsageBytes: number
  retentionDays: number
  totalSamples: number
  latencyMs: number
  lastCheckAt: number
}

// ============================================================
// 实时监控数据
// ============================================================

/** 聚合粒度级别 */
type GranularityName = "15s" | "30s" | "1m" | "5m" | "1h" | "6h" | "1d"

interface GranularityLevel {
  name: GranularityName
  displayLabel: string              // 如 "近2小时"
  interval: string                  // 如 "1m 间隔"
  retentionMs: number               // 保留时长（毫秒）
  refreshIntervalMs: number         // 自动刷新间隔（毫秒）
  queryWindowMs: number             // 查询时间窗口（毫秒）
  maxPoints: number                 // 前端保留最大数据点数（环形缓冲）
}

/** 单个指标的聚合数据点 */
interface AggregatedPoint {
  name: string                      // 指标名，如 "cpu_usage"
  timestamp: number                 // Unix timestamp（秒）
  value: number
  aggregationType: "avg" | "min" | "max" | "count" | "last"
  labels: Record<string, string>    // 如 { process: "GameServer", server_id: "01" }
}

/** 指标图表显示配置（来自 sonar-store 的 groupmap） */
interface MetricConfig {
  name: string
  alias?: string                    // 显示名称
  description?: string
  unit?: string                     // 如 "%" | "bytes" | "ms"
  transform?: string                // 如 "/ 1024 / 1024"（转 MB）
  displayLabels?: string[]          // 只显示的标签键
  columnSpan?: "full" | "half"
}

/** 汇总表格（快照详情底部） */
interface SummaryTable {
  metricName: string
  rows: Array<{
    labels: Record<string, string>
    avg: number
    max: number
    min: number
    p99?: number
    count: number
  }>
}

// ============================================================
// 快照（Snapshot）
// ============================================================

/** 快照元数据（列表展示） */
interface SnapshotMeta {
  id: string
  name: string
  tapId: string
  tapName: string
  storeId: string
  startTime: number                 // Unix timestamp（秒）
  endTime: number
  durationSec: number
  status: "completed" | "running" | "failed"
  score?: number                    // 0-100，未配置评分时为 undefined
  caseCount: number
  createdAt: number
  updatedAt: number
}

/** 快照详情（详情页） */
interface SnapshotDetail extends SnapshotMeta {
  description?: string              // Markdown 描述/结论
  cases: SnapshotCase[]
  scoringConfig?: ScoringConfig
  scoreBreakdown?: ScoreBreakdown
  extraInfo?: Record<string, string>
}

/** 压测用例 */
interface SnapshotCase {
  id: string
  name: string
  startTime: number
  endTime: number
  score?: number
  description?: string
}

// ============================================================
// 评分系统
// ============================================================

interface ScoringConfig {
  id: string
  name: string
  defaultConfig: {
    metricConfigs: MetricScoringConfig[]
  }
  caseConfigs?: Record<string, { metricConfigs: MetricScoringConfig[] }>
}

interface MetricScoringConfig {
  metricName: string
  weight: number                    // 权重，所有指标 weight 之和应为 100
  scoringType: "range" | "threshold"
  ranges?: Array<{
    min?: number
    max?: number
    score: number
  }>
  threshold?: {
    value: number
    direction: "above" | "below"    // above=高于阈值得满分
    fullScore: number
    zeroScore: number
  }
  aggregationType: "avg" | "max" | "p99"
}

interface ScoreBreakdown {
  totalScore: number
  metricScores: Array<{
    metricName: string
    weight: number
    rawValue: number
    metricScore: number             // 0-100
    weightedScore: number
  }>
}

// ============================================================
// WebSocket 消息协议
// ============================================================

type WSConnectionStatus = "connecting" | "connected" | "disconnected" | "error"

interface WSSubscribeMessage {
  action: "subscribe" | "unsubscribe"
  topic: "tap_status" | "store_status" | "metric_stream"
  params: {
    tapIds?: string[]
    storeIds?: string[]
    metricNames?: string[]
    granularity?: GranularityName
  }
}

interface WSPushMessage<T = unknown> {
  topic: string
  payload: T
  timestamp: number
}
```

---

## 6. WebSocket Hooks 设计

### 6.1 底层 WebSocket 客户端（单例）

```typescript
// lib/websocket-client.ts

type MessageHandler<T> = (payload: T) => void
type Unsubscribe = () => void

class SonarWSClient {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<MessageHandler<unknown>>>()
  private statusListeners = new Set<(s: WSConnectionStatus) => void>()
  private reconnectAttempts = 0
  private readonly RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000] // 指数退避

  connect(): Promise<void> { /* ... */ }
  disconnect(): void { /* ... */ }
  send(msg: WSSubscribeMessage): void { /* ... */ }

  /** 注册 topic 消息处理器，返回取消函数 */
  on<T>(topic: string, handler: MessageHandler<T>): Unsubscribe {
    // 注册监听，返回取消函数
  }

  onStatusChange(cb: (s: WSConnectionStatus) => void): Unsubscribe { /* ... */ }
}

// 全局单例，通过 React Context 注入，避免多实例
export const sonarWSClient = new SonarWSClient()
```

### 6.2 实时监控 Stream Hook

```typescript
// hooks/use-monitor-stream.ts

interface UseMonitorStreamOptions {
  tapId: string
  metricNames?: string[]            // 不传则订阅全部
  granularity: GranularityName
  enabled?: boolean                 // 默认 true，false 时暂停订阅
}

interface UseMonitorStreamResult {
  /** 按指标名分组的数据点（滑动窗口内） */
  data: Map<string, AggregatedPoint[]>
  wsStatus: WSConnectionStatus
  lastUpdateAt: number | null
  isPaused: boolean
  pause: () => void
  resume: () => void
  reconnect: () => void
}

function useMonitorStream(options: UseMonitorStreamOptions): UseMonitorStreamResult {
  const { tapId, metricNames, granularity, enabled = true } = options
  const [data, setData] = useState<Map<string, AggregatedPoint[]>>(new Map())
  const [wsStatus, setWsStatus] = useState<WSConnectionStatus>("disconnected")
  const [isPaused, setIsPaused] = useState(false)
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null)

  useEffect(() => {
    if (!enabled || isPaused) return

    const unsubStatus = sonarWSClient.onStatusChange(setWsStatus)

    const unsubData = sonarWSClient.on<WSPushMessage<AggregatedPoint[]>>(
      `metric_stream:${tapId}`,
      (msg) => {
        setLastUpdateAt(Date.now())
        setData(prev => {
          const next = new Map(prev)
          const config = GRANULARITY_CONFIG[granularity]
          const cutoffSec = Date.now() / 1000 - config.queryWindowMs / 1000

          for (const point of msg.payload) {
            const existing = next.get(point.name) ?? []
            // 滑动窗口：裁剪过期数据，限制最大点数
            const filtered = [
              ...existing.filter(p => p.timestamp > cutoffSec),
              point,
            ].slice(-config.maxPoints)
            next.set(point.name, filtered)
          }
          return next
        })
      }
    )

    sonarWSClient.send({
      action: "subscribe",
      topic: "metric_stream",
      params: { tapIds: [tapId], metricNames, granularity },
    })

    return () => {
      sonarWSClient.send({
        action: "unsubscribe",
        topic: "metric_stream",
        params: { tapIds: [tapId] },
      })
      unsubStatus()
      unsubData()
    }
  }, [tapId, granularity, enabled, isPaused])

  return {
    data,
    wsStatus,
    lastUpdateAt,
    isPaused,
    pause: () => setIsPaused(true),
    resume: () => setIsPaused(false),
    reconnect: () => sonarWSClient.connect(),
  }
}
```

### 6.3 粒度与数据缓冲策略

```
granularity   queryWindow    maxPoints   refreshMode    refreshInterval
──────────────────────────────────────────────────────────────────────
15s           30 min         120 点      WS push        15s 推送
1m            2 hour         120 点      WS push        1m 推送
5m            10 hour        120 点      HTTP poll      5m 轮询
1h            7 day          168 点      HTTP poll      10m 轮询
6h            30 day         120 点      HTTP poll      30m 轮询
1d            1 year         365 点      HTTP poll      1h 轮询
```

**推拉策略**：
- `15s/1m`：WS 推送实时增量 → 前端维护滑动窗口（实时看板模式）
- `5m/1h/6h/1d`：TanStack Query `refetchInterval` HTTP pull → 全量替换

### 6.4 Tap 状态订阅 Hook

```typescript
// hooks/use-tap-status.ts

interface UseTapStatusResult {
  statuses: Map<string, TapStatus>  // tapId → status
  wsStatus: WSConnectionStatus
}

/** 订阅多个 tap 的在线/离线状态，适合侧边栏实时指示点 */
function useTapStatus(tapIds: string[]): UseTapStatusResult {
  // 订阅 tap_status topic，接收批量状态推送
}
```

### 6.5 快照历史数据 Hook（HTTP，非 WS）

```typescript
// hooks/use-snapshot-metrics.ts

interface UseSnapshotMetricsOptions {
  snapshotId: string
  caseId?: string                   // 不传则查整个快照时段
  granularity?: GranularityName
}

function useSnapshotMetrics(options: UseSnapshotMetricsOptions) {
  // 快照数据不可变，staleTime = Infinity
  return useQuery({
    queryKey: queryKeys.snapshots.metrics(options.snapshotId, options.caseId),
    queryFn: () => fetchSnapshotMetrics(options),
    staleTime: Infinity,
  })
}
```

---

## 7. 组件树结构

```
App
├── ThemeProvider (next-themes, defaultTheme="system", data-accent="emerald")
├── QueryClientProvider (TanStack Query)
├── Toaster (Sonner)
└── RouterProvider
    │
    ├── RootLayout（有导航，适用绝大多数页面）
    │   ├── AppHeader (h-14, sticky, backdrop-blur)
    │   │   ├── Logo ("🔊 Sonar")
    │   │   ├── NavLinks (Monitor / Snapshots / Taps / Stores)
    │   │   ├── ModeToggle (light/dark/system)
    │   │   └── AccentPicker (emerald / sapphire / neutral)
    │   ├── AppSidebar（仅 /monitor 路由显示）
    │   │   ├── TapInstanceList
    │   │   │   └── TapInstanceItem[]
    │   │   │       ├── StatusDot (ping 动画 / 静态)
    │   │   │       ├── TapName
    │   │   │       └── AppIdSubtitle
    │   │   └── StoreList
    │   │       └── StoreItem[]
    │   └── PageContent (router outlet)
    │
    ├── MonitorPage (/monitor/:tapId?)
    │   ├── TapInfoBar
    │   │   ├── TapName + StatusBadge (ping 动画)
    │   │   ├── SystemInfoItems (app_id、地址数、最后上报)
    │   │   └── ToolbarButtons (GranularityDropdown / LegendToggle / GridColsToggle)
    │   ├── MetricSummaryBar（粒度 ≤5m 时显示）
    │   │   └── MetricSummaryCard[] (CPU/MEM/QPS/P99 + sparkline)
    │   ├── MetricChartsGrid（复用自 monitor_hub）
    │   │   └── MetricChartCard[]
    │   │       ├── ChartHeader (指标名/单位/聚合类型/标签筛选)
    │   │       ├── RechartsLineChart | RechartsAreaChart
    │   │       └── ChartLegend
    │   └── FloatingFAB（悬浮工具栏，hover 展开，参考 dashboard.tsx）
    │
    ├── SnapshotListPage (/snapshots)
    │   ├── SnapshotToolbar (搜索/筛选/新建/视图切换)
    │   ├── SnapshotTableView | SnapshotGridView（条件渲染）
    │   │   ├── SnapshotTableRow[] (表格模式)
    │   │   │   └── ScoreProgressBar
    │   │   └── SnapshotCard[] (卡片模式)
    │   │       ├── ScoreRingChart (Recharts RadialBarChart)
    │   │       └── SnapshotMetaInfo
    │   └── Pagination
    │
    ├── SnapshotDetailPage (/snapshots/:id)
    │   ├── SnapshotDetailHeader (返回/标题/状态/操作)
    │   ├── SnapshotInfoCard (基本信息 + 总分进度条)
    │   ├── ResizablePanelGroup（与 report-detail.tsx 一致）
    │   │   ├── DescriptionCard (Markdown 编辑 + AI 按钮)
    │   │   ├── ResizeHandle (可拖动分隔条，40%~85%)
    │   │   └── CaseOverviewCard (用例评分列表，折叠)
    │   ├── SnapshotChartsCard
    │   │   ├── CaseTabs | CaseFlatView（切换）
    │   │   └── MetricChartsGrid（复用监控页同组件）
    │   ├── SummaryTablesCard
    │   └── ScoreBreakdownCard (可折叠，指标权重/原始值/分项得分)
    │
    ├── TapListPage (/taps)
    │   ├── TapTable (TanStack Table，含版本/状态/最后上报)
    │   └── AddTapDialog
    │
    ├── TapDetailPage (/taps/:tapId)
    │   ├── TapStatusCard
    │   └── TapConfigProxy（代理转发 tap:9090 API，与 sonar-tap UI 同构）
    │
    ├── StoreListPage (/stores)
    │   └── StoreTable (健康状态/磁盘/序列数/延迟)
    │
    ├── ScoringManagerPage (/scoring)
    │   ├── ScoringTemplateList
    │   └── ScoringConfigEditor (权重/评分类型/区间配置)
    │
    └── SettingsPage (/settings)
        ├── ThemeSection (light/dark/system + accent)
        ├── ConnectionSection (tap/store 地址列表配置)
        └── LanguageSection

    SnapshotExportPage (/snapshots/:id/export)（无 RootLayout）
    └── ExportableSnapshotView（打印/截图优化布局）
```

### 7.1 共享组件（`site/src/shared/`）

```
shared/
├── charts/
│   ├── MetricChartsGrid        ← 核心复用：监控页 + 快照页共用
│   ├── MetricChartCard         ← 单指标图表（Header + Recharts + Legend）
│   ├── RechartsLineChart       ← 纯展示，接受 chartData + seriesConfigs
│   ├── RechartsAreaChart
│   ├── ScoreRingChart          ← 评分圆环（Recharts RadialBarChart）
│   ├── Sparkline               ← 40px 迷你无轴折线图
│   └── SummaryTablesCard
├── layout/
│   ├── AppHeader
│   ├── AppSidebar
│   └── FloatingFAB             ← 悬浮球工具栏（参考 dashboard.tsx 实现）
├── tap/
│   ├── StatusDot               ← 在线 ping 动画 / 离线静态
│   ├── TapInstanceItem
│   └── TapInfoBar
└── score/
    ├── ScoreBreakdownCard
    ├── ScoreProgressBar
    └── ScoringConfigEditor
```

---

## 8. 颜色与主题规范

### 8.1 主题架构（完整继承 sonar-tap globals.css）

sonar-view **完整复制** sonar-tap 的 `globals.css`，包含：
- **Two-Layer OKLCH 架构**：Layer 1 ~11 个 Primitive Core Token + Layer 2 shadcn 别名
- **Light/Dark 双主题**
- **Emerald / Sapphire / Neutral 三套 accent**
- **滚动条样式（6px，透明背景）**

**默认 accent：`emerald`**（与 sonar-tap 保持品牌一致）

### 8.2 sonar-view 新增语义色（监控/评分专用）

```css
/* 在 globals.css 中追加，覆盖 emerald accent 下的语义色 */
[data-accent="emerald"] {
  /* 状态语义色（tap/store 在线状态指示） */
  --status-online:    oklch(0.76 0.18 143);   /* 翠绿，在线/健康 */
  --status-offline:   oklch(0.57 0.24 27);    /* 深红，离线/异常 */
  --status-degraded:  oklch(0.79 0.18 74);    /* 琥珀黄，降级/警告 */
  --status-unknown:   oklch(0.55 0 0);        /* 灰，未知 */

  /* 评分语义色（快照评分展示） */
  --score-excellent:  oklch(0.76 0.18 143);   /* 90-100，绿 */
  --score-good:       oklch(0.79 0.15 176);   /* 70-89，青绿 */
  --score-fair:       oklch(0.79 0.18 74);    /* 50-69，黄 */
  --score-poor:       oklch(0.57 0.24 27);    /* 0-49，红 */
}
```

### 8.3 监控图表配色（多 series 确定性分配）

延续 monitor_hub dashboard.tsx 的 HSL 哈希算法，基础色相映射：

```
色相   0° → 红系     → 错误率、失败数、danger 指标
色相  45° → 橙黄     → 延迟、RTT、响应时间
色相 131° → 翠绿     → 成功率、吞吐量（Emerald 品牌色系）
色相 180° → 青色     → 网络 RX、接收带宽
色相 210° → 蓝色     → CPU、内存（系统资源）
色相 270° → 紫色     → 磁盘、IO、进程数
```

**多 series 算法**：`color = hsl(baseHue ± offset, 35%~50%, 55%~65%)`，基于 `seriesKey` 字符串哈希确定性分配，同一指标在刷新后保持颜色不变。

### 8.4 快照评分圆环配色

```typescript
function getScoreColor(score: number): string {
  if (score >= 90) return "var(--score-excellent)"   // 绿
  if (score >= 70) return "var(--score-good)"        // 青绿
  if (score >= 50) return "var(--score-fair)"        // 黄
  return "var(--score-poor)"                         // 红
}
```

### 8.5 状态指示点规范

```
在线（animate-ping 双层）：
  outer: animate-ping  oklch(0.76 0.18 143 / 75%)  animationDuration: 1.5s
  inner: 实心圆        oklch(0.76 0.18 143)

降级（animate-pulse）：
  var(--status-degraded)    animationDuration: 2s

离线（静态）：
  var(--status-offline)

未知（静态）：
  var(--status-unknown)
```

### 8.6 字体规范（与 sonar-tap 完全一致）

```
Manrope Variable  → 页面标题、卡片标题、大数字（--font-headline）
Inter Variable    → 正文、数据、标签、代码（--font-body）

所有数字展示列：font-variant-numeric: tabular-nums  （保证列对齐）
```

---

## 9. 状态管理架构

### 9.1 Zustand Stores

```typescript
// stores/use-app-store.ts
interface AppState {
  theme: "light" | "dark" | "system"
  accent: "emerald" | "sapphire" | "neutral"
  sidebarCollapsed: boolean
  setTheme(t: AppState["theme"]): void
  setAccent(a: AppState["accent"]): void
  toggleSidebar(): void
}

// stores/use-tap-store.ts
interface TapStoreState {
  taps: TapInstance[]
  selectedTapId: string | null
  tapStatuses: Map<string, TapStatus>
  setTaps(taps: TapInstance[]): void
  setSelectedTap(id: string): void
  updateTapStatus(id: string, status: TapStatus): void
}

// stores/use-monitor-store.ts
interface MonitorStoreState {
  granularity: GranularityLevel
  legendVisible: boolean
  gridCols: 1 | 2
  isPaused: boolean
  // 每个 tapId 独立记住粒度偏好
  tapGranularityPrefs: Record<string, GranularityName>
  setGranularity(g: GranularityLevel): void
  toggleLegend(): void
  toggleGridCols(): void
  togglePause(): void
}
```

### 9.2 TanStack Query Key 工厂

```typescript
// lib/query-keys.ts
export const queryKeys = {
  taps: {
    all: ()           => ["taps"] as const,
    detail: (id: string) => ["taps", id] as const,
    status: (id: string) => ["taps", id, "status"] as const,
    config: (id: string) => ["taps", id, "config"] as const,
  },
  snapshots: {
    all: (filters?: object) => ["snapshots", filters] as const,
    detail: (id: string)    => ["snapshots", id] as const,
    metrics: (id: string, caseId?: string) =>
      ["snapshots", id, "metrics", caseId] as const,
  },
  stores: {
    all: ()              => ["stores"] as const,
    status: (id: string) => ["stores", id, "status"] as const,
  },
  scoring: {
    templates: ()        => ["scoring", "templates"] as const,
    template: (id: string) => ["scoring", "templates", id] as const,
  },
}
```

---

## 10. 数据流设计

### 10.1 实时监控数据流

```
sonar-store (Prometheus TSDB)
      ↑ HTTP pull（每 5s 聚合新点，存 TSDB）
sonar-view backend
      ↓ WebSocket push（粒度 15s/1m 时推送增量点到前端）
useMonitorStream hook
      ↓ 维护滑动窗口 Map<metricName, AggregatedPoint[]>
      ↓ 裁剪过期数据，限制 maxPoints
MetricChartsGrid（从 useMonitorStore 获取粒度/图例/布局）
      ↓ useMemo 按时间戳对齐，构建 chartData[]
RechartsLineChart（isAnimationActive={false}，requestAnimationFrame）
```

### 10.2 快照历史数据流

```
sonar-store (TSDB + 快照存储)
      ↑ HTTP 一次性加载（点击详情页触发）
TanStack Query（staleTime: Infinity，快照数据不变）
      ↓ 缓存，切换 case tab 无需重新请求
SnapshotDetailPage
      ├── MetricChartsGrid (复用监控页组件，时间范围固定)
      └── ScoreBreakdownCard (纯 JS 计算，无额外请求)
```

### 10.3 Tap 远程配置代理流

```
TapDetailPage（前端 React）
      ↓ HTTP 请求 view 后端（如 GET /api/v1/proxy/taps/:tapId/config）
sonar-view backend（透明代理层）
      ↓ HTTP 转发（附加认证头，隐藏 tap 内网地址）
tap:9090/api/v1/config
      ↑ 响应透传回前端

优势：
  - 前端无需知道 tap 内网 IP，避免 CORS
  - 认证/鉴权统一在 view 后端处理
  - 与 CLAUDE.md 架构设计一致：view → proxy → tap:9090/api/v1/*
```

---

## 11. 目录结构

```
sonar-view/site/src/
├── app/
│   ├── App.tsx                   # ThemeProvider + QueryClient + Router + Toaster
│   ├── main.tsx
│   └── styles/
│       └── globals.css           # 完整复制 sonar-tap globals.css + view 新增语义色
│
├── routes/                       # 页面级组件（对应路由）
│   ├── monitor/
│   │   └── MonitorPage.tsx
│   ├── snapshots/
│   │   ├── SnapshotListPage.tsx
│   │   ├── SnapshotDetailPage.tsx
│   │   └── SnapshotExportPage.tsx
│   ├── taps/
│   │   ├── TapListPage.tsx
│   │   └── TapDetailPage.tsx
│   ├── stores/
│   │   └── StoreListPage.tsx
│   ├── scoring/
│   │   └── ScoringManagerPage.tsx
│   └── settings/
│       └── SettingsPage.tsx
│
├── shared/                       # 跨路由共享组件
│   ├── charts/
│   │   ├── MetricChartsGrid.tsx
│   │   ├── MetricChartCard.tsx
│   │   ├── RechartsLineChart.tsx
│   │   ├── RechartsAreaChart.tsx
│   │   ├── ScoreRingChart.tsx
│   │   ├── Sparkline.tsx
│   │   └── SummaryTablesCard.tsx
│   ├── layout/
│   │   ├── AppHeader.tsx
│   │   ├── AppSidebar.tsx
│   │   └── FloatingFAB.tsx
│   ├── tap/
│   │   ├── StatusDot.tsx
│   │   ├── TapInstanceItem.tsx
│   │   └── TapInfoBar.tsx
│   └── score/
│       ├── ScoreBreakdownCard.tsx
│       ├── ScoreProgressBar.tsx
│       └── ScoringConfigEditor.tsx
│
├── hooks/
│   ├── use-monitor-stream.ts     # WS 实时数据（滑动窗口）
│   ├── use-tap-status.ts         # WS tap 在线状态订阅
│   └── use-snapshot-metrics.ts  # HTTP 快照历史数据
│
├── stores/
│   ├── use-app-store.ts
│   ├── use-tap-store.ts
│   └── use-monitor-store.ts
│
├── lib/
│   ├── websocket-client.ts       # WS 单例客户端（指数退避重连）
│   ├── query-keys.ts             # TanStack Query key 工厂
│   ├── metric-utils.ts           # 单位转换、transform、formatBytes
│   ├── granularity-config.ts     # GRANULARITY_CONFIG 常量表
│   └── utils.ts                  # cn()、formatDate 等
│
└── apis/                         # HTTP API 客户端（gve api generate 生成）
    ├── tap.ts
    ├── snapshot.ts
    ├── store.ts
    └── scoring.ts
```

---

## 12. 开发优先级

```
Phase 1 — 基础框架（MVP）
  ✦ 复制 sonar-tap globals.css，建立 Two-Layer OKLCH 主题
  ✦ AppHeader + AppSidebar + 路由框架
  ✦ MonitorPage 静态骨架（指标卡片 + 图表网格，REST 拉取）
  ✦ SnapshotListPage 基础表格

Phase 2 — 核心功能
  ✦ WebSocket 客户端单例 + useMonitorStream hook
  ✦ Tap 实例选择 + 粒度切换 + FloatingFAB
  ✦ SnapshotDetailPage（图表 + 评分进度条 + 可拖动分隔面板）
  ✦ SummaryTablesCard

Phase 3 — 完善功能
  ✦ 评分圆环图（ScoreRingChart）
  ✦ 评分分解卡片（ScoreBreakdownCard）
  ✦ Tap 远程配置管理（代理页）
  ✦ ScoringManagerPage（评分规则配置）
  ✦ 导出页（SnapshotExportPage）

Phase 4 — 打磨
  ✦ accent 主题切换（emerald/sapphire/neutral）
  ✦ 暗色模式适配验证
  ✦ 大数据量性能优化（useTransition + 压缩数据索引，参考 dashboard.tsx）
  ✦ 表格虚拟化（快照列表大量数据时）
  ✦ i18n（中英双语，react-i18next，与 tap 一致）
```
