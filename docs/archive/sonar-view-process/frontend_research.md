# monitor_hub 前端深度调研报告

> 调研对象：`/Users/castlexu/github/sonar/.legacy/monitor_hub/site/`  
> 调研日期：2026-04-13  
> 调研人：Expert-B

---

## 一、前端技术栈清单

### 核心框架
| 技术 | 版本 | 说明 |
|------|------|------|
| React | ^19.2.1 | 主框架，使用 memo + hooks |
| TypeScript | ^5.9.2 | 全面类型化 |
| Vite | ^7.1.3 | 构建工具，@vitejs/plugin-react-swc |
| Tailwind CSS | ^4.1.12 | 纯 Tailwind 样式，无独立 CSS 文件 |

### UI 组件
| 技术 | 版本 | 说明 |
|------|------|------|
| Radix UI | 全套 | 无障碍原始组件（Dialog, Dropdown, Tabs, Tooltip, Select 等） |
| lucide-react | ^0.452.0 | 图标库 |
| class-variance-authority | ^0.7.1 | 组件变体管理 |
| tailwind-merge | ^3.3.1 | 类名合并 |
| cmdk | ^1.1.1 | Command Palette 组件 |

### 图表库
| 技术 | 版本 | 说明 |
|------|------|------|
| recharts | ^3.4.1 | **唯一图表库**，折线图/面积图/散点图 |
| d3-time | ^3.1.0 | 时间刻度辅助（X 轴时间格式化） |

### 状态管理
| 技术 | 版本 | 说明 |
|------|------|------|
| nanostores | ^0.11.4 | 原子化状态（无 Redux/Zustand） |
| @nanostores/react | ^0.7.3 | React 绑定（useStore hook） |
| @nanostores/router | ^0.11.0 | **路由即状态**，$router 是 atom |

### 数据通信
| 技术 | 说明 |
|------|------|
| WebSocket（原生） | 自研 WebSocketClient 封装（非第三方库） |
| fetch API | HTTP 请求，无 axios/react-query |
| @lingui/core + @lingui/react | i18n 支持 |

### 富文本/编辑器
| 技术 | 版本 | 说明 |
|------|------|------|
| @tiptap/react | ^3.12.0 | 报告描述的富文本编辑器 |
| @tiptap 全套扩展 | ^3.12.x | 表格、代码高亮、链接、任务列表等 |
| marked / react-markdown | — | Markdown 渲染 |

### 表格与虚拟化
| 技术 | 版本 | 说明 |
|------|------|------|
| @tanstack/react-table | ^8.21.3 | 高性能表格（排序/过滤/分页） |
| @tanstack/react-virtual | ^3.13.12 | 虚拟滚动（大列表优化） |

### 其他
| 技术 | 版本 | 说明 |
|------|------|------|
| @dnd-kit/core + sortable | — | 拖拽排序 |
| ai | ^5.0.106 | AI SDK 集成（报告 AI 分析） |
| @playwright/test | — | 端到端测试 |

---

## 二、路由结构与页面列表

路由方案：`@nanostores/router`（`createRouter`），**不使用 React Router**，路由状态即 nanostores atom。

```
路由表（src/components/router.tsx）

/                           → home.tsx                    数据源列表 + 报告表格（首页）
/dashboard/:id              → dashboard.tsx               数据源详情 + 实时监控图表
/report/:id                 → report-detail.tsx           测试报告详情
/report/:id/export          → report-export.tsx           报告导出（截图优化版）
/task                       → task-list.tsx               测试任务列表
/task/:id                   → task-detail.tsx             测试任务详情
/task/:id/share             → （只读分享页）
/scoring-manager            → report-scoring-manager.tsx  评分配置管理
/files                      → file-manager.tsx            文件管理
/test                       → test.tsx                   WebSocket 测试页（开发用）
/chart-test                 → chart-test.tsx             图表组件测试页（开发用）
/demo/analysis              → demo-page-1.tsx            演示页面
/demo/settings              → demo-page-2.tsx            演示页面
```

### 页面分类
- **实时监控相关**：`/dashboard/:id`
- **测试报告相关**：`/report/:id`、`/report/:id/export`、`/task`、`/task/:id`
- **配置管理相关**：`/scoring-manager`
- **数据管理相关**：`/`（首页）、`/files`

---

## 三、实时监控功能（Dashboard 页面）

### 3.1 数据来源：HTTP 轮询（主）+ WebSocket（辅）

Dashboard 页面（`/dashboard/:id`）使用**两种数据通道并存**：

| 数据 | 通道 | API |
|------|------|-----|
| 指标图表数据（points） | **HTTP 定时轮询** | `POST /apis/v1/points/query` |
| Pushgateway 健康状态 | **WebSocket 订阅** | topic: `datasource.status` |

轮询间隔与聚合级别绑定：
```
15s 级别 → 15秒刷新      1m 级别  → 1分钟刷新
5m 级别  → 5分钟刷新      30m 级别 → 30分钟刷新
1h 级别  → 1小时刷新      6h 级别  → 6小时刷新
```

### 3.2 聚合级别与时间范围（`src/config/aggregation.ts`）

| 级别名 | 采样间隔 | 数据保留 | 数据来源 |
|--------|----------|----------|----------|
| 15s    | 15秒     | 30分钟   | 原始数据 |
| 1m     | 1分钟    | 2小时    | 15s 聚合 |
| 5m     | 5分钟    | 12小时   | 1m 聚合  |
| 30m    | 30分钟   | 24小时   | 5m 聚合  |
| 1h     | 1小时    | 7天      | 30m 聚合 |
| 6h     | 6小时    | 30天     | 1h 聚合  |

默认选中 **15s** 级别（保留30分钟）。查询时自动减去 60s query delay 避免读到未完全聚合的数据。

### 3.3 图表类型

| 类型 | 组件文件 | 使用场景 |
|------|----------|----------|
| 面积图（默认） | `area-chart.tsx` | 大多数连续指标（CPU、内存、RTT等） |
| 折线图 | `line-chart.tsx` | 报告详情对比图 |
| 散点图 | `scatter-chart.tsx` | 稀疏/随机触发指标（日志频率等） |
| 汇总表格 | `summary-tables-card.tsx` | 多机器多指标横向对比 |

图表类型通过数据源配置的 `chart_type` 字段（`'area'` | `'scatter'`）控制，每个指标独立配置。

### 3.4 指标展示结构

指标按**分组（groupmap）**展示，支持自定义排序（`groupmap_sort_keys`）：

```
数据源配置
  └── groupmap: {
        "CPU":     [cpu_usage, cpu_iowait, ...],
        "Memory":  [mem_used, mem_cache, ...],
        "Network": [net_rx, net_tx]
      }
  └── groupmap_sort_keys: ["CPU", "Memory", "Network"]
```

未配置的指标自动放入 "default" 组排在最后。每个指标支持：
- `alias`: 显示名称别名
- `unit`: 单位（`%`、`MB`、`ms`）
- `transform`: 值转换表达式（如 `value/1024`、`value*100`）
- `display_labels`: 图例显示的标签键（不影响数据唯一性）
- `column_span`: `full`（整行）或 `half`（半行）
- `chart_type`: `area`（默认）或 `scatter`

### 3.5 浮动工具栏

右下角悬浮球，hover 展开：
- **聚合级别选择器**（Dropdown）
- **图例显示/隐藏**（Toggle Button）
- **布局切换**：2列网格 ↔ 1列平铺
- **回到顶部**

---

## 四、测试报告功能（Report）

### 4.1 报告列表页（首页 `/`）

`ReportTable` 组件（TanStack Table 实现）：
- 支持排序、过滤、分页
- **高级筛选对话框**（`advanced-filter-dialog.tsx`）
- 列信息：报告名、数据源、用例数、总评分、创建时间、状态

### 4.2 报告详情页（`/report/:id`）

左右可拖拽分栏（默认 75%:25%）：
- **左面板**：
  - `ReportDetailCard`：基本信息（名称/时间/状态/标签）
  - `DescriptionCard`：富文本描述 + AI 分析展开面板（Tiptap 编辑器）
  - `CaseOverviewCard`：用例概览（tabs 或 flat 两种视图模式）
  - `ReportChartsCard`：指标图表分析（多级别对比）
  - `CaseSummaryTablesCard`：用例汇总表格
- **右面板**：
  - `ReportStatsCards`：统计摘要卡片
  - `CaseRateStatistics`：成功率/失败率统计

### 4.3 评分展示（`ReportScoreDetailDialog`）

- 每个指标有独立权重
- 支持 `range`（范围评分）和 `threshold`（阈值评分）两种方式
- 加权汇总总分（0-100）
- 评分配置在独立页面 `/scoring-manager` 管理

### 4.4 报告导出

专用导出页 `/report/:id/export`（截图优化版，移除所有交互元素，适合打印/截图/PDF）。

### 4.5 报告相关 API

```typescript
// src/apis/report.ts
createReport()        // 创建报告（异步生成任务）
getReport(id)         // 获取报告详情
listReports(query)    // 报告列表（分页）
deleteReport(id)      // 删除/归档报告
getReportTask(id)     // 获取报告生成任务进度
getReportChunkList()  // 获取报告分块数据（大文件分块存储）
reloadReport(id)      // 重新加载/刷新报告数据
```

---

## 五、图表组件库详情

### 5.1 组件架构（`src/components/charts/`）

```
chart-base.tsx           # 基础封装：ChartContainer, ChartTooltip, createXAxis
area-chart.tsx           # 面积图（时序监控主图）
line-chart.tsx           # 折线图
scatter-chart.tsx        # 散点图（稀疏指标）
metric-charts-grid.tsx   # 指标图表网格容器（管理布局+交互）
summary-tables-card.tsx  # 汇总表格卡片（多机器对比）
label-selector.tsx       # 多维度标签筛选器（弹出 popover）
label-selector-button.tsx # 标签筛选器触发按钮
label-utils.ts           # 标签提取/过滤工具
utils.ts                 # groupByTimeSeries, formatSeriesLabel, filterPointsByLabels
hooks.ts                 # useYAxisWidth（Y 轴宽度自动计算）
index.ts                 # 统一导出
```

### 5.2 关键特性

**面积图**：基于 Recharts `AreaChart`，Y 轴宽度自动适配，多时间序列颜色哈希确定性分配，图例支持 bottom（2列）/ right（1列）。

**MetricChartsGrid**（核心容器）：
- 支持聚合类型切换（avg/min/max/count/last）
- 支持标签维度筛选（LabelSelector）
- 每个指标最多显示 30 条时间序列（截断保护）
- 分离"有数据"和"无数据"指标，无数据的单独列出（而非空白图）

### 5.3 性能优化亮点

| 优化点 | 实现方式 |
|--------|----------|
| 非阻塞数据更新 | `useTransition` |
| 避免全量遍历 | 建立 `pointsByMetric: Map<"name|aggType", AggregatedPoint[]>` 索引 |
| 聚合类型切换 O(1) | 两层 useMemo 分离：预计算所有聚合类型 → 切换时直接 Map.get |
| 颜色计算缓存 | `colorCache: Map<string, string>`（组件外部）|
| 服务端数据压缩 | `points-compressed.ts`，按指标名按需解压 |
| 大数据堆栈保护 | 手动 for 循环替代扩展运算符 `...` |

---

## 六、WebSocket 数据流

### 6.1 客户端实现（`src/apis/websocket.ts`）

自研 `WebSocketClient` 类，功能完整：
- **自动重连**：固定间隔3秒，最多10次
- **心跳保活**：30秒一次 ping/pong（测 RTT）
- **订阅管理**：`Map<topic, Set<callback>>`，同 topic 多订阅者
- **断线后自动恢复订阅**：重连成功后重发所有 subscribe 请求

### 6.2 消息协议

```
客户端 → 服务端（订阅请求）：
{
  type: "request",
  topic: "datasource.status",
  path: "/subscribe",
  data: { datasource_ids: ["ds-001"], include_details: true }
}

服务端 → 客户端（广播）：
{
  type: "broadcast",
  topic: "datasource.status",
  data: {
    updates: [{
      datasource_id: "ds-001",
      overall_status: "healthy",
      healthy_count: 2,
      total_count: 2,
      addresses: [{address, status, latency_ms, total_series, disk_size}],
      last_check_time: 1714000000
    }]
  },
  timestamp: 1714000000000
}

取消订阅：
{ type: "request", topic: "datasource.status", path: "/unsubscribe", data: {} }

心跳：
{ type: "heartbeat", data: { client_time: 1714000000000 } }
```

### 6.3 WebSocket 数据流图

```
┌──────────────────────────────────────────────┐
│                   Browser                    │
│                                              │
│  Dashboard Component                         │
│  ┌─────────────────────────────────────────┐ │
│  │  WebSocketClient (useRef 单例)           │ │
│  │  ┌──────────────────────────────────┐   │ │
│  │  │ connect() → ws://host/ws         │   │ │
│  │  │ subscribe("datasource.status",   │   │ │
│  │  │   {datasource_ids:[id]}, cb)     │   │ │
│  │  │ heartbeat 30s                    │   │ │
│  │  │ 断线自动重连 + resubscribeAll    │   │ │
│  │  └──────────────┬───────────────────┘   │ │
│  │                 │ onmessage             │ │
│  │                 ↓                       │ │
│  │  handleBroadcast(topic, data)           │ │
│  │  → setDatasourceStatus(status)          │ │
│  │  → 更新 Pushgateway 状态表格            │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  HTTP 轮询（setInterval per aggregation level）│
│  → POST /apis/v1/points/query               │
│  → 解压 CompressedPointsResponse            │
│  → startTransition(setAllPoints)            │
│  → 重建 pointsByMetric 索引                 │
│  → useMemo 预计算所有聚合类型数据           │
│  → 渲染 MetricChartsGrid                    │
└──────────────────────────────────────────────┘
              ↕ WebSocket /ws
              ↕ HTTP /apis/v1/points/query
┌──────────────────────────────────────────────┐
│           monitor_hub Backend                │
│  每N秒检查 Pushgateway 健康                   │
│  → WebSocket 广播 datasource.status          │
│  每N秒聚合数据写入 TSDB                       │
│  → HTTP 查询 /apis/v1/points/query 响应      │
└──────────────────────────────────────────────┘
```

---

## 七、可复用的业务逻辑

### 7.1 核心工具函数

| 文件 | 内容 | 复用价值 |
|------|------|----------|
| `src/apis/websocket.ts` | WebSocketClient 封装（完整实现） | ⭐⭐⭐ |
| `src/apis/points-compressed.ts` | 压缩数据解压（与后端协议绑定） | ⭐⭐⭐ |
| `src/config/aggregation.ts` | 聚合级别配置 + 时间窗口计算 | ⭐⭐⭐ |
| `src/components/charts/utils.ts` | groupByTimeSeries, formatSeriesLabel, filterPointsByLabels | ⭐⭐⭐ |
| `src/lib/metric-utils.ts` | applyTransform（表达式转换）, formatBytes | ⭐⭐ |
| `src/components/charts/hooks.ts` | useYAxisWidth | ⭐⭐ |
| `src/components/charts/label-utils.ts` | 标签提取和过滤 | ⭐⭐ |
| `src/lib/http-interceptor.ts` | 响应拦截（用户信息提取） | ⭐ |

### 7.2 API 层复用模式

```typescript
// datasource.ts 的三类请求封装
apiRequest<T>(url, options, type: 'single'|'list'|'void')
// 'single': 返回 data[0]（含 resource 字段自动展平）
// 'list':   返回 { list, total, page, page_size }（分页标准化）
// 'void':   只检查 code===0，不返回数据
```

### 7.3 可复用组件

| 组件 | 复用价值 | 说明 |
|------|----------|------|
| `MetricChartsGrid` | ⭐⭐⭐ | 带聚合切换+标签筛选+布局切换的图表网格 |
| `AreaChart` | ⭐⭐⭐ | 时序面积图，自适应 Y 轴 |
| `ScatterChart` | ⭐⭐ | 稀疏指标散点图 |
| `LabelSelector` | ⭐⭐ | 多维度标签筛选 |
| `SummaryTablesCard` | ⭐⭐ | 多机器横向对比表格 |
| `ReportScoringConfigEditor` | ⭐⭐ | 评分规则编辑器 |
| `WebSocketClient` | ⭐⭐⭐ | 完整 WS 客户端（重连+心跳+订阅管理） |

---

## 八、UI 重设计建议

### 8.1 现有问题清单

| 问题 | 严重程度 | 说明 |
|------|----------|------|
| 浮动悬浮球 UX 差 | 🔴 高 | hover 展开不直观，移动端体验差 |
| 缺少自定义时间范围选择器 | 🔴 高 | 只有聚合级别切换，无法自定义起止时间 |
| 首页数据源+报告混合展示 | 🟡 中 | 信息密度高，缺乏层次感 |
| 报告详情拖拽调整面板宽度 | 🟡 中 | 非直觉操作，普通用户不易发现 |
| WebSocket 断线无可见提示 | 🟡 中 | 静默重连，用户无感知 |
| 图表颜色系统（哈希5色） | 🟢 低 | 相近颜色偶尔难以区分 |
| 评分配置 UI 复杂 | 🟢 低 | 学习成本较高 |

### 8.2 改进方向

**1. 导航与信息架构重设计**
```
当前：顶部 Navbar + 首页混合展示数据源+报告
建议：
  - 左侧固定侧边栏导航
  - 首页 → 纯数据源列表
  - 独立的报告列表页（/reports）
  - 面包屑导航（数据源 > Dashboard）
```

**2. 时间范围选择器（重要）**
```
建议在 Dashboard 顶部工具栏添加：
  - 快捷按钮：最近 30分 / 2h / 12h / 24h / 7d / 30d
  - 自定义 DateRangePicker
  - 时间范围自动映射到对应聚合级别（可手动覆盖）
```

**3. 工具栏固定化**
```
当前：右下角悬浮球（hover 展开）
建议：固定在页面顶部（sticky toolbar）
  聚合级别 | 时间范围 | 图例 ○ | 布局 ⊞ ≡
```

**4. 连接状态可见化**
```
建议：
  - 顶部状态栏小圆点（绿/黄/红）显示 WS 连接状态
  - 断线时 Toast 提示 + 倒计时重连
  - 数据刷新时右上角有刷新动效
```

**5. 报告详情布局简化**
```
当前：可拖拽左右分栏（75%/25%）
建议：
  - 移除拖拽，改 CSS Grid 响应式布局
  - 移动端单列，桌面端双列（主内容 + 侧边摘要）
```

**6. 图表颜色系统**
```
当前：5色哈希（基于 seriesKey 字符串）
建议：
  - 预定义 12~24 色调色板（参考 Grafana classic）
  - 相邻颜色保证足够色相差（≥30°）
  - 暗色模式下自动调整亮度
```

---

## 九、功能模块复用优先级总结

| 模块 | 复用策略 | 优先级 |
|------|----------|--------|
| WebSocketClient | 直接复制，少量接口调整 | P0 |
| 聚合级别配置（aggregation.ts） | 直接复制 | P0 |
| 指标图表组件（Area/Scatter/Grid） | 复制后按 sonar-view 设计调整 | P0 |
| 压缩数据协议（points-compressed） | 与后端接口绑定，一起复用 | P0 |
| groupByTimeSeries 等数据工具 | 直接复制 | P1 |
| 报告详情组件 | 保留业务逻辑，重设计布局 | P1 |
| 数据源管理 CRUD API 层 | 保留，重新设计表单 UI | P1 |
| 评分配置编辑器 | 保留逻辑，简化 UI | P2 |
| 富文本报告描述（Tiptap） | 保留，已完善 | P2 |

---

## 十、附录：文件结构速查

```
src/
├── apis/
│   ├── datasource.ts          # 数据源 CRUD + WS 状态订阅
│   ├── points.ts              # 聚合数据点 HTTP 查询 + WS 订阅
│   ├── points-compressed.ts   # 压缩数据格式解压（核心协议）
│   ├── report.ts              # 报告 CRUD + 任务进度
│   ├── task.ts                # 测试任务 CRUD
│   ├── websocket.ts           # 自研 WebSocket 客户端封装
│   └── filetree.ts            # 文件管理 API
│
├── components/
│   ├── charts/                # 图表组件库（recharts 封装）
│   │   ├── area-chart.tsx
│   │   ├── line-chart.tsx
│   │   ├── scatter-chart.tsx
│   │   ├── metric-charts-grid.tsx
│   │   ├── summary-tables-card.tsx
│   │   ├── label-selector.tsx
│   │   └── utils.ts / hooks.ts
│   ├── report-detail/         # 报告详情子组件
│   ├── report-table/          # 报告列表表格
│   ├── datasource-table/      # 数据源列表表格
│   ├── task-detail/           # 测试任务子组件
│   ├── routes/                # 页面级组件（对应路由）
│   ├── ui/                    # 基础 UI（Radix UI 封装）
│   └── router.tsx             # 路由配置（nanostores）
│
├── config/
│   ├── aggregation.ts         # 聚合级别配置（与后端同步）
│   └── api.ts                 # API URL 构建（buildApiUrl, buildWsUrl）
│
└── lib/
    ├── stores.ts              # 全局状态（nanostores atoms）
    ├── metric-utils.ts        # 指标工具（transform、formatBytes）
    ├── export-store.ts        # 报告导出状态管理
    ├── http-interceptor.ts    # HTTP 响应拦截
    └── enums.ts               # 枚举常量
```
