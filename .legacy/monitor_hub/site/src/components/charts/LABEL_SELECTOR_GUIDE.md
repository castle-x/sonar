# 标签筛选器使用指南

## 🎯 概述

标签筛选器（Label Selector）是一个表格式的标签值选择组件，用于从大量时间序列数据中筛选出特定的序列。

## 📦 核心功能

- ✅ **表格式展示**：以列的形式展示标签键，每行显示一个标签值
- ✅ **多选支持**：可以同时选择多个标签值
- ✅ **实时反馈**：立即显示匹配的序列数量
- ✅ **快速清空**：一键清除所有筛选条件
- ✅ **已选标签展示**：底部显示当前筛选条件，可单独移除

## 🚀 快速开始

### 1. 基础使用

```typescript
import { LabelSelector, extractAvailableLabels } from '@/components/charts'
import type { AggregatedPoint } from '@/apis/points'

function MyComponent() {
  const [points, setPoints] = useState<AggregatedPoint[]>([])
  const [selectedLabels, setSelectedLabels] = useState<Record<string, string[]>>({})
  
  // 从数据中提取可用标签
  const availableLabels = extractAvailableLabels(points)
  
  // 筛选后的数据
  const filteredPoints = filterPointsByLabels(points, selectedLabels)
  
  // 按时间序列分组
  const series = groupByTimeSeries(filteredPoints)
  
  return (
    <LabelSelector
      availableLabels={availableLabels}
      selectedLabels={selectedLabels}
      onSelectionChange={setSelectedLabels}
      matchedSeriesCount={series.size}
    />
  )
}
```

### 2. 完整示例（带图表）

参考 `label-selector-test.tsx` 文件查看完整的集成示例。

## 🧪 测试调试

### 访问测试页面

1. 启动开发服务器：
   ```bash
   npm run dev
   ```

2. 访问测试页面：
   ```
   http://localhost:5173/label-selector-test
   ```

### 测试功能清单

- [ ] **多选功能**：点击多个标签值，验证是否正确选中
- [ ] **取消选择**：点击已选中的标签值，验证是否取消选中
- [ ] **实时反馈**：观察顶部的"匹配序列数"是否实时更新
- [ ] **清空筛选**：点击"清空筛选"按钮，验证是否清除所有选择
- [ ] **底部标签展示**：验证底部是否正确显示已选标签
- [ ] **单独移除**：点击底部标签的 × 按钮，验证是否移除单个标签
- [ ] **切换指标**：切换不同指标，验证标签值是否正确更新
- [ ] **筛选结果**：验证筛选后的序列是否符合预期

## 📐 数据结构说明

### 输入数据格式

```typescript
interface AggregatedPoint {
  datasource_id: string
  name: string              // 指标名称
  labels: Record<string, string>  // 标签（键值对）
  level: string
  timestamp: number
  aggregation_type: 'avg' | 'min' | 'max' | 'sum' | 'last'
  value: number
  quality: DataQuality
}
```

### 标签格式

```typescript
{
  ip: ['192.168.1.1', '192.168.1.2'],
  pid: ['12', '123'],
  host: ['server-01', 'server-02']
}
```

### 唯一序列键格式

```
datasource_id|metric_name|label1=value1,label2=value2
```

**示例**：
```
ds-001|cpu_percent|host=server-01,ip=192.168.1.1,pid=12
```

## 🎨 UI 组件说明

### 顶部信息栏

显示已选择的标签值数量和匹配的序列数，提供清空筛选按钮。

```
┌─────────────────────────────────────────────────────────────┐
│ 标签筛选        已选择: 3 个标签值 · 匹配: 5 条序列  [清空筛选] │
└─────────────────────────────────────────────────────────────┘
```

### 标签表格

- **表头**：显示标签键名称，已选值旁边显示数量徽章
- **单元格**：显示标签值，点击切换选中状态
  - 灰色背景 = 未选中
  - 蓝色背景 = 已选中
- **空单元格**：不同列的标签值数量可能不同，空位显示为空单元格

### 底部标签栏

显示当前所有筛选条件，每个标签值可以单独移除。

```
┌─────────────────────────────────────────────────────────────┐
│ 当前筛选条件:                                                │
│ [ip=192.168.1.1 ×] [pid=12 ×] [host=server-01 ×]           │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 工具函数说明

### extractAvailableLabels

从数据点中提取所有可用的标签。

```typescript
const availableLabels = extractAvailableLabels(points)
// 返回: { ip: Set(['192.168.1.1', '192.168.1.2']), ... }
```

### filterPointsByLabels

根据选中的标签筛选数据点。

```typescript
const filtered = filterPointsByLabels(points, {
  ip: ['192.168.1.1'],
  pid: ['12', '123']
})
```

### groupByTimeSeries

按时间序列分组数据点。

```typescript
const series = groupByTimeSeries(points)
// 返回: Map<seriesKey, AggregatedPoint[]>
```

### formatSeriesLabel

格式化序列标签（用于图表显示）。

```typescript
formatSeriesLabel('ds-001|cpu_percent|ip=192.168.1.1,pid=12')
// 返回: "cpu_percent {ip=192.168.1.1, pid=12}"
```

## ⚙️ 配置选项

### LabelSelector Props

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `availableLabels` | `Record<string, Set<string>>` | ✅ | 可用的标签值 |
| `selectedLabels` | `Record<string, string[]>` | ✅ | 当前选中的标签值 |
| `onSelectionChange` | `(selected) => void` | ✅ | 选择变化回调 |
| `matchedSeriesCount` | `number` | ✅ | 匹配的序列数量 |
| `maxHeight` | `string` | ❌ | 最大高度，默认 `400px` |

## 💡 最佳实践

### 1. 性能优化

```typescript
// 使用 useMemo 缓存计算结果
const availableLabels = useMemo(() => 
  extractAvailableLabels(points),
  [points]
)

const filteredData = useMemo(() => 
  filterPointsByLabels(points, selectedLabels),
  [points, selectedLabels]
)
```

### 2. 数据加载

```typescript
// 从 API 获取数据
useEffect(() => {
  const fetchData = async () => {
    const result = await queryPoints({
      datasource_id: 'ds-001',
      level: '1m',
      start_time: Date.now() - 3600000,
      end_time: Date.now(),
    })
    setPoints(result.points)
  }
  
  fetchData()
}, [])
```

### 3. 初始筛选

```typescript
// 设置初始筛选条件
useEffect(() => {
  if (availableLabels.ip) {
    // 默认选择第一个 IP
    const firstIp = Array.from(availableLabels.ip)[0]
    setSelectedLabels({ ip: [firstIp] })
  }
}, [availableLabels])
```

## 🐛 常见问题

### 1. 标签值没有显示

**原因**：数据中可能缺少业务标签（所有标签都是内部标签，以 `__` 开头）

**解决**：检查数据源的标签配置，确保有业务标签

### 2. 筛选结果为空

**原因**：选中的标签组合在数据中不存在

**解决**：放宽筛选条件，或检查数据是否正确

### 3. 性能问题（标签值过多）

**原因**：标签值数量过多（如 IP 地址有几千个）

**解决**：
- 使用虚拟滚动（后续优化）
- 添加搜索框过滤标签值
- 限制显示的标签值数量

## 🔗 相关文档

- [图表组件 README](./README.md)
- [API 文档 - points.ts](../../apis/points.ts)
- [测试页面源码](../routes/label-selector-test.tsx)

## 📅 TODO

- [ ] 添加搜索框过滤标签值
- [ ] 实现虚拟滚动（优化大量标签的性能）
- [ ] 添加标签值排序功能（按出现频率/字母顺序）
- [ ] 支持键盘快捷键（全选/反选）
- [ ] 添加标签值的统计信息（出现次数）

