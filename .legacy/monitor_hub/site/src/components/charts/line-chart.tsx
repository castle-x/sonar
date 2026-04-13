/**
 * ============================================
 * 通用折线图组件
 * ============================================
 * 
 * 基于 recharts 的折线图封装，支持：
 * - 多条折线
 * - 自动 Y 轴宽度
 * - 提示框
 * - 图例
 * - 自定义格式化
 */

import { useMemo } from "react"
import { CartesianGrid, Line, LineChart, YAxis } from "recharts"
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
export interface LineDataPoint {
	/** 显示标签 */
	label: string
	/** 数据键（可以是字符串或提取函数） */
	dataKey: string | ((data: any) => number | undefined)
	/** 颜色（CSS 颜色值或 chart 变量索引） */
	color: string | number
	/** 是否显示数据点 */
	dot?: boolean
	/** 线条宽度 */
	strokeWidth?: number
	/** 虚线样式 */
	strokeDasharray?: string
}

/**
 * 折线图属性
 */
export interface LineChartProps {
	/** 图表数据 */
	data: any[]
	
	/** 数据点配置 */
	dataPoints: LineDataPoint[]
	
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
 * 通用折线图组件
 * 
 * @example
 * ```typescript
 * <LineChartComponent
 *   data={chartData}
 *   dataPoints={[
 *     { label: 'CPU', dataKey: 'cpu', color: 1 },
 *     { label: 'Memory', dataKey: 'memory', color: 2 },
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
export default function LineChartComponent({
	data,
	dataPoints,
	xAxis,
	yAxis,
	tooltip,
	legend = false,
	grid = true,
	className,
	margin = DEFAULT_MARGIN,
}: LineChartProps) {
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
					<LineChart
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
									labelFormatter={tooltip?.labelFormatter}
									contentFormatter={tooltip?.contentFormatter}
									unit={tooltip?.unit}
								/>
							}
						/>
						
						{/* 折线 */}
						{dataPoints?.map((dataPoint) => {
							let { color } = dataPoint
							if (typeof color === "number") {
								color = `var(--chart-${color})`
							}
							return (
								<Line
									key={dataPoint.label}
									dataKey={dataPoint.dataKey}
									name={dataPoint.label}
									type="monotoneX"
									dot={dataPoint.dot ?? false}
									strokeWidth={dataPoint.strokeWidth ?? 1.5}
									strokeDasharray={dataPoint.strokeDasharray}
									stroke={color}
									isAnimationActive={false}
								/>
							)
						})}
						
						{/* 图例 */}
						{legend && <ChartLegend content={<ChartLegendContent />} />}
					</LineChart>
				</ChartContainer>
			</div>
		)
	}, [data, dataPoints, yAxisWidth, yAxis?.domain])

	return chartContent
}

