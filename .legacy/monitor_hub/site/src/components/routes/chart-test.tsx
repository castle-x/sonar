/**
 * ============================================
 * 图表组件测试页面
 * ============================================
 * 
 * 测试不同类型的图表，集成标签筛选器
 * 每条线代表唯一的时间序列
 */

import { useState, useMemo } from 'react'
import { AreaChart, LabelSelectorButton } from '@/components/charts'
import {
	extractAvailableLabels,
	filterPointsByLabels,
	groupByTimeSeries,
	formatSeriesLabel,
	formatShortTime,
	formatFullDateTime,
	formatValue,
} from '@/components/charts'
import type { AggregatedPoint } from '@/apis/points'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

// ============================================
// 模拟数据生成器
// ============================================

/**
 * 生成时间序列数据
 */
function generateTimeSeriesData(
	metric: string,
	labels: Record<string, string>,
	startTime: number,
	points: number,
	interval: number,
	baseValue: number,
	variance: number
): AggregatedPoint[] {
	const data: AggregatedPoint[] = []
	
	for (let i = 0; i < points; i++) {
		const timestamp = startTime + i * interval
		// 生成波动数据，带有趋势
		const trend = Math.sin(i / 10) * variance * 0.3
		const random = (Math.random() - 0.5) * variance
		const value = Math.max(0, baseValue + trend + random)
		
		data.push({
			datasource_id: 'ds-test-001',
			name: metric,
			labels: {
				...labels,
				__aggregation_level__: '1m',
			},
			aggregation_type: 'avg',
			value,
			timestamp,
			level: '1m',
			quality: {
				actual_points: points,
				expected_points: points,
				score: 100,
				status: 'complete',
			},
		})
	}
	
	return data
}

/**
 * 生成 CPU 使用率数据（多个服务器和进程）
 */
function generateCPUData(): AggregatedPoint[] {
	const now = Date.now()
	const interval = 60000 // 1分钟
	const points = 60 // 60个点，1小时数据
	const startTime = now - points * interval
	
	const data: AggregatedPoint[] = []
	
	// 服务器1 - nginx 进程
	data.push(...generateTimeSeriesData(
		'cpu_percent',
		{ host: 'server-01', process: 'nginx', pid: '1234' },
		startTime,
		points,
		interval,
		25, // 基础值 25%
		15  // 波动范围 ±15%
	))
	
	// 服务器1 - mysql 进程
	data.push(...generateTimeSeriesData(
		'cpu_percent',
		{ host: 'server-01', process: 'mysql', pid: '5678' },
		startTime,
		points,
		interval,
		45, // 基础值 45%
		20  // 波动范围 ±20%
	))
	
	// 服务器2 - nginx 进程
	data.push(...generateTimeSeriesData(
		'cpu_percent',
		{ host: 'server-02', process: 'nginx', pid: '2345' },
		startTime,
		points,
		interval,
		30,
		15
	))
	
	// 服务器2 - redis 进程
	data.push(...generateTimeSeriesData(
		'cpu_percent',
		{ host: 'server-02', process: 'redis', pid: '6789' },
		startTime,
		points,
		interval,
		15,
		10
	))
	
	// 服务器3 - nodejs 进程
	data.push(...generateTimeSeriesData(
		'cpu_percent',
		{ host: 'server-03', process: 'nodejs', pid: '3456' },
		startTime,
		points,
		interval,
		55,
		25
	))
	
	return data
}

/**
 * 生成内存使用数据（多个服务器）
 */
function generateMemoryData(): AggregatedPoint[] {
	const now = Date.now()
	const interval = 60000
	const points = 60
	const startTime = now - points * interval
	
	const data: AggregatedPoint[] = []
	const GB = 1024 * 1024 * 1024
	
	// 服务器1 - 总内存 16GB
	data.push(...generateTimeSeriesData(
		'memory_used_bytes',
		{ host: 'server-01', type: 'used' },
		startTime,
		points,
		interval,
		10 * GB,
		2 * GB
	))
	
	// 服务器2 - 总内存 32GB
	data.push(...generateTimeSeriesData(
		'memory_used_bytes',
		{ host: 'server-02', type: 'used' },
		startTime,
		points,
		interval,
		20 * GB,
		4 * GB
	))
	
	// 服务器3 - 总内存 64GB
	data.push(...generateTimeSeriesData(
		'memory_used_bytes',
		{ host: 'server-03', type: 'used' },
		startTime,
		points,
		interval,
		40 * GB,
		8 * GB
	))
	
	return data
}

/**
 * 生成网络流量数据（多个接口）
 */
function generateNetworkData(): AggregatedPoint[] {
	const now = Date.now()
	const interval = 60000
	const points = 60
	const startTime = now - points * interval
	
	const data: AggregatedPoint[] = []
	const MB = 1024 * 1024
	
	// eth0 - 入站流量
	data.push(...generateTimeSeriesData(
		'network_bytes',
		{ host: 'server-01', interface: 'eth0', direction: 'in' },
		startTime,
		points,
		interval,
		100 * MB,
		50 * MB
	))
	
	// eth0 - 出站流量
	data.push(...generateTimeSeriesData(
		'network_bytes',
		{ host: 'server-01', interface: 'eth0', direction: 'out' },
		startTime,
		points,
		interval,
		80 * MB,
		40 * MB
	))
	
	// eth1 - 入站流量
	data.push(...generateTimeSeriesData(
		'network_bytes',
		{ host: 'server-01', interface: 'eth1', direction: 'in' },
		startTime,
		points,
		interval,
		50 * MB,
		25 * MB
	))
	
	// eth1 - 出站流量
	data.push(...generateTimeSeriesData(
		'network_bytes',
		{ host: 'server-01', interface: 'eth1', direction: 'out' },
		startTime,
		points,
		interval,
		40 * MB,
		20 * MB
	))
	
	return data
}

/**
 * 生成磁盘 I/O 数据（读写分离）
 */
function generateDiskIOData(): AggregatedPoint[] {
	const now = Date.now()
	const interval = 60000
	const points = 60
	const startTime = now - points * interval
	
	const data: AggregatedPoint[] = []
	const MB = 1024 * 1024
	
	// sda - 读取
	data.push(...generateTimeSeriesData(
		'disk_io_bytes',
		{ host: 'server-01', device: 'sda', operation: 'read' },
		startTime,
		points,
		interval,
		50 * MB,
		30 * MB
	))
	
	// sda - 写入
	data.push(...generateTimeSeriesData(
		'disk_io_bytes',
		{ host: 'server-01', device: 'sda', operation: 'write' },
		startTime,
		points,
		interval,
		80 * MB,
		40 * MB
	))
	
	// sdb - 读取
	data.push(...generateTimeSeriesData(
		'disk_io_bytes',
		{ host: 'server-01', device: 'sdb', operation: 'read' },
		startTime,
		points,
		interval,
		30 * MB,
		20 * MB
	))
	
	// sdb - 写入
	data.push(...generateTimeSeriesData(
		'disk_io_bytes',
		{ host: 'server-01', device: 'sdb', operation: 'write' },
		startTime,
		points,
		interval,
		60 * MB,
		30 * MB
	))
	
	return data
}

// ============================================
// 组件实现
// ============================================

export default function ChartTest() {
	// 生成测试数据
	const cpuData = useMemo(() => generateCPUData(), [])
	const memoryData = useMemo(() => generateMemoryData(), [])
	const networkData = useMemo(() => generateNetworkData(), [])
	const diskIOData = useMemo(() => generateDiskIOData(), [])
	
	// 标签筛选状态
	const [cpuLabels, setCpuLabels] = useState<Record<string, string[] | undefined>>({})
	const [memoryLabels, setMemoryLabels] = useState<Record<string, string[] | undefined>>({})
	const [networkLabels, setNetworkLabels] = useState<Record<string, string[] | undefined>>({})
	const [diskLabels, setDiskLabels] = useState<Record<string, string[] | undefined>>({})
	
	// 网格布局状态（1列或2列）
	const [gridCols, setGridCols] = useState<1 | 2>(2)
	
	// 全局图例控制状态
	const [legendVisible, setLegendVisible] = useState(false)
	
	// 图例位置根据布局自动决定：列表视图（1列）时在右侧，网格视图（2列）时在底部
	const legendPosition = gridCols === 1 ? 'right' : 'bottom'
	
	// ============================================
	// CPU 图表数据处理
	// ============================================
	
	const cpuAvailableLabels = useMemo(
		() => extractAvailableLabels(cpuData),
		[cpuData]
	)
	
	const filteredCpuData = useMemo(
		() => filterPointsByLabels(cpuData, cpuLabels),
		[cpuData, cpuLabels]
	)
	
	const cpuSeries = useMemo(
		() => groupByTimeSeries(filteredCpuData),
		[filteredCpuData]
	)
	
	// 为每个时间序列生成图表数据点
	const cpuChartData = useMemo(() => {
		const timeMap = new Map<number, any>()
		
		cpuSeries.forEach((points, seriesKey) => {
			points.forEach(point => {
				if (!timeMap.has(point.timestamp)) {
					timeMap.set(point.timestamp, { timestamp: point.timestamp })
				}
				const row = timeMap.get(point.timestamp)!
				row[seriesKey] = point.value
			})
		})
		
		return Array.from(timeMap.values()).sort((a, b) => a.timestamp - b.timestamp)
	}, [cpuSeries])
	
	const cpuDataPoints = useMemo(() => {
		return Array.from(cpuSeries.keys()).map((seriesKey, index) => {
			// 使用 HSL 颜色，确保每条线颜色不同且可见
			const hue = (index * 137.5) % 360  // 黄金角度分布
			const color = `hsl(${hue}, 70%, 50%)`
			const labels = formatSeriesLabel(seriesKey)
			return {
				label: labels.truncated,
				fullLabel: labels.full,
				dataKey: seriesKey,
				color,
			}
		})
	}, [cpuSeries])
	
	// ============================================
	// 内存图表数据处理
	// ============================================
	
	const memoryAvailableLabels = useMemo(
		() => extractAvailableLabels(memoryData),
		[memoryData]
	)
	
	const filteredMemoryData = useMemo(
		() => filterPointsByLabels(memoryData, memoryLabels),
		[memoryData, memoryLabels]
	)
	
	const memorySeries = useMemo(
		() => groupByTimeSeries(filteredMemoryData),
		[filteredMemoryData]
	)
	
	const memoryChartData = useMemo(() => {
		const timeMap = new Map<number, any>()
		
		memorySeries.forEach((points, seriesKey) => {
			points.forEach(point => {
				if (!timeMap.has(point.timestamp)) {
					timeMap.set(point.timestamp, { timestamp: point.timestamp })
				}
				const row = timeMap.get(point.timestamp)!
				row[seriesKey] = point.value
			})
		})
		
		return Array.from(timeMap.values()).sort((a, b) => a.timestamp - b.timestamp)
	}, [memorySeries])
	
	const memoryDataPoints = useMemo(() => {
		return Array.from(memorySeries.keys()).map((seriesKey, index) => {
			// 使用 HSL 颜色，确保每条线颜色不同且可见
			const hue = (index * 137.5) % 360  // 黄金角度分布
			const color = `hsl(${hue}, 70%, 50%)`
			const labels = formatSeriesLabel(seriesKey)
			return {
				label: labels.truncated,
				fullLabel: labels.full,
				dataKey: seriesKey,
				color,
			}
		})
	}, [memorySeries])
	
	// ============================================
	// 网络图表数据处理
	// ============================================
	
	const networkAvailableLabels = useMemo(
		() => extractAvailableLabels(networkData),
		[networkData]
	)
	
	const filteredNetworkData = useMemo(
		() => filterPointsByLabels(networkData, networkLabels),
		[networkData, networkLabels]
	)
	
	const networkSeries = useMemo(
		() => groupByTimeSeries(filteredNetworkData),
		[filteredNetworkData]
	)
	
	const networkChartData = useMemo(() => {
		const timeMap = new Map<number, any>()
		
		networkSeries.forEach((points, seriesKey) => {
			points.forEach(point => {
				if (!timeMap.has(point.timestamp)) {
					timeMap.set(point.timestamp, { timestamp: point.timestamp })
				}
				const row = timeMap.get(point.timestamp)!
				row[seriesKey] = point.value
			})
		})
		
		return Array.from(timeMap.values()).sort((a, b) => a.timestamp - b.timestamp)
	}, [networkSeries])
	
	const networkDataPoints = useMemo(() => {
		return Array.from(networkSeries.keys()).map((seriesKey, index) => {
			// 使用 HSL 颜色，确保每条线颜色不同且可见
			const hue = (index * 137.5) % 360  // 黄金角度分布
			const color = `hsl(${hue}, 70%, 50%)`
			const labels = formatSeriesLabel(seriesKey)
			return {
				label: labels.truncated,
				fullLabel: labels.full,
				dataKey: seriesKey,
				color,
			}
		})
	}, [networkSeries])
	
	// ============================================
	// 磁盘 I/O 图表数据处理（堆叠面积图）
	// ============================================
	
	const diskAvailableLabels = useMemo(
		() => extractAvailableLabels(diskIOData),
		[diskIOData]
	)
	
	const filteredDiskData = useMemo(
		() => filterPointsByLabels(diskIOData, diskLabels),
		[diskIOData, diskLabels]
	)
	
	const diskSeries = useMemo(
		() => groupByTimeSeries(filteredDiskData),
		[filteredDiskData]
	)
	
	const diskChartData = useMemo(() => {
		const timeMap = new Map<number, any>()
		
		diskSeries.forEach((points, seriesKey) => {
			points.forEach(point => {
				if (!timeMap.has(point.timestamp)) {
					timeMap.set(point.timestamp, { timestamp: point.timestamp })
				}
				const row = timeMap.get(point.timestamp)!
				row[seriesKey] = point.value
			})
		})
		
		return Array.from(timeMap.values()).sort((a, b) => a.timestamp - b.timestamp)
	}, [diskSeries])
	
	const diskDataPoints = useMemo(() => {
		return Array.from(diskSeries.keys()).map((seriesKey, index) => {
			// 使用 HSL 颜色，确保每条线颜色不同且可见
			const hue = (index * 137.5) % 360  // 黄金角度分布
			const color = `hsl(${hue}, 70%, 50%)`
			const labels = formatSeriesLabel(seriesKey)
			return {
				label: labels.truncated,
				fullLabel: labels.full,
				dataKey: seriesKey,
				color,
				fillOpacity: 0.3,  // 降低透明度以便重叠时能看清
			}
		})
	}, [diskSeries])
	
	// 时间范围
	const timeRange = useMemo(() => {
		if (cpuData.length === 0) return { start: 0, end: 0 }
		return {
			start: Math.min(...cpuData.map(p => p.timestamp)),
			end: Math.max(...cpuData.map(p => p.timestamp)),
		}
	}, [cpuData])
	
	// ============================================
	// 图表配置（统一管理）
	// ============================================
	
	const chartConfigs = useMemo(() => [
		{
			id: 'cpu',
			title: 'CPU 使用率',
			chartData: cpuChartData,
			dataPoints: cpuDataPoints,
			availableLabels: cpuAvailableLabels,
			selectedLabels: cpuLabels,
			onSelectionChange: setCpuLabels,
			seriesCount: cpuSeries.size,
			yAxisConfig: {
				domain: [0, 100] as [number, number],
				tickFormatter: formatValue,
			},
		},
		{
			id: 'memory',
			title: '内存使用',
			chartData: memoryChartData,
			dataPoints: memoryDataPoints,
			availableLabels: memoryAvailableLabels,
			selectedLabels: memoryLabels,
			onSelectionChange: setMemoryLabels,
			seriesCount: memorySeries.size,
			yAxisConfig: {
				tickFormatter: formatValue,
			},
		},
		{
			id: 'network',
			title: '网络流量',
			chartData: networkChartData,
			dataPoints: networkDataPoints,
			availableLabels: networkAvailableLabels,
			selectedLabels: networkLabels,
			onSelectionChange: setNetworkLabels,
			seriesCount: networkSeries.size,
			yAxisConfig: {
				tickFormatter: formatValue,
			},
		},
		{
			id: 'disk',
			title: '磁盘 I/O',
			chartData: diskChartData,
			dataPoints: diskDataPoints,
			availableLabels: diskAvailableLabels,
			selectedLabels: diskLabels,
			onSelectionChange: setDiskLabels,
			seriesCount: diskSeries.size,
			yAxisConfig: {
				tickFormatter: formatValue,
			},
		},
	], [
		cpuChartData, cpuDataPoints, cpuAvailableLabels, cpuLabels, cpuSeries.size,
		memoryChartData, memoryDataPoints, memoryAvailableLabels, memoryLabels, memorySeries.size,
		networkChartData, networkDataPoints, networkAvailableLabels, networkLabels, networkSeries.size,
		diskChartData, diskDataPoints, diskAvailableLabels, diskLabels, diskSeries.size,
	])
	
	return (
		<div className="space-y-6">
			<div className="flex items-start justify-between">
				<div>
					<h1 className="text-3xl font-bold">图表组件测试</h1>
					<p className="text-muted-foreground mt-2">
						使用简单面积图展示所有指标，每条线代表唯一的时间序列。通过标签筛选器控制显示的时间序列。
					</p>
				</div>
				
				{/* 全局控制按钮 */}
				<div className="flex items-center gap-2">
					{/* 图例可见性切换 */}
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								onClick={() => setLegendVisible(!legendVisible)}
								className="p-2 border rounded-md hover:bg-accent transition-colors"
							>
								{legendVisible ? (
									// 眼睛图标（显示）
									<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
										<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
										<circle cx="12" cy="12" r="3"></circle>
									</svg>
								) : (
									// 眼睛斜杠图标（隐藏）
									<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
										<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
										<line x1="1" y1="1" x2="23" y2="23"></line>
									</svg>
								)}
							</button>
						</TooltipTrigger>
						<TooltipContent>
							{legendVisible ? '隐藏图例' : '显示图例'}
						</TooltipContent>
					</Tooltip>
					
					{/* 布局切换按钮 */}
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								onClick={() => setGridCols(gridCols === 2 ? 1 : 2)}
								className="p-2 border rounded-md hover:bg-accent transition-colors"
							>
								{gridCols === 2 ? (
									// 网格图标 (2列)
									<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
										<rect x="3" y="3" width="7" height="7"></rect>
										<rect x="14" y="3" width="7" height="7"></rect>
										<rect x="3" y="14" width="7" height="7"></rect>
										<rect x="14" y="14" width="7" height="7"></rect>
									</svg>
								) : (
									// 列表图标 (1列)
									<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
										<line x1="8" y1="6" x2="21" y2="6"></line>
										<line x1="8" y1="12" x2="21" y2="12"></line>
										<line x1="8" y1="18" x2="21" y2="18"></line>
										<line x1="3" y1="6" x2="3.01" y2="6"></line>
										<line x1="3" y1="12" x2="3.01" y2="12"></line>
										<line x1="3" y1="18" x2="3.01" y2="18"></line>
									</svg>
								)}
							</button>
						</TooltipTrigger>
						<TooltipContent>
							{gridCols === 2 ? '切换到平铺视图' : '切换到标签页视图'}
						</TooltipContent>
					</Tooltip>
				</div>
			</div>
			
			<Separator />
			
			{/* 测试说明 */}
			<Card>
				<CardHeader>
					<CardTitle>测试说明</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					<div className="grid grid-cols-2 gap-4 text-sm">
						<div>
							<strong>时间范围：</strong>
							<span className="text-muted-foreground ml-2">最近 1 小时</span>
						</div>
						<div>
							<strong>数据点数：</strong>
							<span className="text-muted-foreground ml-2">60 个点（1 分钟间隔）</span>
						</div>
						<div>
							<strong>CPU 时间序列：</strong>
							<span className="text-muted-foreground ml-2">{cpuSeries.size} 条</span>
						</div>
						<div>
							<strong>内存时间序列：</strong>
							<span className="text-muted-foreground ml-2">{memorySeries.size} 条</span>
						</div>
						<div>
							<strong>网络时间序列：</strong>
							<span className="text-muted-foreground ml-2">{networkSeries.size} 条</span>
						</div>
						<div>
							<strong>磁盘 I/O 时间序列：</strong>
							<span className="text-muted-foreground ml-2">{diskSeries.size} 条</span>
						</div>
					</div>
				</CardContent>
			</Card>
			
			{/* 图表列表（网格布局） */}
			<div className={`grid gap-6 ${gridCols === 1 ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
			{chartConfigs.map((config) => {
				const showLegend = legendVisible  // 不管有几条线，都根据 legendVisible 控制图例显示
					
					return (
						<Card key={config.id}>
							<CardHeader className="p-4">
								<div className="flex items-center justify-between">
									<CardTitle>{config.title} - 面积图</CardTitle>
									<LabelSelectorButton
										availableLabels={config.availableLabels}
										selectedLabels={config.selectedLabels}
										onSelectionChange={config.onSelectionChange}
										matchedSeriesCount={config.seriesCount}
										buttonText="筛选"
									/>
								</div>
							</CardHeader>
							<CardContent className="p-4 pt-0">
								<div className={legendPosition === 'right' ? 'flex gap-4' : 'space-y-4'}>
									{/* 图表区域 */}
									<div style={{ 
										flex: legendPosition === 'right' ? (showLegend ? '0 0 80%' : '1') : undefined,
										width: legendPosition === 'bottom' ? '100%' : undefined,
										height: '250px', 
										position: 'relative', 
										minWidth: 0 
									}}>
										{config.chartData.length > 0 ? (
											<AreaChart
												data={config.chartData}
												dataPoints={config.dataPoints.map(dp => ({
													...dp,
													fillOpacity: 0.3,
												}))}
												xAxis={{
													dataKey: 'timestamp',
													domain: [timeRange.start, timeRange.end],
													tickFormatter: formatShortTime,
												}}
												yAxis={config.yAxisConfig}
												legend={false}
												tooltip={{
													labelFormatter: (value, payload) => {
														// 从 payload 中获取 timestamp
														if (payload && payload.length > 0) {
															const timestamp = payload[0]?.payload?.timestamp
															if (timestamp) {
																return formatFullDateTime(timestamp)
															}
														}
														// 如果 payload 不可用，尝试解析 value
														const numValue = Number(value)
														if (!isNaN(numValue)) {
															return formatFullDateTime(numValue)
														}
														return String(value)
													},
												}}
											/>
										) : (
											<div className="flex items-center justify-center h-full text-muted-foreground">
												无数据
											</div>
										)}
									</div>
									
									{/* 图例区域（可滚动） */}
									{config.chartData.length > 0 && showLegend && (
										<div 
											className={legendPosition === 'right' 
												? 'overflow-y-auto space-y-2 pr-2'
												: 'overflow-y-auto grid grid-cols-2 gap-x-4 gap-y-1.5 pr-2'
											}
											style={legendPosition === 'right' 
												? { flex: '0 0 20%', maxHeight: '250px', minWidth: 0 }
												: { width: '100%', maxHeight: '3.05rem' }
											}
										>
										{config.dataPoints.map((dp, index) => {
											const hue = (index * 137.5) % 360
											const color = `hsl(${hue}, 70%, 50%)`
											// 从 label 中提取 labels 部分（去掉指标名称）
											const labelsOnly = dp.label.includes('{') 
												? dp.label.substring(dp.label.indexOf('{'))
												: dp.label
											return (
											<Tooltip key={String(dp.dataKey)}>
												<TooltipTrigger asChild>
													<div className="flex items-center gap-2 text-xs min-w-0 py-0.8">
														<div
															className="w-1 h-4 rounded-sm shrink-0"
															style={{ backgroundColor: color }}
														/>
														<div className="flex-1 leading-normal truncate min-w-0">
															{labelsOnly}
														</div>
													</div>
												</TooltipTrigger>
												<TooltipContent side="top" className="max-w-md wrap-break-word whitespace-normal">
													{dp.fullLabel || dp.label}
												</TooltipContent>
											</Tooltip>
												)
											})}
										</div>
									)}
								</div>
							</CardContent>
						</Card>
					)
				})}
			</div>
			
			{/* 时间序列列表 */}
			<Card>
				<CardHeader>
					<CardTitle>当前显示的时间序列</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						{/* CPU 时间序列 */}
						<div>
							<div className="font-medium mb-2">CPU 使用率 ({cpuSeries.size} 条)</div>
							<div className="space-y-1 text-sm">
								{Array.from(cpuSeries.keys()).map((key, index) => (
									<div key={key} className="flex items-center gap-2">
										<div
											className="w-3 h-3 rounded-full"
											style={{
												backgroundColor: `hsl(${(index * 137.5) % 360}, 70%, 50%)`
											}}
										/>
										<code className="text-xs">{key}</code>
									</div>
								))}
							</div>
						</div>
						
						<Separator />
						
						{/* 内存时间序列 */}
						<div>
							<div className="font-medium mb-2">内存使用 ({memorySeries.size} 条)</div>
							<div className="space-y-1 text-sm">
								{Array.from(memorySeries.keys()).map((key, index) => (
									<div key={key} className="flex items-center gap-2">
										<div
											className="w-3 h-3 rounded-full"
											style={{
												backgroundColor: `hsl(${(index * 137.5) % 360}, 70%, 50%)`
											}}
										/>
										<code className="text-xs">{key}</code>
									</div>
								))}
							</div>
						</div>
						
						<Separator />
						
						{/* 网络时间序列 */}
						<div>
							<div className="font-medium mb-2">网络流量 ({networkSeries.size} 条)</div>
							<div className="space-y-1 text-sm">
								{Array.from(networkSeries.keys()).map((key, index) => (
									<div key={key} className="flex items-center gap-2">
										<div
											className="w-3 h-3 rounded-full"
											style={{
												backgroundColor: `hsl(${(index * 137.5) % 360}, 70%, 50%)`
											}}
										/>
										<code className="text-xs">{key}</code>
									</div>
								))}
							</div>
						</div>
						
						<Separator />
						
						{/* 磁盘 I/O 时间序列 */}
						<div>
							<div className="font-medium mb-2">磁盘 I/O ({diskSeries.size} 条)</div>
							<div className="space-y-1 text-sm">
								{Array.from(diskSeries.keys()).map((key, index) => (
									<div key={key} className="flex items-center gap-2">
										<div
											className="w-3 h-3 rounded-full"
											style={{
												backgroundColor: `hsl(${(index * 137.5) % 360}, 70%, 50%)`
											}}
										/>
										<code className="text-xs">{key}</code>
									</div>
								))}
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}

