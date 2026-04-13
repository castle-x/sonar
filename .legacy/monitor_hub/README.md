# 🎯 Monitor Hub

<p align="center">
  <strong>轻量级、高性能的通用监控与报告平台</strong>
</p>

<p align="center">
  <a href="#简介">简介</a> •
  <a href="#功能特性">功能</a> •
  <a href="#架构设计">架构</a> •
  <a href="#演示">演示</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#已支持的指标">指标</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Go-1.23.0-00ADD8?style=flat-square&logo=go" alt="Go Version">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="License">
</p>

---

## 简介

**Monitor Hub** 是一个专为服务器设计的实时监控/报告展示平台，设计灵感来源于 [Beszel](https://beszel.dev/zh/guide/what-is-beszel)。

它提供了一套完整的解决方案：从实时监控到持久化报告，从数据采集到可视化展示，帮助开发团队快速定位性能问题、分析测试结果。

### 为什么选择 Monitor Hub？

- **🔌 完全通用** - 支持任意服务、工具的数据采集与展示，进程监控、日志转指标一应俱全
- **📊 双模式监控** - 实时监控 + 持久化报告，满足开发和测试的不同需求
- **🚀 高性能** - 多级别级联聚合，支持大规模时间序列数据的高效存储和查询
- **🎨 现代化 UI** - 参考 Beszel 设计，简洁美观，支持深色模式

---

## 功能特性

### 🔴 实时监控

从多个 Pushgateway 数据源采集指标，实时展示系统状态。

- **WebSocket 实时推送** - 数据变化即时同步到前端
- **多数据源健康检查** - 自动检测数据源状态，延迟、序列数、磁盘占用一目了然
- **多级别时间聚合** - 15s → 30s → 1m → 5m → 1h → 6h → 1d，按需切换查询粒度
- **交互式图表** - 支持缩放、平移、图例筛选、标签过滤

### 📋 持久化数据报告

将测试结果保存为报告，便于回溯分析和团队协作。

- **多用例支持** - 一个报告包含多个测试用例，支持标签页快速切换
- **智能预加载** - 后台静默加载数据，切换用例流畅无卡顿
- **汇总数据表格** - 自动生成机器、流量、进程等汇总统计表
- **丰富的元信息** - 测试时间、聚合间隔、用例描述，信息一目了然
- **富文本结论** - 支持 Markdown 格式的报告总结，随时编辑保存

### 🎨 现代化前端

基于 React 18 + TypeScript + Tailwind CSS 构建的现代化 Web 应用。

- **响应式设计** - 适配桌面和平板等多种屏幕
- **深色/浅色主题** - 内置主题切换，保护眼睛
- **流畅动画** - 精心设计的过渡动画和交互反馈
- **悬浮工具栏** - 快速访问常用功能，不离开当前视图

### 👤 用户体验

注重细节，提供极致的使用体验。

- **即时搜索** - Ctrl+K 快速搜索数据源和报告
- **一键复制** - 表格数据一键复制到剪贴板，支持导出 CSV
- **自定义图标** - 为数据源和报告上传自定义图标
- **标签筛选** - 强大的标签筛选系统，快速定位目标数据

### 🔌 通用性 & 可扩展性

灵活的架构设计，适应不同场景需求。

- **指标分组配置** - 通过 `groupmap` 自定义指标分组、别名、单位、转换规则
- **汇总配置** - 通过 `summary_config` 定义汇总表格的计算规则
- **多数据源** - 支持同时管理多个 Pushgateway 数据源
- **Thrift API** - 标准化的 API 定义，便于集成和扩展

---

## 架构设计

```
┌────────────────────────────────────────────────────────────────────────┐
│                            Monitor Hub                                  │
│                                                                         │
│   ┌─────────────────┐          ┌─────────────────┐                     │
│   │    Frontend     │◄────────►│     Backend     │                     │
│   │  React + Vite   │   HTTP   │  Hertz + Wire   │                     │
│   │                 │◄────────►│                 │                     │
│   └─────────────────┘    WS    └────────┬────────┘                     │
│                                         │                               │
│                          ┌──────────────┼──────────────┐               │
│                          │              │              │               │
│                          ▼              ▼              ▼               │
│                   ┌───────────┐  ┌───────────┐  ┌───────────┐         │
│                   │ Aggregator│  │  Storage  │  │  MongoDB  │         │
│                   │  Manager  │  │   TSDB    │  │  (Config) │         │
│                   └─────┬─────┘  └───────────┘  └───────────┘         │
│                         │                                              │
│                         ▼                                              │
│                   ┌───────────┐                                        │
│                   │ Collector │                                        │
│                   │(Concurrent)│                                       │
│                   └─────┬─────┘                                        │
│                         │                                              │
└─────────────────────────┼──────────────────────────────────────────────┘
                          │
            ┌─────────────▼─────────────┐
            │   Multiple Pushgateways   │
            │ (Services / Apps / Tools) │
            └───────────────────────────┘
```

### 核心模块

| 模块 | 说明 |
|------|------|
| **Aggregator Manager** | 级联聚合管理器，协调数据采集和多级别聚合 |
| **Collector** | 并发数据采集器，从多个 Pushgateway 拉取指标 |
| **Storage (TSDB)** | 基于 Prometheus TSDB 的时间序列存储 |
| **WebSocket Server** | 实时数据推送服务 |
| **Report Service** | 报告管理服务，支持增量更新和 Chunk 存储 |

---

## 演示

### 实时监控页面

> 展示数据源详情、Pushgateway 状态表格、多指标图表

<!-- TODO: 添加截图 -->

### 报告详情页面

> 展示报告基本信息、测试用例切换、汇总表格、图表分析

<!-- TODO: 添加截图 -->

### 首页报告列表

> 展示所有报告、高级筛选、批量操作

<!-- TODO: 添加截图 -->

---

## 快速开始

### 前置条件

- **Go** >= 1.23.0
- **Node.js** >= 18 (或 [Bun](https://bun.sh/))
- **MongoDB** >= 5.0

### 安装 & 编译

```bash
# 克隆项目
git clone <repository-url>
cd monitor_hub

# 安装前端依赖
make install-web

# 编译前端和后端
make build
```

### 配置

```bash
# 复制配置模板
cp config/v1/config.yaml.tmpl bin/config.yaml

# 编辑配置文件
vim bin/config.yaml
```

关键配置项：

```yaml
# MongoDB 连接
mongodb:
  uri: "mongodb://user:password@host:port/dbname"

# 聚合配置
aggregation:
  enabled: true
  query_delay: "40s"  # 查询延迟补偿
```

### 运行

```bash
# 生产模式
make run

# 开发模式（两个终端）
make dev-backend  # 终端 1
make dev-web      # 终端 2
```

访问 http://localhost:8081 (生产) 或 http://localhost:5173 (开发)

---

## 已支持的指标

Monitor Hub 可以采集任意 Prometheus 格式的指标，完全通用。以下是常见的指标类型示例：

### 🖥️ 机器指标

| 指标名 | 说明 | 单位 |
|--------|------|------|
| `machine_cpu_usage` | CPU 使用率 | % |
| `machine_memory_usage` | 内存使用率 | % |
| `machine_memory_used` | 已用内存 | GB |
| `machine_network_rx` | 网络接收流量 | KB/s |
| `machine_network_tx` | 网络发送流量 | KB/s |
| `machine_disk_read` | 磁盘读取速度 | MB/s |
| `machine_disk_write` | 磁盘写入速度 | MB/s |

### ⚙️ 进程指标

| 指标名 | 说明 | 单位 |
|--------|------|------|
| `process_cpu_usage` | 进程 CPU 使用率 | % |
| `process_memory_rss` | 进程物理内存 | MB |
| `process_memory_vms` | 进程虚拟内存 | MB |
| `process_thread_count` | 线程数 | 个 |
| `process_fd_count` | 文件描述符数 | 个 |

### 📝 日志转指标

| 指标名 | 说明 | 单位 |
|--------|------|------|
| `log_error_count` | 错误日志数量 | 个 |
| `log_warn_count` | 警告日志数量 | 个 |
| `log_qps` | 日志输出速率 | 条/s |
| `custom_event_count` | 自定义事件计数 | 个 |

### 📡 网络指标

| 指标名 | 说明 | 单位 |
|--------|------|------|
| `network_rtt` | 网络延迟 | ms |
| `network_packet_loss` | 丢包率 | % |
| `network_bandwidth_in` | 入带宽 | Mbps |
| `network_bandwidth_out` | 出带宽 | Mbps |

### 🛠️ 自定义指标

| 指标名 | 说明 | 单位 |
|--------|------|------|
| `app_request_count` | 请求数量 | 个 |
| `app_response_time` | 响应时间 | ms |
| `app_active_users` | 活跃用户数 | 个 |
| `任意指标...` | 自定义采集 | 自定义 |

> 💡 **提示**: 通过 `groupmap` 配置，你可以为任意指标设置别名、单位、转换规则和显示标签。支持将日志解析为指标进行可视化展示。

---

## 技术栈

### 后端

- [Hertz](https://github.com/cloudwego/hertz) - 高性能 HTTP 框架
- [Prometheus TSDB](https://github.com/prometheus/prometheus) - 时间序列数据库
- [MongoDB](https://www.mongodb.com/) - 配置和报告存储
- [Wire](https://github.com/google/wire) - 依赖注入

### 前端

- [React 18](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/)
- [Recharts](https://recharts.org/) - 数据可视化
- [Tiptap](https://tiptap.dev/) - 富文本编辑器
- [Vite](https://vitejs.dev/) - 构建工具

---

## 路线图

- [x] 实时监控
- [x] 持久化报告
- [x] 多用例支持
- [x] 富文本结论编辑
- [x] 悬浮工具栏
- [ ] 实时监控页面中直接保存当前数据快照(报告)
- [ ] AI 智能分析后台对接大模型
- [x] 制作展开的平铺视图，允许报告导出 PDF/PNG
- [ ] 用例对比分析
- [ ] **图例数量优化** - 针对大规模数据场景（如 140+ 进程监控）的图例显示优化
  - 设置图例最大显示数量，超出部分折叠显示
  - 添加图例搜索/过滤功能，快速定位目标序列
  - 提供"显示前 N 个"选项，可按数值大小、字母顺序等排序
  - 考虑虚拟化渲染，提升大量图例时的渲染性能
  - 支持图例分组展示（如按主机、进程类型等标签分组）
- [x] **报告发布标记** - 为 Report 添加 `release` 字段 (true/false)，用于区分测试报告和正式报告
  - [x] 后端：Report 模型新增 `release` 布尔字段
  - [ ] 前端：报告详情页/列表提供「发布/取消发布」按钮
  - [ ] 首页报告列表显示发布状态标识
  - 用于过滤前期测试产生的无效报告，数据准确后标记为正式发布

---

## 贡献

欢迎提交 Issue 和 Pull Request！

---

## 许可证

MIT License - 详见 [LICENSE](LICENSE)

---

<p align="center">Made with ❤️ by castlexu</p>
