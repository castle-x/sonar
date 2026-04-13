/**
 * ============================================
 * Tag Input 组件
 * ============================================
 * 
 * 标签输入组件，支持：
 * - 输入逗号、回车自动添加标签
 * - 显示为可删除的小块（badge）
 * - 粘贴多个标签（逗号分隔）
 * - 删除最后一个标签（按 Backspace）
 */

import { XIcon } from "lucide-react"
import { useState, KeyboardEvent, ClipboardEvent, useRef } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

export interface TagInputProps {
	/** 当前标签列表 */
	value: string[]
	
	/** 标签变化回调 */
	onChange: (tags: string[]) => void
	
	/** 占位符文本 */
	placeholder?: string
	
	/** 样式类名 */
	className?: string
	
	/** 是否禁用 */
	disabled?: boolean
	
	/** 最大标签数量 */
	maxTags?: number
}

export function TagInput({
	value = [],
	onChange,
	placeholder = "输入后按逗号或回车添加",
	className,
	disabled = false,
	maxTags,
}: TagInputProps) {
	const [inputValue, setInputValue] = useState("")
	const inputRef = useRef<HTMLInputElement>(null)

	/**
	 * 添加标签
	 */
	const addTag = (tag: string) => {
		const trimmedTag = tag.trim()
		if (!trimmedTag) return
		if (value.includes(trimmedTag)) return // 避免重复
		if (maxTags && value.length >= maxTags) return
		
		onChange([...value, trimmedTag])
		setInputValue("")
	}

	/**
	 * 添加多个标签
	 */
	const addTags = (tags: string[]) => {
		const newTags = tags
			.map(t => t.trim())
			.filter(t => t && !value.includes(t))
		
		if (newTags.length === 0) return
		
		if (maxTags) {
			const available = maxTags - value.length
			onChange([...value, ...newTags.slice(0, available)])
		} else {
			onChange([...value, ...newTags])
		}
		setInputValue("")
	}

	/**
	 * 删除标签
	 */
	const removeTag = (index: number) => {
		onChange(value.filter((_, i) => i !== index))
	}

	/**
	 * 处理键盘事件
	 */
	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		// 逗号或回车：添加标签
		if (e.key === "," || e.key === "Enter") {
			e.preventDefault()
			if (inputValue) {
				addTag(inputValue)
			}
			return
		}

		// Backspace：如果输入框为空，删除最后一个标签
		if (e.key === "Backspace" && !inputValue && value.length > 0) {
			e.preventDefault()
			removeTag(value.length - 1)
			return
		}
	}

	/**
	 * 处理粘贴事件
	 */
	const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
		const pastedText = e.clipboardData.getData("text")
		
		// 如果包含逗号，认为是批量粘贴
		if (pastedText.includes(",")) {
			e.preventDefault()
			const tags = pastedText.split(",")
			addTags(tags)
		}
	}

	/**
	 * 聚焦到输入框
	 */
	const focusInput = () => {
		inputRef.current?.focus()
	}

	return (
		<div
			className={cn(
				"flex min-h-9 w-full flex-wrap gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
				"focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
				disabled && "cursor-not-allowed opacity-50",
				className
			)}
			onClick={focusInput}
		>
			{/* 标签列表 */}
			{value.map((tag, index) => (
				<Badge
					key={index}
					variant="secondary"
					className="gap-1 pe-1 ps-2 h-6"
				>
					<span className="text-xs">{tag}</span>
					{!disabled && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation()
								removeTag(index)
							}}
							className="rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
						>
							<XIcon className="h-3 w-3" />
						</button>
					)}
				</Badge>
			))}

			{/* 输入框 */}
			<input
				ref={inputRef}
				type="text"
				value={inputValue}
				onChange={(e) => setInputValue(e.target.value)}
				onKeyDown={handleKeyDown}
				onPaste={handlePaste}
				disabled={disabled || (maxTags !== undefined && value.length >= maxTags)}
				placeholder={value.length === 0 ? placeholder : ""}
				className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
			/>
		</div>
	)
}

