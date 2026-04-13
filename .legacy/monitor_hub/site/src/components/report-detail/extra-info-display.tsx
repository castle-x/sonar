/**
 * ExtraInfoDisplay - 扩展信息展示组件
 * 
 * 布局：左侧表格 + 右侧标签
 * - 左侧：测试信息表格（无表头，每格显示 key: value，key加粗，两列实线分隔）
 * - 右侧：标签展示区（窄宽度）
 * - 默认显示3行（高度120px与icon对齐），超出可展开
 * - 支持颜色标记：value{{color}} 格式
 */

import { useState } from "react"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Table, TableBody, TableRow, TableCell } from "@/components/ui/table"
import { extraInfoArrayToObject } from "@/apis/report"
import { cn } from "@/lib/utils"

interface ExtraInfoDisplayProps {
	info?: string[]
	tags?: string[]
	testTimeline?: string
}

// 默认显示的最大行数
const DEFAULT_VISIBLE_ROWS = 3

// 颜色样式映射
const COLOR_STYLES = {
	red: 'text-red-600',
	yellow: 'text-yellow-600',
	blue: 'text-blue-600',
	green: 'text-green-600',
} as const

// 标签颜色样式映射（边框 + 背景 + 文字）
const TAG_COLOR_STYLES = {
	none: 'text-emerald-600 border-emerald-400 bg-emerald-50/50',
	red: 'text-red-600 border-red-400 bg-red-50/50',
	yellow: 'text-yellow-600 border-yellow-400 bg-yellow-50/50',
	blue: 'text-blue-600 border-blue-400 bg-blue-50/50',
	green: 'text-green-600 border-green-400 bg-green-50/50',
} as const

type ColorName = keyof typeof COLOR_STYLES | 'none'

/**
 * 从带颜色标记的字符串中提取值和颜色
 * 格式：value{{color}} 如 @castlexu{{red}}
 */
function parseColoredValue(value: string): { text: string; color: ColorName } {
	const match = value.match(/^(.+)\{\{(red|yellow|blue|green)\}\}$/)
	if (match) {
		return { text: match[1], color: match[2] as ColorName }
	}
	return { text: value, color: 'none' }
}

/**
 * 渲染带颜色的值
 */
function ColoredValue({ value, className }: { value: string; className?: string }) {
	const { text, color } = parseColoredValue(value)
	const colorClass = color !== 'none' ? COLOR_STYLES[color] : ''
	
	return (
		<span className={cn(className, colorClass)}>
			{text}
		</span>
	)
}

/**
 * 渲染带颜色的标签
 */
function ColoredTag({ value }: { value: string }) {
	const { text, color } = parseColoredValue(value)
	const colorClass = TAG_COLOR_STYLES[color]
	
	return (
		<Badge 
			variant="outline"
			className={cn("rounded-sm font-normal", colorClass)}
		>
			{text}
		</Badge>
	)
}

export function ExtraInfoDisplay({ info, tags, testTimeline }: ExtraInfoDisplayProps) {
	const [isExpanded, setIsExpanded] = useState(false)
	
	const infoObj = extraInfoArrayToObject(info)
	// 将测试时间作为第一个元素插入
	const entries: [string, string][] = testTimeline 
		? [['测试时间', testTimeline], ...Object.entries(infoObj)]
		: Object.entries(infoObj)
	
	// 将 entries 分组，从左到右、从上到下排列
	// 例如 [A,B,C,D,E,F] → [[A,B], [C,D], [E,F]]
	const allRows: Array<[string, string][]> = []
	for (let i = 0; i < entries.length; i += 2) {
		const row: [string, string][] = [entries[i]]
		if (i + 1 < entries.length) {
			row.push(entries[i + 1])
		}
		allRows.push(row)
	}
	
	// 如果没有任何数据
	const hasInfo = entries.length > 0
	const hasTags = tags && tags.length > 0
	
	if (!hasInfo && !hasTags) {
		return (
			<div className="flex-1 min-w-0">
				<div className="text-sm text-muted-foreground">
					暂无扩展信息
				</div>
			</div>
		)
	}
	
	// 是否需要显示展开/收起按钮
	const needsExpand = allRows.length > DEFAULT_VISIBLE_ROWS
	// 当前显示的行
	const visibleRows = isExpanded ? allRows : allRows.slice(0, DEFAULT_VISIBLE_ROWS)
	
	return (
		<div className="flex-1 min-w-0">
			{/* 布局：左侧表格 + 右侧标签，比例约 7:1 */}
			<div className="grid grid-cols-1 lg:grid-cols-[7fr_1fr] gap-4">
				{/* 左侧：测试信息表格 */}
				<div className="min-w-0">
					{hasInfo ? (
						<>
							{/* 表格容器，自适应内容高度 */}
							<div className="overflow-hidden">
								<Table className="table-fixed w-full">
									<TableBody>
										{visibleRows.map((row, rowIndex) => (
											<TableRow key={rowIndex} className="border-border/40">
												{row.map(([key, value], cellIndex) => {
													const { text: displayValue } = parseColoredValue(value)
													return (
														<TableCell 
															key={`${rowIndex}-${cellIndex}`} 
															className={`py-2.5 px-3 text-sm w-1/2 ${
																cellIndex === 0 ? 'border-r border-border/50' : ''
															}`}
														>
															<TooltipProvider>
																<Tooltip delayDuration={300}>
																	<TooltipTrigger asChild>
																		<div className="truncate cursor-default">
																			<span className="font-semibold text-foreground">{key}:</span>
																			<ColoredValue value={value} className="text-muted-foreground ml-1.5" />
																		</div>
																	</TooltipTrigger>
																	<TooltipContent side="bottom" className="max-w-md">
																		<p className="font-semibold">{key}</p>
																		<p className="text-muted-foreground">{displayValue}</p>
																	</TooltipContent>
																</Tooltip>
															</TooltipProvider>
														</TableCell>
													)
												})}
												{/* 如果只有1个元素，补一个空单元格保持对齐 */}
												{row.length === 1 && <TableCell className="py-2.5 px-3 w-1/2" />}
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
							
							{/* 展开/收起按钮 */}
							{needsExpand && (
								<div className="mt-1">
									<Button 
										variant="ghost" 
										size="sm" 
										className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
										onClick={() => setIsExpanded(!isExpanded)}
									>
										{isExpanded ? (
											<>
												<ChevronUpIcon className="h-3 w-3 mr-1" />
												收起
											</>
										) : (
											<>
												<ChevronDownIcon className="h-3 w-3 mr-1" />
												展开更多 ({allRows.length - DEFAULT_VISIBLE_ROWS} 行)
											</>
										)}
									</Button>
								</div>
							)}
						</>
					) : (
						<div className="text-sm text-muted-foreground py-2">
							暂无测试信息
						</div>
					)}
				</div>
				
				{/* 右侧：标签展示区 */}
				<div className="min-w-0">
					<div className="text-sm font-semibold text-foreground mb-2">标签</div>
					{hasTags ? (
						<div className="flex flex-wrap gap-2">
							{tags.map((tag, index) => (
								<ColoredTag key={index} value={tag} />
							))}
						</div>
					) : (
						<div className="text-sm text-muted-foreground">
							暂无标签
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
