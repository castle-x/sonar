/**
 * ReportDetailCard - 报告详情卡片
 * 
 * 包含：
 * - 标题行：报告名称 + 状态 + 操作按钮
 * - 描述行：报告描述
 * - 信息栏：数据源、用例数、持续时间等
 * - 扩展信息：项目 ICON + 测试信息（3列网格）
 */

import React, { useMemo, useState } from "react"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog } from "@/components/ui/dialog"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { 
	RefreshCwIcon, 
	ArchiveIcon, 
	DatabaseIcon,
	ListIcon,
	TimerIcon,
	ActivityIcon,
	UserIcon,
	CalendarIcon,
	LayoutGridIcon,
	LayoutListIcon,
	MoreHorizontalIcon,
	PencilIcon,
	GaugeIcon,
	SendIcon,
	UndoIcon,
	Share2Icon,
	FolderIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { ReportRecord } from "@/apis/report"
import { updateReport, forwardReport } from "@/apis/report"
import { ForwardDialog } from "@/components/forward-dialog"
import { useToast } from "@/components/ui/use-toast"
import { ProjectIcon } from "./project-icon"
import { ExtraInfoDisplay } from "./extra-info-display"
import { EditReportInfoDialog } from "./edit-report-info"
import { ReportScoringConfigDialog } from "@/components/report-scoring-config-dialog"
import { ReportScoreDetailDialog } from "./report-score-detail-dialog"
import { ReportFilesDialog } from "./report-files-dialog"

interface ReportDetailCardProps {
	report: ReportRecord
	onRegenerate?: () => void
	onEditSuccess?: () => void
	onArchive?: () => void
	onShare?: () => void
	/** 用例视图模式 */
	viewMode?: 'tabs' | 'flat'
	/** 用例视图模式变化回调 */
	onViewModeChange?: (mode: 'tabs' | 'flat') => void
	/** 导出模式 - 隐藏操作按钮 */
	isExportMode?: boolean
	/** 重载中状态 */
	reloading?: boolean
	/** 重载进度 (0-100) */
	reloadProgress?: number
}

// 状态颜色映射
const STATUS_COLORS = {
	running: "bg-blue-500",
	completed: "bg-green-500",
	failed: "bg-red-500",
} as const

const STATUS_LABELS = {
	running: "生成中",
	completed: "已生成",
	failed: "生成失败",
} as const

// 评分等级颜色映射（用于状态指示器）
const SCORE_LEVEL_COLORS = {
	excellent: "bg-green-500",
	good: "bg-blue-500",
	normal: "bg-yellow-500",
	warning: "bg-orange-500",
	danger: "bg-red-500",
} as const

const SCORE_LEVEL_LABELS = {
	excellent: "低风险",
	good: "中低风险",
	normal: "中风险",
	warning: "中高风险",
	danger: "高风险",
} as const

export function ReportDetailCard({ 
	report, 
	onRegenerate, 
	onArchive, 
	onShare: _onShare,
	onEditSuccess,
	viewMode = 'tabs',
	onViewModeChange,
	isExportMode = false,
	reloading = false,
	reloadProgress = 0,
}: ReportDetailCardProps) {
	// _onShare 保留用于未来扩展
	const [editDialogOpen, setEditDialogOpen] = useState(false)
	const [scoringDialogOpen, setScoringDialogOpen] = useState(false)
	const [scoreDetailOpen, setScoreDetailOpen] = useState(false)
	const [forwardDialogOpen, setForwardDialogOpen] = useState(false)
	const [filesDialogOpen, setFilesDialogOpen] = useState(false)
	const [publishing, setPublishing] = useState(false)
	const { toast } = useToast()
	
	// 转发报告
	const handleForward = async (targetUrl: string) => {
		await forwardReport(report.id, targetUrl)
	}
	
	// 发布/取消发布
	const handleToggleRelease = async () => {
		setPublishing(true)
		try {
			const newReleaseStatus = !report.release
			await updateReport(report.id, { release: newReleaseStatus })
			toast({
				title: newReleaseStatus ? "发布成功" : "取消发布成功",
				description: newReleaseStatus ? "报告已标记为正式报告" : "报告已标记为测试报告",
			})
			onEditSuccess?.()
		} catch (error) {
			toast({
				title: "操作失败",
				description: error instanceof Error ? error.message : "未知错误",
				variant: "destructive",
			})
		} finally {
			setPublishing(false)
		}
	}
	
	// 计算系统信息栏数据
	const systemInfo = useMemo(() => {
		return [
			{
				value: report.datasource_name || '-',
				Icon: DatabaseIcon,
				label: "数据源",
			},
			{
				value: report.cases?.length ? `${report.cases.length} 个用例` : '-',
				Icon: ListIcon,
				label: "用例数量",
			},
			{
				value: report.duration || '-',
				Icon: TimerIcon,
				label: "持续时间",
			},
			{
				value: report.create_type === 'web_manual' ? '手动创建' : 
				       report.create_type === 'api_call' ? 'API调用' : 
				       report.create_type === 'scheduled' ? '定时任务' : report.create_type,
				Icon: ActivityIcon,
				label: "创建方式",
			},
			{
				value: report.operator || '-',
				Icon: UserIcon,
				label: "创建人",
			},
			{
				value: new Date(report.createdAt).toLocaleString("zh-CN"),
				Icon: CalendarIcon,
				label: "生成时间",
			},
			{
				value: report.release ? '已发布' : '未发布',
				Icon: SendIcon,
				label: "发布状态",
			},
		]
	}, [report])
	
	
	const status = report.report_status?.status || 'completed'
	const statusColor = STATUS_COLORS[status as keyof typeof STATUS_COLORS] || "bg-gray-500"
	const statusLabel = STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status
	
	return (
		<Card>
			<CardHeader className="pb-4">
				{/* 标题行：ICON + 报告名称 + 状态 + 操作按钮 */}
				<div className="grid xl:flex gap-4 items-start">
					{/* 左侧：项目 ICON */}
					<ProjectIcon 
						reportId={report.id}
						datasourceId={report.datasource_id}
						appId={report.app_id} 
						datasourceIconName={report.icon_name}
						reportIconName={report.report_icon_name}
						size={56}
						uploadable={!isExportMode}
						onUploadSuccess={onEditSuccess}
					/>
					
					<div className="flex-1 min-w-0">
						{/* 报告名称 + 状态 */}
						<div className="flex flex-wrap items-center gap-3 gap-y-2 text-xl sm:text-2xl font-semibold mb-2">
							{/* 报告名称 */}
							<span className="truncate">{report.name}</span>
							
							<Separator orientation="vertical" className="h-5 bg-primary/20" />
							
						{/* 状态/评分指示器 */}
						{report.report_score ? (
							// 有评分：显示评分信息，可点击打开详情
							<button
								onClick={() => setScoreDetailOpen(true)}
								className="flex gap-2 items-center text-sm font-normal hover:opacity-80 transition-opacity cursor-pointer"
							>
								{/* 带动画的状态圆点 */}
								<span className="relative flex h-3 w-3">
									<span
										className={cn(
											"animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
											SCORE_LEVEL_COLORS[report.report_score.level as keyof typeof SCORE_LEVEL_COLORS] || "bg-gray-500"
										)}
										style={{ animationDuration: "2s" }}
									/>
									<span className={cn(
										"relative inline-flex rounded-full h-3 w-3",
										SCORE_LEVEL_COLORS[report.report_score.level as keyof typeof SCORE_LEVEL_COLORS] || "bg-gray-500"
									)} />
								</span>
								<span className={cn(
									report.report_score.level === 'danger' ? 'text-red-600' :
									report.report_score.level === 'warning' ? 'text-orange-600' :
									report.report_score.level === 'normal' ? 'text-yellow-600' :
									report.report_score.level === 'good' ? 'text-blue-600' :
									report.report_score.level === 'excellent' ? 'text-green-600' : ''
								)}>
									{SCORE_LEVEL_LABELS[report.report_score.level as keyof typeof SCORE_LEVEL_LABELS] || report.report_score.level}
								</span>
								<span className="text-muted-foreground/50">|</span>
								<span className={cn(
									"font-medium",
									report.report_score.level === 'danger' ? 'text-red-600' :
									report.report_score.level === 'warning' ? 'text-orange-600' :
									report.report_score.level === 'normal' ? 'text-yellow-600' :
									report.report_score.level === 'good' ? 'text-blue-600' :
									report.report_score.level === 'excellent' ? 'text-green-600' : ''
								)}>
									报告总分:{report.report_score.total_score.toFixed(0)}
								</span>
							</button>
						) : (
							// 无评分：显示原始状态
							<div className="flex gap-2 items-center text-sm font-normal">
								<span className={cn("relative flex h-3 w-3")}>
									{status === "running" && (
										<span
											className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"
											style={{ animationDuration: "1.5s" }}
										/>
									)}
									<span
										className={cn("relative inline-flex rounded-full h-3 w-3", statusColor)}
									/>
								</span>
								{statusLabel}
							</div>
						)}
						</div>
						
						{/* 系统信息栏 */}
						<div className="flex flex-wrap items-center gap-2 text-sm">
							{systemInfo.map(({ value, label, Icon }, index) => (
								<React.Fragment key={label}>
									{index > 0 && <Separator orientation="vertical" className="h-4 bg-primary/20" />}
									<TooltipProvider>
										<Tooltip delayDuration={150}>
											<TooltipTrigger asChild>
												<div className="flex gap-1.5 items-center cursor-default">
													<Icon className="h-4 w-4" /> {value}
												</div>
											</TooltipTrigger>
											<TooltipContent>{label}</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								</React.Fragment>
							))}
						</div>
					</div>

					{/* 右侧操作按钮 - 导出模式下隐藏 */}
					{!isExportMode && (
						<div className="flex gap-2 xl:ms-auto">
							{/* 测试产物按钮 */}
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="outline"
											onClick={() => setFilesDialogOpen(true)}
											className="gap-1.5"
										>
											<FolderIcon className="h-4 w-4" />
											<span className="hidden sm:inline">测试产物</span>
										</Button>
									</TooltipTrigger>
									<TooltipContent>查看测试过程中的数据产物，服务器日志、性能分析文件等</TooltipContent>
								</Tooltip>
							</TooltipProvider>
							
							{/* 视图切换按钮 - 添加 data 属性供导出时自动点击 */}
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="outline"
											size="icon"
											onClick={() => onViewModeChange?.(viewMode === 'tabs' ? 'flat' : 'tabs')}
											data-export-action={viewMode === 'tabs' ? "switch-to-flat" : undefined}
										>
											{viewMode === 'tabs' ? (
												<LayoutListIcon className="h-4 w-4" />
											) : (
												<LayoutGridIcon className="h-4 w-4" />
											)}
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										{viewMode === 'tabs' ? '切换到平铺视图' : '切换到标签页视图'}
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
							
							{/* 更多操作下拉菜单 */}
							<DropdownMenu>
								<TooltipProvider>
									<Tooltip>
										<TooltipTrigger asChild>
											<DropdownMenuTrigger asChild>
												<Button variant="outline" size="icon">
													<MoreHorizontalIcon className="h-4 w-4" />
												</Button>
											</DropdownMenuTrigger>
										</TooltipTrigger>
										<TooltipContent>更多操作</TooltipContent>
									</Tooltip>
								</TooltipProvider>
							<DropdownMenuContent align="end" className="min-w-0">
								<TooltipProvider delayDuration={300}>
									<Tooltip>
										<TooltipTrigger asChild>
											<DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
												<PencilIcon className="h-4 w-4 mr-2" />
												编辑信息
											</DropdownMenuItem>
										</TooltipTrigger>
										<TooltipContent side="left">编辑左侧报告名称、列表、标签信息</TooltipContent>
									</Tooltip>
								</TooltipProvider>
								<TooltipProvider delayDuration={300}>
									<Tooltip>
										<TooltipTrigger asChild>
											<DropdownMenuItem onClick={() => setScoringDialogOpen(true)}>
												<GaugeIcon className="h-4 w-4 mr-2" />
												评分标准
											</DropdownMenuItem>
										</TooltipTrigger>
										<TooltipContent side="left">配置测试标准，自动给测试结果打分、标注风险</TooltipContent>
									</Tooltip>
								</TooltipProvider>
							<TooltipProvider delayDuration={300}>
								<Tooltip>
									<TooltipTrigger asChild>
										<DropdownMenuItem 
											onClick={handleToggleRelease}
											disabled={publishing}
										>
												{report.release ? (
													<>
														<UndoIcon className="h-4 w-4 mr-2" />
														{publishing ? '取消中...' : '取消发布'}
													</>
												) : (
													<>
														<SendIcon className="h-4 w-4 mr-2" />
														{publishing ? '发布中...' : '发布报告'}
													</>
												)}
											</DropdownMenuItem>
										</TooltipTrigger>
										<TooltipContent side="left">
											{report.release ? '取消发布状态' : '由QA审查报告数据无误后，标记为发布状态'}
										</TooltipContent>
									</Tooltip>
								</TooltipProvider>
								<TooltipProvider delayDuration={300}>
									<Tooltip>
										<TooltipTrigger asChild>
											<DropdownMenuItem onClick={() => setForwardDialogOpen(true)}>
												<Share2Icon className="h-4 w-4 mr-2" />
												转发报告
											</DropdownMenuItem>
										</TooltipTrigger>
										<TooltipContent side="left">通常从腾讯侧一键转发到卓越环境中</TooltipContent>
									</Tooltip>
								</TooltipProvider>
								<TooltipProvider delayDuration={300}>
									<Tooltip>
										<TooltipTrigger asChild>
											<DropdownMenuItem onClick={onArchive}>
												<ArchiveIcon className="h-4 w-4 mr-2" />
												归档报告
											</DropdownMenuItem>
										</TooltipTrigger>
										<TooltipContent side="left">删除，保留30天</TooltipContent>
									</Tooltip>
								</TooltipProvider>
								<TooltipProvider delayDuration={300}>
									<Tooltip>
										<TooltipTrigger asChild>
											<DropdownMenuItem 
												onClick={onRegenerate}
												disabled={status === 'running' || reloading}
											>
												<RefreshCwIcon className={cn("h-4 w-4 mr-2", reloading && "animate-spin")} />
												{reloading ? `重载中 ${reloadProgress}%` : '重载报告'}
											</DropdownMenuItem>
										</TooltipTrigger>
										<TooltipContent side="left">重新从数据源加载并聚合数据，重新生成测试报告</TooltipContent>
									</Tooltip>
								</TooltipProvider>
							</DropdownMenuContent>
							</DropdownMenu>
							
							{/* 编辑对话框 */}
							<Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
								<EditReportInfoDialog 
									report={report} 
									setOpen={setEditDialogOpen} 
									onSuccess={onEditSuccess}
								/>
							</Dialog>
							
							{/* 评分标准对话框 */}
							<ReportScoringConfigDialog
								reportId={report.id}
								open={scoringDialogOpen}
								onOpenChange={setScoringDialogOpen}
								onSuccess={onEditSuccess}
							/>
							
							{/* 转发对话框 */}
							<ForwardDialog
								open={forwardDialogOpen}
								onOpenChange={setForwardDialogOpen}
								type="report"
								resourceId={report.id}
								resourceName={report.name}
								onForward={handleForward}
							/>
							
							{/* 关联文件对话框 */}
							<ReportFilesDialog
								report={report}
								open={filesDialogOpen}
								onOpenChange={setFilesDialogOpen}
								onSuccess={onEditSuccess}
							/>
						</div>
					)}
				</div>
			</CardHeader>
			
			{/* 扩展信息区域 */}
			<CardContent className="pt-0">
				<Separator className="mb-6" />
				
				{/* 扩展信息 + 标签 */}
				<ExtraInfoDisplay info={report.extra_info} tags={report.tags} testTimeline={report.test_timeline} />
				
				{/* 评分详情弹窗 */}
				{report.report_score && (
					<ReportScoreDetailDialog
						score={report.report_score}
						open={scoreDetailOpen}
						onOpenChange={setScoreDetailOpen}
					/>
				)}
			</CardContent>
		</Card>
	)
}

