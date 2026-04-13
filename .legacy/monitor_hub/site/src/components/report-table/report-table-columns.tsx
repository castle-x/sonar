/**
 * ============================================
 * 报告表格 - 列定义文件
 * ============================================
 * 
 * 这个文件定义了报告表格的所有列（列配置）
 * 包括：每列的显示方式、排序规则、过滤规则、操作按钮等
 * 
 * 主要导出：
 * 1. ReportColumns() - 返回所有列的配置数组
 * 2. ActionsButton - 每行的操作按钮组件（重载/归档）
 * 
 * 列定义：
 * - 状态 (report_status.status) - running / completed / failed
 * - 测试时间 (cases[0].query_config.start_time) - 第一个用例的开始时间
 * - 持续时间 (duration) - 测试持续时长
 * - 名称 (name) - 报告名称
 * - 数据源 (datasource_name) - 数据源名称
 * - 用例列表 (cases) - 拼接显示所有用例名称（手动截断，Tooltip 显示完整内容）
 * - 创建方式 (create_type) - api_call / web_manual / scheduled
 * - 操作人 (operator) - 创建报告的操作人
 * - 生成时间 (createdAt) - 报告创建时间
 * - 操作 (actions) - 重载 + 归档按钮
 */

// ============================================
// 导入依赖
// ============================================

import type { ColumnDef, HeaderContext } from "@tanstack/react-table"
import {
	CalendarIcon,
	ArchiveIcon,
	RefreshCwIcon,
	MoreHorizontalIcon,
	DatabaseIcon,
	ListIcon,
	UserIcon,
	FileTextIcon,
	ActivityIcon,
	FolderKanbanIcon,
	ClockIcon,
	TimerIcon,
	SendIcon,
	UndoIcon,
} from "lucide-react"
import { memo, useMemo, useState } from "react"
import { Button, buttonVariants } from "@/components/ui/button"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { ReportRecord } from "@/apis/report"
import { deleteReport, updateReport } from "@/apis/report"
import { useToast } from "@/components/ui/use-toast"

// ============================================
// 常量配置
// ============================================

/** 用例列表截断长度（字符数） */
const CASE_LIST_MAX_LENGTH = 12

// ============================================
// 状态颜色映射
// ============================================

const STATUS_COLORS = {
	running: "bg-blue-500",        // 生成中 - 蓝色
	completed: "bg-green-500",     // 已生成 - 绿色
	failed: "bg-red-500",          // 失败 - 红色
} as const

const STATUS_TEXT = {
	running: "生成中",
	completed: "已生成",
	failed: "失败",
} as const

const CREATE_TYPE_MAP = {
	api_call: "API 调用",
	web_manual: "手动创建",
	scheduled: "定时任务",
} as const

// ============================================
// 工具函数
// ============================================

/**
 * 截断文本到指定长度，超出部分用 "..." 代替
 * 
 * @param text - 原始文本
 * @param maxLength - 最大长度（不包括 "..."）
 * @returns 截断后的文本
 * 
 * @example
 * truncateText("fight, move, move, move", CASE_LIST_MAX_LENGTH) // "fight, mo..."
 */
function truncateText(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text
	}
	return text.slice(0, maxLength) + '...'
}

// ============================================
// 主函数：定义所有列的配置
// ============================================

/**
 * ReportColumns - 报告表格的列定义函数
 * 
 * @param onRefresh - 刷新数据的回调函数
 * @returns 列定义数组
 */
export function ReportColumns(onRefresh?: () => void): ColumnDef<ReportRecord>[] {
	return [
		// ============================================
		// 第 1 列：状态
		// ============================================
		{
			id: "status",
			accessorFn: (row) => row.report_status?.status || 'unknown',
			name: () => "状态",
			size: 110,
			enableSorting: false,  // 禁用排序
			enableHiding: false,  // 状态列不允许隐藏
			
			cell: (info) => {
				const status = info.getValue() as string
				const statusColor = STATUS_COLORS[status as keyof typeof STATUS_COLORS] || "bg-gray-500"
				const statusText = STATUS_TEXT[status as keyof typeof STATUS_TEXT] || status
				
				// 状态样式配置（背景色 + 文字颜色）
				const statusStyles = {
					running: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
					completed: "bg-green-500/10 text-green-700 dark:text-green-400",
					failed: "bg-red-500/10 text-red-700 dark:text-red-400",
				}[status] || "bg-gray-500/10 text-gray-700 dark:text-gray-400"
				
				return (
					<div className="flex items-center justify-center">
						<div className={cn(
							"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full",
							statusStyles
						)}>
							{/* 状态指示器（带跳动动画） */}
							<span className={cn("relative flex size-2")}>
								{/* 跳动动画层（仅在 running 状态显示） */}
								{status === "running" && (
									<span
										className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"
										style={{ animationDuration: "1.5s" }}
									/>
								)}
								{/* 实际状态圆点 */}
								<span
									className={cn("relative inline-flex rounded-full size-2", statusColor)}
								/>
							</span>
							{/* 状态文字 */}
							<span className="text-xs font-medium">{statusText}</span>
						</div>
					</div>
				)
			},
			
			header: simpleHeader,
			Icon: ActivityIcon,
		},
		
		// ============================================
		// 第 2 列：测试时间（显示第一个用例的开始时间）
		// ============================================
		{
			id: "test_start_time",
			accessorFn: (row) => {
				// 从第一个用例获取开始时间
				const firstCase = row.cases?.[0]
				return firstCase?.query_config?.start_time
			},
			name: () => "测试时间",
			size: 150,
			enableSorting: false,  // 禁用排序
			
			cell: (info) => {
				const startTime = info.getValue() as number | undefined
				if (!startTime) {
					return <span className="text-sm text-muted-foreground flex items-center justify-center">-</span>
				}
				
				// 将毫秒时间戳转换为可读格式
				const date = new Date(startTime)
				return (
					<span className="text-sm tabular-nums flex items-center justify-center">
						{date.toLocaleString("zh-CN")}
					</span>
				)
			},
			
			header: simpleHeader,
			Icon: ClockIcon,
		},
		
		// ============================================
		// 第 3 列：持续时间
		// ============================================
		{
			id: "duration",
			accessorKey: "duration",
			name: () => "持续时间",
			size: 100,
			enableSorting: false,  // 禁用排序
			
			cell: (info) => {
				const duration = info.getValue() as string | undefined
				return (
					<span className="text-sm tabular-nums flex items-center justify-center">
						{duration || '-'}
					</span>
				)
			},
			
			header: simpleHeader,
			Icon: TimerIcon,
		},
		
		// ============================================
		// 第 4 列：名称
		// ============================================
		{
			id: "name",
			accessorKey: "name",
			name: () => "名称",
			size: 180,
			enableSorting: false,  // 禁用排序
			
			filterFn: (row, _, filterValue) => {
				const name = row.original.name.toLowerCase()
				return name.includes(filterValue.toLowerCase())
			},
			
		cell: (info) => {
			const name = info.getValue() as string
			
			if (!name) {
				return <span className="text-sm text-muted-foreground/50 flex items-center justify-center">-</span>
			}
			
			// 手动截断到指定长度（与用例列保持一致）
			const displayText = truncateText(name, CASE_LIST_MAX_LENGTH)
			const isTruncated = name.length > CASE_LIST_MAX_LENGTH
			
			return (
				<TooltipProvider>
					<Tooltip delayDuration={150}>
						<TooltipTrigger asChild>
							<span className="text-sm font-medium flex items-center justify-center cursor-default">
								{displayText}
							</span>
						</TooltipTrigger>
						{isTruncated && (
							<TooltipContent className="max-w-md">
								<p className="text-sm">{name}</p>
							</TooltipContent>
						)}
					</Tooltip>
				</TooltipProvider>
			)
		},
			
			header: simpleHeader,
			Icon: FileTextIcon,
		},
		
		// ============================================
		// 第 5 列：数据源名称
		// ============================================
		{
			id: "datasource_name",
			accessorKey: "datasource_name",
			name: () => "数据源",
			size: 150,
			enableSorting: false,  // 禁用排序
			
			cell: (info) => {
				const datasourceName = info.getValue() as string | undefined
				return (
					<span className="text-sm flex items-center justify-center">
						{datasourceName || '-'}
					</span>
				)
			},
			
			header: simpleHeader,
			Icon: DatabaseIcon,
		},
		
		// ============================================
		// 第 6 列：用例列表（手动截断到 CASE_LIST_MAX_LENGTH，使用 Tooltip 显示完整内容）
		// ============================================
		{
			id: "cases",
			accessorKey: "cases",
			name: () => "用例列表",
			size: 200,
			enableSorting: false,  // 禁用排序
			
			cell: (info) => {
				const cases = info.getValue() as any[] | undefined
				
				if (!cases || cases.length === 0) {
					return <span className="text-sm text-muted-foreground/50 flex items-center justify-center">-</span>
				}
				
				// 拼接所有用例名称
				const caseNames = cases.map(c => c.name).join(', ')
				
				// 手动截断到指定长度（列头约 12 个字符，留 3 个给 "..."）
				const displayText = truncateText(caseNames, CASE_LIST_MAX_LENGTH)
				const isTruncated = caseNames.length > CASE_LIST_MAX_LENGTH
				
				return (
					<TooltipProvider>
						<Tooltip delayDuration={150}>
							<TooltipTrigger asChild>
								<span className="text-sm text-muted-foreground flex items-center justify-center cursor-default">
									{displayText}
								</span>
							</TooltipTrigger>
							{isTruncated && (
								<TooltipContent>
									<div className="max-w-md text-sm">
										{caseNames}
									</div>
								</TooltipContent>
							)}
						</Tooltip>
					</TooltipProvider>
				)
			},
			
			header: simpleHeader,
			Icon: ListIcon,
		},
		
		// ============================================
		// 第 7 列：创建方式
		// ============================================
		{
			id: "create_type",
			accessorKey: "create_type",
			name: () => "创建方式",
			size: 100,
			enableSorting: false,  // 禁用排序
			
			cell: (info) => {
				const createType = info.getValue() as string
				const displayName = CREATE_TYPE_MAP[createType as keyof typeof CREATE_TYPE_MAP] || createType
				
				return (
					<span className="text-sm flex items-center justify-center">
						{displayName}
					</span>
				)
			},
			
			header: simpleHeader,
			Icon: FolderKanbanIcon,
		},
		
		// ============================================
		// 第 8 列：操作人
		// ============================================
		{
			id: "operator",
			accessorKey: "operator",
			name: () => "创建人",
			size: 100,
			enableSorting: false,  // 禁用排序
			
			cell: (info) => {
				const operator = info.getValue() as string | undefined
				return (
					<span className="text-sm flex items-center justify-center">
						{operator || '-'}
					</span>
				)
			},
			
			header: simpleHeader,
			Icon: UserIcon,
		},
		
		// ============================================
		// 第 9 列：发布状态
		// ============================================
		{
			id: "release",
			accessorKey: "release",
			name: () => "发布状态",
			size: 100,
			enableSorting: false,  // 禁用排序
			
			cell: (info) => {
				const release = info.getValue() as boolean | undefined
				return (
					<div className="flex items-center justify-center">
						<span className={cn(
							"inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium",
							release 
								? "bg-orange-500/15 text-orange-600 dark:text-orange-400" 
								: "bg-gray-500/15 text-gray-600 dark:text-gray-400"
						)}>
							{release ? '已发布' : '未发布'}
						</span>
					</div>
				)
			},
			
			header: simpleHeader,
			Icon: SendIcon,
		},
		
		// ============================================
		// 第 10 列：操作按钮
		// ============================================
		{
			id: "actions",
			// @ts-ignore
			name: () => "操作",
			size: 80,
			
			cell: ({ row }) => {
				return (
					<div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
						<ActionsButton report={row.original} onRefresh={onRefresh} />
					</div>
				)
			},
		},
	] as ColumnDef<ReportRecord>[]
}

// ============================================
// 辅助函数：简单表头（不支持排序）
// ============================================

function simpleHeader(context: HeaderContext<ReportRecord, unknown>) {
	// @ts-ignore
	const { Icon, name }: { Icon?: React.ElementType; name: () => string } = context.column.columnDef
	
	return (
		<div className="h-9 px-3 flex items-center justify-center w-full font-medium text-sm">
			{Icon && <Icon className="me-2 size-4" />}
			{name()}
		</div>
	)
}

// ============================================
// 组件：操作按钮（重载/归档）
// ============================================

/**
 * ActionsButton - 报告操作按钮组件
 * 
 * 显示一个"三个点"按钮，点击后弹出菜单，包含：
 * - 重载：占位功能（暂未实现）
 * - 归档：删除报告（带确认对话框）
 */
export const ActionsButton = memo(({ 
	report, 
	onRefresh 
}: { 
	report: ReportRecord
	onRefresh?: () => void 
}) => {
	const [archiveOpen, setArchiveOpen] = useState(false)
	const [loading, setLoading] = useState(false)
	const [publishing, setPublishing] = useState(false)
	const { name } = report
	const { toast } = useToast()
	
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
			if (onRefresh) {
				onRefresh()
			}
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
	
	return useMemo(() => {
		return (
			<>
				{/* 下拉菜单 */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="size-8">
							<span className="sr-only">打开菜单</span>
							<MoreHorizontalIcon className="w-5" />
						</Button>
					</DropdownMenuTrigger>
					
					<DropdownMenuContent align="end">
						{/* 重载（占位） */}
						<DropdownMenuItem 
							onSelect={() => {
								toast({
									title: "功能开发中",
									description: "重载功能即将上线",
								})
							}}
						>
							<RefreshCwIcon className="me-2.5 size-4" />
							重载
						</DropdownMenuItem>
						
						{/* 发布/取消发布 */}
						<DropdownMenuItem 
							onSelect={handleToggleRelease}
							disabled={publishing}
						>
							{report.release ? (
								<>
									<UndoIcon className="me-2.5 size-4" />
									{publishing ? '取消中...' : '取消发布'}
								</>
							) : (
								<>
									<SendIcon className="me-2.5 size-4" />
									{publishing ? '发布中...' : '发布报告'}
								</>
							)}
						</DropdownMenuItem>
						
						<DropdownMenuSeparator />
						
						{/* 归档（删除） */}
						<DropdownMenuItem onSelect={() => setArchiveOpen(true)}>
							<ArchiveIcon className="me-2.5 size-4" />
							归档
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>

				{/* 归档确认对话框 */}
				<AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>确认归档 {name}？</AlertDialogTitle>
							<AlertDialogDescription>
								此操作将归档该报告，保留30天后删除。
							</AlertDialogDescription>
						</AlertDialogHeader>
						
						<AlertDialogFooter>
							<AlertDialogCancel>取消</AlertDialogCancel>
							
							<AlertDialogAction
								className={cn(buttonVariants({ variant: "destructive" }))}
								disabled={loading}
								onClick={async () => {
									setLoading(true)
									
									try {
										// 调用后端 API 删除报告
										await deleteReport(report.id)
										
										toast({
											title: "归档成功",
											description: `报告 "${name}" 已归档`,
										})
										
										setArchiveOpen(false)
										
										// 刷新数据列表
										if (onRefresh) {
											onRefresh()
										}
										
									} catch (error) {
										console.error("归档报告失败:", error)
										toast({
											title: "归档失败",
											description: error instanceof Error ? error.message : "未知错误",
											variant: "destructive",
										})
									} finally {
										setLoading(false)
									}
								}}
							>
								{loading ? "归档中..." : "继续"}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</>
		)
	}, [report, name, archiveOpen, loading, publishing, toast, onRefresh, handleToggleRelease])
})

