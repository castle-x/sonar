/**
 * ============================================
 * 数据源表格 - 主组件文件
 * ============================================
 * 
 * 这个文件定义了数据源表格的主要组件和逻辑
 * 
 * 功能：
 * 1. 表格/网格视图切换
 * 2. 搜索过滤（全局搜索）
 * 3. 排序（点击列头排序）
 * 4. 列可见性控制（显示/隐藏某些列）
 * 5. 用户偏好持久化（使用 sessionStorage 保存）
 * 
 * 移除的功能（相比 Beszel 原版）：
 * - 告警功能
 * - 复杂的状态过滤
 * - 虚拟滚动（数据量不大时不需要）
 * - 国际化（使用纯中文）
 */

// ============================================
// 导入依赖
// ============================================

// React Table 核心库
import {
	type ColumnFiltersState,   // 列过滤状态的类型（暂未使用，保留接口）
	flexRender,                // 渲染表格单元格的函数
	getCoreRowModel,           // 获取核心行模型（基础功能）
	getFilteredRowModel,       // 获取过滤后的行模型
	getSortedRowModel,         // 获取排序后的行模型
	type Row,                  // 行的类型定义
	type SortingState,         // 排序状态的类型 (例如: [{ id: "name", desc: false }])
	type Table as TableType,   // 表格实例的类型（重命名为 TableType 避免与 UI 组件冲突）
	useReactTable,             // React Table 的核心 Hook
	type VisibilityState,      // 列可见性状态的类型 (例如: { description: false })
} from "@tanstack/react-table"

// Lucide React 图标库
import {
	ArrowDownIcon,      // 向下箭头（降序图标）
	ArrowUpDownIcon,    // 上下箭头（未排序图标）
	ArrowUpIcon,        // 向上箭头（升序图标）
	EyeIcon,            // 眼睛图标（列可见性）
	LayoutGridIcon,     // 网格图标（网格视图）
	LayoutListIcon,     // 列表图标（表格视图）
	Settings2Icon,      // 设置图标（视图设置按钮）
} from "lucide-react"

// React Hooks
import { memo, useMemo, useState } from "react"
import { getPagePath } from "@nanostores/router"
import { $router, navigate } from "../router"

// UI 组件
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,               // 下拉菜单容器
	DropdownMenuCheckboxItem,   // 带复选框的菜单项（用于列可见性）
	DropdownMenuContent,        // 菜单内容区
	DropdownMenuItem,           // 普通菜单项
	DropdownMenuLabel,          // 菜单标签（分组标题）
	DropdownMenuRadioGroup,     // 单选菜单组
	DropdownMenuRadioItem,      // 单选菜单项（用于视图切换）
	DropdownMenuSeparator,      // 菜单分隔线
	DropdownMenuTrigger,        // 触发菜单的按钮
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card"

// 工具函数
import { useBrowserStorage, cn } from "@/lib/utils"
// useBrowserStorage: 自定义 Hook，自动将状态同步到浏览器存储（localStorage/sessionStorage）
// cn: 合并 Tailwind CSS 类名的工具函数

// 列定义和操作按钮组件
import { ActionsButton, DatasourceColumns } from "./datasource-table-columns"

// ============================================
// 类型定义
// ============================================

/**
 * ViewMode - 视图模式类型
 * 
 * "table": 表格视图（传统的行列表格）
 * "grid": 网格视图（卡片式布局）
 */
type ViewMode = "table" | "grid"

// 状态颜色映射
const STATUS_COLORS = {
	healthy: "bg-green-500",
	degraded: "bg-yellow-500",
	down: "bg-red-500",
} as const

/**
 * MetricAggregation - 指标聚合配置
 * 
 * 对应后端 thrift 定义的 MetricAggregation 结构
 */
export interface MetricAggregation {
	metric_name: string  // 指标名称（必填，1-100 字符）
	agg_types: string[]  // 聚合类型列表（必填，至少 1 个）
}

/**
 * SummaryConfig - 汇总数据表格配置
 * 
 * 对应后端 thrift 定义的 SummaryConfig 结构
 */
export interface SummaryConfig {
	name: string                   // 表格名称（必填，1-100 字符）
	labels: string[]               // 表格左侧要展示的标签列表
	metrics: MetricAggregation[]   // 表格右侧要展示的指标及其聚合类型（按配置顺序排列）
}

/**
 * MetricConfig - 指标配置的数据结构
 * 
 * 对应后端 thrift 定义的 MetricConfig 结构
 */
export interface MetricConfig {
	name: string        // 指标名称（必填，1-100 字符）
	alias?: string      // 别名（可选，最大 100 字符）
	description?: string // 描述信息（可选，最大 500 字符）
	unit?: string       // 单位（可选，最大 20 字符）
	transform?: string  // 单位转换表达式（可选，最大 200 字符）
	chart_type?: 'area' | 'scatter' // 图表类型（可选）
}

/**
 * DatasourceRecord - 数据源记录的数据结构
 * 
 * 这是从后端 API 获取的数据源对象的类型定义
 * 对应后端 thrift 定义的 Datasource 结构
 */
export interface DatasourceRecord {
	id: string                               // 数据源唯一 ID
	status: string                           // 数据源状态
	name: string                             // 数据源名称（必填，1-100 字符）
	app_id: string                           // 项目标识（必填，1-50 字符）
	pushgateway_addr_list: string[]          // 数据源地址列表（必填，至少 1 个）
	description?: string                     // 数据源描述（可选，最大 500 字符）
	groupmap?: Record<string, MetricConfig[]> // 指标分组（可选），组名对应一组指标配置
	groupmap_sort_keys?: string[]            // groupmap 的排序键列表（可选），用于控制分组显示顺序
	summary_config?: SummaryConfig[]         // 汇总数据表格配置（可选），每个元素代表一张表
	icon_name?: string                       // 图标文件名（可选）
	createdAt: string                        // 创建时间（ISO 8601 格式字符串）
	updatedAt: string                        // 更新时间（ISO 8601 格式字符串）
}

/**
 * DatasourceTableProps - 表格组件的属性
 */
interface DatasourceTableProps {
	/** 数据源列表（从父组件传入） */
	data: DatasourceRecord[]
	/** 刷新数据的回调函数（编辑/删除后调用） */
	onRefresh?: () => void
}

// ============================================
// 主组件：数据源表格
// ============================================

/**
 * DatasourceTable - 数据源表格主组件
 * 
 * 这是一个完整的数据表格组件，包含：
 * - 搜索功能
 * - 排序功能
 * - 视图切换（表格/网格）
 * - 列可见性控制
 * - 用户偏好持久化
 * 
 * @param data - 数据源列表
 * @param onRefresh - 刷新数据的回调函数
 */
export default function DatasourceTable({ data, onRefresh }: DatasourceTableProps) {
	// ============================================
	// 状态管理
	// ============================================
	
	/**
	 * filter - 全局搜索过滤的关键词
	 * 用户在搜索框输入的文字
	 */
	const [filter, setFilter] = useState<string>()
	
	/**
	 * sorting - 排序状态
	 * 
	 * 格式: [{ id: "name", desc: false }]
	 * - id: 排序的列 ID
	 * - desc: 是否降序 (true: Z→A, false: A→Z)
	 * 
	 * 使用 useBrowserStorage 持久化到 sessionStorage
	 * 关闭标签页后清除，同一个会话中保留
	 */
	const [sorting, setSorting] = useBrowserStorage<SortingState>(
		"datasource-sort",               // 存储 key（会自动添加前缀 "monitor-hub-"）
		[{ id: "name", desc: false }],   // 默认值：按名称升序
		sessionStorage                   // 使用 sessionStorage（关闭标签页就清除）
	)
	
	/**
	 * columnFilters - 列过滤状态
	 * 
	 * 高级过滤功能（当前未使用，保留接口）
	 * 例如：[{ id: "type", value: "Prometheus" }] 只显示 Prometheus 类型
	 */
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
	
	/**
	 * columnVisibility - 列可见性状态
	 * 
	 * 格式: { description: false, url: true }
	 * - key: 列 ID
	 * - value: 是否显示 (true: 显示, false: 隐藏)
	 * 
	 * 使用 useBrowserStorage 持久化到 sessionStorage
	 */
	const [columnVisibility, setColumnVisibility] = useBrowserStorage<VisibilityState>(
		"datasource-cols",  // 存储 key
		{}                  // 默认值：空对象（所有列都显示）
	)
	
	/**
	 * viewMode - 视图模式
	 * 
	 * "table": 表格视图
	 * "grid": 网格视图（卡片）
	 * 
	 * 默认值：
	 * - 小屏（< 1024px）: grid（网格视图在移动端更友好）
	 * - 大屏（>= 1024px）: table（表格视图信息密度更高）
	 */
	const [viewMode, setViewMode] = useBrowserStorage<ViewMode>(
		"datasource-view",                                 // 存储 key
		window.innerWidth < 1024 ? "grid" : "table"       // 根据屏幕宽度选择默认视图
	)

	// ============================================
	// 列定义（缓存）
	// ============================================
	
	/**
	 * columnDefs - 表格的列定义
	 * 
	 * 从 DatasourceColumns() 函数获取所有列的配置
	 * 使用 useMemo 缓存结果，避免每次渲染都重新创建
	 * 
	 * 依赖项为空数组 []，表示只在组件挂载时计算一次
	 */
	const columnDefs = useMemo(() => DatasourceColumns(onRefresh), [onRefresh])

	// ============================================
	// React Table 实例
	// ============================================
	
	/**
	 * table - React Table 实例
	 * 
	 * 这是 React Table 的核心对象，提供了：
	 * - getRowModel(): 获取当前显示的行
	 * - getAllColumns(): 获取所有列
	 * - getHeaderGroups(): 获取表头分组
	 * - 等等...
	 */
	const table = useReactTable({
		// --- 基础配置 ---
		data,                         // 传入的数据源数组
		columns: columnDefs,          // 列定义
		
		// --- 核心功能 ---
		getCoreRowModel: getCoreRowModel(),  // 获取核心行模型（必需）
		
		// --- 排序功能 ---
		onSortingChange: (updaterOrValue) => {
			// 排序状态变化时的回调
			// updaterOrValue 可能是：
			// 1. 新值: [{ id: "type", desc: false }]
			// 2. 更新函数: (old) => [{ id: "type", desc: !old[0].desc }]
			
			// 包装 setSorting，支持函数式更新
			setSorting(
				typeof updaterOrValue === "function" 
					? updaterOrValue(sorting)  // 如果是函数，传入当前值，获取新值
					: updaterOrValue           // 如果是值，直接使用
			)
		},
		getSortedRowModel: getSortedRowModel(),  // 获取排序后的行模型
		
		// --- 过滤功能 ---
		onColumnFiltersChange: setColumnFilters,      // 列过滤变化回调
		getFilteredRowModel: getFilteredRowModel(),   // 获取过滤后的行模型
		
		// --- 全局搜索功能 ---
		onGlobalFilterChange: setFilter,  // 全局搜索框变化回调
		
		// --- 列可见性功能 ---
		onColumnVisibilityChange: (updaterOrValue) => {
			// 列可见性状态变化时的回调（同样支持函数式更新）
			setColumnVisibility(
				typeof updaterOrValue === "function" 
					? updaterOrValue(columnVisibility)
					: updaterOrValue
			)
		},
		
		// --- 状态管理 ---
		state: {
			sorting,              // 当前排序状态
			columnFilters,        // 当前列过滤状态
			columnVisibility,     // 当前列可见性状态
			globalFilter: filter, // 当前全局搜索关键词
		},
		
		// --- 默认列配置 ---
		defaultColumn: {
			invertSorting: true,     // 反转排序方向（点击升序→降序→无排序，而不是升序→降序→升序）
			sortUndefined: "last",   // 未定义的值排在最后
			minSize: 0,              // 最小列宽
			size: 900,               // 默认列宽
			maxSize: 900,            // 最大列宽
		},
	})

	// ============================================
	// 派生状态（从 table 实例获取）
	// ============================================
	
	const rows = table.getRowModel().rows              // 当前显示的所有行（已排序、已过滤）
	const columns = table.getAllColumns()              // 所有列
	const visibleColumns = table.getVisibleLeafColumns()  // 当前可见的列（排除隐藏的列）

	// ============================================
	// 渲染 UI
	// ============================================
	
	return (
		<Card>
			{/* ============================================
			    表头：标题 + 搜索 + 视图设置
			    ============================================ */}
			<CardHeader className="pb-4.5 px-2 sm:px-6 max-sm:pt-5 max-sm:pb-1">
				<div className="grid md:flex gap-5 w-full items-end">
					{/* 左侧：标题和描述 */}
					<div className="px-2 sm:px-1">
						<CardTitle className="mb-2">实时监控</CardTitle>
						<CardDescription>点击查看实时监控数据</CardDescription>
					</div>

					{/* 右侧：搜索框 + 视图设置按钮 */}
					<div className="flex gap-2 ms-auto w-full md:w-80">
						{/* ============================================
						    搜索框
						    ============================================ */}
						<Input 
							placeholder="搜索..." 
							onChange={(e) => setFilter(e.target.value)}  // 用户输入时更新 filter
							className="px-4" 
						/>

						{/* ============================================
						    视图设置下拉菜单
						    ============================================ */}
						<DropdownMenu>
							{/* 触发按钮："设置"图标 + "视图"文字 */}
						<DropdownMenuTrigger asChild>
							<Button variant="outline" size="icon" className="w-10">
								<Settings2Icon className="size-4" />
							</Button>
						</DropdownMenuTrigger>
							
							{/* 菜单内容：分为 3 列 */}
							<DropdownMenuContent align="end" className="min-w-48 md:min-w-auto">
								<div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-s md:divide-y-0">
									{/* ============================================
									    第 1 列：布局切换（表格 / 网格）
									    ============================================ */}
									<div className="border-r">
										{/* 列标题 */}
										<DropdownMenuLabel className="pt-2 px-3.5 flex items-center gap-2">
											<LayoutGridIcon className="size-4" />
											布局
										</DropdownMenuLabel>
										<DropdownMenuSeparator />
										
										{/* 单选组：表格 or 网格 */}
										<DropdownMenuRadioGroup
											className="px-1 pb-1"
											value={viewMode}  // 当前选中的值
											onValueChange={(view) => setViewMode(view as ViewMode)}  // 切换视图
										>
											{/* 表格视图选项 */}
											<DropdownMenuRadioItem 
												value="table" 
												onSelect={(e) => e.preventDefault()}  // 阻止默认行为（不关闭菜单）
												className="gap-2"
											>
												<LayoutListIcon className="size-4" />
												表格
											</DropdownMenuRadioItem>
											
											{/* 网格视图选项 */}
											<DropdownMenuRadioItem 
												value="grid" 
												onSelect={(e) => e.preventDefault()}
												className="gap-2"
											>
												<LayoutGridIcon className="size-4" />
												网格
											</DropdownMenuRadioItem>
										</DropdownMenuRadioGroup>
									</div>

									{/* ============================================
									    第 2 列：排序选择
									    ============================================ */}
									<div className="border-r">
										{/* 列标题 */}
										<DropdownMenuLabel className="pt-2 px-3.5 flex items-center gap-2">
											<ArrowUpDownIcon className="size-4" />
											排序
										</DropdownMenuLabel>
										<DropdownMenuSeparator />
										
										{/* 排序选项列表 */}
										<div className="px-1 pb-1">
											{columns.map((column) => {
												// 只显示可排序的列
												if (!column.getCanSort()) return null
												
												// 根据当前排序状态显示对应图标
												let Icon = <span className="w-6"></span>  // 默认：空占位
												if (sorting[0]?.id === column.id) {
													// 如果是当前排序列，显示排序方向图标
													Icon = sorting[0]?.desc ? (
														<ArrowUpIcon className="me-2 size-4" />   // 降序
													) : (
														<ArrowDownIcon className="me-2 size-4" />  // 升序
													)
												}
												
												return (
													<DropdownMenuItem
														onSelect={(e) => {
															e.preventDefault()
															// 点击时切换排序：
															// 如果已经按此列排序，切换升序/降序
															// 如果未按此列排序，设置为此列降序
															setSorting([{
																id: column.id,
																desc: sorting[0]?.id === column.id && !sorting[0]?.desc
															}])
														}}
														key={column.id}
													>
														{Icon}
														{/* @ts-ignore - 获取列的显示名称 */}
														{column.columnDef.name()}
													</DropdownMenuItem>
												)
											})}
										</div>
									</div>

									{/* ============================================
									    第 3 列：列可见性控制
									    ============================================ */}
									<div>
										{/* 列标题 */}
										<DropdownMenuLabel className="pt-2 px-3.5 flex items-center gap-2">
											<EyeIcon className="size-4" />
											显示列
										</DropdownMenuLabel>
										<DropdownMenuSeparator />
										
										{/* 复选框列表 */}
										<div className="px-1.5 pb-1">
											{columns
												.filter((column) => column.getCanHide())  // 只显示可隐藏的列
												.map((column) => {
													return (
														<DropdownMenuCheckboxItem
															key={column.id}
															onSelect={(e) => e.preventDefault()}
															checked={column.getIsVisible()}  // 是否选中
															onCheckedChange={(value) => column.toggleVisibility(!!value)}  // 切换显示/隐藏
														>
															{/* @ts-ignore - 获取列的显示名称 */}
															{column.columnDef.name()}
														</DropdownMenuCheckboxItem>
													)
												})}
										</div>
									</div>
								</div>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>
			</CardHeader>

			{/* ============================================
			    表格内容：根据 viewMode 显示表格或网格
			    ============================================ */}
		<div className="p-6 pt-0 max-sm:py-3 max-sm:px-2">
			{viewMode === "table" ? (
				/* 表格视图 */
				<DatasourceTableView 
					table={table} 
					rows={rows} 
					colLength={visibleColumns.length}  // 传递可见列数（用于空状态的 colSpan）
				/>
			) : (
				/* 网格视图（卡片） */
				<DatasourceGridView 
					rows={rows}
					table={table} 
					colLength={visibleColumns.length} 
				/>
			)}
		</div>
		</Card>
	)
}

// ============================================
// 子组件：表格视图
// ============================================

/**
 * DatasourceTableView - 表格视图组件
 * 
 * 传统的行列表格布局，适合显示大量结构化数据
 * 
 * 使用 memo 优化：只有 props 变化时才重新渲染
 * 
 * @param table - React Table 实例
 * @param rows - 当前显示的行数组
 * @param colLength - 可见列数（用于空状态）
 */
const DatasourceTableView = memo(
	({ table, rows, colLength }: { 
		table: TableType<DatasourceRecord>
		rows: Row<DatasourceRecord>[]
		colLength: number 
	}) => {
		return (
			<div className="h-min max-h-[calc(100dvh-17rem)] max-w-full relative overflow-auto border rounded-md">
				{/* ============================================
				    HTML <table> 元素
				    ============================================ */}
				<Table className="text-sm w-full">
					{/* ============================================
					    表头（粘性定位，滚动时始终可见）
					    ============================================ */}
					<TableHeader className="sticky top-0 z-50 w-full border-b-2">
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => (
									<TableHead className="px-1.5" key={header.id}>
										{/* flexRender: React Table 的渲染函数
										    将列定义中的 header 函数渲染为实际的 React 元素 */}
										{flexRender(
											header.column.columnDef.header,  // 表头渲染函数（如 sortableHeader）
											header.getContext()               // 表头上下文（包含列信息）
										)}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					
					{/* ============================================
					    表体（数据行）
					    ============================================ */}
					<TableBody>
						{rows.length ? (
							// 有数据：渲染所有行
							rows.map((row) => (
								<TableRow 
									key={row.id} 
									className="cursor-pointer hover:bg-muted/50"  // 鼠标悬停效果
									onClick={() => navigate(getPagePath($router, "dashboard", { id: row.original.id }))}
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell 
											key={cell.id} 
											className="py-2 h-14"  // 固定行高 56px (h-14)
										>
											{/* flexRender: 渲染单元格内容 */}
											{flexRender(
												cell.column.columnDef.cell,  // 单元格渲染函数（如列定义中的 cell）
												cell.getContext()             // 单元格上下文（包含行数据）
											)}
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							// 无数据：显示空状态
							<TableRow>
								<TableCell 
									colSpan={colLength}  // 跨越所有列
									className="h-24 text-center pointer-events-none"
								>
									未找到数据源
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
		)
	}
)

// ============================================
// 子组件：网格视图（卡片）
// ============================================

/**
 * DatasourceGridView - 网格视图组件
 * 
 * 卡片式布局，适合移动端和视觉展示
 * 每个数据源显示为一张卡片
 * 
 * 使用 memo 优化：只有 props 变化时才重新渲染
 * 
 * @param rows - 当前显示的行数组
 */
const DatasourceGridView = memo(
	({ rows, table }: { 
		rows: Row<DatasourceRecord>[]
		table: TableType<DatasourceRecord>  // 用于获取列定义
		colLength: number                   // 传入但未使用（保留接口）
	}) => {
		// ============================================
		// 从列定义中提取图标
		// ============================================
		// 获取所有列定义，并提取每列的图标组件
		const columnIcons = useMemo(() => {
			const icons: Record<string, React.ElementType | undefined> = {}
			table.getAllColumns().forEach((column) => {
				// @ts-ignore - Icon 是我们自定义的列属性
				const Icon = column.columnDef.Icon
				if (Icon) {
					icons[column.id] = Icon
				}
			})
			return icons
		}, [table])
		
		// 便捷函数：获取指定列的图标组件
		const getIcon = (columnId: string) => columnIcons[columnId]
		
		// 提取各列的图标组件
		const AppIdIcon = getIcon('app_id')
		const AddressIcon = getIcon('pushgateway_addr_list')
		const DescIcon = getIcon('description')
		const TimeIcon = getIcon('createdAt')
		
		return (
			<div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
				{/* 响应式网格：
				    - 小屏（< 640px）: 1 列
				    - 中屏（640px - 1024px）: 2 列
				    - 大屏（>= 1024px）: 3 列 */}
				
				{rows?.length ? (
					// 有数据：渲染所有卡片
					rows.map((row) => {
						const datasource = row.original  // 获取原始数据对象
						return (
							<Card 
								key={datasource.id} 
								className="cursor-pointer hover:shadow-md transition-all"  // 悬停效果
								onClick={() => navigate(getPagePath($router, "dashboard", { id: datasource.id }))}
							>
								{/* ============================================
								    卡片头部：名称 + 操作按钮
								    ============================================ */}
								<CardHeader className="py-3 ps-5 pe-3 bg-muted/30 border-b border-border/60">
									<div className="flex items-center gap-2 w-full overflow-hidden">
										{/* 状态指示器 + 数据源名称（带柔和背景色） */}
										<CardTitle className="text-base tracking-normal flex-1 truncate">
											<div className={cn(
												"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full w-fit",
												{
													"bg-green-500/10 text-green-700 dark:text-green-400": datasource.status === "healthy",
													"bg-yellow-500/10 text-yellow-700 dark:text-yellow-400": datasource.status === "degraded",
													"bg-red-500/10 text-red-700 dark:text-red-400": datasource.status === "down",
													"bg-gray-500/10 text-gray-700 dark:text-gray-400": !["healthy", "degraded", "down"].includes(datasource.status),
												}
											)}>
												{/* 状态指示器（彩色小圆点） */}
												<span 
													className={cn(
														"inline-block size-2 rounded-full shrink-0",
														STATUS_COLORS[datasource.status as keyof typeof STATUS_COLORS] || "bg-gray-500"
													)} 
												/>
												<span className="text-sm font-medium truncate">{datasource.name}</span>
											</div>
										</CardTitle>
										
										{/* 操作按钮（编辑/删除） */}
										<div 
											className="flex gap-1 shrink-0 relative z-10"
											onClick={(e) => e.stopPropagation()}  // 阻止点击事件冒泡到卡片
										>
											<ActionsButton datasource={datasource} />
										</div>
									</div>
								</CardHeader>
								
								{/* ============================================
								    卡片内容：显示详细信息
								    ============================================ */}
								<CardContent className="text-sm px-5 pt-3.5 pb-4">
									<div className="grid gap-2.5">
										{/* 项目 ID */}
										<div className="flex gap-2 items-start">
											{AppIdIcon && <AppIdIcon className="size-4 text-muted-foreground shrink-0 mt-0.5" />}
											<span className="text-muted-foreground min-w-16">项目 ID:</span>
											<span className="flex-1">{datasource.app_id}</span>
										</div>
										
										{/* 数据源地址列表 */}
										<div className="flex gap-2 items-start">
											{AddressIcon && <AddressIcon className="size-4 text-muted-foreground shrink-0 mt-0.5" />}
											<span className="text-muted-foreground min-w-16">数据源:</span>
											<span className="flex-1">
												{datasource.pushgateway_addr_list.length > 0 ? (
													<div className="space-y-1">
														{datasource.pushgateway_addr_list.map((addr, index) => (
															<div 
																key={index} 
																className="truncate text-xs" 
																title={addr}
															>
																{addr}
															</div>
														))}
													</div>
												) : (
													<span className="text-muted-foreground/50">-</span>
												)}
											</span>
										</div>
										
										{/* 描述（如果有） */}
										{datasource.description && (
											<div className="flex gap-2 items-start">
												{DescIcon && <DescIcon className="size-4 text-muted-foreground shrink-0 mt-0.5" />}
												<span className="text-muted-foreground min-w-16">描述:</span>
												<span className="flex-1">{datasource.description}</span>
											</div>
										)}
										
										{/* 创建时间 */}
										<div className="flex gap-2 items-start">
											{TimeIcon && <TimeIcon className="size-4 text-muted-foreground shrink-0 mt-0.5" />}
											<span className="text-muted-foreground min-w-16">创建时间:</span>
											<span className="flex-1 text-xs tabular-nums">
												{new Date(datasource.createdAt).toLocaleString("zh-CN")}
											</span>
										</div>
									</div>
								</CardContent>
							</Card>
						)
					})
				) : (
					// 无数据：显示空状态
					<div className="col-span-full text-center py-8">
						未找到数据源
					</div>
				)}
			</div>
		)
	}
)
