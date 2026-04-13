/**
 * ============================================
 * 高级筛选对话框组件
 * ============================================
 * 
 * 为报告表格提供高级筛选功能：
 * 1. 预定义字段筛选（名称、数据源、项目ID、创建方式、操作人）
 * 2. 自定义 MongoDB 查询（JSON 格式）
 */

import { useState, useEffect } from "react"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { XIcon } from "lucide-react"

// ============================================
// 常量定义
// ============================================

/** 创建方式选项 */
const CREATE_TYPE_OPTIONS = [
	{ value: "api_call", label: "API 调用" },
	{ value: "web_manual", label: "手动创建" },
	{ value: "scheduled", label: "定时任务" },
] as const

interface AdvancedFilterDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onApply: (query: string) => void
	initialQuery?: string
}

export function AdvancedFilterDialog({
	open,
	onOpenChange,
	onApply,
	initialQuery = "",
}: AdvancedFilterDialogProps) {
	// ============================================
	// 状态管理
	// ============================================
	
	/** 预定义字段的值 */
	const [name, setName] = useState("")
	const [datasourceName, setDatasourceName] = useState("")
	const [appId, setAppId] = useState("")
	const [createType, setCreateType] = useState("")
	const [operator, setOperator] = useState("")
	
	/** 自定义查询（JSON 字符串） */
	const [customQuery, setCustomQuery] = useState("")
	
	/** JSON 验证错误 */
	const [jsonError, setJsonError] = useState("")
	
	// ============================================
	// 初始化
	// ============================================
	
	/** 从初始查询字符串解析字段 */
	useEffect(() => {
		if (initialQuery && open) {
			try {
				const parsed = JSON.parse(initialQuery)
				setName(parsed.name || "")
				setDatasourceName(parsed.datasource_name || "")
				setAppId(parsed.app_id || "")
				setCreateType(parsed.create_type || "")
				setOperator(parsed.operator || "")
				
				// 如果有其他字段，显示在自定义查询中
				const knownFields = ["name", "datasource_name", "app_id", "create_type", "operator"]
				const otherFields: Record<string, any> = {}
				for (const key in parsed) {
					if (!knownFields.includes(key)) {
						otherFields[key] = parsed[key]
					}
				}
				if (Object.keys(otherFields).length > 0) {
					setCustomQuery(JSON.stringify(otherFields, null, 2))
				}
			} catch {
				// 如果解析失败，可能是自定义查询
				setCustomQuery(initialQuery)
			}
		}
	}, [initialQuery, open])
	
	// ============================================
	// 事件处理
	// ============================================
	
	/** 验证自定义查询的 JSON 格式 */
	const validateCustomQuery = (value: string): boolean => {
		if (!value.trim()) {
			setJsonError("")
			return true
		}
		
		try {
			JSON.parse(value)
			setJsonError("")
			return true
		} catch (error) {
			setJsonError(error instanceof Error ? error.message : "JSON 格式错误")
			return false
		}
	}
	
	/** 处理自定义查询输入 */
	const handleCustomQueryChange = (value: string) => {
		setCustomQuery(value)
		validateCustomQuery(value)
	}
	
	/** 生成查询字符串 */
	const generateQuery = (): string => {
		const query: Record<string, string> = {}
		
		// 添加预定义字段
		if (name) query.name = name
		if (datasourceName) query.datasource_name = datasourceName
		if (appId) query.app_id = appId
		if (createType) query.create_type = createType
		if (operator) query.operator = operator
		
		// 合并自定义查询
		if (customQuery.trim()) {
			try {
				const customParsed = JSON.parse(customQuery)
				Object.assign(query, customParsed)
			} catch {
				// 忽略无效的自定义查询
			}
		}
		
		return Object.keys(query).length > 0 ? JSON.stringify(query) : ""
	}
	
	/** 应用筛选 */
	const handleApply = () => {
		const query = generateQuery()
		onApply(query)
		onOpenChange(false)
	}
	
	/** 重置筛选 */
	const handleReset = () => {
		setName("")
		setDatasourceName("")
		setAppId("")
		setCreateType("")
		setOperator("")
		setCustomQuery("")
		setJsonError("")
		onApply("")
		onOpenChange(false)
	}
	
	/** 获取当前筛选条件数量 */
	const getActiveFiltersCount = (): number => {
		let count = 0
		if (name) count++
		if (datasourceName) count++
		if (appId) count++
		if (createType) count++
		if (operator) count++
		if (customQuery.trim()) count++
		return count
	}
	
	// ============================================
	// 渲染
	// ============================================
	
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						高级筛选
						{getActiveFiltersCount() > 0 && (
							<Badge variant="secondary" className="ml-auto">
								{getActiveFiltersCount()} 个筛选条件
							</Badge>
						)}
					</DialogTitle>
					<DialogDescription>
						使用预定义字段或自定义 MongoDB 查询来筛选报告
					</DialogDescription>
				</DialogHeader>
				
				<Tabs defaultValue="predefined" className="w-full">
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="predefined">预定义字段</TabsTrigger>
						<TabsTrigger value="custom">自定义查询</TabsTrigger>
					</TabsList>
					
					{/* 预定义字段筛选 */}
					<TabsContent value="predefined" className="space-y-4 mt-4">
						<div className="grid gap-4">
							{/* 名称 */}
							<div className="grid gap-2">
								<Label htmlFor="filter-name">名称</Label>
								<div className="flex gap-2">
									<Input
										id="filter-name"
										placeholder="例如：性能测试报告"
										value={name}
										onChange={(e) => setName(e.target.value)}
									/>
									{name && (
										<Button
											variant="ghost"
											size="icon"
											onClick={() => setName("")}
											className="shrink-0"
										>
											<XIcon className="size-4" />
										</Button>
									)}
								</div>
							</div>
							
							{/* 数据源 */}
							<div className="grid gap-2">
								<Label htmlFor="filter-datasource">数据源</Label>
								<div className="flex gap-2">
									<Input
										id="filter-datasource"
										placeholder="例如：GSTM-STRESSTEST2"
										value={datasourceName}
										onChange={(e) => setDatasourceName(e.target.value)}
									/>
									{datasourceName && (
										<Button
											variant="ghost"
											size="icon"
											onClick={() => setDatasourceName("")}
											className="shrink-0"
										>
											<XIcon className="size-4" />
										</Button>
									)}
								</div>
							</div>
							
							{/* 项目ID */}
							<div className="grid gap-2">
								<Label htmlFor="filter-app-id">项目ID</Label>
								<div className="flex gap-2">
									<Input
										id="filter-app-id"
										placeholder="例如：gstm"
										value={appId}
										onChange={(e) => setAppId(e.target.value)}
									/>
									{appId && (
										<Button
											variant="ghost"
											size="icon"
											onClick={() => setAppId("")}
											className="shrink-0"
										>
											<XIcon className="size-4" />
										</Button>
									)}
								</div>
							</div>
							
						{/* 创建方式 */}
						<div className="grid gap-2">
							<Label htmlFor="filter-create-type">创建方式</Label>
							<div className="flex gap-2">
								<Select value={createType} onValueChange={setCreateType}>
									<SelectTrigger id="filter-create-type">
										<SelectValue placeholder="选择创建方式..." />
									</SelectTrigger>
									<SelectContent>
										{CREATE_TYPE_OPTIONS.map((option) => (
											<SelectItem key={option.value} value={option.value}>
												{option.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{createType && (
									<Button
										variant="ghost"
										size="icon"
										onClick={() => setCreateType("")}
										className="shrink-0"
									>
										<XIcon className="size-4" />
									</Button>
								)}
							</div>
						</div>
							
							{/* 操作人 */}
							<div className="grid gap-2">
								<Label htmlFor="filter-operator">创建人</Label>
								<div className="flex gap-2">
									<Input
										id="filter-operator"
										placeholder="例如：Admin"
										value={operator}
										onChange={(e) => setOperator(e.target.value)}
									/>
									{operator && (
										<Button
											variant="ghost"
											size="icon"
											onClick={() => setOperator("")}
											className="shrink-0"
										>
											<XIcon className="size-4" />
										</Button>
									)}
								</div>
							</div>
						</div>
						
						<div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
							<strong>提示：</strong> 多个筛选条件之间是"与"的关系，即必须同时满足所有条件。
						</div>
					</TabsContent>
					
					{/* 自定义查询 */}
					<TabsContent value="custom" className="space-y-4 mt-4">
						<div className="grid gap-2">
							<Label htmlFor="custom-query">MongoDB 查询（JSON 格式）</Label>
							<Textarea
								id="custom-query"
								placeholder='{"datasource_name": "GSTM-STRESSTEST2", "app_id": "gstm"}'
								value={customQuery}
								onChange={(e) => handleCustomQueryChange(e.target.value)}
								className="font-mono text-sm min-h-[200px]"
							/>
							{jsonError && (
								<p className="text-sm text-destructive">{jsonError}</p>
							)}
						</div>
						
						<div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 space-y-2">
							<p><strong>示例：</strong></p>
							<pre className="bg-background rounded p-2 overflow-x-auto">
{`{
  "datasource_name": "GSTM-STRESSTEST2",
  "app_id": "gstm",
  "create_type": "api_call"
}`}
							</pre>
							<p className="pt-2"><strong>注意：</strong> 自定义查询会与预定义字段合并。如果有冲突，自定义查询优先。</p>
							<p className="pt-1"><strong>创建方式值：</strong> api_call | web_manual | scheduled</p>
						</div>
					</TabsContent>
				</Tabs>
				
				<DialogFooter className="gap-2">
					<Button variant="outline" onClick={handleReset}>
						重置
					</Button>
					<Button onClick={handleApply} disabled={!!jsonError}>
						应用筛选
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

