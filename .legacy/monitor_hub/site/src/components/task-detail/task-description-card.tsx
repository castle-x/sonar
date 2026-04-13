/**
 * TaskDescriptionCard - 测试结论卡片
 * 
 * 直接复用报告的 DescriptionCard 结构和样式
 */

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { 
	Collapsible, 
	CollapsibleContent, 
	CollapsibleTrigger 
} from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { 
	ChevronDownIcon,
	ChevronRightIcon,
	PencilIcon,
	SaveIcon,
	XIcon,
	FileTextIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { updateTask } from "@/apis/task"
import { useToast } from "@/components/ui/use-toast"
import { RichTextEditor, RichTextViewer } from "@/components/ui/rich-text-editor"

interface TaskDescriptionCardProps {
	taskId: string
	description: string
	defaultExpanded?: boolean
	onSaveSuccess?: () => void
	className?: string
	readOnly?: boolean
}

export function TaskDescriptionCard({
	taskId,
	description = '',
	defaultExpanded = true,
	onSaveSuccess,
	className,
	readOnly = false,
}: TaskDescriptionCardProps) {
	const [isExpanded, setIsExpanded] = useState(defaultExpanded)
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
			await updateTask(taskId, { description: editContent })
			toast({
				title: "保存成功",
				description: "测试结论已更新",
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
			<Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
				<CardHeader className="py-4 px-6">
					<div className="flex items-center justify-end gap-2">
						{/* 折叠按钮 */}
						<CollapsibleTrigger asChild>
							<Button variant="ghost" size="icon" className="h-8 w-8">
								{isExpanded ? (
									<ChevronDownIcon className="h-4 w-4" />
								) : (
									<ChevronRightIcon className="h-4 w-4" />
								)}
							</Button>
						</CollapsibleTrigger>
						
						{/* 编辑按钮（只读模式下隐藏） */}
						{!readOnly && (
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
							)
						)}
					</div>
				</CardHeader>
				
				<CollapsibleContent>
					<CardContent className="pt-0 px-6 pb-6">
						{isEditing ? (
							/* 编辑模式 */
							<RichTextEditor
								content={editContent}
								onChange={setEditContent}
								placeholder="输入测试结论..."
							/>
						) : hasContent ? (
							/* 展示模式 */
							<div className="bg-muted/20 rounded-lg p-4 border">
								<RichTextViewer content={description} />
							</div>
						) : (
							/* 空内容 */
							<div className="text-center py-8 text-muted-foreground">
								<FileTextIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
								<p className="text-sm">暂无测试结论</p>
								<p className="text-xs mt-1">点击右上角编辑按钮添加测试结论</p>
							</div>
						)}
					</CardContent>
				</CollapsibleContent>
			</Collapsible>
		</Card>
	)
}
