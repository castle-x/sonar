## 1. 归档历史项目

- [x] 1.1 创建 `legacy/` 目录
- [x] 1.2 将 `datasource/`、`monitor_hub/`、`node_process_exporter/`、`log_exporter/`、`exporter/` 移入 `legacy/`
- [x] 1.3 验证 `legacy/` 下五个目录文件完整

## 2. 创建 Sonar 产品目录结构

- [x] 2.1 创建 `sonar/` 目录
- [x] 2.2 创建 `sonar/api/` 共享 Thrift IDL 契约目录
- [x] 2.3 创建 `sonar/pkg/shared/` 共享 Go 模块目录

## 3. 初始化 sonar-tap

- [x] 3.1 在 `sonar/` 下执行 `gve init sonar-tap --scaffold dashboard-02`
- [x] 3.2 验证项目结构：`cmd/server/main.go`、`internal/`、`site/`、`go.mod`、`gve.lock`
## 4. 初始化 sonar-store

- [x] 4.1 手动创建 `sonar/sonar-store/` 目录结构：`cmd/server/`、`internal/handler/`、`internal/service/`、`internal/repo/`
- [x] 4.2 创建 `go.mod`（module 名 `sonar-store`）
- [x] 4.3 创建最小 `cmd/server/main.go`（HTTP server 占位）
- [x] 4.4 验证 `go build ./cmd/server/` 编译通过
- [x] 4.5 确认无 `site/` 目录

## 5. 初始化 sonar-view

- [x] 5.1 在 `sonar/` 下执行 `gve init sonar-view --scaffold dashboard-02`
- [x] 5.2 验证项目结构：`cmd/server/main.go`、`internal/`、`site/`、`go.mod`、`gve.lock`

## 6. 收尾

- [x] 6.1 更新 CLAUDE.md 中的路径引用（历史项目路径加 `legacy/` 前缀）
- [x] 6.2 验证仓库根目录只剩 `legacy/`、`sonar/`、`CLAUDE.md`、`openspec/`、`.git/`、`.claude/` 等
