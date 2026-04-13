## Context

仓库 `/data/home/castlexu/github/monitor/` 当前包含 5 个历史项目平铺在根目录，需要按 Sonar 产品架构重组。`sonar-tap` 和 `sonar-view` 需要 Web UI，使用 `gve init --scaffold dashboard-02` 初始化；`sonar-store` 是纯 API 服务无 UI，手动初始化 Go 项目结构。

## Goals / Non-Goals

**Goals:**
- 历史项目统一归档到 `legacy/` 目录，保留完整代码供参考
- 新建 `sonar/` 产品目录，包含 tap/store/view 三个子项目
- tap 和 view 通过 `gve init` 获得标准化 GVE 项目骨架（含前端）
- store 手动创建最小 Go 项目骨架（`cmd/server/main.go` + `internal/` + `go.mod`）
- 创建共享目录 `sonar/api/` 和 `sonar/pkg/shared/`

**Non-Goals:**
- 不迁移任何业务代码（本次只是骨架初始化）
- 不删除历史项目代码
- 不实现任何功能逻辑

## Decisions

1. **历史项目归档到 `legacy/`（而非删除）**
   - 原因：旧代码中有大量可复用的业务逻辑（Mark 聚合、Storage[T]、多级聚合、评分系统等），后续 Phase 需要参考和复制
   - 备选：直接在旧项目上改 → 违反"不改旧项目"原则

2. **sonar-store 不用 gve init**
   - 原因：store 是纯 API 服务，不需要前端，gve init 会生成不需要的 `site/` 目录
   - 做法：手动创建 `cmd/server/main.go`、`internal/handler|service|repo/`、`go.mod`

3. **sonar/ 作为产品根目录（而非项目散落在仓库根）**
   - 原因：隔离新旧代码，仓库根目录保持清晰（`legacy/` + `sonar/` + `CLAUDE.md`）

4. **共享契约放 `sonar/api/`**
   - 原因：三个子项目共享 Thrift IDL，单仓改一次三端同步

## Risks / Trade-offs

- [gve init 可能需要网络访问拉取 scaffold] → 确保 wk-ui registry 可达，或提前 `gve sync`
- [go module replace 跨子项目引用可能复杂] → `pkg/shared/` 先创建空目录，实际使用时再配置 replace
