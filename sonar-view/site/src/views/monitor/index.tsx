/**
 * ============================================
 * 实时监控页面（Monitor）
 * ============================================
 *
 * 1:1 复刻 monitor_hub 的 dashboard.tsx 核心逻辑，适配 sonar-view 数据结构：
 * - datasource → activeStore（from store_configs）
 * - pushgateway_addr_list → store.addr（单地址）
 * - WebSocket 订阅 store_status topic
 * - 无 groupmap，所有指标归入 default 组
 */

import React, { memo, useEffect, useMemo, useRef, useState, useTransition } from "react"
import {
	ServerIcon,
	AlertCircleIcon,
	CheckCircleIcon,
	XCircleIcon,
	ActivityIcon,
	ChevronDownIcon,
	HistoryIcon,
	ArrowUpIcon,
	SettingsIcon,
} from "lucide-react"
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/shared/shadcn/card"
import { Button } from "@/shared/shadcn/button"
import { Separator } from "@/shared/shadcn/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/shadcn/tooltip"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/shadcn/table"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/shared/shadcn/dropdown-menu"
import { useStoreConfigs, useActivateStoreConfig } from "@/shared/hooks/use-view-api"
import { AGGREGATION_LEVELS, getDefaultAggregationLevel, calculateQueryTimeWindow, type AggregationLevel } from "@/lib/aggregation-config"
import { cn } from "@/shared/lib/utils"
import { queryPoints } from "@/lib/points-api"
import { createCompressedDataIndex, getPointsFromIndex, type AggregatedPoint } from "@/lib/points-compressed"
import { MetricChartsGrid, type MetricData } from "./components/metric-charts-grid"
import { groupByTimeSeries, formatSeriesLabel, extractAvailableLabels, filterPointsByLabels } from "./components/label-utils"
import { AGGREGATION_TYPES, applyTransform } from "@/lib/metric-utils"
import type { StoreConfig } from "@/api/sonar-view/store-config/v1/types"

// ============================================
// 状态颜色映射
// ============================================
const STATUS_COLORS = {
	up: "bg-green-500",
	down: "bg-red-500",
	online: "bg-green-500",
	offline: "bg-red-500",
} as const

const STATUS_LABELS = {
	up: "Up",
	down: "Down",
	online: "Online",
	offline: "Offline",
} as const

// ============================================
// 工具栏按钮组件
// ============================================
interface ToolbarButtonsProps {
	selectedLevel: AggregationLevel
	onLevelChange: (level: AggregationLevel) => void
	legendVisible: boolean
	onLegendToggle: () => void
	gridCols: 1 | 2
	onGridColsToggle: () => void
	showBackToTop?: boolean
	onBackToTop?: () => void
}

const ToolbarButtons = memo(function ToolbarButtons({
	selectedLevel,
	onLevelChange,
	legendVisible,
	onLegendToggle,
	gridCols,
	onGridColsToggle,
	showBackToTop = false,
	onBackToTop,
}: ToolbarButtonsProps) {
	return (
		<div className="flex items-center gap-2">
			{/* 聚合级别选择器 */}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" className="gap-2">
						<HistoryIcon className="size-4" />
						{selectedLevel.displayLabel}
						<ChevronDownIcon className="size-4 opacity-50" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-48">
					<DropdownMenuRadioGroup
						value={selectedLevel.name}
						onValueChange={(value) => {
							const level = AGGREGATION_LEVELS.find(l => l.name === value)
							if (level) onLevelChange(level)
						}}
					>
						{AGGREGATION_LEVELS.map((level) => (
							<DropdownMenuRadioItem key={level.name} value={level.name}>
								<div className="flex flex-col">
									<span className="font-medium">{level.displayLabel}</span>
									<span className="text-xs text-muted-foreground">{level.name} 间隔</span>
								</div>
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			{/* 图例可见性切换 */}
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="outline" size="icon" onClick={onLegendToggle}>
							{legendVisible ? (
								<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
									<circle cx="12" cy="12" r="3"></circle>
								</svg>
							) : (
								<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
									<line x1="1" y1="1" x2="23" y2="23"></line>
								</svg>
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent>{legendVisible ? '隐藏图例' : '显示图例'}</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			{/* 布局切换按钮 */}
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="outline" size="icon" onClick={onGridColsToggle}>
							{gridCols === 2 ? (
								<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<rect x="3" y="3" width="7" height="7"></rect>
									<rect x="14" y="3" width="7" height="7"></rect>
									<rect x="3" y="14" width="7" height="7"></rect>
									<rect x="14" y="14" width="7" height="7"></rect>
								</svg>
							) : (
								<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<line x1="8" y1="6" x2="21" y2="6"></line>
									<line x1="8" y1="12" x2="21" y2="12"></line>
									<line x1="8" y1="18" x2="21" y2="18"></line>
									<line x1="3" y1="6" x2="3.01" y2="6"></line>
									<line x1="3" y1="12" x2="3.01" y2="12"></line>
									<line x1="3" y1="18" x2="3.01" y2="18"></line>
								</svg>
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent>{gridCols === 2 ? '切换为单列' : '切换为双列'}</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			{/* 回到顶部按钮（仅浮动工具栏显示） */}
			{showBackToTop && (
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button variant="outline" size="icon" onClick={onBackToTop}>
								<ArrowUpIcon className="size-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>回到顶部</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			)}
		</div>
	)
})

// ============================================
// 主页面组件
// ============================================
export function MonitorPage() {
	const { data: storeConfigs = [], isLoading } = useStoreConfigs()
	const { mutate: activateStore } = useActivateStoreConfig()

	// 活跃 store（优先 is_active，其次第一个）
	const activeStore = storeConfigs.find((s) => s.is_active) ?? storeConfigs[0] ?? null

	// 图表控制状态
	const [selectedLevel, setSelectedLevel] = useState<AggregationLevel>(getDefaultAggregationLevel())
	const [legendVisible, setLegendVisible] = useState(true)
	const [gridCols, setGridCols] = useState<1 | 2>(2)

	// 浮动工具栏状态
	const [isDropdownOpen, setIsDropdownOpen] = useState(false)

	// 汇总表格数据（预留接口）
	// const [summaryTables, setSummaryTables] = useState([])

	const scrollToTop = () => {
		window.scrollTo({ top: 0, behavior: 'smooth' })
	}

	if (isLoading) {
		return (
			<div className="flex flex-1 items-center justify-center text-muted-foreground">
				加载数据源配置...
			</div>
		)
	}

	if (!activeStore) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
				<div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
					<span className="text-3xl">🖥</span>
				</div>
				<p className="font-semibold">暂无数据存储配置</p>
				<p className="text-sm text-muted-foreground">请先在设置页面添加 Store 配置</p>
			</div>
		)
	}

	return (
		<>
			<div className="grid gap-4 mb-14 px-4 py-4 lg:px-6">
				{/* ============================================
				    Store 详情卡片 + 状态表格
				    ============================================ */}
				<Card>
					<CardHeader className="pb-4">
						<div className="grid xl:flex gap-4 items-start">
							<div className="flex-1">
								{/* Store 名称 + 状态 + 工具按钮 */}
								<div className="flex flex-wrap items-center gap-3 gap-y-2 text-xl sm:text-2xl font-semibold mb-2">
									<span>{activeStore.name}</span>

									<Separator orientation="vertical" className="h-5 bg-primary/20" />

									{/* 状态指示器 */}
									<div className="capitalize flex gap-2 items-center text-sm font-normal">
										<span className="relative flex h-3 w-3">
											<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" style={{ animationDuration: "1.5s" }} />
											<span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
										</span>
										Active
									</div>

									<Separator orientation="vertical" className="h-4 bg-primary/20" />

									{/* 地址信息 */}
									<TooltipProvider>
										<Tooltip delayDuration={150}>
											<TooltipTrigger asChild>
												<div className="flex gap-1.5 items-center cursor-default text-sm font-normal">
													<ActivityIcon className="h-4 w-4" />
													{activeStore.addr}
												</div>
											</TooltipTrigger>
											<TooltipContent>数据存储地址</TooltipContent>
										</Tooltip>
									</TooltipProvider>

									{/* 多 Store 切换 */}
									{storeConfigs.length > 1 && (
										<>
											<Separator orientation="vertical" className="h-4 bg-primary/20" />
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button variant="outline" size="sm" className="gap-1 text-sm font-normal h-7">
														切换数据源
														<ChevronDownIcon className="size-3.5 opacity-50" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="start" className="w-56">
													<DropdownMenuRadioGroup
														value={activeStore.id}
														onValueChange={(id) => activateStore(id)}
													>
														{storeConfigs.map((s) => (
															<DropdownMenuRadioItem key={s.id} value={s.id}>
																<div className="flex flex-col">
																	<span className="font-medium">{s.name}</span>
																	<span className="text-xs text-muted-foreground font-mono">{s.addr}</span>
																</div>
															</DropdownMenuRadioItem>
														))}
													</DropdownMenuRadioGroup>
												</DropdownMenuContent>
											</DropdownMenu>
										</>
									)}
								</div>
							</div>

							{/* 右侧工具按钮 */}
							<div className="xl:ms-auto max-sm:-mb-1">
								<ToolbarButtons
									selectedLevel={selectedLevel}
									onLevelChange={setSelectedLevel}
									legendVisible={legendVisible}
									onLegendToggle={() => setLegendVisible(!legendVisible)}
									gridCols={gridCols}
									onGridColsToggle={() => setGridCols(gridCols === 2 ? 1 : 2)}
								/>
							</div>
						</div>
					</CardHeader>

					{/* Store 地址状态表格 */}
					<div className="px-6 pb-6">
						<div className="border rounded-lg overflow-hidden">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-[100px] text-center">状态</TableHead>
										<TableHead>地址</TableHead>
										<TableHead className="text-center">延迟</TableHead>
										<TableHead className="text-center">序列数</TableHead>
										<TableHead className="text-center">磁盘占用</TableHead>
										<TableHead className="text-center">保留天数</TableHead>
										<TableHead className="text-center">采样点数</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{/* 静态显示：WS 暂未推送 store 详情时的兜底展示 */}
									<TableRow className="hover:bg-muted/50">
										<TableCell className="text-center">
											<div className="flex items-center justify-center gap-2">
												<span className="inline-block size-2 rounded-full bg-green-500" />
												<span className="text-sm font-medium">Up</span>
											</div>
										</TableCell>
										<TableCell>
											<div className="flex items-center gap-2">
												<ServerIcon className="size-4 text-muted-foreground" />
												<code className="text-sm">{activeStore.addr}</code>
											</div>
										</TableCell>
										<TableCell className="text-center text-sm text-muted-foreground">-</TableCell>
										<TableCell className="text-center text-sm text-muted-foreground">-</TableCell>
										<TableCell className="text-center text-sm text-muted-foreground">-</TableCell>
										<TableCell className="text-center text-sm text-muted-foreground">-</TableCell>
										<TableCell className="text-center text-sm text-muted-foreground">-</TableCell>
									</TableRow>
								</TableBody>
							</Table>
						</div>
					</div>
				</Card>

				{/* 指标图表 */}
				<MetricCharts
					storeId={activeStore.id}
					selectedLevel={selectedLevel}
					legendVisible={legendVisible}
					gridCols={gridCols}
				/>
			</div>

			{/* 浮动工具栏 - 右下角悬浮球 */}
			<div className="fixed bottom-6 right-6 z-50 group animate-in fade-in slide-in-from-bottom-4 duration-300">
				<div className="flex items-center gap-2">
					{/* 展开的按钮组 */}
					<div className={`flex items-center gap-2 transition-all duration-300 ease-out ${
						isDropdownOpen
							? 'opacity-100 visible translate-x-0'
							: 'opacity-0 invisible translate-x-4 group-hover:opacity-100 group-hover:visible group-hover:translate-x-0'
					}`}>
						<div className="bg-background border rounded-lg shadow-lg p-2 flex items-center gap-2">
							<ToolbarButtons
								selectedLevel={selectedLevel}
								onLevelChange={setSelectedLevel}
								legendVisible={legendVisible}
								onLegendToggle={() => setLegendVisible(!legendVisible)}
								gridCols={gridCols}
								onGridColsToggle={() => setGridCols(gridCols === 2 ? 1 : 2)}
								showBackToTop={true}
								onBackToTop={scrollToTop}
							/>
						</div>
					</div>

					{/* 悬浮球触发按钮 */}
					<div className="bg-background border rounded-lg shadow-lg p-2">
						<Button
							variant="outline"
							size="icon"
							onClick={() => setIsDropdownOpen(!isDropdownOpen)}
						>
							<SettingsIcon className="size-4" />
						</Button>
					</div>
				</div>
			</div>
		</>
	)
}

// ============================================
// 颜色缓存（组件外部，避免重复计算）
// ============================================
const colorCache = new Map<string, string>()

// ============================================
// 指标图表子组件
// ============================================
interface MetricChartsProps {
	storeId: string
	selectedLevel: AggregationLevel
	legendVisible: boolean
	gridCols: 1 | 2
}

const MetricCharts = memo(function MetricCharts({
	storeId,
	selectedLevel,
	legendVisible,
	gridCols,
}: MetricChartsProps) {
	const legendPosition = gridCols === 1 ? 'right' : 'bottom'

	// 数据状态
	const [allPoints, setAllPoints] = useState<AggregatedPoint[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	// 🚀 使用 useTransition 优化数据更新，避免阻塞UI
	const [isPending, startTransition] = useTransition()

	// 每个指标的标签筛选状态
	const [metricLabelSelections, setMetricLabelSelections] = useState<Record<string, Record<string, string[] | undefined>>>({})

	// 每个指标的聚合类型选择状态
	const [metricAggregationTypes, setMetricAggregationTypes] = useState<Record<string, 'avg' | 'min' | 'max' | 'count' | 'last'>>({})

	// 🔥 性能优化1: 建立按指标名称和聚合类型的索引
	const pointsByMetric = useMemo(() => {
		const startTime = performance.now()
		const index = new Map<string, AggregatedPoint[]>()

		if (!allPoints || !Array.isArray(allPoints)) {
			return index
		}

		for (const point of allPoints) {
			const key = `${point.name}|${point.aggregation_type}`
			if (!index.has(key)) {
				index.set(key, [])
			}
			index.get(key)!.push(point)
		}

		const elapsed = performance.now() - startTime
		console.log(`[Performance] 索引构建完成: ${allPoints.length} 个数据点 -> ${index.size} 个索引键, 耗时 ${elapsed.toFixed(2)}ms`)

		return index
	}, [allPoints])

	// 从索引中提取所有指标名，归入 default 组
	const sortedMetrics = useMemo(() => {
		const metricNames = new Set<string>()
		for (const key of pointsByMetric.keys()) {
			const metricName = key.split('|')[0]
			metricNames.add(metricName)
		}

		return Array.from(metricNames).sort().map(name => ({
			groupName: 'default',
			metricConfig: { name },
			isDefault: true,
		}))
	}, [pointsByMetric])

	// 使用 ref 保存 fetchData 引用
	const isInitialLoadRef = useRef(true)
	const fetchData = useRef(async () => {})

	// 更新 fetchData 并立即执行初始加载
	useEffect(() => {
		console.log('[MetricCharts] useEffect triggered:', { storeId, level: selectedLevel.name })

		isInitialLoadRef.current = true

		fetchData.current = async () => {
			try {
				if (isInitialLoadRef.current) {
					setLoading(true)
				}
				setError(null)

				const { startTime, endTime } = calculateQueryTimeWindow(selectedLevel)

				const response = await queryPoints({
					datasource_id: storeId,
					levels: [selectedLevel.name],
					start_time: startTime,
					end_time: endTime,
				})

				console.log('[Performance] Query response received')

				const decompressStart = performance.now()
				const index = createCompressedDataIndex(response.p, storeId, selectedLevel.name)

				const metricNames = Array.from(index.metricToIndices.keys())
				const points: AggregatedPoint[] = []
				for (const metricName of metricNames) {
					const metricPoints = getPointsFromIndex(index, metricName)
					for (const point of metricPoints) {
						points.push(point)
					}
				}

				const decompressElapsed = performance.now() - decompressStart
				console.log(`[Performance] 数据解压完成: ${points.length} 个数据点, 耗时 ${decompressElapsed.toFixed(2)}ms`)

				startTransition(() => {
					setAllPoints(points)
				})

				isInitialLoadRef.current = false
			} catch (err) {
				console.error('Failed to fetch points:', err)
				setError(err instanceof Error ? err.message : '获取数据失败')
				setAllPoints([])
			} finally {
				setLoading(false)
			}
		}

		console.log('Initial data load triggered')
		fetchData.current()
	}, [storeId, selectedLevel.name])

	// 定时刷新
	useEffect(() => {
		const interval = selectedLevel.refreshInterval

		console.log(`Setting up auto-refresh with interval: ${interval}ms`)

		const timer = setInterval(() => {
			console.log(`Auto-refreshing data for level: ${selectedLevel.name}`)
			fetchData.current()
		}, interval)

		return () => {
			console.log('Clearing auto-refresh timer')
			clearInterval(timer)
		}
	}, [selectedLevel.refreshInterval])

	// 🔥 性能优化: 为每个指标的每种聚合类型预计算数据
	const allMetricsDataByAggType = useMemo(() => {
		console.log('[MetricCharts] ⚡ allMetricsDataByAggType useMemo 开始计算...')
		console.time('[MetricCharts] allMetricsDataByAggType 总耗时')
		const startTime = performance.now()

		if (!allPoints || !Array.isArray(allPoints)) {
			console.timeEnd('[MetricCharts] allMetricsDataByAggType 总耗时')
			return new Map()
		}

		const dataMap = new Map<string, Map<string, any>>()

		sortedMetrics.forEach((metric) => {
			const metricDataByAggType = new Map<string, any>()

			AGGREGATION_TYPES.forEach((aggType) => {
				const key = `${metric.metricConfig.name}|${aggType}`
				let metricPoints = pointsByMetric.get(key) || []

				// 提取可用标签
				const availableLabels = extractAvailableLabels(metricPoints)

				// 应用标签筛选
				const selectedLabels = metricLabelSelections[metric.metricConfig.name] || {}
				const filteredPoints = filterPointsByLabels(metricPoints, selectedLabels)

				// 按时间序列分组
				const allSeries = groupByTimeSeries(filteredPoints)

				// 限制最多 30 条序列
				const MAX_SERIES_PER_METRIC = 30
				const seriesKeys = Array.from(allSeries.keys())
				const truncatedSeriesCount = Math.max(0, seriesKeys.length - MAX_SERIES_PER_METRIC)
				const limitedSeriesKeys = seriesKeys.slice(0, MAX_SERIES_PER_METRIC)
				const series = new Map(limitedSeriesKeys.map(key => [key, allSeries.get(key)!]))

				// 生成图表数据
				const timeMap = new Map<number, any>()
				series.forEach((points, seriesKey) => {
					points.forEach(point => {
						if (!timeMap.has(point.timestamp)) {
							timeMap.set(point.timestamp, { timestamp: point.timestamp })
						}
						const row = timeMap.get(point.timestamp)!
						row[seriesKey] = point.value
					})
				})

				const chartData = Array.from(timeMap.values()).sort((a, b) => a.timestamp - b.timestamp)

				// 生成数据点配置
				const dataPoints = Array.from(series.keys()).map((seriesKey, index) => {
					const cacheKey = `${seriesKey}-${index}`
					let color = colorCache.get(cacheKey)

					if (!color) {
						const baseHues = [0, 45, 210, 270, 180]
						let hash = 0
						for (let i = 0; i < seriesKey.length; i++) {
							hash = ((hash << 5) - hash) + seriesKey.charCodeAt(i)
							hash = hash & hash
						}
						const colorIndex = (Math.abs(hash) + index) % baseHues.length
						const baseHue = baseHues[colorIndex]
						const hueOffset = ((Math.abs(hash) * 7 + index * 13) % 20) - 10
						const hue = (baseHue + hueOffset + 360) % 360
						const saturation = 45 + ((Math.abs(hash) + index * 3) % 16)
						const lightness = 55 + ((Math.abs(hash) * 5 + index * 7) % 11)
						color = `hsl(${hue}, ${saturation}%, ${lightness}%)`
						colorCache.set(cacheKey, color)
					}

					const labels = formatSeriesLabel(seriesKey, { showMetricName: false })
					return {
						label: labels.truncated,
						fullLabel: labels.full,
						dataKey: seriesKey,
						color,
						fillOpacity: 0.3,
					}
				})

				metricDataByAggType.set(aggType, {
					chartData,
					dataPoints,
					availableLabels,
					seriesCount: allSeries.size,
					truncatedCount: truncatedSeriesCount,
				})
			})

			dataMap.set(metric.metricConfig.name, metricDataByAggType)
		})

		const elapsed = performance.now() - startTime
		console.log(`[MetricCharts] 📊 基础数据预计算完成: ${sortedMetrics.length} 个指标, 耗时 ${elapsed.toFixed(2)}ms`)
		console.timeEnd('[MetricCharts] allMetricsDataByAggType 总耗时')

		return dataMap
	}, [sortedMetrics, pointsByMetric, metricLabelSelections])

	// 根据当前选择的聚合类型提取数据
	const metricsData: MetricData[] = useMemo(() => {
		return sortedMetrics.map((metric) => {
			const selectedAggType = metricAggregationTypes[metric.metricConfig.name] || 'avg'
			const metricDataByAggType = allMetricsDataByAggType.get(metric.metricConfig.name)
			const data = metricDataByAggType?.get(selectedAggType)

			return {
				metricConfig: metric.metricConfig,
				groupName: metric.groupName,
				isDefault: metric.isDefault,
				chartData: data?.chartData || [],
				dataPoints: data?.dataPoints || [],
				availableLabels: data?.availableLabels || {},
				selectedLabels: metricLabelSelections[metric.metricConfig.name] || {},
				seriesCount: data?.seriesCount || 0,
				truncatedCount: data?.truncatedCount,
			}
		})
	}, [sortedMetrics, allMetricsDataByAggType, metricAggregationTypes, metricLabelSelections])

	// 分离有数据和没数据的指标
	const { metricsWithData, metricsWithoutData } = useMemo(() => {
		const withData: MetricData[] = []
		const withoutData: MetricData[] = []

		metricsData.forEach(metric => {
			if (metric.chartData.length > 0) {
				withData.push(metric)
			} else {
				withoutData.push(metric)
			}
		})

		return { metricsWithData: withData, metricsWithoutData: withoutData }
	}, [metricsData])

	// 计算时间范围
	const timeRange = useMemo(() => {
		if (!allPoints || !Array.isArray(allPoints) || allPoints.length === 0) {
			return { start: 0, end: 0 }
		}

		let minTime = allPoints[0].timestamp
		let maxTime = allPoints[0].timestamp

		for (let i = 1; i < allPoints.length; i++) {
			const timestamp = allPoints[i].timestamp
			if (timestamp < minTime) minTime = timestamp
			if (timestamp > maxTime) maxTime = timestamp
		}

		return { start: minTime, end: maxTime }
	}, [allPoints])

	// 加载状态
	if (loading) {
		return (
			<Card>
				<CardContent className="p-6">
					<div className="flex items-center justify-center h-48 text-muted-foreground">
						加载数据中...
					</div>
				</CardContent>
			</Card>
		)
	}

	// 错误状态
	if (error) {
		return (
			<Card>
				<CardContent className="p-6">
					<div className="flex items-center justify-center h-48 text-destructive">
						<div className="text-center space-y-2">
							<AlertCircleIcon className="size-8 mx-auto" />
							<div>{error}</div>
						</div>
					</div>
				</CardContent>
			</Card>
		)
	}

	// 无数据状态
	if (allPoints.length === 0) {
		return (
			<Card>
				<CardContent className="p-6">
					<div className="flex items-center justify-center h-48 text-muted-foreground">
						暂无数据，等待采集...
					</div>
				</CardContent>
			</Card>
		)
	}

	return (
		<>
			{/* 🚀 数据更新中的提示（非阻塞式） */}
			{isPending && (
				<div className="fixed top-20 right-6 z-50 bg-background/95 backdrop-blur-sm border rounded-lg px-4 py-2 shadow-lg animate-in slide-in-from-top-4 duration-300">
					<div className="flex items-center gap-2 text-sm">
						<div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
						<span className="text-muted-foreground">数据更新中...</span>
					</div>
				</div>
			)}

			{/* 指标图表网格 */}
			<MetricChartsGrid
				metricsData={metricsWithData}
				timeRange={timeRange}
				legendVisible={legendVisible}
				gridCols={gridCols}
				legendPosition={legendPosition}
				metricAggregationTypes={metricAggregationTypes}
				onAggregationTypeChange={(metricName, aggType) => {
					setMetricAggregationTypes(prev => ({
						...prev,
						[metricName]: aggType,
					}))
				}}
				onLabelSelectionChange={(metricName, selection) => {
					startTransition(() => {
						setMetricLabelSelections(prev => ({
							...prev,
							[metricName]: selection,
						}))
					})
				}}
			/>

			{/* 没有数据的指标提示 */}
			{metricsWithoutData.length > 0 && (
				<Card className="mt-6 border-dashed">
					<CardHeader className="pb-3">
						<div className="flex items-center gap-2">
							<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
								<AlertCircleIcon className="size-4 text-muted-foreground" />
							</div>
							<div className="flex-1">
								<CardTitle className="text-base">暂无监控数据的指标</CardTitle>
								<CardDescription className="text-xs mt-0.5">
									以下 {metricsWithoutData.length} 个指标已检测到，但当前没有数据
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent className="pt-0">
						<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
							{metricsWithoutData.map((metric) => (
								<div
									key={`${metric.groupName}-${metric.metricConfig.name}`}
									className="flex items-start gap-2 rounded-lg border bg-card p-3 text-sm"
								>
									<div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
										<div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
									</div>
									<div className="flex-1 min-w-0">
										<div className="font-medium truncate">{metric.metricConfig.name}</div>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}
		</>
	)
})
