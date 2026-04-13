/**
 * DescriptionCard - 报告描述卡片
 * 
 * 功能：
 * - 可折叠/展开
 * - 支持富文本展示（H1/H2/H3、列表、加粗、斜体、下划线）
 * - 支持在线编辑和保存
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
	Collapsible, 
	CollapsibleContent, 
	CollapsibleTrigger 
} from '@/components/ui/collapsible'
import { 
	ChevronDownIcon, 
	ChevronRightIcon, 
	PencilIcon, 
	SaveIcon, 
	XIcon,
	ClipboardCheckIcon
} from 'lucide-react'
import { RichTextEditor, RichTextViewer } from '@/components/ui/rich-text-editor'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { updateReport } from '@/apis/report'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

interface DescriptionCardProps {
	/** 报告 ID */
	reportId: string
	/** 描述内容（HTML 格式） */
	description?: string
	/** 默认展开状态 */
	defaultExpanded?: boolean
	/** 强制展开状态（用于导出时） */
	forceExpanded?: boolean
	/** 保存成功回调 */
	onSaveSuccess?: () => void
	/** 自定义类名 */
	className?: string
	/** 是否显示 AI 分析按钮 */
	showAIButton?: boolean
	/** AI 分析面板是否展开 */
	isAIExpanded?: boolean
	/** AI 按钮点击回调 */
	onToggleAI?: () => void
	/** 导出模式 - 隐藏操作按钮 */
	isExportMode?: boolean
}

export function DescriptionCard({
	reportId,
	description = '',
	defaultExpanded = true,
	forceExpanded = false,
	onSaveSuccess,
	className,
	showAIButton = false,
	isAIExpanded = false,
	onToggleAI,
	isExportMode = false,
}: DescriptionCardProps) {
	const [isExpanded, setIsExpanded] = useState(defaultExpanded)
	
	// 实际展开状态：forceExpanded 时强制展开
	const actualExpanded = forceExpanded || isExpanded
	const [isEditing, setIsEditing] = useState(false)
	const [editContent, setEditContent] = useState(description)
	const [isSaving, setIsSaving] = useState(false)
	const { toast } = useToast()
	
	// 当 description prop 变化时，更新编辑内容
	useEffect(() => {
		setEditContent(description)
	}, [description])
	
	// 开始编辑
	const handleStartEdit = () => {
		setEditContent(description)
		setIsEditing(true)
		setIsExpanded(true) // 编辑时自动展开
	}
	
	// 取消编辑
	const handleCancelEdit = () => {
		setEditContent(description)
		setIsEditing(false)
	}
	
	// 保存
	const handleSave = async () => {
		setIsSaving(true)
		try {
			await updateReport(reportId, { description: editContent })
			toast({
				title: "保存成功",
				description: "结论说明已更新",
			})
			setIsEditing(false)
			onSaveSuccess?.()
		} catch (error) {
			toast({
				title: "保存失败",
				description: error instanceof Error ? error.message : "未知错误",
				variant: "destructive",
			})
		} finally {
			setIsSaving(false)
		}
	}
	
	// 判断是否有内容
	const hasContent = description && description.trim() !== '' && description !== '<p></p>'
	
	return (
		<Card className={cn("overflow-hidden", className)}>
			<Collapsible open={actualExpanded} onOpenChange={setIsExpanded}>
				<CardHeader className="py-4 px-6">
					<div className="flex items-center justify-between">
						{/* 左侧：标题 */}
						<div className="flex items-center gap-2">
							<CardTitle className="text-xl sm:text-2xl font-semibold">
								结论说明
							</CardTitle>
							{!actualExpanded && !hasContent && (
								<span className="text-sm text-muted-foreground font-normal">
									（暂无内容）
								</span>
							)}
						</div>
						
						{/* 右侧：操作按钮 + 折叠按钮 */}
						<div className="flex items-center gap-2">
							{/* 折叠按钮 - 导出模式下隐藏 */}
							{!isExportMode && (
								<CollapsibleTrigger asChild>
									<Button 
										variant="ghost" 
										size="icon"
										data-export-action={!actualExpanded ? "expand-conclusion" : undefined}
									>
										{actualExpanded ? (
											<ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
										) : (
											<ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
										)}
									</Button>
								</CollapsibleTrigger>
							)}
							{/* 编辑/保存/AI 按钮 - 导出模式下隐藏 */}
							{!isExportMode && (
								isEditing ? (
									<>
										<Button
											variant="outline"
											size="sm"
											onClick={handleCancelEdit}
											disabled={isSaving}
										>
											<XIcon className="h-4 w-4 mr-1" />
											取消
										</Button>
										<Button
											size="sm"
											onClick={handleSave}
											disabled={isSaving}
										>
											{isSaving ? (
												<div className="animate-spin h-4 w-4 mr-1 border-2 border-white border-t-transparent rounded-full" />
											) : (
												<SaveIcon className="h-4 w-4 mr-1" />
											)}
											保存
										</Button>
									</>
								) : (
									<>
										<TooltipProvider>
											<Tooltip delayDuration={300}>
												<TooltipTrigger asChild>
													<Button
														variant="outline"
														size="icon"
														onClick={handleStartEdit}
													>
														<PencilIcon className="h-4 w-4" />
													</Button>
												</TooltipTrigger>
												<TooltipContent>编辑结论</TooltipContent>
											</Tooltip>
										</TooltipProvider>
										
										{/* AI 分析按钮 - 彩虹边框跑马灯 */}
										{showAIButton && (
											<TooltipProvider>
												<Tooltip delayDuration={300}>
													<TooltipTrigger asChild>
														<button
															onClick={onToggleAI}
															className={cn(
																"ai-rainbow-border h-10 w-10 flex items-center justify-center",
																"transition-all duration-300",
																"hover:scale-105 active:scale-95",
																isAIExpanded && "active"
															)}
															data-export-action={!isAIExpanded ? "expand-ai" : undefined}
														>
															{/* 渐变图标 - 使用 SVG 渐变 */}
															<svg 
																className="h-4 w-4" 
																viewBox="0 0 24 24" 
																fill="none"
															>
																<defs>
																	<linearGradient id="ai-icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
																		<stop offset="0%" stopColor="#60a5fa" />
																		<stop offset="50%" stopColor="#c084fc" />
																		<stop offset="100%" stopColor="#f472b6" />
																	</linearGradient>
																</defs>
																<path 
																	d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"
																	stroke="url(#ai-icon-gradient)"
																	strokeWidth="1.5"
																	strokeLinecap="round"
																	strokeLinejoin="round"
																	fill="none"
																/>
																<path 
																	d="M20 3v4M22 5h-4M4 17v2M5 18H3"
																	stroke="url(#ai-icon-gradient)"
																	strokeWidth="1.5"
																	strokeLinecap="round"
																	strokeLinejoin="round"
																/>
															</svg>
														</button>
													</TooltipTrigger>
													<TooltipContent>
														{isAIExpanded ? '收起AI结论' : '展开AI结论'}
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>
										)}
									</>
								)
							)}
						</div>
					</div>
				</CardHeader>
				
				<CollapsibleContent>
					<CardContent className="pt-0 px-6 pb-6">
						{isEditing ? (
							/* 编辑模式 */
							<RichTextEditor
								content={editContent}
								onChange={setEditContent}
								placeholder="输入报告描述，支持 Markdown 格式..."
							/>
						) : hasContent ? (
							/* 展示模式 */
							<div className="bg-muted/20 rounded-lg p-4 border">
								<RichTextViewer content={description} />
							</div>
						) : (
							/* 空内容 */
							<div className="text-center py-8 text-muted-foreground">
								<ClipboardCheckIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
								<p className="text-sm">暂无描述内容</p>
								<p className="text-xs mt-1">点击「编辑」按钮添加报告描述</p>
							</div>
						)}
					</CardContent>
				</CollapsibleContent>
			</Collapsible>
		</Card>
	)
}

