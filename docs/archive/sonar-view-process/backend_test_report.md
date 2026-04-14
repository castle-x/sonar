# Backend Test Report

**日期：** 2026-04-13  
**执行人：** tester-be agent  
**工作目录：** `/Users/castlexu/github/sonar/sonar-view`

---

## 执行摘要

| 指标 | 数值 |
|------|------|
| 测试用例总数 | **58** |
| 通过 | **58** |
| 失败 | **0** |
| 跳过 | 0 |

---

## 按包统计

| 包 | 测试数 | 通过 | 失败 | 语句覆盖率 | 耗时 |
|----|--------|------|------|-----------|------|
| `pkg/scoring` | 21 | 21 | 0 | **39.7%** | ~0.3s |
| `pkg/aggregator` | 24 | 24 | 0 | **31.8%** | ~0.3s |
| `internal/handler` | 13 | 13 | 0 | **12.1%** | ~0.6s |

**总覆盖率（加权估计）：~28%**

---

## 执行命令

```bash
cd /Users/castlexu/github/sonar/sonar-view
go test ./pkg/scoring/ ./pkg/aggregator/ ./internal/handler/ -v -count=1
go test ./pkg/scoring/ ./pkg/aggregator/ ./internal/handler/ -cover -count=1
```

---

## 测试文件

| 文件 | 测试函数数 |
|------|-----------|
| `pkg/scoring/calculator_test.go` | 21 |
| `pkg/aggregator/aggregator_test.go` | 24 |
| `internal/handler/health_test.go` | 13 |

---

## 详细结果

### pkg/scoring — PASS

```
ok  sonar-view/pkg/scoring   coverage: 39.7% of statements
```

覆盖的核心逻辑：
- `NormalizeWeights` — 全路径覆盖（空/均匀/全零/正常）
- `GetScoreLevel` — 所有5个等级边界
- `CalculateMetricScore` — range/threshold 两种模式
- `calculateThresholdScore` — 5种运算符
- `interpolateScore` — 区间外插值
- `CalculateReportScore` — 空/单/多用例

未覆盖（计划后续补充）：
- `CalculateCaseScore`（依赖 SummaryTable 构造较复杂）
- `ExtractMetricRowsWithAlias` / `extractMetricRowsByName`（需要表格数据）

---

### pkg/aggregator — PASS

```
ok  sonar-view/pkg/aggregator   coverage: 31.8% of statements
```

覆盖的核心逻辑：
- `AggregateRaw` — 全5种聚合类型（avg/min/max/count/last）
- `Aggregate` — re-aggregate AggregatedPoint
- `AlignTimestamp` — 时间对齐
- `CalculateExpectedPoints` — 含边界（source=0）
- `ValidateAggregationChain` — 4种校验路径
- `Config.Validate` / `GetLevel` / `GetSourceLevel`
- `AggregationType.Index`
- `filterBusinessLabels` — 内部 label 过滤

未覆盖（计划后续补充）：
- `Manager` / `Collector` 生命周期（需要 mock TSDB）
- `IsTimeBoundary`
- `EvaluateDataQuality`

---

### internal/handler — PASS

```
ok  sonar-view/internal/handler   coverage: 12.1% of statements
```

覆盖的核心逻辑：
- `HealthHandler.Health`
- `writeJSON` helper
- `writeError` helper
- `parseLimit` helper

未覆盖（需要依赖注入或 mock）：
- `MetricsHandler.QueryAggregated`（依赖 AggregationService）
- `MetricsHandler.Status`
- `SnapshotHandler`、`TapHandler`、`WsHandler`（依赖 MongoDB、WebSocket）

---

## 失败详情

**无失败。** 所有 58 个测试用例全部通过。

---

## Bug 列表

测试过程中未发现生产代码 Bug。详见：[backend_bugs.md](../bugs/backend_bugs.md)

---

## 改进建议

1. **扩大 handler 覆盖率**：为 `MetricsHandler`、`SnapshotHandler` 等编写 mock 集成测试
2. **补充 extractor 测试**：`CalculateCaseScore` 和 `ExtractMetricRowsWithAlias` 需要表格数据构造辅助函数
3. **聚合器生命周期测试**：为 `Manager`/`Collector` 编写 in-memory TSDB mock
4. **添加 benchmark**：`NormalizeWeights`、`AggregateRaw` 等热路径函数值得 benchmark 测试
