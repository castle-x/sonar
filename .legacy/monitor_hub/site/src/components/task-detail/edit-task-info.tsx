/**
 * EditTaskInfo - 编辑任务信息对话框
 * 
 * 功能：
 * 1. 编辑任务名称 (name)
 * 2. 编辑测试信息 (extra_info) - 两两一组，支持颜色标记，支持拖拽排序
 * 3. 编辑标签 (tags) - 单个输入，支持颜色标记，支持拖拽排序
 * 
 * 复用报告编辑对话框的逻辑
 */

import { useState } from "react"
import { PlusIcon, XIcon, GripVerticalIcon, SparklesIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import { updateTask, type TaskRecord } from "@/apis/task"
import { extraInfoArrayToObject } from "@/apis/report"

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
		inputClass: ''
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

// 预设的测试任务常用字段
const PRESET_FIELDS = [
	{ key: '测试环境', placeholder: '如：生产环境 / 测试环境 / 预发布环境' },
	{ key: '测试目的', placeholder: '如：功能验证 / 性能测试 / 回归测试' },
	{ key: '测试标准', placeholder: '如：通过率 > 95% / 响应时间 < 100ms' },
	{ key: '测试版本', placeholder: '如：v1.2.3 / build-20260113' },
	{ key: '测试周期', placeholder: '如：2026-01-13 ~ 2026-01-20' },
	{ key: '测试人', placeholder: '如：张三、李四' },
] as const

// 预设的常用标签
const PRESET_TAGS = [
	{ label: 'GS', color: 'blue' as ColorName },
	{ label: 'DS', color: 'green' as ColorName },
	{ label: '周报', color: 'yellow' as ColorName },
	{ label: '压测', color: 'red' as ColorName },
	{ label: '回归', color: 'none' as ColorName },
	{ label: '冒烟', color: 'none' as ColorName },
	{ label: '功能', color: 'none' as ColorName },
	{ label: '性能', color: 'none' as ColorName },
] as const

function getColorConfig(colorName: ColorName) {
	return COLORS.find(c => c.name === colorName) || COLORS[0]
}

function parseColoredValue(value: string): { text: string; color: ColorName } {
	const match = value.match(/^(.+)\{\{(red|yellow|blue|green)\}\}$/)
	if (match) {
		return { text: match[1], color: match[2] as ColorName }
	}
	return { text: value, color: 'none' }
}

function formatColoredValue(text: string, color: ColorName): string {
	if (color === 'none' || !text.trim()) {
		return text
	}
	return `${text}{{${color}}}`
}

interface ExtraInfoItem {
	id: string
	key: string
	value: string
	color: ColorName
}

interface TagItem {
	id: string
	value: string
	color: ColorName
}

let idCounter = 0
function generateId() {
	return `item-${Date.now()}-${idCounter++}`
}

function ColorPicker({ value, onChange }: { value: ColorName; onChange: (color: ColorName) => void }) {
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
			className={cn("flex-1 transition-colors duration-200", colorConfig.inputClass, className)}
		/>
	)
}

// 可排序的测试信息行
function SortableExtraInfoRow({
	item,
	onUpdate,
	onRemove,
}: {
	item: ExtraInfoItem
	onUpdate: (field: 'key' | 'value' | 'color', value: string | ColorName) => void
	onRemove: () => void
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	}

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				"flex items-center gap-2 p-2 rounded-md border bg-card",
				isDragging && "opacity-50 shadow-lg z-50"
			)}
		>
			<button
				type="button"
				className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
				{...attributes}
				{...listeners}
			>
				<GripVerticalIcon className="h-4 w-4" />
			</button>
			<ColoredInput
				value={item.key}
				onChange={(v) => onUpdate('key', v)}
				placeholder="键名"
				color="none"
				className="w-32"
			/>
			<ColoredInput
				value={item.value}
				onChange={(v) => onUpdate('value', v)}
				placeholder="值"
				color={item.color}
			/>
			<ColorPicker value={item.color} onChange={(c) => onUpdate('color', c)} />
			<Button
				type="button"
				variant="ghost"
				size="icon"
				onClick={onRemove}
				className="h-8 w-8 text-muted-foreground hover:text-destructive"
			>
				<XIcon className="h-4 w-4" />
			</Button>
		</div>
	)
}

// 可排序的标签行
function SortableTagRow({
	item,
	onUpdate,
	onRemove,
}: {
	item: TagItem
	onUpdate: (field: 'value' | 'color', value: string | ColorName) => void
	onRemove: () => void
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	}

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				"flex items-center gap-2 p-2 rounded-md border bg-card",
				isDragging && "opacity-50 shadow-lg z-50"
			)}
		>
			<button
				type="button"
				className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
				{...attributes}
				{...listeners}
			>
				<GripVerticalIcon className="h-4 w-4" />
			</button>
			<ColoredInput
				value={item.value}
				onChange={(v) => onUpdate('value', v)}
				placeholder="标签名称"
				color={item.color}
			/>
			<ColorPicker value={item.color} onChange={(c) => onUpdate('color', c)} />
			<Button
				type="button"
				variant="ghost"
				size="icon"
				onClick={onRemove}
				className="h-8 w-8 text-muted-foreground hover:text-destructive"
			>
				<XIcon className="h-4 w-4" />
			</Button>
		</div>
	)
}

interface EditTaskInfoDialogProps {
	task: TaskRecord
	setOpen: (open: boolean) => void
	onSuccess?: () => void
}

export function EditTaskInfoDialog({ task, setOpen, onSuccess }: EditTaskInfoDialogProps) {
	const { toast } = useToast()
	const [loading, setLoading] = useState(false)

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	)

	// 任务名称
	const [name, setName] = useState(task.name || '')

	// 测试信息（extra_info）
	const [extraInfoItems, setExtraInfoItems] = useState<ExtraInfoItem[]>(() => {
		const infoObj = extraInfoArrayToObject(task.extra_info)
		const items: ExtraInfoItem[] = []
		Object.entries(infoObj).forEach(([key, value]) => {
			const { text, color } = parseColoredValue(value)
			items.push({ id: generateId(), key, value: text, color })
		})
		if (items.length === 0) {
			items.push({ id: generateId(), key: '', value: '', color: 'none' })
		}
		return items
	})

	// 标签
	const [tagItems, setTagItems] = useState<TagItem[]>(() => {
		const items: TagItem[] = (task.tags || []).map(tag => {
			const { text, color } = parseColoredValue(tag)
			return { id: generateId(), value: text, color }
		})
		if (items.length === 0) {
			items.push({ id: generateId(), value: '', color: 'none' })
		}
		return items
	})

	// 拖拽排序处理
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

	// 测试信息操作
	const addExtraInfoItem = () => {
		setExtraInfoItems([...extraInfoItems, { id: generateId(), key: '', value: '', color: 'none' }])
	}

	// 一键添加预设字段
	const addPresetFields = () => {
		// 获取当前已有的键名
		const existingKeys = new Set(extraInfoItems.map(item => item.key.trim()).filter(Boolean))
		
		// 过滤掉已存在的预设字段，只添加新的
		const newItems: ExtraInfoItem[] = PRESET_FIELDS
			.filter(preset => !existingKeys.has(preset.key))
			.map(preset => ({
				id: generateId(),
				key: preset.key,
				value: '',
				color: 'none' as ColorName,
			}))
		
		if (newItems.length === 0) {
			toast({
				title: "提示",
				description: "所有预设字段已存在",
			})
			return
		}
		
		// 清除空行，添加预设字段
		const nonEmptyItems = extraInfoItems.filter(item => item.key.trim() || item.value.trim())
		setExtraInfoItems([...nonEmptyItems, ...newItems])
		
		toast({
			title: "已添加",
			description: `添加了 ${newItems.length} 个常用字段`,
		})
	}

	const removeExtraInfoItem = (index: number) => {
		if (extraInfoItems.length > 1) {
			setExtraInfoItems(extraInfoItems.filter((_, i) => i !== index))
		} else {
			setExtraInfoItems([{ id: generateId(), key: '', value: '', color: 'none' }])
		}
	}

	const updateExtraInfoItem = (index: number, field: 'key' | 'value' | 'color', newValue: string | ColorName) => {
		const newItems = [...extraInfoItems]
		if (field === 'color') {
			newItems[index].color = newValue as ColorName
		} else {
			newItems[index][field] = newValue as string
		}
		setExtraInfoItems(newItems)
	}

	// 标签操作
	const addTagItem = () => {
		setTagItems([...tagItems, { id: generateId(), value: '', color: 'none' }])
	}

	const removeTagItem = (index: number) => {
		if (tagItems.length > 1) {
			setTagItems(tagItems.filter((_, i) => i !== index))
		} else {
			setTagItems([{ id: generateId(), value: '', color: 'none' }])
		}
	}

	const updateTagItem = (index: number, field: 'value' | 'color', newValue: string | ColorName) => {
		const newItems = [...tagItems]
		if (field === 'color') {
			newItems[index].color = newValue as ColorName
		} else {
			newItems[index].value = newValue as string
		}
		setTagItems(newItems)
	}

	// 表单提交
	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		
		if (!name.trim()) {
			toast({
				title: "验证失败",
				description: "任务名称不能为空",
				variant: "destructive",
			})
			return
		}
		
		setLoading(true)

		try {
			// 构建 extra_info 数组
			const extraInfoArray: string[] = []
			extraInfoItems.forEach(item => {
				const key = item.key.trim()
				const value = item.value.trim()
				if (key && value) {
					extraInfoArray.push(key)
					extraInfoArray.push(formatColoredValue(value, item.color))
				}
			})

			// 构建 tags 数组
			const tags = tagItems
				.filter(item => item.value.trim())
				.map(item => formatColoredValue(item.value.trim(), item.color))

			// 调用更新 API
			await updateTask(task.id, {
				name: name.trim(),
				extra_info: extraInfoArray,
				tags: tags,
			})

			toast({
				title: "更新成功",
				description: "任务信息已更新",
			})

			setOpen(false)
			onSuccess?.()

		} catch (error) {
			console.error("更新任务失败:", error)
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
				<DialogTitle>编辑任务信息</DialogTitle>
				<DialogDescription>
					修改任务名称、测试信息和标签。拖拽左侧图标可调整顺序。
				</DialogDescription>
			</DialogHeader>

			<form onSubmit={handleSubmit}>
				<div className="space-y-6 py-4">
					{/* 任务名称 */}
					<div className="space-y-2">
						<Label className="text-sm font-semibold">任务名称 *</Label>
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="请输入任务名称"
							required
						/>
					</div>

					{/* 测试信息（可拖拽排序） */}
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label className="text-sm font-semibold">测试信息</Label>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={addPresetFields}
								className="h-7 text-xs text-muted-foreground hover:text-primary"
							>
								<SparklesIcon className="h-3.5 w-3.5 mr-1" />
								一键添加常用字段
							</Button>
						</div>
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
						<Button type="button" variant="outline" size="sm" onClick={addExtraInfoItem} className="w-full">
							<PlusIcon className="h-4 w-4 mr-1" />
							新增
						</Button>
					</div>

					{/* 标签（可拖拽排序） */}
					<div className="space-y-2">
						<Label className="text-sm font-semibold">标签</Label>
						{/* 预设标签快捷选择 */}
						<div className="flex flex-wrap gap-1.5 p-2 rounded-md bg-muted/30 border border-dashed">
							<span className="text-xs text-muted-foreground mr-1 self-center">快捷添加:</span>
							{PRESET_TAGS.map((preset) => {
								const colorConfig = getColorConfig(preset.color)
								const isAdded = tagItems.some(item => item.value.trim() === preset.label)
								return (
									<button
										key={preset.label}
										type="button"
										disabled={isAdded}
										onClick={() => {
											// 清除空行，添加新标签
											const nonEmptyItems = tagItems.filter(item => item.value.trim())
											setTagItems([
												...nonEmptyItems,
												{ id: generateId(), value: preset.label, color: preset.color }
											])
										}}
										className={cn(
											"px-2 py-0.5 text-xs rounded-full border transition-all",
											isAdded 
												? "opacity-40 cursor-not-allowed bg-muted" 
												: "hover:scale-105 hover:shadow-sm cursor-pointer",
											preset.color !== 'none' && !isAdded && colorConfig.inputClass
										)}
									>
										{preset.label}
										{isAdded && " ✓"}
									</button>
								)
							})}
						</div>
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
						<Button type="button" variant="outline" size="sm" onClick={addTagItem} className="w-full">
							<PlusIcon className="h-4 w-4 mr-1" />
							新增
						</Button>
					</div>
				</div>

				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
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
