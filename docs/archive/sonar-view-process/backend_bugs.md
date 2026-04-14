# Backend Bugs

**最后更新：** 2026-04-13  
**检查人：** tester-be agent

---

## 已发现 Bug

_测试执行后未发现生产代码 Bug。_

---

## 已知局限（非 Bug）

| 编号 | 位置 | 描述 |
|------|------|------|
| L-1 | `pkg/scoring/calculator.go:interpolateScore` | 当 `leftRange` 和 `rightRange` 均为 nil（区间为空）时返回默认分 60，符合设计 |
| L-2 | `pkg/aggregator/aggregator.go:Aggregate` | 二次聚合时仅支持同类型（AggregationType）聚合点，不校验跨类型混入，属已知设计约束 |
| L-3 | `internal/handler/metrics_handler.go:QueryAggregated` | EndTime=0 时自动补充为当前时间、StartTime=0 补充为 1h 前，但不校验 StartTime > EndTime，属轻微边界缺口（低优先级） |
