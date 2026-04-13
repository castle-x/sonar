/**
 * 报告导出页面 - 专为后端截图导出优化
 * 
 * 特点：
 * - 默认平铺模式，所有内容展开
 * - 无导航栏、无操作按钮
 * - 渲染完成后设置 data-export-complete="true" 标识
 * - 供后端 chromedp 截图使用
 */

import { memo, useEffect, useState, useRef, useCallback } from "react"
import { useStore } from "@nanostores/react"
import { $router } from "@/components/router"
import { getReport, type ReportRecord } from "@/apis/report"
import { cn } from "@/lib/utils"

// 组件导入
import { ReportDetailCard } from "@/components/report-detail/report-detail-card"
import { DescriptionCard } from "@/components/report-detail/description-card"
import { CaseOverviewCard } from "@/components/report-detail/case-overview-card"
import { ReportChartsCard } from "@/components/report-detail/report-charts-card"

/**
 * 导出页面 - 固定展开模式
 */
export default memo(() => {
	const page = useStore($router)
	const reportId = page?.route === "reportExport" ? page.params.id : null

	const [report, setReport] = useState<ReportRecord | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	
	// 渲染状态追踪
	const [chartsRendered, setChartsRendered] = useState(false)
	const [aiStreamComplete, setAiStreamComplete] = useState(false)
	
	// 整体渲染完成标识
	const isExportComplete = !loading && !error && report && chartsRendered && aiStreamComplete

	// 获取报告数据
	useEffect(() => {
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

		fetchReport()
	}, [reportId])

	// 设置页面标题
	useEffect(() => {
		if (report) {
			document.title = `导出 - ${report.name || '报告'} / Monitor Hub`
		}
	}, [report])
	
	// 导出模式：设置 body 属性，隐藏悬浮元素
	useEffect(() => {
		document.body.setAttribute('data-exporting', 'true')
		return () => {
			document.body.removeAttribute('data-exporting')
		}
	}, [])
	
	// 图表渲染完成回调
	const handleChartsRendered = useCallback(() => {
		console.log('[Export] Charts rendered')
		setChartsRendered(true)
	}, [])
	
	// AI 流式输出完成回调
	const handleAiComplete = useCallback(() => {
		console.log('[Export] AI stream complete')
		setAiStreamComplete(true)
	}, [])
	
	// 没有 AI 分析时直接标记完成
	useEffect(() => {
		// 如果报告加载完成，检查是否有 AI 分析内容
		// 目前 AI 分析是模拟的，所以直接标记完成
		if (!loading && report) {
			// 延迟一下让 AI 流式输出动画有时间完成
			const timer = setTimeout(() => {
				setAiStreamComplete(true)
			}, 5000) // 给 AI 动画 5 秒时间
			return () => clearTimeout(timer)
		}
	}, [loading, report])

	// 加载中
	if (loading) {
		return (
			<div 
				className="min-h-screen flex items-center justify-center bg-background"
				data-export-complete="false"
				data-export-status="loading"
			>
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
					<p className="text-muted-foreground">加载报告数据...</p>
				</div>
			</div>
		)
	}

	// 错误
	if (error) {
		return (
			<div 
				className="min-h-screen flex items-center justify-center bg-background"
				data-export-complete="false"
				data-export-status="error"
				data-export-error={error}
			>
				<div className="text-center text-destructive">
					<p className="text-lg font-semibold mb-2">加载失败</p>
					<p className="text-sm">{error}</p>
				</div>
			</div>
		)
	}

	// 无数据
	if (!report) {
		return (
			<div 
				className="min-h-screen flex items-center justify-center bg-background"
				data-export-complete="false"
				data-export-status="no-data"
			>
				<p className="text-muted-foreground">报告不存在</p>
			</div>
		)
	}

	// 正常渲染 - 平铺模式
	return (
		<div 
			className="min-h-screen bg-background"
			data-export-complete={isExportComplete ? "true" : "false"}
			data-export-status={isExportComplete ? "complete" : "rendering"}
			data-report-id={reportId}
			data-report-name={report.name}
		>
			{/* 导出专用容器 - 无导航栏 */}
			<div className="container mx-auto py-6 space-y-6 max-w-[89rem]">
				
				{/* 1. 报告基础信息 */}
				<ReportDetailCard 
					report={report} 
					viewMode="flat"
					onViewModeChange={() => {}}
					isExportMode={true}
				/>

				{/* 2. AI 智能分析 - 导出模式下全宽显示 */}
				<CaseOverviewCard 
					onStreamComplete={handleAiComplete}
					isExportMode={true}
				/>

				{/* 3. 结论说明 - 导出模式下全宽显示 */}
				<DescriptionCard
					reportId={reportId || ""}
					description={report.description}
					onSaveSuccess={async () => {}}
					isAIExpanded={true}
					onToggleAI={() => {}}
					forceExpanded={true}
					isExportMode={true}
				/>

				{/* 4. 图表区域 - 固定平铺模式 */}
				<ReportChartsCard 
					report={report} 
					caseViewMode="flat"
					onCaseViewModeChange={() => {}}
					onChartsRendered={handleChartsRendered}
					isExportMode={true}
				/>
				
				{/* 页脚留白 */}
				<div className="h-8"></div>
			</div>
			
			{/* 渲染状态指示器（调试用，后端可读取） */}
			<div 
				id="export-status-indicator"
				className="hidden"
				data-charts-rendered={chartsRendered}
				data-ai-complete={aiStreamComplete}
			/>
		</div>
	)
})

