/**
 * ============================================
 * 分页组件 - Pagination
 * ============================================
 * 
 * 通用分页组件，支持：
 * 1. 页码按钮（智能省略）
 * 2. 上一页/下一页/首页/末页
 * 3. Page Size 选择器
 * 4. 跳转输入框
 * 5. 总数据量显示
 * 
 * 使用示例：
 * ```tsx
 * <Pagination
 *   currentPage={1}
 *   totalPages={10}
 *   pageSize={20}
 *   total={200}
 *   onPageChange={(page) => setPage(page)}
 *   onPageSizeChange={(size) => setPageSize(size)}
 * />
 * ```
 */

import { useState } from 'react'
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	ChevronsLeftIcon,
	ChevronsRightIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// ============================================
// 类型定义
// ============================================

export interface PaginationProps {
	/** 当前页码（从 1 开始） */
	currentPage: number
	
	/** 总页数 */
	totalPages: number
	
	/** 每页数量 */
	pageSize: number
	
	/** 总数据量 */
	total: number
	
	/** 页码变化回调 */
	onPageChange: (page: number) => void
	
	/** 每页数量变化回调 */
	onPageSizeChange: (size: number) => void
	
	/** 可选的每页数量选项（默认 [5, 10, 20, 50, 100]） */
	pageSizeOptions?: number[]
	
	/** 可选的类名 */
	className?: string
}

// ============================================
// 工具函数：生成页码数组
// ============================================

/**
 * 生成智能省略的页码数组
 * 
 * 规则：
 * - 总页数 <= 7: 显示所有页码 [1, 2, 3, 4, 5, 6, 7]
 * - 当前页靠近开头: [1, 2, 3, 4, 5, ..., 20]
 * - 当前页在中间: [1, ..., 8, 9, 10, ..., 20]
 * - 当前页靠近结尾: [1, ..., 16, 17, 18, 19, 20]
 * 
 * @param currentPage 当前页码
 * @param totalPages 总页数
 * @returns 页码数组，省略号用 -1 表示
 */
function generatePageNumbers(currentPage: number, totalPages: number): (number | -1)[] {
	// 总页数 <= 7，显示所有页码
	if (totalPages <= 7) {
		return Array.from({ length: totalPages }, (_, i) => i + 1)
	}
	
	// 总页数 > 7，需要省略
	const pages: (number | -1)[] = []
	
	// 始终显示第 1 页
	pages.push(1)
	
	// 当前页靠近开头（1-4）
	if (currentPage <= 4) {
		pages.push(2, 3, 4, 5)
		pages.push(-1) // 省略号
		pages.push(totalPages)
	}
	// 当前页靠近结尾（total-3 到 total）
	else if (currentPage >= totalPages - 3) {
		pages.push(-1) // 省略号
		pages.push(totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages)
	}
	// 当前页在中间
	else {
		pages.push(-1) // 左侧省略号
		pages.push(currentPage - 1, currentPage, currentPage + 1)
		pages.push(-1) // 右侧省略号
		pages.push(totalPages)
	}
	
	return pages
}

// ============================================
// 主组件
// ============================================

export function Pagination({
	currentPage,
	totalPages,
	pageSize,
	total,
	onPageChange,
	onPageSizeChange,
	pageSizeOptions = [5, 10, 20, 50, 100],
	className,
}: PaginationProps) {
	// 跳转输入框的值
	const [jumpValue, setJumpValue] = useState('')
	
	// 生成页码数组
	const pageNumbers = generatePageNumbers(currentPage, totalPages)
	
	// 处理页码跳转
	const handleJump = () => {
		const page = parseInt(jumpValue, 10)
		if (!isNaN(page) && page >= 1 && page <= totalPages) {
			onPageChange(page)
			setJumpValue('') // 清空输入框
		}
	}
	
	// 是否禁用上一页
	const isPrevDisabled = currentPage <= 1
	
	// 是否禁用下一页
	const isNextDisabled = currentPage >= totalPages
	
	// 计算显示范围
	const startItem = total === 0 ? 0 : (currentPage - 1) * pageSize + 1
	const endItem = Math.min(currentPage * pageSize, total)
	
	return (
		<div className={cn("flex flex-col sm:flex-row items-center justify-between gap-4 px-2", className)}>
			{/* ============================================
			    左侧：总数据量 + Page Size 选择器
			    ============================================ */}
			<div className="flex items-center gap-4 text-sm text-muted-foreground">
				{/* 总数据量 */}
				<span className="whitespace-nowrap">
					共 <span className="font-medium text-foreground">{total}</span> 条数据
					{total > 0 && (
						<>
							，显示第 <span className="font-medium text-foreground">{startItem}</span> - <span className="font-medium text-foreground">{endItem}</span> 条
						</>
					)}
				</span>
				
				{/* Page Size 选择器 */}
				<div className="flex items-center gap-2">
					<span className="whitespace-nowrap">每页</span>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" size="sm" className="h-8 w-16">
								{pageSize}
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start">
							{pageSizeOptions.map((size) => (
								<DropdownMenuItem
									key={size}
									onClick={() => onPageSizeChange(size)}
									className={cn(
										"cursor-pointer",
										size === pageSize && "bg-accent"
									)}
								>
									{size} 条
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
					<span>条</span>
				</div>
			</div>
			
			{/* ============================================
			    右侧：分页控件
			    ============================================ */}
			<div className="flex items-center gap-2">
				{/* 首页按钮 */}
				<Button
					variant="outline"
					size="icon"
					className="h-8 w-8"
					onClick={() => onPageChange(1)}
					disabled={isPrevDisabled}
					title="首页"
				>
					<ChevronsLeftIcon className="h-4 w-4" />
				</Button>
				
				{/* 上一页按钮 */}
				<Button
					variant="outline"
					size="icon"
					className="h-8 w-8"
					onClick={() => onPageChange(currentPage - 1)}
					disabled={isPrevDisabled}
					title="上一页"
				>
					<ChevronLeftIcon className="h-4 w-4" />
				</Button>
				
				{/* 页码按钮 */}
				<div className="flex items-center gap-1">
					{pageNumbers.map((page, index) => {
						// 省略号
						if (page === -1) {
							return (
								<span
									key={`ellipsis-${index}`}
									className="flex h-8 w-8 items-center justify-center text-muted-foreground"
								>
									⋯
								</span>
							)
						}
						
						// 页码按钮
						return (
							<Button
								key={page}
								variant={page === currentPage ? "default" : "outline"}
								size="icon"
								className="h-8 w-8"
								onClick={() => onPageChange(page)}
							>
								{page}
							</Button>
						)
					})}
				</div>
				
				{/* 下一页按钮 */}
				<Button
					variant="outline"
					size="icon"
					className="h-8 w-8"
					onClick={() => onPageChange(currentPage + 1)}
					disabled={isNextDisabled}
					title="下一页"
				>
					<ChevronRightIcon className="h-4 w-4" />
				</Button>
				
				{/* 末页按钮 */}
				<Button
					variant="outline"
					size="icon"
					className="h-8 w-8"
					onClick={() => onPageChange(totalPages)}
					disabled={isNextDisabled}
					title="末页"
				>
					<ChevronsRightIcon className="h-4 w-4" />
				</Button>
				
				{/* 跳转输入框 */}
				<div className="flex items-center gap-2 ml-2">
					<span className="text-sm text-muted-foreground whitespace-nowrap">跳至</span>
					<Input
						type="number"
						min={1}
						max={totalPages}
						value={jumpValue}
						onChange={(e) => setJumpValue(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') {
								handleJump()
							}
						}}
						className="h-8 w-16 text-center"
						placeholder={String(currentPage)}
					/>
					<span className="text-sm text-muted-foreground">页</span>
					<Button
						variant="outline"
						size="sm"
						className="h-8"
						onClick={handleJump}
					>
						确定
					</Button>
				</div>
			</div>
		</div>
	)
}

