/**
 * TaskReportList - 关联报告列表组件
 * 
 * 显示任务关联的报告列表，支持：
 * - 显示报告名称
 * - 点击展开预览（总体结论 + 数据总览）
 * - 跳转到报告详情
 * - 编辑关联报告（从已有报告中筛选选择）
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Progress } from "@/components/ui/progress"
import { 
	ChevronDownIcon,
	ChevronUpIcon,
	ChevronRightIcon,
	ExternalLinkIcon,
	PlusIcon,
	XIcon,
	SearchIcon,
	Loader2Icon,
	FileIcon,  // 仅在对话框中使用
} from "lucide-react"
import { cn } from "@/lib/utils"
import { navigate } from "@/components/router"
import { updateTask } from "@/apis/task"
import { listReports, type ReportRecord, type ReportScore, getReport, getChunk, type ChunkDataWithInfo } from "@/apis/report"
import { useToast } from "@/components/ui/use-toast"
import { RichTextViewer } from "@/components/ui/rich-text-editor"
import { CaseSummaryTablesCard, type CaseTableData } from "@/components/report-detail/case-summary-tables-card"

interface TaskReportListProps {
	taskId: string
	reportIds: string[]
	onUpdate?: () => void
	className?: string
	readOnly?: boolean
}

interface ReportInfo {
	id: string
	name: string
	loading: boolean
	error?: string
	reportScore?: ReportScore  // 报告评分
}

// 评分等级颜色映射
const SCORE_LEVEL_COLORS = {
	excellent: "bg-green-500",
	good: "bg-blue-500",
	normal: "bg-yellow-500",
	warning: "bg-orange-500",
	danger: "bg-red-500",
} as const

// 评分等级标签
const SCORE_LEVEL_LABELS = {
	excellent: "低风险",
	good: "中低风险",
	normal: "中风险",
	warning: "中高风险",
	danger: "高风险",
} as const

// 报告预览数据
interface ReportPreviewData {
	report: ReportRecord | null
	chunks: Map<string, ChunkDataWithInfo>
	loadingProgress: number
	totalCases: number
	isLoading: boolean
	error?: string
}

export function TaskReportList({
	taskId,
	reportIds,
	onUpdate,
	className,
	readOnly = false,
}: TaskReportListProps) {
	const [isExpanded, setIsExpanded] = useState(true)
	const [editDialogOpen, setEditDialogOpen] = useState(false)
	const [reports, setReports] = useState<ReportInfo[]>([])
	// 展开预览的报告 ID（支持多个展开）
	const [expandedReportIds, setExpandedReportIds] = useState<Set<string>>(new Set())
	// 预览数据缓存
	const [previewDataMap, setPreviewDataMap] = useState<Map<string, ReportPreviewData>>(new Map())
	// 跟踪正在加载或已加载的报告 ID（避免重复加载）
	const loadingOrLoadedRef = useRef<Set<string>>(new Set())
	const { toast } = useToast()
	
	// 加载报告信息
	useEffect(() => {
		const loadReports = async () => {
			if (!reportIds || reportIds.length === 0) {
				setReports([])
				return
			}
			
			// 初始化状态
			const initialReports: ReportInfo[] = reportIds.map(id => ({
				id,
				name: '加载中...',
				loading: true,
			}))
			setReports(initialReports)
			
			// 并行加载所有报告信息
			const loadedReports = await Promise.all(
				reportIds.map(async (id) => {
					try {
						const report = await getReport(id)
						return {
							id,
							name: report.name,
							loading: false,
							reportScore: report.report_score,  // 获取评分信息
						}
					} catch {
						return {
							id,
							name: `报告 ${id.slice(0, 8)}...`,
							loading: false,
							error: '加载失败',
						}
					}
				})
			)
			
			setReports(loadedReports)
		}
		
		loadReports()
	}, [reportIds])
	
	// 加载报告预览数据（报告详情 + chunk 数据）
	const loadReportPreview = useCallback(async (reportId: string) => {
		// 使用 ref 检查是否已经在加载或已加载，避免重复请求
		if (loadingOrLoadedRef.current.has(reportId)) {
			return
		}
		
		// 标记为正在加载
		loadingOrLoadedRef.current.add(reportId)
		
		// 初始化加载状态
		setPreviewDataMap(prev => {
			const newMap = new Map(prev)
			newMap.set(reportId, {
				report: null,
				chunks: new Map(),
				loadingProgress: 0,
				totalCases: 0,
				isLoading: true,
			})
			return newMap
		})
		
		try {
			// 1. 加载报告详情
			const report = await getReport(reportId)
			const cases = report.cases || []
			
			// 更新报告数据
			setPreviewDataMap(prev => {
				const newMap = new Map(prev)
				const data = newMap.get(reportId) || {
					report: null,
					chunks: new Map(),
					loadingProgress: 0,
					totalCases: 0,
					isLoading: true,
				}
				newMap.set(reportId, {
					...data,
					report,
					totalCases: cases.length,
				})
				return newMap
			})
			
			// 2. 逐个加载 chunk 数据
			const chunksMap = new Map<string, ChunkDataWithInfo>()
			for (let i = 0; i < cases.length; i++) {
				const caseInfo = cases[i]
				if (!caseInfo?.chunk_id) continue
				
				try {
					const chunkData = await getChunk(caseInfo.chunk_id)
					if (chunkData) {
						chunksMap.set(caseInfo.chunk_id, chunkData)
					}
				} catch (err) {
					console.error(`Failed to load chunk for case ${caseInfo.name}:`, err)
				}
				
				// 更新进度
				setPreviewDataMap(prev => {
					const newMap = new Map(prev)
					const data = newMap.get(reportId)
					if (data) {
						newMap.set(reportId, {
							...data,
							chunks: new Map(chunksMap),
							loadingProgress: i + 1,
						})
					}
					return newMap
				})
				
				// 间隔加载，避免请求过于密集
				if (i < cases.length - 1) {
					await new Promise(resolve => setTimeout(resolve, 100))
				}
			}
			
			// 完成加载
			setPreviewDataMap(prev => {
				const newMap = new Map(prev)
				const data = newMap.get(reportId)
				if (data) {
					newMap.set(reportId, {
						...data,
						chunks: chunksMap,
						isLoading: false,
					})
				}
				return newMap
			})
			
		} catch (error) {
			setPreviewDataMap(prev => {
				const newMap = new Map(prev)
				newMap.set(reportId, {
					report: null,
					chunks: new Map(),
					loadingProgress: 0,
					totalCases: 0,
					isLoading: false,
					error: error instanceof Error ? error.message : '加载失败',
				})
				return newMap
			})
		}
	}, []) // 使用 ref 跟踪加载状态，不需要依赖 previewDataMap
	
	// 后台预加载所有报告的详细数据（不阻塞主线程）
	useEffect(() => {
		if (!reportIds || reportIds.length === 0) return
		
		// 使用 setTimeout 延迟启动预加载，让主界面先渲染完成
		const timeoutId = setTimeout(() => {
			// 逐个预加载报告数据，每个报告间隔一小段时间
			reportIds.forEach((reportId, index) => {
				setTimeout(() => {
					// loadReportPreview 内部会通过 ref 检查是否已加载
					loadReportPreview(reportId)
				}, index * 200) // 每个报告间隔 200ms 开始加载
			})
		}, 500) // 延迟 500ms 后开始预加载
		
		return () => clearTimeout(timeoutId)
	}, [reportIds, loadReportPreview])
	
	// 切换报告展开状态
	const toggleReportExpand = useCallback((reportId: string) => {
		setExpandedReportIds(prev => {
			const newSet = new Set(prev)
			if (newSet.has(reportId)) {
				newSet.delete(reportId)
			} else {
				newSet.add(reportId)
				// 展开时开始加载数据
				loadReportPreview(reportId)
			}
			return newSet
		})
	}, [loadReportPreview])
	
	// 跳转到报告详情（新标签页打开）
	// Ctrl/Cmd + 点击则在当前页打开
	const handleGoToReport = (e: React.MouseEvent, reportId: string) => {
		e.stopPropagation()
		const url = `/report/${reportId}`
		if (e.ctrlKey || e.metaKey) {
			navigate(url)
		} else {
			window.open(url, '_blank')
		}
	}
	
	return (
		<Card className={cn("transition-all duration-200", className)}>
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between">
					{/* 左侧：标题 */}
					<div className="flex items-center gap-2">
						<span className="font-semibold">关联报告</span>
						<Badge variant="secondary">
							{reportIds.length} 个
						</Badge>
					</div>
					
					{/* 右侧：折叠按钮 + 添加按钮（只读模式下隐藏添加按钮） */}
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="icon"
							onClick={() => setIsExpanded(!isExpanded)}
							className="h-8 w-8"
						>
							{isExpanded ? (
								<ChevronUpIcon className="h-4 w-4" />
							) : (
								<ChevronDownIcon className="h-4 w-4" />
							)}
						</Button>
						{!readOnly && (
							<TooltipProvider>
								<Tooltip delayDuration={300}>
									<TooltipTrigger asChild>
										<Button
											variant="outline"
											size="icon"
											onClick={() => setEditDialogOpen(true)}
										>
											<PlusIcon className="h-4 w-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent>添加关联报告</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						)}
					</div>
				</div>
			</CardHeader>
			
			{/* 报告列表 */}
			{isExpanded && (
				<CardContent className="pt-0">
					{reports.length === 0 ? (
						<div className="text-center py-8 text-muted-foreground">
							{readOnly ? "暂无关联报告" : "暂无关联报告，点击右上角按钮添加"}
						</div>
					) : (
						<div className="space-y-2">
							{reports.map((report, index) => {
								const isReportExpanded = expandedReportIds.has(report.id)
								const previewData = previewDataMap.get(report.id)
								
								return (
									<div
										key={`${report.id}-${index}`}
										className={cn(
											"rounded-lg border transition-all duration-200",
											"bg-card",
											report.error && "border-destructive/50",
											isReportExpanded && "ring-1 ring-primary/20"
										)}
									>
										{/* 报告标题行 - 使用 div 避免 button 嵌套 */}
										<div
											onClick={() => toggleReportExpand(report.id)}
											className={cn(
												"w-full flex items-center justify-between p-3 text-left cursor-pointer select-none",
												"hover:bg-accent/30 transition-colors rounded-t-lg",
												!isReportExpanded && "rounded-b-lg"
											)}
										>
											<div className="flex items-center gap-3 min-w-0 flex-1">
												{isReportExpanded ? (
													<ChevronDownIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
												) : (
													<ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
												)}
												<span className={cn(
													"truncate",
													report.loading && "text-muted-foreground",
													report.error && "text-destructive"
												)}>
													{report.name}
												</span>
												{report.error && (
													<Badge variant="destructive" className="text-xs">
														{report.error}
													</Badge>
												)}
												{/* 评分结论显示 */}
												{report.reportScore && (
													<div className="flex items-center gap-1.5 text-sm flex-shrink-0">
														<span className={cn(
															"inline-flex h-2.5 w-2.5 rounded-full",
															SCORE_LEVEL_COLORS[report.reportScore.level as keyof typeof SCORE_LEVEL_COLORS] || "bg-gray-500"
														)} />
														<span className={cn(
															report.reportScore.level === 'danger' ? 'text-red-600' :
															report.reportScore.level === 'warning' ? 'text-orange-600' :
															report.reportScore.level === 'normal' ? 'text-yellow-600' :
															report.reportScore.level === 'good' ? 'text-blue-600' :
															report.reportScore.level === 'excellent' ? 'text-green-600' : ''
														)}>
															{SCORE_LEVEL_LABELS[report.reportScore.level as keyof typeof SCORE_LEVEL_LABELS] || report.reportScore.level}
														</span>
														<span className="text-muted-foreground/50">|</span>
														<span className={cn(
															"font-medium",
															report.reportScore.level === 'danger' ? 'text-red-600' :
															report.reportScore.level === 'warning' ? 'text-orange-600' :
															report.reportScore.level === 'normal' ? 'text-yellow-600' :
															report.reportScore.level === 'good' ? 'text-blue-600' :
															report.reportScore.level === 'excellent' ? 'text-green-600' : ''
														)}>
															报告总分:{report.reportScore.total_score.toFixed(0)}
														</span>
													</div>
												)}
											</div>
											<TooltipProvider>
												<Tooltip delayDuration={300}>
													<TooltipTrigger asChild>
														<Button
															variant="ghost"
															size="icon"
															className="h-7 w-7 flex-shrink-0"
															onClick={(e) => handleGoToReport(e, report.id)}
														>
															<ExternalLinkIcon className="h-4 w-4 text-muted-foreground" />
														</Button>
													</TooltipTrigger>
													<TooltipContent>打开报告详情</TooltipContent>
												</Tooltip>
											</TooltipProvider>
										</div>
										
										{/* 展开的预览内容 */}
										{isReportExpanded && (
											<ReportPreviewContent
												reportId={report.id}
												previewData={previewData}
											/>
										)}
									</div>
								)
							})}
						</div>
					)}
				</CardContent>
			)}
			
			{/* 编辑对话框 */}
			<EditReportIdsDialog
				open={editDialogOpen}
				onOpenChange={setEditDialogOpen}
				taskId={taskId}
				reportIds={reportIds}
				onSuccess={onUpdate}
			/>
		</Card>
	)
}

/**
 * 报告预览内容组件
 */
function ReportPreviewContent({
	reportId,
	previewData,
}: {
	reportId: string
	previewData?: ReportPreviewData
}) {
	// 构建 CaseTableData 数据
	const caseTablesData = useMemo((): CaseTableData[] => {
		if (!previewData?.report?.cases) return []
		
		return previewData.report.cases.map(caseInfo => {
			const chunkData = caseInfo.chunk_id ? previewData.chunks.get(caseInfo.chunk_id) : null
			return {
				caseInfo,
				tables: chunkData?.t || [],
			}
		})
	}, [previewData])
	
	// 加载中状态
	if (!previewData || previewData.isLoading) {
		const progress = previewData?.totalCases 
			? Math.round((previewData.loadingProgress / previewData.totalCases) * 100)
			: 0
		
		return (
			<div className="px-4 pb-4 space-y-3">
				<div className="flex items-center gap-3 text-sm text-muted-foreground">
					<Loader2Icon className="h-4 w-4 animate-spin" />
					<span>
						加载数据中... {previewData?.loadingProgress || 0}/{previewData?.totalCases || '?'}
					</span>
				</div>
				{previewData?.totalCases && previewData.totalCases > 0 && (
					<Progress value={progress} className="h-1" />
				)}
			</div>
		)
	}
	
	// 加载失败
	if (previewData.error) {
		return (
			<div className="px-4 pb-4 text-sm text-destructive">
				加载失败: {previewData.error}
			</div>
		)
	}
	
	// 没有报告数据
	if (!previewData.report) {
		return (
			<div className="px-4 pb-4 text-sm text-muted-foreground">
				暂无数据
			</div>
		)
	}
	
	const report = previewData.report
	const hasDescription = report.description && report.description.trim() !== '' && report.description !== '<p></p>'
	
	return (
		<div className="px-4 pb-4 space-y-4 border-t">
			{/* 总体结论 - 用边框框起来，不显示标题 */}
			{hasDescription && (
				<div className="pt-4">
					<div className="bg-muted/20 rounded-lg p-4 border text-sm">
						<RichTextViewer content={report.description || ''} />
					</div>
				</div>
			)}
			
			{/* 数据总览 */}
			{caseTablesData.length > 0 && caseTablesData.some(d => d.tables.length > 0) && (
				<div className={!hasDescription ? "pt-4" : ""}>
					<CaseSummaryTablesCard
						caseTablesData={caseTablesData}
						isLoading={false}
						loadingProgress={previewData.loadingProgress}
						totalCount={previewData.totalCases}
						reportScore={report.report_score}
						scoringConfig={report.scoring_config}
					/>
				</div>
			)}
		</div>
	)
}

// 编辑关联报告对话框
function EditReportIdsDialog({
	open,
	onOpenChange,
	taskId,
	reportIds,
	onSuccess,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	taskId: string
	reportIds: string[]
	onSuccess?: () => void
}) {
	const [selectedIds, setSelectedIds] = useState<string[]>([])
	const [allReports, setAllReports] = useState<ReportRecord[]>([])
	const [loadingReports, setLoadingReports] = useState(false)
	const [saving, setSaving] = useState(false)
	const [searchQuery, setSearchQuery] = useState('')
	const [onlyReleased, setOnlyReleased] = useState(false)  // 默认显示所有报告
	const { toast } = useToast()
	
	// 加载报告列表
	useEffect(() => {
		if (open) {
			setSelectedIds([...reportIds])
			loadAllReports()
		}
	}, [open, reportIds])
	
	// 加载所有报告
	const loadAllReports = async () => {
		setLoadingReports(true)
		try {
			// 查询所有报告（不传分页参数表示不分页）
			const result = await listReports({})
			setAllReports(result.list)
		} catch (error) {
			toast({
				title: "加载报告失败",
				description: error instanceof Error ? error.message : "未知错误",
				variant: "destructive",
			})
		} finally {
			setLoadingReports(false)
		}
	}
	
	// 筛选报告列表
	const filteredReports = useMemo(() => {
		let reports = allReports
		
		// 筛选已发布的报告
		if (onlyReleased) {
			reports = reports.filter(r => r.release === true)
		}
		
		// 搜索过滤
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase()
			reports = reports.filter(r => 
				r.name.toLowerCase().includes(query) ||
				r.id.toLowerCase().includes(query)
			)
		}
		
		return reports
	}, [allReports, onlyReleased, searchQuery])
	
	// 切换报告选择
	const toggleReport = (reportId: string) => {
		setSelectedIds(prev => {
			// 允许重复添加
			if (prev.includes(reportId)) {
				// 如果已存在，再添加一次（支持重复）
				return [...prev, reportId]
			}
			return [...prev, reportId]
		})
	}
	
	// 移除选中的报告
	const removeSelected = (index: number) => {
		setSelectedIds(prev => prev.filter((_, i) => i !== index))
	}
	
	// 获取报告名称
	const getReportName = (reportId: string): string => {
		const report = allReports.find(r => r.id === reportId)
		return report?.name || `报告 ${reportId.slice(0, 8)}...`
	}
	
	// 保存
	const handleSave = async () => {
		setSaving(true)
		try {
			await updateTask(taskId, { report_ids: selectedIds })
			toast({
				title: "保存成功",
				description: "关联报告已更新",
			})
			onOpenChange(false)
			onSuccess?.()
		} catch (error) {
			toast({
				title: "保存失败",
				description: error instanceof Error ? error.message : "未知错误",
				variant: "destructive",
			})
		} finally {
			setSaving(false)
		}
	}
	
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="w-[90%] sm:max-w-[600px] rounded-lg max-h-[90vh] flex flex-col">
				<DialogHeader>
					<DialogTitle>添加关联报告</DialogTitle>
					<DialogDescription>
						从已有报告中选择要关联的报告
					</DialogDescription>
				</DialogHeader>
				
				<div className="flex-1 overflow-hidden space-y-4 py-4">
					{/* 搜索和筛选 */}
					<div className="space-y-3">
						<div className="relative">
							<SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
							<Input
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder="搜索报告名称或 ID..."
								className="pl-9"
							/>
						</div>
						<div className="flex items-center gap-2">
							<Switch
								id="only-released"
								checked={onlyReleased}
								onCheckedChange={setOnlyReleased}
							/>
							<Label htmlFor="only-released" className="text-sm cursor-pointer">
								仅显示已发布报告
							</Label>
						</div>
					</div>
					
					{/* 可选报告列表 */}
					<div className="space-y-2">
						<Label className="text-sm font-semibold">
							可选报告（{filteredReports.length} 个）
						</Label>
						<ScrollArea className="h-[200px] border rounded-md">
							{loadingReports ? (
								<div className="flex items-center justify-center py-8">
									<Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
								</div>
							) : filteredReports.length === 0 ? (
								<div className="text-center py-8 text-muted-foreground text-sm">
									{searchQuery ? "没有匹配的报告" : onlyReleased ? "暂无已发布报告" : "暂无报告"}
								</div>
							) : (
								<div className="p-2 space-y-1">
									{filteredReports.map((report) => {
										const isSelected = selectedIds.includes(report.id)
										const selectedCount = selectedIds.filter(id => id === report.id).length
										return (
											<button
												key={report.id}
												onClick={() => toggleReport(report.id)}
												className={cn(
													"w-full flex items-center justify-between p-2 rounded-md text-left text-sm transition-colors",
													"hover:bg-accent hover:text-accent-foreground",
													isSelected && "bg-accent/50"
												)}
											>
												<div className="flex items-center gap-2 min-w-0 flex-1">
													<FileIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
													<span className="truncate">{report.name}</span>
													{report.release && (
														<Badge variant="secondary" className="text-xs flex-shrink-0">
															已发布
														</Badge>
													)}
												</div>
												<div className="flex items-center gap-2 flex-shrink-0">
													{selectedCount > 0 && (
														<Badge variant="default" className="text-xs">
															已选 {selectedCount}
														</Badge>
													)}
													<PlusIcon className="h-4 w-4 text-muted-foreground" />
												</div>
											</button>
										)
									})}
								</div>
							)}
						</ScrollArea>
					</div>
					
					{/* 已选报告列表 */}
					<div className="space-y-2">
						<Label className="text-sm font-semibold">
							已选报告（{selectedIds.length} 个）
						</Label>
						{selectedIds.length === 0 ? (
							<div className="text-center py-4 text-muted-foreground text-sm border rounded-md">
								暂未选择任何报告
							</div>
						) : (
							<ScrollArea className="max-h-[150px] border rounded-md">
								<div className="p-2 space-y-1">
									{selectedIds.map((id, index) => (
										<div
											key={`${id}-${index}`}
											className="flex items-center justify-between p-2 rounded-md bg-muted/30"
										>
											<div className="flex items-center gap-2 min-w-0 flex-1">
												<FileIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
												<span className="text-sm truncate">{getReportName(id)}</span>
											</div>
											<Button
												variant="ghost"
												size="icon"
												onClick={() => removeSelected(index)}
												className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
											>
												<XIcon className="h-4 w-4" />
											</Button>
										</div>
									))}
								</div>
							</ScrollArea>
						)}
					</div>
				</div>
				
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={saving}
					>
						取消
					</Button>
					<Button onClick={handleSave} disabled={saving}>
						{saving ? "保存中..." : "保存"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
