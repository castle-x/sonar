# 图表组件模块

基于 **Beszel** 的图表实现，使用 **recharts** 库构建的通用图表组件系统。

## 📦 包含组件

### 基础组件
- `ChartContainer` - 图表容器
- `ChartTooltip` / `ChartTooltipContent` - 提示框
- `ChartLegend` / `ChartLegendContent` - 图例
- `createXAxis` - X 轴配置函数

### 图表组件
- `LineChart` - 折线图
- `AreaChart` - 面积图

### Hooks
- `useYAxisWidth` - 自动计算 Y 轴宽度
- `useChartColors` - 生成图表颜色
- `useChartTheme` - 获取图表主题

### 工具函数
- **时间格式化**: `formatShortTime`, `formatShortDateTime`, `formatFullDateTime`
- **数值格式化**: `formatPercentage`, `formatBytes`, `formatNumber`, `formatSmartNumber`
- **数据处理**: `calculateTimeTicks`, `filterDataByTime`, `downsampleData`, `fillMissingTimePoints`

## 🚀 快速开始

### 安装依赖

```bash
npm install recharts
```

### 基础使用

```typescript
import { LineChart } from '@/components/charts'

function MyChart() {
  const data = [
    { timestamp: 1699999999000, cpu: 45.2 },
    { timestamp: 1700000014000, cpu: 48.5 },
    { timestamp: 1700000029000, cpu: 52.1 },
  ]

  return (
    <div style={{ height: '300px', position: 'relative' }}>
      <LineChart
        data={data}
        dataPoints={[
          { label: 'CPU', dataKey: 'cpu', color: 1 }
        ]}
        xAxis={{
          dataKey: 'timestamp',
          domain: [data[0].timestamp, data[data.length - 1].timestamp],
        }}
        yAxis={{
          domain: [0, 100],
        }}
      />
    </div>
  )
}
```

## 📊 图表类型

### 1. 折线图 (LineChart)

适用于展示趋势变化，如 CPU 使用率、内存使用率等。

```typescript
<LineChart
  data={data}
  dataPoints={[
    {
      label: 'CPU 使用率',
      dataKey: 'cpu',
      color: 1,              // 使用 chart-1 颜色
      strokeWidth: 2,        // 线条宽度
      dot: false,            // 不显示数据点
    }
  ]}
  xAxis={{
    dataKey: 'timestamp',
    domain: [startTime, endTime],
    tickFormatter: formatShortTime,
  }}
  yAxis={{
    domain: [0, 100],
    tickFormatter: (value) => `${value}%`,
  }}
  tooltip={{
    labelFormatter: (_, payload) => formatShortTime(payload[0].payload.timestamp),
    contentFormatter: (item) => formatPercentage(item.value, 1),
  }}
  legend
/>
```

### 2. 面积图 (AreaChart)

适用于展示累积值或堆叠数据，如内存使用分布。

```typescript
<AreaChart
  data={data}
  dataPoints={[
    {
      label: '已使用',
      dataKey: 'used',
      color: 'hsl(0 84% 60%)',
      fillOpacity: 0.4,
      stackId: '1',          // 堆叠ID
    },
    {
      label: '缓存',
      dataKey: 'cache',
      color: 'hsl(160 60% 45%)',
      fillOpacity: 0.3,
      stackId: '1',
    }
  ]}
  xAxis={{
    dataKey: 'timestamp',
    domain: [startTime, endTime],
  }}
  yAxis={{
    tickFormatter: (value) => formatBytes(value),
  }}
  legend
/>
```

## 🎨 颜色系统

### 使用预定义颜色

```typescript
{
  color: 1,  // chart-1: 蓝色
  color: 2,  // chart-2: 青色
  color: 3,  // chart-3: 橙色
  // ... 最多 8 个预定义颜色
}
```

### 使用自定义颜色

```typescript
{
  color: 'hsl(220 70% 50%)',     // HSL 格式
  color: '#3b82f6',              // HEX 格式
  color: 'rgb(59, 130, 246)',    // RGB 格式
}
```

### 使用主题色

```typescript
import { useChartTheme } from '@/components/charts'

const theme = useChartTheme()
{
  color: theme.primary,    // 主色
  color: theme.success,    // 成功色（绿色）
  color: theme.error,      // 错误色（红色）
}
```

## 🔧 高级功能

### 1. 数据提取函数

当数据结构复杂时，可以使用函数提取值：

```typescript
{
  label: 'CPU (avg)',
  dataKey: (item) => {
    return item.points.find(p => 
      p.name === 'cpu_usage' && p.aggregation_type === 'avg'
    )?.value
  },
  color: 1
}
```

### 2. 动态 Y 轴宽度

图表会自动计算 Y 轴宽度，避免标签被截断：

```typescript
const { yAxisWidth, updateYAxisWidth } = useYAxisWidth()

<YAxis
  width={yAxisWidth}
  tickFormatter={(value) => updateYAxisWidth(formatBytes(value))}
/>
```

### 3. 自定义提示框

```typescript
tooltip={{
  labelFormatter: (value, payload) => {
    // 自定义标签格式
    return formatFullDateTime(payload[0].payload.timestamp)
  },
  contentFormatter: (item, key) => {
    // 自定义内容格式
    return `${item.value.toFixed(2)} ${item.unit}`
  },
  itemSorter: (a, b) => b.value - a.value, // 按值排序
}}
```

### 4. 数据降采样

处理大量数据点时，使用降采样提升性能：

```typescript
import { downsampleData } from '@/components/charts'

const sampledData = downsampleData(largeDataArray, 100)
```

### 5. 填充缺失时间点

```typescript
import { fillMissingTimePoints } from '@/components/charts'

const filledData = fillMissingTimePoints(
  data,
  startTime,
  endTime,
  15000,  // 15秒间隔
  'timestamp',
  { value: null }  // 缺失值默认为 null
)
```

## 📐 布局建议

### 图表容器高度

```typescript
// 小型图表
<div style={{ height: '200px', position: 'relative' }}>
  <LineChart ... />
</div>

// 中型图表
<div style={{ height: '300px', position: 'relative' }}>
  <LineChart ... />
</div>

// 大型图表
<div style={{ height: '400px', position: 'relative' }}>
  <LineChart ... />
</div>
```

### 响应式布局

```typescript
<div className="h-[200px] sm:h-[250px] md:h-[300px] relative">
  <LineChart ... />
</div>
```

## 🎯 与聚合数据集成

### 从 points API 获取数据并绘制

```typescript
import { queryPoints } from '@/apis/points'
import { LineChart, formatShortTime } from '@/components/charts'

function MetricChart({ datasourceId, metricName }: Props) {
  const [chartData, setChartData] = useState([])

  useEffect(() => {
    const fetchData = async () => {
      const result = await queryPoints({
        datasource_id: datasourceId,
        level: '1m',
        start_time: Date.now() - 3600000,
        end_time: Date.now(),
        metric_names: [metricName],
        aggregation_types: ['avg'],
      })

      // 转换为图表格式
      const data = result.points.map(point => ({
        timestamp: point.timestamp,
        value: point.value,
      }))

      setChartData(data)
    }

    fetchData()
  }, [datasourceId, metricName])

  return (
    <div style={{ height: '300px', position: 'relative' }}>
      <LineChart
        data={chartData}
        dataPoints={[
          { label: metricName, dataKey: 'value', color: 1 }
        ]}
        xAxis={{
          dataKey: 'timestamp',
          tickFormatter: formatShortTime,
        }}
      />
    </div>
  )
}
```

### 实时更新（WebSocket）

```typescript
import { subscribePoints } from '@/apis/points'
import { LineChart } from '@/components/charts'

function RealtimeChart({ datasourceId }: Props) {
  const [data, setData] = useState([])

  useEffect(() => {
    const unsubscribe = subscribePoints(
      {
        datasource_id: datasourceId,
        aggregation_levels: ['15s'],
        aggregation_types: ['avg'],
      },
      (broadcast) => {
        setData(prev => {
          const newData = broadcast.points.map(p => ({
            timestamp: p.timestamp,
            value: p.value,
          }))
          // 保留最近 100 个点
          return [...prev, ...newData].slice(-100)
        })
      }
    )

    return () => unsubscribe()
  }, [datasourceId])

  return (
    <div style={{ height: '300px', position: 'relative' }}>
      <LineChart
        data={data}
        dataPoints={[
          { label: '实时数据', dataKey: 'value', color: 1 }
        ]}
        xAxis={{
          dataKey: 'timestamp',
        }}
      />
    </div>
  )
}
```

## 🐛 常见问题

### 1. 图表不显示

确保容器有明确的高度：

```typescript
<div style={{ height: '300px', position: 'relative' }}>
  <LineChart ... />
</div>
```

### 2. Y 轴标签被截断

使用 `useYAxisWidth` Hook 自动计算宽度。

### 3. 数据点过多导致性能问题

使用 `downsampleData` 进行降采样：

```typescript
import { downsampleData } from '@/components/charts'

const sampledData = downsampleData(data, 200)
```

### 4. 时间轴刻度显示不正确

使用 `calculateTimeTicks` 生成合适的刻度：

```typescript
import { calculateTimeTicks } from '@/components/charts'

const ticks = calculateTimeTicks(startTime, endTime, 6)
```

## 📚 参考资料

- [Recharts 官方文档](https://recharts.org/)
- [Beszel 项目](https://github.com/henrygd/beszel)
- [Shadcn/ui Chart](https://ui.shadcn.com/docs/components/chart)

## ✨ 未来计划

- [ ] 添加柱状图组件
- [ ] 添加饼图组件
- [ ] 添加散点图组件
- [ ] 支持更多自定义选项
- [ ] 添加图表导出功能

