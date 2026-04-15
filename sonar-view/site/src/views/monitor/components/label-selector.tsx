/**
 * ============================================
 * 标签筛选器组件
 * ============================================
 *
 * 以表格形式展示所有可用的标签值，用户可以点击选择
 * 支持多选，实时显示匹配的序列数量
 */

import { useMemo } from "react"
import { cn } from "@/shared/lib/utils"

// ============================================
// 类型定义
// ============================================

export interface LabelSelectorProps {
	/** 所有可用的标签值（从数据中提取） */
	availableLabels: Record<string, Set<string>>

	/** 当前选中的标签值 */
	selectedLabels: Record<string, string[] | undefined>

	/** 选择变化回调 */
	onSelectionChange: (selected: Record<string, string[] | undefined>) => void

	/** 匹配的序列数量（实时反馈） */
	matchedSeriesCount: number

	/** 最大显示高度 */
	maxHeight?: string
}

// ============================================
// 组件实现
// ============================================

/**
 * 标签筛选器组件
 *
 * @example
 * ```typescript
 * <LabelSelector
 *   availableLabels={{
 *     ip: new Set(['192.168.1.1', '192.168.1.2']),
 *     pid: new Set(['12', '123']),
 *   }}
 *   selectedLabels={{ ip: ['192.168.1.1'] }}
 *   onSelectionChange={setSelectedLabels}
 *   matchedSeriesCount={5}
 * />
 * ```
 */
export function LabelSelector({
	availableLabels,
	selectedLabels,
	onSelectionChange,
	matchedSeriesCount,
	maxHeight = "400px",
}: LabelSelectorProps) {
	// 标签键列表（排序）
	const labelKeys = useMemo(() =>
		Object.keys(availableLabels).sort(),
		[availableLabels]
	)

	// 计算已选择的标签值总数
	const selectedCount = useMemo(() =>
		Object.values(selectedLabels).reduce((sum, arr) => sum + (arr?.length || 0), 0),
		[selectedLabels]
	)

	// 计算表格最大行数
	const maxRows = useMemo(() =>
		Math.max(...labelKeys.map(k => availableLabels[k].size), 0),
		[labelKeys, availableLabels]
	)

	// 切换标签值的选中状态
	const toggleLabelValue = (labelKey: string, value: string) => {
		const current = selectedLabels[labelKey] || []
		const isSelected = current.includes(value)

		const newSelected = isSelected
			? current.filter(v => v !== value)
			: [...current, value]

		// 如果数组为空，从对象中删除该键
		const updated = { ...selectedLabels }
		if (newSelected.length > 0) {
			updated[labelKey] = newSelected
		} else {
			delete updated[labelKey]
		}

		onSelectionChange(updated)
	}

	// 移除单个标签值
	const removeLabelValue = (labelKey: string, value: string) => {
		const current = selectedLabels[labelKey] || []
		const newSelected = current.filter(v => v !== value)

		// 如果数组为空，从对象中删除该键
		const updated = { ...selectedLabels }
		if (newSelected.length > 0) {
			updated[labelKey] = newSelected
		} else {
			delete updated[labelKey]
		}

		onSelectionChange(updated)
	}

	// 清空所有选择
	const clearAll = () => {
		onSelectionChange({})
	}

	// 如果没有标签，显示提示
	if (labelKeys.length === 0) {
		return (
			<div className="border rounded-lg p-8 text-center text-muted-foreground">
				<p className="text-sm">该指标没有可筛选的标签</p>
			</div>
		)
	}

	return (
		<div className="border rounded-lg overflow-hidden">
			{/* 顶部信息栏 */}
			<div className="bg-muted px-4 py-2 flex items-center justify-between text-sm">
				<div className="font-medium">
					标签筛选
				</div>
				<div className="flex items-center gap-4">
					<span className="text-muted-foreground">
						已选择: <span className="font-medium text-foreground">{selectedCount}</span> 个标签值
						{' · '}
						匹配: <span className="font-bold text-primary">{matchedSeriesCount}</span> 条序列
					</span>
					{selectedCount > 0 && (
						<button
							onClick={clearAll}
							className="text-xs text-muted-foreground hover:text-foreground transition-colors"
						>
							清空筛选
						</button>
					)}
				</div>
			</div>

			{/* 标签表格 */}
			<div
				className="overflow-auto"
				style={{ maxHeight }}
			>
				<table className="w-full">
					<thead className="bg-muted/50 sticky top-0">
						<tr>
							{labelKeys.map(labelKey => (
								<th
									key={labelKey}
									className="px-4 py-2 text-left text-xs font-medium border-r last:border-r-0"
								>
								<div className="flex items-center gap-2">
									<span>{labelKey}</span>
									{selectedLabels[labelKey]?.length && selectedLabels[labelKey].length > 0 && (
										<span className="px-1.5 py-0.5 bg-primary text-primary-foreground rounded-full text-[10px] font-bold">
											{selectedLabels[labelKey]?.length}
										</span>
									)}
								</div>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{Array.from({ length: maxRows }).map((_, rowIndex) => (
							<tr
								key={rowIndex}
								className="border-t hover:bg-muted/30 transition-colors"
							>
								{labelKeys.map(labelKey => {
									const values = Array.from(availableLabels[labelKey])
									const value = values[rowIndex]
									const isSelected = selectedLabels[labelKey]?.includes(value)

									if (!value) {
										return (
											<td
												key={labelKey}
												className="px-4 py-2 border-r last:border-r-0"
											/>
										)
									}

									return (
										<td
											key={labelKey}
											className="px-4 py-2 border-r last:border-r-0"
										>
											<button
												onClick={() => toggleLabelValue(labelKey, value)}
												className={cn(
													"px-2 py-1 rounded text-xs font-mono transition-all w-full text-left",
													"hover:ring-2 hover:ring-primary hover:ring-offset-1",
													isSelected
														? "bg-primary text-primary-foreground font-medium shadow-sm"
														: "bg-muted text-foreground hover:bg-muted/70"
												)}
											>
												{value}
											</button>
										</td>
									)
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{/* 底部已选标签展示 */}
			{selectedCount > 0 && (
				<div className="bg-muted/30 px-4 py-3 border-t">
					<div className="text-xs text-muted-foreground mb-2">当前筛选条件:</div>
					<div className="flex flex-wrap gap-2">
						{Object.entries(selectedLabels).map(([key, values]) =>
							values?.map(value => (
								<div
									key={`${key}=${value}`}
									className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-background rounded border text-xs"
								>
									<span className="text-muted-foreground">{key}=</span>
									<span className="font-medium font-mono">{value}</span>
									<button
										onClick={() => removeLabelValue(key, value)}
										className="text-muted-foreground hover:text-destructive transition-colors ml-1"
										title="移除此标签"
									>
										×
									</button>
								</div>
							))
						)}
					</div>
				</div>
			)}
		</div>
	)
}
