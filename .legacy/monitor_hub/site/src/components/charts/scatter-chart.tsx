/**
 * ============================================
 * 散点图组件
 * ============================================
 * 
 * 适合展示稀疏、随机触发的数据（如日志触发事件）
 * 基于 recharts 的散点图封装
 */

import { useMemo } from "react"
import { Scatter, ScatterChart, CartesianGrid, YAxis } from "recharts"
import {
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
	createXAxis,
} from "./chart-base"
import { useYAxisWidth } from "./hooks"
import { cn } from "@/lib/utils"

// ============================================
// 类型定义
// ============================================

/**
 * 散点数据点配置
 */
export interface ScatterDataPoint {
	/** 显示标签（截断后的） */
	label: string
	/** 完整标签（用于 tooltip 显示） */
	fullLabel?: string
	/** 数据键（对应数据数组中的键） */
	dataKey: string
	/** 颜色（CSS 颜色值或 chart 变量索引） */
	color: string | number
	/** 点的形状 */
	shape?: 'circle' | 'cross' | 'diamond' | 'square' | 'star' | 'triangle' | 'wye'
	/** 点的大小 */
	size?: number
}

/**
 * 散点图属性
 */
export interface ScatterChartProps {
	/** 图表数据 */
	data: any[]
	
	/** 数据点配置 */
	dataPoints: ScatterDataPoint[]
	
	/** X 轴配置 */
	xAxis: {
		dataKey: string
		domain?: [number, number]
		ticks?: number[]
		tickFormatter?: (value: number) => string
	}
	
	/** Y 轴配置 */
	yAxis?: {
		domain?: [number, number | "auto"]
		tickFormatter?: (value: number, index: number) => string
		tickCount?: number
		orientation?: "left" | "right"
	}
	
	/** 提示框配置 */
	tooltip?: {
		labelFormatter?: (value: any, payload: any[]) => React.ReactNode
		contentFormatter?: (item: any, key: string) => React.ReactNode | string
		unit?: string
		itemSorter?: (a: any, b: any) => number
	}
	
	/** 是否显示图例 */
	legend?: boolean
	
	/** 是否显示网格 */
	grid?: boolean
	
	/** 图表容器类名 */
	className?: string
	
	/** 图表边距 */
	margin?: {
		top?: number
		right?: number
		bottom?: number
		left?: number
	}
}

// ============================================
// 默认配置
// ============================================

const DEFAULT_MARGIN = { top: 5, right: 10, left: 0, bottom: 0 }

// ============================================
// 组件实现
// ============================================

/**
 * 散点图组件
 * 
 * @example
 * ```typescript
 * <ScatterChartComponent
 *   data={scatterData}
 *   dataPoints={[
 *     { 
 *       label: 'Series 1', 
 *       dataKey: 'series1', 
 *       color: 1,
 *       shape: 'circle',
 *       size: 50
 *     }
 *   ]}
 *   xAxis={{
 *     dataKey: 'timestamp',
 *     domain: [startTime, endTime],
 *     tickFormatter: (value) => new Date(value).toLocaleTimeString()
 *   }}
 *   yAxis={{
 *     tickFormatter: (value) => `${value}ms`
 *   }}
 *   legend
 * />
 * ```
 */
export default function ScatterChartComponent({
	data,
	dataPoints,
	xAxis,
	yAxis,
	tooltip,
	legend = false,
	grid = true,
	className,
	margin = DEFAULT_MARGIN,
}: ScatterChartProps) {
	const { yAxisWidth, updateYAxisWidth } = useYAxisWidth()

	// 使用 useMemo 优化性能
	const chartContent = useMemo(() => {
		if (!data || data.length === 0) {
			return null
		}

		return (
			<div>
				<ChartContainer
					className={cn(
						"h-full w-full absolute aspect-auto bg-card opacity-0 transition-opacity",
						{
							"opacity-100": yAxisWidth,
						},
						className
					)}
				>
					<ScatterChart
						data={data}
						accessibilityLayer
						margin={margin}
					>
						{/* 网格 */}
						{grid && <CartesianGrid vertical={false} />}
						
						{/* Y 轴 */}
						<YAxis
							direction="ltr"
							orientation={yAxis?.orientation || "left"}
							className="tracking-tighter"
							width={yAxisWidth}
							domain={yAxis?.domain || [0, "auto"]}
							tickCount={yAxis?.tickCount}
							tickFormatter={(value, index) => {
								const formatted = yAxis?.tickFormatter 
									? yAxis.tickFormatter(value, index)
									: String(value)
								return updateYAxisWidth(formatted)
							}}
							tickLine={false}
							axisLine={false}
						/>
						
						{/* X 轴 */}
						{createXAxis({
							dataKey: xAxis.dataKey,
							domain: xAxis.domain || [0, 1],
							ticks: xAxis.ticks,
							tickFormatter: xAxis.tickFormatter,
						})}
						
						{/* 提示框 - 过滤并添加颜色信息 */}
						<ChartTooltip
							animationEasing="ease-out"
							animationDuration={150}
							cursor={{ strokeDasharray: '3 3' }}
							// @ts-expect-error
							itemSorter={tooltip?.itemSorter}
							content={(props) => {
								if (!props.active || !props.payload) {
									return null
								}
								
								// 创建 dataKey 到颜色的映射
								const colorMap = new Map<string, string>()
								dataPoints?.forEach(dp => {
									let color = dp.color
									if (typeof color === 'number') {
										color = `var(--chart-${color})`
									}
									colorMap.set(dp.dataKey, color as string)
								})
								
								// 过滤掉内部字段（timestamp 等），只保留真正的数据系列，并添加颜色信息
								const validDataKeys = new Set(dataPoints?.map(dp => dp.dataKey) || [])
								const filteredPayload = props.payload
									.filter((item: any) => validDataKeys.has(item.dataKey))
									.map((item: any) => ({
										...item,
										color: colorMap.get(item.dataKey),
										fill: colorMap.get(item.dataKey),
										stroke: colorMap.get(item.dataKey),
									}))
								
								return (
									<ChartTooltipContent
										active={props.active}
										payload={filteredPayload}
										label={String(props.label || '')}
										labelFormatter={(value, payload) => tooltip?.labelFormatter?.(value, payload as any[])}
										contentFormatter={tooltip?.contentFormatter}
										unit={tooltip?.unit}
									/>
								)
							}}
						/>
						
						{/* 散点系列 */}
						{dataPoints?.map((dataPoint) => {
							let { color } = dataPoint
							if (typeof color === "number") {
								color = `var(--chart-${color})`
							}
							
							return (
								<Scatter
									key={String(dataPoint.dataKey)}
									dataKey={dataPoint.dataKey}
									name={dataPoint.label}
									fill={color}
									stroke={color}
									shape={dataPoint.shape || 'circle'}
									isAnimationActive={false}
								/>
							)
						})}
						
						{/* 图例 */}
						{legend && <ChartLegend content={<ChartLegendContent payload={[]} />} />}
					</ScatterChart>
				</ChartContainer>
			</div>
		)
	}, [data, dataPoints, xAxis, yAxis, yAxisWidth, tooltip, legend, grid, margin, className])

	return chartContent
}

