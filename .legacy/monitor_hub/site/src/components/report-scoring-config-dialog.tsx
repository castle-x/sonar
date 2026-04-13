import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
	DropdownMenuLabel,
	DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/use-toast'
import { 
	PlusIcon, 
	XIcon, 
	ChevronDownIcon, 
	ChevronRightIcon, 
	Loader2Icon, 
	SparklesIcon,
	ArrowUpIcon,
	ArrowDownIcon,
	CopyIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { 
	updateReport, 
	getReport, 
	listReports,
	calculateReportScore,
	type ReportRecord, 
	type ReportScoringConfig, 
	type MetricScoringConfig, 
	type ScoringRange,
	type ThresholdCondition 
} from '@/apis/report'
import { getDatasource, type DatasourceRecord, type MetricConfig } from '@/apis/datasource'

// 有评分配置的历史报告
interface HistoryReportOption {
	id: string
	name: string
	datasource_name?: string
	scoring_config: ReportScoringConfig
	scoring_config_name?: string  // 评分标准名称
}

// 按评分标准名称分组的结构
interface GroupedHistoryReports {
	configName: string
	reports: HistoryReportOption[]
}

interface ReportScoringConfigDialogProps {
	reportId: string
	open: boolean
	onOpenChange: (open: boolean) => void
	onSuccess?: () => void
}

// 预设的指标模板
const METRIC_TEMPLATES = {
	cpu: {
		name: 'cpu_usage',
		alias: 'CPU使用率',
		unit: '%',
		weight: 1,
		aggregation_types: ['avg'],
		scoring_type: 'range' as const,
		ranges: [
			{ min: 0, max: 100, score: 100, label: '中风险', color: '#eab308', level: 'normal' }
		],
		thresholds: []
	},
	memory: {
		name: 'memory_usage',
		alias: '内存使用率',
		unit: '%',
		weight: 1,
		aggregation_types: ['avg'],
		scoring_type: 'range' as const,
		ranges: [
			{ min: 0, max: 100, score: 100, label: '中风险', color: '#eab308', level: 'normal' }
		],
		thresholds: []
	},
	response_time: {
		name: 'response_time',
		alias: '响应时间',
		unit: 'ms',
		weight: 1.5,
		aggregation_types: ['p95'],
		scoring_type: 'range' as const,
		ranges: [
			{ min: 0, max: 1000, score: 100, label: '中风险', color: '#eab308', level: 'normal' }
		],
		thresholds: []
	}
}

// 默认单个区间（添加新指标时使用）
const DEFAULT_SINGLE_RANGE: ScoringRange[] = [
	{ min: 0, max: 100, score: 100, label: '中风险', color: '#eab308', level: 'normal' }
]

// 默认5个均匀区间（用于"生成均匀区间"按钮）
const DEFAULT_EVEN_RANGES: ScoringRange[] = [
	{ min: 0, max: 20, score: 100, label: '低风险', color: '#10b981', level: 'excellent' },
	{ min: 20, max: 40, score: 80, label: '中低风险', color: '#3b82f6', level: 'good' },
	{ min: 40, max: 60, score: 60, label: '中风险', color: '#eab308', level: 'normal' },
	{ min: 60, max: 80, score: 40, label: '中高风险', color: '#f97316', level: 'warning' },
	{ min: 80, max: 100, score: 20, label: '高风险', color: '#ef4444', level: 'danger' }
]

// 默认单个阈值条件（添加新阈值评分指标时使用）
const DEFAULT_SINGLE_THRESHOLD: ThresholdCondition[] = [
	{ operator: '=', value: 0, score: 100, label: '低风险', color: '#10b981', level: 'excellent' }
]

// 阈值运算符选项
const THRESHOLD_OPERATORS = [
	{ value: '<', label: '<' },
	{ value: '<=', label: '≤' },
	{ value: '=', label: '=' },
	{ value: '>=', label: '≥' },
	{ value: '>', label: '>' },
] as const

type MetricItem = MetricScoringConfig & {
	expanded: boolean
}

export function ReportScoringConfigDialog({ 
	reportId, 
	open, 
	onOpenChange, 
	onSuccess 
}: ReportScoringConfigDialogProps) {
	const { toast } = useToast()
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const [report, setReport] = useState<ReportRecord | null>(null)
	const [datasource, setDatasource] = useState<DatasourceRecord | null>(null)
	const [metrics, setMetrics] = useState<MetricItem[]>([])
	const [metricTemplates, setMetricTemplates] = useState<MetricConfig[]>([])
	const [historyReports, setHistoryReports] = useState<HistoryReportOption[]>([])
	const [groupedHistoryReports, setGroupedHistoryReports] = useState<GroupedHistoryReports[]>([])
	const [selectedTemplateValue, setSelectedTemplateValue] = useState<string>('')
	const [configName, setConfigName] = useState<string>('')  // 评分标准名称

	// 加载报告数据
	useEffect(() => {
		if (open && reportId) {
			loadReport()
		}
	}, [open, reportId])

	const loadReport = async () => {
		try {
			setLoading(true)
			const data = await getReport(reportId)
			setReport(data)

			// 加载已有配置或初始化为空
			if (data.scoring_config?.default_config?.metric_configs) {
				setMetrics(data.scoring_config.default_config.metric_configs.map(m => ({
					...m,
					scoring_type: m.scoring_type || 'range', // 兼容旧数据
					ranges: m.ranges || [],
					thresholds: m.thresholds || [],
					expanded: false
				})))
				setConfigName(data.scoring_config.name || '')  // 加载评分标准名称
			} else {
				setMetrics([])
				setConfigName('')  // 重置评分标准名称
			}

			// 根据数据源ID加载数据源，获取groupmap中的指标配置作为模板
			if (data.datasource_id) {
				await loadDatasource(data.datasource_id)
			}

			// 加载有评分配置的历史报告
			await loadHistoryReports()
		} catch (err) {
			toast({
				title: '加载失败',
				description: err instanceof Error ? err.message : '加载报告失败',
				variant: 'destructive'
			})
		} finally {
			setLoading(false)
		}
	}

	// 按评分标准名称分组
	const groupReportsByConfigName = (reports: HistoryReportOption[]): GroupedHistoryReports[] => {
		const groupMap = new Map<string, HistoryReportOption[]>()
		
		reports.forEach(report => {
			const key = report.scoring_config_name || '未命名配置'
			if (!groupMap.has(key)) {
				groupMap.set(key, [])
			}
			groupMap.get(key)!.push(report)
		})
		
		const result: GroupedHistoryReports[] = []
		let unnamedReports: HistoryReportOption[] | undefined
		
		groupMap.forEach((reports, configName) => {
			if (configName === '未命名配置') {
				unnamedReports = reports
			} else {
				result.push({ configName, reports })
			}
		})
		
		// 有名称的按字母排序
		result.sort((a, b) => a.configName.localeCompare(b.configName))
		
		// 未命名配置放最后
		if (unnamedReports) {
			result.push({ configName: '未命名配置', reports: unnamedReports })
		}
		
		return result
	}

	// 加载有评分配置的历史报告（用于复制配置）
	const loadHistoryReports = async () => {
		try {
			const result = await listReports({
				page: 1,
				page_size: 9999,
				// 服务端过滤：只查询有评分配置的报告（MongoDB 中 Resource 是 inline 存储，字段在顶层）
				query: JSON.stringify({
					"scoring_config": { "$exists": true }
				}),
				// 投影裁剪：只返回需要的字段，减小响应体（6.7MB → 262KB）
				projection: JSON.stringify({
					"name": 1,
					"datasource_name": 1,
					"scoring_config": 1,
					"createdAt": 1,
					"updatedAt": 1
				})
			})
			// 排除当前报告
			const reportsWithConfig = result.list
				.filter(r => r.id !== reportId)
				.map(r => ({
					id: r.id,
					name: r.name,
					datasource_name: r.datasource_name,
					scoring_config: r.scoring_config!,
					scoring_config_name: r.scoring_config?.name  // 提取评分标准名称
				}))
			setHistoryReports(reportsWithConfig)
			// 按评分标准名称分组
			const grouped = groupReportsByConfigName(reportsWithConfig)
			setGroupedHistoryReports(grouped)
			console.log('📦 加载历史报告:', reportsWithConfig.length, '个有评分配置，分为', grouped.length, '组')
		} catch (err) {
			console.error('加载历史报告失败:', err)
			// 不影响主流程
		}
	}

	// 从历史报告复制配置
	const copyConfigFromReport = (historyReport: HistoryReportOption) => {
		if (historyReport.scoring_config?.default_config?.metric_configs) {
			const copiedMetrics = historyReport.scoring_config.default_config.metric_configs.map(m => ({
				...m,
				scoring_type: m.scoring_type || 'range', // 兼容旧数据
				// 深拷贝 ranges
				ranges: (m.ranges || []).map(r => ({ ...r })),
				// 深拷贝 thresholds
				thresholds: (m.thresholds || []).map(t => ({ ...t })),
				expanded: false
			}))
			setMetrics(copiedMetrics)
			
			// 复制配置名称（加上"副本"后缀）
			const originalName = historyReport.scoring_config.name
			setConfigName(originalName ? `${originalName} (副本)` : '')
			
			toast({
				title: '配置已复制',
				description: `已从${originalName ? `"${originalName}"` : `报告 "${historyReport.name}"`} 复制 ${copiedMetrics.length} 个指标配置`,
			})
		}
	}

	const loadDatasource = async (datasourceId: string) => {
		try {
			const data = await getDatasource(datasourceId)
			setDatasource(data)

			// 从groupmap中提取所有MetricConfig作为模板
			const templates: MetricConfig[] = []
			if (data.groupmap) {
				Object.values(data.groupmap).forEach((metricConfigs) => {
					templates.push(...metricConfigs)
				})
			}
			console.log('📦 加载的指标模板:', templates)
			setMetricTemplates(templates)
		} catch (err) {
			console.error('加载数据源失败:', err)
			// 数据源加载失败不影响主流程，只是没有模板可用
		}
	}

	// 从数据源的MetricConfig创建评分配置
	const addMetricFromDatasource = (metricConfig: MetricConfig) => {
		// 将 MetricConfig 转换为 MetricScoringConfig
		const newMetric: MetricItem = {
			name: metricConfig.name,
			alias: metricConfig.alias,
			unit: metricConfig.unit,
			transform: metricConfig.transform,
			weight: 1,
			aggregation_types: ['avg'], // 默认使用avg，用户可以修改
			scoring_type: 'range', // 默认使用区间评分
			ranges: [...DEFAULT_SINGLE_RANGE], // 使用单个默认区间
			thresholds: [],
			expanded: true
		}
		// 使用函数式更新以确保基于最新状态
		setMetrics(prev => [...prev, newMetric])
	}

	// 从模板添加指标（保留旧的模板功能）
	const addMetricFromTemplate = (template: keyof typeof METRIC_TEMPLATES) => {
		const templateData = METRIC_TEMPLATES[template]
		setMetrics(prev => [...prev, {
			...templateData,
			expanded: true
		}])
	}

	// 添加自定义指标
	const addCustomMetric = () => {
		setMetrics(prev => [...prev, {
			name: '',
			alias: '',
			weight: 1,
			unit: '%',
			aggregation_types: ['avg'],
			scoring_type: 'range', // 默认使用区间评分
			ranges: [...DEFAULT_SINGLE_RANGE],
			thresholds: [],
			expanded: true
		}])
	}

	// 删除指标
	const removeMetric = (index: number) => {
		setMetrics(metrics.filter((_, i) => i !== index))
	}

	// 上移指标
	const moveMetricUp = (index: number) => {
		if (index === 0) return
		const newMetrics = [...metrics]
		;[newMetrics[index - 1], newMetrics[index]] = [newMetrics[index], newMetrics[index - 1]]
		setMetrics(newMetrics)
	}

	// 下移指标
	const moveMetricDown = (index: number) => {
		if (index === metrics.length - 1) return
		const newMetrics = [...metrics]
		;[newMetrics[index], newMetrics[index + 1]] = [newMetrics[index + 1], newMetrics[index]]
		setMetrics(newMetrics)
	}

	// 切换展开/折叠
	const toggleExpanded = (index: number) => {
		const newMetrics = [...metrics]
		newMetrics[index].expanded = !newMetrics[index].expanded
		setMetrics(newMetrics)
	}

	// 更新指标字段
	const updateMetric = (index: number, field: keyof MetricScoringConfig, value: any) => {
		const newMetrics = [...metrics]
		newMetrics[index] = { ...newMetrics[index], [field]: value }
		setMetrics(newMetrics)
	}

	// 复制指标
	const duplicateMetric = (index: number) => {
		const metric = metrics[index]
		const newMetric = {
			...metric,
			name: `${metric.name}_copy`,
			alias: `${metric.alias || metric.name} (副本)`,
			expanded: true
		}
		setMetrics(prev => [...prev, newMetric])
	}

	// 添加区间
	const addRange = (metricIndex: number) => {
		const newMetrics = [...metrics]
		const ranges = newMetrics[metricIndex].ranges || []
		const lastRange = ranges[ranges.length - 1]
		const newRange: ScoringRange = {
			min: lastRange?.max || 0,
			max: (lastRange?.max || 0) + 20,
			score: 50,
			label: '中风险',
			color: '#eab308',
			level: 'normal'
		}
		newMetrics[metricIndex].ranges = [...ranges, newRange]
		setMetrics(newMetrics)
	}

	// 删除区间
	const removeRange = (metricIndex: number, rangeIndex: number) => {
		const newMetrics = [...metrics]
		const ranges = newMetrics[metricIndex].ranges || []
		newMetrics[metricIndex].ranges = ranges.filter((_, i) => i !== rangeIndex)
		setMetrics(newMetrics)
	}

	// 更新区间
	const updateRange = (metricIndex: number, rangeIndex: number, field: keyof ScoringRange, value: any) => {
		const newMetrics = [...metrics]
		const ranges = newMetrics[metricIndex].ranges || []
		ranges[rangeIndex] = {
			...ranges[rangeIndex],
			[field]: value
		}
		newMetrics[metricIndex].ranges = ranges
		setMetrics(newMetrics)
	}

	// 自动生成均匀区间
	const generateEvenRanges = (metricIndex: number) => {
		const metric = metrics[metricIndex]
		const min = 0
		const max = metric.unit === 'ms' ? 1000 : 100
		const step = (max - min) / 5
		
		const newRanges: ScoringRange[] = [
			{ min: min, max: min + step, score: 100, label: '低风险', color: '#10b981', level: 'excellent' },
			{ min: min + step, max: min + step * 2, score: 80, label: '中低风险', color: '#3b82f6', level: 'good' },
			{ min: min + step * 2, max: min + step * 3, score: 60, label: '中风险', color: '#eab308', level: 'normal' },
			{ min: min + step * 3, max: min + step * 4, score: 40, label: '中高风险', color: '#f97316', level: 'warning' },
			{ min: min + step * 4, max: max, score: 20, label: '高风险', color: '#ef4444', level: 'danger' }
		]
		
		updateMetric(metricIndex, 'ranges', newRanges)
	}

	// 添加阈值条件
	const addThreshold = (metricIndex: number) => {
		const newMetrics = [...metrics]
		const thresholds = newMetrics[metricIndex].thresholds || []
		const newThreshold: ThresholdCondition = {
			operator: '>=',
			value: 0,
			score: 60,
			label: '中风险',
			color: '#eab308',
			level: 'normal'
		}
		newMetrics[metricIndex].thresholds = [...thresholds, newThreshold]
		setMetrics(newMetrics)
	}

	// 删除阈值条件
	const removeThreshold = (metricIndex: number, thresholdIndex: number) => {
		const newMetrics = [...metrics]
		const thresholds = newMetrics[metricIndex].thresholds || []
		newMetrics[metricIndex].thresholds = thresholds.filter((_, i) => i !== thresholdIndex)
		setMetrics(newMetrics)
	}

	// 更新阈值条件
	const updateThreshold = (metricIndex: number, thresholdIndex: number, field: keyof ThresholdCondition, value: any) => {
		const newMetrics = [...metrics]
		const thresholds = newMetrics[metricIndex].thresholds || []
		thresholds[thresholdIndex] = {
			...thresholds[thresholdIndex],
			[field]: value
		}
		newMetrics[metricIndex].thresholds = thresholds
		setMetrics(newMetrics)
	}

	// 切换评分类型
	const toggleScoringType = (metricIndex: number, newType: 'range' | 'threshold') => {
		const newMetrics = [...metrics]
		newMetrics[metricIndex].scoring_type = newType
		
		if (newType === 'threshold') {
			// 切换到阈值模式：清空区间配置，初始化阈值配置
			newMetrics[metricIndex].ranges = []
			if (!newMetrics[metricIndex].thresholds || newMetrics[metricIndex].thresholds!.length === 0) {
				newMetrics[metricIndex].thresholds = [...DEFAULT_SINGLE_THRESHOLD]
			}
		} else {
			// 切换到区间模式：清空阈值配置，初始化区间配置
			newMetrics[metricIndex].thresholds = []
			if (!newMetrics[metricIndex].ranges || newMetrics[metricIndex].ranges!.length === 0) {
				newMetrics[metricIndex].ranges = [...DEFAULT_SINGLE_RANGE]
			}
		}
		setMetrics(newMetrics)
	}

	// 保存配置
	const handleSave = async () => {
		// 验证
		if (metrics.length === 0) {
			toast({
				title: '配置不完整',
				description: '请至少添加一个指标',
				variant: 'destructive'
			})
			return
		}

		for (const metric of metrics) {
			const displayName = metric.alias || metric.name || '未命名指标'
			
			if (!metric.name) {
				toast({
					title: '配置不完整',
					description: '请填写所有指标的名称',
					variant: 'destructive'
				})
				return
			}
			if (metric.weight <= 0) {
				toast({
					title: '配置错误',
					description: '指标权重必须大于0',
					variant: 'destructive'
				})
				return
			}
			if (!metric.aggregation_types || metric.aggregation_types.length === 0) {
				toast({
					title: '配置不完整',
					description: `指标"${displayName}"必须至少选择一个聚合类型`,
					variant: 'destructive'
				})
				return
			}
			// 根据评分类型验证
			if (metric.scoring_type === 'threshold') {
				if (!metric.thresholds || metric.thresholds.length === 0) {
					toast({
						title: '配置不完整',
						description: `指标"${displayName}"必须至少有一个阈值条件`,
						variant: 'destructive'
					})
					return
				}
			} else {
				// 默认为 range 类型
				if (!metric.ranges || metric.ranges.length === 0) {
					toast({
						title: '配置不完整',
						description: `指标"${displayName}"必须至少有一个评分区间`,
						variant: 'destructive'
					})
					return
				}
			}
		}

		try {
			setSaving(true)

			// 构建评分配置（清理不需要的配置，只保留当前评分类型的数据）
			const config: ReportScoringConfig = {
				name: configName || undefined,  // 保存评分标准名称
				default_config: {
					metric_configs: metrics.map(({ expanded, ...metric }) => {
						// 确保 source 和 na_handling 有明确的值
						const source = metric.source || 'summary'
						const na_handling = metric.na_handling || (source === 'rate' ? 'as_zero' : 'skip')
						
						// 根据评分类型，只保留对应的配置
						const baseConfig = {
							...metric,
							source,
							na_handling,
							// 只有 na_handling 为 as_value 时才保留 na_value
							na_value: na_handling === 'as_value' ? (metric.na_value ?? 0) : undefined
						}
						
						if (metric.scoring_type === 'threshold') {
							return { ...baseConfig, ranges: undefined } // 阈值模式下清空区间
						} else {
							return { ...baseConfig, thresholds: undefined } // 区间模式下清空阈值
						}
					})
				}
			}

			// 保存配置
			await updateReport(reportId, { scoring_config: config } as any)

			// 自动计算评分
			try {
				await calculateReportScore(reportId)
				toast({
					title: '保存成功',
					description: '评分配置已更新，评分已自动计算'
				})
			} catch (calcErr) {
				console.error('自动计算评分失败:', calcErr)
				toast({
					title: '配置已保存',
					description: '评分配置已更新，但自动计算评分失败，请稍后重试',
					variant: 'default'
				})
			}

			onSuccess?.()
			onOpenChange(false)
		} catch (err) {
			toast({
				title: '保存失败',
				description: err instanceof Error ? err.message : '保存配置失败',
				variant: 'destructive'
			})
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="w-[90%] sm:max-w-[800px] rounded-lg max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>配置报告评分标准</DialogTitle>
					<DialogDescription>
						为报告 "{report?.name}" 配置评分标准。权重会自动归一化，用例权重自动平均分配。
					</DialogDescription>
				</DialogHeader>

				{loading ? (
					<div className="flex items-center justify-center py-12">
						<Loader2Icon className="size-8 animate-spin text-muted-foreground" />
					</div>
				) : (
					<div className="space-y-4">
						{/* 从历史报告复制配置 - 使用分组下拉菜单 */}
						{historyReports.length > 0 && (
							<div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
								<CopyIcon className="size-4 text-blue-600 dark:text-blue-400 shrink-0" />
								<span className="text-sm text-blue-700 dark:text-blue-300">从历史报告复制配置：</span>
								
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button variant="outline" className="h-8 flex-1 max-w-xs justify-between bg-background">
											<span className="text-muted-foreground">选择一个配置...</span>
											<ChevronDownIcon className="h-4 w-4 opacity-50" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent className="w-72 max-h-[400px] overflow-y-auto" align="start">
										<DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
											按评分标准分组 · 共 {historyReports.length} 个配置
										</DropdownMenuLabel>
										<DropdownMenuSeparator />
										
										{groupedHistoryReports.map((group) => (
											<DropdownMenuSub key={group.configName}>
												<DropdownMenuSubTrigger className="flex items-center gap-2">
													<span className="font-medium truncate flex-1">{group.configName}</span>
													<span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
														{group.reports.length}
													</span>
												</DropdownMenuSubTrigger>
												<DropdownMenuSubContent className="w-80 max-h-[300px] overflow-y-auto">
													{group.reports.map((report) => (
														<DropdownMenuItem
															key={report.id}
															onClick={() => copyConfigFromReport(report)}
															className="flex flex-col items-start gap-0.5 py-2 cursor-pointer"
														>
															<span className="font-medium text-sm">{report.name}</span>
															{report.datasource_name && (
																<span className="text-xs text-muted-foreground">
																	数据源: {report.datasource_name}
																</span>
															)}
														</DropdownMenuItem>
													))}
												</DropdownMenuSubContent>
											</DropdownMenuSub>
										))}
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						)}

						{/* 评分标准名称 */}
						<div className="space-y-2">
							<Label className="text-sm font-medium">评分标准名称（可选）</Label>
							<Input
								value={configName}
								onChange={(e) => setConfigName(e.target.value)}
								placeholder="如：Web服务标准、游戏服务标准..."
								className="h-9"
							/>
							<p className="text-xs text-muted-foreground">
								为配置命名后，在其他报告中复制配置时可快速识别
							</p>
						</div>

						{/* 快速添加模板 */}
						{metrics.length === 0 && (
							<div className="border-2 border-dashed rounded-lg p-6 space-y-4">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2 text-sm text-muted-foreground">
										<SparklesIcon className="size-4" />
										<span>快速开始：选择常用指标模板</span>
									</div>
									{/* 一键全选按钮 */}
									<Button
										variant="default"
										size="sm"
										onClick={() => {
											if (metricTemplates.length > 0) {
												// 从数据源模板全选
												const newMetrics = metricTemplates.map(metricConfig => ({
													name: metricConfig.name,
													alias: metricConfig.alias,
													unit: metricConfig.unit,
													transform: metricConfig.transform,
													weight: 1,
													aggregation_types: ['avg'],
													scoring_type: 'range' as const,
													ranges: [...DEFAULT_SINGLE_RANGE],
													thresholds: [],
													expanded: true
												}))
												setMetrics(newMetrics)
											} else {
												// 通用模板全选（CPU、内存、响应时间）
												const templates: Array<keyof typeof METRIC_TEMPLATES> = ['cpu', 'memory', 'response_time']
												const newMetrics = templates.map(key => ({
													...METRIC_TEMPLATES[key],
													expanded: true
												}))
												setMetrics(newMetrics)
											}
										}}
										className="shrink-0"
									>
										<SparklesIcon className="size-3.5 mr-1.5" />
										一键全选
									</Button>
								</div>
								
								{/* 从数据源的groupmap中提取的指标模板 */}
								{metricTemplates.length > 0 ? (
									<>
										<div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
											{metricTemplates.map((template, index) => (
												<Button
													key={index}
													variant="outline"
													size="sm"
													onClick={() => addMetricFromDatasource(template)}
													className="justify-start"
												>
													{template.alias || template.name}
												</Button>
											))}
										</div>
										<div className="text-center text-sm text-muted-foreground">或</div>
									</>
								) : (
									<>
										{/* 如果数据源没有配置指标，显示通用模板 */}
										<div className="grid grid-cols-3 gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={() => addMetricFromTemplate('cpu')}
											>
												CPU 使用率
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={() => addMetricFromTemplate('memory')}
											>
												内存使用率
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={() => addMetricFromTemplate('response_time')}
											>
												响应时间
											</Button>
										</div>
										<div className="text-center text-sm text-muted-foreground">或</div>
									</>
								)}
								
								<Button
									variant="outline"
									className="w-full"
									onClick={addCustomMetric}
								>
									<PlusIcon className="size-4 mr-2" />
									添加自定义指标
								</Button>
							</div>
						)}

						{/* 指标列表 */}
						{metrics.map((metric, metricIndex) => (
							<div key={metricIndex} className="border rounded-lg overflow-hidden">
								{/* 指标头部 */}
								<div className="bg-muted/50 p-3 flex items-center gap-2">
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="h-6 w-6 shrink-0"
										onClick={() => toggleExpanded(metricIndex)}
									>
										{metric.expanded ? (
											<ChevronDownIcon className="h-4 w-4" />
										) : (
											<ChevronRightIcon className="h-4 w-4" />
										)}
									</Button>

									<div className="flex-1 flex items-center gap-2">
										<span className="font-semibold">
											{metric.alias || metric.name || `指标 ${metricIndex + 1}`}
										</span>
										{metric.name && (
											<code className="text-xs bg-background px-1.5 py-0.5 rounded">
												{metric.name}
											</code>
										)}
										{metric.source === 'rate' && (
											<span className="text-xs bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300 px-1.5 py-0.5 rounded">
												Rate
											</span>
										)}
										<span className="text-xs text-muted-foreground">
											权重: {metric.weight}
										</span>
									</div>

									{/* 操作按钮 */}
									<div className="flex gap-1 shrink-0">
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="h-6 w-6"
											onClick={() => duplicateMetric(metricIndex)}
											title="复制"
										>
											<CopyIcon className="h-3 w-3" />
										</Button>
										{metrics.length > 1 && (
											<>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													onClick={() => moveMetricUp(metricIndex)}
													disabled={metricIndex === 0}
													className="h-6 w-6"
													title="上移"
												>
													<ArrowUpIcon className="h-3 w-3" />
												</Button>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													onClick={() => moveMetricDown(metricIndex)}
													disabled={metricIndex === metrics.length - 1}
													className="h-6 w-6"
													title="下移"
												>
													<ArrowDownIcon className="h-3 w-3" />
												</Button>
											</>
										)}
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() => removeMetric(metricIndex)}
											className="h-6 w-6"
										>
											<XIcon className="h-4 w-4" />
										</Button>
									</div>
								</div>

								{/* 指标内容 */}
								{metric.expanded && (
									<div className="p-4 space-y-4">
										{/* 基本信息 */}
										<div className="grid grid-cols-2 gap-3">
											<div className="space-y-1.5">
												<div className="flex items-center gap-2">
													<Label className="text-xs">指标名称 *</Label>
													<span className="text-xs text-muted-foreground">(✓ 表示有预设配置)</span>
												</div>
												{report?.metric_info?.metric_name_list && report.metric_info.metric_name_list.length > 0 ? (
													<Select
														value={metric.name || undefined}
														onValueChange={(value) => {
															// 查找对应的 MetricConfig
															const matchedTemplate = metricTemplates.find(t => t.name === value)
															if (matchedTemplate) {
																// 如果找到了对应的配置，一次性更新所有字段
																const newMetrics = [...metrics]
																newMetrics[metricIndex] = {
																	...newMetrics[metricIndex],
																	name: value,
																	alias: matchedTemplate.alias || undefined,
																	unit: matchedTemplate.unit || undefined,
																	transform: matchedTemplate.transform || undefined
																}
																setMetrics(newMetrics)
																console.log('🔍 自动填充指标配置:', {
																	name: value,
																	alias: matchedTemplate.alias,
																	unit: matchedTemplate.unit,
																	transform: matchedTemplate.transform,
																	matchedTemplate: matchedTemplate
																})
																toast({
																	description: `已从数据源配置自动填充指标信息`,
																	duration: 2000
																})
															} else {
																// 如果没找到，只更新名称
																updateMetric(metricIndex, 'name', value)
															}
														}}
													>
														<SelectTrigger className="h-8">
															<SelectValue placeholder="从报告中选择指标" />
														</SelectTrigger>
														<SelectContent>
															{report.metric_info.metric_name_list.map((name) => {
																// 检查是否有对应的 groupmap 配置
																const hasConfig = metricTemplates.some(t => t.name === name)
																return (
																	<SelectItem key={name} value={name}>
																		{name}
																		{hasConfig && <span className="text-xs text-muted-foreground ml-2">✓</span>}
																	</SelectItem>
																)
															})}
														</SelectContent>
													</Select>
												) : (
													<Input
														value={metric.name}
														onChange={(e) => updateMetric(metricIndex, 'name', e.target.value)}
														placeholder="如: cpu_usage"
														className="h-8"
													/>
												)}
											</div>
											<div className="space-y-1.5">
												<Label className="text-xs">别名/显示名称</Label>
												<Input
													value={metric.alias || ''}
													onChange={(e) => updateMetric(metricIndex, 'alias', e.target.value)}
													placeholder="如: CPU使用率"
													className="h-8"
												/>
											</div>
											<div className="space-y-1.5">
												<Label className="text-xs">权重系数 *</Label>
												<Input
													type="number"
													min="0.1"
													step="0.1"
													value={metric.weight}
													onChange={(e) => updateMetric(metricIndex, 'weight', parseFloat(e.target.value) || 1)}
													className="h-8"
												/>
											</div>
											<div className="space-y-1.5">
												<Label className="text-xs">单位</Label>
												<Input
													value={metric.unit || ''}
													onChange={(e) => updateMetric(metricIndex, 'unit', e.target.value)}
													placeholder="如: %"
													className="h-8"
												/>
											</div>
											<div className="space-y-1.5 col-span-2">
												<Label className="text-xs text-muted-foreground">
													转换表达式 <span className="text-[10px]">(仅作说明，继承自数据源)</span>
												</Label>
												<Input
													value={metric.transform || ''}
													onChange={(e) => updateMetric(metricIndex, 'transform', e.target.value)}
													placeholder="无转换"
													className="h-8 bg-muted/50"
													title="转换表达式仅作为说明，显示该指标在数据源中的转换规则。评分时直接使用表格中已转换的值。"
												/>
											</div>
											<div className="space-y-1.5 col-span-2">
												<Label className="text-xs">聚合类型（多选）</Label>
												<div className="flex flex-wrap gap-2">
													{(metric.source === 'rate' ? ['rate'] : ['avg', 'max', 'min', 'count', 'last']).map((aggType) => (
														<label key={aggType} className="flex items-center gap-2 cursor-pointer">
															<input
																type="checkbox"
																checked={metric.aggregation_types?.includes(aggType) || false}
																onChange={(e) => {
																	const currentTypes = metric.aggregation_types || []
																	const newTypes = e.target.checked
																		? [...currentTypes, aggType]
																		: currentTypes.filter(t => t !== aggType)
																	updateMetric(metricIndex, 'aggregation_types', newTypes)
																}}
																className="rounded border-gray-300"
																disabled={metric.source === 'rate'} // Rate 来源时锁定为 rate
															/>
															<span className="text-sm">{aggType}</span>
														</label>
													))}
												</div>
											</div>
											
											{/* 数据来源 */}
											<div className="space-y-1.5">
												<Label className="text-xs">数据来源</Label>
												<Select
													value={metric.source || 'summary'}
													onValueChange={(value: 'summary' | 'rate') => {
														const newMetrics = [...metrics]
														newMetrics[metricIndex] = {
															...newMetrics[metricIndex],
															source: value,
															// 切换为 Rate 时，自动设置聚合类型为 rate
															aggregation_types: value === 'rate' ? ['rate'] : (newMetrics[metricIndex].aggregation_types || ['avg']),
															// Rate 来源默认 N/A 处理为 as_zero
															na_handling: value === 'rate' ? (newMetrics[metricIndex].na_handling || 'as_zero') : newMetrics[metricIndex].na_handling
														}
														setMetrics(newMetrics)
													}}
												>
													<SelectTrigger className="h-8">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="summary">📋 汇总表格</SelectItem>
														<SelectItem value="rate">📊 Rate 统计</SelectItem>
													</SelectContent>
												</Select>
												<p className="text-[10px] text-muted-foreground">
													{metric.source === 'rate' 
														? 'Rate 统计：从每分钟频率数据中提取值' 
														: '汇总表格：从数据总览表格中提取值'}
												</p>
											</div>
											
											{/* N/A 处理策略 */}
											<div className="space-y-1.5">
												<Label className="text-xs">N/A 处理</Label>
												<Select
													value={metric.na_handling || (metric.source === 'rate' ? 'as_zero' : 'skip')}
													onValueChange={(value: 'skip' | 'as_zero' | 'as_value') => {
														updateMetric(metricIndex, 'na_handling', value)
													}}
												>
													<SelectTrigger className="h-8">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="skip">⏭️ 跳过，不参与评分</SelectItem>
														<SelectItem value="as_zero">0️⃣ 视为 0 参与评分</SelectItem>
														<SelectItem value="as_value">🔢 视为指定值</SelectItem>
													</SelectContent>
												</Select>
												{metric.na_handling === 'as_value' && (
													<Input
														type="number"
														step="0.01"
														value={metric.na_value ?? 0}
														onChange={(e) => updateMetric(metricIndex, 'na_value', parseFloat(e.target.value) || 0)}
														placeholder="N/A 替代值"
														className="h-8 mt-1"
													/>
												)}
												<p className="text-[10px] text-muted-foreground">
													当数据为 N/A 或不存在时如何处理
												</p>
											</div>
										</div>

										{/* 评分类型选择 */}
										<div className="space-y-2">
											<Label className="text-xs">评分类型</Label>
											<div className="flex gap-2">
												<Button
													type="button"
													variant={metric.scoring_type === 'range' ? 'default' : 'outline'}
													size="sm"
													onClick={() => toggleScoringType(metricIndex, 'range')}
													className="flex-1 h-8"
												>
													📊 区间评分
												</Button>
												<Button
													type="button"
													variant={metric.scoring_type === 'threshold' ? 'default' : 'outline'}
													size="sm"
													onClick={() => toggleScoringType(metricIndex, 'threshold')}
													className="flex-1 h-8"
												>
													🎯 阈值评分
												</Button>
											</div>
											<p className="text-xs text-muted-foreground">
												{metric.scoring_type === 'threshold' 
													? '阈值评分：根据条件判断（如 ≥ 90 得 100 分），按顺序匹配第一个满足的条件' 
													: '区间评分：根据值所在区间评分，区间间支持线性插值'}
											</p>
										</div>

										{/* 评分区间（仅区间评分时显示） */}
										{metric.scoring_type !== 'threshold' && (
										<div className="space-y-2">
											<div className="flex items-center justify-between">
												<div>
													<Label className="text-xs">评分区间</Label>
													<span className="text-xs text-muted-foreground ml-2">(设置指标值范围对应的评分等级)</span>
												</div>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={() => generateEvenRanges(metricIndex)}
													className="h-7 text-xs"
												>
													<SparklesIcon className="size-3 mr-1" />
													生成均匀区间
												</Button>
											</div>

											<div className="space-y-2">
												{(metric.ranges || []).map((range, rangeIndex) => (
													<div
														key={rangeIndex}
														className="flex items-center gap-2 p-2 rounded bg-muted/30"
													>
														{/* 值区间部分 */}
														<div className="flex items-center gap-1.5">
															<span className="text-sm text-muted-foreground whitespace-nowrap">值区间</span>
															<Input
																type="number"
																value={range.min}
																onChange={(e) => updateRange(metricIndex, rangeIndex, 'min', parseFloat(e.target.value) || 0)}
																placeholder="0"
																className="h-9 text-sm w-16"
																title="区间最小值"
															/>
															<span className="text-sm text-muted-foreground">-</span>
															<Input
																type="number"
																value={range.max}
																onChange={(e) => updateRange(metricIndex, rangeIndex, 'max', parseFloat(e.target.value) || 0)}
																placeholder="100"
																className="h-9 text-sm w-16"
																title="区间最大值"
															/>
														</div>

														{/* 得分部分 */}
														<div className="flex items-center gap-1.5">
															<span className="text-sm text-muted-foreground whitespace-nowrap">得分</span>
															<Input
																type="number"
																min="0"
																max="100"
																value={range.score}
																onChange={(e) => updateRange(metricIndex, rangeIndex, 'score', parseInt(e.target.value) || 0)}
																placeholder="100"
																className="h-9 text-sm w-16"
																title="该区间对应的得分（0-100）"
															/>
														</div>

														{/* 等级下拉框 */}
														<Select
															value={range.level}
															onValueChange={(value) => {
																updateRange(metricIndex, rangeIndex, 'level', value)
																// 自动设置标签和颜色
																const configs: Record<string, { label: string; color: string; emoji: string }> = {
																	excellent: { label: '低风险', color: '#10b981', emoji: '🟢' },
																	good: { label: '中低风险', color: '#3b82f6', emoji: '🔵' },
																	normal: { label: '中风险', color: '#eab308', emoji: '🟡' },
																	warning: { label: '中高风险', color: '#f97316', emoji: '🟠' },
																	danger: { label: '高风险', color: '#ef4444', emoji: '🔴' }
																}
																const config = configs[value] || configs.normal
																updateRange(metricIndex, rangeIndex, 'label', config.label)
																updateRange(metricIndex, rangeIndex, 'color', config.color)
															}}
														>
															<SelectTrigger className="h-9 text-sm w-[110px]">
																<SelectValue>
																	{(() => {
																		const levelEmojis: Record<string, string> = {
																			excellent: '🟢 低风险',
																			good: '🔵 中低风险',
																			normal: '🟡 中风险',
																			warning: '🟠 中高风险',
																			danger: '🔴 高风险'
																		}
																		return levelEmojis[range.level] || '🟡 中风险'
																	})()}
																</SelectValue>
															</SelectTrigger>
															<SelectContent>
																<SelectItem value="excellent">🟢 低风险</SelectItem>
																<SelectItem value="good">🔵 中低风险</SelectItem>
																<SelectItem value="normal">🟡 中风险</SelectItem>
																<SelectItem value="warning">🟠 中高风险</SelectItem>
																<SelectItem value="danger">🔴 高风险</SelectItem>
															</SelectContent>
														</Select>

														{/* 删除按钮 */}
														<Button
															type="button"
															variant="ghost"
															size="icon"
															onClick={() => removeRange(metricIndex, rangeIndex)}
															className="h-9 w-9 shrink-0"
															title="删除此区间"
														>
															<XIcon className="h-4 w-4" />
														</Button>
													</div>
												))}
											</div>

											<Button
												type="button"
												variant="outline"
												size="sm"
												onClick={() => addRange(metricIndex)}
												className="w-full h-7 text-xs"
											>
												<PlusIcon className="h-3 w-3 mr-1" />
												添加区间
											</Button>
										</div>
										)}

										{/* 阈值条件（仅阈值评分时显示） */}
										{metric.scoring_type === 'threshold' && (
										<div className="space-y-2">
											<div className="flex items-center justify-between">
												<div>
													<Label className="text-xs">阈值条件</Label>
													<span className="text-xs text-muted-foreground ml-2">(设置条件及对应得分，按顺序匹配)</span>
												</div>
											</div>

											<div className="space-y-2">
												{(metric.thresholds || []).map((threshold, thresholdIndex) => (
													<div
														key={thresholdIndex}
														className="flex items-center gap-2 p-2 rounded bg-muted/30"
													>
														{/* 运算符 - 固定窄宽度 */}
														<Select
															value={threshold.operator}
															onValueChange={(value) => updateThreshold(metricIndex, thresholdIndex, 'operator', value)}
														>
															<SelectTrigger className="h-9 text-sm w-14 flex-none">
																<SelectValue />
															</SelectTrigger>
															<SelectContent>
																{THRESHOLD_OPERATORS.map((op) => (
																	<SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
																))}
															</SelectContent>
														</Select>

														{/* 阈值 - 自适应宽度 */}
														<Input
															type="number"
															value={threshold.value}
															onChange={(e) => updateThreshold(metricIndex, thresholdIndex, 'value', parseFloat(e.target.value) || 0)}
															placeholder="阈值"
															className="h-9 text-sm flex-1 min-w-0"
															title="阈值"
														/>

														{/* 得分 - 自适应宽度 */}
														<div className="flex items-center gap-1 flex-1 min-w-0">
															<span className="text-xs text-muted-foreground flex-none">→</span>
															<Input
																type="number"
																min="0"
																max="100"
																value={threshold.score}
																onChange={(e) => updateThreshold(metricIndex, thresholdIndex, 'score', parseInt(e.target.value) || 0)}
																placeholder="得分"
																className="h-9 text-sm flex-1 min-w-0"
																title="该条件对应的得分（0-100）"
															/>
															<span className="text-xs text-muted-foreground flex-none">分</span>
														</div>

														{/* 等级下拉框 - 固定窄宽度 */}
														<Select
															value={threshold.level || 'normal'}
															onValueChange={(value) => {
																updateThreshold(metricIndex, thresholdIndex, 'level', value)
																// 自动设置标签和颜色
																const configs: Record<string, { label: string; color: string }> = {
																	excellent: { label: '低风险', color: '#10b981' },
																	good: { label: '中低风险', color: '#3b82f6' },
																	normal: { label: '中风险', color: '#eab308' },
																	warning: { label: '中高风险', color: '#f97316' },
																	danger: { label: '高风险', color: '#ef4444' }
																}
																const config = configs[value] || configs.normal
																updateThreshold(metricIndex, thresholdIndex, 'label', config.label)
																updateThreshold(metricIndex, thresholdIndex, 'color', config.color)
															}}
														>
															<SelectTrigger className="h-9 text-sm w-14 flex-none">
																<SelectValue>
																	{(() => {
																		const levelEmojis: Record<string, string> = {
																			excellent: '🟢',
																			good: '🔵',
																			normal: '🟡',
																			warning: '🟠',
																			danger: '🔴'
																		}
																		return levelEmojis[threshold.level || 'normal'] || '🟡'
																	})()}
																</SelectValue>
															</SelectTrigger>
															<SelectContent>
																<SelectItem value="excellent">🟢 低风险</SelectItem>
																<SelectItem value="good">🔵 中低风险</SelectItem>
																<SelectItem value="normal">🟡 中风险</SelectItem>
																<SelectItem value="warning">🟠 中高风险</SelectItem>
																<SelectItem value="danger">🔴 高风险</SelectItem>
															</SelectContent>
														</Select>

														{/* 删除按钮 */}
														<Button
															type="button"
															variant="ghost"
															size="icon"
															onClick={() => removeThreshold(metricIndex, thresholdIndex)}
															className="h-9 w-9 flex-none"
															title="删除此条件"
														>
															<XIcon className="h-4 w-4" />
														</Button>
													</div>
												))}
											</div>

											<Button
												type="button"
												variant="outline"
												size="sm"
												onClick={() => addThreshold(metricIndex)}
												className="w-full h-7 text-xs"
											>
												<PlusIcon className="h-3 w-3 mr-1" />
												添加条件
											</Button>
										</div>
										)}
									</div>
								)}
							</div>
						))}

						{/* 添加指标按钮 */}
						{metrics.length > 0 && (
							<div className="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={addCustomMetric}
									className="flex-1"
								>
									<PlusIcon className="size-4 mr-2" />
									添加自定义指标
								</Button>
								
								{/* 快速添加指标模板下拉菜单 */}
								{metricTemplates.length > 0 ? (
									<Select 
										value={selectedTemplateValue}
										onValueChange={(value) => {
											if (value === '__select_all__') {
												// 一键全选所有模板（一次性添加所有指标）
												const newMetrics = metricTemplates.map(metricConfig => ({
													name: metricConfig.name,
													alias: metricConfig.alias,
													unit: metricConfig.unit,
													transform: metricConfig.transform,
													weight: 1,
													aggregation_types: ['avg'], // 默认使用avg，用户可以修改
													scoring_type: 'range' as const, // 默认使用区间评分
													ranges: [...DEFAULT_SINGLE_RANGE], // 使用单个默认区间
													thresholds: [],
													expanded: true
												}))
												setMetrics(prev => [...prev, ...newMetrics])
											} else {
												// 添加选中的模板
												const template = metricTemplates.find(t => t.name === value)
												if (template) {
													addMetricFromDatasource(template)
												}
											}
											// 选择后重置，方便下次选择
											setSelectedTemplateValue('')
										}}
									>
										<SelectTrigger className="h-9 w-[180px]">
											<SelectValue placeholder="快速添加模板..." />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="__select_all__">
												<span className="font-semibold">✨ 一键全选</span>
											</SelectItem>
											{metricTemplates.map((template, index) => (
												<SelectItem key={index} value={template.name}>
													{template.alias || template.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								) : (
									<>
										<Button
											variant="outline"
											size="sm"
											onClick={() => addMetricFromTemplate('cpu')}
										>
											CPU
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => addMetricFromTemplate('memory')}
										>
											内存
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => addMetricFromTemplate('response_time')}
										>
											响应时间
										</Button>
									</>
								)}
							</div>
						)}
					</div>
				)}

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={saving}
					>
						取消
					</Button>
					<Button onClick={handleSave} disabled={saving || loading}>
						{saving ? (
							<>
								<Loader2Icon className="size-4 mr-2 animate-spin" />
								保存中...
							</>
						) : (
							'保存配置'
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

