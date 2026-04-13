/**
 * 报告详情页面
 * 
 * 展示单个报告的详细信息，包括：
 * - 报告详情卡片（ReportDetailCard）
 * - 描述结论卡片（DescriptionCard）
 * - 图表分析区域（ReportChartsCard）
 */

import { memo, useEffect, useState, useRef, useCallback } from "react"
import { useStore } from "@nanostores/react"
import { $router, navigate } from "@/components/router"
import { getReport, reloadReport, getReportTask, type ReportRecord } from "@/apis/report"
import { PageLoading } from "@/components/loading"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { 
	ArrowLeftIcon, 
	GripVerticalIcon, 
} from "lucide-react"
import { ReportDetailCard } from "@/components/report-detail/report-detail-card"
import { DescriptionCard } from "@/components/report-detail/description-card"
import { CaseOverviewCard } from "@/components/report-detail/case-overview-card"
import { ReportChartsCard } from "@/components/report-detail/report-charts-card"
import { FooterRepoLink } from "@/components/footer-repo-link"
import { cn } from "@/lib/utils"
import { $exportCommand, clearExportCommand, setExporting } from "@/lib/export-store"

export default memo(() => {
	const page = useStore($router)
	const reportId = page?.route === "reportDetail" ? page.params.id : null

	const [report, setReport] = useState<ReportRecord | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	
	// AI 分析面板展开状态
	const [isAIExpanded, setIsAIExpanded] = useState(false)
	
	// 重载状态
	const [reloading, setReloading] = useState(false)
	const [reloadProgress, setReloadProgress] = useState(0)
	const reloadingRef = useRef(false)
	
	// 用例视图模式：tabs = 标签页切换，flat = 平铺展示
	const [caseViewMode, setCaseViewMode] = useState<'tabs' | 'flat'>('tabs')
	
	// 导出相关状态
	const exportContainerRef = useRef<HTMLDivElement>(null)
	const { toast } = useToast()
	
	// 监听全局导出命令
	const exportCommand = useStore($exportCommand)
	
	// 可调整大小的面板状态
	const [leftPanelWidth, setLeftPanelWidth] = useState(75) // 左面板宽度百分比（默认75%）
	const [isDragging, setIsDragging] = useState(false)
	const containerRef = useRef<HTMLDivElement>(null)
	
	// 拖动开始
	const handleDragStart = useCallback((e: React.MouseEvent) => {
		e.preventDefault()
		setIsDragging(true)
	}, [])
	
	// 拖动中
	useEffect(() => {
		if (!isDragging) return
		
		const handleMouseMove = (e: MouseEvent) => {
			if (!containerRef.current) return
			
			const containerRect = containerRef.current.getBoundingClientRect()
			const containerWidth = containerRect.width
			const mouseX = e.clientX - containerRect.left
			
			// 计算百分比，限制在 40% - 85% 之间
			let newWidth = (mouseX / containerWidth) * 100
			newWidth = Math.max(40, Math.min(85, newWidth))
			
			setLeftPanelWidth(newWidth)
		}
		
		const handleMouseUp = () => {
			setIsDragging(false)
		}
		
		document.addEventListener('mousemove', handleMouseMove)
		document.addEventListener('mouseup', handleMouseUp)
		
		// 拖动时改变光标
		document.body.style.cursor = 'col-resize'
		document.body.style.userSelect = 'none'
		
		return () => {
			document.removeEventListener('mousemove', handleMouseMove)
			document.removeEventListener('mouseup', handleMouseUp)
			document.body.style.cursor = ''
			document.body.style.userSelect = ''
		}
	}, [isDragging])

	// 设置页面标题
	useEffect(() => {
		if (report) {
			document.title = `${report.name || '报告详情'} / Monitor Hub`
		} else {
			document.title = `报告详情 / Monitor Hub`
		}
	}, [report])

	// 获取报告数据
	const fetchReport = async () => {
		if (!reportId) {
			setError("缺少报告 ID")
			setLoading(false)
			return
		}

		try {
			setLoading(true)
			setError(null)
			const data = await getReport(reportId)
			setReport(data)
		} catch (err) {
			console.error("获取报告详情失败:", err)
			setError(err instanceof Error ? err.message : "获取报告详情失败")
		} finally {
			setLoading(false)
		}
	}

	// 初始加载
	useEffect(() => {
		fetchReport()
	}, [reportId])

	// 返回首页
	const handleBack = () => {
		navigate("/")
	}
	
	// 重载报告数据
	const handleReload = async () => {
		if (!reportId || reloading) return
		
		try {
			setReloading(true)
			reloadingRef.current = true
			setReloadProgress(0)
			
			// 1. 提交重载任务
			await reloadReport(reportId)
			toast({
				title: "重载任务已提交",
				description: "正在重新从数据源获取数据...",
			})
			
			// 2. 轮询任务进度
			const pollInterval = setInterval(async () => {
				try {
					const taskResult = await getReportTask(reportId)
					const taskInfo = taskResult?.task_info
					const reportStatus = taskResult?.report_status
					
					// 更新进度
					if (taskInfo?.progress !== undefined) {
						setReloadProgress(taskInfo.progress)
					}
					
					// 检查任务状态
					const status = reportStatus?.status || taskInfo?.status
					
					if (status === 'completed') {
						clearInterval(pollInterval)
						setReloading(false)
						reloadingRef.current = false
						setReloadProgress(100)
						toast({
							title: "重载完成",
							description: "数据已更新，正在刷新页面...",
						})
						// 刷新页面数据
						fetchReport()
					} else if (status === 'failed') {
						clearInterval(pollInterval)
						setReloading(false)
						reloadingRef.current = false
						const errorMsg = reportStatus?.error_msg || '未知错误'
						toast({
							title: "重载失败",
							description: errorMsg,
							variant: "destructive",
						})
					}
				} catch (pollErr) {
					console.error("查询进度失败:", pollErr)
				}
			}, 1000) // 每秒查询一次
			
			// 设置超时（5分钟）
			setTimeout(() => {
				clearInterval(pollInterval)
				if (reloadingRef.current) {
					setReloading(false)
					reloadingRef.current = false
					toast({
						title: "重载超时",
						description: "任务执行时间过长，请稍后手动刷新页面",
						variant: "destructive",
					})
				}
			}, 5 * 60 * 1000)
			
		} catch (err) {
			console.error("重载报告失败:", err)
			setReloading(false)
			reloadingRef.current = false
			toast({
				title: "重载失败",
				description: err instanceof Error ? err.message : "请稍后重试",
				variant: "destructive",
			})
		}
	}
	
	// 监听导出命令
	useEffect(() => {
		if (exportCommand && report) {
			handleExport(exportCommand)
			clearExportCommand()
		}
	}, [exportCommand, report])
	
	// 导出报告 - 打开专用导出页面
	const handleExport = async (_format: 'pdf' | 'png') => {
		if (!report || !reportId) return
		
		try {
			setExporting(true)
			
			// 构建导出页面 URL
			const exportUrl = `${window.location.origin}/report/${reportId}/export`
			
			// 打开导出页面
			window.open(exportUrl, '_blank')
			
			toast({
				title: "已打开导出页面",
				description: "请在新窗口中等待页面加载完成后截图",
				duration: 5000,
			})
			
		} catch (err) {
			console.error('导出失败:', err)
			toast({
				title: "导出失败",
				description: "请稍后重试",
				variant: "destructive",
			})
		} finally {
			setExporting(false)
		}
	}

	// 加载状态
	if (loading) {
		return (
			<>
				<PageLoading text="加载报告详情..." />
				<FooterRepoLink />
			</>
		)
	}

	// 错误状态
	if (error || !report) {
		return (
			<>
				<div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
					<div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 text-center max-w-md">
						<h2 className="text-xl font-semibold text-destructive mb-2">加载失败</h2>
						<p className="text-sm text-muted-foreground mb-4">
							{error || "报告不存在"}
						</p>
						<Button onClick={handleBack} variant="outline">
							<ArrowLeftIcon className="mr-2 h-4 w-4" />
							返回首页
						</Button>
					</div>
				</div>
				<FooterRepoLink />
			</>
		)
	}

	// 正常渲染
	return (
		<>
			<div ref={exportContainerRef} className="flex flex-col gap-6" data-export-ready="true">
				{/* 报告详情卡片 */}
				<ReportDetailCard 
					report={report} 
					onEditSuccess={fetchReport}
					onRegenerate={handleReload}
					reloading={reloading}
					reloadProgress={reloadProgress}
					viewMode={caseViewMode}
					onViewModeChange={setCaseViewMode}
				/>

				{/* 结论 + 用例概览 - 可调整大小的布局 */}
				<div 
					ref={containerRef}
					className="flex items-start"
				>
					{/* 描述结论卡片 - 可调整宽度 */}
					<div 
						className={cn(
							"min-w-0",
							!isDragging && "transition-all duration-300 ease-out"
						)}
						style={{ 
							width: isAIExpanded ? `${leftPanelWidth}%` : '100%',
						}}
					>
						<DescriptionCard
							reportId={report.id}
							description={report.description}
							onSaveSuccess={fetchReport}
							showAIButton={true}
							isAIExpanded={isAIExpanded}
							onToggleAI={() => setIsAIExpanded(!isAIExpanded)}
						/>
					</div>
					
					{/* 可拖动分隔条 + AI分析面板 - 仅在展开时显示 */}
					{isAIExpanded && (
						<>
							<div 
								className={cn(
									"flex items-center justify-center w-4 cursor-col-resize group",
									!isDragging && "transition-all duration-300 ease-out"
								)}
								onMouseDown={handleDragStart}
							>
								<div className={cn(
									"w-1 h-16 rounded-full transition-all duration-200",
									"bg-border group-hover:bg-primary/50 group-hover:h-24",
									isDragging && "bg-primary h-24"
								)}>
									<div className={cn(
										"w-full h-full flex items-center justify-center",
										"opacity-0 group-hover:opacity-100 transition-opacity",
										isDragging && "opacity-100"
									)}>
										<GripVerticalIcon className="w-3 h-3 text-muted-foreground" />
									</div>
								</div>
							</div>
							
							{/* 用例概览与智能分析 */}
							<div 
								className={cn(
									"overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300",
									!isDragging && "transition-[width] duration-300 ease-out"
								)}
								style={{
									width: `calc(${100 - leftPanelWidth}% - 1rem)`,
								}}
							>
								<CaseOverviewCard 
									caseCount={report.cases?.length || 0} 
									className="min-w-[240px]"
									isVisible={isAIExpanded}
								/>
							</div>
						</>
					)}
				</div>

				{/* 图表分析区域 */}
				<ReportChartsCard 
					report={report} 
					caseViewMode={caseViewMode}
					showSummaryTables={true}
				/>
			</div>
			<FooterRepoLink />
		</>
	)
})

