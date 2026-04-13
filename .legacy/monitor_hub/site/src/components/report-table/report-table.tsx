/**
 * ============================================
 * 测试报告表格 - 主组件文件
 * ============================================
 * 
 * 这个文件定义了测试报告表格的主要组件和逻辑
 * 
 * 功能：
 * 1. 表格视图（仅支持表格，不支持网格视图）
 * 2. 搜索过滤（全局搜索）
 * 3. 排序（点击列头排序）
 * 4. 分页（前后翻页、跳转页、设置每页数量）
 * 5. 列可见性控制（显示/隐藏某些列）
 * 
 * 与数据源表格的区别：
 * - 不支持网格视图（只有表格视图）
 * - 使用后端分页（而非前端分页）
 * - 每次刷新从后端获取最新数据
 */

// ============================================
// 导入依赖
// ============================================

// React Table 核心库
import {
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	useReactTable,
	type VisibilityState,
} from "@tanstack/react-table"

// Lucide React 图标库
import {
	EyeIcon,
	Settings2Icon,
	FilterIcon,
	SendIcon,
} from "lucide-react"

// React Hooks
import { memo, useEffect, useMemo, useState } from "react"

// UI 组件
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Pagination } from "@/components/ui/pagination"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

// 工具函数
import { useBrowserStorage } from "@/lib/utils"

// 列定义
import { ReportColumns } from "./report-table-columns"

// 高级筛选对话框
import { AdvancedFilterDialog } from "./advanced-filter-dialog"

// API
import { listReports, type ReportRecord } from "@/apis/report"

// 路由导航
import { navigate } from "@/components/router"

// ============================================
// 类型定义
// ============================================

// ============================================
// 主组件：测试报告表格
// ============================================

/**
 * ReportTable - 测试报告表格主组件
 * 
 * 这是一个完整的数据表格组件，包含：
 * - 搜索功能
 * - 排序功能
 * - 分页功能（后端分页）
 * - 列可见性控制
 * - 自动加载数据
 */
export default memo(function ReportTable() {
	// ============================================
	// 状态管理
	// ============================================
	
	/** 全局搜索过滤的关键词 */
	const [filter, setFilter] = useState<string>()
	
	/** 列可见性状态（持久化到 sessionStorage） */
	const [columnVisibility, setColumnVisibility] = useBrowserStorage<VisibilityState>(
		"report-table-column-visibility",
		{},
		sessionStorage
	)
	
	/** 报告数据列表 */
	const [data, setData] = useState<ReportRecord[]>([])
	
	/** 加载状态 */
	const [loading, setLoading] = useState(true)
	
	/** 错误信息 */
	const [error, setError] = useState<string | null>(null)
	
	/** 分页状态 */
	const [page, setPage] = useState(1)
	const [pageSize, setPageSize] = useState(5)
	const [total, setTotal] = useState(0)
	
	/** 高级筛选状态 */
	const [advancedFilter, setAdvancedFilter] = useState<string>("")
	const [filterDialogOpen, setFilterDialogOpen] = useState(false)
	
	/** 筛选已发布报告 */
	const [releaseOnly, setReleaseOnly] = useState(false)
	
	// ============================================
	// 计算属性
	// ============================================
	
	/** 总页数 */
	const totalPages = useMemo(() => {
		return Math.ceil(total / pageSize)
	}, [total, pageSize])
	
	// ============================================
	// 数据加载
	// ============================================
	
	/** 加载报告列表 */
	const fetchReports = useMemo(() => {
		return async () => {
			try {
				setLoading(true)
				setError(null)
				
				// 构建查询条件
				let queryObj: Record<string, any> = {}
				
				// 解析高级筛选
				if (advancedFilter) {
					try {
						queryObj = JSON.parse(advancedFilter)
					} catch {
						// 解析失败则忽略
					}
				}
				
				// 添加发布筛选
				if (releaseOnly) {
					queryObj.release = true
				}
				
				const queryStr = Object.keys(queryObj).length > 0 ? JSON.stringify(queryObj) : undefined
				
				// 调用 API 获取数据（带分页参数和筛选）
				const result = await listReports({
					page,
					page_size: pageSize,
					query: queryStr,
				})
				
				setData(result.list)
				setTotal(result.total)
				
			} catch (err) {
				console.error("获取报告列表失败:", err)
				setError(err instanceof Error ? err.message : "获取数据失败")
				setData([])
				setTotal(0)
			} finally {
				setLoading(false)
			}
		}
	}, [page, pageSize, advancedFilter, releaseOnly])
	
	/** 初始加载数据 */
	useEffect(() => {
		fetchReports()
	}, [fetchReports])
	
	/** 监听全局刷新事件 */
	useEffect(() => {
		const handleRefresh = () => {
			fetchReports()
		}
		
		window.addEventListener('report-changed', handleRefresh)
		
		return () => {
			window.removeEventListener('report-changed', handleRefresh)
		}
	}, [fetchReports])
	
	// ============================================
	// 表格配置
	// ============================================
	
	/** 定义列配置（带 onRefresh 回调） */
	const columns = useMemo(() => ReportColumns(fetchReports), [fetchReports])
	
	/** 初始化 React Table 实例 */
	const table = useReactTable({
		data,
		columns,
		state: {
			columnVisibility,
			globalFilter: filter,
		},
		onColumnVisibilityChange: (updaterOrValue) => {
			setColumnVisibility(
				typeof updaterOrValue === "function"
					? updaterOrValue(columnVisibility)
					: updaterOrValue
			)
		},
		onGlobalFilterChange: setFilter,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		// 禁用自动排序重置
		autoResetPageIndex: false,
		// 手动分页（由后端控制）
		manualPagination: true,
		pageCount: totalPages,
	})
	
	// ============================================
	// 事件处理
	// ============================================
	
	/** 处理页码变化 */
	const handlePageChange = (newPage: number) => {
		setPage(newPage)
	}
	
	/** 处理每页数量变化 */
	const handlePageSizeChange = (newSize: number) => {
		setPageSize(newSize)
		setPage(1)  // 重置到第一页
	}
	
	// ============================================
	// 渲染
	// ============================================
	
	return (
		<>
			{/* 高级筛选对话框 */}
			<AdvancedFilterDialog
				open={filterDialogOpen}
				onOpenChange={setFilterDialogOpen}
				onApply={(query) => {
					setAdvancedFilter(query)
					setPage(1)  // 重置到第一页
				}}
				initialQuery={advancedFilter}
			/>
			
			<Card>
			{/* 表头：标题 + 搜索 + 视图设置 */}
			<CardHeader className="pb-4.5 px-2 sm:px-6 max-sm:pt-5 max-sm:pb-1">
				<div className="grid md:flex gap-5 w-full items-end">
					{/* 左侧：标题和描述 */}
					<div className="px-2 sm:px-1">
						<CardTitle className="mb-2">数据快照</CardTitle>
						<CardDescription>点击查看测试报告或数据快照</CardDescription>
					</div>

				{/* 右侧：搜索框 + 高级筛选 + 视图设置按钮 */}
				<div className="flex gap-2 ms-auto w-full md:w-auto">
					{/* 搜索框 */}
					<Input
						placeholder="搜索当前页报告..."
						value={filter ?? ""}
						onChange={(event) => setFilter(event.target.value)}
						className="px-4 md:w-64"
					/>

					{/* 筛选发布报告按钮 */}
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button 
									variant={releaseOnly ? "default" : "outline"}
									size="icon"
									className="w-10"
									onClick={() => {
										setReleaseOnly(!releaseOnly)
										setPage(1)  // 重置到第一页
									}}
								>
									<SendIcon className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								{releaseOnly ? "显示所有报告" : "筛选已发布报告"}
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
					
					{/* 高级筛选按钮 */}
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button 
									variant="outline" 
									size="icon" 
									className="w-10"
									onClick={() => setFilterDialogOpen(true)}
								>
									<FilterIcon className={advancedFilter ? "size-4 text-primary" : "size-4"} />
								</Button>
							</TooltipTrigger>
							<TooltipContent>高级筛选</TooltipContent>
						</Tooltip>
					</TooltipProvider>

					{/* 视图设置下拉菜单 */}
					<DropdownMenu>
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<DropdownMenuTrigger asChild>
										<Button variant="outline" size="icon" className="w-10">
											<Settings2Icon className="size-4" />
										</Button>
									</DropdownMenuTrigger>
								</TooltipTrigger>
								<TooltipContent>显示列设置</TooltipContent>
							</Tooltip>
						</TooltipProvider>
						<DropdownMenuContent align="end" className="w-40">
							<DropdownMenuLabel className="flex items-center gap-2">
								<EyeIcon className="size-4" />
								显示列
							</DropdownMenuLabel>
							<DropdownMenuSeparator />
							{table
								.getAllColumns()
								.filter((column) => column.getCanHide())
								.map((column) => {
									return (
										<DropdownMenuCheckboxItem
											key={column.id}
											className="capitalize"
											checked={column.getIsVisible()}
											onCheckedChange={(value) => column.toggleVisibility(!!value)}
										>
											{/* @ts-ignore */}
											{column.columnDef.name?.() ?? column.id}
										</DropdownMenuCheckboxItem>
									)
								})}
						</DropdownMenuContent>
					</DropdownMenu>
					</div>
				</div>
			</CardHeader>
			
			<CardContent className="space-y-4">
				{/* 错误提示 */}
				{error && (
					<div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm text-destructive">
						<strong>⚠️ 获取数据失败：</strong> {error}
					</div>
				)}
				
				{/* 表格 */}
				<div className="rounded-md border">
					<Table>
						{/* 表头 */}
						<TableHeader>
							{table.getHeaderGroups().map((headerGroup) => (
								<TableRow key={headerGroup.id}>
									{headerGroup.headers.map((header) => {
										return (
											<TableHead key={header.id} className="text-center">
												{header.isPlaceholder
													? null
													: flexRender(header.column.columnDef.header, header.getContext())}
											</TableHead>
										)
									})}
								</TableRow>
							))}
						</TableHeader>
						
						{/* 表体 */}
						<TableBody>
							{loading ? (
								<TableRow>
									<TableCell
										colSpan={columns.length}
										className="h-24 text-center text-muted-foreground"
									>
										加载中...
									</TableCell>
								</TableRow>
							) : table.getRowModel().rows?.length ? (
								table.getRowModel().rows.map((row) => (
									<TableRow
										key={row.id}
										data-state={row.getIsSelected() && "selected"}
										className="cursor-pointer hover:bg-muted/50"
										onClick={(e) => {
											// 如果点击的是操作按钮区域，不触发跳转
											const target = e.target as HTMLElement
											if (target.closest('button') || target.closest('[role="button"]')) {
												return
											}
											// 在新标签页打开报告详情页
											// Ctrl/Cmd + 点击则在当前页打开
											const url = `/report/${row.original.id}`
											if (e.ctrlKey || e.metaKey) {
												navigate(url)
											} else {
												window.open(url, '_blank')
											}
										}}
									>
										{row.getVisibleCells().map((cell) => (
											<TableCell key={cell.id} className="text-center">
												{flexRender(cell.column.columnDef.cell, cell.getContext())}
											</TableCell>
										))}
									</TableRow>
								))
							) : (
								<TableRow>
									<TableCell
										colSpan={columns.length}
										className="h-24 text-center text-muted-foreground"
									>
										暂无报告数据
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
				
				{/* 分页控件 */}
				{!loading && total > 0 && (
					<Pagination
						currentPage={page}
						totalPages={totalPages}
						pageSize={pageSize}
						total={total}
						onPageChange={handlePageChange}
						onPageSizeChange={handlePageSizeChange}
					/>
				)}
			</CardContent>
		</Card>
		</>
	)
})

// 导出类型
export type { ReportRecord }

