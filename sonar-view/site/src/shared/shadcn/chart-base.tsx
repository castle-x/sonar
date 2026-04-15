/**
 * ============================================
 * 基础图表组件（基于 recharts）
 * ============================================
 *
 * 参考 Beszel 的实现，提供通用的图表容器和组件
 *
 * 主要功能：
 * - ChartContainer: 图表容器组件
 * - ChartTooltip: 提示框组件
 * - ChartLegend: 图例组件
 * - xAxis: X 轴配置
 */

import * as React from "react"
import * as RechartsPrimitive from "recharts"
import { cn } from "@/shared/lib/utils"

// ============================================
// 类型定义
// ============================================

/**
 * 图表配置类型
 */
export type ChartConfig = {
	[k in string]: {
		label?: React.ReactNode
		icon?: React.ComponentType
		color?: string
	}
}

// ============================================
// ChartContainer - 图表容器组件
// ============================================

const ChartContainer = React.forwardRef<
	HTMLDivElement,
	React.ComponentProps<"div"> & {
		children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"]
	}
>(({ id, className, children, ...props }, ref) => {
	const uniqueId = React.useId()
	const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`

	return (
		<div
			data-chart={chartId}
			ref={ref}
			className={cn(
				// Recharts 样式覆盖
				"text-xs",
				// 网格线
				"[&_.recharts-cartesian-grid_line]:stroke-border/50",
				// 坐标轴文本
				"[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground",
				// Tooltip 光标
				"[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border",
				"[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted",
				// 点和扇形
				"[&_.recharts-dot[stroke='#fff']]:stroke-transparent",
				"[&_.recharts-sector[stroke='#fff']]:stroke-transparent",
				// Layer 和 Surface
				"[&_.recharts-layer]:outline-hidden",
				"[&_.recharts-surface]:outline-hidden",
				"[&_.recharts-sector]:outline-hidden",
				// 参考线
				"[&_.recharts-reference-line-line]:stroke-border",
				// 极坐标网格
				"[&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border",
				// 径向条形背景
				"[&_.recharts-radial-bar-background-sector]:fill-muted",
				className
			)}
			{...props}
		>
			<RechartsPrimitive.ResponsiveContainer width="100%" height="100%">
				{children}
			</RechartsPrimitive.ResponsiveContainer>
		</div>
	)
})
ChartContainer.displayName = "ChartContainer"

// ============================================
// ChartTooltip - 提示框组件
// ============================================

const ChartTooltip = RechartsPrimitive.Tooltip

const ChartTooltipContent = React.forwardRef<
	HTMLDivElement,
	React.ComponentProps<"div"> & {
		active?: boolean
		payload?: Array<any>
		label?: string
		hideLabel?: boolean
		indicator?: "line" | "dot" | "dashed"
		nameKey?: string
		labelKey?: string
		labelFormatter?: (value: any, payload: Array<any>) => React.ReactNode
		labelClassName?: string
		formatter?: (value: any, name: any, item: any, index: number, payload: any) => React.ReactNode
		color?: string
		unit?: string
		itemSorter?: (a: any, b: any) => number
		contentFormatter?: (item: any, key: string) => React.ReactNode | string
		truncate?: boolean
	}
>(
	(
		{
			active,
			payload,
			className,
			indicator = "line",
			hideLabel = false,
			label,
			labelFormatter,
			labelClassName,
			formatter,
			color,
			nameKey,
			labelKey,
			unit,
			itemSorter,
			contentFormatter: content = undefined,
			truncate = false,
		},
		ref
	) => {
	// 处理排序
	React.useMemo(() => {
		if (itemSorter && typeof itemSorter === 'function') {
			payload?.sort(itemSorter)
		}
	}, [itemSorter, payload])

		// 生成标签
		const tooltipLabel = React.useMemo(() => {
			if (hideLabel || !payload?.length) {
				return null
			}

			const [item] = payload
			const key = `${labelKey || item.name || "value"}`
			const value = !labelKey && typeof label === "string" ? label : key

			if (labelFormatter) {
				return <div className={cn("font-medium", labelClassName)}>{labelFormatter(value, payload)}</div>
			}

			if (!value) {
				return null
			}

			return <div className={cn("font-medium", labelClassName)}>{value}</div>
		}, [label, labelFormatter, payload, hideLabel, labelClassName, labelKey])

		if (!active || !payload?.length) {
			return null
		}

		const nestLabel = false

		return (
			<div
				ref={ref}
				className={cn(
					"grid min-w-28 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
					className
				)}
			>
				{!nestLabel ? tooltipLabel : null}
				<div className="grid gap-1.5">
					{payload.map((item: any, index: number) => {
						const key = `${nameKey || item.name || item.dataKey || "value"}`
						const indicatorColor = color || item.payload.fill || item.color

						return (
							<div
								key={`${item?.name || item.dataKey}-${item.dataKey}-${index}`}
								className={cn(
									"flex w-full items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
									indicator === "dot" && "items-center"
								)}
							>
								{formatter && item?.value !== undefined && item.name ? (
									formatter(item.value, item.name, item, index, item.payload)
								) : (
									<>
										{/* 指示器 */}
										<div
											className={cn("shrink-0 rounded-[2px] border-border bg-(--color-bg)", {
												"h-2.5 w-2.5": indicator === "dot",
												"w-1": indicator === "line",
												"w-0 border-[1.5px] border-dashed bg-transparent": indicator === "dashed",
												"my-0.5": nestLabel && indicator === "dashed",
											})}
											style={
												{
													"--color-bg": indicatorColor,
													"--color-border": indicatorColor,
												} as React.CSSProperties
											}
										/>
										{/* 内容 */}
										<div
											className={cn(
												"flex flex-1 justify-between leading-none gap-2",
												nestLabel ? "items-end" : "items-center"
											)}
										>
											{nestLabel ? tooltipLabel : null}
											<span
												className={cn(
													"text-muted-foreground",
													truncate ? "max-w-40 truncate leading-normal -my-1" : ""
												)}
											>
												{item.name}
											</span>
											{item.value !== undefined && (
												<span className="font-medium text-foreground">
													{content && typeof content === "function"
														? content(item, key)
														: item.value.toLocaleString() + (unit ? unit : "")}
												</span>
											)}
										</div>
									</>
								)}
							</div>
						)
					})}
				</div>
			</div>
		)
	}
)
ChartTooltipContent.displayName = "ChartTooltip"

// ============================================
// ChartLegend - 图例组件
// ============================================

const ChartLegend = RechartsPrimitive.Legend

const ChartLegendContent = React.forwardRef<
	HTMLDivElement,
	React.ComponentProps<"div"> & {
		payload?: Array<any>
		verticalAlign?: "top" | "bottom"
		hideIcon?: boolean
		nameKey?: string
	}
>(({ className, payload, verticalAlign = "bottom" }, ref) => {
	if (!payload?.length) {
		return null
	}

	return (
		<div
			ref={ref}
			className={cn(
				"flex items-center justify-center gap-4 gap-y-1 flex-wrap ps-4",
				verticalAlign === "top" ? "pb-3" : "pt-3",
				className
			)}
		>
			{payload.map((item: any) => {
				return (
					<div
						key={item.value}
						className={cn(
							"flex items-center gap-1.5 text-muted-foreground"
						)}
					>
						<div
							className="h-2 w-2 shrink-0 rounded-[2px]"
							style={{
								backgroundColor: item.color,
							}}
						/>
						{item.value}
					</div>
				)
			})}
		</div>
	)
})
ChartLegendContent.displayName = "ChartLegend"

// ============================================
// XAxis 配置函数
// ============================================

/**
 * 创建 X 轴配置（时间轴）
 *
 * @param domain - 时间域 [开始时间, 结束时间]
 * @param ticks - 刻度值数组
 * @param tickFormatter - 刻度格式化函数
 * @returns X 轴组件
 */
export function createXAxis({
	domain,
	ticks,
	tickFormatter,
	dataKey = "timestamp",
}: {
	domain: [number, number]
	ticks?: number[]
	tickFormatter?: (value: number) => string
	dataKey?: string
}) {
	return (
		<RechartsPrimitive.XAxis
			dataKey={dataKey}
			domain={domain}
			ticks={ticks}
			allowDataOverflow
			type="number"
			scale="time"
			minTickGap={12}
			tickMargin={8}
			axisLine={false}
			tickFormatter={tickFormatter}
		/>
	)
}

// ============================================
// 导出
// ============================================

export {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	ChartLegend,
	ChartLegendContent,
}
