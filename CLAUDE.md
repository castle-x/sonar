# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

类 Grafana+Prometheus 的监控系统，专为服务器压测场景设计：

| 服务 | 状态 | 职责 | 端口 |
|------|------|------|------|
| `sonar/sonar-tap/` | **新项目（GVE）** | 数据采集器（node + process + log，可扩展） | 9090（管理API） |
| `sonar/sonar-store/` | **新项目** | 数据存储服务，接收 tap 上报，提供查询接口 | 8082 |
| `sonar/sonar-view/` | **新项目（GVE）** | 可视化平台 + 实时聚合 + 报告 + 评分 + 远程管理 | 8283 |

> 历史项目已归档到 `legacy/`：`datasource/`、`monitor_hub/`、`node_process_exporter/`、`log_exporter/`、`exporter/`，仅供参考。

---

## 开发规范

**所有新增协议和代码遵循 `/gve` skill 规范**，核心要点：

- **API 契约**：Thrift IDL 放在 `api/{project}/{resource}/v{N}/`，通过 `gve api generate` 生成 Go struct + HTTP client + TS client
- **项目结构**：遵循 GVE 目录约定（`cmd/server/`、`internal/handler|service|repo/`、`site/src/views|shared/`）
- **前端**：React 18 + TypeScript + Tailwind + Vite，纯 Tailwind 样式（禁止独立 CSS 文件），组件通过 `gve ui add` 管理
- **构建运行**：`gve dev`（开发）、`gve build`（构建单二进制）、`gve run`（后台运行）

Thrift IDL 编写规范详见 `/gve` skill 的 `thrift-spec.md`。

---

## 构建与运行

### exporter（legacy/exporter/，参考代码）

```bash
cd legacy/exporter
go build -o bin/exporter ./cmd/exporter
./bin/exporter -c config/config.yaml -a 0.0.0.0:9090
```

### datasource / monitor_hub（legacy/，仅参考）

```bash
cd legacy/datasource && make dev-backend    # localhost:8082
cd legacy/monitor_hub && make dev-backend   # localhost:8283
```

### Sonar 新项目（GVE 命令）

```bash
cd sonar/sonar-tap && gve dev     # tap 开发模式
cd sonar/sonar-view && gve dev    # view 开发模式
cd sonar/sonar-store && go run ./cmd/server/  # store 开发模式
```

### 测试（legacy/datasource，旧版）

```bash
cd legacy/datasource
./run_tests.sh                                          # 交互菜单
python3 tests/test_mark_batch.py --duration 60 --qps 10
```

---

## 整体数据流

```
exporter（机器侧）
  ├── node/process 指标 ──→ datasource:8082（HTTP POST /metrics/batch）
  └── log 指标 ──────────→ datasource:8082

压测客户端
  └── 请求耗时/成功率 ──→ datasource:8082（HTTP POST /mark/batch）

datasource
  ├── 接收推送 → 写入本地 Prometheus TSDB
  ├── /mark/batch 每 5s 聚合为 11 个 MetricPoint 再写入 TSDB
  └── 提供 /metrics/query（PromQL 或 label 查询）

monitor_hub
  ├── 每 5s 从 datasource 拉取数据 → 多级聚合（15s→30s→1m→5m→1h→6h→1d）→ 写入自己的 TSDB
  ├── WebSocket 实时推送到前端看板
  └── 生成测试报告（gzip 分块存 MongoDB）+ 评分系统
```

---

## exporter 架构（legacy/exporter/，参考）

### 目录结构

```
exporter/
├── cmd/exporter/main.go        # 入口，组装所有 subsystem
├── config/config.go            # 统一配置结构体
├── pkg/
│   ├── configstore/            # 内存配置存储，Subscribe() 返回变更 channel
│   ├── collector/              # CPU/内存/网络/磁盘采集器（读 /proc）
│   ├── nodeexporter/           # NodeExporter + ProcessExporter
│   ├── process/                # 进程发现（扫 /proc/*/cmdline，正向/反向过滤）
│   ├── watcher/                # 日志文件监听（fsnotify + worker pool）
│   ├── metrics/                # 日志行正则提取，density 采样，minuteCount 统计
│   ├── datasource/             # HTTP 上报客户端（即原 pushgateway）
│   ├── metricsbuf/             # 200 条环形缓冲，供 /metrics/preview 接口
│   ├── chanutil/               # TeeToPreview：rawCh → preview + mainCh
│   └── api/                    # HTTP 管理 API（Hertz，端口 9090）
└── site/                       # React 18 管理前端（go:embed 嵌入 binary）
```

### 热更新机制

配置变更通过 `configstore.Subscribe()` channel 广播，`handleConfigReload` goroutine 收到后调用 `StopAll()` + `runWatchers()` 原地重建 watcher，node/process exporter 当前需重启（TODO）。

### goroutine 模型关键点

- **log watcher**：每个 FileWatcher 固定 8 个 `lineWorker` goroutine，日志行通过 4096 buffer channel 传入，不再随 logConfig 数量线性增长。
- **采集 ticker**：单一 goroutine，顺序调用各 Exporter.Record()。
- **双 channel**：`rawCh`（exporter/watcher 写）→ TeeToPreview → `mainCh`（datasource 消费），preview ring buffer 旁路接收。

### 管理 API（:9090）

```
GET/PUT  /api/v1/config              # 查看/全量更新配置（PUT 写回 yaml + 热更新）
PATCH    /api/v1/config/node         # 仅修改 node_exporter 段
PATCH    /api/v1/config/process      # 仅修改 process_exporter 段
PATCH    /api/v1/config/log          # 仅修改 log_config 段
POST     /api/v1/config/reload       # 从磁盘重载配置

GET      /api/v1/processes           # 当前机器所有进程列表
POST     /api/v1/debug/regex         # 正则调试：{pattern, input} → {matched, groups, named_groups}
POST     /api/v1/debug/match_process # 进程匹配测试：{cmdlines} → 匹配到的进程 + labels
POST     /api/v1/debug/match_log     # 日志提取测试：{pattern, text} → {matched, value, captures}

GET      /api/v1/status              # 各 subsystem 状态 + watcher 统计
GET      /api/v1/metrics/preview     # 最近 N 条采集指标（?limit=20，最大 200）
GET      /api/v1/health              # 健康检查
```

### 配置文件结构

```yaml
step: 3                          # 采集间隔（秒）

push_gateway:
  host: "http://datasource:8082"
  app_id: "my_app"
  enabled: true
  report_interval: 10
  labels:
    cluster: "test"

node_exporter:
  enabled: true

process_exporter:
  enabled: true
  dynamic_interval: 15           # 进程列表刷新间隔
  rules:
    - name: "GameServer"
      cmdlines: ["--config", "!seed"]   # !前缀为反向过滤
      extracts:
        - type: regex
          pattern: "--id=(\\w+)"
          labels:
            server_id: $1

log_config:
  - name: "GameServerLog"
    enabled: true
    rules:
      - name: "GameServer"
        cmdlines: ["--config"]
        log_path_pattern: "-ABSLOG=(.+\\.log)"  # 从 cmdline 提取日志路径
    metrics:
      - name: "avg_fps"
        pattern: "AverageFps:(\\d+)"
        value: "$1"
        density: 15              # 最小上报间隔（秒）
        is_record_minute_count: false
```

---

## datasource 架构（legacy/datasource/，旧版参考）

> 以下描述的是当前旧版实现，重写时作为业务逻辑参考。项目结构将按 GVE 规范重新组织。

### 核心业务逻辑（重写时保留）

- **Mark 聚合**：`POST /mark/batch` → Recorder（内存 TTL 缓存 5min）→ 每 5s 聚合为 11 个 MetricPoint（total_num, failed_num, rtt_avg/max/min/p50/p70/p90/p99, qps_avg, success_rate）→ Prometheus TSDB
- **泛型存储**：`Storage[T]` 接口 + `Serializer[T]` 类型转换，Prometheus TSDB 后端
- **双查询路径**：`/mark/list`（实时，读 Recorder）或 `/metrics/query`（历史，读 TSDB）
- **Exporter 生命周期**：UP → DOWN（无上报 >5min）→ 自动移除（DOWN >1hr）

### 旧版层次结构（参考）

| 目录 | 职责 |
|------|------|
| `apis/` | Thrift IDL |
| `biz/*/v1/` | handler + service + router |
| `pkg/aggregator/` | Mark 聚合引擎 |
| `pkg/storage/` | 泛型 TSDB 存储 |
| `internal/provider/` | Wire 依赖注入 |

---

## monitor_hub 架构（legacy/monitor_hub/，旧版参考）

> 以下描述的是当前旧版实现，重写时作为业务逻辑参考。

### 核心业务逻辑（重写时保留）

- **多级聚合**：每 5s 从 datasource 拉取 → 聚合为 15s→30s→1m→5m→1h→6h→1d → 存入本地 TSDB + WebSocket 广播
- **测试报告**：查询 datasource 获取测试时段数据 → 按间隔重采样 → gzip 压缩分块存 MongoDB（支持 >50MB）
- **评分系统**：每个指标配置 `weight`、`scoring_type`（range/threshold）、分数区间，加权汇总总分

---

## 重构计划：Sonar 产品架构

> 产品名 **Sonar**，定位为通用数据采集 + 存储 + 可视化平台，覆盖服务器监控、告警、金融/新闻/行业数据等场景。

### 仓库结构（单仓 monorepo）

三个独立进程共存于同一仓库，各自独立 `go.mod`、独立构建、独立部署：

```
monitor/
├── sonar/                 # Sonar 产品目录
│   ├── sonar-tap/         # 数据采集器（GVE 项目，独立 binary）
│   ├── sonar-store/       # 数据存储服务（纯 Go，独立 binary）
│   ├── sonar-view/        # 可视化平台（GVE 项目，独立 binary）
│   ├── api/               # 共享 Thrift IDL 契约（三端共用）
│   └── pkg/shared/        # 可选：共享 Go 类型/工具
├── legacy/                # 历史项目归档（仅供参考）
│   ├── exporter/
│   ├── datasource/
│   ├── monitor_hub/
│   ├── node_process_exporter/
│   └── log_exporter/
├── CLAUDE.md
└── openspec/
```

单仓好处：Thrift IDL 改一次三端同步，共享数据结构无版本漂移。

### 目标架构

| 新项目 | 对应旧项目 | 职责 | Web UI |
|--------|-----------|------|--------|
| `sonar-tap/` | exporter | 可扩展数据采集器（node/process/log 及未来更多数据源） | 内嵌轻量 UI（单机调试用） |
| `sonar-store/` | datasource | 接收 tap 上报，Prometheus TSDB 存储，提供查询接口 | 无 UI |
| `sonar-view/` | monitor_hub | 可视化看板 + 实时聚合 + 报告 + 评分 + 远程管理 tap | 完整 Web UI |

### 部署架构（分布式）

```
数据链路：  tap ──push──→ store ←──pull── view
管理链路：  view ──HTTP proxy──→ tap:9090/api/v1/*（远程配置管理）
```

- 多台机器各自运行 tap，集中上报到 store
- view 从 store 拉取数据进行可视化，不直接连 tap 拿数据
- view 通过代理转发管理各 tap 实例的配置（管理链路与数据链路分离）

### UI 策略

**tap 内嵌轻量 UI + view 统一远程管理，两者并存：**

| 场景 | 方式 | 说明 |
|------|------|------|
| 单机调试 | 直接访问 tap 内嵌 UI（`:9090`） | SSH 到目标机器，调试正则、看进程匹配，不依赖 view |
| 集中管理 | 通过 view Web UI 远程操作 | 管理多台 tap，view 后端代理转发到各 tap 的 `/api/v1/config` |

view 不重复实现配置逻辑，仅做代理 + 多实例聚合展示：

```
view 前端 → view 后端 → HTTP 转发 → tap:9090/api/v1/*
```

### 服务发现

- **当前方案**：view 配置文件中手动配置各 tap/store 的 IP + 端口列表
- **后续扩展**：SSH 认证方式，或接入 Consul 服务发现

### 原则

- **不改旧项目**：`legacy/` 下所有项目仅作参考，不在上面修改
- **新建目录，重新开发**：`sonar/sonar-tap/`、`sonar/sonar-store/`、`sonar/sonar-view/` 为全新 GVE 项目
- **允许复制旧代码**：可将 `legacy/` 下旧项目的模块代码复制到新项目中，按 GVE 规范重新组织
- **exporter/ 已完成合并**：当前 `legacy/exporter/` 是 node_process_exporter + log_exporter 的合并产物，将作为 `sonar-tap` 的基础

### 重构路径

```
Phase 1: sonar-tap（基于现有 exporter/）
  ├── 重命名 + GVE 化，补充可扩展采集器插件机制
  └── 保留内嵌轻量 UI（已有）

Phase 2: sonar-store（基于 datasource/ 业务逻辑）
  ├── GVE 新项目：gve init sonar-store
  ├── 复制核心模块：Mark 聚合、Storage[T] 泛型接口、Prometheus TSDB 后端
  ├── 重新定义 API 契约（Thrift IDL，gve api）
  ├── Exporter 生命周期管理
  └── 无 Web UI，纯 API 服务

Phase 3: sonar-view（基于 monitor_hub/ 业务逻辑）
  ├── GVE 新项目：gve init sonar-view
  ├── 复制核心模块：多级聚合引擎、报告生成、评分系统
  ├── 重新定义 API 契约
  ├── React 前端重写（看板 + 报告 + 评分配置）
  └── 新增：采集器远程管理功能（代理 tap API）
```

---

## 已知待完善项

- exporter 热更新目前只对 `log_config` 生效；`node_exporter` / `process_exporter` 的规则变更需重启
- `debug/match_process` 在非 root 用户下 `cmdline` 字段返回空（/proc 权限限制）
- datasource 和 monitor_hub 待按 GVE 规范重写为 sonar-store 和 sonar-view

---

## 文档管理规范

### 目录结构

```
sonar/
├── docs/                          # 项目级文档（统一归档）
│   ├── design/                    # 设计方案（保留最新）
│   │   └── sonar-view/            #   sonar-view 设计文档
│   │       ├── MASTER_DESIGN.md   #   主设计方案（权威）
│   │       ├── backend_design.md
│   │       └── frontend_design.md
│   ├── test/                      # 测试用例（保留最新）
│   │   ├── e2e/                   #   端到端测试
│   │   │   ├── SOP.md             #   标准测试流程（权威）
│   │   │   ├── TEST_CASES.md      #   测试用例集（权威）
│   │   │   └── E2E_TEST_REPORT_YYYYMMDD.md  # 历次测试报告（带日期）
│   │   └── sonar-view/            #   sonar-view 单元/集成测试用例
│   └── archive/                   # 归档（历史产物，只读参考）
│       ├── agent-artifacts/       #   子 agent 探索/分析产物
│       ├── sonar-tap/             #   sonar-tap 历史文档
│       ├── sonar-view-process/    #   sonar-view 开发过程文档
│       └── ...
└── test/
    └── e2e/                       # 端到端测试脚本 + 配置
        ├── SOP.md                 # → 同步自 docs/test/e2e/SOP.md
        ├── TEST_CASES.md          # → 同步自 docs/test/e2e/TEST_CASES.md
        ├── E2E_TEST_REPORT.md     # 最新一次测试报告（不带日期，覆盖）
        ├── mock_gameserver.go     # 测试辅助程序
        ├── tap-config-e2e.yaml    # 测试专用配置
        └── archive/               # 历史报告 + 调查文档
```

### 文档分类规则

| 类型 | 放置位置 | 处理规则 |
|------|---------|---------|
| **设计方案**（MASTER_DESIGN、backend/frontend_design） | `docs/design/{project}/` | 保留最新版，历史版本 Git 历史可查，无需单独归档 |
| **测试用例**（TEST_CASES、SOP） | `docs/test/` + `test/e2e/` 同步 | 持续更新覆盖，不归档 |
| **测试报告**（TEST_REPORT） | `test/e2e/E2E_TEST_REPORT.md`（最新）+ `docs/test/e2e/E2E_TEST_REPORT_YYYYMMDD.md`（历史） | 每次测试覆盖最新，同时在 docs 保留带日期副本 |
| **子 agent 分析/探索产物**（EXPLORATION、ANALYSIS、INVENTORY 等） | `docs/archive/agent-artifacts/` | 完成任务后立即归档，不留在项目根目录 |
| **开发过程文档**（research、bugs、wave2 报告等） | `docs/archive/{project}-process/` | 开发阶段完成后归档 |
| **Bug 调查报告**（BUG*_INVESTIGATION） | `docs/archive/{project}-process/` 或 `test/e2e/archive/` | 问题修复后归档 |
| **README / AGENTS.md / CLAUDE.md** | 项目根目录 | 永久保留，持续更新 |

### 执行过程产物处理规则

**子 agent 工作产物**（由 AI agent 自动生成的分析、探索、报告文档）：
- 命名特征：`*_ANALYSIS.md`、`*_EXPLORATION.md`、`*_INVENTORY.md`、`*_SUMMARY.md`（泛化探索类）
- 任务完成后移入 `docs/archive/agent-artifacts/`
- **禁止**将 agent 产物留在项目根目录超过一个工作周期

**开发阶段文档**（由 team 协作开发产生）：
- 命名特征：`research_*.md`、`*_bugs.md`、`WAVE*_*.md`、`MIGRATION_*.md`
- 功能上线后移入 `docs/archive/{project}-process/`

### 测试流程规范

#### E2E 测试标准流程（SOP）

完整 SOP 见 `docs/test/e2e/SOP.md`，核心步骤：

```
1. 准备阶段
   ├── 构建所有 binary（sonar-tap、sonar-store、mock_gameserver）
   ├── 准备测试配置文件（tap-config-e2e.yaml）
   └── 确认服务端口未占用（9090、8082）

2. 启动阶段
   ├── 启动 sonar-store（端口 8082）
   ├── 启动 sonar-tap（带测试配置，端口 9090）
   └── 启动 mock_gameserver（模拟目标进程 + 日志产生）

3. 验证阶段
   ├── 检查 tap 注册到 store（GET /apis/v1/tapinstances）
   ├── 等待数据上报（≥3 个采集周期）
   ├── 查询 store 指标数据（GET /apis/v1/metrics/query）
   └── 验证指标命名、标签、数值范围

4. 清理阶段
   ├── 停止所有进程
   ├── 记录测试报告到 test/e2e/E2E_TEST_REPORT.md
   └── 带日期备份到 docs/test/e2e/E2E_TEST_REPORT_YYYYMMDD.md
```

#### 测试报告格式

每次 E2E 测试完成后在 `test/e2e/E2E_TEST_REPORT.md` 记录：

```markdown
# E2E 测试报告 YYYY-MM-DD

## 测试环境
- OS: ...
- sonar-tap version / commit: ...
- sonar-store version / commit: ...

## 测试结果摘要
| 测试项 | 状态 | 备注 |
|--------|------|------|
| tap→store 指标上报 | ✅/❌ | ... |
| 进程发现 | ✅/❌ | ... |
| 日志指标采集 | ✅/❌ | ... |

## 发现的问题
（列出 Bug ID + 简述）

## 结论
```

#### 新功能测试要求

每个新功能/模块开发完成后：
1. 在 `docs/test/{project}/` 补充对应测试用例（格式参考 `TEST_CASES.md`）
2. 执行测试并更新 `E2E_TEST_REPORT.md`
3. 如发现 Bug，在 `test/e2e/archive/` 创建 `BUG{N}_INVESTIGATION.md` 记录调查过程
