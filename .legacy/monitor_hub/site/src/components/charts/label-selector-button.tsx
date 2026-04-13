/**
 * ============================================
 * 标签筛选器按钮组件
 * ============================================
 * 
 * 弹出式标签筛选器，点击按钮后弹出表格
 * 表格宽度自适应标签值和列数
 */

import { useState } from 'react'
import { LabelSelector } from './label-selector'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

// ============================================
// 类型定义
// ============================================

export interface LabelSelectorButtonProps {
	/** 所有可用的标签值（从数据中提取） */
	availableLabels: Record<string, Set<string>>
	
	/** 当前选中的标签值 */
	selectedLabels: Record<string, string[] | undefined>
	
	/** 选择变化回调 */
	onSelectionChange: (selected: Record<string, string[] | undefined>) => void
	
	/** 匹配的序列数量（实时反馈） */
	matchedSeriesCount: number
	
	/** 按钮文本 */
	buttonText?: string
	
	/** 按钮变体 */
	buttonVariant?: 'default' | 'outline' | 'ghost' | 'secondary'
}

// ============================================
// 组件实现
// ============================================

/**
 * 标签筛选器按钮组件
 * 
 * @example
 * ```typescript
 * <LabelSelectorButton
 *   availableLabels={availableLabels}
 *   selectedLabels={selectedLabels}
 *   onSelectionChange={setSelectedLabels}
 *   matchedSeriesCount={series.size}
 *   buttonText="筛选标签"
 * />
 * ```
 */
export function LabelSelectorButton({
	availableLabels,
	selectedLabels,
	onSelectionChange,
	matchedSeriesCount,
	buttonText = '筛选标签',
	buttonVariant = 'outline',
}: LabelSelectorButtonProps) {
	const [open, setOpen] = useState(false)
	
	// 计算已选择的标签值总数
	const selectedCount = Object.values(selectedLabels).reduce(
		(sum, arr) => sum + (arr?.length || 0),
		0
	)
	
	// 计算标签键数量（列数）
	const labelKeyCount = Object.keys(availableLabels).length
	
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<TooltipProvider>
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<DialogTrigger asChild>
							<Button variant={buttonVariant} className="relative">
								<svg 
									className="h-4 w-4" 
									fill="none" 
									stroke="currentColor" 
									viewBox="0 0 24 24"
								>
									<path 
										strokeLinecap="round" 
										strokeLinejoin="round" 
										strokeWidth={2} 
										d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" 
									/>
								</svg>
								{selectedCount > 0 && (
									<span className="ml-2 px-1.5 py-0.5 text-[10px] h-5 rounded-full bg-primary text-primary-foreground font-semibold inline-flex items-center">
										{selectedCount}
									</span>
								)}
							</Button>
						</DialogTrigger>
					</TooltipTrigger>
					<TooltipContent>筛选标签</TooltipContent>
				</Tooltip>
			</TooltipProvider>
			
			<DialogContent 
				className="max-w-fit max-h-[90vh] overflow-hidden flex flex-col"
				style={{
					// 根据列数动态调整宽度
					width: labelKeyCount === 0 
						? '400px' 
						: `${Math.min(Math.max(labelKeyCount * 180, 600), 1400)}px`
				}}
			>
				<DialogHeader>
					<DialogTitle>标签筛选</DialogTitle>
					<DialogDescription>
						点击标签值进行筛选，支持多选。
					</DialogDescription>
				</DialogHeader>
				
				<div className="flex-1 overflow-hidden">
					<LabelSelector
						availableLabels={availableLabels}
						selectedLabels={selectedLabels}
						onSelectionChange={onSelectionChange}
						matchedSeriesCount={matchedSeriesCount}
						maxHeight="calc(90vh - 200px)"
					/>
				</div>
			</DialogContent>
		</Dialog>
	)
}

