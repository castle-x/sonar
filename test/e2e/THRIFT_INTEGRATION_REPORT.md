# Thrift IDL 集成测试报告

**日期**: 2026-04-14  
**项目**: sonar-view  
**测试范围**: Thrift IDL 编写 → `gve api generate` 代码生成 → Go 编译 → HTTP 集成测试

---

## 1. Thrift IDL 文件

| 文件 | 描述 |
|------|------|
| `api/sonar-view/snapshot/v1/snapshot.thrift` | 快照 CRUD 契约（Snapshot, CreateSnapshotRequest/Response, GetSnapshotRequest/Response, ListSnapshotsRequest/Response, DeleteSnapshotRequest, SnapshotService） |
| `api/sonar-view/store-config/v1/store-config.thrift` | Store 数据源管理契约（StoreConfig, Create/Get/List/Update/Delete Request/Response, StoreConfigService） |

---

## 2. 生成的文件

### Go（`internal/api/sonar-view/`）

| 文件 | Package |
|------|---------|
| `snapshot/v1/snapshot.go` | `package snapshot` — 所有 Request/Response/Snapshot struct |
| `snapshot/v1/client.go` | `SnapshotServiceHTTPClient` |
| `store-config/v1/store-config.go` | `package store_config` — 所有 Request/Response/StoreConfig struct |
| `store-config/v1/client.go` | `StoreConfigServiceHTTPClient` |

### TypeScript（`site/src/api/sonar-view/`）

| 文件 | 描述 |
|------|------|
| `snapshot/v1/types.ts` | Snapshot 接口类型定义 |
| `snapshot/v1/client.ts` | `SnapshotServiceClient` fetch 客户端 |
| `store-config/v1/types.ts` | StoreConfig 接口类型定义 |
| `store-config/v1/client.ts` | `StoreConfigServiceClient` fetch 客户端 |

---

## 3. Go 编译验证

```
cd /Users/castlexu/github/sonar/sonar-view
go build ./...
```

**结果**: ✅ 编译通过（无错误，无警告）

---

## 4. 集成测试结果

服务启动于 `http://localhost:8283`，使用 `go run ./cmd/server/`。

| # | 端点 | 方法 | 描述 | 结果 |
|---|------|------|------|------|
| 1 | `/health` | GET | 健康检查 | ✅ `{"status":"ok"}` |
| 2 | `/api/v1/store-configs` | POST | 创建 store-config | ✅ 返回含 UUID 的 StoreConfig 对象 |
| 3 | `/api/v1/store-configs` | GET | 列出 store-configs | ✅ 返回列表（含 total） |
| 4 | `/api/v1/store-configs/:id` | PUT | 更新 store-config | ✅ `{"status":"ok"}` |
| 5 | `/api/v1/snapshots` | POST | 创建快照（含 tags、时间范围） | ✅ 返回含 UUID 的 Snapshot 对象 |
| 6 | `/api/v1/snapshots` | GET | 列出快照 | ✅ 返回列表（含新建快照） |
| 7 | `/api/v1/snapshots/:id` | GET | 按 ID 获取快照 | ✅ 返回正确快照数据 |
| 8 | `/api/v1/snapshots/:id/metrics` | GET | 获取快照时序数据 | ✅ 返回 `null`（无 chunk，符合预期） |
| 9 | `/api/v1/snapshots/:id` | DELETE | 软删除快照 | ✅ `{"status":"ok"}` |
| 10 | `/api/v1/snapshots` | GET | 删除后再次列表（验证软删除） | ✅ 已删除快照不出现在列表 |
| 11 | `/api/v1/taps` | GET | 列出 tap 实例（代理 store） | ✅ 返回空列表（无 store 配置时降级正常） |
| 12 | `/api/v1/store-configs/:id` | DELETE | 删除 store-config | ✅ `{"status":"ok"}` |

**全部 12 个测试点通过，0 失败。**

---

## 5. 生成代码与现有代码兼容性验证

### Go struct 字段对比

| IDL 字段 | 生成 Go 字段 | 现有 `SnapshotMeta` 字段 | 兼容 |
|----------|-------------|------------------------|------|
| `id: string` | `ID string` | `ID string` | ✅ |
| `name: string` | `Name string` | `Name string` | ✅ |
| `description: optional string` | `Description string,omitempty` | `Description string` | ✅ |
| `tags: list<string>` | `Tags []string` | `Tags []string` | ✅ |
| `app_id: optional string` | `AppID string,omitempty` | `AppID string` | ✅ |
| `tap_ids: list<string>` | `TapIds []string` | `TapIDs []string` | ✅ (语义一致) |
| `start_time: optional i64` | `StartTime int64,omitempty` | `StartTime int64` | ✅ |
| `end_time: optional i64` | `EndTime int64,omitempty` | `EndTime int64` | ✅ |
| `status: string` | `Status string` | `Status SnapshotStatus` | ✅ (底层 string) |
| `chunk_count: i32` | `ChunkCount int32` | `ChunkCount int` | ✅ (安全转换) |
| `total_bytes: i64` | `TotalBytes int64` | `TotalBytes int64` | ✅ |
| `created_at: i64` | `CreatedAt int64` | `CreatedAt int64` | ✅ |
| `updated_at: i64` | `UpdatedAt int64` | `UpdatedAt int64` | ✅ |

### StoreConfig 字段对比

| IDL 字段 | 生成 Go 字段 | 现有 `StoreConfig` 字段 | 兼容 |
|----------|-------------|------------------------|------|
| `id: string` | `ID string` | `ID string` | ✅ |
| `name: string` | `Name string` | `Name string` | ✅ |
| `addr: string` | `Addr string` | `Addr string` | ✅ |
| `description: optional string` | `Description string,omitempty` | `Description string` | ✅ |
| `created_at: i64` | `CreatedAt int64` | `CreatedAt int64` | ✅ |
| `updated_at: i64` | `UpdatedAt int64` | `UpdatedAt int64` | ✅ |

---

## 6. 发现的问题

无。所有生成的代码与现有 handler/service/repo 层完全兼容。

> 注：生成的 Go struct 独立存放在 `internal/api/` 目录，不直接替换 `internal/repo/` 中的业务 struct，二者平行存在。Go HTTP Client 可用于 sonar-view 内部或外部服务调用 sonar-view API，TypeScript Client 供前端 `site/` 使用。

---

## 7. 后续建议

- 前端 `site/src/` 中的手写 API 调用可逐步迁移为使用生成的 `SnapshotServiceClient` / `StoreConfigServiceClient`
- 如需新增 `/api/v1/snapshots/:id/metrics` 的查询接口，可在 `snapshot.thrift` 中补充 `GetSnapshotMetrics` 方法
- `metrics/query` 代理接口（POST `/api/v1/metrics/query`）可考虑单独建立 `metrics/v1/metrics.thrift` IDL
