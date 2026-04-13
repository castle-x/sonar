// 简单折线图组件

import { useMemo } from 'react'

interface DataPoint {
  timestamp: number
  value: number
  label?: string
}

interface LineChartProps {
  data: DataPoint[]
  width?: number
  height?: number
  color?: string
  showGrid?: boolean
  showLabels?: boolean
}

export function LineChart({
  data,
  width = 800,
  height = 300,
  color = '#6366f1',
  showGrid = true,
  showLabels = true,
}: LineChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null

    // 按时间排序
    const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp)

    const values = sortedData.map((d) => d.value)
    const minValue = Math.min(...values)
    const maxValue = Math.max(...values)
    const valueRange = maxValue - minValue || 1

    const minTime = sortedData[0].timestamp
    const maxTime = sortedData[sortedData.length - 1].timestamp
    const timeRange = maxTime - minTime || 1

    const padding = { top: 20, right: 40, bottom: 40, left: 60 }
    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    // 计算点的位置
    const points = sortedData.map((d) => ({
      x: padding.left + ((d.timestamp - minTime) / timeRange) * chartWidth,
      y: padding.top + (1 - (d.value - minValue) / valueRange) * chartHeight,
      timestamp: d.timestamp,
      value: d.value,
      label: d.label,
    }))

    // 生成路径
    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

    // 生成填充区域
    const areaD = `${pathD} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${padding.left} ${padding.top + chartHeight} Z`

    // Y轴刻度
    const yTicks = Array.from({ length: 5 }, (_, i) => {
      const value = minValue + (valueRange * (4 - i)) / 4
      const y = padding.top + (i / 4) * chartHeight
      return { value, y }
    })

    // X轴刻度
    const xTicks = Array.from({ length: 5 }, (_, i) => {
      const time = minTime + (timeRange * i) / 4
      const x = padding.left + (i / 4) * chartWidth
      return { time, x }
    })

    return {
      points,
      pathD,
      areaD,
      yTicks,
      xTicks,
      padding,
      chartWidth,
      chartHeight,
    }
  }, [data, width, height])

  if (!chartData || data.length === 0) {
    return (
      <div className="chart-empty" style={{ width, height }}>
        <div className="chart-empty-text">暂无数据</div>
      </div>
    )
  }

  const formatTime = (ts: number) => {
    const date = new Date(ts * 1000)
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  const formatValue = (v: number) => {
    if (Math.abs(v) >= 1000000) return (v / 1000000).toFixed(1) + 'M'
    if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + 'K'
    return v.toFixed(2)
  }

  return (
    <svg className="line-chart" width={width} height={height}>
      {/* 背景 */}
      <rect x={0} y={0} width={width} height={height} fill="#1a1a2e" rx={8} />

      {/* 网格线 */}
      {showGrid && (
        <g className="grid">
          {chartData.yTicks.map((tick, i) => (
            <line
              key={`y-${i}`}
              x1={chartData.padding.left}
              y1={tick.y}
              x2={chartData.padding.left + chartData.chartWidth}
              y2={tick.y}
              stroke="#333"
              strokeDasharray="4,4"
            />
          ))}
          {chartData.xTicks.map((tick, i) => (
            <line
              key={`x-${i}`}
              x1={tick.x}
              y1={chartData.padding.top}
              x2={tick.x}
              y2={chartData.padding.top + chartData.chartHeight}
              stroke="#333"
              strokeDasharray="4,4"
            />
          ))}
        </g>
      )}

      {/* 填充区域 */}
      <path d={chartData.areaD} fill={`${color}20`} />

      {/* 折线 */}
      <path d={chartData.pathD} fill="none" stroke={color} strokeWidth={2} />

      {/* 数据点 */}
      {chartData.points.map((p, i) => (
        <g key={i} className="data-point">
          <circle cx={p.x} cy={p.y} r={4} fill={color} stroke="#1a1a2e" strokeWidth={2} />
          <title>
            {formatTime(p.timestamp)}: {formatValue(p.value)}
            {p.label ? ` (${p.label})` : ''}
          </title>
        </g>
      ))}

      {/* Y轴标签 */}
      {showLabels && (
        <g className="y-labels">
          {chartData.yTicks.map((tick, i) => (
            <text
              key={i}
              x={chartData.padding.left - 10}
              y={tick.y + 4}
              textAnchor="end"
              fill="#888"
              fontSize={11}
            >
              {formatValue(tick.value)}
            </text>
          ))}
        </g>
      )}

      {/* X轴标签 */}
      {showLabels && (
        <g className="x-labels">
          {chartData.xTicks.map((tick, i) => (
            <text
              key={i}
              x={tick.x}
              y={chartData.padding.top + chartData.chartHeight + 20}
              textAnchor="middle"
              fill="#888"
              fontSize={11}
            >
              {formatTime(tick.time)}
            </text>
          ))}
        </g>
      )}
    </svg>
  )
}
