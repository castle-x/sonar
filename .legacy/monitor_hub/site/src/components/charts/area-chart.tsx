/**
 * ============================================
 * 通用面积图组件
 * ============================================
 * 
 * 基于 recharts 的面积图封装，支持：
 * - 多个面积
 * - 堆叠模式
 * - 自动 Y 轴宽度
 * - 提示框
 * - 图例
 * - 自定义格式化
 */

import { useMemo } from "react"
import { Area, AreaChart, CartesianGrid, YAxis } from "recharts"
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
 * 数据点配置
 */
export interface AreaDataPoint {
	/** 显示标签（截断后的） */
	label: string
	/** 完整标签（用于 tooltip 显示） */
	fullLabel?: string
	/** 数据键（可以是字符串或提取函数） */
	dataKey: string | ((data: any) => number | undefined)
	/** 颜色（CSS 颜色值或 chart 变量索引） */
	color: string | number
	/** 填充透明度 (0-1) */
	fillOpacity?: number
	/** 堆叠ID（相同ID的面积会堆叠） */
	stackId?: string
	/** 显示顺序（用于堆叠排序） */
	order?: number
}

/**
 * 面积图属性
 */
export interface AreaChartProps {
	/** 图表数据 */
	data: any[]
	
	/** 数据点配置 */
	dataPoints: AreaDataPoint[]
	
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
 * 通用面积图组件
 * 
 * @example
 * ```typescript
 * <AreaChartComponent
 *   data={chartData}
 *   dataPoints={[
 *     { 
 *       label: 'Used', 
 *       dataKey: 'used', 
 *       color: 1,
 *       fillOpacity: 0.4,
 *       stackId: '1'
 *     },
 *     { 
 *       label: 'Cache', 
 *       dataKey: 'cache', 
 *       color: 2,
 *       fillOpacity: 0.3,
 *       stackId: '1'
 *     },
 *   ]}
 *   xAxis={{
 *     dataKey: 'timestamp',
 *     domain: [startTime, endTime],
 *     tickFormatter: (value) => new Date(value).toLocaleTimeString()
 *   }}
 *   yAxis={{
 *     tickFormatter: (value) => `${value}%`
 *   }}
 *   legend
 * />
 * ```
 */
export default function AreaChartComponent({
	data,
	dataPoints,
	xAxis,
	yAxis,
	tooltip,
	legend = false,
	grid = true,
	className,
	margin = DEFAULT_MARGIN,
}: AreaChartProps) {
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
					<AreaChart
						accessibilityLayer
						data={data}
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
						
						{/* 提示框 */}
						<ChartTooltip
							animationEasing="ease-out"
							animationDuration={150}
							// @ts-expect-error
							itemSorter={tooltip?.itemSorter}
							content={
								<ChartTooltipContent
									labelFormatter={(value, payload) => tooltip?.labelFormatter?.(value, payload as any[])}
									contentFormatter={tooltip?.contentFormatter}
									unit={tooltip?.unit}
								/>
							}
						/>
						
					{/* 面积 */}
					{dataPoints?.map((dataPoint) => {
						let { color } = dataPoint
						if (typeof color === "number") {
							color = `var(--chart-${color})`
						}
						return (
							<Area
								key={String(dataPoint.dataKey)}
								dataKey={dataPoint.dataKey}
								name={dataPoint.label}
								type="monotoneX"
								fill={color}
								fillOpacity={dataPoint.fillOpacity ?? 0.4}
								stroke={color}
								stackId={dataPoint.stackId}
								order={dataPoint.order}
								isAnimationActive={false}
							/>
						)
					})}
						
						{/* 图例 */}
						{legend && <ChartLegend content={<ChartLegendContent payload={[]} />} />}
					</AreaChart>
				</ChartContainer>
			</div>
		)
	}, [data, dataPoints, yAxisWidth, yAxis?.domain])

	return chartContent
}

