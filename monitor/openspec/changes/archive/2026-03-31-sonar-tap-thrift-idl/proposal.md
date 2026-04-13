## Why

sonar-tap 需要向 sonar-store 上报采集指标，两端之间的数据契约必须先于代码存在。当前 `legacy/exporter` 的 `RequestMetricPoint` 类型由旧 hzx 工具生成，存在时间戳单位混用（秒/毫秒）、Name 用指针等问题。在迁移 pkg 之前，先用 GVE Thrift IDL 定义规范的 API 契约，后续所有 pkg 迁移直接使用新类型。

## What Changes

- 在 `sonar/api/sonar-store/metrics/v1/` 创建 `metrics.thrift`，定义：
  - `MetricPoint` struct（timestamp 统一毫秒、name 为值类型 required string）
  - `ReportMetricsRequest` / `ReportMetricsResponse`（tap→store 批量上报）
  - `QueryMetricsRequest` / `QueryMetricsResponse`（view→store 查询，预留）
  - `MetricsService`（service 定义）
- 运行 `gve api generate` 在 sonar-tap 和 sonar-store 中生成 Go struct + HTTP client + TS client

## Capabilities

### New Capabilities
- `metrics-contract`: sonar-store 的 metrics API 契约定义（Thrift IDL），包含上报和查询两组接口

### Modified Capabilities

（无）

## Impact

- `sonar/api/sonar-store/metrics/v1/metrics.thrift` — 新文件
- `sonar/sonar-tap/internal/api/` — gve api generate 生成的 Go client
- `sonar/sonar-store/internal/api/` — gve api generate 生成的 Go struct
- `sonar/sonar-tap/site/src/api/` — gve api generate 生成的 TS client（tap 管理 UI 可选用）
- 后续 pkg 迁移时所有 `v1.RequestMetricPoint` 引用将替换为新生成的类型
