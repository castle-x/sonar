# Phase 3 质量报告

**时间**: 2026-04-15 16:20
**验证任务**: Task #21 - 前端数据层重写：K/V 解压、HTTP 轮询、监控页面重构
**验证者**: tester

## 验证结果

| 检查项 | 状态 | 备注 |
|--------|------|------|
| `points-compressed.ts` 文件存在 | ✅ | `/site/src/lib/points-compressed.ts` |
| `aggregation-config.ts` 文件存在 | ✅ | `/site/src/lib/aggregation-config.ts` |
| `points-api.ts` 文件存在 | ✅ | `/site/src/lib/points-api.ts` |
| `createCompressedDataIndex` 函数存在 | ✅ | `points-compressed.ts:178` |
| `getPointsFromIndex` 函数存在 | ✅ | `points-compressed.ts:204` |
| `decompressPoints` 函数存在 | ✅ | `points-compressed.ts:119` |
| `AGGREGATION_LEVELS` 包含 7 个级别 | ✅ | 15s, 30s, 1m, 5m, 1h, 6h, 1d |
| `calculateQueryTimeWindow` 函数存在 | ✅ | `aggregation-config.ts:33` |
| TypeScript 编译无错误 | ✅ | `pnpm tsc --noEmit` 返回 EXIT_CODE=0 |
| monitor/index.tsx 移除 WS points 订阅 | ❌ | 仍使用 `useMonitorStream`，内部订阅 WS "points" topic |
| `use-monitor-stream.ts` 改为 HTTP 轮询 | ❌ | 仍使用 `sonarWSClient.send({action: "subscribe", topic: "points"})` |
| 使用新 K/V 压缩格式（CompressedPointsResponse） | ❌ | `use-monitor-stream.ts` 使用旧 `AggregationAPIResponse`（metrics 扁平数组格式） |

## ⚠️ 发现的问题

### 🟡 警告1（不阻断）—— WS points 订阅未移除

**文件**: `site/src/shared/hooks/use-monitor-stream.ts:168-172`

```typescript
// Subscribe to "points" topic for real-time aggregation data
sonarWSClient.send({
  action: "subscribe",
  topic: "points",
  params: { tapIds: [tapId], granularity },
});
```

monitor/index.tsx 仍使用 `useMonitorStream`，该 hook 内部仍然订阅 WS "points" topic。Task #21 要求移除此订阅，改为 HTTP 轮询。

**严重性**: 🟡 警告（功能可用，但设计偏差）

### 🟡 警告2（不阻断）—— 未使用新 K/V 压缩格式

**文件**: `site/src/shared/hooks/use-monitor-stream.ts:44-56`

`use-monitor-stream.ts` 中的 `AggregationAPIResponse` 类型期望后端返回：
```typescript
data: {
  metrics: Array<{ name, labels, points: [{timestamp, value}] }>
}
```

但新后端返回的是 K/V 压缩格式（`metrics: {k: [], v: []}`），两者格式不一致。
新建的 `points-compressed.ts` / `points-api.ts` 文件**已创建但未被 `use-monitor-stream.ts` 引用**。

**严重性**: 🟡 警告（新文件存在但未集成）

### 🟡 警告3（不阻断）—— API 端点路径不一致

`points-api.ts` 调用 `POST /api/v1/points/query`，  
`use-monitor-stream.ts` 调用 `GET /api/v1/aggregation/metrics`，  
后端实际路由为 `GET /api/v1/aggregation/points`。  
三者路径均不一致，集成测试时会遇到 404 问题。

## 总体评估

**PARTIAL** 🟡

**正面**：
- ✅ 三个新工具文件（points-compressed.ts、aggregation-config.ts、points-api.ts）已正确实现，代码质量高
- ✅ TypeScript 编译 100% 通过（EXIT_CODE=0）
- ✅ K/V 解压逻辑完整（createCompressedDataIndex + getPointsFromIndex + decompressPoints）
- ✅ AGGREGATION_LEVELS 包含正确的 7 个级别

**待完成**：
- ❌ `use-monitor-stream.ts` 未迁移到使用新压缩格式 API
- ❌ monitor/index.tsx 中 WS points 订阅未移除
- ❌ 三个文件的新工具函数已就绪，但实际未被监控页面使用

**结论**：新工具层已高质量完成，但监控页面数据层迁移（Hook 重写）尚未完成，属于 Task #21 的核心目标。
