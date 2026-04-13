/**
 * SummaryTablesCard - 汇总数据表格组件
 * 
 * 功能：
 * 1. 多标签页切换显示不同表格
 * 2. 表格渲染（带行号）
 * 3. 复制到剪贴板
 * 4. 导出为 CSV 文件
 */

import { memo, useState, useEffect } from "react"
import {
	CopyIcon,
	CheckIcon,
	DownloadIcon,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { copyTableToClipboard, exportTableAsCSV } from "@/lib/metric-utils"
import type { SummaryTable } from "@/apis/points"

// ============================================
// 类型定义
// ============================================

export interface SummaryTablesCardProps {
	/** 汇总表格数据列表 */
	tables: SummaryTable[]
	/** 自定义类名 */
	className?: string
	/** 显示模式：card = 卡片包裹（实时监控），flat = 无卡片包裹（报告页面） */
	variant?: 'card' | 'flat'
	/** 布局模式：tabs = 标签页切换，list = 平铺展示 */
	layout?: 'tabs' | 'list'
}

// ============================================
// 主组件
// ============================================

export const SummaryTablesCard = memo(function SummaryTablesCard({
	tables,
	className,
	variant = 'card',
	layout = 'tabs',
}: SummaryTablesCardProps) {
	const { toast } = useToast()
	
	// 状态管理
	const [activeTableTab, setActiveTableTab] = useState<string>("")
	const [copiedTableIndex, setCopiedTableIndex] = useState<number | null>(null)
	
	// 初始化激活的表格标签页
	useEffect(() => {
		if (tables.length > 0 && !activeTableTab) {
			setActiveTableTab(tables[0].name)
		}
	}, [tables, activeTableTab])
	
	// 复制表格到剪贴板
	const handleCopyTable = async (table: string[][], tableIndex: number) => {
		const success = await copyTableToClipboard(table)
		
		if (success) {
			// 设置复制状态
			setCopiedTableIndex(tableIndex)
			setTimeout(() => setCopiedTableIndex(null), 2000)
			
			// 显示成功提示
			toast({
				title: "复制成功",
				description: "表格数据已复制到剪贴板",
			})
		} else {
			toast({
				title: "复制失败",
				description: "无法复制到剪贴板，请手动选择并复制",
				variant: "destructive",
			})
		}
	}
	
	// 导出表格为 CSV 文件
	const handleExportCSV = (table: string[][], tableName: string) => {
		const success = exportTableAsCSV(table, tableName)
		
		if (success) {
			toast({
				title: "导出成功",
				description: `已导出 ${tableName}.csv`,
			})
		} else {
			toast({
				title: "导出失败",
				description: "无法导出 CSV 文件",
				variant: "destructive",
			})
		}
	}
	
	// 如果没有表格数据，不渲染组件
	if (tables.length === 0) {
		return null
	}
	
	// 获取当前表格
	const currentTable = tables.find(t => t.name === (activeTableTab || tables[0]?.name))
	const currentTableIndex = tables.findIndex(t => t.name === (activeTableTab || tables[0]?.name))
	
	// 渲染单个表格
	const renderTable = (tableData: SummaryTable, tableIndex: number) => {
		if (!tableData.table || tableData.table.length === 0) return null
		
		return (
			<div key={tableIndex} className="border rounded-lg overflow-hidden">
				<Table>
					<TableHeader>
						<TableRow>
							{/* 编号列 */}
							<TableHead className="w-16 text-center">编号</TableHead>
							{tableData.table[0]?.map((header, headerIndex) => (
								<TableHead key={headerIndex} className={headerIndex === 0 ? "" : "text-center"}>
									{header}
								</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{tableData.table.slice(1).map((row, rowIndex) => (
							<TableRow key={rowIndex} className="hover:bg-muted/50">
								{/* 编号单元格 */}
								<TableCell className="text-center text-sm font-medium text-muted-foreground">
									{rowIndex + 1}
								</TableCell>
								{row.map((cell, cellIndex) => (
									<TableCell key={cellIndex} className={cellIndex === 0 ? "" : "text-center text-sm"}>
										{cell}
									</TableCell>
								))}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		)
	}
	
	// 平铺模式内容渲染
	const listContent = (
		<div className="space-y-4">
			{tables.map((tableData, tableIndex) => renderTable(tableData, tableIndex))}
		</div>
	)

	// 标签页模式内容渲染
	const tabsContent = (
		<>
			<Tabs 
				value={activeTableTab || tables[0]?.name || ""} 
				onValueChange={setActiveTableTab}
				className="w-full"
			>
				{/* 标签栏和操作按钮 */}
				<div className="flex items-center justify-between gap-4 mb-3">
					{/* 左侧：标签页 */}
					<TabsList className="shrink-0">
						{tables.map((summaryTable, tableIndex) => {
							// 跳过空表格
							if (!summaryTable.table || summaryTable.table.length === 0) {
								return null
							}
							return (
								<TabsTrigger 
									key={tableIndex} 
									value={summaryTable.name}
									className="data-[state=active]:bg-background data-[state=active]:text-emerald-600 data-[state=active]:shadow-sm"
								>
									{summaryTable.name}
								</TabsTrigger>
							)
						})}
					</TabsList>
					
					{/* 右侧：操作按钮 */}
					{currentTable && (
						<div className="flex gap-2 shrink-0">
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="outline"
											size="sm"
											onClick={() => handleCopyTable(currentTable.table, currentTableIndex)}
										>
											{copiedTableIndex === currentTableIndex ? (
												<CheckIcon className="size-4 text-green-500" />
											) : (
												<CopyIcon className="size-4" />
											)}
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										{copiedTableIndex === currentTableIndex ? "已复制" : "复制表格到剪贴板"}
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="outline"
											size="sm"
											onClick={() => handleExportCSV(currentTable.table, currentTable.name)}
										>
											<DownloadIcon className="size-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										导出为 CSV 文件
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
					)}
				</div>
			</Tabs>
				
			{/* 表格内容 - 显示当前选中的表格 */}
			{currentTable && renderTable(currentTable, currentTableIndex)}
		</>
	)
	
	// 根据布局模式选择内容
	const content = layout === 'list' ? listContent : tabsContent

	// 根据 variant 决定是否使用卡片包裹
	if (variant === 'flat') {
		return <div className={className}>{content}</div>
	}

	return (
		<Card className={className}>
			<CardContent className="p-6">
				{content}
			</CardContent>
		</Card>
	)
})

export default SummaryTablesCard

