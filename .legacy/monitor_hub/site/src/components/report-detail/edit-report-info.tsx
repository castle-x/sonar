/**
 * EditReportInfo - 编辑报告测试信息对话框
 * 
 * 功能：
 * 1. 编辑测试时间 (test_timeline)
 * 2. 编辑测试信息 (extra_info) - 两两一组，支持颜色标记，支持拖拽排序
 * 3. 编辑标签 (tags) - 单个输入，支持颜色标记，支持拖拽排序
 * 
 * 颜色格式：value{{color}} 如 @castlexu{{red}}
 */

import { useState } from "react"
import { PlusIcon, XIcon, EditIcon, GripVerticalIcon } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import { extraInfoArrayToObject, extraInfoObjectToArray, updateReport } from "@/apis/report"
import type { ReportRecord } from "@/apis/report"

// @dnd-kit imports
import {
	DndContext,
	closestCenter,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
} from "@dnd-kit/core"
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

// 可用颜色列表 - 现代玻璃质感样式
const COLORS = [
	{ 
		name: 'none', 
		label: '无', 
		buttonClass: 'bg-gradient-to-br from-gray-200/80 to-gray-300/80 hover:from-gray-300/90 hover:to-gray-400/90 shadow-sm',
		selectedClass: 'ring-gray-400/50 shadow-gray-300/50',
		inputClass: '' // 默认颜色
	},
	{ 
		name: 'red', 
		label: '红', 
		buttonClass: 'bg-gradient-to-br from-red-400/80 to-red-500/80 hover:from-red-500/90 hover:to-red-600/90 shadow-sm shadow-red-500/20',
		selectedClass: 'ring-red-400/50 shadow-red-400/40',
		inputClass: 'text-red-600'
	},
	{ 
		name: 'yellow', 
		label: '黄', 
		buttonClass: 'bg-gradient-to-br from-amber-400/80 to-amber-500/80 hover:from-amber-500/90 hover:to-amber-600/90 shadow-sm shadow-amber-500/20',
		selectedClass: 'ring-amber-400/50 shadow-amber-400/40',
		inputClass: 'text-amber-600'
	},
	{ 
		name: 'blue', 
		label: '蓝', 
		buttonClass: 'bg-gradient-to-br from-blue-400/80 to-blue-500/80 hover:from-blue-500/90 hover:to-blue-600/90 shadow-sm shadow-blue-500/20',
		selectedClass: 'ring-blue-400/50 shadow-blue-400/40',
		inputClass: 'text-blue-600'
	},
	{ 
		name: 'green', 
		label: '绿', 
		buttonClass: 'bg-gradient-to-br from-emerald-400/80 to-emerald-500/80 hover:from-emerald-500/90 hover:to-emerald-600/90 shadow-sm shadow-emerald-500/20',
		selectedClass: 'ring-emerald-400/50 shadow-emerald-400/40',
		inputClass: 'text-emerald-600'
	},
] as const

type ColorName = typeof COLORS[number]['name']

// 获取颜色配置
function getColorConfig(colorName: ColorName) {
	return COLORS.find(c => c.name === colorName) || COLORS[0]
}

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
 * 将值和颜色组合成带颜色标记的字符串
 */
function formatColoredValue(text: string, color: ColorName): string {
	if (color === 'none' || !text.trim()) {
		return text
	}
	return `${text}{{${color}}}`
}

/**
 * 测试信息项（键值对）- 带唯一ID用于拖拽
 */
interface ExtraInfoItem {
	id: string
	key: string
	value: string
	color: ColorName
}

/**
 * 标签项 - 带唯一ID用于拖拽
 */
interface TagItem {
	id: string
	value: string
	color: ColorName
}

// 生成唯一ID
let idCounter = 0
function generateId() {
	return `item-${Date.now()}-${idCounter++}`
}

/**
 * 颜色选择按钮组 - 现代玻璃质感设计
 */
function ColorPicker({ 
	value, 
	onChange 
}: { 
	value: ColorName
	onChange: (color: ColorName) => void 
}) {
	return (
		<div className="flex gap-1.5 p-1 rounded-lg bg-muted/30 backdrop-blur-sm">
			{COLORS.map((color) => (
				<button
					key={color.name}
					type="button"
					className={cn(
						"w-5 h-5 rounded-full transition-all duration-200 backdrop-blur-sm",
						color.buttonClass,
						value === color.name 
							? cn("ring-2 ring-offset-1 ring-offset-background scale-110", color.selectedClass)
							: "hover:scale-105"
					)}
					onClick={() => onChange(color.name)}
					title={color.label}
				/>
			))}
		</div>
	)
}

/**
 * 带颜色预览的输入框
 */
function ColoredInput({
	value,
	onChange,
	placeholder,
	color,
	className
}: {
	value: string
	onChange: (value: string) => void
	placeholder: string
	color: ColorName
	className?: string
}) {
	const colorConfig = getColorConfig(color)
	
	return (
		<Input
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder}
			className={cn(
				"flex-1 transition-colors duration-200",
				colorConfig.inputClass,
				className
			)}
		/>
	)
}

/**
 * 可排序的测试信息行
 */
function SortableExtraInfoRow({
	item,
	onUpdate,
	onRemove,
}: {
	item: ExtraInfoItem
	onUpdate: (field: 'key' | 'value' | 'color', value: string | ColorName) => void
	onRemove: () => void
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: item.id })

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	}

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				"flex items-center gap-2",
				isDragging && "opacity-50 bg-muted/50 rounded-md"
			)}
		>
			{/* 拖拽手柄 */}
			<button
				type="button"
				className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground transition-colors"
				{...attributes}
				{...listeners}
			>
				<GripVerticalIcon className="h-4 w-4" />
			</button>
			{/* 键 */}
			<Input
				value={item.key}
				onChange={(e) => onUpdate('key', e.target.value)}
				placeholder="键（如：测试人）"
				className="flex-1"
			/>
			{/* 值 - 带颜色预览 */}
			<ColoredInput
				value={item.value}
				onChange={(value) => onUpdate('value', value)}
				placeholder="值（如：@castlexu）"
				color={item.color}
			/>
			{/* 颜色选择 */}
			<ColorPicker
				value={item.color}
				onChange={(color) => onUpdate('color', color)}
			/>
			{/* 删除按钮 */}
			<Button
				type="button"
				variant="ghost"
				size="icon"
				onClick={onRemove}
				className="shrink-0 h-9 w-9"
			>
				<XIcon className="h-4 w-4" />
			</Button>
		</div>
	)
}

/**
 * 可排序的标签行
 */
function SortableTagRow({
	item,
	onUpdate,
	onRemove,
}: {
	item: TagItem
	onUpdate: (field: 'value' | 'color', value: string | ColorName) => void
	onRemove: () => void
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: item.id })

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	}

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				"flex items-center gap-2",
				isDragging && "opacity-50 bg-muted/50 rounded-md"
			)}
		>
			{/* 拖拽手柄 */}
			<button
				type="button"
				className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground transition-colors"
				{...attributes}
				{...listeners}
			>
				<GripVerticalIcon className="h-4 w-4" />
			</button>
			{/* 标签值 - 带颜色预览 */}
			<ColoredInput
				value={item.value}
				onChange={(value) => onUpdate('value', value)}
				placeholder="标签（如：Debug）"
				color={item.color}
			/>
			{/* 颜色选择 */}
			<ColorPicker
				value={item.color}
				onChange={(color) => onUpdate('color', color)}
			/>
			{/* 删除按钮 */}
			<Button
				type="button"
				variant="ghost"
				size="icon"
				onClick={onRemove}
				className="shrink-0 h-9 w-9"
			>
				<XIcon className="h-4 w-4" />
			</Button>
		</div>
	)
}

interface EditReportInfoButtonProps {
	report: ReportRecord
	onSuccess?: () => void
	className?: string
}

/**
 * 编辑按钮组件
 */
export function EditReportInfoButton({ 
	report, 
	onSuccess,
	className 
}: EditReportInfoButtonProps) {
	const [open, setOpen] = useState(false)

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<DialogTrigger asChild>
							<Button variant="outline" size="sm" className={className}>
								<EditIcon className="h-4 w-4" />
							</Button>
						</DialogTrigger>
					</TooltipTrigger>
					<TooltipContent>
						编辑测试信息表格和标签，支持设置文本颜色
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
			<EditReportInfoDialog 
				report={report} 
				setOpen={setOpen} 
				onSuccess={onSuccess}
			/>
		</Dialog>
	)
}

interface EditReportInfoDialogProps {
	report: ReportRecord
	setOpen: (open: boolean) => void
	onSuccess?: () => void
}

/**
 * 编辑对话框内容 - 可独立使用
 */
export function EditReportInfoDialog({ 
	report, 
	setOpen, 
	onSuccess 
}: EditReportInfoDialogProps) {
	const { toast } = useToast()
	const [loading, setLoading] = useState(false)

	// 拖拽传感器配置
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8, // 需要移动 8px 才触发拖拽，避免误触
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	)

	// 报告名称
	const [reportName, setReportName] = useState(report.name || '')

	// 测试时间
	const [testTimeline, setTestTimeline] = useState(report.test_timeline || '')

	// 测试信息（extra_info）- 带唯一ID
	const [extraInfoItems, setExtraInfoItems] = useState<ExtraInfoItem[]>(() => {
		const infoObj = extraInfoArrayToObject(report.extra_info)
		const items: ExtraInfoItem[] = []
		Object.entries(infoObj).forEach(([key, value]) => {
			const { text, color } = parseColoredValue(value)
			items.push({ id: generateId(), key, value: text, color })
		})
		// 至少保留一个空行
		if (items.length === 0) {
			items.push({ id: generateId(), key: '', value: '', color: 'none' })
		}
		return items
	})

	// 标签 - 带唯一ID
	const [tagItems, setTagItems] = useState<TagItem[]>(() => {
		const items: TagItem[] = (report.tags || []).map(tag => {
			const { text, color } = parseColoredValue(tag)
			return { id: generateId(), value: text, color }
		})
		// 至少保留一个空行
		if (items.length === 0) {
			items.push({ id: generateId(), value: '', color: 'none' })
		}
		return items
	})

	// ============================================
	// 拖拽排序处理
	// ============================================

	function handleExtraInfoDragEnd(event: DragEndEvent) {
		const { active, over } = event
		if (over && active.id !== over.id) {
			setExtraInfoItems((items) => {
				const oldIndex = items.findIndex((i) => i.id === active.id)
				const newIndex = items.findIndex((i) => i.id === over.id)
				return arrayMove(items, oldIndex, newIndex)
			})
		}
	}

	function handleTagDragEnd(event: DragEndEvent) {
		const { active, over } = event
		if (over && active.id !== over.id) {
			setTagItems((items) => {
				const oldIndex = items.findIndex((i) => i.id === active.id)
				const newIndex = items.findIndex((i) => i.id === over.id)
				return arrayMove(items, oldIndex, newIndex)
			})
		}
	}

	// ============================================
	// 测试信息操作
	// ============================================

	const addExtraInfoItem = () => {
		setExtraInfoItems([...extraInfoItems, { id: generateId(), key: '', value: '', color: 'none' }])
	}

	const removeExtraInfoItem = (index: number) => {
		if (extraInfoItems.length > 1) {
			setExtraInfoItems(extraInfoItems.filter((_, i) => i !== index))
		} else {
			// 如果只有一个，清空内容
			setExtraInfoItems([{ id: generateId(), key: '', value: '', color: 'none' }])
		}
	}

	const updateExtraInfoItem = (
		index: number, 
		field: 'key' | 'value' | 'color', 
		newValue: string | ColorName
	) => {
		const newItems = [...extraInfoItems]
		if (field === 'color') {
			newItems[index].color = newValue as ColorName
		} else {
			newItems[index][field] = newValue as string
		}
		setExtraInfoItems(newItems)
	}

	// ============================================
	// 标签操作
	// ============================================

	const addTagItem = () => {
		setTagItems([...tagItems, { id: generateId(), value: '', color: 'none' }])
	}

	const removeTagItem = (index: number) => {
		if (tagItems.length > 1) {
			setTagItems(tagItems.filter((_, i) => i !== index))
		} else {
			// 如果只有一个，清空内容
			setTagItems([{ id: generateId(), value: '', color: 'none' }])
		}
	}

	const updateTagItem = (
		index: number, 
		field: 'value' | 'color', 
		newValue: string | ColorName
	) => {
		const newItems = [...tagItems]
		if (field === 'color') {
			newItems[index].color = newValue as ColorName
		} else {
			newItems[index].value = newValue as string
		}
		setTagItems(newItems)
	}

	// ============================================
	// 表单提交
	// ============================================

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		setLoading(true)

		try {
			// 构建 extra_info 数组（保持排序顺序）
			const extraInfoArray: string[] = []
			extraInfoItems.forEach(item => {
				const key = item.key.trim()
				const value = item.value.trim()
				if (key && value) {
					extraInfoArray.push(key)
					extraInfoArray.push(formatColoredValue(value, item.color))
				}
			})

			// 构建 tags 数组（保持排序顺序）
			const tags = tagItems
				.filter(item => item.value.trim())
				.map(item => formatColoredValue(item.value.trim(), item.color))

			// 调用更新 API（增量更新，传递的字段都会被更新）
			await updateReport(report.id, {
				name: reportName.trim() || undefined,
				test_timeline: testTimeline.trim() || undefined,
				extra_info: extraInfoArray,  // 直接使用数组，保持顺序
				tags: tags,  // 空数组时后端会清空标签
			})

			toast({
				title: "更新成功",
				description: "测试信息已更新",
			})

			setOpen(false)
			onSuccess?.()

		} catch (error) {
			console.error("更新报告失败:", error)
			toast({
				title: "更新失败",
				description: error instanceof Error ? error.message : "未知错误",
				variant: "destructive",
			})
		} finally {
			setLoading(false)
		}
	}

	return (
		<DialogContent className="w-[90%] sm:max-w-[650px] rounded-lg max-h-[90vh] overflow-y-auto">
			<DialogHeader>
				<DialogTitle>编辑测试信息</DialogTitle>
				<DialogDescription>
					修改报告的测试时间、测试信息和标签。拖拽左侧图标可调整顺序。
				</DialogDescription>
			</DialogHeader>

			<form onSubmit={handleSubmit}>
				<div className="space-y-6 py-4">
					{/* ============================================
					    报告名称
					    ============================================ */}
					<div className="space-y-2">
						<Label className="text-sm font-semibold">报告名称</Label>
						<Input
							value={reportName}
							onChange={(e) => setReportName(e.target.value)}
							placeholder="请输入报告名称"
						/>
					</div>

					{/* ============================================
					    测试时间
					    ============================================ */}
					<div className="space-y-2">
						<Label className="text-sm font-semibold">测试时间 (默认显示在左侧第一个单元格)</Label>
						<Input
							value={testTimeline}
							onChange={(e) => setTestTimeline(e.target.value)}
							placeholder="例如：2025-12-02 14:15:26 ~ 2025-12-02 15:45:26"
						/>
					</div>

					{/* ============================================
					    测试信息（可拖拽排序）
					    ============================================ */}
					<div className="space-y-2">
						<Label className="text-sm font-semibold">测试信息</Label>
						<DndContext
							sensors={sensors}
							collisionDetection={closestCenter}
							onDragEnd={handleExtraInfoDragEnd}
						>
							<SortableContext
								items={extraInfoItems.map(i => i.id)}
								strategy={verticalListSortingStrategy}
							>
								<div className="space-y-2">
									{extraInfoItems.map((item, index) => (
										<SortableExtraInfoRow
											key={item.id}
											item={item}
											onUpdate={(field, value) => updateExtraInfoItem(index, field, value)}
											onRemove={() => removeExtraInfoItem(index)}
										/>
									))}
								</div>
							</SortableContext>
						</DndContext>
						{/* 添加按钮 */}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={addExtraInfoItem}
							className="w-full"
						>
							<PlusIcon className="h-4 w-4 mr-1" />
							新增
						</Button>
					</div>

					{/* ============================================
					    标签（可拖拽排序）
					    ============================================ */}
					<div className="space-y-2">
						<Label className="text-sm font-semibold">标签</Label>
						<DndContext
							sensors={sensors}
							collisionDetection={closestCenter}
							onDragEnd={handleTagDragEnd}
						>
							<SortableContext
								items={tagItems.map(i => i.id)}
								strategy={verticalListSortingStrategy}
							>
								<div className="space-y-2">
									{tagItems.map((item, index) => (
										<SortableTagRow
											key={item.id}
											item={item}
											onUpdate={(field, value) => updateTagItem(index, field, value)}
											onRemove={() => removeTagItem(index)}
										/>
									))}
								</div>
							</SortableContext>
						</DndContext>
						{/* 添加按钮 */}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={addTagItem}
							className="w-full"
						>
							<PlusIcon className="h-4 w-4 mr-1" />
							新增
						</Button>
					</div>
				</div>

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
						{loading ? "保存中..." : "保存"}
					</Button>
				</DialogFooter>
			</form>
		</DialogContent>
	)
}
