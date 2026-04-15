/**
 * MetricChartsGrid - 通用指标图表网格组件
 * 
 * 功能：
 * 1. 按分组排序渲染指标图表
 * 2. 支持 column_span 配置（full/half）
 * 3. 自适应布局（行末单个图表自动变宽）
 * 4. 分组之间显示分隔线
 * 5. 支持图例显示/隐藏
 * 6. 支持聚合类型切换
 * 7. 支持标签筛选
 * 8. 🔥 性能优化：图例虚拟化滚动 + 图表自动截断（最多30条）
 * 
 * 使用场景：
 * - 实时监控仪表盘 (dashboard.tsx)
 * - 报告图表展示 (case-charts.tsx)
 */

import React, { memo, useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
	ChevronDownIcon,
	TrendingUpDown,
	AlertTriangleIcon,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/shadcn/card'
import { Button } from '@/shared/shadcn/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/shadcn/tooltip'
import { Separator } from '@/shared/shadcn/separator'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from '@/shared/shadcn/dropdown-menu'
import AreaChart from './area-chart'
import { LabelSelectorButton } from './label-selector-button'
import { formatShortTime, formatFullDateTime, formatValue } from './chart-utils'
import { AGGREGATION_TYPES } from '@/lib/metric-utils'

// MetricConfig interface (inlined from monitor_hub)
interface MetricConfig {
	name: string
	alias?: string
	description?: string
	unit?: string
	transform?: string
	display_labels?: string[]
	column_span?: 'full' | 'half'
	chart_type?: string
}



// ============================================
// 类型定义
// ============================================

export interface MetricData {
	/** 指标配置 */
	metricConfig: MetricConfig
	/** 分组名称 */
	groupName: string
	/** 是否为默认组（未配置的指标） */
	isDefault?: boolean
	/** 图表数据 */
	chartData: any[]
	/** 数据点配置（颜色、标签等） */
	dataPoints: any[]
	/** 可用的标签 */
	availableLabels: Record<string, string[]>
	/** 已选择的标签 */
	selectedLabels: Record<string, string[] | undefined>
	/** 时间序列数量（原始总数） */
	seriesCount: number
	/** 被截断的序列数量（可选，用于显示警告） */
	truncatedCount?: number
}

export interface MetricChartsGridProps {
	/** 指标数据数组 */
	metricsData: MetricData[]
	/** 时间范围（用于 X 轴） */
	timeRange: { start: number; end: number }
	/** 是否显示图例 */
	legendVisible: boolean
	/** 网格列数 */
	gridCols: 1 | 2
	/** 图例位置 */
	legendPosition?: 'right' | 'bottom'
	/** 每个指标的聚合类型 */
	metricAggregationTypes: Record<string, 'avg' | 'min' | 'max' | 'count' | 'last'>
	/** 聚合类型变更回调 */
	onAggregationTypeChange: (metricName: string, aggType: 'avg' | 'min' | 'max' | 'count' | 'last') => void
	/** 标签筛选变更回调 */
	onLabelSelectionChange: (metricName: string, selection: Record<string, string[] | undefined>) => void
}

// ============================================
// 主组件
// ============================================

export const MetricChartsGrid = memo(function MetricChartsGrid({
	metricsData,
	timeRange,
	legendVisible,
	gridCols,
	legendPosition: propLegendPosition,
	metricAggregationTypes,
	onAggregationTypeChange,
	onLabelSelectionChange,
}: MetricChartsGridProps) {
	
	// 图例位置根据布局自动决定（如果未指定）
	const legendPosition = propLegendPosition || (gridCols === 1 ? 'right' : 'bottom')
	
	// 计算每个组内的指标数量（用于判断保底逻辑）
	const groupSizes = useMemo(() => {
		const sizes: Record<string, number> = {}
		metricsData.forEach(({ groupName }) => {
			sizes[groupName] = (sizes[groupName] || 0) + 1
		})
		return sizes
	}, [metricsData])
	
	// 计算每个图表是否应该独占整行（模拟 grid 布局）
	const shouldSpanFullMap = useMemo(() => {
		const map = new Map<string, boolean>()
		
		// 如果是单列布局，所有图表都占满整行
		if (gridCols === 1) {
			metricsData.forEach(({ metricConfig, groupName }) => {
				const key = `${groupName}-${metricConfig.name}`
				map.set(key, true)
			})
			return map
		}
		
		// 双列布局：模拟 grid 布局，识别每一行是否只有一个图表
		let currentRow: Array<{ key: string; cols: number }> = []
		let currentGroup = ''
		
		// 辅助函数：处理当前行结束时的逻辑
		const finishCurrentRow = () => {
			if (currentRow.length === 1 && currentRow[0].cols === 1) {
				// 这一行只有一个图表且占1列，强制变成full
				map.set(currentRow[0].key, true)
			} else {
				// 否则按原配置
				currentRow.forEach(item => {
					map.set(item.key, item.cols === 2)
				})
			}
			currentRow = []
		}
		
		metricsData.forEach(({ metricConfig, groupName }, index) => {
			const key = `${groupName}-${metricConfig.name}`
			const groupSize = groupSizes[groupName] || 1
			const columnSpan = metricConfig.column_span
			
			// 切换到新组时，先结束当前行
			if (currentGroup !== groupName) {
				if (currentRow.length > 0) {
					finishCurrentRow()
				}
				currentGroup = groupName
			}
			
			// 计算这个图表占几列
			let cols = 1 // 默认占半行（1列）
			if (groupSize === 1) {
				// 组内只有一个指标，占满整行
				cols = 2
			} else if (columnSpan === 'full') {
				cols = 2
			} else if (columnSpan === 'half') {
				cols = 1
			} else {
				// 跟随全局布局（当前是双列，所以占1列）
				cols = 1
			}
			
			// 计算当前行已占用的列数
			const currentRowCols = currentRow.reduce((sum, item) => sum + item.cols, 0)
			
			// 如果当前行放不下，先结束当前行，然后换行
			if (currentRowCols + cols > 2) {
				finishCurrentRow()
			}
			
			// 将当前图表加入当前行
			currentRow.push({ key, cols })
			
			// 如果当前行已满，结束当前行
			const newRowCols = currentRow.reduce((sum, item) => sum + item.cols, 0)
			if (newRowCols >= 2) {
				finishCurrentRow()
			}
			
			// 如果是最后一个图表，结束当前行
			if (index === metricsData.length - 1 && currentRow.length > 0) {
				finishCurrentRow()
			}
		})
		
		return map
	}, [metricsData, gridCols, groupSizes])
	
	return (
		<div 
			className={`grid gap-6 ${gridCols === 1 ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}
			data-charts-rendered="true"
		>
			{metricsData.map(({ metricConfig, groupName, isDefault, chartData, dataPoints, availableLabels, selectedLabels, seriesCount, truncatedCount }, index) => {
				const showLegend = legendVisible
				// 获取显示名称（优先使用 alias）
				const displayName = metricConfig.alias || metricConfig.name
				const hasAlias = !!metricConfig.alias
				
				// 从预计算的 map 中获取是否应该占满整行
				const key = `${groupName}-${metricConfig.name}`
				const shouldSpanFull = shouldSpanFullMap.get(key) || false
				
				// 检查是否需要在当前指标后添加分组分隔线
				const nextMetric = metricsData[index + 1]
				const isLastInGroup = nextMetric && nextMetric.groupName !== groupName
				
				return (
					<React.Fragment key={`${groupName}-${metricConfig.name}`}>
						<Card className={shouldSpanFull ? 'col-span-full' : ''}>
							<CardHeader className="p-4">
								<div className="flex items-center justify-between">
									<div className="flex-1 min-w-0">
										<CardTitle className="text-base truncate">
											{hasAlias ? (
												<TooltipProvider>
													<Tooltip>
														<TooltipTrigger asChild>
															<span className="cursor-help">{displayName}</span>
														</TooltipTrigger>
														<TooltipContent>
															<div className="text-xs">
																<span className="font-mono">{metricConfig.name}</span>
															</div>
														</TooltipContent>
													</Tooltip>
												</TooltipProvider>
											) : (
												displayName
											)}
										</CardTitle>
										<CardDescription className="text-xs mt-1 line-clamp-2">
											{metricConfig.description && (
												<span>{metricConfig.description} </span>
											)}
											<span className="text-muted-foreground">({chartData.length} 个数据点)</span>
										</CardDescription>
									</div>
									<div className="flex items-center gap-2">
										{/* 聚合类型选择器 */}
										<DropdownMenu>
											<TooltipProvider>
												<Tooltip delayDuration={300}>
													<TooltipTrigger asChild>
														<DropdownMenuTrigger asChild>
															<Button variant="outline">
																<TrendingUpDown className="h-4 w-4 mr-2" />
																{(metricAggregationTypes[metricConfig.name] || 'avg').toUpperCase()}
																<ChevronDownIcon className="ml-2 h-4 w-4" />
															</Button>
														</DropdownMenuTrigger>
													</TooltipTrigger>
													<TooltipContent>切换聚合类型</TooltipContent>
												</Tooltip>
											</TooltipProvider>
											<DropdownMenuContent align="end">
												<DropdownMenuRadioGroup
													value={metricAggregationTypes[metricConfig.name] || 'avg'}
													onValueChange={(value) => {
													onAggregationTypeChange(metricConfig.name, value as 'avg' | 'min' | 'max' | 'count' | 'last')
													}}
												>
													{AGGREGATION_TYPES.map(type => (
														<DropdownMenuRadioItem key={type} value={type}>
															{type.toUpperCase()}
														</DropdownMenuRadioItem>
													))}
												</DropdownMenuRadioGroup>
											</DropdownMenuContent>
										</DropdownMenu>
										
										{/* 标签筛选器 */}
										<LabelSelectorButton
											availableLabels={availableLabels}
											selectedLabels={selectedLabels}
											onSelectionChange={(newSelection) => {
												onLabelSelectionChange(metricConfig.name, newSelection)
											}}
											matchedSeriesCount={seriesCount}
											buttonText="筛选"
										/>
									</div>
								</div>
							</CardHeader>
							<CardContent className="p-4 pt-0">
								{chartData.length > 0 ? (
									<MetricChartWithLegend
										metricConfig={metricConfig}
										isDefault={isDefault}
										chartData={chartData}
										dataPoints={dataPoints}
										timeRange={timeRange}
										legendVisible={showLegend}
										legendPosition={legendPosition}
										truncatedCount={truncatedCount}
										totalSeriesCount={seriesCount}
									/>
								) : (
									<div style={{ 
										height: '250px', 
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										border: '1px dashed',
										borderColor: 'hsl(var(--border))',
										borderRadius: '0.5rem',
										color: 'hsl(var(--muted-foreground))',
										fontSize: '0.875rem',
									}}>
										该指标暂无数据
									</div>
								)}
							</CardContent>
						</Card>
						
						{/* 如果是组内最后一个指标，添加分组分隔线 */}
						{isLastInGroup && (
							<div className="col-span-full">
								<Separator className="border-dashed" />
							</div>
						)}
					</React.Fragment>
				)
			})}
		</div>
	)
})

// ============================================
// 性能优化常量
// ============================================

/** 图表最大同时显示的时间序列数量 */
const MAX_VISIBLE_SERIES = 30

/** 图例项高度（用于虚拟化滚动） */
const LEGEND_ITEM_HEIGHT = 24

// ============================================
// 子组件：单个指标图表（含图例交互）
// ============================================

interface MetricChartWithLegendProps {
	metricConfig: MetricConfig
	isDefault?: boolean
	chartData: any[]
	dataPoints: any[]
	timeRange: { start: number; end: number }
	legendVisible: boolean
	legendPosition: 'right' | 'bottom'
	/** 被截断的序列数量（从数据层传入） */
	truncatedCount?: number
	/** 总序列数量（用于显示） */
	totalSeriesCount?: number
}

// 🔥 性能调试：追踪渲染完成时间
let renderStartTime = 0

/**
 * 🔥 性能优化：自定义比较函数
 * 只在数据真正变化时才重新渲染，避免其他图表筛选变化时不必要的渲染
 */
function areChartPropsEqual(
	prevProps: MetricChartWithLegendProps,
	nextProps: MetricChartWithLegendProps
): boolean {
	// 1. 快速检查：基本属性
	if (
		prevProps.metricConfig.name !== nextProps.metricConfig.name ||
		prevProps.isDefault !== nextProps.isDefault ||
		prevProps.legendVisible !== nextProps.legendVisible ||
		prevProps.legendPosition !== nextProps.legendPosition ||
		prevProps.truncatedCount !== nextProps.truncatedCount ||
		prevProps.totalSeriesCount !== nextProps.totalSeriesCount
	) {
		return false
	}
	
	// 2. 时间范围比较
	if (
		prevProps.timeRange.start !== nextProps.timeRange.start ||
		prevProps.timeRange.end !== nextProps.timeRange.end
	) {
		return false
	}
	
	// 3. chartData 比较（长度 + 首尾时间戳）
	if (prevProps.chartData.length !== nextProps.chartData.length) {
		return false
	}
	if (prevProps.chartData.length > 0) {
		const prevFirst = prevProps.chartData[0]
		const nextFirst = nextProps.chartData[0]
		const prevLast = prevProps.chartData[prevProps.chartData.length - 1]
		const nextLast = nextProps.chartData[nextProps.chartData.length - 1]
		if (prevFirst?.timestamp !== nextFirst?.timestamp || prevLast?.timestamp !== nextLast?.timestamp) {
			return false
		}
	}
	
	// 4. dataPoints 比较（数量 + dataKey 列表）
	if (prevProps.dataPoints.length !== nextProps.dataPoints.length) {
		return false
	}
	for (let i = 0; i < prevProps.dataPoints.length; i++) {
		if (prevProps.dataPoints[i].dataKey !== nextProps.dataPoints[i].dataKey) {
			return false
		}
	}
	
	// 所有检查都通过，认为相等
	return true
}

/**
 * 单个指标图表组件（含图例交互）
 * 
 * 图例交互：
 * - 单击：切换该系列的显示/隐藏
 * - 双击：Solo 模式（只显示该系列，或恢复全部显示）
 * 
 * 🔥 性能优化：
 * - 图例使用虚拟化滚动（@tanstack/react-virtual）
 * - 数据层已限制最多 30 条序列
 * - 使用自定义比较函数避免不必要的重新渲染
 */
const MetricChartWithLegend = memo(function MetricChartWithLegend({
	metricConfig,
	isDefault,
	chartData,
	dataPoints,
	timeRange,
	legendVisible,
	legendPosition,
	truncatedCount = 0,
	totalSeriesCount = 0,
}: MetricChartWithLegendProps) {
	// 🔥 记录渲染开始时间
	const componentRenderStart = performance.now()
	// 隐藏的系列集合（存储 dataKey）
	const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set())
	
	// 用于区分单击/双击的定时器
	const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const clickCountRef = useRef(0)
	
	// 虚拟化滚动容器 ref
	const legendContainerRef = useRef<HTMLDivElement>(null)
	
	// 当 dataPoints 变化时（筛选或聚合类型改变），重置隐藏状态
	const dataPointsKey = useMemo(() => 
		dataPoints.map(dp => String(dp.dataKey)).join(','), 
		[dataPoints]
	)
	
	useEffect(() => {
		setHiddenSeries(new Set())
	}, [dataPointsKey])
	
	// 计算实际显示的数据点（仅考虑图例隐藏状态，数据层已限制30条）
	const visibleDataPoints = useMemo(() => {
		if (hiddenSeries.size === 0) return dataPoints
		return dataPoints.filter(dp => !hiddenSeries.has(String(dp.dataKey)))
	}, [dataPoints, hiddenSeries])
	
	// 🔥 虚拟化滚动配置（仅用于 right 位置的图例）
	const rowVirtualizer = useVirtualizer({
		count: dataPoints.length,
		getScrollElement: () => legendContainerRef.current,
		estimateSize: () => LEGEND_ITEM_HEIGHT,
		overscan: 5, // 多渲染5个作为缓冲
	})
	
	// 处理图例点击（区分单击和双击）
	const handleLegendClick = useCallback((dataKey: string) => {
		clickCountRef.current += 1
		
		if (clickTimerRef.current) {
			clearTimeout(clickTimerRef.current)
		}
		
		clickTimerRef.current = setTimeout(() => {
			const clicks = clickCountRef.current
			clickCountRef.current = 0
			
			if (clicks === 1) {
				// 单击：切换当前系列的显示/隐藏
				setHiddenSeries(prev => {
					const newSet = new Set(prev)
					if (newSet.has(dataKey)) {
						newSet.delete(dataKey)
					} else {
						// 不允许隐藏所有系列，至少保留一个
						if (newSet.size < dataPoints.length - 1) {
							newSet.add(dataKey)
						}
					}
					return newSet
				})
			} else if (clicks >= 2) {
				// 双击：Solo 模式
				setHiddenSeries(prev => {
					const allKeys = dataPoints.map(dp => String(dp.dataKey))
					const visibleKeys = allKeys.filter(k => !prev.has(k))
					
					// 如果当前只显示这一个（Solo 状态），则恢复全部显示
					if (visibleKeys.length === 1 && visibleKeys[0] === dataKey) {
						return new Set()
					}
					
					// 否则，进入 Solo 模式：只显示当前系列
					const newHidden = new Set(allKeys.filter(k => k !== dataKey))
					return newHidden
				})
			}
		}, 250) // 250ms 延迟区分单击和双击
	}, [dataPoints])
	
	// 清理定时器
	useEffect(() => {
		return () => {
			if (clickTimerRef.current) {
				clearTimeout(clickTimerRef.current)
			}
		}
	}, [])
	
	// 🔥 性能日志：记录组件渲染完成时间（仅开发环境，耗时超过 100ms）
	useEffect(() => {
		if (process.env.NODE_ENV === 'development') {
			const elapsed = performance.now() - componentRenderStart
			if (elapsed > 100) {
				console.log(`[MetricChartWithLegend] ⏱️ ${metricConfig.name} 渲染完成: ${elapsed.toFixed(2)}ms`)
			}
		}
	})
	
	const showLegend = legendVisible
	
	// 渲染单个图例项
	const renderLegendItem = useCallback((dp: any, style?: React.CSSProperties) => {
		const dataKey = String(dp.dataKey)
		const isHidden = hiddenSeries.has(dataKey)
		const color = dp.color
		const labelsOnly = dp.label.includes('{') 
			? dp.label.substring(dp.label.indexOf('{'))
			: dp.label
		
		return (
			<Tooltip key={dataKey}>
				<TooltipTrigger asChild>
					<div 
						className={`flex items-center gap-2 text-xs min-w-0 py-0.5 cursor-pointer select-none transition-opacity ${
							isHidden ? 'opacity-40' : 'hover:opacity-80'
						}`}
						style={style}
						onClick={() => handleLegendClick(dataKey)}
					>
						<div
							className="w-1 h-4 rounded-sm shrink-0 transition-colors"
							style={{ 
								backgroundColor: isHidden ? 'hsl(var(--muted-foreground))' : color 
							}}
						/>
						<div className={`flex-1 leading-normal truncate min-w-0 ${
							isHidden ? 'line-through text-muted-foreground' : ''
						}`}>
							{labelsOnly}
						</div>
					</div>
				</TooltipTrigger>
				<TooltipContent side="top" className="max-w-md wrap-break-word whitespace-normal">
					<div>{dp.fullLabel || dp.label}</div>
					<div className="text-xs text-muted-foreground mt-1">
						单击：显示/隐藏 | 双击：仅显示此项
					</div>
				</TooltipContent>
			</Tooltip>
		)
	}, [hiddenSeries, handleLegendClick])
	
	return (
		<div className={legendPosition === 'right' ? 'flex gap-4' : 'space-y-4'}>
			{/* 图表区域 */}
			<div className={legendPosition === 'right' ? (showLegend ? 'flex-[0_0_80%]' : 'flex-1') : 'w-full'} style={{ 
				height: '250px', 
				position: 'relative', 
				minWidth: 0,
				minHeight: '250px',
			}}>
				{/* 🔥 截断警告提示（右侧浮动，不遮挡图表） */}
				{truncatedCount > 0 && (
					<div className="absolute top-1 right-2 z-10 text-amber-600 text-xs flex items-center gap-1.5">
						<AlertTriangleIcon className="h-3.5 w-3.5 flex-shrink-0" />
						<span>
							仅显示前 {dataPoints.length} 条（共 {totalSeriesCount} 条）
						</span>
					</div>
				)}
				
				{/* 图表 */}
				<AreaChart
					data={chartData}
					dataPoints={visibleDataPoints}
					xAxis={{
						dataKey: 'timestamp',
						domain: [timeRange.start, timeRange.end] as [number, number],
						tickFormatter: formatShortTime,
					}}
					yAxis={{
						tickFormatter: (value: number) => {
							const formattedValue = formatValue(value)
							if (metricConfig.unit && !isDefault) {
								return `${formattedValue} ${metricConfig.unit}`
							}
							return formattedValue
						},
					}}
					legend={false}
					tooltip={{
						labelFormatter: (value, payload) => {
							if (payload && payload.length > 0) {
								const timestamp = payload[0]?.payload?.timestamp
								if (timestamp) {
									return formatFullDateTime(timestamp)
								}
							}
							const numValue = Number(value)
							if (!isNaN(numValue)) {
								return formatFullDateTime(numValue)
							}
							return String(value)
						},
					}}
				/>
			</div>
			
			{/* 🔥 图例区域（虚拟化滚动，支持点击交互） */}
			{showLegend && legendPosition === 'right' && (
				<div 
					ref={legendContainerRef}
					className="overflow-y-auto pr-2"
					style={{ flex: '0 0 20%', maxHeight: '250px', minWidth: 0 }}
				>
					{/* 虚拟化滚动容器 */}
					<div
						style={{
							height: `${rowVirtualizer.getTotalSize()}px`,
							width: '100%',
							position: 'relative',
						}}
					>
						{rowVirtualizer.getVirtualItems().map((virtualItem) => {
							const dp = dataPoints[virtualItem.index]
							return (
								<div
									key={virtualItem.key}
									style={{
										position: 'absolute',
										top: 0,
										left: 0,
										width: '100%',
										height: `${virtualItem.size}px`,
										transform: `translateY(${virtualItem.start}px)`,
									}}
								>
									{renderLegendItem(dp)}
								</div>
							)
						})}
					</div>
				</div>
			)}
			
			{/* 底部图例（数量较少时不使用虚拟化） */}
			{showLegend && legendPosition === 'bottom' && (
				<div 
					className="overflow-y-auto grid grid-cols-2 gap-x-4 gap-y-1.5 pr-2"
					style={{ width: '100%', maxHeight: '3.05rem' }}
				>
					{dataPoints.map((dp: any) => renderLegendItem(dp))}
				</div>
			)}
		</div>
	)
}, areChartPropsEqual) // 🔥 使用自定义比较函数，避免不必要的重新渲染

export default MetricChartsGrid

