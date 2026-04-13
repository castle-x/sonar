## Context

sonar-tap（采集器）需要批量上报指标到 sonar-store（存储），sonar-view（可视化）需要从 sonar-store 查询指标。三端共享同一份 Thrift IDL 契约，放在 `sonar/api/sonar-store/metrics/v1/`。

旧版 `RequestMetricPoint` 存在的问题：
- `Timestamp` 混用秒和毫秒（`time.Now().Unix()` vs `timestamp.UnixMilli()`）
- `Name` 是 `*string`（旧 Thrift 指针风格），GVE 生成的是值类型
- 类型定义嵌在 `pkg/datasource/apis/` 下，与业务代码耦合

## Goals / Non-Goals

**Goals:**
- 定义 `MetricPoint` 核心数据结构，timestamp 统一为 Unix 毫秒（i64）
- 定义 tap→store 的上报接口（`ReportMetrics`）
- 预留 view→store 的查询接口（`QueryMetrics`），只定义结构不实现
- 通过 `gve api generate` 在 sonar-tap 和 sonar-store 中生成代码

**Non-Goals:**
- 不实现任何业务逻辑（本次只生成类型和客户端骨架）
- 不迁移 legacy/exporter 的 pkg（那是下一步）
- 不定义 mark 相关契约（mark 聚合是 store 内部行为，后续单独定义）

## Decisions

1. **Timestamp 统一毫秒（i64）**
   - 原因：日志采集需要毫秒精度避免同秒数据点丢失；与旧 datasource TSDB 行为一致（`UnixMilli`）
   - 备选：统一秒 → 会丢精度

2. **契约路径 `sonar/api/sonar-store/metrics/v1/`**
   - 原因：这是 store 暴露的接口，按 GVE 规范 `api/{project}/{resource}/v{N}/` 组织
   - tap 和 view 作为客户端引用同一份契约

3. **ReportMetricsRequest 保留全局 labels 字段**
   - 原因：tap 的 `push_gateway.labels` 配置的全局标签（host、ip、cluster 等）在请求级别统一传递，store 侧合并，避免每个点重复携带

4. **预留 QueryMetrics 但不实现**
   - 原因：view→store 的查询接口后续设计会更复杂（PromQL、label 匹配等），当前先占位

## Risks / Trade-offs

- [gve api generate 需要在 sonar-tap 和 sonar-store 各执行一次] → 两个项目都需要在 `api/` 目录建立软链或配置指向 `sonar/api/`
- [查询接口预留可能后续大改] → 接受，v1 的查询接口设计得简单，破坏性变更时升 v2
