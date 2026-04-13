/**
 * RichTextEditor - 富文本编辑器组件
 * 
 * 基于 Tiptap 实现，支持：
 * - H1/H2/H3 标题
 * - 有序列表、无序列表、待办事项
 * - 加粗、斜体、下划线、删除线
 * - 行内代码、代码块（带行号和语法高亮）
 * - 引用、分隔符
 * - 编辑和只读模式
 * - 粘贴 Markdown 自动转换
 */

import { useEditor, EditorContent, NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer, Node } from '@tiptap/react'
import { Extension, wrappingInputRule } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model'
import { useState, useEffect, useRef, useCallback } from 'react'
import { marked } from 'marked'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import Link from '@tiptap/extension-link'
import { common, createLowlight } from 'lowlight'
import { NodeViewProps } from '@tiptap/core'
import { 
	BoldIcon, 
	ItalicIcon, 
	UnderlineIcon, 
	StrikethroughIcon,
	Heading1Icon, 
	Heading2Icon, 
	Heading3Icon,
	ListIcon,
	ListOrderedIcon,
	ListTodoIcon,
	Undo2Icon,
	Redo2Icon,
	CodeIcon,
	SquareCodeIcon,
	QuoteIcon,
	MinusIcon,
	PaletteIcon,
	HighlighterIcon,
	TypeIcon,
	ChevronDownIcon,
	TableIcon,
	PlusIcon,
	Trash2Icon,
	ColumnsIcon,
	RowsIcon,
	LinkIcon,
	UnlinkIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { Input } from './input'
import { Separator } from './separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuLabel,
} from './dropdown-menu'
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from './context-menu'

// 创建 lowlight 实例
const lowlight = createLowlight(common)

// 配置 marked（禁用不安全的 HTML）
marked.setOptions({
	gfm: true, // 支持 GitHub 风格的 Markdown
	breaks: true, // 将换行符转换为 <br>
})

/**
 * 检测文本是否像 Markdown 格式
 * 检测常见的 Markdown 语法特征
 */
function looksLikeMarkdown(text: string): boolean {
	const trimmed = text.trim()
	
	// 检测多种 Markdown 语法特征
	const markdownPatterns = [
		/^#{1,6}\s+.+/m,           // 标题 # ## ### 等
		/^\*\s+.+/m,               // 无序列表 * item
		/^-\s+.+/m,                // 无序列表 - item
		/^\d+\.\s+.+/m,            // 有序列表 1. item
		/\*\*.+\*\*/,              // 加粗 **text**
		/\*.+\*/,                  // 斜体 *text*
		/__.+__/,                  // 加粗 __text__
		/_.+_/,                    // 斜体 _text_
		/`[^`]+`/,                 // 行内代码 `code`
		/```[\s\S]*?```/,          // 代码块 ```code```
		/^\s*>\s+.+/m,             // 引用 > text
		/\[.+\]\(.+\)/,            // 链接 [text](url)
		/!\[.*\]\(.+\)/,           // 图片 ![alt](url)
		/^\s*[-*_]{3,}\s*$/m,      // 分隔线 --- *** ___
		/^\|.+\|$/m,               // 表格 | col1 | col2 |
		/~~.+~~/,                  // 删除线 ~~text~~
	]
	
	// 统计匹配的特征数量
	let matchCount = 0
	for (const pattern of markdownPatterns) {
		if (pattern.test(trimmed)) {
			matchCount++
		}
	}
	
	// 如果匹配了至少一个 Markdown 特征，就认为是 Markdown
	return matchCount >= 1
}

/**
 * 将 Markdown 转换为 HTML
 */
function markdownToHtml(markdown: string): string {
	try {
		// 使用 marked 解析 Markdown
		const html = marked.parse(markdown)
		// marked.parse 可能返回 Promise，但在同步模式下返回 string
		if (typeof html === 'string') {
			return html
		}
		return markdown
	} catch (error) {
		console.error('Markdown 解析失败:', error)
		return markdown
	}
}

/**
 * Markdown 粘贴处理扩展
 * 在粘贴纯文本时，检测是否为 Markdown 格式并转换为 HTML
 */
const MarkdownPaste = Extension.create({
	name: 'markdownPaste',
	
	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: new PluginKey('markdownPaste'),
				props: {
					handlePaste: (view, event) => {
						const clipboardData = event.clipboardData
						if (!clipboardData) return false
						
						// 获取纯文本内容
						const text = clipboardData.getData('text/plain')
						// 获取 HTML 内容
						const html = clipboardData.getData('text/html')
						
						// 如果已经有 HTML 内容（如从富文本编辑器复制），使用默认处理
						if (html && html.trim()) {
							return false
						}
						
						// 检测纯文本是否像 Markdown
						if (text && looksLikeMarkdown(text)) {
							event.preventDefault()
							
							// 将 Markdown 转换为 HTML
							const convertedHtml = markdownToHtml(text)
							
							// 创建一个临时 div 来解析 HTML
							const tempDiv = document.createElement('div')
							tempDiv.innerHTML = convertedHtml
							
							// 使用 schema 的 DOMParser 将 HTML 转换为 ProseMirror 文档片段
							const schema = view.state.schema
							const parser = ProseMirrorDOMParser.fromSchema(schema)
							const parsedContent = parser.parse(tempDiv)
							
							// 使用事务替换当前选区
							const { tr } = view.state
							const transaction = tr.replaceSelectionWith(parsedContent, false)
							view.dispatch(transaction)
							
							return true
						}
						
						return false
					},
				},
			}),
		]
	},
})

// 自定义字体大小扩展
const FontSize = Extension.create({
	name: 'fontSize',
	addOptions() {
		return {
			types: ['textStyle'],
		}
	},
	addGlobalAttributes() {
		return [
			{
				types: this.options.types,
				attributes: {
					fontSize: {
						default: null,
						parseHTML: element => element.style.fontSize?.replace(/['"]+/g, ''),
						renderHTML: attributes => {
							if (!attributes.fontSize) {
								return {}
							}
							return {
								style: `font-size: ${attributes.fontSize}`,
							}
						},
					},
				},
			},
		]
	},
	addCommands() {
		return {
			setFontSize: (fontSize: string) => ({ chain }) => {
				return chain().setMark('textStyle', { fontSize }).run()
			},
			unsetFontSize: () => ({ chain }) => {
				return chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
			},
		}
	},
})

// 自定义引用块扩展（支持边框颜色）
// 引用块输入规则：> 空格
const blockquoteInputRegex = /^\s*>\s$/

const CustomBlockquote = Node.create({
	name: 'blockquote',
	group: 'block',
	content: 'block+',
	defining: true,
	
	addAttributes() {
		return {
			borderColor: {
				default: '#3370ff', // 默认蓝色
				parseHTML: element => element.getAttribute('data-border-color') || element.style.borderLeftColor || '#3370ff',
				renderHTML: attributes => {
					return {
						'data-border-color': attributes.borderColor,
						style: `border-left-color: ${attributes.borderColor}`,
					}
				},
			},
		}
	},
	
	parseHTML() {
		return [{ tag: 'blockquote' }]
	},
	
	renderHTML({ HTMLAttributes }) {
		return ['blockquote', HTMLAttributes, 0]
	},
	
	addCommands() {
		return {
			setBlockquote: (attributes?: { borderColor?: string }) => ({ commands }: { commands: any }) => {
				return commands.wrapIn(this.name, attributes)
			},
			toggleBlockquote: (attributes?: { borderColor?: string }) => ({ commands }: { commands: any }) => {
				return commands.toggleWrap(this.name, attributes)
			},
			unsetBlockquote: () => ({ commands }: { commands: any }) => {
				return commands.lift(this.name)
			},
		}
	},
	
	addInputRules() {
		return [
			wrappingInputRule({
				find: blockquoteInputRegex,
				type: this.type,
			}),
		]
	},
	
	addKeyboardShortcuts() {
		return {
			'Mod-Shift-b': () => this.editor.commands.toggleBlockquote(),
		}
	},
})

// 引用块边框颜色预设
const BLOCKQUOTE_COLORS = [
	{ label: '蓝色', value: '#3370ff', color: '#3370ff' },
	{ label: '绿色', value: '#10b981', color: '#10b981' },
	{ label: '橙色', value: '#f59e0b', color: '#f59e0b' },
	{ label: '红色', value: '#ef4444', color: '#ef4444' },
	{ label: '紫色', value: '#8b5cf6', color: '#8b5cf6' },
	{ label: '灰色', value: '#6b7280', color: '#6b7280' },
]

// 预设字体大小
const FONT_SIZES = [
	{ label: '小', value: '12px' },
	{ label: '正常', value: '14px' },
	{ label: '中', value: '16px' },
	{ label: '大', value: '18px' },
	{ label: '特大', value: '24px' },
	{ label: '超大', value: '32px' },
]

// 预设文字颜色
const TEXT_COLORS = [
	{ label: '默认', value: '', color: 'inherit' },
	{ label: '红色', value: '#ef4444', color: '#ef4444' },
	{ label: '橙色', value: '#f97316', color: '#f97316' },
	{ label: '黄色', value: '#eab308', color: '#eab308' },
	{ label: '绿色', value: '#22c55e', color: '#22c55e' },
	{ label: '蓝色', value: '#3b82f6', color: '#3b82f6' },
	{ label: '紫色', value: '#8b5cf6', color: '#8b5cf6' },
	{ label: '粉色', value: '#ec4899', color: '#ec4899' },
	{ label: '灰色', value: '#6b7280', color: '#6b7280' },
]

// 预设背景高亮色
const HIGHLIGHT_COLORS = [
	{ label: '无', value: '', color: 'transparent' },
	{ label: '黄色', value: '#fef08a', color: '#fef08a' },
	{ label: '绿色', value: '#bbf7d0', color: '#bbf7d0' },
	{ label: '蓝色', value: '#bfdbfe', color: '#bfdbfe' },
	{ label: '紫色', value: '#ddd6fe', color: '#ddd6fe' },
	{ label: '粉色', value: '#fbcfe8', color: '#fbcfe8' },
	{ label: '橙色', value: '#fed7aa', color: '#fed7aa' },
	{ label: '红色', value: '#fecaca', color: '#fecaca' },
]

// 检测是否为 Mac 系统
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

// 快捷键映射 - Mac 和 Windows/Linux
const shortcuts = {
	undo: isMac ? '⌘Z' : 'Ctrl+Z',
	redo: isMac ? '⌘⇧Z' : 'Ctrl+Y',
	heading1: isMac ? '⌘⌥1' : 'Ctrl+Alt+1',
	heading2: isMac ? '⌘⌥2' : 'Ctrl+Alt+2',
	heading3: isMac ? '⌘⌥3' : 'Ctrl+Alt+3',
	bold: isMac ? '⌘B' : 'Ctrl+B',
	italic: isMac ? '⌘I' : 'Ctrl+I',
	underline: isMac ? '⌘U' : 'Ctrl+U',
	strike: isMac ? '⌘⇧S' : 'Ctrl+Shift+S',
	code: isMac ? '⌘E' : 'Ctrl+E',
	codeBlock: isMac ? '⌘⌥C' : 'Ctrl+Alt+C',
	bulletList: isMac ? '⌘⇧8' : 'Ctrl+Shift+8',
	orderedList: isMac ? '⌘⇧7' : 'Ctrl+Shift+7',
	taskList: isMac ? '⌘⇧9' : 'Ctrl+Shift+9',
	blockquote: isMac ? '⌘⇧B' : 'Ctrl+Shift+B',
}

interface RichTextEditorProps {
	/** 内容（HTML 格式） */
	content?: string
	/** 是否只读 */
	readonly?: boolean
	/** 内容变化回调 */
	onChange?: (html: string) => void
	/** 自定义类名 */
	className?: string
	/** 占位符 */
	placeholder?: string
}

// 自定义代码块组件 - 带行号
function CodeBlockWithLineNumbers({ node }: NodeViewProps) {
	const code = node.textContent || ''
	const lines = code.split('\n')
	// 如果最后一行是空的，不显示它的行号（但保持可编辑）
	const lineCount = lines.length
	
	return (
		<NodeViewWrapper className="code-block-wrapper">
			<div className="code-block-with-lines">
			<div className="line-numbers" contentEditable={false}>
				{Array.from({ length: lineCount }, (_, i) => (
					<span key={i + 1}>{i + 1}</span>
				))}
			</div>
			<pre><code>
				<NodeViewContent />
			</code></pre>
			</div>
		</NodeViewWrapper>
	)
}

// 工具栏按钮组件
interface ToolbarButtonProps {
	icon: React.ReactNode
	label: string
	shortcut?: string
	isActive?: boolean
	onClick: () => void
	disabled?: boolean
}

function ToolbarButton({ icon, label, shortcut, isActive, onClick, disabled }: ToolbarButtonProps) {
	return (
		<TooltipProvider>
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className={cn(
							"h-8 w-8 p-0",
							isActive && "bg-muted text-primary"
						)}
						onClick={onClick}
						disabled={disabled}
					>
						{icon}
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<div className="flex items-center gap-2">
						<span>{label}</span>
						{shortcut && (
							<kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-muted rounded text-muted-foreground">
								{shortcut}
							</kbd>
						)}
					</div>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	)
}

// 创建带自定义渲染的 CodeBlockLowlight 扩展
const CustomCodeBlock = CodeBlockLowlight.extend({
	addNodeView() {
		return ReactNodeViewRenderer(CodeBlockWithLineNumbers)
	},
})


// 浮动工具栏组件
interface FloatingToolbarProps {
	editor: ReturnType<typeof useEditor>
}

function FloatingToolbar({ editor }: FloatingToolbarProps) {
	const [isVisible, setIsVisible] = useState(false)
	const [position, setPosition] = useState({ top: 0, left: 0 })
	const [savedSelection, setSavedSelection] = useState<{ from: number; to: number } | null>(null)
	const toolbarRef = useRef<HTMLDivElement>(null)
	const isInteractingRef = useRef(false)
	
	const updatePosition = useCallback(() => {
		if (!editor) return
		
		const { from, to, empty } = editor.state.selection
		
		// 如果没有选中文本，隐藏工具栏
		if (empty) {
			if (!isInteractingRef.current) {
				setIsVisible(false)
			}
			return
		}
		
		// 保存选区
		setSavedSelection({ from, to })
		
		// 获取选中文本的位置
		const { view } = editor
		const start = view.coordsAtPos(from)
		const end = view.coordsAtPos(to)
		
		// 计算工具栏位置（在选中文本的上方居中）
		const toolbarWidth = toolbarRef.current?.offsetWidth || 200
		const left = (start.left + end.left) / 2 - toolbarWidth / 2
		const top = start.top - 45 // 工具栏在选中文本上方
		
		setPosition({ top, left: Math.max(10, left) })
		setIsVisible(true)
	}, [editor])
	
	// 恢复选区并执行命令
	const executeCommand = useCallback((command: () => void) => {
		if (!editor || !savedSelection) return
		
		// 恢复选区
		editor.chain()
			.focus()
			.setTextSelection(savedSelection)
			.run()
		
		// 执行命令
		command()
	}, [editor, savedSelection])
	
	useEffect(() => {
		if (!editor) return
		
		// 监听选择变化
		editor.on('selectionUpdate', updatePosition)
		
		const handleBlur = () => {
			// 延迟检查，如果正在交互则不隐藏
			setTimeout(() => {
				if (!isInteractingRef.current) {
					setIsVisible(false)
				}
			}, 150)
		}
		
		editor.on('blur', handleBlur)
		
		return () => {
			editor.off('selectionUpdate', updatePosition)
			editor.off('blur', handleBlur)
		}
	}, [editor, updatePosition])
	
	if (!editor || !isVisible) return null
	
	// 处理下拉菜单打开/关闭
	const handleOpenChange = (open: boolean) => {
		isInteractingRef.current = open
	}
	
	return (
		<div
			ref={toolbarRef}
			className="fixed z-50 flex items-center gap-0.5 p-1 bg-popover border rounded-lg shadow-lg animate-in fade-in zoom-in-95 duration-150"
			style={{ top: position.top, left: position.left }}
			onMouseDown={(e) => e.preventDefault()} // 防止点击工具栏时失去焦点
		>
			{/* 加粗 */}
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className={cn("h-7 w-7 p-0", editor.isActive('bold') && "bg-muted text-primary")}
				onClick={() => editor.chain().focus().toggleBold().run()}
			>
				<BoldIcon className="h-3.5 w-3.5" />
			</Button>
			
			{/* 斜体 */}
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className={cn("h-7 w-7 p-0", editor.isActive('italic') && "bg-muted text-primary")}
				onClick={() => editor.chain().focus().toggleItalic().run()}
			>
				<ItalicIcon className="h-3.5 w-3.5" />
			</Button>
			
			{/* 下划线 */}
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className={cn("h-7 w-7 p-0", editor.isActive('underline') && "bg-muted text-primary")}
				onClick={() => editor.chain().focus().toggleUnderline().run()}
			>
				<UnderlineIcon className="h-3.5 w-3.5" />
			</Button>
			
			{/* 删除线 */}
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className={cn("h-7 w-7 p-0", editor.isActive('strike') && "bg-muted text-primary")}
				onClick={() => editor.chain().focus().toggleStrike().run()}
			>
				<StrikethroughIcon className="h-3.5 w-3.5" />
			</Button>
			
			<Separator orientation="vertical" className="h-5 mx-0.5" />
			
			{/* 文字颜色 */}
			<DropdownMenu onOpenChange={handleOpenChange}>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="sm" className="h-7 px-1.5 gap-0.5">
						<PaletteIcon className="h-3.5 w-3.5" />
						<ChevronDownIcon className="h-2.5 w-2.5" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="min-w-[120px]">
					{TEXT_COLORS.map((color) => (
						<DropdownMenuItem
							key={color.value || 'default'}
							onClick={() => {
								executeCommand(() => {
									if (color.value) {
										editor.chain().focus().setColor(color.value).run()
									} else {
										editor.chain().focus().unsetColor().run()
									}
								})
							}}
							className="flex items-center gap-2 text-xs"
						>
							<span 
								className="w-3 h-3 rounded border" 
								style={{ backgroundColor: color.color === 'inherit' ? 'currentColor' : color.color }}
							/>
							<span style={{ color: color.color }}>{color.label}</span>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
			
			{/* 背景高亮 */}
			<DropdownMenu onOpenChange={handleOpenChange}>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="sm" className="h-7 px-1.5 gap-0.5">
						<HighlighterIcon className="h-3.5 w-3.5" />
						<ChevronDownIcon className="h-2.5 w-2.5" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="min-w-[120px]">
					{HIGHLIGHT_COLORS.map((color) => (
						<DropdownMenuItem
							key={color.value || 'none'}
							onClick={() => {
								executeCommand(() => {
									if (color.value) {
										editor.chain().focus().toggleHighlight({ color: color.value }).run()
									} else {
										editor.chain().focus().unsetHighlight().run()
									}
								})
							}}
							className="flex items-center gap-2 text-xs"
						>
							<span 
								className="w-3 h-3 rounded border" 
								style={{ backgroundColor: color.color }}
							/>
							<span>{color.label}</span>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
			
			{/* 字体大小 */}
			<DropdownMenu onOpenChange={handleOpenChange}>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="sm" className="h-7 px-1.5 gap-0.5">
						<TypeIcon className="h-3.5 w-3.5" />
						<ChevronDownIcon className="h-2.5 w-2.5" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="min-w-[100px]">
					{FONT_SIZES.map((size) => (
						<DropdownMenuItem
							key={size.value}
							onClick={() => executeCommand(() => editor.chain().focus().setFontSize(size.value).run())}
							className="flex items-center gap-2 text-xs"
						>
							<span style={{ fontSize: size.value }}>{size.label}</span>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
			
			<Separator orientation="vertical" className="h-5 mx-0.5" />
			
			{/* 行内代码 */}
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className={cn("h-7 w-7 p-0", editor.isActive('code') && "bg-muted text-primary")}
				onClick={() => executeCommand(() => editor.chain().focus().toggleCode().run())}
			>
				<CodeIcon className="h-3.5 w-3.5" />
			</Button>
			
			<Separator orientation="vertical" className="h-5 mx-0.5" />
			
			{/* 超链接 */}
			<DropdownMenu onOpenChange={handleOpenChange}>
				<DropdownMenuTrigger asChild>
					<Button 
						variant="ghost" 
						size="sm" 
						className={cn("h-7 px-1.5 gap-0.5", editor.isActive('link') && "bg-muted text-primary")}
					>
						<LinkIcon className="h-3.5 w-3.5" />
						<ChevronDownIcon className="h-2.5 w-2.5" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-64">
					<div className="p-2">
						<label className="text-xs text-muted-foreground mb-1.5 block">链接地址</label>
						<div className="flex gap-2">
							<Input
								type="url"
								placeholder="https://example.com"
								defaultValue={editor.getAttributes('link').href || ''}
								className="h-7 text-xs"
								onKeyDown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault()
										const url = (e.target as HTMLInputElement).value
										if (url) {
											executeCommand(() => {
												editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
											})
										}
									}
								}}
								id="floating-link-input"
							/>
							<Button
								size="sm"
								className="h-7 px-2 text-xs"
								onClick={() => {
									const input = document.getElementById('floating-link-input') as HTMLInputElement
									const url = input?.value
									if (url) {
										executeCommand(() => {
											editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
										})
									}
								}}
							>
								确定
							</Button>
						</div>
					</div>
					{editor.isActive('link') && (
						<>
							<Separator className="my-1" />
							<DropdownMenuItem
								onClick={() => executeCommand(() => editor.chain().focus().unsetLink().run())}
								className="flex items-center gap-2 text-destructive text-xs"
							>
								<UnlinkIcon className="h-3.5 w-3.5" />
								<span>取消链接</span>
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	)
}

// 表格右键菜单组件
interface TableContextMenuProps {
	editor: ReturnType<typeof useEditor>
	children: React.ReactNode
}

function TableContextMenu({ editor, children }: TableContextMenuProps) {
	if (!editor) return <>{children}</>
	
	const isInTable = editor.isActive('table')
	
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				{children}
			</ContextMenuTrigger>
			{isInTable && (
				<ContextMenuContent className="w-48">
					{/* 插入行 */}
					<ContextMenuItem
						onClick={() => editor.chain().focus().addRowBefore().run()}
						className="flex items-center gap-2"
					>
						<RowsIcon className="h-4 w-4" />
						<span>在上方插入行</span>
					</ContextMenuItem>
					<ContextMenuItem
						onClick={() => editor.chain().focus().addRowAfter().run()}
						className="flex items-center gap-2"
					>
						<RowsIcon className="h-4 w-4" />
						<span>在下方插入行</span>
					</ContextMenuItem>
					
					<ContextMenuSeparator />
					
					{/* 插入列 */}
					<ContextMenuItem
						onClick={() => editor.chain().focus().addColumnBefore().run()}
						className="flex items-center gap-2"
					>
						<ColumnsIcon className="h-4 w-4" />
						<span>在左侧插入列</span>
					</ContextMenuItem>
					<ContextMenuItem
						onClick={() => editor.chain().focus().addColumnAfter().run()}
						className="flex items-center gap-2"
					>
						<ColumnsIcon className="h-4 w-4" />
						<span>在右侧插入列</span>
					</ContextMenuItem>
					
					<ContextMenuSeparator />
					
					{/* 删除操作 */}
					<ContextMenuItem
						onClick={() => editor.chain().focus().deleteRow().run()}
						className="flex items-center gap-2 text-destructive focus:text-destructive"
					>
						<Trash2Icon className="h-4 w-4" />
						<span>删除当前行</span>
					</ContextMenuItem>
					<ContextMenuItem
						onClick={() => editor.chain().focus().deleteColumn().run()}
						className="flex items-center gap-2 text-destructive focus:text-destructive"
					>
						<Trash2Icon className="h-4 w-4" />
						<span>删除当前列</span>
					</ContextMenuItem>
					
					<ContextMenuSeparator />
					
					<ContextMenuItem
						onClick={() => editor.chain().focus().deleteTable().run()}
						className="flex items-center gap-2 text-destructive focus:text-destructive"
					>
						<Trash2Icon className="h-4 w-4" />
						<span>删除整个表格</span>
					</ContextMenuItem>
				</ContextMenuContent>
			)}
		</ContextMenu>
	)
}

export function RichTextEditor({
	content = '',
	readonly = false,
	onChange,
	className,
	placeholder = '输入内容...',
}: RichTextEditorProps) {
	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				heading: {
					levels: [1, 2, 3],
				},
				codeBlock: false, // 禁用默认的代码块，使用自定义的
				blockquote: false, // 禁用默认的引用块，使用自定义的
			}),
			CustomBlockquote, // 自定义引用块（支持边框颜色）
			Underline,
			TaskList,
			TaskItem.configure({
				nested: true,
			}),
			Placeholder.configure({
				placeholder,
			}),
			CustomCodeBlock.configure({
				lowlight,
			}),
			TextStyle,
			Color,
			Highlight.configure({
				multicolor: true,
			}),
			FontSize,
			// 超链接扩展
			Link.configure({
				openOnClick: false, // 编辑模式下点击不打开链接
				HTMLAttributes: {
					class: 'text-primary underline cursor-pointer',
				},
			}),
			// 表格扩展
			Table.configure({
				resizable: true,
				HTMLAttributes: {
					class: 'rich-text-table',
				},
			}),
			TableRow,
			TableHeader,
			TableCell,
			// Markdown 粘贴支持
			MarkdownPaste,
		],
		content,
		editable: !readonly,
		onUpdate: ({ editor }) => {
			onChange?.(editor.getHTML())
		},
		editorProps: {
			attributes: {
				class: 'rich-text-content focus:outline-none min-h-[120px] px-4 py-3',
			},
		},
	})

	// 只读模式下不显示工具栏
	if (readonly) {
		return (
			<div className={cn("rich-text-content", className)}>
				<EditorContent editor={editor} />
			</div>
		)
	}

	return (
		<div className={cn("rich-text-editor border rounded-lg overflow-hidden", className)}>
			{/* 工具栏 */}
			<div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b bg-muted/30">
				{/* 撤销/重做 */}
				<ToolbarButton
					icon={<Undo2Icon className="h-4 w-4" />}
					label="撤销"
					shortcut={shortcuts.undo}
					onClick={() => editor?.chain().focus().undo().run()}
					disabled={!editor?.can().undo()}
				/>
				<ToolbarButton
					icon={<Redo2Icon className="h-4 w-4" />}
					label="重做"
					shortcut={shortcuts.redo}
					onClick={() => editor?.chain().focus().redo().run()}
					disabled={!editor?.can().redo()}
				/>
				
				<Separator orientation="vertical" className="h-6 mx-1" />
				
				{/* 标题 */}
				<ToolbarButton
					icon={<Heading1Icon className="h-4 w-4" />}
					label="标题 1"
					shortcut={shortcuts.heading1}
					isActive={editor?.isActive('heading', { level: 1 })}
					onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
				/>
				<ToolbarButton
					icon={<Heading2Icon className="h-4 w-4" />}
					label="标题 2"
					shortcut={shortcuts.heading2}
					isActive={editor?.isActive('heading', { level: 2 })}
					onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
				/>
				<ToolbarButton
					icon={<Heading3Icon className="h-4 w-4" />}
					label="标题 3"
					shortcut={shortcuts.heading3}
					isActive={editor?.isActive('heading', { level: 3 })}
					onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
				/>
				
				<Separator orientation="vertical" className="h-6 mx-1" />
				
				{/* 文本格式 */}
				<ToolbarButton
					icon={<BoldIcon className="h-4 w-4" />}
					label="加粗"
					shortcut={shortcuts.bold}
					isActive={editor?.isActive('bold')}
					onClick={() => editor?.chain().focus().toggleBold().run()}
				/>
				<ToolbarButton
					icon={<ItalicIcon className="h-4 w-4" />}
					label="斜体"
					shortcut={shortcuts.italic}
					isActive={editor?.isActive('italic')}
					onClick={() => editor?.chain().focus().toggleItalic().run()}
				/>
				<ToolbarButton
					icon={<UnderlineIcon className="h-4 w-4" />}
					label="下划线"
					shortcut={shortcuts.underline}
					isActive={editor?.isActive('underline')}
					onClick={() => editor?.chain().focus().toggleUnderline().run()}
				/>
				<ToolbarButton
					icon={<StrikethroughIcon className="h-4 w-4" />}
					label="删除线"
					shortcut={shortcuts.strike}
					isActive={editor?.isActive('strike')}
					onClick={() => editor?.chain().focus().toggleStrike().run()}
				/>
				
				<Separator orientation="vertical" className="h-6 mx-1" />
				
				{/* 字体大小 */}
				<DropdownMenu>
					<TooltipProvider>
						<Tooltip delayDuration={300}>
							<TooltipTrigger asChild>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="sm" className="h-8 px-2 gap-1">
										<TypeIcon className="h-4 w-4" />
										<ChevronDownIcon className="h-3 w-3" />
									</Button>
								</DropdownMenuTrigger>
							</TooltipTrigger>
							<TooltipContent side="bottom">字体大小</TooltipContent>
						</Tooltip>
					</TooltipProvider>
					<DropdownMenuContent align="start">
						{FONT_SIZES.map((size) => (
							<DropdownMenuItem
								key={size.value}
								onClick={() => editor?.chain().focus().setFontSize(size.value).run()}
								className="flex items-center gap-2"
							>
								<span style={{ fontSize: size.value }}>{size.label}</span>
								<span className="text-xs text-muted-foreground ml-auto">{size.value}</span>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
				
				{/* 文字颜色 */}
				<DropdownMenu>
					<TooltipProvider>
						<Tooltip delayDuration={300}>
							<TooltipTrigger asChild>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="sm" className="h-8 px-2 gap-1">
										<PaletteIcon className="h-4 w-4" />
										<ChevronDownIcon className="h-3 w-3" />
									</Button>
								</DropdownMenuTrigger>
							</TooltipTrigger>
							<TooltipContent side="bottom">文字颜色</TooltipContent>
						</Tooltip>
					</TooltipProvider>
					<DropdownMenuContent align="start">
						{TEXT_COLORS.map((color) => (
							<DropdownMenuItem
								key={color.value || 'default'}
								onClick={() => {
									if (color.value) {
										editor?.chain().focus().setColor(color.value).run()
									} else {
										editor?.chain().focus().unsetColor().run()
									}
								}}
								className="flex items-center gap-2"
							>
								<span 
									className="w-4 h-4 rounded border" 
									style={{ backgroundColor: color.color === 'inherit' ? 'currentColor' : color.color }}
								/>
								<span style={{ color: color.color }}>{color.label}</span>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
				
				{/* 背景高亮色 */}
				<DropdownMenu>
					<TooltipProvider>
						<Tooltip delayDuration={300}>
							<TooltipTrigger asChild>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="sm" className="h-8 px-2 gap-1">
										<HighlighterIcon className="h-4 w-4" />
										<ChevronDownIcon className="h-3 w-3" />
									</Button>
								</DropdownMenuTrigger>
							</TooltipTrigger>
							<TooltipContent side="bottom">背景高亮</TooltipContent>
						</Tooltip>
					</TooltipProvider>
					<DropdownMenuContent align="start">
						{HIGHLIGHT_COLORS.map((color) => (
							<DropdownMenuItem
								key={color.value || 'none'}
								onClick={() => {
									if (color.value) {
										editor?.chain().focus().toggleHighlight({ color: color.value }).run()
									} else {
										editor?.chain().focus().unsetHighlight().run()
									}
								}}
								className="flex items-center gap-2"
							>
								<span 
									className="w-4 h-4 rounded border" 
									style={{ backgroundColor: color.color }}
								/>
								<span>{color.label}</span>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
				
				<Separator orientation="vertical" className="h-6 mx-1" />
				
				{/* 代码 */}
				<ToolbarButton
					icon={<CodeIcon className="h-4 w-4" />}
					label="行内代码"
					shortcut={shortcuts.code}
					isActive={editor?.isActive('code')}
					onClick={() => editor?.chain().focus().toggleCode().run()}
				/>
				<ToolbarButton
					icon={<SquareCodeIcon className="h-4 w-4" />}
					label="代码块"
					shortcut={shortcuts.codeBlock}
					isActive={editor?.isActive('codeBlock')}
					onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
				/>
				
				<Separator orientation="vertical" className="h-6 mx-1" />
				
				{/* 列表 */}
				<ToolbarButton
					icon={<ListIcon className="h-4 w-4" />}
					label="无序列表"
					shortcut={shortcuts.bulletList}
					isActive={editor?.isActive('bulletList')}
					onClick={() => editor?.chain().focus().toggleBulletList().run()}
				/>
				<ToolbarButton
					icon={<ListOrderedIcon className="h-4 w-4" />}
					label="有序列表"
					shortcut={shortcuts.orderedList}
					isActive={editor?.isActive('orderedList')}
					onClick={() => editor?.chain().focus().toggleOrderedList().run()}
				/>
				<ToolbarButton
					icon={<ListTodoIcon className="h-4 w-4" />}
					label="待办事项"
					shortcut={shortcuts.taskList}
					isActive={editor?.isActive('taskList')}
					onClick={() => editor?.chain().focus().toggleTaskList().run()}
				/>
				
				<Separator orientation="vertical" className="h-6 mx-1" />
				
				{/* 引用和分隔符 */}
				{/* 引用（带颜色选择） */}
				<DropdownMenu>
					<TooltipProvider>
						<Tooltip delayDuration={300}>
							<TooltipTrigger asChild>
								<DropdownMenuTrigger asChild>
									<Button 
										variant="ghost" 
										size="sm" 
										className={cn(
											"h-8 px-2 gap-1",
											editor?.isActive('blockquote') && "bg-muted text-primary"
										)}
									>
										<QuoteIcon className="h-4 w-4" />
										<ChevronDownIcon className="h-3 w-3" />
									</Button>
								</DropdownMenuTrigger>
							</TooltipTrigger>
							<TooltipContent side="bottom">引用 {shortcuts.blockquote}</TooltipContent>
						</Tooltip>
					</TooltipProvider>
					<DropdownMenuContent align="start" className="min-w-[140px]">
						<DropdownMenuItem
							onClick={() => editor?.chain().focus().toggleBlockquote().run()}
							className="flex items-center gap-2"
						>
							<QuoteIcon className="h-4 w-4" />
							<span>{editor?.isActive('blockquote') ? '取消引用' : '添加引用'}</span>
						</DropdownMenuItem>
						{editor?.isActive('blockquote') && (
							<>
								<Separator className="my-1" />
								<DropdownMenuLabel className="text-xs text-muted-foreground">边框颜色</DropdownMenuLabel>
								{BLOCKQUOTE_COLORS.map((color) => (
									<DropdownMenuItem
										key={color.value}
										onClick={() => editor?.chain().focus().updateAttributes('blockquote', { borderColor: color.value }).run()}
										className="flex items-center gap-2"
									>
										<span 
											className="w-3 h-3 rounded border" 
											style={{ backgroundColor: color.color }}
										/>
										<span>{color.label}</span>
									</DropdownMenuItem>
								))}
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
				<ToolbarButton
					icon={<MinusIcon className="h-4 w-4" />}
					label="分隔线"
					onClick={() => editor?.chain().focus().setHorizontalRule().run()}
				/>
				
				{/* 超链接 */}
				<DropdownMenu>
					<TooltipProvider>
						<Tooltip delayDuration={300}>
							<TooltipTrigger asChild>
								<DropdownMenuTrigger asChild>
									<Button 
										variant="ghost" 
										size="sm" 
										className={cn(
											"h-8 px-2 gap-1",
											editor?.isActive('link') && "bg-muted text-primary"
										)}
									>
										<LinkIcon className="h-4 w-4" />
										<ChevronDownIcon className="h-3 w-3" />
									</Button>
								</DropdownMenuTrigger>
							</TooltipTrigger>
							<TooltipContent side="bottom">超链接</TooltipContent>
						</Tooltip>
					</TooltipProvider>
					<DropdownMenuContent align="start" className="w-72">
						<div className="p-2">
							<label className="text-xs text-muted-foreground mb-1.5 block">链接地址</label>
							<div className="flex gap-2">
								<Input
									type="url"
									placeholder="https://example.com"
									defaultValue={editor?.getAttributes('link').href || ''}
									className="h-8 text-sm"
									onKeyDown={(e) => {
										if (e.key === 'Enter') {
											e.preventDefault()
											const url = (e.target as HTMLInputElement).value
											if (url) {
												editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
											}
										}
									}}
									id="link-input"
								/>
								<Button
									size="sm"
									className="h-8 px-3"
									onClick={() => {
										const input = document.getElementById('link-input') as HTMLInputElement
										const url = input?.value
										if (url) {
											editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
										}
									}}
								>
									确定
								</Button>
							</div>
						</div>
						{editor?.isActive('link') && (
							<>
								<Separator className="my-1" />
								<DropdownMenuItem
									onClick={() => editor?.chain().focus().unsetLink().run()}
									className="flex items-center gap-2 text-destructive"
								>
									<UnlinkIcon className="h-4 w-4" />
									<span>取消链接</span>
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
				
				<Separator orientation="vertical" className="h-6 mx-1" />
				
				{/* 表格 */}
				<DropdownMenu>
					<TooltipProvider>
						<Tooltip delayDuration={300}>
							<TooltipTrigger asChild>
								<DropdownMenuTrigger asChild>
									<Button 
										variant="ghost" 
										size="sm" 
										className={cn(
											"h-8 px-2 gap-1",
											editor?.isActive('table') && "bg-muted text-primary"
										)}
									>
										<TableIcon className="h-4 w-4" />
										<ChevronDownIcon className="h-3 w-3" />
									</Button>
								</DropdownMenuTrigger>
							</TooltipTrigger>
							<TooltipContent side="bottom">表格（右键单元格可插入/删除行列）</TooltipContent>
						</Tooltip>
					</TooltipProvider>
					<DropdownMenuContent align="start" className="w-48">
						{/* 插入表格 */}
						<DropdownMenuItem
							onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
							className="flex items-center gap-2"
						>
							<PlusIcon className="h-4 w-4" />
							<span>插入表格 (3×3)</span>
						</DropdownMenuItem>
						
						{/* 删除表格 - 仅在表格内时显示 */}
						{editor?.isActive('table') && (
							<>
								<Separator className="my-1" />
								<DropdownMenuItem
									onClick={() => editor?.chain().focus().deleteTable().run()}
									className="flex items-center gap-2 text-destructive"
								>
									<Trash2Icon className="h-4 w-4" />
									<span>删除表格</span>
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			
			{/* 编辑区域 - 带表格右键菜单 */}
			<TableContextMenu editor={editor}>
				<div className="bg-background">
					<EditorContent editor={editor} />
				</div>
			</TableContextMenu>
			
			{/* 浮动工具栏 - 选中文本时显示 */}
			<FloatingToolbar editor={editor} />
		</div>
	)
}

// 只读展示组件（轻量级）
export function RichTextViewer({ 
	content, 
	className 
}: { 
	content?: string
	className?: string 
}) {
	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				heading: { levels: [1, 2, 3] },
				codeBlock: false,
				blockquote: false, // 禁用默认的引用块，使用自定义的
			}),
			CustomBlockquote, // 自定义引用块（支持边框颜色）
			Underline,
			TaskList,
			TaskItem.configure({
				nested: true,
			}),
			CustomCodeBlock.configure({
				lowlight,
			}),
			// 文字样式扩展（用于渲染颜色、高亮等）
			TextStyle,
			Color,
			Highlight.configure({
				multicolor: true,
			}),
			// 表格扩展（只读模式也需要支持渲染）
			Table.configure({
				resizable: false,
				HTMLAttributes: {
					class: 'rich-text-table',
				},
			}),
			TableRow,
			TableHeader,
			TableCell,
			// 超链接扩展（只读模式下点击可打开链接）
			Link.configure({
				openOnClick: true,
				HTMLAttributes: {
					class: 'text-primary underline cursor-pointer hover:opacity-80',
				},
			}),
			// 字体大小扩展（用于渲染保存的字体大小）
			FontSize,
		],
		content,
		editable: false,
	})

	return (
		<div className={cn("rich-text-content", className)}>
			<EditorContent editor={editor} />
		</div>
	)
}
