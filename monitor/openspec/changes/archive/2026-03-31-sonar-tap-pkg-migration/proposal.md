# sonar-tap pkg 迁移

## 背景

将 `legacy/exporter/` 下全部 10 个 pkg 迁移到 `sonar/sonar-tap/`，切换到新的 Thrift IDL 生成类型 `metrics.MetricPoint`，去掉 Hertz/Thrift 依赖。

## 决策

- 按依赖层级分 5 个 Phase 逐层迁移
- `pkg/datasource/` 完全重写（net/http + JSON），其余 pkg 复制 + 适配
- Timestamp 统一毫秒，Name 从 `*string` 改为 `string` 值类型
- 采样密度比较从秒级改为毫秒级（`density * 1000`）
