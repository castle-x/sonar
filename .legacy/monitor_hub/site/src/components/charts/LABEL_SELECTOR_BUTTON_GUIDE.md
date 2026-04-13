# 标签筛选器按钮组件使用指南

## 📋 组件概述

`LabelSelectorButton` 是一个弹出式标签筛选器组件，通过按钮触发弹出 Dialog，展示完整的标签筛选表格。

### ✨ 特性

- ✅ **按钮触发**：点击按钮弹出筛选表格，节省页面空间
- ✅ **自适应宽度**：根据标签数量自动调整弹出框宽度（600px - 1400px）
- ✅ **选中计数**：按钮上显示已选标签数量
- ✅ **多种样式**：支持不同的按钮变体
- ✅ **完整功能**：包含所有标签筛选功能（多选、清空、实时反馈）

---

## 📦 安装使用

### 1. 导入组件

```typescript
import { LabelSelectorButton } from '@/components/charts'
```

### 2. 基础用法

```typescript
import { useState, useMemo } from 'react'
import { LabelSelectorButton } from '@/components/charts'
import {
  extractAvailableLabels,
  filterPointsByLabels,
  groupByTimeSeries,
} from '@/components/charts'

function MyComponent() {
  const [selectedLabels, setSelectedLabels] = useState({})
  
  // 提取可用标签
  const availableLabels = useMemo(
    () => extractAvailableLabels(dataPoints),
    [dataPoints]
  )
  
  // 过滤数据
  const filteredData = useMemo(
    () => filterPointsByLabels(dataPoints, selectedLabels),
    [dataPoints, selectedLabels]
  )
  
  // 统计序列数
  const series = useMemo(
    () => groupByTimeSeries(filteredData),
    [filteredData]
  )
  
  return (
    <LabelSelectorButton
      availableLabels={availableLabels}
      selectedLabels={selectedLabels}
      onSelectionChange={setSelectedLabels}
      matchedSeriesCount={series.size}
      buttonText="筛选标签"
    />
  )
}
```

---

## 🎨 Props API

| 属性 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `availableLabels` | `Record<string, Set<string>>` | ✅ | - | 所有可用的标签值 |
| `selectedLabels` | `Record<string, string[] \| undefined>` | ✅ | - | 当前选中的标签值 |
| `onSelectionChange` | `(selected) => void` | ✅ | - | 选择变化回调 |
| `matchedSeriesCount` | `number` | ✅ | - | 匹配的序列数量 |
| `buttonText` | `string` | ❌ | `'筛选标签'` | 按钮文本 |
| `buttonVariant` | `'default' \| 'outline' \| 'ghost' \| 'secondary'` | ❌ | `'outline'` | 按钮样式变体 |

---

## 💡 使用场景

### 场景 1：图表卡片工具栏

```typescript
<Card>
  <CardHeader>
    <div className="flex items-center justify-between">
      <CardTitle>CPU 使用率</CardTitle>
      <div className="flex gap-2">
        {/* 其他控制按钮 */}
        <Button variant="outline">刷新</Button>
        
        {/* 标签筛选器 */}
        <LabelSelectorButton
          availableLabels={availableLabels}
          selectedLabels={selectedLabels}
          onSelectionChange={setSelectedLabels}
          matchedSeriesCount={series.size}
        />
      </div>
    </div>
  </CardHeader>
  <CardContent>
    <LineChart data={filteredData} />
  </CardContent>
</Card>
```

### 场景 2：仪表盘页面筛选

```typescript
<div className="dashboard-header">
  <h1>系统监控仪表盘</h1>
  
  <div className="controls">
    {/* 时间范围选择 */}
    <Select>...</Select>
    
    {/* 聚合级别选择 */}
    <Select>...</Select>
    
    {/* 标签筛选器 */}
    <LabelSelectorButton
      availableLabels={availableLabels}
      selectedLabels={selectedLabels}
      onSelectionChange={setSelectedLabels}
      matchedSeriesCount={series.size}
      buttonVariant="default"
    />
  </div>
</div>
```

### 场景 3：多指标对比页面

```typescript
<div className="metrics-comparison">
  <div className="toolbar">
    <span>比较 {selectedMetrics.length} 个指标</span>
    
    <LabelSelectorButton
      availableLabels={availableLabels}
      selectedLabels={selectedLabels}
      onSelectionChange={setSelectedLabels}
      matchedSeriesCount={series.size}
      buttonText="筛选实例"
      buttonVariant="secondary"
    />
  </div>
  
  <div className="charts-grid">
    {selectedMetrics.map(metric => (
      <MetricChart key={metric} data={filteredData} />
    ))}
  </div>
</div>
```

---

## 🎯 设计特点

### 1. 自适应宽度算法

```typescript
// 根据标签数量动态计算弹出框宽度
const width = labelKeyCount === 0 
  ? '400px'  // 无标签时的默认宽度
  : `${Math.min(Math.max(labelKeyCount * 180, 600), 1400)}px`
  
// 计算逻辑：
// - 每列 180px
// - 最小宽度 600px（保证至少容纳3-4列）
// - 最大宽度 1400px（避免过宽）
```

**宽度示例**：
- 1 列标签: 600px（最小值）
- 3 列标签: 600px
- 5 列标签: 900px
- 8 列标签: 1400px（最大值）

### 2. 选中计数显示

```typescript
// 按钮上显示已选标签总数
{selectedCount > 0 && (
  <span className="badge">
    {selectedCount}
  </span>
)}
```

**视觉效果**：
- 未选中: `[🔍 筛选标签]`
- 已选中: `[🔍 筛选标签 (3)]` ← 蓝色数字徽章

### 3. Dialog 最大高度限制

```typescript
<DialogContent 
  className="max-h-[90vh] overflow-hidden"
>
  <LabelSelector maxHeight="calc(90vh - 200px)" />
</DialogContent>
```

**确保**：
- 弹出框不会超出视口
- 表格内部可滚动
- Header 和 Footer 始终可见

---

## 🔄 与嵌入式版本对比

| 特性 | 按钮式 (`LabelSelectorButton`) | 嵌入式 (`LabelSelector`) |
|------|-------------------------------|-------------------------|
| **占用空间** | ✅ 小（只显示按钮） | ❌ 大（完整表格） |
| **交互方式** | 点击弹出 | 直接交互 |
| **适用页面** | 仪表盘、图表卡片 | 配置页面、管理后台 |
| **宽度自适应** | ✅ 根据标签数量 | ❌ 固定或容器宽度 |
| **推荐场景** | 空间受限、频繁切换 | 详细配置、高级筛选 |

### 选择建议

**使用按钮式**（推荐）：
- ✅ 图表卡片上方
- ✅ 仪表盘页面
- ✅ 移动端页面
- ✅ 工具栏/控制栏

**使用嵌入式**：
- ✅ 数据源配置页面
- ✅ 高级筛选界面
- ✅ 管理后台
- ✅ 桌面端大屏幕

---

## 🎨 样式定制

### 按钮变体

```typescript
// 默认样式（适合工具栏）
<LabelSelectorButton buttonVariant="outline" />

// 主要样式（适合强调）
<LabelSelectorButton buttonVariant="default" />

// 次要样式（适合背景）
<LabelSelectorButton buttonVariant="secondary" />

// 幽灵样式（适合极简设计）
<LabelSelectorButton buttonVariant="ghost" />
```

### 自定义按钮文本

```typescript
<LabelSelectorButton buttonText="筛选进程" />
<LabelSelectorButton buttonText="Filter Labels" />
<LabelSelectorButton buttonText="🔍 筛选" />
```

---

## 📝 完整示例

### 示例 1：基础图表筛选

```typescript
import { useState, useMemo } from 'react'
import { LabelSelectorButton, LineChart } from '@/components/charts'
import {
  extractAvailableLabels,
  filterPointsByLabels,
  groupByTimeSeries,
} from '@/components/charts'

function CPUChart({ dataPoints }) {
  const [selectedLabels, setSelectedLabels] = useState({})
  
  // 提取标签
  const availableLabels = useMemo(
    () => extractAvailableLabels(dataPoints),
    [dataPoints]
  )
  
  // 过滤数据
  const filteredData = useMemo(
    () => filterPointsByLabels(dataPoints, selectedLabels),
    [dataPoints, selectedLabels]
  )
  
  // 统计序列
  const series = useMemo(
    () => groupByTimeSeries(filteredData),
    [filteredData]
  )
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>CPU 使用率</CardTitle>
          <LabelSelectorButton
            availableLabels={availableLabels}
            selectedLabels={selectedLabels}
            onSelectionChange={setSelectedLabels}
            matchedSeriesCount={series.size}
          />
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: '300px' }}>
          <LineChart data={filteredData} />
        </div>
      </CardContent>
    </Card>
  )
}
```

### 示例 2：多指标仪表盘

```typescript
function Dashboard() {
  const [selectedLabels, setSelectedLabels] = useState({})
  const [aggregationLevel, setAggregationLevel] = useState('1m')
  
  // 获取数据
  const { data: cpuData } = useQuery({ 
    metric: 'cpu_usage',
    level: aggregationLevel 
  })
  const { data: memoryData } = useQuery({ 
    metric: 'memory_usage',
    level: aggregationLevel 
  })
  
  // 全局标签筛选（应用到所有指标）
  const availableLabels = useMemo(() => {
    const allData = [...cpuData, ...memoryData]
    return extractAvailableLabels(allData)
  }, [cpuData, memoryData])
  
  const filteredCPU = useMemo(
    () => filterPointsByLabels(cpuData, selectedLabels),
    [cpuData, selectedLabels]
  )
  
  const filteredMemory = useMemo(
    () => filterPointsByLabels(memoryData, selectedLabels),
    [memoryData, selectedLabels]
  )
  
  const totalSeries = useMemo(() => {
    const allFiltered = [...filteredCPU, ...filteredMemory]
    return groupByTimeSeries(allFiltered).size
  }, [filteredCPU, filteredMemory])
  
  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>系统监控</h1>
        <div className="controls">
          <LabelSelectorButton
            availableLabels={availableLabels}
            selectedLabels={selectedLabels}
            onSelectionChange={setSelectedLabels}
            matchedSeriesCount={totalSeries}
            buttonVariant="default"
          />
        </div>
      </div>
      
      <div className="metrics-grid">
        <MetricCard title="CPU" data={filteredCPU} />
        <MetricCard title="内存" data={filteredMemory} />
      </div>
    </div>
  )
}
```

---

## ⚙️ 高级用法

### 1. 受控组件

```typescript
// 外部控制打开/关闭状态
const [isOpen, setIsOpen] = useState(false)

// 注意：当前版本不支持外部控制
// 如需此功能，可以提取 Dialog 状态到 props
```

### 2. 自定义弹出框样式

```typescript
// 修改组件源码中的 DialogContent 样式
<DialogContent 
  className="custom-dialog"
  style={{
    width: customWidth,
    maxHeight: customHeight,
  }}
/>
```

### 3. 响应式设计

```typescript
// 根据屏幕尺寸调整按钮
const isMobile = useMediaQuery('(max-width: 768px)')

<LabelSelectorButton
  buttonText={isMobile ? "筛选" : "筛选标签"}
  buttonVariant={isMobile ? "ghost" : "outline"}
/>
```

---

## 🐛 常见问题

### Q: 弹出框宽度不合适？

**A:** 修改 `label-selector-button.tsx` 中的宽度计算逻辑：

```typescript
// 调整每列宽度、最小/最大值
width: `${Math.min(Math.max(labelKeyCount * 200, 800), 1600)}px`
```

### Q: 如何隐藏选中计数？

**A:** 修改组件源码，注释掉徽章部分：

```typescript
{/* {selectedCount > 0 && (
  <span>...</span>
)} */}
```

### Q: 如何自定义按钮图标？

**A:** 修改 `label-selector-button.tsx` 中的 SVG：

```typescript
<svg>...</svg>  // 替换为你的图标
```

---

## 📚 相关文档

- [标签筛选器使用指南](./LABEL_SELECTOR_GUIDE.md)
- [标签工具函数文档](./label-utils.ts)
- [图表组件文档](./README.md)

---

## ✅ 总结

`LabelSelectorButton` 是一个专为图表和仪表盘设计的标签筛选组件：

- ✅ **节省空间**：按钮形式，不占用页面垂直空间
- ✅ **自适应宽度**：根据标签数量智能调整
- ✅ **完整功能**：包含所有筛选功能
- ✅ **易于集成**：简单的 Props API
- ✅ **视觉反馈**：选中计数徽章

推荐在所有需要标签筛选的图表场景中使用！🎉

