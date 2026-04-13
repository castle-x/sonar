/**
 * TaskDetailCard - 任务详情卡片
 * 
 * 包含：
 * - 标题行：任务名称 + 操作按钮
 * - 信息栏：扩展信息（KV 展示）+ 标签
 */

import { useState } from "react"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog } from "@/components/ui/dialog"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { 
	MoreHorizontalIcon,
	PencilIcon,
	TrashIcon,
	CalendarIcon,
	UserIcon,
	SendIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { TaskRecord } from "@/apis/task"
import { deleteTask, forwardTask } from "@/apis/task"
import { ForwardDialog } from "@/components/forward-dialog"
import { useToast } from "@/components/ui/use-toast"
import { navigate } from "@/components/router"
import { ExtraInfoDisplay } from "@/components/report-detail/extra-info-display"
import { EditTaskInfoDialog } from "./edit-task-info"
import { TaskIcon } from "./task-icon"

interface TaskDetailCardProps {
	task: TaskRecord
	onEditSuccess?: () => void
	readOnly?: boolean
}

export function TaskDetailCard({ 
	task, 
	onEditSuccess,
	readOnly = false,
}: TaskDetailCardProps) {
	const [editDialogOpen, setEditDialogOpen] = useState(false)
	const [forwardDialogOpen, setForwardDialogOpen] = useState(false)
	const [deleting, setDeleting] = useState(false)
	const { toast } = useToast()
	
	// 转发任务
	const handleForward = async (targetUrl: string) => {
		await forwardTask(task.id, targetUrl)
	}
	
	// 删除任务
	const handleDelete = async () => {
		if (!confirm("确定要删除这个任务吗？")) {
			return
		}
		
		setDeleting(true)
		try {
			await deleteTask(task.id)
			toast({
				title: "删除成功",
				description: "任务已删除",
			})
			// 返回首页
			navigate("/")
		} catch (error) {
			toast({
				title: "删除失败",
				description: error instanceof Error ? error.message : "未知错误",
				variant: "destructive",
			})
		} finally {
			setDeleting(false)
		}
	}
	
	// 格式化时间
	const formatDate = (dateStr: string) => {
		const date = new Date(dateStr)
		return date.toLocaleString("zh-CN", {
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		})
	}
	
	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="grid xl:flex gap-4 items-start">
					{/* 左侧：任务图标 */}
					<TaskIcon 
						taskId={task.id}
						taskName={task.name}
						iconName={task.icon_name}
						size={56}
						uploadable={!readOnly}
						onUploadSuccess={onEditSuccess}
					/>
					
					<div className="flex-1 min-w-0">
						{/* 任务名称 + 时间 */}
						<div className="flex flex-wrap items-center gap-3 gap-y-2 text-xl sm:text-2xl font-semibold mb-2">
							<span className="truncate">{task.name}</span>
						</div>
						
						{/* 描述行：操作人 + 时间 */}
						<div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
							{task.operator && (
								<span className="flex items-center gap-1">
									<UserIcon className="h-3.5 w-3.5" />
									{task.operator}
								</span>
							)}
							<span className="flex items-center gap-1">
								<CalendarIcon className="h-3.5 w-3.5" />
								{formatDate(task.createdAt)}
							</span>
						</div>
					</div>
					
					{/* 右侧：操作按钮（只读模式下隐藏） */}
					{!readOnly && (
						<div className="flex items-center gap-2 flex-shrink-0">
							{/* 更多操作 */}
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="outline" size="icon">
										<MoreHorizontalIcon className="h-4 w-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem
										onClick={() => setEditDialogOpen(true)}
									>
										<PencilIcon className="h-4 w-4 mr-2" />
										编辑信息
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={() => setForwardDialogOpen(true)}
									>
										<SendIcon className="h-4 w-4 mr-2" />
										转发任务
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										onClick={handleDelete}
										disabled={deleting}
										className="text-destructive focus:text-destructive"
									>
										<TrashIcon className="h-4 w-4 mr-2" />
										{deleting ? "删除中..." : "删除任务"}
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					)}
				</div>
				
				{/* 编辑对话框 */}
				<Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
					<EditTaskInfoDialog 
						task={task} 
						setOpen={setEditDialogOpen} 
						onSuccess={onEditSuccess}
					/>
				</Dialog>
				
				{/* 转发对话框 */}
				<ForwardDialog
					open={forwardDialogOpen}
					onOpenChange={setForwardDialogOpen}
					type="task"
					resourceId={task.id}
					resourceName={task.name}
					onForward={handleForward}
				/>
			</CardHeader>
			
			{/* 扩展信息区域 */}
			<CardContent className="pt-0">
				<Separator className="mb-6" />
				
				{/* 扩展信息 + 标签（复用报告的组件） */}
				<ExtraInfoDisplay 
					info={task.extra_info} 
					tags={task.tags} 
				/>
			</CardContent>
		</Card>
	)
}
