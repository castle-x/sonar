/**
 * ============================================
 * 数据源详情页面（Dashboard）
 * ============================================
 * 
 * 功能：
 * 1. 展示数据源的基本信息和状态
 * 2. 显示所有 Pushgateway 地址的状态（表格）
 * 3. WebSocket 实时订阅数据源状态更新
 * 4. 参考 Beszel 的 system.tsx 设计
 */

import React, { memo, useEffect, useMemo, useRef, useState, useTransition } from "react"
import {
	SquirrelIcon,
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
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FooterRepoLink } from "@/components/footer-repo-link"
import { 
  getDatasource, 
  subscribeDatasourceStatus,
  setWebSocketClient,
  type DatasourceRecord,
  type DatasourceStatus,
  type DatasourceStatusBroadcast
} from "@/apis/datasource"
import { AGGREGATION_LEVELS, getDefaultAggregationLevel, calculateQueryTimeWindow, type AggregationLevel } from "@/config/aggregation"
import { cn } from "@/lib/utils"
import { WebSocketClient, WSState } from "@/apis/websocket"
import { PageLoading } from "@/components/loading"
import { navigate } from "@/components/router"
import { buildWsUrl } from "@/config/api"
import { queryPoints, type AggregatedPoint, type SummaryTable } from "@/apis/points"
import {
	MetricChartsGrid, 
	type MetricData,
	groupByTimeSeries,
	formatSeriesLabel,
	extractAvailableLabels,
	filterPointsByLabels,
} from "@/components/charts"
import { SummaryTablesCard } from "@/components/charts/summary-tables-card"
import { applyTransform, formatBytes, AGGREGATION_TYPES } from "@/lib/metric-utils"

// ============================================
// 状态颜色映射
// ============================================
const STATUS_COLORS = {
	healthy: "bg-green-500",
	degraded: "bg-yellow-500",
	down: "bg-red-500",
	online: "bg-green-500",
	offline: "bg-red-500",
} as const

const STATUS_LABELS = {
	healthy: "Up",
	degraded: "Degraded",
	down: "Down",
	online: "Online",
	offline: "Offline",
} as const

// ============================================
// 工具栏按钮组件（可复用）
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
									<span className="text-xs text-muted-foreground">{level.interval} 间隔</span>
								</div>
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			
			{/* 图例可见性切换 */}
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="outline"
						size="icon"
						onClick={onLegendToggle}
					>
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
				<TooltipContent>
					{legendVisible ? '隐藏图例' : '显示图例'}
				</TooltipContent>
			</Tooltip>
			
			{/* 布局切换按钮 */}
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="outline"
						size="icon"
						onClick={onGridColsToggle}
					>
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
				<TooltipContent>
					{gridCols === 2 ? '切换到平铺视图' : '切换到标签页视图'}
				</TooltipContent>
			</Tooltip>
			
			{/* 回到顶部按钮（仅浮动工具栏显示） */}
			{showBackToTop && (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="outline"
							size="icon"
							onClick={onBackToTop}
						>
							<ArrowUpIcon className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						回到顶部
					</TooltipContent>
				</Tooltip>
			)}
		</div>
	)
})

// ============================================
// 主组件：数据源详情页面
// ============================================
export default memo(function Dashboard({ id }: { id: string }) {
	const wsClient = useRef<WebSocketClient | null>(null)
	const unsubscribeRef = useRef<(() => void) | null>(null)
	
	// 状态管理
	const [datasource, setDatasource] = useState<DatasourceRecord | null>(null)
	const [datasourceStatus, setDatasourceStatus] = useState<DatasourceStatus | null>(null)
	const [loading, setLoading] = useState(true)
	const [wsConnected, setWsConnected] = useState(false)
	
	// 图表控制状态
	const [selectedLevel, setSelectedLevel] = useState<AggregationLevel>(getDefaultAggregationLevel())
	const [legendVisible, setLegendVisible] = useState(true)
	const [gridCols, setGridCols] = useState<1 | 2>(2)
	
	// 浮动工具栏状态
	const [isDropdownOpen, setIsDropdownOpen] = useState(false)
	
	// 汇总表格数据
	const [summaryTables, setSummaryTables] = useState<SummaryTable[]>([])

	// 设置页面标题
	useEffect(() => {
		if (datasource) {
			document.title = `${datasource.name} / Monitor Hub`
		}
	}, [datasource?.name])


	// 获取数据源详情
	useEffect(() => {
		if (!id) {
			navigate("/")
			return
		}

		// 从 API 获取数据源详情
		const fetchDatasource = async () => {
			try {
				setLoading(true)
				const data = await getDatasource(id)
				setDatasource(data)
			} catch (error) {
				console.error("获取数据源详情失败:", error)
				// 跳转回首页
				navigate("/")
			} finally {
				setLoading(false)
			}
		}

		fetchDatasource()
	}, [id])

	// WebSocket 连接和订阅
	useEffect(() => {
		if (!id) {
			return
		}

		// 初始化 WebSocket 客户端
		if (!wsClient.current) {
			wsClient.current = new WebSocketClient({
				url: buildWsUrl(),
				autoReconnect: true,
				debug: import.meta.env.DEV,
			})

			// 设置到 datasource API（让 API 可以使用这个客户端）
			setWebSocketClient(wsClient.current)

			// 监听连接状态
			wsClient.current.onStateChange((state: WSState) => {
				console.log("WebSocket state changed:", state)
				setWsConnected(state === WSState.CONNECTED)
			})

			// 连接 WebSocket
			wsClient.current.connect().catch((error) => {
				console.error("Failed to connect WebSocket:", error)
			})
		}

		// 订阅数据源状态
		const subscribe = () => {
			// 如果已经有订阅，先取消
			if (unsubscribeRef.current) {
				unsubscribeRef.current()
				unsubscribeRef.current = null
			}

			// 使用 datasource API 的订阅方法
			const unsubscribe = subscribeDatasourceStatus(
				{
					datasource_ids: [id],
					include_details: true
				},
				(data: DatasourceStatusBroadcast) => {
					// console.log("Received datasource status update:", data)
					
					// 找到当前数据源的状态
					const status = data.updates.find(s => s.datasource_id === id)
					if (status) {
						// ⚠️ 只更新 datasourceStatus，不更新 datasource
						// 原因：避免触发 useEffect 重新执行导致循环订阅
						setDatasourceStatus(status)
					}
				}
			)

			unsubscribeRef.current = unsubscribe
		}

		// 连接成功后订阅
		if (wsConnected) {
			subscribe()
		}

		// 清理函数
		return () => {
			if (unsubscribeRef.current) {
				unsubscribeRef.current()
				unsubscribeRef.current = null
			}
		}
	}, [id, wsConnected])

	// 组件卸载时断开 WebSocket
	useEffect(() => {
		return () => {
			if (wsClient.current) {
				wsClient.current.disconnect()
				wsClient.current = null
			}
		}
	}, [])
	
	
	// 回到顶部函数
	const scrollToTop = () => {
		window.scrollTo({
			top: 0,
			behavior: 'smooth',
		})
	}

	// 计算系统信息栏数据
	const systemInfo = useMemo(() => {
		if (!datasource) return []

		return [
			{
				value: datasource.app_id,
				Icon: SquirrelIcon,
				label: "项目ID",
			},
			/* {
				value: `${datasource.pushgateway_addr_list.length} 个地址`,
				Icon: LinkIcon,
				label: "数据源地址数量",
			}, */
			{
				value: datasourceStatus 
					? `${datasourceStatus.healthy_count} / ${datasourceStatus.total_count}`
					: `${datasource.pushgateway_addr_list.length} / ${datasource.pushgateway_addr_list.length}`,
				Icon: ActivityIcon,
				label: "健康地址 / 总地址",
			},
		]
	}, [datasource, datasourceStatus])

	// 加载状态
	if (loading || !datasource) {
		return (
			<>
				<PageLoading text="加载数据源详情..." />
				<FooterRepoLink />
			</>
		)
	}

	// 优先使用 WebSocket 实时状态，fallback 到 HTTP API 的初始状态
	const currentStatus = datasourceStatus?.overall_status || datasource.status
	const statusColor = STATUS_COLORS[currentStatus as keyof typeof STATUS_COLORS] || "bg-gray-500"
	const statusLabel = STATUS_LABELS[currentStatus as keyof typeof STATUS_LABELS] || currentStatus

	return (
		<>
			<div className="grid gap-4 mb-14">
				{/* ============================================
				    数据源详情 + Pushgateway（合并后的卡片）
				    ============================================ */}
				<Card>
					<CardHeader className="pb-4">
						{/* 标题行：数据源名称 + 状态 + 系统信息 + 工具按钮 */}
						<div className="grid xl:flex gap-4 items-start">
							<div className="flex-1">
								{/* 数据源名称 + 状态信息栏 */}
								<div className="flex flex-wrap items-center gap-3 gap-y-2 text-xl sm:text-2xl font-semibold mb-2">
							{/* 数据源名称 */}
									<span>{datasource.name}</span>
							
									<Separator orientation="vertical" className="h-5 bg-primary/20" />
									
								{/* 状态指示器 */}
								<TooltipProvider>
									<Tooltip>
											{/* 状态指示器 */}
										<TooltipTrigger asChild>
												<div className="capitalize flex gap-2 items-center text-sm font-normal">
												<span className={cn("relative flex h-3 w-3")}>
													{currentStatus === "healthy" && (
														<span
															className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"
															style={{ animationDuration: "1.5s" }}
														/>
													)}
													<span
														className={cn("relative inline-flex rounded-full h-3 w-3", statusColor)}
													/>
												</span>
												{statusLabel}
											</div>
										</TooltipTrigger>
										<TooltipContent>
											<div className="flex gap-1 items-center">
												{wsConnected ? (
													<>
														<CheckCircleIcon className="size-4 text-green-500" />
														WebSocket 已连接
													</>
												) : (
													<>
														<XCircleIcon className="size-4 text-red-500" />
														WebSocket 未连接
													</>
												)}
											</div>
										</TooltipContent>
									</Tooltip>
								</TooltipProvider>

									{/* 系统信息项（在状态指示器右侧） */}
									{systemInfo.map(({ value, label, Icon }) => (
										<React.Fragment key={label}>
											<Separator orientation="vertical" className="h-4 bg-primary/20" />
											<TooltipProvider>
												<Tooltip delayDuration={150}>
													<TooltipTrigger asChild>
														<div className="flex gap-1.5 items-center cursor-default text-sm font-normal">
															<Icon className="h-4 w-4" /> {value}
														</div>
													</TooltipTrigger>
													<TooltipContent>{label}</TooltipContent>
												</Tooltip>
											</TooltipProvider>
										</React.Fragment>
									))}
									
									{/* 最后检查时间 */}
									{datasourceStatus && (
										<>
											<Separator orientation="vertical" className="h-4 bg-primary/20" />
											<span className="text-sm font-normal text-muted-foreground">
												最后检查: {new Date(datasourceStatus.last_check_time * 1000).toLocaleString("zh-CN")}
											</span>
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
					
					{/* Pushgateway 表格 */}
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
									{datasourceStatus?.addresses.map((addr) => {
										const statusColor = STATUS_COLORS[addr.status]
										const statusLabel = STATUS_LABELS[addr.status]
										
										return (
											<TableRow key={addr.address} className="hover:bg-muted/50">
												{/* 状态列 */}
												<TableCell className="text-center">
													<div className="flex items-center justify-center gap-2">
														<span className={cn("inline-block size-2 rounded-full", statusColor)} />
														<span className="text-sm font-medium">{statusLabel}</span>
													</div>
												</TableCell>
												
												{/* 地址列 */}
												<TableCell>
													<div className="flex items-center gap-2">
														<ServerIcon className="size-4 text-muted-foreground" />
														<code className="text-sm">{addr.address}</code>
													</div>
													{addr.error_message && (
														<div className="flex items-center gap-1 mt-1 text-xs text-destructive">
															<AlertCircleIcon className="size-3" />
															{addr.error_message}
														</div>
													)}
												</TableCell>
												
												{/* 延迟列 */}
												<TableCell className="text-center text-sm">
													{addr.status === "online" ? `${addr.latency_ms} ms` : "-"}
												</TableCell>
												
												{/* 序列数列 */}
												<TableCell className="text-center text-sm">
													{addr.total_series?.toLocaleString() || "-"}
												</TableCell>
												
												{/* 磁盘占用列 */}
												<TableCell className="text-center text-sm">
													{addr.disk_size ? formatBytes(addr.disk_size) : "-"}
												</TableCell>
												
												{/* 保留天数列 */}
												<TableCell className="text-center text-sm">
													{addr.retention_days ? `${addr.retention_days} 天` : "-"}
												</TableCell>
												
												{/* 采样点数列 */}
												<TableCell className="text-center text-sm">
													{addr.total_samples?.toLocaleString() || "-"}
												</TableCell>
											</TableRow>
										)
									}) || datasource.pushgateway_addr_list.map((address) => (
										// 如果没有 WebSocket 数据，显示静态地址列表
										<TableRow key={address}>
											<TableCell className="text-center">
												<div className="flex items-center justify-center gap-2">
													<span className="inline-block size-2 rounded-full bg-gray-400" />
													<span className="text-sm font-medium text-muted-foreground">等待中</span>
												</div>
											</TableCell>
											<TableCell>
												<div className="flex items-center gap-2">
													<ServerIcon className="size-4 text-muted-foreground" />
													<code className="text-sm">{address}</code>
												</div>
											</TableCell>
											<TableCell className="text-center text-sm text-muted-foreground">-</TableCell>
											<TableCell className="text-center text-sm text-muted-foreground">-</TableCell>
											<TableCell className="text-center text-sm text-muted-foreground">-</TableCell>
											<TableCell className="text-center text-sm text-muted-foreground">-</TableCell>
											<TableCell className="text-center text-sm text-muted-foreground">-</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</div>
				</Card>

			{/* 汇总数据表格 */}
			<SummaryTablesCard tables={summaryTables} />

		{/* 指标图表 */}
		<MetricCharts
			datasource={datasource}
			datasourceId={id}
			selectedLevel={selectedLevel}
			legendVisible={legendVisible}
			gridCols={gridCols}
			onTablesUpdate={setSummaryTables}
		/>
		</div>
		
		{/* 浮动工具栏 - 悬浮球抽屉式展开（始终显示） */}
		{(
			<div className="fixed bottom-6 right-6 z-50 group animate-in fade-in slide-in-from-bottom-4 duration-300">
				<div className="flex items-center gap-2">
					{/* 展开的按钮组 - 从右向左滑入，下拉框打开时保持展开 */}
					<div className={`flex items-center gap-2 transition-all duration-300 ease-out ${
						isDropdownOpen 
							? 'opacity-100 visible translate-x-0' 
							: 'opacity-0 invisible translate-x-4 group-hover:opacity-100 group-hover:visible group-hover:translate-x-0'
					}`}>
						<div className="bg-background border rounded-lg shadow-lg p-2 flex items-center gap-2">
							{/* 聚合级别选择器 */}
							<DropdownMenu onOpenChange={setIsDropdownOpen}>
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
											if (level) setSelectedLevel(level)
										}}
									>
										{AGGREGATION_LEVELS.map((level) => (
											<DropdownMenuRadioItem key={level.name} value={level.name}>
												<div className="flex flex-col">
													<span className="font-medium">{level.displayLabel}</span>
													<span className="text-xs text-muted-foreground">{level.interval} 间隔</span>
												</div>
											</DropdownMenuRadioItem>
										))}
									</DropdownMenuRadioGroup>
								</DropdownMenuContent>
							</DropdownMenu>
						
						{/* 图例可见性切换 */}
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="outline"
									size="icon"
									onClick={() => setLegendVisible(!legendVisible)}
								>
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
							<TooltipContent side="top">
								{legendVisible ? '隐藏图例' : '显示图例'}
							</TooltipContent>
						</Tooltip>
						
						{/* 布局切换按钮 */}
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="outline"
									size="icon"
									onClick={() => setGridCols(gridCols === 2 ? 1 : 2)}
								>
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
							<TooltipContent side="top">
								{gridCols === 2 ? '切换到平铺视图' : '切换到标签页视图'}
							</TooltipContent>
						</Tooltip>
						
						{/* 回到顶部按钮 */}
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="outline"
									size="icon"
									onClick={scrollToTop}
								>
									<ArrowUpIcon className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top">
								回到顶部
							</TooltipContent>
						</Tooltip>
						</div>
					</div>
					
					{/* 悬浮球触发按钮 - 始终显示，保留双层边框结构 */}
					<div className="bg-background border rounded-lg shadow-lg p-2">
						<Button
							variant="outline"
							size="icon"
						>
							<SettingsIcon className="size-4" />
						</Button>
					</div>
				</div>
			</div>
		)}
		
		<FooterRepoLink />
		</>
	)
})

// ============================================
// 指标图表组件
// ============================================

// 🔥 性能优化3: 颜色计算缓存（在组件外部定义，避免重复计算）
const colorCache = new Map<string, string>()

interface MetricChartsProps {
	datasource: DatasourceRecord
	datasourceId: string
	selectedLevel: AggregationLevel
	legendVisible: boolean
	gridCols: 1 | 2
	onTablesUpdate: (tables: SummaryTable[]) => void
}

/**
 * MetricCharts - 按分组渲染指标图表
 * 
 * 特点：
 * - 逻辑上按分组排序
 * - 渲染上不显示分组容器
 * - 图表按分组顺序依次排列
 */
const MetricCharts = memo(function MetricCharts({
	datasource,
	datasourceId,
	selectedLevel,
	legendVisible,
	gridCols,
	onTablesUpdate,
}: MetricChartsProps) {
	/* console.log('[MetricCharts] Component rendered:', {
		datasourceId: datasource.id,
		datasourceName: datasource.name,
		level: selectedLevel.name,
		hasGroupmap: !!datasource.groupmap,
		groupmapKeys: datasource.groupmap ? Object.keys(datasource.groupmap).length : 0,
	}) */
	
	// 图例位置根据布局自动决定
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
	
	// 🔥 性能优化1: 建立按指标名称和聚合类型的索引，避免重复遍历全量数据
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
	
	// 将 groupmap 展平为按分组排序的指标列表，并添加未配置的指标到 default 组
	// 🔥 性能优化2: 使用 pointsByMetric 索引而不是遍历 allPoints
	const sortedMetrics = useMemo(() => {
		// 1. 收集 groupmap 中配置的指标
		const configuredMetrics = new Set<string>()
		const metrics: Array<{
			groupName: string
			metricConfig: {
				name: string
				alias?: string
				description?: string
				unit?: string
				transform?: string
				display_labels?: string[]
				column_span?: 'full' | 'half'
			}
			isDefault?: boolean
		}> = []
		
		if (datasource.groupmap && Object.keys(datasource.groupmap).length > 0) {
			// 根据 groupmap_sort_keys 确定分组顺序
			let groupNames: string[]
			if (datasource.groupmap_sort_keys && datasource.groupmap_sort_keys.length > 0) {
				// 使用自定义排序：先排已配置的 keys，再排未配置的 keys（字母序）
				const sortedKeys = datasource.groupmap_sort_keys.filter(key => key in datasource.groupmap!)
				const unsortedKeys = Object.keys(datasource.groupmap).filter(key => !sortedKeys.includes(key)).sort()
				groupNames = [...sortedKeys, ...unsortedKeys]
			} else {
				// 回退到字母排序
				groupNames = Object.keys(datasource.groupmap).sort()
			}
			
			groupNames.forEach(groupName => {
				const metricConfigs = datasource.groupmap![groupName]
				metricConfigs.forEach(config => {
					configuredMetrics.add(config.name)
					metrics.push({
						groupName,
						metricConfig: config,
						isDefault: false,
					})
				})
			})
		}
		
		// 2. 从索引中找出未配置的指标（default 组）- 避免遍历全量数据
		const unconfiguredMetrics = new Set<string>()
		for (const key of pointsByMetric.keys()) {
			const metricName = key.split('|')[0]
			if (!configuredMetrics.has(metricName)) {
				unconfiguredMetrics.add(metricName)
			}
		}
		
		// 3. 将未配置的指标添加到 default 组（排在最后）
		Array.from(unconfiguredMetrics).sort().forEach(metricName => {
			metrics.push({
				groupName: 'default',
				metricConfig: {
					name: metricName,
					// 不设置 alias、unit、transform 等
				},
				isDefault: true,
			})
		})
		
		return metrics
	}, [datasource.groupmap, pointsByMetric])
	
	// 使用ref来避免不必要的依赖
	const isInitialLoadRef = useRef(true)
	const fetchData = useRef(async () => {})
	
	// 更新 fetchData 函数引用并立即执行初始加载
	useEffect(() => {
		console.log('[MetricCharts] useEffect triggered for fetchData update:', {
			datasourceId: datasourceId,
			level: selectedLevel.name,
		})
		
		// 切换级别或数据源时重置初始加载标记
		isInitialLoadRef.current = true
		
		fetchData.current = async () => {
			try {
				// 只在首次加载时显示loading，定时刷新不显示
				if (isInitialLoadRef.current) {
					setLoading(true)
				}
				setError(null)
				
			// 计算查询时间窗口（基于级别的保留时间和查询延迟）
			const { startTime, endTime } = calculateQueryTimeWindow(selectedLevel)
				
				/* console.log('Fetching points:', {
					datasource_id: datasourceId,
					levels: [selectedLevel.name],
				start_time: new Date(startTime).toISOString(),
				end_time: new Date(endTime).toISOString(),
				retention: selectedLevel.retention,
					note: '查询所有指标（不过滤指标名称）',
					isInitialLoad: isInitialLoadRef.current,
				}) */
				
				const response = await queryPoints({
					datasource_id: datasourceId,
					levels: [selectedLevel.name],
				start_time: startTime,
				end_time: endTime,
				// 不传 aggregation_types，后端默认查询所有类型（avg/min/max/count）
				})
				
			console.log('[Performance] Query response received')
			
			// 处理压缩数据格式（高性能）
			const decompressStart = performance.now()
			
			// 使用高性能索引而不是完全解压
			const { createCompressedDataIndex, getPointsFromIndex } = await import('@/apis/points-compressed')
			const index = createCompressedDataIndex(response.p, datasourceId, selectedLevel.name)
			
			// 按指标名称提取数据（避免一次性解压所有数据）
			const metricNames = Array.from(index.metricToIndices.keys())
			const points: AggregatedPoint[] = []
			for (const metricName of metricNames) {
				const metricPoints = getPointsFromIndex(index, metricName)
				// 🔥 避免使用扩展运算符导致堆栈溢出（大数据场景）
				for (const point of metricPoints) {
					points.push(point)
				}
			}
			
			const decompressElapsed = performance.now() - decompressStart
			console.log(`[Performance] 数据解压完成: ${points.length} 个数据点, 耗时 ${decompressElapsed.toFixed(2)}ms, 压缩比: ${(response.p.k.length / points.length * 100).toFixed(1)}%`)
			
		const tables = response.t || []
		
		// 🚀 使用 startTransition 将状态更新标记为非紧急，避免阻塞UI
		startTransition(() => {
			setAllPoints(points)
			onTablesUpdate(tables)
		})
		
		// 标记初始加载完成
		isInitialLoadRef.current = false
			} catch (err) {
				console.error('Failed to fetch points:', err)
				setError(err instanceof Error ? err.message : '获取数据失败')
				setAllPoints([])
			} finally {
				setLoading(false)
			}
		}
		
		// 立即执行初始加载
		console.log('Initial data load triggered')
		fetchData.current()
	}, [datasourceId, selectedLevel.name])
	
	// 定时刷新数据
	useEffect(() => {
		const interval = selectedLevel.refreshInterval
		
		console.log(`Setting up auto-refresh with interval: ${interval}ms (${interval / 1000}s)`)
		
		const timer = setInterval(() => {
			console.log(`Auto-refreshing data for level: ${selectedLevel.name}`)
			fetchData.current()
		}, interval)
		
		// 清理定时器
		return () => {
			console.log('Clearing auto-refresh timer')
			clearInterval(timer)
		}
	}, [selectedLevel.refreshInterval])
	
	// 🔥 性能优化8: 第一层 - 为每个指标的每种聚合类型预计算数据（不依赖 metricAggregationTypes）
	// 这样切换聚合类型时不会触发这个 useMemo 重新计算
	const allMetricsDataByAggType = useMemo(() => {
		console.log('[Dashboard] ⚡ allMetricsDataByAggType useMemo 开始计算...')
		console.time('[Dashboard] allMetricsDataByAggType 总耗时')
		const startTime = performance.now()
		
		// 确保 allPoints 是数组
		if (!allPoints || !Array.isArray(allPoints)) {
			console.timeEnd('[Dashboard] allMetricsDataByAggType 总耗时')
			return new Map()
		}
		
		const dataMap = new Map<string, Map<string, any>>()
		let totalFilterTime = 0
		let totalGroupTime = 0
		let totalChartDataTime = 0
		let totalDataPointsTime = 0
		
		sortedMetrics.forEach((metric, metricIndex) => {
			const metricDataByAggType = new Map<string, any>()
			
			AGGREGATION_TYPES.forEach((aggType) => {
				// 🔥 性能优化4: 使用索引直接获取数据，O(1) 复杂度而不是 O(N) 遍历
				const key = `${metric.metricConfig.name}|${aggType}`
				let metricPoints = pointsByMetric.get(key) || []
			
			// 🔥 性能优化5: 避免不必要的对象创建，只在值改变时才创建新对象
			if (metric.metricConfig.transform && !metric.isDefault && metricPoints.length > 0) {
				const transform = metric.metricConfig.transform
				metricPoints = metricPoints.map(point => {
					const newValue = applyTransform(point.value, transform)
					// 如果值没变，直接返回原对象，避免创建新对象
					if (newValue === point.value) return point
					return { ...point, value: newValue }
				})
			}
			
			// 提取可用标签
			const availableLabels = extractAvailableLabels(metricPoints)
			
			// 应用标签筛选
			const filterStart = performance.now()
			const selectedLabels = metricLabelSelections[metric.metricConfig.name] || {}
			const filteredPoints = filterPointsByLabels(metricPoints, selectedLabels)
			totalFilterTime += performance.now() - filterStart
			
			// 按时间序列分组
			const groupStart = performance.now()
			const allSeries = groupByTimeSeries(filteredPoints)
			totalGroupTime += performance.now() - groupStart
			
			// 🔥 性能优化10: 在数据层面限制序列数量，避免后续大量计算
			const MAX_SERIES_PER_METRIC = 30
			const seriesKeys = Array.from(allSeries.keys())
			const truncatedSeriesCount = Math.max(0, seriesKeys.length - MAX_SERIES_PER_METRIC)
			const limitedSeriesKeys = seriesKeys.slice(0, MAX_SERIES_PER_METRIC)
			const series = new Map(limitedSeriesKeys.map(key => [key, allSeries.get(key)!]))
			
			// 生成图表数据
			const chartDataStart = performance.now()
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
			totalChartDataTime += performance.now() - chartDataStart
			
			// 生成数据点配置（用于图表渲染）
			const dataPointsStart = performance.now()
			const dataPoints = Array.from(series.keys()).map((seriesKey, index) => {
				// 🔥 性能优化6: 使用缓存避免重复计算颜色
				const cacheKey = `${seriesKey}-${index}`
				let color = colorCache.get(cacheKey)
				
				if (!color) {
					// 定义五种基础色相：红、黄、蓝、紫、青
					const baseHues = [
						0,    // 红色
						45,   // 橙黄
						210,  // 蓝色
						270,  // 紫色
						180,  // 青色
					]
					
					// 使用字符串哈希生成确定性的颜色选择
					let hash = 0
					for (let i = 0; i < seriesKey.length; i++) {
						hash = ((hash << 5) - hash) + seriesKey.charCodeAt(i)
						hash = hash & hash // Convert to 32bit integer
					}
					
					// 从五种基础色中选择一种（基于哈希值和索引）
					const colorIndex = (Math.abs(hash) + index) % baseHues.length
					const baseHue = baseHues[colorIndex]
					
					// 添加一些色相偏移以增加变化（±10度范围内）
					const hueOffset = ((Math.abs(hash) * 7 + index * 13) % 20) - 10
					const hue = (baseHue + hueOffset + 360) % 360
					
					// 使用低饱和度（35-50%）和适中的亮度（55-65%）
					const saturation = 45 + ((Math.abs(hash) + index * 3) % 16)
					const lightness = 55 + ((Math.abs(hash) * 5 + index * 7) % 11)
					
					color = `hsl(${hue}, ${saturation}%, ${lightness}%)`
					colorCache.set(cacheKey, color)
				}
				
				// 应用 display_labels 配置（仅影响显示，不影响数据唯一性）
				const labels = formatSeriesLabel(seriesKey, { 
					showMetricName: false,
					displayLabels: metric.metricConfig.display_labels
				})
				return {
					label: labels.truncated,
					fullLabel: labels.full,
					dataKey: seriesKey,
					color,
					fillOpacity: 0.3,
				}
			})
			totalDataPointsTime += performance.now() - dataPointsStart
			
				// 保存该聚合类型的数据
				metricDataByAggType.set(aggType, {
					chartData,
					dataPoints,
					availableLabels,
					seriesCount: allSeries.size, // 原始序列总数（用于显示）
					truncatedCount: truncatedSeriesCount, // 被截断的数量
				})
			})
			
			dataMap.set(metric.metricConfig.name, metricDataByAggType)
		})
		
		const elapsed = performance.now() - startTime
		console.log(`[Dashboard] 📊 基础数据预计算完成:
  - 指标数: ${sortedMetrics.length}
  - 聚合类型: ${AGGREGATION_TYPES.length}
  - 总耗时: ${elapsed.toFixed(2)}ms
  - 筛选耗时: ${totalFilterTime.toFixed(2)}ms
  - 分组耗时: ${totalGroupTime.toFixed(2)}ms
  - chartData耗时: ${totalChartDataTime.toFixed(2)}ms
  - dataPoints耗时: ${totalDataPointsTime.toFixed(2)}ms`)
		console.timeEnd('[Dashboard] allMetricsDataByAggType 总耗时')
		
		return dataMap
	}, [sortedMetrics, pointsByMetric, metricLabelSelections])
	
	// 🔥 性能优化9: 第二层 - 根据当前选择的聚合类型，从预计算的数据中快速提取
	// 这个计算非常轻量（只是 Map 查找），即使每次改变聚合类型都重新计算也很快
	const metricsData: MetricData[] = useMemo(() => {
		const startTime = performance.now()
		
		const result = sortedMetrics.map((metric) => {
			const selectedAggType = metricAggregationTypes[metric.metricConfig.name] || 'avg'
			const metricDataByAggType = allMetricsDataByAggType.get(metric.metricConfig.name)
			const data = metricDataByAggType?.get(selectedAggType)
			
			// 展平 metric 对象，适配 MetricChartsGrid 组件
			return {
				metricConfig: metric.metricConfig,
				groupName: metric.groupName,
				isDefault: metric.isDefault,
				chartData: data?.chartData || [],
				dataPoints: data?.dataPoints || [],
				availableLabels: data?.availableLabels || {},
				selectedLabels: metricLabelSelections[metric.metricConfig.name] || {},
				seriesCount: data?.seriesCount || 0,
			}
		})
		
		const elapsed = performance.now() - startTime
		console.log(`[Performance] 聚合类型切换: 从预计算数据中选择, 耗时 ${elapsed.toFixed(2)}ms`)
		
		return result
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
	
	// 计算时间范围（用于 x 轴域）
	// 🔥 性能优化7: 避免使用扩展运算符传递大量参数，手动遍历找最值
	const timeRange = useMemo(() => {
		const startTime = performance.now()
		
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
		
		const elapsed = performance.now() - startTime
		console.log(`[Performance] 时间范围计算完成: ${allPoints.length} 个数据点, 耗时 ${elapsed.toFixed(2)}ms`)
		
		return {
			start: minTime,
			end: maxTime,
		}
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
						暂无数据
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
			
			{/* 使用通用的指标图表网格组件 - 只显示有数据的指标 */}
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
					// 🚀 使用 startTransition 将筛选变更标记为低优先级，避免阻塞UI
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
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									className="text-muted-foreground"
								>
									<circle cx="12" cy="12" r="10" />
									<line x1="12" y1="16" x2="12" y2="12" />
									<line x1="12" y1="8" x2="12.01" y2="8" />
								</svg>
							</div>
							<div className="flex-1">
								<CardTitle className="text-base">暂无监控数据的指标</CardTitle>
								<CardDescription className="text-xs mt-0.5">
									以下 {metricsWithoutData.length} 个指标已配置，但当前没有采集到数据
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent className="pt-0">
						<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
							{metricsWithoutData.map((metric) => {
								const displayName = metric.metricConfig.alias || metric.metricConfig.name
								const hasAlias = !!metric.metricConfig.alias
								
								return (
									<div
										key={`${metric.groupName}-${metric.metricConfig.name}`}
										className="flex items-start gap-2 rounded-lg border bg-card p-3 text-sm"
									>
										<div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
											<div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
										</div>
										<div className="flex-1 min-w-0">
											<div className="font-medium truncate">
												{hasAlias ? (
													<span className="cursor-help" title={metric.metricConfig.name}>
														{displayName}
													</span>
												) : (
													displayName
												)}
											</div>
											{metric.metricConfig.description && (
												<div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
													{metric.metricConfig.description}
												</div>
											)}
											{!metric.isDefault && (
												<div className="text-xs text-muted-foreground mt-1">
													分组：{metric.groupName}
												</div>
											)}
										</div>
									</div>
								)
							})}
						</div>
					</CardContent>
				</Card>
			)}
		</>
	)
})

