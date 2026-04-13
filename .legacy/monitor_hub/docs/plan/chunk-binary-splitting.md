# Chunk 二进制分片方案

## 背景

MongoDB 单文档大小限制为 16MB (BSON)。当报告时间跨度长（如 24 小时）且进程数多时，
单个 Chunk 的 `compressed_data` 可能超过此限制，导致 `insert doc failed: an inserted document is too large` 错误。

## 方案：压缩后二进制分片

### 核心思路

不改变数据语义，纯粹在二进制层面操作：
1. 序列化 + 压缩后，检查 `compressedData` 大小
2. 若超过阈值（14MB），按固定大小切分为多段
3. 每段存为一个 Chunk 文档，用 `part_index` / `total_parts` 标识
4. 读取时，按 `part_index` 排序获取所有 parts → 拼接 bytes → 解压

### 阈值设定

- MongoDB BSON 限制: 16MB (16,777,216 bytes)
- Chunk 文档除 `compressed_data` 外的字段开销约: ~500 bytes
- BSON 编码 binary 数据的额外开销: ~100 bytes
- **安全阈值: 14MB (14,680,064 bytes)** — 留足余量

### 数据结构变更

#### Thrift

```thrift
// Chunk 新增分片字段
struct Chunk {
    // ... 原有字段 ...
    7: optional i32 part_index     // 分片索引（从0开始），nil表示未分片
    8: optional i32 total_parts    // 总分片数，nil表示未分片
}

// SingleCase: chunk_id → chunk_ids（向后兼容）
struct SingleCase {
    // ... 原有字段 ...
    5: optional string chunk_id          // [废弃，向后兼容读取]
    7: optional list<string> chunk_ids   // 新：支持多个chunk ID
}
```

#### 兼容性策略

- **写入**：始终使用 `chunk_ids`（即使只有一个 chunk）
- **读取**：优先读 `chunk_ids`，若为空则读旧的 `chunk_id`（兼容历史数据）
- **不需要数据迁移**：旧数据自动兼容

### 改动影响清单

| 文件 | 改动 | 说明 |
|------|------|------|
| `report.thrift` | Chunk 加字段, SingleCase 加 chunk_ids | 数据结构 |
| `handler.go processSingleCase` | 压缩后检查大小，超阈值分片存储 | 核心写入 |
| `handler.go getChunkData` | 支持多 chunk 合并读取 | 核心读取 |
| `handler.go GetReportChunkList` | 适配 chunk_ids | 列表读取 |
| `handler.go CalculateReportScore` | 适配 chunk_ids | 评分读取 |
| `handler.go recalculateReportScore` | 适配 chunk_ids | 评分读取 |
| `handler.go processReloadReport` | 删除多个旧 chunk | 重载删除 |
| `handler.go ForwardReport` | 适配 chunk_ids | 转发读取 |
| `handler.go ImportReport` | 适配 chunk_ids | 导入写入 |
| `report.ts` | 适配 chunk_ids | 前端 API |
| `report-charts-card.tsx` | 适配 chunk_ids | 前端组件 |
| `task-report-list.tsx` | 适配 chunk_ids | 前端组件 |

## 日期

2026-03-21
