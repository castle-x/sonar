/**
 * ============================================
 * 图表组件使用示例
 * ============================================
 * 
 * 展示如何使用图表组件绘制各种类型的图表
 * 
 * 注意：这个文件仅用于示例参考，不会在实际应用中使用
 */

import LineChart from './line-chart'
import AreaChart from './area-chart'
import {
	formatShortTime,
	formatPercentage,
	formatBytes,
	calculateTimeTicks,
} from './utils'

// ============================================
// 示例 1：简单折线图（CPU 使用率）
// ============================================

function Example1_SimpleLineChart() {
	// 模拟数据
	const data = [
		{ timestamp: 1699999999000, cpu: 45.2 },
		{ timestamp: 1700000014000, cpu: 48.5 },
		{ timestamp: 1700000029000, cpu: 52.1 },
		{ timestamp: 1700000044000, cpu: 49.8 },
		{ timestamp: 1700000059000, cpu: 51.3 },
	]

	const startTime = data[0].timestamp
	const endTime = data[data.length - 1].timestamp

	return (
		<div style={{ height: '300px', position: 'relative' }}>
			<LineChart
				data={data}
				dataPoints={[
					{
						label: 'CPU 使用率',
						dataKey: 'cpu',
						color: 1, // 使用 chart-1 颜色
						strokeWidth: 2,
					},
				]}
				xAxis={{
					dataKey: 'timestamp',
					domain: [startTime, endTime],
					ticks: calculateTimeTicks(startTime, endTime, 5),
					tickFormatter: formatShortTime,
				}}
				yAxis={{
					domain: [0, 100],
					tickFormatter: (value) => formatPercentage(value, 0),
				}}
				tooltip={{
					labelFormatter: (_, payload) => formatShortTime(payload[0].payload.timestamp),
					contentFormatter: (item) => formatPercentage(item.value, 1),
				}}
			/>
		</div>
	)
}

// ============================================
// 示例 2：多折线图（CPU + 内存）
// ============================================

function Example2_MultiLineChart() {
	const data = [
		{ timestamp: 1699999999000, cpu: 45.2, memory: 60.5 },
		{ timestamp: 1700000014000, cpu: 48.5, memory: 62.1 },
		{ timestamp: 1700000029000, cpu: 52.1, memory: 61.8 },
		{ timestamp: 1700000044000, cpu: 49.8, memory: 63.2 },
		{ timestamp: 1700000059000, cpu: 51.3, memory: 64.0 },
	]

	const startTime = data[0].timestamp
	const endTime = data[data.length - 1].timestamp

	return (
		<div style={{ height: '300px', position: 'relative' }}>
			<LineChart
				data={data}
				dataPoints={[
					{
						label: 'CPU',
						dataKey: 'cpu',
						color: 1,
					},
					{
						label: '内存',
						dataKey: 'memory',
						color: 2,
					},
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
				legend // 显示图例
			/>
		</div>
	)
}

// ============================================
// 示例 3：堆叠面积图（内存使用情况）
// ============================================

function Example3_StackedAreaChart() {
	const data = [
		{ timestamp: 1699999999000, used: 2048, cache: 1024, free: 1024 },
		{ timestamp: 1700000014000, used: 2200, cache: 1100, free: 900 },
		{ timestamp: 1700000029000, used: 2150, cache: 1200, free: 850 },
		{ timestamp: 1700000044000, used: 2300, cache: 1000, free: 900 },
		{ timestamp: 1700000059000, used: 2400, cache: 1150, free: 650 },
	]

	const startTime = data[0].timestamp
	const endTime = data[data.length - 1].timestamp

	return (
		<div style={{ height: '300px', position: 'relative' }}>
			<AreaChart
				data={data}
				dataPoints={[
					{
						label: '已使用',
						dataKey: 'used',
						color: 'hsl(0 84% 60%)',
						fillOpacity: 0.4,
						stackId: '1',
						order: 3,
					},
					{
						label: '缓存',
						dataKey: 'cache',
						color: 'hsl(160 60% 45%)',
						fillOpacity: 0.3,
						stackId: '1',
						order: 2,
					},
					{
						label: '空闲',
						dataKey: 'free',
						color: 'hsl(142 76% 36%)',
						fillOpacity: 0.2,
						stackId: '1',
						order: 1,
					},
				]}
				xAxis={{
					dataKey: 'timestamp',
					domain: [startTime, endTime],
					tickFormatter: formatShortTime,
				}}
				yAxis={{
					tickFormatter: (value) => formatBytes(value * 1024 * 1024),
				}}
				tooltip={{
					labelFormatter: (_, payload) => formatShortTime(payload[0].payload.timestamp),
					contentFormatter: (item) => formatBytes(item.value * 1024 * 1024),
					// 按堆叠顺序排序
					itemSorter: (a: any, b: any) => (b.payload.order || 0) - (a.payload.order || 0),
				}}
				legend
			/>
		</div>
	)
}

// ============================================
// 示例 4：从聚合数据点绘制图表
// ============================================

function Example4_AggregatedPointsChart() {
	// 模拟从 points API 获取的聚合数据
	const aggregatedPoints = [
		{
			datasource_id: 'ds-001',
			name: 'cpu_usage',
			labels: { host: 'server-1' },
			level: '15s',
			timestamp: 1699999999000,
			aggregation_type: 'avg' as const,
			value: 45.2,
		},
		{
			datasource_id: 'ds-001',
			name: 'cpu_usage',
			labels: { host: 'server-1' },
			level: '15s',
			timestamp: 1700000014000,
			aggregation_type: 'avg' as const,
			value: 48.5,
		},
		{
			datasource_id: 'ds-001',
			name: 'cpu_usage',
			labels: { host: 'server-1' },
			level: '15s',
			timestamp: 1700000029000,
			aggregation_type: 'avg' as const,
			value: 52.1,
		},
	]

	// 转换为图表数据格式
	const chartData = aggregatedPoints.map(point => ({
		timestamp: point.timestamp,
		value: point.value,
		name: point.name,
	}))

	const startTime = chartData[0].timestamp
	const endTime = chartData[chartData.length - 1].timestamp

	return (
		<div style={{ height: '300px', position: 'relative' }}>
			<LineChart
				data={chartData}
				dataPoints={[
					{
						label: 'CPU 使用率 (avg)',
						dataKey: 'value',
						color: 1,
					},
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
			/>
		</div>
	)
}

// ============================================
// 示例 5：多指标对比（使用数据提取函数）
// ============================================

function Example5_MultiMetricChart() {
	// 模拟多个聚合数据点（包含多种聚合类型）
	const data = [
		{
			timestamp: 1699999999000,
			points: [
				{ name: 'cpu_usage', aggregation_type: 'avg', value: 45.2 },
				{ name: 'cpu_usage', aggregation_type: 'max', value: 68.5 },
				{ name: 'memory_usage', aggregation_type: 'avg', value: 60.5 },
			],
		},
		{
			timestamp: 1700000014000,
			points: [
				{ name: 'cpu_usage', aggregation_type: 'avg', value: 48.5 },
				{ name: 'cpu_usage', aggregation_type: 'max', value: 72.1 },
				{ name: 'memory_usage', aggregation_type: 'avg', value: 62.1 },
			],
		},
	]

	const startTime = data[0].timestamp
	const endTime = data[data.length - 1].timestamp

	return (
		<div style={{ height: '300px', position: 'relative' }}>
			<LineChart
				data={data}
				dataPoints={[
					{
						label: 'CPU (avg)',
						dataKey: (item) => item.points.find((p: any) => 
							p.name === 'cpu_usage' && p.aggregation_type === 'avg'
						)?.value,
						color: 1,
					},
					{
						label: 'CPU (max)',
						dataKey: (item) => item.points.find((p: any) => 
							p.name === 'cpu_usage' && p.aggregation_type === 'max'
						)?.value,
						color: 1,
						strokeDasharray: '5 5', // 虚线
					},
					{
						label: '内存 (avg)',
						dataKey: (item) => item.points.find((p: any) => 
							p.name === 'memory_usage' && p.aggregation_type === 'avg'
						)?.value,
						color: 2,
					},
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
		</div>
	)
}

// ============================================
// 导出示例组件
// ============================================

export {
	Example1_SimpleLineChart,
	Example2_MultiLineChart,
	Example3_StackedAreaChart,
	Example4_AggregatedPointsChart,
	Example5_MultiMetricChart,
}

