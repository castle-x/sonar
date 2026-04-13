import { 
	SearchIcon, 
	Share2Icon, 
	LinkIcon, 
	CheckIcon, 
	FileImageIcon, 
	LoaderIcon,
	ListIcon,
	FileTextIcon,
	PlusIcon,
	ClipboardListIcon,
} from "lucide-react"
import { lazy, Suspense, useState } from "react"
import { useStore } from "@nanostores/react"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
	DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/components/ui/use-toast"
import { Logo } from "./logo"
import { ModeToggle } from "./mode-toggle"
import { $router, basePath, Link, navigate, prependBasePath } from "./router"
import { runOnce } from "@/lib/utils"
import { AddDatasourceButton } from "@/components/add-datasource"
import { UserInfoButton } from "@/components/user-info"
import { $isExporting } from "@/lib/export-store"
import { getAllReports, type ReportRecord } from "@/apis/report"
import { getAllTasks, type TaskRecord } from "@/apis/task"
import { CreateTaskDialog } from "@/components/task-detail/create-task-dialog"

			
// 懒加载命令面板（但不监听键盘快捷键）
const CommandPalette = lazy(() => import("./command-palette"))
const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0

/**
 * Navbar 导航栏组件
 * 
 * 一比一复刻 Beszel 的导航栏样式和布局
 * - 左侧：Logo
 * - 右侧：功能图标（仪表盘、系统列表、主题切换、设置）
 */
export default function Navbar() {
	const page = useStore($router)
	
	// 检查当前是否在 dashboard 页面
	const isDashboard = page?.route === 'dashboard'
	const datasourceId = isDashboard ? (page?.params?.id as string) : undefined
	
	// 检查是否在不需要显示"添加数据源"按钮的页面
	const isReportDetail = page?.route === 'reportDetail'
	const isFileManager = page?.route === 'fileManager'
	const isTaskPage = page?.route === 'taskDetail' || page?.route === 'taskList'
	const isTaskSharePage = page?.route === 'taskShare'  // 任务分享页（只读）
	const shouldHideAddDatasource = isReportDetail || isFileManager || isTaskPage || isTaskSharePage
	
	return (
		<div className="flex items-center h-14 md:h-16 bg-card px-4 pe-3 sm:px-6 border border-border/60 bt-0 rounded-md mt-4 mb-6">
			{/* Logo - 左侧 */}
			<Link
				href={basePath}
				aria-label="Home"
				className="flex items-center p-2 ps-0 me-3 group"
				onMouseEnter={runOnce(() => import("@/components/routes/home"))}
			>
				<Logo />
			</Link>
			
			{/* 搜索按钮 */}
			<SearchButton />
			
			{/* 右侧功能区 */}
			<div className="flex items-center ms-auto gap-1">	
				{/* 主题切换 */}
				<ModeToggle />

				{/* 用户信息 */}
				<UserInfoButton />

				{/* 设置 */}
				{/* <Link
					href={getPagePath($router, "settings", { name: "general" })}
					aria-label="设置"
					className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
				>
					<SettingsIcon className="h-[1.2rem] w-[1.2rem]" />
				</Link> */}
				{/* 添加/编辑数据源（特定页面不显示） */}
			{!shouldHideAddDatasource && (
					<AddDatasourceButton 
						className="hidden sm:flex" 
						editMode={isDashboard}
						datasourceId={datasourceId}
					/>
				)}
			{/* 任务切换器（仅在任务页面显示，分享页面不显示） */}
			{isTaskPage && !isTaskSharePage && <TaskSwitcher currentTaskId={page?.route === 'taskDetail' ? page?.params?.id as string : undefined} />}
			{/* 任务分享按钮（仅在任务详情页面显示，分享页面不显示） */}
			{page?.route === 'taskDetail' && <TaskShareButton taskId={page?.params?.id as string} />}
			{/* 报告切换器（仅在报告详情页面显示） */}
			{isReportDetail && <ReportSwitcher currentReportId={page?.params?.id as string} />}
				{/* 分享/导出按钮（仅在报告详情页面显示） */}
				{isReportDetail && <ShareExportButton />}
			</div>
		</div>
	)
}

/**
 * 搜索按钮组件
 * 
 * 点击打开命令面板，但不监听键盘快捷键
 */
function SearchButton() {
	const [open, setOpen] = useState(false)

	const Kbd = ({ children }: { children: React.ReactNode }) => (
		<kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
			{children}
		</kbd>
	)
	return (
		<>
			<Button
				variant="outline"
				className="hidden md:block text-sm text-muted-foreground px-4"
				onClick={() => setOpen(true)}
			>
				<span className="flex items-center">
					<SearchIcon className="me-1.5 h-4 w-4" />
					更多功能
					<span className="flex items-center ms-3.5">
						<Kbd>{isMac ? "⌘" : "Ctrl"}+K</Kbd>
					</span>
				</span>
			</Button>
			<Suspense>
				<CommandPalette open={open} setOpen={setOpen} />
			</Suspense>
		</>
	)
}

/**
 * 任务分享按钮组件
 * 
 * 仅在任务详情页面显示，点击复制分享链接
 */
function TaskShareButton({ taskId }: { taskId: string }) {
	const [copied, setCopied] = useState(false)
	const { toast } = useToast()

	const handleShare = async () => {
		// 构建分享链接（使用 prependBasePath 处理双斜杠问题）
		const shareUrl = `${window.location.origin}${prependBasePath(`/task/${taskId}/share`)}`
		
		try {
			if (navigator.clipboard && navigator.clipboard.writeText) {
				await navigator.clipboard.writeText(shareUrl)
			} else {
				const textArea = document.createElement('textarea')
				textArea.value = shareUrl
				textArea.style.position = 'fixed'
				textArea.style.left = '-9999px'
				document.body.appendChild(textArea)
				textArea.select()
				document.execCommand('copy')
				document.body.removeChild(textArea)
			}
			
			setCopied(true)
			toast({
				title: "分享链接已复制",
				description: "链接已复制到剪贴板，可发送给他人查看",
			})
			setTimeout(() => setCopied(false), 2000)
		} catch (err) {
			console.error('复制失败:', err)
			toast({
				title: "复制失败",
				description: "请手动复制链接",
				variant: "destructive",
			})
		}
	}

	return (
		<Button
			size="sm"
			variant="outline"
			className="gap-1.5"
			onClick={handleShare}
		>
			{copied ? (
				<CheckIcon className="h-4 w-4 text-green-500" />
			) : (
				<Share2Icon className="h-4 w-4" />
			)}
			<span className="hidden sm:inline">{copied ? "已复制" : "分享"}</span>
		</Button>
	)
}

/**
 * 分享/导出按钮组件
 * 
 * 仅在报告详情页面显示，包含复制链接和导出报告功能
 */
function ShareExportButton() {
	const [copied, setCopied] = useState(false)
	const isExporting = useStore($isExporting)
	const { toast } = useToast()

	const handleCopyLink = async (e: React.MouseEvent) => {
		e.preventDefault()
		e.stopPropagation()
		try {
			if (navigator.clipboard && navigator.clipboard.writeText) {
				await navigator.clipboard.writeText(window.location.href)
			} else {
				const textArea = document.createElement('textarea')
				textArea.value = window.location.href
				textArea.style.position = 'fixed'
				textArea.style.left = '-9999px'
				document.body.appendChild(textArea)
				textArea.select()
				document.execCommand('copy')
				document.body.removeChild(textArea)
			}
			
			setCopied(true)
			toast({
				title: "已复制",
				description: "链接已复制到剪贴板",
			})
			setTimeout(() => setCopied(false), 2000)
		} catch (err) {
			console.error('复制失败:', err)
			toast({
				title: "复制失败",
				description: "请手动复制链接",
				variant: "destructive",
			})
		}
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					size="sm"
					className="bg-green-500 hover:bg-green-600 text-white gap-1.5"
					disabled={isExporting}
				>
					{isExporting ? (
						<LoaderIcon className="h-4 w-4 animate-spin" />
					) : (
						<Share2Icon className="h-4 w-4" />
					)}
					{isExporting ? '导出中...' : '分享'}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-0">
				<DropdownMenuItem onClick={handleCopyLink}>
					{copied ? (
						<CheckIcon className="h-4 w-4 mr-2 text-green-500" />
					) : (
						<LinkIcon className="h-4 w-4 mr-2" />
					)}
					复制链接
				</DropdownMenuItem>
				<DropdownMenuItem 
					disabled 
					className="opacity-50 cursor-not-allowed"
					title="功能开发中，敬请期待"
				>
					<FileImageIcon className="h-4 w-4 mr-2" />
					导出图片
					<span className="ml-2 text-xs text-muted-foreground">(开发中)</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

/**
 * 报告切换器组件
 * 
 * 显示所有报告列表，点击可快速切换到其他报告
 */
function ReportSwitcher({ currentReportId }: { currentReportId?: string }) {
	const [reports, setReports] = useState<ReportRecord[]>([])
	const [loading, setLoading] = useState(false)
	const [open, setOpen] = useState(false)
	const { toast } = useToast()

	// 加载报告列表
	const loadReports = async () => {
		if (loading || reports.length > 0) return // 避免重复加载
		
		setLoading(true)
		try {
			const allReports = await getAllReports()
			setReports(allReports)
		} catch (error: any) {
			console.error('加载报告列表失败:', error)
			toast({
				title: "加载失败",
				description: error.message || "无法加载报告列表",
				variant: "destructive",
			})
		} finally {
			setLoading(false)
		}
	}

	// 当下拉菜单打开时加载报告列表
	const handleOpenChange = (newOpen: boolean) => {
		setOpen(newOpen)
		if (newOpen) {
			loadReports()
		}
	}

	// 切换到指定报告
	const handleSwitchReport = (reportId: string) => {
		if (reportId === currentReportId) {
			setOpen(false)
			return
		}
		navigate(`/report/${reportId}`)
		setOpen(false)
	}

	return (
		<DropdownMenu open={open} onOpenChange={handleOpenChange}>
			<DropdownMenuTrigger asChild>
				<Button
					size="sm"
					variant="outline"
					className="gap-1.5 me-2"
				>
					<ListIcon className="h-4 w-4" />
					<span className="hidden sm:inline">切换报告</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-72 max-h-[400px] overflow-y-auto">
				<DropdownMenuLabel className="flex items-center justify-between">
					<span>报告列表</span>
					{loading && <LoaderIcon className="h-3 w-3 animate-spin" />}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				
				{loading && reports.length === 0 ? (
					<div className="px-2 py-4 text-center text-sm text-muted-foreground">
						加载中...
					</div>
				) : reports.length === 0 ? (
					<div className="px-2 py-4 text-center text-sm text-muted-foreground">
						暂无报告
					</div>
				) : (
					reports.map((report) => {
						const isCurrent = report.id === currentReportId
						return (
							<DropdownMenuItem
								key={report.id}
								onClick={() => handleSwitchReport(report.id)}
								className={isCurrent ? 'bg-accent' : ''}
							>
								<FileTextIcon className="h-4 w-4 mr-2" />
								<div className="flex-1 min-w-0">
									<div className="truncate font-medium">
										{report.name}
										{isCurrent && (
											<span className="ml-2 text-xs text-muted-foreground">(当前)</span>
										)}
									</div>
									<div className="text-xs text-muted-foreground truncate">
										{report.id}
									</div>
								</div>
							</DropdownMenuItem>
						)
					})
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

/**
 * 任务切换器组件
 * 
 * 显示所有任务列表，点击可快速切换到其他任务
 */
function TaskSwitcher({ currentTaskId }: { currentTaskId?: string }) {
	const [tasks, setTasks] = useState<TaskRecord[]>([])
	const [loading, setLoading] = useState(false)
	const [open, setOpen] = useState(false)
	const [createDialogOpen, setCreateDialogOpen] = useState(false)
	const { toast } = useToast()

	// 加载任务列表
	const loadTasks = async () => {
		if (loading || tasks.length > 0) return // 避免重复加载
		
		setLoading(true)
		try {
			const allTasks = await getAllTasks()
			setTasks(allTasks)
		} catch (error: any) {
			console.error('加载任务列表失败:', error)
			toast({
				title: "加载失败",
				description: error.message || "无法加载任务列表",
				variant: "destructive",
			})
		} finally {
			setLoading(false)
		}
	}

	// 当下拉菜单打开时加载任务列表
	const handleOpenChange = (newOpen: boolean) => {
		setOpen(newOpen)
		if (newOpen) {
			loadTasks()
		}
	}

	// 切换到指定任务
	const handleSwitchTask = (taskId: string) => {
		if (taskId === currentTaskId) {
			setOpen(false)
			return
		}
		navigate(`/task/${taskId}`)
		setOpen(false)
	}

	// 新建任务
	const handleCreateTask = () => {
		setOpen(false)
		setCreateDialogOpen(true)
	}

	// 新建任务成功后跳转到新任务
	const handleCreateSuccess = (task: TaskRecord) => {
		navigate(`/task/${task.id}`)
	}

	return (
		<>
		<DropdownMenu open={open} onOpenChange={handleOpenChange}>
			<DropdownMenuTrigger asChild>
				<Button
					size="sm"
					variant="outline"
					className="gap-1.5 me-2"
				>
					<ClipboardListIcon className="h-4 w-4" />
					<span className="hidden sm:inline">切换任务</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-72 max-h-[400px] overflow-y-auto">
				<DropdownMenuLabel className="flex items-center justify-between">
					<span>切换任务</span>
					<div className="flex items-center gap-2">
						{loading && <LoaderIcon className="h-3 w-3 animate-spin" />}
						<Button
							variant="ghost"
							size="sm"
							className="h-6 px-2"
							onClick={handleCreateTask}
						>
							<PlusIcon className="h-3 w-3 mr-1" />
							新建
						</Button>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				
				{loading && tasks.length === 0 ? (
					<div className="px-2 py-4 text-center text-sm text-muted-foreground">
						加载中...
					</div>
				) : tasks.length === 0 ? (
					<div className="px-2 py-4 text-center text-sm text-muted-foreground">
						暂无任务
					</div>
				) : (
					tasks.map((task) => {
						const isCurrent = task.id === currentTaskId
						return (
							<DropdownMenuItem
								key={task.id}
								onClick={() => handleSwitchTask(task.id)}
								className={isCurrent ? 'bg-accent' : ''}
							>
								<FileTextIcon className="h-4 w-4 mr-2" />
								<div className="flex-1 min-w-0">
									<div className="truncate font-medium">
										{task.name}
										{isCurrent && (
											<span className="ml-2 text-xs text-muted-foreground">(当前)</span>
										)}
									</div>
								</div>
							</DropdownMenuItem>
						)
					})
				)}
			</DropdownMenuContent>
		</DropdownMenu>

		{/* 新建任务对话框 */}
		<CreateTaskDialog
			open={createDialogOpen}
			onOpenChange={setCreateDialogOpen}
			onSuccess={handleCreateSuccess}
		/>
		</>
	)
}
