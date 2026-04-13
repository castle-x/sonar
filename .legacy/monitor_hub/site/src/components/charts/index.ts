/**
 * ============================================
 * 图表组件导出
 * ============================================
 * 
 * 统一导出所有图表相关的组件、Hooks 和工具函数
 * 
 * @example
 * ```typescript
 * import { 
 *   LineChart, 
 *   AreaChart,
 *   useYAxisWidth,
 *   formatShortTime 
 * } from '@/components/charts'
 * ```
 */

// ============================================
// 基础组件
// ============================================

export {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	ChartLegend,
	ChartLegendContent,
	createXAxis,
	type ChartConfig,
} from './chart-base'

// ============================================
// 图表组件
// ============================================

export { default as LineChart } from './line-chart'
export type { LineChartProps, LineDataPoint } from './line-chart'

export { default as AreaChart } from './area-chart'
export type { AreaChartProps, AreaDataPoint } from './area-chart'

export { default as ScatterChart } from './scatter-chart'
export type { ScatterChartProps, ScatterDataPoint } from './scatter-chart'

// ============================================
// 指标图表网格（通用组件）
// ============================================

export { MetricChartsGrid } from './metric-charts-grid'
export type { MetricChartsGridProps, MetricData } from './metric-charts-grid'

// ============================================
// Hooks
// ============================================

export {
	useYAxisWidth,
	useChartColors,
	useChartTheme,
	type ChartTheme,
} from './hooks'

// ============================================
// 标签筛选器
// ============================================

export { LabelSelector } from './label-selector'
export type { LabelSelectorProps } from './label-selector'

export { LabelSelectorButton } from './label-selector-button'
export type { LabelSelectorButtonProps } from './label-selector-button'

export {
	// 标签提取
	extractAvailableLabels,
	// 数据筛选
	filterPointsByLabels,
	// 时间序列分组
	generateSeriesKey,
	groupByTimeSeries,
	formatSeriesLabel,
	// 数据统计
	getLabelDistribution,
	getSuggestedLabelOrder,
} from './label-utils'

// ============================================
// 工具函数
// ============================================

export {
	// 时间格式化
	formatShortTime,
	formatShortDateTime,
	formatFullDateTime,
	
	// 数值格式化
	formatValue,
	formatPercentage,
	formatBytes,
	formatNumber,
	formatSmartNumber,
	
	// 数据处理
	calculateTimeTicks,
	filterDataByTime,
	downsampleData,
	fillMissingTimePoints,
} from './utils'

