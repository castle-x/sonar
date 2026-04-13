## Why

当前仓库包含多个历史项目（`datasource/`、`monitor_hub/`、`node_process_exporter/`、`log_exporter/`、`exporter/`），目录结构混乱。根据 CLAUDE.md 中确定的 Sonar 产品架构，需要整理仓库结构，将历史项目归档到统一参考目录，新建 `sonar/` 目录作为产品根目录，初始化三个子项目（tap、store、view）的 GVE 项目骨架。

## What Changes

- 创建 `legacy/` 目录，将 `datasource/`、`monitor_hub/`、`node_process_exporter/`、`log_exporter/`、`exporter/` 移入作为参考
- 新建 `sonar/` 目录，包含三个子项目：
  - `sonar/sonar-tap/`：使用 `gve init` + `dashboard-02` 骨架初始化
  - `sonar/sonar-store/`：纯 Go 项目手动初始化（无 Web UI，不使用 gve init）
  - `sonar/sonar-view/`：使用 `gve init` + `dashboard-02` 骨架初始化
- 新建 `sonar/api/` 共享 Thrift IDL 契约目录
- 新建 `sonar/pkg/shared/` 可选共享 Go 模块目录

## Capabilities

### New Capabilities
- `repo-structure`: 仓库目录结构重组，历史项目归档到 `legacy/`，新建 `sonar/` 产品目录
- `sonar-tap-scaffold`: sonar-tap GVE 项目骨架初始化
- `sonar-store-scaffold`: sonar-store 纯 Go 项目骨架初始化
- `sonar-view-scaffold`: sonar-view GVE 项目骨架初始化

### Modified Capabilities

（无现有 spec 需要修改）

## Impact

- 所有历史项目路径变更：`datasource/` → `legacy/datasource/` 等
- CLAUDE.md 中的路径引用需要同步更新
- 不影响历史项目的代码，仅移动目录
- 新项目为空骨架，无功能代码
