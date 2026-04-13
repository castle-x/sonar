/**
 * ReportChartsCard - 报告图表展示组件
 * 
 * 功能：
 * 1. 用例概览区域（预留，用于 AI 分析等）
 * 2. 标签页切换不同用例
 * 3. 每个用例显示汇总表格和图表
 * 4. 懒加载：切换到用例时才加载数据
 * 
 * 视图模式：
 * - tabs: 标签页视图（默认）
 * - flat: 平铺视图（用于导出）
 */

import { memo, useState, useEffect, useCallback, useRef, useTransition, useMemo } from 'react'
import {
	LayoutGridIcon,
	LayoutListIcon,
	SparklesIcon,
	LinkIcon,
	ClockIcon,
	BarChart3Icon,
	FileTextIcon,
	ArrowUpIcon,
	ChevronDownIcon,
	SettingsIcon,
	LayersIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getChunk, type ReportRecord, type ChunkDataWithInfo } from '@/apis/report'
import { getDatasource, type MetricConfig } from '@/apis/datasource'
import { CaseCharts } from './case-charts'
import { CaseSummaryTablesCard, type CaseTableData } from './case-summary-tables-card'

// ============================================
// 类型定义
// ============================================

export interface ReportChartsCardProps {
	/** 报告数据 */
	report: ReportRecord
	/** 自定义类名 */
	className?: string
	/** 是否显示用例概览区域（默认 false，由外部单独渲染） */
	showOverview?: boolean
	/** 用例视图模式：tabs = 标签页切换，flat = 平铺展示 */
	caseViewMode?: 'tabs' | 'flat'
	/** 用例视图模式变更回调 */
	onCaseViewModeChange?: (mode: 'tabs' | 'flat') => void
	/** 图表渲染完成回调 */
	onChartsRendered?: () => void
	/** 导出模式 - 禁用交互按钮 */
	isExportMode?: boolean
	/** 是否显示用例数据总览表格（默认 false） */
	showSummaryTables?: boolean
}

type ViewMode = 'tabs' | 'flat'

// ============================================
// 主组件
// ============================================

export const ReportChartsCard = memo(function ReportChartsCard({
	report,
	className,
	showOverview = false,
	caseViewMode = 'tabs',
	onChartsRendered,
	showSummaryTables = false,
}: ReportChartsCardProps) {
	// 状态管理
	const [viewMode, setViewMode] = useState<ViewMode>('tabs')
	// Tab 视觉选中状态（立即响应）
	const [selectedTabIndex, setSelectedTabIndex] = useState<number>(0)
	// 实际渲染的内容索引（延迟更新，等图表渲染）
	const [renderedCaseIndex, setRenderedCaseIndex] = useState<number>(0)
	const [loadedChunks, setLoadedChunks] = useState<Map<string, ChunkDataWithInfo>>(new Map())
	const [error, setError] = useState<string | null>(null)
	
	// 预加载状态
	const [preloadProgress, setPreloadProgress] = useState(0) // 已加载数量
	const [isPreloading, setIsPreloading] = useState(false)
	const preloadAbortRef = useRef(false)
	
	// 使用 useTransition 让内容切换不阻塞 UI
	const [isPending, startTransition] = useTransition()
	
	// 图表控制状态
	const [legendVisible, setLegendVisible] = useState(true)
	const [gridCols, setGridCols] = useState<1 | 2>(2)
	
	// 浮动工具栏状态
	const [isDropdownOpen, setIsDropdownOpen] = useState(false)
	
	// 平铺视图：用例卡片引用和当前可见用例
	const caseRefs = useRef<Map<number, HTMLDivElement>>(new Map())
	const [activeCaseIndex, setActiveCaseIndex] = useState(0)
	
	// 滚动到指定用例
	const scrollToCase = useCallback((index: number) => {
		const element = caseRefs.current.get(index)
		if (element) {
			element.scrollIntoView({ behavior: 'smooth', block: 'start' })
			setActiveCaseIndex(index)
		}
	}, [])
	
	// 监听滚动，更新当前可见用例
	useEffect(() => {
		if (caseViewMode !== 'flat') return
		
		const handleScroll = () => {
			const viewportTop = window.scrollY + 100 // 偏移量
			let activeIndex = 0
			
			caseRefs.current.forEach((element, index) => {
				const rect = element.getBoundingClientRect()
				const elementTop = rect.top + window.scrollY
				if (elementTop <= viewportTop + 50) {
					activeIndex = index
				}
			})
			
			setActiveCaseIndex(activeIndex)
		}
		
		window.addEventListener('scroll', handleScroll, { passive: true })
		return () => window.removeEventListener('scroll', handleScroll)
	}, [caseViewMode])
	
	// 数据源配置（用于获取 groupmap 和表格顺序）
	const [groupmap, setGroupmap] = useState<Record<string, MetricConfig[]> | undefined>(undefined)
	const [groupmapSortKeys, setGroupmapSortKeys] = useState<string[] | undefined>(undefined)
	const [tableSortOrder, setTableSortOrder] = useState<string[]>([])
	
	// 获取用例列表
	const cases = report.cases || []
	
	// 获取数据源的 groupmap 配置和表格顺序
	useEffect(() => {
		if (report.datasource_id) {
			getDatasource(report.datasource_id)
				.then(datasource => {
					setGroupmap(datasource.groupmap)
					setGroupmapSortKeys(datasource.groupmap_sort_keys)
					
					// 从 summary_config 提取表格名称顺序
					if (datasource.summary_config && datasource.summary_config.length > 0) {
						const tableNames = datasource.summary_config.map((config: any) => config.name)
						setTableSortOrder(tableNames)
					}
				})
				.catch(err => {
					console.error('[ReportChartsCard] Failed to load datasource:', err)
				})
		}
	}, [report.datasource_id])
	
	// 加载单个 chunk（不触发状态更新，返回数据）
	const loadChunk = useCallback(async (chunkId: string): Promise<ChunkDataWithInfo | null> => {
		try {
			return await getChunk(chunkId)
		} catch (err) {
			console.error('Failed to load chunk:', chunkId, err)
			return null
		}
	}, [])
	
	// 预加载所有 chunk 数据（后台静默加载）
	useEffect(() => {
		if (cases.length === 0) return
		
		// 重置预加载状态
		preloadAbortRef.current = false
		setIsPreloading(true)
		setPreloadProgress(0)
		
		const preloadAllChunks = async () => {
			const chunksMap = new Map<string, ChunkDataWithInfo>()
			
			for (let i = 0; i < cases.length; i++) {
				// 检查是否被中断（报告切换）
				if (preloadAbortRef.current) {
					console.log('[Preload] 预加载被中断')
					return
				}
				
				const caseInfo = cases[i]
				if (!caseInfo?.chunk_id) continue
				
				// 加载 chunk
				const chunkData = await loadChunk(caseInfo.chunk_id)
				if (chunkData) {
					chunksMap.set(caseInfo.chunk_id, chunkData)
				}
				
				// 更新进度
				setPreloadProgress(i + 1)
				
				// 第一个加载完成后立即更新状态，让用户可以看到内容
				if (i === 0) {
					setLoadedChunks(new Map(chunksMap))
				}
				
				// 间隔 150ms 加载下一个，避免请求过于密集
				if (i < cases.length - 1) {
					await new Promise(resolve => setTimeout(resolve, 150))
				}
			}
			
			// 全部加载完成，更新状态
			if (!preloadAbortRef.current) {
				setLoadedChunks(chunksMap)
				setIsPreloading(false)
				console.log('[Preload] 预加载完成，共', chunksMap.size, '个 chunk')
			}
		}
		
		preloadAllChunks()
		
		// 清理：报告切换时中断预加载
		return () => {
			preloadAbortRef.current = true
		}
	}, [report.id, cases, loadChunk])
	
	// 图表渲染完成回调
	useEffect(() => {
		if (!isPreloading && loadedChunks.size > 0 && onChartsRendered) {
			// 延迟一下确保 DOM 渲染完成
			const timer = setTimeout(() => {
				console.log('[ReportChartsCard] Charts rendered, calling onChartsRendered')
				onChartsRendered()
			}, 500)
			return () => clearTimeout(timer)
		}
	}, [isPreloading, loadedChunks.size, onChartsRendered])
	
	// 初始化激活的用例（使用索引）
	useEffect(() => {
		// 当报告变化时，重置为第一个用例
		if (cases.length > 0) {
			setSelectedTabIndex(0)
			setRenderedCaseIndex(0)
		}
	}, [report.id])
	
	// 处理 tab 切换 - 视觉立即响应，内容延迟渲染
	const handleTabChange = useCallback((value: string) => {
		const newIndex = Number(value)
		const caseInfo = cases[newIndex]
		
		// 检查该用例是否已加载
		if (!caseInfo?.chunk_id || !loadedChunks.has(caseInfo.chunk_id)) {
			// 未加载，不允许切换
			return
		}
		
		// 立即更新 tab 视觉选中状态（跟手）
		setSelectedTabIndex(newIndex)
		
		// 延迟更新内容（不阻塞 UI）
		startTransition(() => {
			setRenderedCaseIndex(newIndex)
		})
	}, [cases, loadedChunks])
	
	
	// 回到顶部函数
	const scrollToTop = useCallback(() => {
		window.scrollTo({
			top: 0,
			behavior: 'smooth',
		})
	}, [])
	
	// 获取渲染用例的 chunk 数据
	const getRenderedChunk = useCallback((): ChunkDataWithInfo | null => {
		const caseInfo = cases[renderedCaseIndex]
		if (!caseInfo?.chunk_id) return null
		return loadedChunks.get(caseInfo.chunk_id) || null
	}, [cases, renderedCaseIndex, loadedChunks])
	
	// 准备用例表格数据（用于总览卡片）
	const caseTablesData = useMemo((): CaseTableData[] => {
		const data: CaseTableData[] = []
		
		for (const caseInfo of cases) {
			if (!caseInfo?.chunk_id) continue
			
			const chunk = loadedChunks.get(caseInfo.chunk_id)
			if (!chunk) continue
			
			// 只提取表格数据，不需要 points
			const tables = chunk.t || []
			
			data.push({
				caseInfo,
				tables
			})
		}
		
		return data
	}, [cases, loadedChunks])
	
	// 如果没有用例，显示空状态
	if (cases.length === 0) {
		return (
			<div className={cn("space-y-6", className)}>
				<Card>
					<CardContent className="p-12 text-center text-muted-foreground">
						<p>该报告没有测试用例数据</p>
					</CardContent>
				</Card>
			</div>
		)
	}
	
	return (
		<div className={cn("space-y-6", className)}>
			{/* 用例概览与智能分析 - 仅在 showOverview 为 true 时显示 */}
			{showOverview && (
				<Card>
					<CardContent className="p-6">
						<div className="flex items-center gap-2 text-muted-foreground mb-2">
							<SparklesIcon className="size-5" />
							<span className="font-medium">用例概览与智能分析</span>
						</div>
						<p className="text-sm text-muted-foreground">
							此区域预留用于展示用例对比摘要和 AI 智能分析结果
						</p>
					</CardContent>
				</Card>
			)}
			
	{/* 用例数据总览表格 - 仅在有数据且 showSummaryTables 为 true 时显示 */}
		{showSummaryTables && (
			<CaseSummaryTablesCard 
				caseTablesData={caseTablesData} 
				isLoading={isPreloading}
				loadingProgress={preloadProgress}
				totalCount={cases.length}
				tableSortOrder={tableSortOrder}
				reportScore={report.report_score}
				scoringConfig={report.scoring_config}
			/>
			)}
			
			{/* 用例视图 - 根据 caseViewMode 决定渲染方式 */}
			{caseViewMode === 'flat' ? (
				// 平铺视图：所有用例依次渲染
				<div className="relative">
					{/* 左侧悬浮目录 - 导出时隐藏 */}
					<div className="fixed left-4 top-1/2 -translate-y-1/2 z-40 hidden xl:block" data-export-hide>
						<div className="bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg max-w-[180px]">
							<div className="text-xs font-semibold text-muted-foreground px-4 pt-3 pb-2">用例目录</div>
							<nav className="px-2 pb-2">
								{cases.map((caseInfo, index) => (
									<button
										key={`nav-${index}`}
										onClick={() => scrollToCase(index)}
										className={cn(
											"w-full text-left px-2 py-1.5 rounded text-sm transition-colors truncate",
											activeCaseIndex === index
												? "bg-primary/10 text-primary font-medium"
												: "text-muted-foreground hover:bg-muted hover:text-foreground"
										)}
										title={caseInfo.name}
									>
										{caseInfo.name}
									</button>
								))}
							</nav>
							{/* 回到顶部按钮 */}
							<div className="border-t px-2 py-2">
								<button
									onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
									className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
								>
									<ArrowUpIcon className="size-3.5" />
									回到顶部
								</button>
							</div>
						</div>
					</div>
					
					{/* 用例卡片列表 */}
					<div className="space-y-6">
						{cases.map((caseInfo, index) => {
							const chunk = caseInfo.chunk_id ? loadedChunks.get(caseInfo.chunk_id) : null
							const isLoaded = !!chunk
							
							return (
								<Card 
									key={`case-${index}`}
									ref={(el) => {
										if (el) caseRefs.current.set(index, el)
										else caseRefs.current.delete(index)
									}}
								>
									<CardContent className="p-5">
										{/* 卡片标题：用例名称 */}
										<h3 className="text-xl sm:text-2xl font-semibold text-foreground mb-4">{caseInfo.name}</h3>
									
									{/* 用例详情高亮块 */}
									{(() => {
										const formatTime = (timestamp: number) => {
											if (!timestamp) return '-'
											const date = new Date(timestamp)
											return date.toLocaleString('zh-CN', {
												year: 'numeric',
												month: '2-digit',
												day: '2-digit',
												hour: '2-digit',
												minute: '2-digit',
												second: '2-digit',
											})
										}
										
										const queryConfig = caseInfo.query_config
										const hasInfo = caseInfo.stress_id || caseInfo.desc || queryConfig
										
										if (!hasInfo) return null
										
										return (
											<div className="mb-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-sm px-4 py-3">
												<table className="text-[15px] text-foreground">
													<tbody>
														{caseInfo.stress_id && (
															<tr>
																<td className="font-semibold text-foreground whitespace-nowrap pr-3 py-0.5 align-top">
																	<LinkIcon className="inline-block size-4 mr-1.5 text-emerald-600 dark:text-emerald-400 -mt-0.5" />压测任务
																</td>
																<td className="py-0.5 break-all">{caseInfo.stress_id}</td>
															</tr>
														)}
														{queryConfig && (
															<>
																<tr>
																	<td className="font-semibold text-foreground whitespace-nowrap pr-3 py-0.5 align-top">
																		<ClockIcon className="inline-block size-4 mr-1.5 text-emerald-600 dark:text-emerald-400 -mt-0.5" />测试时间
																	</td>
																	<td className="py-0.5">{formatTime(queryConfig.start_time)} ~ {formatTime(queryConfig.end_time)}</td>
																</tr>
																{queryConfig.aggregation_interval && (
																	<tr>
																		<td className="font-semibold text-foreground whitespace-nowrap pr-3 py-0.5 align-top">
																			<BarChart3Icon className="inline-block size-4 mr-1.5 text-emerald-600 dark:text-emerald-400 -mt-0.5" />聚合间隔
																		</td>
																		<td className="py-0.5">{queryConfig.aggregation_interval}</td>
																	</tr>
																)}
															</>
														)}
														{caseInfo.desc && (
															<tr>
																<td className="font-semibold text-foreground whitespace-nowrap pr-3 py-0.5 align-top">
																	<FileTextIcon className="inline-block size-4 mr-1.5 text-emerald-600 dark:text-emerald-400 -mt-0.5" />用例描述
																</td>
																<td className="py-0.5 wrap-break-word">{caseInfo.desc}</td>
															</tr>
														)}
													</tbody>
												</table>
											</div>
										)
									})()}
									
									{/* 用例内容 */}
									{!isLoaded ? (
										<div className="flex items-center justify-center h-48 text-muted-foreground">
											<div className="flex items-center gap-2">
												<div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
												<span>加载用例数据...</span>
											</div>
										</div>
									) : (
										<CaseCharts
											chunk={chunk}
											caseInfo={caseInfo}
											legendVisible={legendVisible}
											gridCols={gridCols}
											groupmap={groupmap}
											groupmapSortKeys={groupmapSortKeys}
											tableLayout="list"
										/>
									)}
								</CardContent>
							</Card>
						)
					})}
					</div>
				</div>
			) : (
				// 标签页视图：原有的用例切换
				<Card>
					<CardContent className="p-5">
						{/* 用例切换标签 + 工具按钮 */}
						<div className="mb-4">
							{/* 标题行 */}
							<div className="flex items-center justify-between mb-3">
								<div>
								<h3 className="text-xl sm:text-2xl font-semibold text-foreground">用例列表</h3>
									<p className="text-sm text-muted-foreground mt-1">查看单个用例的详细数据</p>
								</div>
								
								{/* 右侧：工具按钮 */}
								<div className="flex items-center gap-2 shrink-0">
									{/* 图例可见性切换 */}
									<TooltipProvider>
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
											<TooltipContent>
												{legendVisible ? '隐藏图例' : '显示图例'}
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
									
									{/* 布局切换按钮 */}
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													variant="outline"
													size="icon"
													onClick={() => {
														if (gridCols === 2) {
															setGridCols(1)
															setViewMode('flat')
														} else {
															setGridCols(2)
															setViewMode('tabs')
														}
													}}
												>
													{gridCols === 2 ? (
														<LayoutGridIcon className="size-4" />
													) : (
														<LayoutListIcon className="size-4" />
													)}
												</Button>
											</TooltipTrigger>
											<TooltipContent>
												{gridCols === 2 ? '切换到平铺视图' : '切换到标签页视图'}
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								</div>
							</div>
							
							{/* 用例标签 - 下划线样式（绿色主题） */}
							<div className="flex items-center gap-6 border-b overflow-x-auto case-tabs-scroll">
								{cases.map((caseInfo, index) => {
									const isLoaded = caseInfo.chunk_id && loadedChunks.has(caseInfo.chunk_id)
									const isSelected = index === selectedTabIndex
									
									return (
										<button
											key={`tab-${index}`}
											onClick={() => handleTabChange(String(index))}
											disabled={!isLoaded && !isSelected}
											className={cn(
												"relative pb-3 text-[15px] font-medium transition-colors whitespace-nowrap shrink-0",
												"hover:text-emerald-500",
												isSelected 
													? "text-emerald-600" 
													: "text-muted-foreground",
												!isLoaded && !isSelected && "opacity-50 cursor-not-allowed hover:text-muted-foreground"
											)}
										>
											{caseInfo.name}
											{/* 加载中指示器 */}
											{!isLoaded && index === preloadProgress && isPreloading && (
												<span className="ml-1.5 inline-block w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
											)}
											{/* 选中下划线 */}
											{isSelected && (
												<span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-full" />
											)}
										</button>
									)
								})}
							</div>
						</div>
						
						{/* 用例详情高亮块 */}
						{(() => {
							const currentCase = cases[selectedTabIndex]
							if (!currentCase) return null
							
							// 格式化时间
							const formatTime = (timestamp: number) => {
								if (!timestamp) return '-'
								const date = new Date(timestamp)
								return date.toLocaleString('zh-CN', {
									year: 'numeric',
									month: '2-digit',
									day: '2-digit',
									hour: '2-digit',
									minute: '2-digit',
									second: '2-digit',
								})
							}
							
							const queryConfig = currentCase.query_config
							const hasInfo = currentCase.stress_id || currentCase.desc || queryConfig
							
							if (!hasInfo) return null
							
							return (
								<div className="my-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-sm px-4 py-3">
									<table className="text-[15px] text-foreground">
										<tbody>
											{currentCase.stress_id && (
												<tr>
													<td className="font-semibold text-foreground whitespace-nowrap pr-3 py-0.5 align-top">
														<LinkIcon className="inline-block size-4 mr-1.5 text-emerald-600 dark:text-emerald-400 -mt-0.5" />压测任务
													</td>
													<td className="py-0.5 break-all">{currentCase.stress_id}</td>
												</tr>
											)}
											{queryConfig && (
												<>
													<tr>
														<td className="font-semibold text-foreground whitespace-nowrap pr-3 py-0.5 align-top">
															<ClockIcon className="inline-block size-4 mr-1.5 text-emerald-600 dark:text-emerald-400 -mt-0.5" />测试时间
														</td>
														<td className="py-0.5">{formatTime(queryConfig.start_time)} ~ {formatTime(queryConfig.end_time)}</td>
													</tr>
													{queryConfig.aggregation_interval && (
														<tr>
															<td className="font-semibold text-foreground whitespace-nowrap pr-3 py-0.5 align-top">
																<BarChart3Icon className="inline-block size-4 mr-1.5 text-emerald-600 dark:text-emerald-400 -mt-0.5" />聚合间隔
															</td>
															<td className="py-0.5">{queryConfig.aggregation_interval}</td>
														</tr>
													)}
												</>
											)}
											{currentCase.desc && (
												<tr>
													<td className="font-semibold text-foreground whitespace-nowrap pr-3 py-0.5 align-top">
														<FileTextIcon className="inline-block size-4 mr-1.5 text-emerald-600 dark:text-emerald-400 -mt-0.5" />用例描述
													</td>
													<td className="py-0.5 wrap-break-word">{currentCase.desc}</td>
												</tr>
											)}
										</tbody>
									</table>
								</div>
							)
						})()}
						
						{/* 错误提示 */}
						{error && (
							<div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm text-destructive">
								<strong>⚠️ 加载失败：</strong> {error}
							</div>
						)}
						
						{/* 当前用例内容 */}
						{(() => {
							const chunk = getRenderedChunk()
							const caseInfo = cases[renderedCaseIndex]
							
							if (!caseInfo) return null
							
							// 首个用例加载中
							if (!chunk && renderedCaseIndex === 0 && isPreloading) {
								return (
									<div className="flex items-center justify-center h-48 text-muted-foreground">
										<div className="flex items-center gap-2">
											<div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
											<span>加载用例数据...</span>
										</div>
									</div>
								)
							}
							
							// 用例图表 - 使用 isPending 显示切换过渡状态
							if (chunk) {
								return (
									<div className={cn(
										"transition-opacity duration-150",
										isPending && "opacity-60"
									)}>
										<CaseCharts
											chunk={chunk}
											caseInfo={caseInfo}
											legendVisible={legendVisible}
											gridCols={gridCols}
											groupmap={groupmap}
											groupmapSortKeys={groupmapSortKeys}
											tableLayout={viewMode === 'flat' ? 'list' : 'tabs'}
										/>
									</div>
								)
							}
							
							// 无数据状态
							if (!chunk && !error) {
								return (
									<div className="flex items-center justify-center h-48 text-muted-foreground">
										暂无数据
									</div>
								)
							}
							
							return null
						})()}
					</CardContent>
				</Card>
			)}
			
			{/* 浮动工具栏 - 悬浮球抽屉式展开（平铺视图时隐藏，导出时也隐藏） */}
			{caseViewMode !== 'flat' && (
				<div className="fixed bottom-6 right-6 z-50 group animate-in fade-in slide-in-from-bottom-4 duration-300" data-export-hide>
					<div className="flex items-center gap-2">
						{/* 展开的按钮组 - 从右向左滑入 */}
						<div className={`flex items-center gap-2 transition-all duration-300 ease-out ${
							isDropdownOpen 
								? 'opacity-100 visible translate-x-0' 
								: 'opacity-0 invisible translate-x-4 group-hover:opacity-100 group-hover:visible group-hover:translate-x-0'
						}`}>
							<div className="bg-background border rounded-lg shadow-lg p-2 flex items-center gap-2">
								{/* 用例切换下拉菜单 */}
								<DropdownMenu onOpenChange={setIsDropdownOpen}>
									<DropdownMenuTrigger asChild>
										<Button variant="outline" className="gap-2">
											<LayersIcon className="size-4" />
											<span className="max-w-[120px] truncate">
												{cases[selectedTabIndex]?.name || '选择用例'}
											</span>
											<ChevronDownIcon className="size-4 opacity-50" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="w-48 max-h-[300px] overflow-y-auto">
										<DropdownMenuRadioGroup
											value={String(selectedTabIndex)}
											onValueChange={(value) => handleTabChange(value)}
										>
											{cases.map((caseInfo, index) => {
												const isLoaded = caseInfo.chunk_id && loadedChunks.has(caseInfo.chunk_id)
												return (
													<DropdownMenuRadioItem 
														key={index} 
														value={String(index)}
														disabled={!isLoaded}
														className={!isLoaded ? 'opacity-50' : ''}
													>
														<div className="flex flex-col">
															<span className="font-medium">{caseInfo.name}</span>
															{!isLoaded && (
																<span className="text-xs text-muted-foreground">加载中...</span>
															)}
														</div>
													</DropdownMenuRadioItem>
												)
											})}
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
											onClick={() => {
												if (gridCols === 2) {
													setGridCols(1)
													setViewMode('flat')
												} else {
													setGridCols(2)
													setViewMode('tabs')
												}
											}}
										>
											{gridCols === 2 ? (
												<LayoutGridIcon className="size-4" />
											) : (
												<LayoutListIcon className="size-4" />
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
						
						{/* 悬浮球触发按钮 */}
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
		</div>
	)
})

export default ReportChartsCard

