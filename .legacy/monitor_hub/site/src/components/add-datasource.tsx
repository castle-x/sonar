/**
 * ============================================
 * 添加/编辑数据源对话框组件
 * ============================================
 * 
 * 功能：
 * 1. 添加新数据源（创建模式）
 * 2. 编辑现有数据源（编辑模式）
 * 
 * 数据字段（对应后端 thrift 定义）：
 * - name: 名称（必填，1-100 字符）
 * - app_id: 项目标识（必填，1-50 字符）
 * - pushgateway_addr_list: 数据源地址列表（必填，至少 1 个）
 * - description: 描述（可选，最大 500 字符）
 * - groupmap: 分组字典（可选），每个分组包含一组 MetricConfig
 */

import { PlusIcon, XIcon, ChevronDownIcon, ChevronRightIcon, EditIcon, UploadIcon, Loader2Icon, ImageIcon, ArrowUpIcon, ArrowDownIcon, ListOrderedIcon, GripVerticalIcon, CopyIcon, ClipboardPasteIcon } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TagInput } from "@/components/ui/tag-input"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import { 
	createDatasource, 
	updateDatasource, 
	validateDatasource,
	getDatasource, 
	uploadDatasourceIcon,
	type Datasource, 
	type MetricConfig,
	type SummaryConfig
} from "@/apis/datasource"
import type { DatasourceRecord } from "@/components/datasource-table/datasource-table"

/**
 * 添加数据源按钮组件
 */
export function AddDatasourceButton({ 
	className,
	editMode = false,
	datasourceId
}: { 
	className?: string
	editMode?: boolean
	datasourceId?: string
}) {
	const [open, setOpen] = useState(false)
	const [datasource, setDatasource] = useState<DatasourceRecord | undefined>(undefined)
	const [loading, setLoading] = useState(false)

	// 如果是编辑模式且有 datasourceId，加载数据源数据
	useEffect(() => {
		if (editMode && datasourceId && open) {
			const fetchDatasource = async () => {
				try {
					setLoading(true)
					const data = await getDatasource(datasourceId)
					setDatasource(data)
				} catch (error) {
					console.error("Failed to fetch datasource:", error)
					setDatasource(undefined)
				} finally {
					setLoading(false)
				}
			}
			fetchDatasource()
		} else if (!open) {
			// 关闭对话框时清空数据
			setDatasource(undefined)
		}
	}, [editMode, datasourceId, open])

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" className={cn("flex gap-1", className)}>
					{editMode ? (
						<>
							<EditIcon className="h-4 w-4 -ms-1" />
							编辑数据源
						</>
					) : (
						<>
							<PlusIcon className="h-4 w-4 -ms-1" />
							添加数据源
						</>
					)}
				</Button>
			</DialogTrigger>
			{loading ? (
				<DialogContent>
					<div className="flex items-center justify-center p-6">
						<div className="text-muted-foreground">加载数据源信息...</div>
					</div>
				</DialogContent>
			) : (
				<DatasourceDialog setOpen={setOpen} datasource={datasource} />
			)}
		</Dialog>
	)
}

/**
 * 分组配置项类型
 */
type GroupItem = {
	name: string
	metrics: MetricConfig[]
	expanded: boolean  // 折叠状态
}

/**
 * 汇总表格配置项类型（前端展示用）
 */
type SummaryConfigItem = {
	name: string
	labels: string[]
	metrics: Array<{
		name: string
		aggTypes: string[]
	}>
	expanded: boolean  // 折叠状态
}

/**
 * 数据源表单对话框
 * 
 * @param setOpen - 控制对话框打开/关闭的函数
 * @param datasource - 如果提供，则为编辑模式；否则为创建模式
 * @param onSuccess - 成功创建/编辑后的回调函数
 */
export function DatasourceDialog({ 
	setOpen, 
	datasource,
	onSuccess
}: { 
	setOpen: (open: boolean) => void
	datasource?: DatasourceRecord  // 编辑模式时传入现有数据
	onSuccess?: () => void  // 成功后的回调
}) {
	const { toast } = useToast()
	const [loading, setLoading] = useState(false)
	const isEditMode = !!datasource

	// 图标上传状态
	const [uploadLoading, setUploadLoading] = useState(false)
	const [selectedFile, setSelectedFile] = useState<File | null>(null)
	const [previewUrl, setPreviewUrl] = useState<string | null>(null)
	const [currentIconName, setCurrentIconName] = useState<string | undefined>(datasource?.icon_name)
	const fileInputRef = useRef<HTMLInputElement>(null)

	// 🔥 调试：打印 datasource 数据
	useEffect(() => {
		console.log('[DatasourceDialog] datasource:', datasource)
		console.log('[DatasourceDialog] icon_name:', datasource?.icon_name)
	}, [datasource])

	// 当 datasource prop 变化时，同步更新 currentIconName
	useEffect(() => {
		if (datasource?.icon_name) {
			setCurrentIconName(datasource.icon_name)
		}
	}, [datasource?.icon_name])

	// 地址列表状态（用于多个地址的动态添加/删除）
	const [addresses, setAddresses] = useState<string[]>(
		datasource?.pushgateway_addr_list || [""]  // 编辑模式：使用现有地址；创建模式：一个空输入框
	)

	// 分组配置状态（用于动态添加/删除分组和指标）
	const [groups, setGroups] = useState<GroupItem[]>(() => {
		if (datasource?.groupmap) {
			// 编辑模式：将 groupmap 对象转换为数组形式
			return Object.entries(datasource.groupmap).map(([name, metrics]) => ({
				name,
				metrics: metrics.length > 0 ? metrics : [{ name: "" }],
				expanded: false  // 默认折叠
			}))
		}
		return []  // 创建模式：默认为空
	})

	// 汇总表格配置状态
	const [summaryConfigs, setSummaryConfigs] = useState<SummaryConfigItem[]>(() => {
		if (datasource?.summary_config) {
			// 编辑模式：将 summary_config 转换为前端展示格式
			return datasource.summary_config.map((config: SummaryConfig) => ({
				name: config.name,
				labels: config.labels || [],
				// 从后端 list<MetricAggregation> 转换为前端数组格式
				metrics: (config.metrics || []).map(metricAgg => ({
					name: metricAgg.metric_name,
					aggTypes: metricAgg.agg_types
				})),
				expanded: false  // 默认折叠
			}))
		}
		return []
	})

	// groupmap 排序键状态
	const [groupmapSortKeys, setGroupmapSortKeys] = useState<string[]>(
		datasource?.groupmap_sort_keys || []
	)
	
	// 排序对话框状态
	const [sortDialogOpen, setSortDialogOpen] = useState(false)

	// JSON 导入对话框状态
	const [importGroupsDialogOpen, setImportGroupsDialogOpen] = useState(false)
	const [importGroupsJson, setImportGroupsJson] = useState("")
	const [importSummaryDialogOpen, setImportSummaryDialogOpen] = useState(false)
	const [importSummaryJson, setImportSummaryJson] = useState("")

	/**
	 * 添加一个新的地址输入框
	 */
	const addAddress = () => {
		setAddresses([...addresses, ""])
	}

	/**
	 * 删除指定索引的地址
	 */
	const removeAddress = (index: number) => {
		if (addresses.length > 1) {  // 至少保留一个输入框
			setAddresses(addresses.filter((_, i) => i !== index))
		}
	}

	/**
	 * 更新指定索引的地址值
	 */
	const updateAddress = (index: number, value: string) => {
		const newAddresses = [...addresses]
		newAddresses[index] = value
		setAddresses(newAddresses)
	}

	/**
	 * 添加一个新的分组
	 */
	const addGroup = () => {
		setGroups([...groups, { name: "", metrics: [{ name: "" }], expanded: true }])
	}

	/**
	 * 删除指定索引的分组
	 */
	const removeGroup = (index: number) => {
		const updatedGroups = groups.filter((_, i) => i !== index)
		setGroups(updatedGroups)
		updateGroupmapSortKeys(updatedGroups)  // 同步更新分组顺序
	}

	/**
	 * 切换分组的展开/折叠状态
	 */
	const toggleGroupExpanded = (index: number) => {
		const newGroups = [...groups]
		newGroups[index].expanded = !newGroups[index].expanded
		setGroups(newGroups)
	}

	/**
	 * 更新分组名称
	 */
	const updateGroupName = (groupIndex: number, name: string) => {
		const newGroups = [...groups]
		newGroups[groupIndex].name = name
		setGroups(newGroups)
	}

	/**
	 * 添加指标到指定分组
	 */
	const addMetricToGroup = (groupIndex: number) => {
		const newGroups = [...groups]
		newGroups[groupIndex].metrics.push({ name: "" })
		setGroups(newGroups)
	}

	/**
	 * 删除指定分组中的指标
	 */
	const removeMetricFromGroup = (groupIndex: number, metricIndex: number) => {
		const newGroups = [...groups]
		if (newGroups[groupIndex].metrics.length > 1) {
			newGroups[groupIndex].metrics = newGroups[groupIndex].metrics.filter((_, i) => i !== metricIndex)
			setGroups(newGroups)
		}
	}

	/**
	 * 更新指定分组中的指标配置
	 */
	const updateMetric = (
		groupIndex: number, 
		metricIndex: number, 
		field: keyof MetricConfig, 
		value: string | string[] | undefined
	) => {
		const newGroups = [...groups]
		const metric = newGroups[groupIndex].metrics[metricIndex]
		
		if (field === 'name' && typeof value === 'string') {
			metric.name = value
		} else if (field === 'display_labels') {
			// display_labels 是数组类型
			if (value === undefined || (Array.isArray(value) && value.length === 0)) {
				delete metric[field]
			} else {
				metric[field] = value as string[]
			}
		} else if (field === 'column_span' || field === 'chart_type') {
			// column_span 和 chart_type 特殊处理：保持字段存在，空值设为空字符串
			if (value === undefined || value === '') {
				(metric as any)[field] = ''  // 设为空字符串而不是删除，以便提交时能识别需要清空
			} else {
				(metric as any)[field] = value
			}
		} else if (typeof value === 'string') {
			// 对于其他可选字段，如果值为空则设置为 undefined
			if (value.trim()) {
				(metric as any)[field] = value
			} else {
				delete metric[field]
			}
		}
		
		setGroups(newGroups)
	}

	// ============================================
	// SummaryConfig 相关函数
	// ============================================

	/**
	 * 添加一个新的汇总表格配置
	 */
	const addSummaryConfig = () => {
		setSummaryConfigs([...summaryConfigs, { 
			name: "", 
			labels: [], 
			metrics: [{ name: "", aggTypes: [] }],
			expanded: true 
		}])
	}

	/**
	 * 删除指定索引的汇总表格配置
	 */
	const removeSummaryConfig = (index: number) => {
		setSummaryConfigs(summaryConfigs.filter((_, i) => i !== index))
	}

	/**
	 * 切换汇总表格配置的展开/折叠状态
	 */
	const toggleSummaryConfigExpanded = (index: number) => {
		const newConfigs = [...summaryConfigs]
		newConfigs[index].expanded = !newConfigs[index].expanded
		setSummaryConfigs(newConfigs)
	}

	/**
	 * 更新汇总表格配置的名称
	 */
	const updateSummaryConfigName = (index: number, name: string) => {
		const newConfigs = [...summaryConfigs]
		newConfigs[index].name = name
		setSummaryConfigs(newConfigs)
	}

	/**
	 * 更新汇总表格配置的标签列表
	 */
	const updateSummaryConfigLabels = (index: number, labels: string[]) => {
		const newConfigs = [...summaryConfigs]
		newConfigs[index].labels = labels
		setSummaryConfigs(newConfigs)
	}

	/**
	 * 添加指标到指定汇总表格配置
	 */
	const addMetricToSummaryConfig = (configIndex: number) => {
		const newConfigs = [...summaryConfigs]
		newConfigs[configIndex].metrics.push({ name: "", aggTypes: [] })
		setSummaryConfigs(newConfigs)
	}

	/**
	 * 删除指定汇总表格配置中的指标
	 */
	const removeMetricFromSummaryConfig = (configIndex: number, metricIndex: number) => {
		const newConfigs = [...summaryConfigs]
		if (newConfigs[configIndex].metrics.length > 1) {
			newConfigs[configIndex].metrics = newConfigs[configIndex].metrics.filter((_, i) => i !== metricIndex)
			setSummaryConfigs(newConfigs)
		}
	}

	/**
	 * 更新汇总表格配置中的指标名称
	 */
	const updateSummaryConfigMetricName = (configIndex: number, metricIndex: number, name: string) => {
		const newConfigs = [...summaryConfigs]
		newConfigs[configIndex].metrics[metricIndex].name = name
		setSummaryConfigs(newConfigs)
	}

	/**
	 * 更新汇总表格配置中的指标聚合类型列表
	 */
	const updateSummaryConfigMetricAggTypes = (configIndex: number, metricIndex: number, aggTypes: string[]) => {
		const newConfigs = [...summaryConfigs]
		newConfigs[configIndex].metrics[metricIndex].aggTypes = aggTypes
		setSummaryConfigs(newConfigs)
	}
	
	/**
	 * 上移汇总表格配置
	 */
	const moveSummaryConfigUp = (index: number) => {
		if (index === 0) return  // 已经在最上面
		const newConfigs = [...summaryConfigs]
		;[newConfigs[index - 1], newConfigs[index]] = [newConfigs[index], newConfigs[index - 1]]
		setSummaryConfigs(newConfigs)
	}
	
	/**
	 * 下移汇总表格配置
	 */
	const moveSummaryConfigDown = (index: number) => {
		if (index === summaryConfigs.length - 1) return  // 已经在最下面
		const newConfigs = [...summaryConfigs]
		;[newConfigs[index], newConfigs[index + 1]] = [newConfigs[index + 1], newConfigs[index]]
		setSummaryConfigs(newConfigs)
	}
	
	/**
	 * 上移指标分组
	 */
	const moveGroupUp = (index: number) => {
		if (index === 0) return  // 已经在最上面
		const newGroups = [...groups]
		;[newGroups[index - 1], newGroups[index]] = [newGroups[index], newGroups[index - 1]]
		setGroups(newGroups)
		
		// 同步更新 groupmapSortKeys
		updateGroupmapSortKeys(newGroups)
	}
	
	/**
	 * 下移指标分组
	 */
	const moveGroupDown = (index: number) => {
		if (index === groups.length - 1) return  // 已经在最下面
		const newGroups = [...groups]
		;[newGroups[index], newGroups[index + 1]] = [newGroups[index + 1], newGroups[index]]
		setGroups(newGroups)
		
		// 同步更新 groupmapSortKeys
		updateGroupmapSortKeys(newGroups)
	}
	
	/**
	 * 根据当前指标分组更新 groupmapSortKeys
	 */
	const updateGroupmapSortKeys = (updatedGroups: GroupItem[]) => {
		const keys = updatedGroups.map(g => g.name).filter(name => name.trim().length > 0)
		setGroupmapSortKeys(keys)
	}

	// ============================================
	// 导入/导出 JSON 功能
	// ============================================

	/**
	 * 复制指标分组配置为 JSON
	 */
	const copyGroupsToJson = () => {
		// 过滤掉空的分组和指标，只保留有效数据
		const exportData = groups
			.filter(g => g.name.trim().length > 0)
			.map(g => ({
				name: g.name,
				metrics: g.metrics.filter(m => m.name.trim().length > 0)
			}))
			.filter(g => g.metrics.length > 0)
		
		const json = JSON.stringify(exportData, null, 2)
		navigator.clipboard.writeText(json).then(() => {
			toast({
				title: "复制成功",
				description: `已复制 ${exportData.length} 个指标分组配置到剪贴板`,
			})
		}).catch(() => {
			toast({
				title: "复制失败",
				description: "无法访问剪贴板",
				variant: "destructive",
			})
		})
	}

	/**
	 * 打开指标分组 JSON 导入对话框
	 */
	const openImportGroupsDialog = () => {
		setImportGroupsJson("")
		setImportGroupsDialogOpen(true)
	}

	/**
	 * 确认导入指标分组配置
	 */
	const confirmImportGroups = () => {
		try {
			const text = importGroupsJson.trim()
			if (!text) {
				throw new Error("请输入 JSON 数据")
			}
			
			const data = JSON.parse(text)
			
			// 验证数据格式
			if (!Array.isArray(data)) {
				throw new Error("JSON 格式错误：应为数组")
			}
			
			const importedGroups: GroupItem[] = data.map((g: any) => {
				if (!g.name || typeof g.name !== 'string') {
					throw new Error("JSON 格式错误：分组缺少 name 字段")
				}
				if (!Array.isArray(g.metrics)) {
					throw new Error(`JSON 格式错误：分组 "${g.name}" 缺少 metrics 数组`)
				}
				return {
					name: g.name,
					metrics: g.metrics.length > 0 ? g.metrics : [{ name: "" }],
					expanded: false
				}
			})
			
			setGroups(importedGroups)
			updateGroupmapSortKeys(importedGroups)
			setImportGroupsDialogOpen(false)
			setImportGroupsJson("")
			
			toast({
				title: "导入成功",
				description: `已导入 ${importedGroups.length} 个指标分组配置`,
			})
		} catch (err) {
			toast({
				title: "导入失败",
				description: err instanceof Error ? err.message : "无法解析 JSON 数据",
				variant: "destructive",
			})
		}
	}

	/**
	 * 复制汇总表格配置为 JSON
	 */
	const copySummaryConfigsToJson = () => {
		// 转换为后端格式并过滤掉空配置
		const exportData = summaryConfigs
			.filter(c => c.name.trim().length > 0 && c.labels.length > 0)
			.map(c => ({
				name: c.name,
				labels: c.labels,
				metrics: c.metrics
					.filter(m => m.name.trim().length > 0 && m.aggTypes.length > 0)
					.map(m => ({
						metric_name: m.name,
						agg_types: m.aggTypes
					}))
			}))
			.filter(c => c.metrics.length > 0)
		
		const json = JSON.stringify(exportData, null, 2)
		navigator.clipboard.writeText(json).then(() => {
			toast({
				title: "复制成功",
				description: `已复制 ${exportData.length} 个汇总表格配置到剪贴板`,
			})
		}).catch(() => {
			toast({
				title: "复制失败",
				description: "无法访问剪贴板",
				variant: "destructive",
			})
		})
	}

	/**
	 * 打开汇总表格 JSON 导入对话框
	 */
	const openImportSummaryDialog = () => {
		setImportSummaryJson("")
		setImportSummaryDialogOpen(true)
	}

	/**
	 * 确认导入汇总表格配置
	 */
	const confirmImportSummary = () => {
		try {
			const text = importSummaryJson.trim()
			if (!text) {
				throw new Error("请输入 JSON 数据")
			}
			
			const data = JSON.parse(text)
			
			// 验证数据格式
			if (!Array.isArray(data)) {
				throw new Error("JSON 格式错误：应为数组")
			}
			
			const importedConfigs: SummaryConfigItem[] = data.map((c: any) => {
				if (!c.name || typeof c.name !== 'string') {
					throw new Error("JSON 格式错误：配置缺少 name 字段")
				}
				if (!Array.isArray(c.labels)) {
					throw new Error(`JSON 格式错误：配置 "${c.name}" 缺少 labels 数组`)
				}
				if (!Array.isArray(c.metrics)) {
					throw new Error(`JSON 格式错误：配置 "${c.name}" 缺少 metrics 数组`)
				}
				
				return {
					name: c.name,
					labels: c.labels,
					metrics: c.metrics.length > 0 
						? c.metrics.map((m: any) => ({
							name: m.metric_name || m.name || "",
							aggTypes: m.agg_types || m.aggTypes || []
						}))
						: [{ name: "", aggTypes: [] }],
					expanded: false
				}
			})
			
			setSummaryConfigs(importedConfigs)
			setImportSummaryDialogOpen(false)
			setImportSummaryJson("")
			
			toast({
				title: "导入成功",
				description: `已导入 ${importedConfigs.length} 个汇总表格配置`,
			})
		} catch (err) {
			toast({
				title: "导入失败",
				description: err instanceof Error ? err.message : "无法解析 JSON 数据",
				variant: "destructive",
			})
		}
	}

	// ============================================
	// 图标上传相关函数
	// ============================================

	/**
	 * 处理文件选择
	 */
	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file) return
		
		// 验证文件类型
		const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml']
		if (!allowedTypes.includes(file.type)) {
			toast({
				title: "文件格式错误",
				description: "仅支持 png/jpg/jpeg/svg 格式",
				variant: "destructive",
			})
			return
		}
		
		// 验证文件大小（最大 2MB）
		if (file.size > 2 * 1024 * 1024) {
			toast({
				title: "文件过大",
				description: "文件大小不能超过 2MB",
				variant: "destructive",
			})
			return
		}
		
		setSelectedFile(file)
		
		// 创建预览 URL
		if (previewUrl) {
			URL.revokeObjectURL(previewUrl)
		}
		const url = URL.createObjectURL(file)
		setPreviewUrl(url)
	}

	/**
	 * 处理图标上传
	 */
	const handleIconUpload = async () => {
		if (!selectedFile || !datasource?.id) return
		
		setUploadLoading(true)
		try {
			const updatedDatasource = await uploadDatasourceIcon(datasource.id, selectedFile)
			
			toast({
				title: "图标上传成功",
				description: `图标已更新为 "${selectedFile.name}"`,
			})
			
			// 更新当前图标名称（用于立即显示）
			setCurrentIconName(updatedDatasource.icon_name)
			
			// 清理状态
			setSelectedFile(null)
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl)
				setPreviewUrl(null)
			}
			
			// 触发刷新
			if (onSuccess) {
				onSuccess()
			}
			window.dispatchEvent(new CustomEvent('datasource-changed'))
			
		} catch (error) {
			console.error("上传图标失败:", error)
			toast({
				title: "上传失败",
				description: error instanceof Error ? error.message : "未知错误",
				variant: "destructive",
			})
		} finally {
			setUploadLoading(false)
		}
	}

	/**
	 * 阻止回车键触发表单提交（避免误操作）
	 */
	function handleKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
		if (e.key === 'Enter' && e.target instanceof HTMLElement) {
			// 如果按下回车键，且目标不是提交按钮，则阻止默认行为
			if (e.target.tagName !== 'BUTTON' && e.target.getAttribute('type') !== 'submit') {
				e.preventDefault()
			}
		}
	}

	/**
	 * 处理表单提交
	 */
	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault()
		setLoading(true)

		try {
			const formData = new FormData(e.currentTarget)
			
			// 构建 groupmap 对象
			const groupmap: Record<string, MetricConfig[]> = {}
			groups.forEach(group => {
				const groupName = group.name.trim()
				const metrics = group.metrics.filter(m => m.name.trim().length > 0)
				if (groupName && metrics.length > 0) {
					// 清理每个 metric，移除空字段
			const cleanedMetrics = metrics.map(m => {
				const cleaned: MetricConfig = { name: m.name }
				if (m.alias?.trim()) cleaned.alias = m.alias.trim()
				if (m.description?.trim()) cleaned.description = m.description.trim()
				if (m.unit?.trim()) cleaned.unit = m.unit.trim()
				if (m.transform?.trim()) cleaned.transform = m.transform.trim()
				if (m.display_labels && m.display_labels.length > 0) {
					// 清理 display_labels：去除空白元素
					const cleanedLabels = m.display_labels.map(l => l.trim()).filter(l => l.length > 0)
					if (cleanedLabels.length > 0) {
						cleaned.display_labels = cleanedLabels
					}
				}
				// column_span 和 chart_type: 始终包含字段
				// 如果值为空字符串，设为 null（用于清空数据库中的旧值）
				// 注意：使用 null 而不是 undefined，确保字段在 JSON 中被序列化
				cleaned.column_span = (m.column_span && m.column_span.trim() ? m.column_span : null) as any
				cleaned.chart_type = (m.chart_type && m.chart_type.trim() ? m.chart_type : null) as any
				return cleaned
			})
					groupmap[groupName] = cleanedMetrics
				}
			})
			
			// 构建 summary_config 数组
			const summaryConfigArray: SummaryConfig[] = []
			summaryConfigs.forEach(config => {
				const configName = config.name.trim()
				const labels = config.labels.filter(l => l.trim().length > 0)
				
				// 从前端数组格式转换为后端 list<MetricAggregation> 格式
				const metricsArray: Array<{ metric_name: string; agg_types: string[] }> = []
				config.metrics.forEach(metric => {
					const metricName = metric.name.trim()
					const aggTypes = metric.aggTypes.filter(t => t.trim().length > 0)
					if (metricName && aggTypes.length > 0) {
						metricsArray.push({
							metric_name: metricName,
							agg_types: aggTypes
						})
					}
				})
				
				if (configName && labels.length > 0 && metricsArray.length > 0) {
					summaryConfigArray.push({
						name: configName,
						labels,
						metrics: metricsArray
					})
				}
			})
			
			// 验证 groupmap_sort_keys
			let validatedSortKeys: string[] | undefined = undefined
			if (groupmapSortKeys.length > 0) {
				// 过滤空字符串
				const cleanedKeys = groupmapSortKeys.filter(key => key.trim().length > 0)
				
				if (cleanedKeys.length > 0) {
					// 验证：确保所有 key 都存在于 groupmap 中
					const groupmapKeys = Object.keys(groupmap)
					const invalidKeys = cleanedKeys.filter(key => !groupmapKeys.includes(key))
					
					if (invalidKeys.length > 0) {
						throw new Error(`分组顺序中包含无效的分组名称：${invalidKeys.join(", ")}。请确保这些分组名称存在于"指标分组"中。`)
					}
					
					validatedSortKeys = cleanedKeys
				}
			}
			
			// 构建数据源对象
			const datasourceData: Datasource = {
				name: (formData.get("name") as string).trim(),
				app_id: (formData.get("app_id") as string).trim(),
				pushgateway_addr_list: addresses.filter(addr => addr.trim().length > 0),  // 过滤空地址
				description: (formData.get("description") as string)?.trim() || undefined,
				groupmap: Object.keys(groupmap).length > 0 ? groupmap : undefined,  // 只在有分组时才传递
				summary_config: summaryConfigArray.length > 0 ? summaryConfigArray : undefined,  // 只在有配置时才传递
				groupmap_sort_keys: validatedSortKeys,  // 只在有有效的排序键时才传递
			}

			// 客户端验证
			const validation = validateDatasource(datasourceData)
			if (!validation.valid) {
				throw new Error(validation.errors.join("\n"))
			}

			// 调用 API
			if (isEditMode) {
				// 编辑模式：调用更新 API
				await updateDatasource(datasource.id, datasourceData)
				
				// 如果选择了新图标，上传图标
				if (selectedFile) {
					try {
						const updatedDatasource = await uploadDatasourceIcon(datasource.id, selectedFile)
						setCurrentIconName(updatedDatasource.icon_name)
						// 清理文件状态
						setSelectedFile(null)
						if (previewUrl) {
							URL.revokeObjectURL(previewUrl)
							setPreviewUrl(null)
						}
					} catch (iconError) {
						console.error("图标上传失败:", iconError)
						toast({
							title: "图标上传失败",
							description: iconError instanceof Error ? iconError.message : "未知错误",
							variant: "destructive",
						})
						// 图标上传失败不阻止整体保存成功
					}
				}
			} else {
				// 创建模式：调用创建 API
				await createDatasource(datasourceData)
			}

		// 成功提示
		toast({
			title: isEditMode ? "更新成功" : "创建成功",
			description: `数据源 "${datasourceData.name}" 已${isEditMode ? "更新" : "添加"}`,
		})

		// 关闭对话框
		setOpen(false)

		// 刷新数据源列表
		if (onSuccess) {
			onSuccess()
		}
		
		// 触发全局刷新事件（用于 Navbar 中的添加按钮）
		window.dispatchEvent(new CustomEvent('datasource-changed'))
			
		} catch (error) {
			console.error(isEditMode ? "更新数据源失败:" : "创建数据源失败:", error)
			toast({
				title: isEditMode ? "更新失败" : "创建失败",
				description: error instanceof Error ? error.message : "未知错误",
				variant: "destructive",
			})
		} finally {
			setLoading(false)
		}
	}

	return (
		<DialogContent className="w-[90%] sm:max-w-[700px] rounded-lg max-h-[90vh] overflow-y-auto p-4 sm:p-5">
			<DialogHeader className="pb-3">
				<DialogTitle>{isEditMode ? "编辑数据源" : "添加新数据源"}</DialogTitle>
				<DialogDescription>
					{isEditMode 
						? "修改数据源的基本信息和指标配置，然后点击保存。" 
						: "填写数据源的基本信息和指标配置，然后点击创建。"}
				</DialogDescription>
			</DialogHeader>

			<form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
				{/* 表单字段 */}
				<div className="grid gap-4 py-2" style={{ gridTemplateColumns: 'auto 1fr' }}>
					{/* ============================================
					    名称字段
					    ============================================ */}
					<Label htmlFor="name" className="text-end whitespace-nowrap self-center">
						名称 <span className="text-destructive">*</span>
					</Label>
					<Input
						id="name"
						name="name"
						placeholder="例如：生产环境监控"
						defaultValue={datasource?.name}
						required
						maxLength={100}
					/>

					{/* ============================================
					    项目 ID 字段
					    ============================================ */}
					<Label htmlFor="app_id" className="text-end whitespace-nowrap self-center">
						项目 ID <span className="text-destructive">*</span>
					</Label>
					<Input
						id="app_id"
						name="app_id"
						placeholder="例如：prod-app-01"
						defaultValue={datasource?.app_id}
						required
						maxLength={50}
					/>

					{/* ============================================
					    数据源地址列表
					    ============================================ */}
					<Label className="text-end pt-2 whitespace-nowrap self-start">
						数据源地址 <span className="text-destructive">*</span>
					</Label>
					<div className="space-y-2">
							{addresses.map((address, index) => (
								<div key={index} className="flex gap-2">
									<Input
										value={address}
										onChange={(e) => updateAddress(index, e.target.value)}
										placeholder="例如：localhost:9091"
										className="flex-1"
										required
									/>
									{/* 删除按钮（至少保留一个输入框） */}
									{addresses.length > 1 && (
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() => removeAddress(index)}
											className="shrink-0"
										>
											<XIcon className="h-4 w-4" />
										</Button>
									)}
								</div>
							))}
							{/* 添加更多地址按钮 */}
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={addAddress}
								className="w-full"
							>
								<PlusIcon className="h-4 w-4 me-1" />
								添加更多地址
							</Button>
					</div>

					{/* ============================================
					    描述字段（可选）
					    ============================================ */}
					<Label htmlFor="description" className="text-end pt-2 whitespace-nowrap self-start">
						描述
					</Label>
					<Textarea
						id="description"
						name="description"
						placeholder="可选：数据源的详细描述"
						className="min-h-20"
						defaultValue={datasource?.description}
						maxLength={500}
					/>

					{/* ============================================
					    项目图标（仅编辑模式可用）
					    ============================================ */}
					{isEditMode && (
						<>
							<Label className="text-end pt-2 whitespace-nowrap self-start">
								项目图标
							</Label>
							<div className="space-y-3">
								{/* 文件选择区域 */}
								<div 
									className={cn(
										"border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
										"hover:border-primary/50 hover:bg-muted/50",
										selectedFile ? "border-primary bg-primary/5" : "border-muted-foreground/25"
									)}
									onClick={() => fileInputRef.current?.click()}
								>
									<input
										ref={fileInputRef}
										type="file"
										accept=".png,.jpg,.jpeg,.svg"
										onChange={handleFileSelect}
										className="hidden"
									/>
									
									{previewUrl ? (
										// 显示新选择的预览图片
										<div className="flex items-center gap-4">
											<img 
												src={previewUrl} 
												alt="预览" 
												className="h-16 w-16 object-contain rounded border"
											/>
											<div className="flex-1 text-left">
												<p className="text-sm font-medium truncate">
													{selectedFile?.name}
												</p>
												<p className="text-xs text-muted-foreground">
													点击重新选择
												</p>
											</div>
										</div>
									) : currentIconName ? (
										// 显示已有的图标
										<div className="flex items-center gap-4">
											<img 
												src={`/icons/${datasource?.id}/${currentIconName}`} 
												alt="当前图标" 
												className="h-16 w-16 object-contain rounded border"
												onError={(e) => {
													// 如果图片加载失败，显示占位符
													(e.target as HTMLImageElement).style.display = 'none'
												}}
											/>
											<div className="flex-1 text-left">
												<p className="text-sm font-medium truncate">
													{currentIconName}
												</p>
												<p className="text-xs text-muted-foreground">
													点击更换图标
												</p>
											</div>
										</div>
									) : (
										// 显示上传提示
										<div className="flex items-center justify-center gap-3 py-2">
											<ImageIcon className="h-8 w-8 text-muted-foreground/50" />
											<div className="text-left">
												<p className="text-sm text-muted-foreground">
													点击选择图标文件
												</p>
												<p className="text-xs text-muted-foreground/70">
													支持 PNG、JPG、SVG，最大 2MB
												</p>
											</div>
										</div>
									)}
								</div>
								
								{/* 上传按钮 */}
								{selectedFile && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={handleIconUpload}
										disabled={uploadLoading}
										className="w-full"
									>
										{uploadLoading ? (
											<>
												<Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
												上传中...
											</>
										) : (
											<>
												<UploadIcon className="mr-2 h-4 w-4" />
												上传图标
											</>
										)}
									</Button>
								)}
							</div>
						</>
					)}

					{/* ============================================
					    分组配置（可选）
					    ============================================ */}
					<Label className="text-end pt-2 whitespace-nowrap self-start">
						指标分组
					</Label>
					<div className="space-y-3">
							{/* 排序提示 */}
							{groups.length > 1 && (
								<div className="flex items-center gap-2 p-2 rounded-md bg-blue-50 border border-blue-200">
									<ListOrderedIcon className="size-4 text-blue-600" />
									<span className="text-sm text-blue-700 flex-1">
										指标分组将按当前顺序显示，可使用上下箭头调整顺序
									</span>
								</div>
							)}
							{/* 导入/导出按钮 */}
							<div className="flex gap-2">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={copyGroupsToJson}
									disabled={groups.length === 0}
									className="flex-1"
								>
									<CopyIcon className="h-3.5 w-3.5 me-1.5" />
									复制为 JSON
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={openImportGroupsDialog}
									className="flex-1"
								>
									<ClipboardPasteIcon className="h-3.5 w-3.5 me-1.5" />
									从 JSON 导入
								</Button>
							</div>
							{groups.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									暂无分组，点击下方按钮添加
								</p>
							) : (
								groups.map((group, groupIndex) => (
									<div key={groupIndex} className="border rounded-lg overflow-hidden">
										{/* 分组头部 */}
										<div className="bg-muted/50 p-3 flex items-center gap-2">
											{/* 展开/折叠按钮 */}
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="h-6 w-6 shrink-0"
												onClick={() => toggleGroupExpanded(groupIndex)}
											>
												{group.expanded ? (
													<ChevronDownIcon className="h-4 w-4" />
												) : (
													<ChevronRightIcon className="h-4 w-4" />
												)}
											</Button>
											
											{/* 拖拽图标 */}
											<GripVerticalIcon className="h-4 w-4 text-muted-foreground shrink-0" />
											
											{/* 分组名称输入框 */}
											<Input
												value={group.name}
												onChange={(e) => {
													updateGroupName(groupIndex, e.target.value)
													// 实时更新 groupmapSortKeys
													const newGroups = [...groups]
													newGroups[groupIndex].name = e.target.value
													updateGroupmapSortKeys(newGroups)
												}}
												placeholder="分组名称（例如：CPU 指标）"
												className="flex-1 h-8 bg-background font-semibold"
											/>
											
											{/* 上移/下移按钮 */}
											{groups.length > 1 && (
												<div className="flex gap-1 shrink-0">
													<Button
														type="button"
														variant="ghost"
														size="icon"
														onClick={() => moveGroupUp(groupIndex)}
														disabled={groupIndex === 0}
														className="h-6 w-6"
														title="上移"
													>
														<ArrowUpIcon className="h-3 w-3" />
													</Button>
													<Button
														type="button"
														variant="ghost"
														size="icon"
														onClick={() => moveGroupDown(groupIndex)}
														disabled={groupIndex === groups.length - 1}
														className="h-6 w-6"
														title="下移"
													>
														<ArrowDownIcon className="h-3 w-3" />
													</Button>
												</div>
											)}
											
											{/* 删除分组按钮 */}
											<Button
												type="button"
												variant="ghost"
												size="icon"
												onClick={() => removeGroup(groupIndex)}
												className="shrink-0 h-6 w-6"
											>
												<XIcon className="h-4 w-4" />
											</Button>
										</div>
										
										{/* 指标列表（可折叠） */}
										{group.expanded && (
											<div className="p-3 space-y-3">
												{group.metrics.map((metric, metricIndex) => (
													<div key={metricIndex} className="border rounded-md p-3 space-y-2 bg-muted/20">
														{/* 指标名称和删除按钮 */}
														<div className="flex gap-2">
															<Input
																value={metric.name}
																onChange={(e) => updateMetric(groupIndex, metricIndex, 'name', e.target.value)}
																placeholder="指标名称*（例如：cpu_usage）"
																className="flex-1 h-9 border-input/40! font-semibold"
															/>
															{/* 删除指标按钮（至少保留一个） */}
															{group.metrics.length > 1 && (
																<Button
																	type="button"
																	variant="ghost"
																	size="icon"
																	onClick={() => removeMetricFromGroup(groupIndex, metricIndex)}
																	className="shrink-0 size-9"
																>
																	<XIcon className="h-3 w-3" />
																</Button>
															)}
														</div>
														
														{/* 可选字段：两行布局 */}
														<div className="grid grid-cols-2 gap-2">
															<Input
																value={metric.alias || ""}
																onChange={(e) => updateMetric(groupIndex, metricIndex, 'alias', e.target.value)}
																placeholder="别名（可选）"
																className="h-8 text-sm border-input/40!"
																maxLength={100}
															/>
															<Input
																value={metric.unit || ""}
																onChange={(e) => updateMetric(groupIndex, metricIndex, 'unit', e.target.value)}
																placeholder="单位（可选，如: %, MB）"
																className="h-8 text-sm border-input/40!"
																maxLength={20}
															/>
														</div>
														
														<Textarea
															value={metric.description || ""}
															onChange={(e) => updateMetric(groupIndex, metricIndex, 'description', e.target.value)}
															placeholder="描述（可选）"
															className="min-h-16 text-sm border-input/40!"
															maxLength={500}
														/>
														
													<Input
														value={metric.transform || ""}
														onChange={(e) => updateMetric(groupIndex, metricIndex, 'transform', e.target.value)}
														placeholder="转换表达式（可选，如: value/1024）"
														className="h-8 text-sm border-input/40!"
														maxLength={200}
													/>
													
											<TagInput
												value={metric.display_labels || []}
												onChange={(labels) => {
													updateMetric(groupIndex, metricIndex, 'display_labels', labels.length > 0 ? labels : undefined)
												}}
												placeholder="显示标签（输入后按逗号或回车添加，如: ip, host）"
												className="text-sm border-input/40!"
											/>
											
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button 
														variant="outline" 
														className="h-8 w-full justify-between text-sm font-normal border-input/40!"
													>
														<span>
															{metric.column_span === 'full' 
																? '占满整行' 
																: metric.column_span === 'half' 
																	? '占半行（2列）' 
																	: '默认布局'}
														</span>
														<ChevronDownIcon className="h-4 w-4 opacity-50" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
													<DropdownMenuRadioGroup
														value={metric.column_span || ''}
														onValueChange={(value) => {
															updateMetric(groupIndex, metricIndex, 'column_span', value || undefined)
														}}
													>
														<DropdownMenuRadioItem value="">
															默认布局
														</DropdownMenuRadioItem>
														<DropdownMenuRadioItem value="full">
															占满整行
														</DropdownMenuRadioItem>
														{/* <DropdownMenuRadioItem value="half">
															占半行（2列）
														</DropdownMenuRadioItem> */}
													</DropdownMenuRadioGroup>
												</DropdownMenuContent>
											</DropdownMenu>
											
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button 
														variant="outline" 
														className="h-8 w-full justify-between text-sm font-normal border-input/40!"
													>
														<span>
															{metric.chart_type === 'scatter' 
																? '散点图' 
																: metric.chart_type === 'area' 
																	? '面积图' 
																	: '默认图表（面积图）'}
														</span>
														<ChevronDownIcon className="h-4 w-4 opacity-50" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
													<DropdownMenuRadioGroup
														value={metric.chart_type || ''}
														onValueChange={(value) => {
															updateMetric(groupIndex, metricIndex, 'chart_type', value || undefined)
														}}
													>
														<DropdownMenuRadioItem value="">
															默认图表（面积图）
														</DropdownMenuRadioItem>
														<DropdownMenuRadioItem value="area">
															面积图
														</DropdownMenuRadioItem>
														<DropdownMenuRadioItem value="scatter">
															散点图（适合稀疏数据）
														</DropdownMenuRadioItem>
													</DropdownMenuRadioGroup>
												</DropdownMenuContent>
											</DropdownMenu>
											</div>
										))}
												
												{/* 添加指标按钮 */}
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => addMetricToGroup(groupIndex)}
													className="w-full h-8 text-xs"
												>
													<PlusIcon className="h-3 w-3 me-1" />
													添加指标
												</Button>
											</div>
										)}
									</div>
								))
							)}
							{/* 添加分组按钮 */}
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={addGroup}
								className="w-full"
							>
								<PlusIcon className="h-4 w-4 me-1" />
								添加分组
							</Button>
					</div>

					{/* ============================================
					    分组排序键（自动同步）
					    ============================================ */}
					<Label className="text-end pt-2 whitespace-nowrap self-start">
						分组顺序
					</Label>
					<div className="space-y-2">
						{groupmapSortKeys.length > 0 ? (
							<div className="flex flex-wrap gap-2 p-3 border rounded-md bg-muted/30">
								{groupmapSortKeys.map((key, index) => (
									<div key={index} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-background border text-sm">
										<span className="font-mono text-xs text-muted-foreground">#{index + 1}</span>
										<span>{key}</span>
									</div>
								))}
							</div>
						) : (
							<div className="p-3 border rounded-md bg-muted/30 text-sm text-muted-foreground">
								无自定义顺序，将按默认顺序显示
							</div>
						)}
						<p className="text-xs text-muted-foreground">
							💡 提示：分组顺序会自动根据上方"指标分组"的顺序同步更新
						</p>
					</div>

					{/* ============================================
					    汇总表格配置（可选）
					    ============================================ */}
					<Label className="text-end pt-2 whitespace-nowrap self-start">
						汇总表格
					</Label>
					<div className="space-y-3">
							{/* 排序提示和按钮 */}
							{summaryConfigs.length > 1 && (
								<div className="flex items-center gap-2 p-2 rounded-md bg-blue-50 border border-blue-200">
									<ListOrderedIcon className="size-4 text-blue-600" />
									<span className="text-sm text-blue-700 flex-1">
										汇总表格将按当前顺序显示，可使用上下箭头调整顺序
									</span>
								</div>
							)}
							{/* 导入/导出按钮 */}
							<div className="flex gap-2">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={copySummaryConfigsToJson}
									disabled={summaryConfigs.length === 0}
									className="flex-1"
								>
									<CopyIcon className="h-3.5 w-3.5 me-1.5" />
									复制为 JSON
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={openImportSummaryDialog}
									className="flex-1"
								>
									<ClipboardPasteIcon className="h-3.5 w-3.5 me-1.5" />
									从 JSON 导入
								</Button>
							</div>
							{summaryConfigs.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									暂无汇总表格配置，点击下方按钮添加
								</p>
							) : (
								summaryConfigs.map((config, configIndex) => (
									<div key={configIndex} className="border rounded-lg overflow-hidden">
										{/* 配置头部 */}
										<div className="bg-muted/50 p-3 flex items-center gap-2">
											{/* 展开/折叠按钮 */}
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="h-6 w-6 shrink-0"
												onClick={() => toggleSummaryConfigExpanded(configIndex)}
											>
												{config.expanded ? (
													<ChevronDownIcon className="h-4 w-4" />
												) : (
													<ChevronRightIcon className="h-4 w-4" />
												)}
											</Button>
											
											{/* 拖拽图标 */}
											<GripVerticalIcon className="h-4 w-4 text-muted-foreground shrink-0" />
											
											{/* 表格名称输入框 */}
											<Input
												value={config.name}
												onChange={(e) => updateSummaryConfigName(configIndex, e.target.value)}
												placeholder="表格名称*（例如：实例汇总表）"
												className="flex-1 h-8 bg-background font-semibold"
											/>
											
											{/* 上移/下移按钮 */}
											{summaryConfigs.length > 1 && (
												<div className="flex gap-1 shrink-0">
													<Button
														type="button"
														variant="ghost"
														size="icon"
														onClick={() => moveSummaryConfigUp(configIndex)}
														disabled={configIndex === 0}
														className="h-6 w-6"
														title="上移"
													>
														<ArrowUpIcon className="h-3 w-3" />
													</Button>
													<Button
														type="button"
														variant="ghost"
														size="icon"
														onClick={() => moveSummaryConfigDown(configIndex)}
														disabled={configIndex === summaryConfigs.length - 1}
														className="h-6 w-6"
														title="下移"
													>
														<ArrowDownIcon className="h-3 w-3" />
													</Button>
												</div>
											)}
											
											{/* 删除配置按钮 */}
											<Button
												type="button"
												variant="ghost"
												size="icon"
												onClick={() => removeSummaryConfig(configIndex)}
												className="shrink-0 h-6 w-6"
											>
												<XIcon className="h-4 w-4" />
											</Button>
										</div>
										
										{/* 配置内容（可折叠） */}
										{config.expanded && (
											<div className="p-3 space-y-3">
												{/* 标签列表 */}
												<TagInput
													value={config.labels}
													onChange={(labels) => updateSummaryConfigLabels(configIndex, labels)}
													placeholder="表格标签列*（表格左侧展示的标签，如: ip, host）"
													className="text-sm"
												/>
												
												{/* 指标列表 */}
												<div className="space-y-2">
													{config.metrics.map((metric, metricIndex) => (
														<div key={metricIndex} className="border rounded-md p-2.5 space-y-2 bg-muted/20">
															{/* 指标名称 */}
															<div className="flex gap-2">
																<Input
																	value={metric.name}
																	onChange={(e) => updateSummaryConfigMetricName(configIndex, metricIndex, e.target.value)}
																	placeholder="指标名称*（例如：cpu_usage）"
																	className="flex-1 h-8 text-sm border-input/40!"
																/>
																{/* 删除指标按钮（至少保留一个） */}
																{config.metrics.length > 1 && (
																	<Button
																		type="button"
																		variant="ghost"
																		size="icon"
																		onClick={() => removeMetricFromSummaryConfig(configIndex, metricIndex)}
																		className="shrink-0 size-8"
																	>
																		<XIcon className="h-3 w-3" />
																	</Button>
																)}
															</div>
															
															{/* 聚合类型列表 */}
															<TagInput
																value={metric.aggTypes}
																onChange={(aggTypes) => {
																	// 校验聚合类型，只允许 avg, max, min, count, last
																	const validAggTypes = ['avg', 'max', 'min', 'count', 'last']
																	const filteredAggTypes = aggTypes.filter(type => {
																		const normalized = type.toLowerCase().trim()
																		if (!validAggTypes.includes(normalized)) {
																			toast({
																				title: "无效的聚合类型",
																				description: `"${type}" 不是有效的聚合类型。仅支持: avg, max, min, count, last`,
																				variant: "destructive",
																			})
																			return false
																		}
																		return true
																	}).map(type => type.toLowerCase().trim())
																	updateSummaryConfigMetricAggTypes(configIndex, metricIndex, filteredAggTypes)
																}}
																placeholder="聚合类型*（如: avg, max, min, count, last）"
																className="text-sm h-8"
															/>
														</div>
													))}
													
													{/* 添加指标按钮 */}
													<Button
														type="button"
														variant="outline"
														size="sm"
														onClick={() => addMetricToSummaryConfig(configIndex)}
														className="w-full h-8 text-xs"
													>
														<PlusIcon className="h-3 w-3 me-1" />
														添加指标
													</Button>
												</div>
											</div>
										)}
									</div>
								))
							)}
							{/* 添加汇总表格配置按钮 */}
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={addSummaryConfig}
								className="w-full"
							>
								<PlusIcon className="h-4 w-4 me-1" />
								添加汇总表格
							</Button>
					</div>
				</div>

				{/* ============================================
				    JSON 导入对话框 - 指标分组
				    ============================================ */}
				<Dialog open={importGroupsDialogOpen} onOpenChange={setImportGroupsDialogOpen}>
					<DialogContent className="sm:max-w-[600px]">
						<DialogHeader>
							<DialogTitle>导入指标分组配置</DialogTitle>
							<DialogDescription>
								将 JSON 格式的指标分组配置粘贴到下方文本框中
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-2">
							<Textarea
								value={importGroupsJson}
								onChange={(e) => setImportGroupsJson(e.target.value)}
								placeholder={`[
  {
    "name": "分组名称",
    "metrics": [
      { "name": "metric_name", "alias": "显示名称", "unit": "%" }
    ]
  }
]`}
								className="min-h-[300px] font-mono text-sm"
							/>
							<p className="text-xs text-muted-foreground">
								支持的格式：JSON 数组，每项包含 name（分组名称）和 metrics（指标数组）
							</p>
						</div>
						<DialogFooter>
							<Button variant="outline" onClick={() => setImportGroupsDialogOpen(false)}>
								取消
							</Button>
							<Button onClick={confirmImportGroups}>
								导入
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				{/* ============================================
				    JSON 导入对话框 - 汇总表格
				    ============================================ */}
				<Dialog open={importSummaryDialogOpen} onOpenChange={setImportSummaryDialogOpen}>
					<DialogContent className="sm:max-w-[600px]">
						<DialogHeader>
							<DialogTitle>导入汇总表格配置</DialogTitle>
							<DialogDescription>
								将 JSON 格式的汇总表格配置粘贴到下方文本框中
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-2">
							<Textarea
								value={importSummaryJson}
								onChange={(e) => setImportSummaryJson(e.target.value)}
								placeholder={`[
  {
    "name": "表格名称",
    "labels": ["label1", "label2"],
    "metrics": [
      { "metric_name": "cpu", "agg_types": ["avg", "max"] }
    ]
  }
]`}
								className="min-h-[300px] font-mono text-sm"
							/>
							<p className="text-xs text-muted-foreground">
								支持的格式：JSON 数组，每项包含 name、labels 和 metrics
							</p>
						</div>
						<DialogFooter>
							<Button variant="outline" onClick={() => setImportSummaryDialogOpen(false)}>
								取消
							</Button>
							<Button onClick={confirmImportSummary}>
								导入
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				{/* ============================================
				    底部按钮
				    ============================================ */}
				<DialogFooter>
					<Button 
						type="button" 
						variant="outline" 
						onClick={() => setOpen(false)}
						disabled={loading}
					>
						取消
					</Button>
					<Button type="submit" disabled={loading}>
						{loading 
							? (isEditMode ? "保存中..." : "创建中...") 
							: (isEditMode ? "保存" : "创建")}
					</Button>
				</DialogFooter>
			</form>
		</DialogContent>
	)
}
