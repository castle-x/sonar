/**
 * CaseSummaryTablesCard - 用例数据总览表格组件
 * 
 * 功能：
 * 1. 合并所有用例的同名表格
 * 2. 用例名作为第一列
 * 3. 支持标签页切换不同表格类型
 * 4. 支持用例筛选（勾选显示哪些用例）
 * 5. 支持表格排序
 * 6. 支持复制到剪贴板和导出 CSV
 * 7. 表格默认显示5行，支持滚动
 */

import { memo, useState, useMemo, useEffect } from 'react'
import {
	CopyIcon,
	CheckIcon,
	DownloadIcon,
	FilterIcon,
	ChevronDownIcon,
	ArrowUpIcon,
	ArrowDownIcon,
	ArrowUpDownIcon,
	LayoutGridIcon,
	LayoutListIcon,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuCheckboxItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { copyTableToClipboard, exportTableAsCSV } from '@/lib/metric-utils'
import type { SummaryTable } from '@/apis/points'
import type { SingleCase, ReportScore, MetricScore, ReportScoringConfig } from '@/apis/report'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"

// ============================================
// 类型定义
// ============================================

/**
 * 合并后的表格数据
 */
export interface MergedTableData {
	/** 表格名称 */
	name: string
	/** 表头（包含"用例"列） */
	headers: string[]
	/** 数据行（每行第一个元素是用例名） */
	rows: string[][]
}

/**
 * 用例表格数据
 */
export interface CaseTableData {
	/** 用例信息 */
	caseInfo: SingleCase
	/** 该用例的所有表格 */
	tables: SummaryTable[]
}

export interface CaseSummaryTablesCardProps {
	/** 所有用例的表格数据 */
	caseTablesData: CaseTableData[]
	/** 自定义类名 */
	className?: string
	/** 是否正在加载 */
	isLoading?: boolean
	/** 加载进度 */
	loadingProgress?: number
	/** 总数 */
	totalCount?: number
	/** 表格排序顺序（来自 summary_config 的顺序） */
	tableSortOrder?: string[]
	/** 报告评分结果（用于在表格中标记评分） */
	reportScore?: ReportScore
	/** 评分配置（用于显示评分规则说明） */
	scoringConfig?: ReportScoringConfig
}

// ============================================
// 评分相关常量和函数
// ============================================

const LEVEL_COLORS = {
	excellent: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', border: 'border-green-300' },
	good: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-300' },
	normal: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', border: 'border-yellow-300' },
	warning: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-300' },
	danger: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', border: 'border-red-300' },
} as const

const LEVEL_LABELS = {
	excellent: '低风险',
	good: '中低风险',
	normal: '中风险',
	warning: '中高风险',
	danger: '高风险',
} as const

const LEVEL_EMOJIS = {
	excellent: '🟢',
	good: '🔵',
	normal: '🟡',
	warning: '🟠',
	danger: '🔴',
} as const

/**
 * 解析列名，提取基础名称和聚合类型
 * 例如：
 * - "失败数量(last)" -> { baseName: "失败数量", aggType: "last" }
 * - "CPU使用率(avg)" -> { baseName: "CPU使用率", aggType: "avg" }
 * - "响应时间" -> { baseName: "响应时间", aggType: null }
 */
function parseColumnName(columnName: string): { baseName: string; aggType: string | null } {
	// 匹配括号中的聚合类型，如 "失败数量(last)"
	const bracketMatch = columnName.match(/^(.+?)\s*\((\w+)\)\s*$/)
	if (bracketMatch) {
		return { baseName: bracketMatch[1], aggType: bracketMatch[2] }
	}
	
	// 匹配下划线后缀的聚合类型，如 "失败数量_last"
	const underscoreMatch = columnName.match(/^(.+?)_(\w+)$/)
	if (underscoreMatch) {
		const possibleAggTypes = ['avg', 'max', 'min', 'count', 'last', 'sum']
		if (possibleAggTypes.includes(underscoreMatch[2])) {
			return { baseName: underscoreMatch[1], aggType: underscoreMatch[2] }
		}
	}
	
	return { baseName: columnName, aggType: null }
}

/**
 * 根据用例名、列名（alias）查找对应的指标评分
 * @param reportScore - 报告评分结果
 * @param caseName - 用例名
 * @param columnName - 列名（对应 MetricScoringConfig 的 alias），可能带聚合类型后缀如 "失败数量(last)"
 * @param rowData - 当前行的数据（用于匹配多维度指标）
 * @returns 匹配的指标评分列表
 */
function findMetricScores(
	reportScore: ReportScore | undefined,
	caseName: string,
	columnName: string,
	rowData?: Record<string, string>
): MetricScore[] {
	if (!reportScore) return []
	
	// 找到对应用例的评分
	const caseScore = reportScore.case_scores.find(cs => cs.case_name === caseName)
	if (!caseScore) return []
	
	// 解析列名，提取基础名称和聚合类型
	const { baseName: columnBaseName, aggType: columnAggType } = parseColumnName(columnName)
	
	// 找到匹配该列名的所有指标评分
	const matchedScores = caseScore.metric_scores.filter(ms => {
		// 1. 完全匹配列名
		if (ms.display_name === columnName) return true
		
		// 2. 匹配列名的基础部分（去掉聚合类型后缀）
		if (ms.display_name === columnBaseName) {
			// 如果列名有聚合类型，检查 metric_name 是否匹配
			if (columnAggType) {
				// metric_name 格式为 "name_aggType"，如 "request_fail_count_last"
				return ms.metric_name?.endsWith(`_${columnAggType}`)
			}
			return true
		}
		
		// 3. 匹配 metric_name 中的列名部分（用于英文指标名匹配）
		if (ms.metric_name) {
			// metric_name 格式为 "name_aggType"，去掉聚合类型后缀
			const metricBaseName = ms.metric_name.replace(/_\w+$/, '')
			if (metricBaseName === columnBaseName || metricBaseName === columnName) {
				return true
			}
		}
		
		return false
	})
	
	// 如果有 rowData，进一步过滤匹配当前行的数据
	if (rowData && matchedScores.length > 0) {
		// 检查是否有任何评分数据包含 row_data（多行指标）
		const hasRowData = matchedScores.some(ms => ms.row_data && Object.keys(ms.row_data).length > 0)
		
		if (hasRowData) {
			// 多行指标：必须精确匹配 row_data
			const filtered = matchedScores.filter(ms => {
				if (!ms.row_data || Object.keys(ms.row_data).length === 0) return false
				// 检查 row_data 中的值是否与当前行匹配
				return Object.entries(ms.row_data).every(([key, value]) => {
					return rowData[key] === value
				})
			})
			// 多行指标时，如果没有匹配的 row_data，说明该行没有评分（可能是 N/A 被跳过）
			return filtered
		}
		// 单行指标（没有 row_data）：返回所有匹配的评分
	}
	
	return matchedScores
}

/**
 * 获取当前值命中的评分规则说明
 * @returns { matchedRule: 命中的规则描述, allRules: 所有规则列表, scoringType: 评分类型 }
 */
function getMatchedScoringRule(
	scoringConfig: ReportScoringConfig | undefined,
	metricName: string,
	value: number
): { matchedRule: string; allRules: string[]; scoringType: 'threshold' | 'range' | null } {
	if (!scoringConfig?.default_config?.metric_configs) {
		return { matchedRule: '', allRules: [], scoringType: null }
	}
	
	// metricName 格式可能是 "request_fail_count_last"，需要去掉聚合类型后缀
	const possibleAggTypes = ['_avg', '_max', '_min', '_count', '_last', '_sum']
	let baseMetricName = metricName
	for (const suffix of possibleAggTypes) {
		if (metricName.endsWith(suffix)) {
			baseMetricName = metricName.slice(0, -suffix.length)
			break
		}
	}
	
	const config = scoringConfig.default_config.metric_configs.find(
		mc => mc.name === metricName || mc.name === baseMetricName || 
		      mc.alias === metricName || mc.alias === baseMetricName
	)
	if (!config) {
		return { matchedRule: '', allRules: [], scoringType: null }
	}
	
	// 阈值评分
	if (config.scoring_type === 'threshold' && config.thresholds?.length) {
		const allRules = config.thresholds.map(t => {
			const levelLabel = LEVEL_LABELS[t.level as keyof typeof LEVEL_LABELS] || t.level
			const opLabel = t.operator === '<' ? '小于' : 
			                t.operator === '<=' ? '小于等于' : 
			                t.operator === '=' ? '等于' : 
			                t.operator === '>=' ? '大于等于' : 
			                t.operator === '>' ? '大于' : t.operator
			return `${opLabel} ${t.value} → ${t.score}分 (${levelLabel})`
		})
		
		// 找到命中的阈值
		let matchedRule = ''
		for (const t of config.thresholds) {
			let matched = false
			switch (t.operator) {
				case '<': matched = value < t.value; break
				case '<=': matched = value <= t.value; break
				case '=': matched = Math.abs(value - t.value) < 0.000001; break
				case '>=': matched = value >= t.value; break
				case '>': matched = value > t.value; break
			}
			if (matched) {
				const levelLabel = LEVEL_LABELS[t.level as keyof typeof LEVEL_LABELS] || t.level
				const opLabel = t.operator === '<' ? '小于' : 
				                t.operator === '<=' ? '小于等于' : 
				                t.operator === '=' ? '等于' : 
				                t.operator === '>=' ? '大于等于' : 
				                t.operator === '>' ? '大于' : t.operator
				matchedRule = `${opLabel} ${t.value} → ${t.score}分 (${levelLabel})`
				break
			}
		}
		
		// 如果没有命中任何阈值，返回空（前端通过 matched 字段判断并单独显示）
		return { matchedRule, allRules, scoringType: 'threshold' }
	}
	
	// 区间评分
	if (config.ranges?.length) {
		const allRules = config.ranges.map(r => {
			const levelLabel = LEVEL_LABELS[r.level as keyof typeof LEVEL_LABELS] || r.level
			return `${r.min} ~ ${r.max} → ${r.score}分 (${levelLabel})`
		})
		
		// 找到命中的区间
		let matchedRule = ''
		for (const r of config.ranges) {
			if (value >= r.min && value <= r.max) {
				const levelLabel = LEVEL_LABELS[r.level as keyof typeof LEVEL_LABELS] || r.level
				matchedRule = `落在区间 [${r.min}, ${r.max}] → ${r.score}分 (${levelLabel})`
				break
			}
		}
		
		// 如果没有命中任何区间，说明是插值计算
		if (!matchedRule) {
			matchedRule = `值 ${value} 超出配置区间，使用线性插值计算`
		}
		
		return { matchedRule, allRules, scoringType: 'range' }
	}
	
	return { matchedRule: '', allRules: [], scoringType: null }
}

// ============================================
// 工具函数
// ============================================

/**
 * 根据评分配置重排列顺序
 * 将评分配置中的指标列移到前面，按配置顺序排列
 * 
 * @param headers - 原始表头（第一个是"用例"）
 * @param rows - 原始数据行
 * @param scoringConfig - 评分配置
 * @returns 重排后的表头和数据行
 */
function reorderColumnsByScoringConfig(
	headers: string[],
	rows: string[][],
	scoringConfig?: ReportScoringConfig
): { headers: string[]; rows: string[][] } {
	// 如果没有评分配置，返回原样
	if (!scoringConfig?.default_config?.metric_configs?.length) {
		return { headers, rows }
	}
	
	const metricConfigs = scoringConfig.default_config.metric_configs
	
	// 获取评分配置中所有的 alias（用于匹配列名）
	// 列名格式可能是 "失败数量(last)" 或 "失败数量_avg"，需要匹配基础名称
	const scoredAliases = metricConfigs.map(mc => mc.alias || mc.name)
	
	// 解析列名的基础名称（去掉聚合类型后缀）
	const parseBaseName = (colName: string): string => {
		// 匹配括号中的聚合类型，如 "失败数量(last)"
		const bracketMatch = colName.match(/^(.+?)\s*\((\w+)\)\s*$/)
		if (bracketMatch) return bracketMatch[1]
		
		// 匹配下划线后缀的聚合类型，如 "失败数量_last"
		const underscoreMatch = colName.match(/^(.+?)_(\w+)$/)
		if (underscoreMatch) {
			const possibleAggTypes = ['avg', 'max', 'min', 'count', 'last', 'sum']
			if (possibleAggTypes.includes(underscoreMatch[2])) {
				return underscoreMatch[1]
			}
		}
		
		return colName
	}
	
	// 第一列是"用例"，不参与重排
	const firstHeader = headers[0]
	const dataHeaders = headers.slice(1)
	
	// 创建列索引映射：原始索引 -> 新索引
	const scoredColumns: { originalIndex: number; header: string; configOrder: number }[] = []
	const unscoredColumns: { originalIndex: number; header: string }[] = []
	
	dataHeaders.forEach((header, index) => {
		const baseName = parseBaseName(header)
		const configIndex = scoredAliases.findIndex(alias => alias === baseName || alias === header)
		
		if (configIndex !== -1) {
			scoredColumns.push({ originalIndex: index, header, configOrder: configIndex })
		} else {
			unscoredColumns.push({ originalIndex: index, header })
		}
	})
	
	// 按评分配置顺序排序已配置的列
	scoredColumns.sort((a, b) => a.configOrder - b.configOrder)
	
	// 合并：评分配置的列在前，其他列在后
	const reorderedDataColumns = [...scoredColumns, ...unscoredColumns]
	
	// 构建新的表头
	const newHeaders = [firstHeader, ...reorderedDataColumns.map(col => col.header)]
	
	// 重排每一行的数据
	const newRows = rows.map(row => {
		const firstCell = row[0] // 用例名
		const dataCells = row.slice(1)
		const reorderedCells = reorderedDataColumns.map(col => dataCells[col.originalIndex] || '')
		return [firstCell, ...reorderedCells]
	})
	
	return { headers: newHeaders, rows: newRows }
}

/**
 * 合并所有用例的同名表格
 * 
 * @param caseTablesData - 所有用例的表格数据
 * @param selectedCases - 选中的用例名列表（空表示全选）
 * @param tableSortOrder - 表格排序顺序（来自 summary_config 的顺序）
 * @param scoringConfig - 评分配置（用于列排序）
 * @returns 合并后的表格列表
 */
function mergeCaseTables(
	caseTablesData: CaseTableData[],
	selectedCases: string[],
	tableSortOrder?: string[],
	scoringConfig?: ReportScoringConfig
): MergedTableData[] {
	// 按表格名称分组
	const tableGroups = new Map<string, Array<{
		caseName: string
		table: string[][]
	}>>()
	
	// 收集所有表格
	for (const { caseInfo, tables } of caseTablesData) {
		// 如果有筛选条件，检查是否选中
		if (selectedCases.length > 0 && !selectedCases.includes(caseInfo.name)) {
			continue
		}
		
		for (const summaryTable of tables) {
			if (!tableGroups.has(summaryTable.name)) {
				tableGroups.set(summaryTable.name, [])
			}
			
			tableGroups.get(summaryTable.name)!.push({
				caseName: caseInfo.name,
				table: summaryTable.table
			})
		}
	}
	
	// 合并同名表格
	const mergedTables: MergedTableData[] = []
	
	for (const [tableName, caseTables] of tableGroups) {
		if (caseTables.length === 0) continue
		
		// 获取表头（假设所有用例的同名表格结构相同）
		const originalHeaders = caseTables[0].table[0] || []
		let headers = ['用例', ...originalHeaders]
		
		// 合并所有用例的数据行
		let rows: string[][] = []
		
		for (const { caseName, table } of caseTables) {
			// 跳过表头，遍历数据行
			for (let i = 1; i < table.length; i++) {
				const row = table[i]
				rows.push([caseName, ...row])
			}
		}
		
		// 根据评分配置重排列顺序
		const reordered = reorderColumnsByScoringConfig(headers, rows, scoringConfig)
		headers = reordered.headers
		rows = reordered.rows
		
		mergedTables.push({
			name: tableName,
			headers,
			rows
		})
	}
	
	// 按表格名称排序
	// 如果提供了 tableSortOrder（来自 summary_config），则按照其顺序排序；否则按字母顺序
	if (tableSortOrder && tableSortOrder.length > 0) {
		mergedTables.sort((a, b) => {
			const aIndex = tableSortOrder.indexOf(a.name)
			const bIndex = tableSortOrder.indexOf(b.name)
			
			// 如果都在排序列表中，按照排序列表的顺序
			if (aIndex !== -1 && bIndex !== -1) {
				return aIndex - bIndex
			}
			// 如果只有 a 在排序列表中，a 排在前面
			if (aIndex !== -1) return -1
			// 如果只有 b 在排序列表中，b 排在前面
			if (bIndex !== -1) return 1
			// 如果都不在排序列表中，按字母顺序
			return a.name.localeCompare(b.name, 'zh-CN')
		})
	} else {
		mergedTables.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
	}
	
	return mergedTables
}

/**
 * 对表格数据进行排序
 * 
 * @param rows - 数据行
 * @param columnIndex - 排序列索引
 * @param direction - 排序方向（'asc' | 'desc' | null）
 * @returns 排序后的数据行
 */
function sortTableRows(
	rows: string[][],
	columnIndex: number | null,
	direction: 'asc' | 'desc' | null
): string[][] {
	if (columnIndex === null || direction === null) {
		return rows
	}
	
	const sorted = [...rows].sort((a, b) => {
		const aVal = a[columnIndex] || ''
		const bVal = b[columnIndex] || ''
		
		// 尝试转换为数字比较
		const aNum = parseFloat(aVal.replace(/[^0-9.-]/g, ''))
		const bNum = parseFloat(bVal.replace(/[^0-9.-]/g, ''))
		
		if (!isNaN(aNum) && !isNaN(bNum)) {
			return direction === 'asc' ? aNum - bNum : bNum - aNum
		}
		
		// 字符串比较
		return direction === 'asc'
			? aVal.localeCompare(bVal, 'zh-CN')
			: bVal.localeCompare(aVal, 'zh-CN')
	})
	
	return sorted
}

// ============================================
// 主组件
// ============================================

export const CaseSummaryTablesCard = memo(function CaseSummaryTablesCard({
	caseTablesData,
	className,
	isLoading = false,
	loadingProgress = 0,
	totalCount = 0,
	tableSortOrder,
	reportScore,
	scoringConfig,
}: CaseSummaryTablesCardProps) {
	const { toast } = useToast()
	
	// 状态管理
	const [activeTableTab, setActiveTableTab] = useState<string>('')
	const [selectedCases, setSelectedCases] = useState<string[]>([]) // 空数组表示全选
	const [sortColumn, setSortColumn] = useState<number | null>(null)
	const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null)
	const [copiedTableName, setCopiedTableName] = useState<string | null>(null)
	const [isExpanded, setIsExpanded] = useState(false) // 是否展开全部数据
	const [expandAllTables, setExpandAllTables] = useState(false) // 是否平铺显示所有表格
	
	// 所有用例名列表
	const allCaseNames = useMemo(() => {
		return caseTablesData.map(({ caseInfo }) => caseInfo.name)
	}, [caseTablesData])
	
	// 合并表格数据（根据评分配置重排列顺序）
	const mergedTables = useMemo(() => {
		return mergeCaseTables(caseTablesData, selectedCases, tableSortOrder, scoringConfig)
	}, [caseTablesData, selectedCases, tableSortOrder, scoringConfig])
	
	// 初始化激活的表格标签页
	useEffect(() => {
		if (mergedTables.length > 0 && !activeTableTab) {
			setActiveTableTab(mergedTables[0].name)
		}
	}, [mergedTables, activeTableTab])
	
	// 获取当前激活的表格
	const currentTable = useMemo(() => {
		return mergedTables.find(t => t.name === activeTableTab)
	}, [mergedTables, activeTableTab])
	
	// 应用排序
	const sortedRows = useMemo(() => {
		if (!currentTable) return []
		return sortTableRows(currentTable.rows, sortColumn, sortDirection)
	}, [currentTable, sortColumn, sortDirection])
	
	// 处理表头点击（排序）
	const handleHeaderClick = (columnIndex: number) => {
		if (sortColumn === columnIndex) {
			// 同一列：切换排序方向
			if (sortDirection === 'asc') {
				setSortDirection('desc')
			} else if (sortDirection === 'desc') {
				setSortDirection(null)
				setSortColumn(null)
			} else {
				setSortDirection('asc')
			}
		} else {
			// 不同列：从升序开始
			setSortColumn(columnIndex)
			setSortDirection('asc')
		}
	}
	
	/**
	 * 渲染带评分标记的单元格
	 * @param cell - 单元格值
	 * @param caseName - 用例名（第一列的值）
	 * @param columnName - 列名（表头）
	 * @param rowData - 当前行的所有数据（用于构建 row_data 匹配）
	 * @param headers - 表头列表
	 */
	const renderScoredCell = (
		cell: string,
		caseName: string,
		columnName: string,
		rowData: string[],
		headers: string[]
	) => {
		// 构建 row_data 对象用于匹配
		const rowDataObj: Record<string, string> = {}
		headers.forEach((h, i) => {
			rowDataObj[h] = rowData[i]
		})
		
		// 查找该单元格的评分信息
		const scores = findMetricScores(reportScore, caseName, columnName, rowDataObj)
		
		if (scores.length === 0) {
			// 无评分，直接返回原始值
			return cell
		}
		
		// 取第一个匹配的评分
		const metricScore = scores[0]
		
		// 检查是否未命中评分规则
		const isUnmatched = metricScore.matched === false
		
		// 未命中时使用灰色样式
		const unmatchedColors = {
			bg: 'bg-gray-100 dark:bg-gray-800',
			text: 'text-gray-500 dark:text-gray-400',
			border: 'border-gray-200 dark:border-gray-700'
		}
		
		const level = metricScore.level as keyof typeof LEVEL_COLORS
		const levelColors = isUnmatched ? unmatchedColors : (LEVEL_COLORS[level] || LEVEL_COLORS.normal)
		const levelLabel = isUnmatched ? '未命中' : (LEVEL_LABELS[level as keyof typeof LEVEL_LABELS] || level)
		const levelEmoji = isUnmatched ? '⚪' : (LEVEL_EMOJIS[level as keyof typeof LEVEL_EMOJIS] || '📊')
		
		// 获取命中的评分规则
		const { matchedRule, scoringType } = getMatchedScoringRule(
			scoringConfig, 
			metricScore.name || metricScore.metric_name,
			metricScore.value
		)
		
		return (
			<Popover>
				<PopoverTrigger asChild>
					<button
						className={cn(
							"inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border cursor-pointer transition-all",
							"hover:shadow-sm",
							levelColors.bg,
							levelColors.border
						)}
					>
						<span className={cn("font-medium", levelColors.text)}>{cell}</span>
						<Badge 
							variant="secondary" 
							className={cn(
								"text-[10px] px-1 py-0 h-4 font-normal",
								levelColors.bg,
								levelColors.text
							)}
						>
							{isUnmatched ? '未参评' : levelLabel}
						</Badge>
					</button>
				</PopoverTrigger>
				<PopoverContent className="w-80 p-3" align="start">
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<span className="font-medium text-sm">{metricScore.display_name}</span>
							<Badge className={cn("text-xs", levelColors.bg, levelColors.text)}>
								{levelEmoji} {levelLabel}
							</Badge>
						</div>
						{isUnmatched ? (
							<div className="text-sm text-muted-foreground bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-2">
								<div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium mb-1">
									<span>⚠️</span>
									<span>未命中任何评分规则</span>
								</div>
								<div className="text-xs text-amber-700 dark:text-amber-300">
									该指标值 ({cell}) 未匹配到配置的任何阈值或区间条件，不参与报告总分计算。请检查评分标准配置是否覆盖了所有可能的值范围。
								</div>
							</div>
						) : (
							<>
								<div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
									<div className="text-muted-foreground">表格值</div>
									<div className="font-mono">{cell}</div>
									<div className="text-muted-foreground">得分</div>
									<div className="font-bold">{metricScore.score}</div>
									<div className="text-muted-foreground">权重</div>
									<div>{(metricScore.weight * 100).toFixed(1)}%</div>
									<div className="text-muted-foreground">贡献</div>
									<div>{metricScore.weighted_score.toFixed(2)}</div>
								</div>
								{matchedRule && (
									<div className="pt-2 border-t">
										<div className="text-xs text-muted-foreground mb-1">
											{scoringType === 'threshold' ? '命中阈值：' : '命中区间：'}
										</div>
										<div className={cn(
											"text-sm font-medium px-2 py-1.5 rounded whitespace-pre-line",
											levelColors.bg, levelColors.text
										)}>
											{matchedRule}
										</div>
									</div>
								)}
							</>
						)}
					</div>
				</PopoverContent>
			</Popover>
		)
	}
	
	// 复制表格到剪贴板
	const handleCopyTable = async () => {
		if (!currentTable) return
		
		const tableData = [currentTable.headers, ...sortedRows]
		const success = await copyTableToClipboard(tableData)
		
		if (success) {
			setCopiedTableName(currentTable.name)
			setTimeout(() => setCopiedTableName(null), 2000)
			
			toast({
				title: '复制成功',
				description: `表格"${currentTable.name}"已复制到剪贴板`,
			})
		} else {
			toast({
				title: '复制失败',
				description: '无法复制到剪贴板，请手动选择并复制',
				variant: 'destructive',
			})
		}
	}
	
	// 导出表格为 CSV 文件
	const handleExportCSV = () => {
		if (!currentTable) return
		
		const tableData = [currentTable.headers, ...sortedRows]
		const success = exportTableAsCSV(tableData, currentTable.name)
		
		if (success) {
			toast({
				title: '导出成功',
				description: `已导出 ${currentTable.name}.csv`,
			})
		} else {
			toast({
				title: '导出失败',
				description: '无法导出 CSV 文件',
				variant: 'destructive',
			})
		}
	}
	
	// 切换用例选择
	const toggleCaseSelection = (caseName: string) => {
		if (selectedCases.length === 0) {
			// 当前是全选状态，切换到只选其他用例
			setSelectedCases(allCaseNames.filter(name => name !== caseName))
		} else {
			const isSelected = selectedCases.includes(caseName)
			if (isSelected) {
				const newSelected = selectedCases.filter(name => name !== caseName)
				// 如果取消后为空，表示全不选，但我们不允许这样，至少保留一个
				if (newSelected.length === 0) {
					setSelectedCases([])
				} else {
					setSelectedCases(newSelected)
				}
			} else {
				const newSelected = [...selectedCases, caseName]
				// 如果全选了，设置为空数组（表示全选）
				if (newSelected.length === allCaseNames.length) {
					setSelectedCases([])
				} else {
					setSelectedCases(newSelected)
				}
			}
		}
		
		// 重置排序
		setSortColumn(null)
		setSortDirection(null)
	}
	
	// 如果没有数据，不渲染
	if (caseTablesData.length === 0 || mergedTables.length === 0) {
		return null
	}
	
	// 计算选中的用例数
	const selectedCaseCount = selectedCases.length === 0 ? allCaseNames.length : selectedCases.length
	
	return (
		<Card className={className}>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle className="text-xl">数据总览</CardTitle>
						<CardDescription className="mt-1">
							对比查看所有用例的汇总数据
							{selectedCaseCount < allCaseNames.length && (
								<span className="ml-2 text-primary">
									（已筛选 {selectedCaseCount}/{allCaseNames.length} 个用例）
								</span>
							)}
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent className="px-6 pb-6">
				{/* 标签页和工具栏 */}
				<Tabs value={activeTableTab} onValueChange={setActiveTableTab}>
					<div className={cn(
						"flex items-center gap-4 mb-4",
						expandAllTables ? "justify-end" : "justify-between"
					)}>
						{/* 左侧：表格标签页（平铺模式下隐藏） */}
						{!expandAllTables && (
							<TabsList className="shrink-0">
								{mergedTables.map((table) => (
									<TabsTrigger 
										key={table.name} 
										value={table.name}
										className="data-[state=active]:bg-background data-[state=active]:text-emerald-600 data-[state=active]:shadow-sm"
									>
										{table.name}
									</TabsTrigger>
								))}
							</TabsList>
						)}
						
						{/* 右侧：工具按钮 */}
						<div className="flex items-center gap-2 shrink-0">
							{/* 用例筛选器 */}
							<DropdownMenu>
								<TooltipProvider>
									<Tooltip>
										<TooltipTrigger asChild>
											<DropdownMenuTrigger asChild>
												<Button variant="outline" size="sm">
													<FilterIcon className="size-4 mr-2" />
													筛选用例
													{selectedCaseCount < allCaseNames.length && (
														<span className="ml-1 text-xs">({selectedCaseCount})</span>
													)}
													<ChevronDownIcon className="size-4 ml-2" />
												</Button>
											</DropdownMenuTrigger>
										</TooltipTrigger>
										<TooltipContent>筛选要显示的用例</TooltipContent>
									</Tooltip>
								</TooltipProvider>
								<DropdownMenuContent align="end" className="w-56">
									<div className="flex items-center justify-between px-2 py-2">
										<DropdownMenuLabel className="p-0">选择用例</DropdownMenuLabel>
										<Button
											variant="ghost"
											size="sm"
											className="h-7 text-xs px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
											onClick={() => {
												const isAllSelected = selectedCases.length === 0
												if (isAllSelected) {
													// 当前是全选状态，点击"反选"后只选第一个
													setSelectedCases([allCaseNames[0]])
												} else {
													// 当前是部分选择或只选一个，点击"全选"后全选
													setSelectedCases([])
												}
												// 重置排序
												setSortColumn(null)
												setSortDirection(null)
											}}
										>
											{selectedCases.length === 0 ? '反选' : '全选'}
										</Button>
									</div>
									<DropdownMenuSeparator />
									{allCaseNames.map((caseName) => {
										const isSelected = selectedCases.length === 0 || selectedCases.includes(caseName)
										return (
											<DropdownMenuCheckboxItem
												key={caseName}
												checked={isSelected}
												onCheckedChange={() => toggleCaseSelection(caseName)}
												onSelect={(e) => e.preventDefault()}
												className="[&>span]:data-[state=checked]:text-emerald-600"
											>
												{caseName}
											</DropdownMenuCheckboxItem>
										)
									})}
								</DropdownMenuContent>
							</DropdownMenu>
							
							{/* 复制按钮（平铺模式下禁用） */}
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="outline"
											size="sm"
											onClick={handleCopyTable}
											disabled={!currentTable || expandAllTables}
										>
											{copiedTableName === currentTable?.name ? (
												<CheckIcon className="size-4 text-green-500" />
											) : (
												<CopyIcon className="size-4" />
											)}
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										{expandAllTables ? '平铺模式下不可用' : (copiedTableName === currentTable?.name ? '已复制' : '复制表格到剪贴板')}
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
							
							{/* 导出按钮（平铺模式下禁用） */}
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="outline"
											size="sm"
											onClick={handleExportCSV}
											disabled={!currentTable || expandAllTables}
										>
											<DownloadIcon className="size-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										{expandAllTables ? '平铺模式下不可用' : '导出为 CSV 文件'}
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
							
							{/* 切换视图模式按钮 */}
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="outline"
											size="sm"
											onClick={() => setExpandAllTables(!expandAllTables)}
										>
											{expandAllTables ? (
												<LayoutListIcon className="size-4" />
											) : (
												<LayoutGridIcon className="size-4" />
											)}
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										{expandAllTables ? '切换到标签页视图' : '切换到平铺视图'}
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
					</div>
				</Tabs>
				
				{/* 表格内容 */}
				{isLoading ? (
					<div className="flex items-center justify-center py-20">
						<div className="flex flex-col items-center gap-3">
							<div className="size-8 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
							<p className="text-sm text-muted-foreground">
								加载中... {loadingProgress > 0 && totalCount > 0 && `${loadingProgress}/${totalCount}`}
							</p>
						</div>
					</div>
				) : expandAllTables ? (
					// 平铺模式：显示所有表格
					<div className="space-y-6">
						{mergedTables.map((table) => {
							const tableSortedRows = sortTableRows(table.rows, sortColumn, sortDirection)
							return (
								<div key={table.name} className="border rounded-lg overflow-hidden">
									{/* 表格标题 */}
									<div className="px-4 py-3 bg-muted/30 border-b">
										<h3 className="font-semibold text-base">{table.name}</h3>
									</div>
									
									{/* 表格容器 */}
									<div className="overflow-auto case-tabs-scroll max-h-96">
										<table className="w-full border-collapse min-w-max">
											{/* 表头 */}
											<thead className="bg-table-header sticky top-0 z-10 backdrop-blur-sm">
												<tr>
													{/* 编号列 */}
													<th className="px-4 py-3 text-center text-sm font-semibold w-16 border-b whitespace-nowrap">
														编号
													</th>
													{table.headers.map((header, index) => (
														<th
															key={index}
															className={cn(
																'px-4 py-3 text-sm font-semibold border-b whitespace-nowrap',
																index === 0 ? 'text-left min-w-40' : 'text-center min-w-32'
															)}
														>
															<span className="whitespace-nowrap">{header}</span>
														</th>
													))}
												</tr>
											</thead>
											
											{/* 表体 */}
											<tbody>
												{tableSortedRows.length === 0 ? (
													<tr>
														<td
															colSpan={table.headers.length + 1}
															className="px-4 py-8 text-center text-muted-foreground"
														>
															暂无数据
														</td>
													</tr>
												) : (
													tableSortedRows.map((row, rowIndex) => {
														// 第一列是用例名
														const caseName = row[0]
														return (
															<tr
																key={rowIndex}
																className="hover:bg-muted/50 transition-colors border-b last:border-b-0"
															>
																{/* 编号列 */}
																<td className="px-4 py-2 text-center text-sm text-muted-foreground whitespace-nowrap">
																	{rowIndex + 1}
																</td>
																{row.map((cell, cellIndex) => {
																	const columnName = table.headers[cellIndex]
																	// 第一列（用例名）不需要评分标记，其他列检查是否有评分
																	const shouldShowScore = cellIndex > 0 && reportScore
																	
																	return (
																		<td
																			key={cellIndex}
																			className={cn(
																				'px-4 py-2 text-sm whitespace-nowrap',
																				cellIndex === 0 ? 'text-left font-medium min-w-40' : 'text-center min-w-32'
																			)}
																		>
																			{shouldShowScore 
																				? renderScoredCell(cell, caseName, columnName, row, table.headers)
																				: cell
																			}
																		</td>
																	)
																})}
															</tr>
														)
													})
												)}
											</tbody>
										</table>
									</div>
								</div>
							)
						})}
					</div>
				) : currentTable ? (
					<div className="border rounded-lg overflow-hidden">
						{/* 表格容器 - 限制高度，支持横向和纵向滚动 */}
						<div 
							className="overflow-auto case-tabs-scroll"
							style={
								!isExpanded && sortedRows.length > 5
									? { maxHeight: '348px' }  // 表头(~53px) + 5行数据(~43px each) ≈ 268px
									: undefined
							}
						>
							<table className="w-full border-collapse min-w-max">
								{/* 表头 */}
								<thead className="bg-table-header sticky top-0 z-10 backdrop-blur-sm">
									<tr>
										{/* 编号列 */}
										<th className="px-4 py-3 text-center text-sm font-semibold w-16 border-b whitespace-nowrap">
											编号
										</th>
										{currentTable.headers.map((header, index) => {
											const isSorted = sortColumn === index
											return (
												<th
													key={index}
													className={cn(
														'px-4 py-3 text-sm font-semibold border-b cursor-pointer transition-colors whitespace-nowrap',
														index === 0 ? 'text-left min-w-40' : 'text-center min-w-32'
													)}
													onClick={() => handleHeaderClick(index)}
												>
													<div className={cn(
														"flex items-center gap-2 rounded-md px-2 py-1 -mx-2 -my-1 transition-colors whitespace-nowrap",
														index === 0 ? 'justify-start' : 'justify-center',
														isSorted 
															? 'bg-emerald-500/10 hover:bg-emerald-500/15' 
															: 'hover:bg-accent/50'
													)}>
														<span className="whitespace-nowrap">{header}</span>
														{isSorted ? (
															sortDirection === 'asc' ? (
																<ArrowUpIcon className="size-4 text-emerald-600" />
															) : (
																<ArrowDownIcon className="size-4 text-emerald-600" />
															)
														) : (
															<ArrowUpDownIcon className="size-4 text-muted-foreground/50" />
														)}
													</div>
												</th>
											)
										})}
									</tr>
								</thead>
								
								{/* 表体 */}
								<tbody>
									{sortedRows.length === 0 ? (
										<tr>
											<td
												colSpan={currentTable.headers.length + 1}
												className="px-4 py-8 text-center text-muted-foreground"
											>
												暂无数据
											</td>
										</tr>
									) : (
										sortedRows.map((row, rowIndex) => {
											// 第一列是用例名
											const caseName = row[0]
											return (
												<tr
													key={rowIndex}
													className="hover:bg-muted/50 transition-colors border-b last:border-b-0"
												>
													{/* 编号列 */}
													<td className="px-4 py-2 text-center text-sm text-muted-foreground whitespace-nowrap">
														{rowIndex + 1}
													</td>
													{row.map((cell, cellIndex) => {
														const columnName = currentTable.headers[cellIndex]
														// 第一列（用例名）不需要评分标记，其他列检查是否有评分
														const shouldShowScore = cellIndex > 0 && reportScore
														
														return (
															<td
																key={cellIndex}
																className={cn(
																	'px-4 py-2 text-sm whitespace-nowrap',
																	cellIndex === 0 ? 'text-left font-medium min-w-40' : 'text-center min-w-32'
																)}
															>
																{shouldShowScore 
																	? renderScoredCell(cell, caseName, columnName, row, currentTable.headers)
																	: cell
																}
															</td>
														)
													})}
												</tr>
											)
										})
									)}
								</tbody>
							</table>
						</div>
						
						{/* 底部提示 */}
						{sortedRows.length > 5 && (
							<button
								onClick={() => setIsExpanded(!isExpanded)}
								className="w-full px-4 py-2 text-xs text-muted-foreground bg-muted/30 text-center border-t hover:bg-muted/50 transition-colors cursor-pointer"
							>
								共 {sortedRows.length} 行数据，{isExpanded ? '收起' : '点击展开全部'}
							</button>
						)}
					</div>
				) : null}
			</CardContent>
		</Card>
	)
})

export default CaseSummaryTablesCard

