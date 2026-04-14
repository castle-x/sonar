# Sonar

类 Grafana+Prometheus 的监控系统，专为服务器压测场景设计。支持多机采集、集中存储、实时可视化与测试报告生成。

---

## 服务概览

| 服务 | 端口 | 职责 |
|------|------|------|
| [sonar-tap](./sonar-tap/) | 9090 | 数据采集器 — node/process/log 指标采集，内嵌轻量管理 UI |
| [sonar-store](./sonar-store/) | 8082 | 数据存储服务 — 接收 tap 上报，Prometheus TSDB 存储，提供查询接口 |
| [sonar-view](./sonar-view/) | 8283 | 可视化平台 — 实时看板、多级聚合、测试报告、评分、远程管理 tap |

### 数据链路

```
sonar-tap（多台机器）
    │
    │  HTTP POST /apis/v1/metrics/batch
    ▼
sonar-store:8082  ◄──── sonar-view:8283（拉取查询）
                              │
                              │  HTTP 代理转发
                              ▼
                       sonar-tap:9090/api/v1/*（远程配置管理）
```

---

## 快速启动

### 前置依赖

- Go 1.21+
- Node.js 20+ / pnpm 9+
- [gve CLI](https://github.com/wk-studio/gve)（GVE 项目构建工具）

### 开发模式

```bash
# sonar-store（纯 Go，无前端）
cd sonar-store
go run ./cmd/server/

# sonar-tap（GVE 项目，带内嵌 UI）
cd sonar-tap
gve dev

# sonar-view（GVE 项目，带完整 Web UI）
cd sonar-view
gve dev
# 或分别启动前后端
make dev-backend   # Go 后端 :8283
make dev-frontend  # Vite 前端 :5173
```

### 构建单二进制

```bash
cd sonar-tap && gve build    # 输出 bin/sonar-tap
cd sonar-view && gve build   # 输出 bin/sonar-view
cd sonar-store && go build -o bin/sonar-store ./cmd/server/
```

---

## 目录结构

```
sonar/
├── sonar-tap/          # 数据采集器（GVE 项目）
├── sonar-store/        # 数据存储服务（纯 Go）
├── sonar-view/         # 可视化平台（GVE 项目）
├── api/                # 共享 Thrift IDL 契约
├── pkg/                # 共享 Go 工具库
├── docs/               # 项目文档
│   ├── design/         #   设计方案（权威最新版）
│   ├── test/           #   测试用例 & 历史报告
│   └── archive/        #   历史产物（只读参考）
├── test/
│   └── e2e/            # 端到端测试脚本、用例、报告
├── .legacy/            # 历史项目归档（仅供参考，不修改）
├── CLAUDE.md           # AI 辅助开发规范
└── AGENTS.md           # 多 agent 协作规范
```

---

## E2E 测试

```bash
cd test/e2e

# 构建测试所需 binary
go build -o mock_gameserver ./mock_gameserver.go
cd ../../sonar-tap && gve build && cd ../test/e2e
cd ../../sonar-store && go build -o bin/sonar-store ./cmd/server/ && cd ../test/e2e

# 参考 SOP 执行完整测试流程
cat SOP.md
```

测试用例：[TEST_CASES.md](./test/e2e/TEST_CASES.md)  
标准流程：[SOP.md](./test/e2e/SOP.md)  
最新报告：[E2E_TEST_REPORT.md](./test/e2e/E2E_TEST_REPORT.md)

---

## 配置说明

### sonar-tap 配置（`sonar-tap/config/config.yaml`）

```yaml
step: 3                        # 采集间隔（秒）
push_gateway:
  host: "http://localhost:8082"
  app_id: "my_app"
  enabled: true
node_exporter:
  enabled: true
process_exporter:
  enabled: true
  rules:
    - name: "MyServer"
      cmdlines: ["--config"]
log_config:
  - name: "MyServerLog"
    enabled: true
    rules:
      - name: "MyServer"
        cmdlines: ["--config"]
        log_path_pattern: "-log=(.+\\.log)"
    metrics:
      - name: "avg_fps"
        pattern: "AverageFps:(\\d+)"
        value: "$1"
```

### sonar-store 配置（`sonar-store/config/config.yaml`）

```yaml
addr: ":8082"
tsdb:
  path: "./data/tsdb"
  retention: 168h   # 7天
```

### sonar-view 配置（`sonar-view/config/config.yaml`）

```yaml
addr: ":8283"
store:
  addr: "localhost:8082"
aggregation:
  enabled: true
```

---

## 文档索引

| 文档 | 说明 |
|------|------|
| [CLAUDE.md](./CLAUDE.md) | 开发规范、架构说明、文档管理规范 |
| [AGENTS.md](./AGENTS.md) | 多 agent 协作规范 |
| [docs/design/sonar-view/MASTER_DESIGN.md](./docs/design/sonar-view/MASTER_DESIGN.md) | sonar-view 主设计方案 |
| [docs/test/e2e/SOP.md](./docs/test/e2e/SOP.md) | E2E 测试标准流程 |
| [docs/test/e2e/TEST_CASES.md](./docs/test/e2e/TEST_CASES.md) | E2E 测试用例集 |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端语言 | Go 1.21+ |
| Web 框架 | Hertz (CloudWeGo) |
| 时序存储 | Prometheus TSDB |
| 前端框架 | React 18 + TypeScript + Vite |
| UI 组件 | Tailwind CSS v4 + shadcn/ui + Hugeicons |
| 状态管理 | TanStack Query + Zustand |
| 图表 | Recharts |
| 构建工具 | GVE (Go + Vite + Embed) |
