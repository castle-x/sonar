/**
 * ============================================
 * 数据源表格 - 列定义文件
 * ============================================
 * 
 * 这个文件定义了数据源表格的所有列（列配置）
 * 包括：每列的显示方式、排序规则、过滤规则、操作按钮等
 * 
 * 主要导出：
 * 1. DatasourceColumns() - 返回所有列的配置数组
 * 2. ActionsButton - 每行的操作按钮组件（编辑/删除等）
 * 
 * 保留的列：
 * - 名称 (name)
 * - 类型 (type) 
 * - URL (url)
 * - 描述 (description)
 * - 创建时间 (created)
 * - 操作按钮 (actions)
 */

// ============================================
// 导入依赖
// ============================================

// React Table 的类型定义
// ColumnDef: 列定义的 TypeScript 类型
// HeaderContext: 表头上下文，包含列的信息
import type { ColumnDef, HeaderContext } from "@tanstack/react-table"

// Lucide React 图标库
import {
	AlignLeftIcon,        // 对齐图标，用于描述列
	ArrowUpDownIcon,      // 上下箭头，用于排序按钮
	CalendarIcon,         // 日历图标，用于创建时间列
	SquirrelIcon,         // 井号图标，用于项目ID列
	LinkIcon,             // 链接图标，用于数据源地址列
	MoreHorizontalIcon,   // 三个点（⋯），用于操作菜单
	PenBoxIcon,           // 编辑图标
	Trash2Icon,           // 删除图标
	FoldersIcon,          // 文件夹图标，用于分组列
} from "lucide-react"

// ============================================
// 状态颜色映射
// ============================================
const STATUS_COLORS = {
	healthy: "bg-green-500",
	degraded: "bg-yellow-500",
	down: "bg-red-500",
} as const

// React Hooks
import { memo, useMemo, useState } from "react"

// UI 组件
import { Button, buttonVariants } from "@/components/ui/button"
import {
	AlertDialog,              // 确认对话框容器
	AlertDialogAction,        // 确认按钮
	AlertDialogCancel,        // 取消按钮
	AlertDialogContent,       // 对话框内容区
	AlertDialogDescription,   // 对话框描述文本
	AlertDialogFooter,        // 对话框底部按钮区
	AlertDialogHeader,        // 对话框头部
	AlertDialogTitle,         // 对话框标题
} from "@/components/ui/alert-dialog"
import {
	DropdownMenu,             // 下拉菜单容器
	DropdownMenuContent,      // 菜单内容区
	DropdownMenuItem,         // 菜单项
	DropdownMenuSeparator,    // 菜单分隔线
	DropdownMenuTrigger,      // 触发菜单的按钮
} from "@/components/ui/dropdown-menu"
import { Dialog } from "@/components/ui/dialog"

// 工具函数
import { cn } from "@/lib/utils"
// cn: 合并 Tailwind CSS 类名的工具函数

// 编辑数据源的对话框组件
import { DatasourceDialog } from "@/components/add-datasource"

// 数据源记录的类型定义（从主表格文件导入）
import type { DatasourceRecord } from "./datasource-table"

// API 方法
import { deleteDatasource } from "@/apis/datasource"

// Toast 提示组件
import { useToast } from "@/components/ui/use-toast"

// ============================================
// 主函数：定义所有列的配置
// ============================================

/**
 * DatasourceColumns - 数据源表格的列定义函数
 * 
 * 返回一个数组，每个元素定义一列的配置，包括：
 * - 如何显示（cell）
 * - 如何排序（sortingFn）
 * - 如何过滤（filterFn）
 * - 列宽度（size）
 * - 是否可隐藏（enableHiding）
 * 
 * @param onRefresh - 刷新数据的回调函数（传递给 ActionsButton）
 * @returns 列定义数组
 */
export function DatasourceColumns(onRefresh?: () => void): ColumnDef<DatasourceRecord>[] {
	return [
		// ============================================
		// 第 1 列：名称列
		// ============================================
		{
			// --- 列的基本标识 ---
			id: "name",                 // 列的唯一 ID，用于排序、过滤等操作
			accessorKey: "name",        // 从数据源对象中取哪个字段 (datasource.name)
			name: () => "数据源",         // 列的显示名称（函数形式，方便后续国际化）
			
			// --- 列的尺寸设置 ---
			size: 150,                  // 列的默认宽度（150px）
			minSize: 0,                 // 列的最小宽度（0 = 可以完全隐藏）
			
			// --- 排序配置 ---
			sortingFn: (a, b) => {
				// 自定义排序函数：按字母顺序排序（支持中文）
				// a, b 是两行数据的包装对象
				// a.original 是实际的数据对象 (DatasourceRecord)
				return a.original.name.localeCompare(b.original.name)
				// localeCompare: 字符串比较函数，支持中文拼音排序
				// 返回 < 0: a 在 b 前面
				// 返回 > 0: a 在 b 后面
			},
			invertSorting: false,       // 不反转排序方向（默认升序 A→Z）
			
			// --- 过滤配置 ---
			filterFn: (row, _, filterValue) => {
				// 自定义过滤函数：不区分大小写的模糊搜索
				// row: 当前行数据
				// filterValue: 用户在搜索框输入的文字
				const name = row.original.name.toLowerCase()  // 转小写
				return name.includes(filterValue.toLowerCase())  // 检查是否包含搜索词
				// 例如：用户输入 "prom"，可以匹配 "Prometheus"
			},
			
			// --- 可见性配置 ---
			enableHiding: false,        // 不允许隐藏此列（名称列是核心信息，必须显示）
			
			// --- 单元格渲染 ---
			cell: (info) => {
				// 定义单元格内容如何显示
				// info: 包含当前单元格的所有信息
				// info.row.original: 当前行的完整数据 (DatasourceRecord)
				// info.getValue(): 获取当前单元格的值（这里是 name）
				
				const { name, status } = info.row.original  // 解构获取名称和状态
				// 获取状态对应的颜色类名
				const statusColor = STATUS_COLORS[status as keyof typeof STATUS_COLORS] || "bg-gray-500"
			
			// 状态样式配置（背景色 + 文字颜色）
			const statusStyles = {
				healthy: "bg-green-500/10 text-green-700 dark:text-green-400",
				degraded: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
				down: "bg-red-500/10 text-red-700 dark:text-red-400",
			}[status as keyof typeof STATUS_COLORS] || "bg-gray-500/10 text-gray-700 dark:text-gray-400"
				
				return (
				<div className="flex items-center justify-center">
					<div className={cn(
						"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full",
						statusStyles
					)}>
						{/* 状态指示器（彩色小圆点） */}
						<span className={cn("inline-block size-2 rounded-full shrink-0", statusColor)} />
						{/* 名称文字（超长时截断显示...） */}
						<span className="truncate text-xs font-medium">{name}</span>
					</div>
				</div>
				)
			},
			
			// --- 表头渲染 ---
			header: sortableHeader,     // 使用自定义的可排序表头（见下面的函数定义）
		},
		
		// ============================================
		// 第 2 列：项目ID列
		// ============================================
		{
			id: "app_id",               // 列 ID
			accessorKey: "app_id",        // 从 datasource.app_id 取值
			name: () => "项目ID",         // 列名
			size: 100,                  // 列宽 100px
			
			// --- 网格视图配置 ---
			Icon: SquirrelIcon,             // 在表头和网格视图中显示的图标
			
			// --- 单元格渲染 ---
			cell: (info) => {
				// 简单显示文字，居中对齐
				return <span className="text-sm flex items-center justify-center">{info.getValue() as string}</span>
			},
			
			header: sortableHeader,     // 可排序表头
		},
		
		// ============================================
		// 第 3 列：数据源地址列表
		// ============================================
		{
			id: "pushgateway_addr_list",        // 列 ID（修正拼写错误）
			accessorKey: "pushgateway_addr_list",  // 从 datasource.pushgateway_addr_list 取值
			name: () => "数据源地址",            // 列名
			size: 250,                          // 列宽 250px（地址列表可能较长）
			
			// --- 网格视图配置 ---
			Icon: LinkIcon,                     // 在表头和网格视图中显示的图标
			
			// --- 单元格渲染 ---
			cell: (info) => {
				// pushgateway_addr_list 是一个字符串数组
				const addrList = info.getValue() as string[]
				
				// 如果没有地址，显示占位符，居中对齐
				if (!addrList || addrList.length === 0) {
					return <span className="text-sm text-muted-foreground/50 flex items-center justify-center">-</span>
				}
				
				// 如果只有 1 个地址，直接显示，居中对齐
				if (addrList.length === 1) {
					return (
						<span 
							className="text-sm text-muted-foreground truncate max-w-xs flex items-center justify-center" 
							title={addrList[0]}  // 鼠标悬停显示完整地址
						>
							{addrList[0]}
						</span>
					)
				}
				
				// 如果有多个地址，显示第一个 + 数量提示，居中对齐
				return (
					<div className="flex flex-col gap-0.5 items-center justify-center">
						<span 
							className="text-sm text-muted-foreground truncate max-w-xs" 
							title={addrList.join("\n")}  // 鼠标悬停显示所有地址
						>
							{addrList[0]}
						</span>
						{addrList.length > 1 && (
							<span className="text-xs text-muted-foreground/70">
								+{addrList.length - 1} 个地址
							</span>
						)}
					</div>
				)
			},
			
			header: sortableHeader,
		},
		
		// ============================================
		// 第 4 列：描述列
		// ============================================
		{
			id: "description",
			accessorKey: "description",
			name: () => "描述",
			size: 200,
			
			// --- 网格视图配置 ---
			Icon: AlignLeftIcon,        // 在表头和网格视图中显示的图标
			
			// --- 单元格渲染 ---
			cell: (info) => {
				const desc = info.getValue() as string | undefined
				
				// 如果有描述，显示描述（左对齐，超出截断）；否则显示 "-"
				return desc ? (
					<span 
						className="text-sm text-muted-foreground truncate block w-full text-left" 
						title={desc}
					>
						{desc}
					</span>
				) : (
					// 没有描述时显示占位符
					<span className="text-sm text-muted-foreground/50">-</span>
				)
			},
			
			header: sortableHeaderLeft,  // 使用左对齐表头
		},
		
		// ============================================
		// 第 5 列：指标分组列
		// ============================================
		{
			id: "groupmap",
			accessorKey: "groupmap",
			name: () => "指标分组",
			size: 120,
			
			// --- 网格视图配置 ---
			Icon: FoldersIcon,          // 在表头和网格视图中显示的图标
			
			// --- 单元格渲染 ---
			cell: (info) => {
				// 导入 MetricConfig 类型
				type MetricConfig = {
					name: string
					alias?: string
					description?: string
					unit?: string
					transform?: string
				}
				
				const groupmap = info.getValue() as Record<string, MetricConfig[]> | undefined
				
				// 如果没有分组，显示占位符
				if (!groupmap || Object.keys(groupmap).length === 0) {
					return <span className="text-sm text-muted-foreground/50 flex items-center justify-center">-</span>
				}
				
				// 显示分组数量和总指标数
				const groupCount = Object.keys(groupmap).length
				const metricCount = Object.values(groupmap).reduce((sum, metrics) => sum + metrics.length, 0)
				
				// 构建悬停提示文本，显示指标名称和别名
				const tooltip = Object.entries(groupmap)
					.map(([groupName, metrics]) => {
						const metricsText = metrics
							.map(m => m.alias ? `${m.name} (${m.alias})` : m.name)
							.join(", ")
						return `${groupName}: ${metricsText}`
					})
					.join("\n")
				
				return (
					<div 
						className="flex flex-col gap-0.5 items-center justify-center text-sm"
						title={tooltip}
					>
						<span className="text-muted-foreground">
							{groupCount} 个分组
						</span>
						<span className="text-xs text-muted-foreground/70">
							{metricCount} 个指标
						</span>
					</div>
				)
			},
			
			header: sortableHeader,
		},
		
		// ============================================
		// 第 6 列：创建时间列
		// ============================================
		{
			id: "createdAt",
			accessorKey: "createdAt",
			name: () => "创建时间",
			size: 150,
			
			// --- 网格视图配置 ---
			Icon: CalendarIcon,         // 在表头和网格视图中显示的图标
			
			// --- 单元格渲染 ---
			cell: (info) => {
				// 将 ISO 时间字符串转换为本地化时间显示，居中对齐
				const date = new Date(info.getValue() as string)
				return (
					// tabular-nums: 让数字等宽，方便对齐
					<span className="text-sm tabular-nums flex items-center justify-center">
						{date.toLocaleString("zh-CN")}
						{/* 例如：2024/10/30 15:30:00 */}
					</span>
				)
			},
			
			header: sortableHeader,
		},
		
		// ============================================
		// 第 7 列：操作按钮列
		// ============================================
		{
			id: "actions",              // 列 ID
			// @ts-ignore - 忽略类型检查（name 不是标准属性）
			name: () => "操作",         // 列名
			size: 80,                   // 列宽 80px（只显示一个按钮）
			
		// --- 单元格渲染 ---
		cell: ({ row }) => {
			// 渲染操作按钮组件，居中对齐
			// row.original: 当前行的完整数据
			return (
				<div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
					<ActionsButton datasource={row.original} onRefresh={onRefresh} />
				</div>
			)
		},
			
			// 注意：操作列不需要 header（不可排序），会自动显示列名
		},
	] as ColumnDef<DatasourceRecord>[]  // 类型断言，确保返回正确的类型
}

// ============================================
// 辅助函数：可排序的表头
// ============================================

/**
 * sortableHeader - 创建可排序的表头组件
 * 
 * 这个函数返回一个按钮，点击时可以切换排序方向：
 * - 首次点击：升序 (A → Z)
 * - 再次点击：降序 (Z → A)
 * - 再次点击：取消排序
 * 
 * @param context - 表头上下文，包含列的信息
 * @returns 表头按钮组件
 */
function sortableHeader(context: HeaderContext<DatasourceRecord, unknown>) {
	const { column } = context  // 解构获取列对象
	
	// @ts-ignore - 从列定义中获取自定义属性
	const { Icon, name }: { Icon?: React.ElementType; name: () => string } = column.columnDef
	
	// 获取当前列的排序状态
	// 返回值: false (未排序) | "asc" (升序) | "desc" (降序)
	const isSorted = column.getIsSorted()
	
	return (
		<Button
			variant="ghost"          // 幽灵按钮（透明背景）
			className={cn(
				"h-9 px-3 flex items-center justify-center duration-50 w-full",  // 基础样式，居中对齐
				// 如果正在按此列排序，高亮显示
				isSorted && "bg-accent/70 light:bg-accent text-accent-foreground/90"
			)}
			onClick={() => {
				// 点击时切换排序方向
				// 如果当前是升序 (asc)，切换为降序 (desc)
				// 如果当前是降序或未排序，切换为升序
				column.toggleSorting(column.getIsSorted() === "asc")
			}}
		>
			{/* 如果列定义中有图标，显示图标 */}
			{Icon && <Icon className="me-2 size-4" />}
			
			{/* 列名 */}
			{name()}
			
			{/* 排序图标（上下箭头） */}
			<ArrowUpDownIcon className="ms-2 size-4" />
		</Button>
	)
}

/**
 * sortableHeaderLeft - 创建左对齐的可排序表头组件
 * 
 * 与 sortableHeader 相同，但内容左对齐
 */
function sortableHeaderLeft(context: HeaderContext<DatasourceRecord, unknown>) {
	const { column } = context
	
	// @ts-ignore
	const { Icon, name }: { Icon?: React.ElementType; name: () => string } = column.columnDef
	const isSorted = column.getIsSorted()
	
	return (
		<Button
			variant="ghost"
			className={cn(
				"h-9 px-3 flex items-center justify-start duration-50 w-full",  // 左对齐
				isSorted && "bg-accent/70 light:bg-accent text-accent-foreground/90"
			)}
			onClick={() => {
				column.toggleSorting(column.getIsSorted() === "asc")
			}}
		>
			{Icon && <Icon className="me-2 size-4" />}
			{name()}
			<ArrowUpDownIcon className="ms-2 size-4" />
		</Button>
	)
}

// ============================================
// 组件：操作按钮（编辑/删除）
// ============================================

/**
 * ActionsButton - 数据源操作按钮组件
 * 
 * 显示一个"三个点"按钮，点击后弹出菜单，包含：
 * - 编辑：打开编辑对话框
 * - 复制名称：复制数据源名称到剪贴板
 * - 删除：打开删除确认对话框
 * 
 * 使用 memo 优化：只有 datasource 变化时才重新渲染
 * 
 * @param datasource - 当前行的数据源数据
 */
export const ActionsButton = memo(({ datasource, onRefresh }: { datasource: DatasourceRecord, onRefresh?: () => void }) => {
	// --- 状态管理 ---
	const [deleteOpen, setDeleteOpen] = useState(false)  // 删除对话框是否打开
	const [editOpen, setEditOpen] = useState(false)      // 编辑对话框是否打开
	const [loading, setLoading] = useState(false)        // 删除中状态
	const { name } = datasource                          // 解构获取数据源名称
	const { toast } = useToast()                         // Toast 提示
	
	// 使用 useMemo 缓存渲染结果，避免不必要的重新渲染
	// 依赖项：datasource, name, deleteOpen, editOpen
	// 只有这些值变化时，才重新渲染
	return useMemo(() => {
		return (
			<>
				{/* ============================================
				    下拉菜单：编辑/复制/删除
				    ============================================ */}
				<DropdownMenu>
					{/* 触发按钮："三个点"图标 */}
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="size-8">
							{/* sr-only: 屏幕阅读器可见，视觉上隐藏（无障碍） */}
							<span className="sr-only">打开菜单</span>
							<MoreHorizontalIcon className="w-5" />
						</Button>
					</DropdownMenuTrigger>
					
					{/* 菜单内容 */}
					<DropdownMenuContent align="end">  {/* align="end": 右对齐 */}
						{/* --- 编辑菜单项 --- */}
						<DropdownMenuItem onSelect={() => setEditOpen(true)}>
							<PenBoxIcon className="me-2.5 size-4" />
							编辑
						</DropdownMenuItem>
						
						{/* 分隔线 */}
						<DropdownMenuSeparator />
						
						{/* --- 删除菜单项 --- */}
						<DropdownMenuItem onSelect={() => setDeleteOpen(true)}>
							<Trash2Icon className="me-2.5 size-4" />
							删除
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>

				{/* ============================================
				    编辑对话框
				    ============================================ */}
				<Dialog open={editOpen} onOpenChange={setEditOpen}>
					{/* 只有在打开时才渲染对话框内容（性能优化） */}
					{editOpen && (
						<DatasourceDialog 
							setOpen={setEditOpen}      // 关闭对话框的函数
							datasource={datasource}    // 传递当前数据源数据（编辑模式）
							onSuccess={onRefresh}      // 编辑成功后刷新列表
						/>
					)}
				</Dialog>

				{/* ============================================
				    删除确认对话框
				    ============================================ */}
				<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
					<AlertDialogContent>
						{/* 对话框头部 */}
						<AlertDialogHeader>
							<AlertDialogTitle>确认删除 {name}？</AlertDialogTitle>
							<AlertDialogDescription>
								此操作无法撤销。将永久删除该数据源及其所有相关数据。
							</AlertDialogDescription>
						</AlertDialogHeader>
						
						{/* 对话框底部按钮 */}
						<AlertDialogFooter>
							{/* 取消按钮 */}
							<AlertDialogCancel>取消</AlertDialogCancel>
							
						{/* 确认删除按钮 */}
						<AlertDialogAction
							className={cn(buttonVariants({ variant: "destructive" }))}  // 危险样式（红色）
							disabled={loading}  // 删除中禁用按钮
							onClick={async () => {
								// ============================================
								// 删除逻辑
								// ============================================
								setLoading(true)
								
								try {
									// 调用后端 API 删除数据源
									await deleteDatasource(datasource.id)
									
									// 显示成功提示
									toast({
										title: "删除成功",
										description: `数据源 "${name}" 已删除`,
									})
									
							// 关闭对话框
							setDeleteOpen(false)
							
							// 刷新数据列表
							if (onRefresh) {
								onRefresh()
							}
							
							// 触发全局刷新事件
							window.dispatchEvent(new CustomEvent('datasource-changed'))
									
								} catch (error) {
									// 删除失败，显示错误提示
									console.error("删除数据源失败:", error)
									toast({
										title: "删除失败",
										description: error instanceof Error ? error.message : "未知错误",
										variant: "destructive",
									})
								} finally {
									setLoading(false)
								}
							}}
						>
							{loading ? "删除中..." : "继续"}
						</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</>
		)
	}, [datasource, name, deleteOpen, editOpen, loading, toast, onRefresh])  // 依赖项数组
	// 只有这些值变化时，useMemo 才重新计算
})
