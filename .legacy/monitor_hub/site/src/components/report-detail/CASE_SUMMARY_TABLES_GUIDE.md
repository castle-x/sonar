# CaseSummaryTablesCard 组件使用指南

## 📋 概述

`CaseSummaryTablesCard` 是一个用于报告详情页面的用例数据总览组件，它将所有用例的同名表格合并展示，方便用户对比不同用例的数据。

## ✨ 功能特性

1. **表格合并**：自动合并所有用例的同名表格，用例名作为第一列
2. **标签页切换**：支持通过标签页切换不同类型的表格（如：机器人汇总、进程CPU、进程内存等）
3. **用例筛选**：支持通过复选框筛选要显示的用例
4. **表格排序**：点击列头可按该列升序/降序排序
5. **数据导出**：支持复制到剪贴板和导出为 CSV 文件
6. **滚动优化**：表格默认显示5行，超出部分支持滚动查看
7. **自定义滚动条**：使用 `case-tabs-scroll` 样式类，提供美观的滚动条

## 📦 数据结构

### 输入数据类型

```typescript
interface CaseTableData {
  /** 用例信息 */
  caseInfo: SingleCase
  /** 该用例的所有表格 */
  tables: SummaryTable[]
}

interface SummaryTable {
  /** 表格名称 */
  name: string
  /** 表格数据（二维数组，第一行是表头） */
  table: string[][]
}
```

### 输出数据结构

组件内部会将输入数据转换为合并后的表格：

```typescript
interface MergedTableData {
  /** 表格名称 */
  name: string
  /** 表头（包含"用例"列） */
  headers: string[]
  /** 数据行（每行第一个元素是用例名） */
  rows: string[][]
}
```

## 🔧 使用方法

### 基础用法

```tsx
import { CaseSummaryTablesCard, type CaseTableData } from '@/components/report-detail/case-summary-tables-card'

// 准备数据
const caseTablesData: CaseTableData[] = [
  {
    caseInfo: { name: 'all_24p', ... },
    tables: [
      {
        name: '机器人汇总',
        table: [
          ['ip', 'host', '平均CPU', '最小CPU', '最大CPU'],
          ['10.0.1.16', 'VM-1-16', '4.56%', '6.00%', '41.44%'],
          ['10.0.1.17', 'VM-1-17', '5.20%', '7.10%', '45.30%'],
        ]
      },
      // ... 更多表格
    ]
  },
  {
    caseInfo: { name: 'move_24p', ... },
    tables: [
      // ... 同名表格
    ]
  },
  // ... 更多用例
]

// 渲染组件
<CaseSummaryTablesCard caseTablesData={caseTablesData} />
```

### 在 ReportChartsCard 中集成

```tsx
// 在 ReportChartsCard 组件中
const caseTablesData = useMemo((): CaseTableData[] => {
  const data: CaseTableData[] = []
  
  for (const caseInfo of cases) {
    if (!caseInfo?.chunk_id) continue
    
    const chunk = loadedChunks.get(caseInfo.chunk_id)
    if (!chunk) continue
    
    // 只提取表格数据，不需要 points
    const tables = chunk.t || []
    
    data.push({
      caseInfo,
      tables
    })
  }
  
  return data
}, [cases, loadedChunks])

// 渲染
{showSummaryTables && caseTablesData.length > 0 && (
  <CaseSummaryTablesCard caseTablesData={caseTablesData} />
)}
```

## 🎨 UI 特性

### 表格排序

- 点击列头可切换排序：未排序 → 升序 → 降序 → 未排序
- 支持数值排序和字符串排序（自动识别）
- 排序列会高亮显示

### 用例筛选

- 点击"用例"按钮打开筛选菜单
- 支持多选/取消选择用例
- 全选时显示所有用例
- 筛选后会显示选中数量

### 复制和导出

- **复制**：点击复制按钮，表格数据会以制表符分隔的格式复制到剪贴板（可直接粘贴到 Excel）
- **导出**：点击导出按钮，表格数据会导出为 CSV 文件

### 滚动条样式

使用 `case-tabs-scroll` 类实现：
- 默认隐藏，鼠标悬停时显示
- 纤细圆润（高度 6px，圆角 3px）
- 平滑过渡动画
- 深色模式自适应

## 📝 注意事项

1. **表格结构一致性**：假设所有用例的同名表格结构相同（列数和列名一致）
2. **性能优化**：
   - 使用 `useMemo` 缓存合并后的表格数据
   - 只在 `loadedChunks` 变化时重新计算
   - 表格滚动使用虚拟化（通过 CSS `max-height`）
3. **数据提取**：只提取 `chunk.t`（表格数据），不需要 `chunk.p`（数据点）
4. **空状态处理**：如果没有表格数据，组件会自动隐藏（返回 `null`）

## 🔄 数据流

```
报告详情页面
  ↓
ReportChartsCard
  ↓ (预加载所有 chunks)
loadedChunks (Map<chunk_id, ChunkDataWithInfo>)
  ↓ (提取表格数据)
caseTablesData (CaseTableData[])
  ↓
CaseSummaryTablesCard
  ↓ (合并同名表格)
mergedTables (MergedTableData[])
  ↓ (应用筛选和排序)
渲染表格
```

## 🎯 设计原则

1. **可复用性**：复用现有的排序、筛选、导出逻辑
2. **性能优先**：避免重复加载 chunk 数据
3. **用户体验**：提供直观的交互和清晰的视觉反馈
4. **代码简洁**：单一职责，独立模块

## 🐛 调试技巧

如果表格不显示，检查以下几点：

1. `caseTablesData` 是否为空？
2. `chunk.t` 是否有数据？
3. `showSummaryTables` 是否为 `true`？
4. 浏览器控制台是否有错误？

```typescript
// 添加调试日志
console.log('caseTablesData:', caseTablesData)
console.log('mergedTables:', mergedTables)
```

## 📚 相关组件

- `SummaryTablesCard`：单个用例的表格展示组件
- `ReportChartsCard`：报告图表展示组件
- `CaseCharts`：单个用例的图表渲染组件

