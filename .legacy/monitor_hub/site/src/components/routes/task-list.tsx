/**
 * 任务列表入口页面
 * 
 * 当没有任务时显示友好提示，支持新建任务
 * 有任务时自动跳转到第一个任务
 */

import { memo, useEffect, useState } from "react"
import { getAllTasks, type TaskRecord } from "@/apis/task"
import { navigate } from "@/components/router"
import { PageLoading } from "@/components/loading"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { 
	FileTextIcon, 
	PlusIcon,
	ClipboardListIcon,
	ArrowRightIcon,
} from "lucide-react"
import { CreateTaskDialog } from "@/components/task-detail/create-task-dialog"

export default memo(() => {
	const [loading, setLoading] = useState(true)
	const [tasks, setTasks] = useState<TaskRecord[]>([])
	const [createDialogOpen, setCreateDialogOpen] = useState(false)
	const [error, setError] = useState<string | null>(null)
	
	// 设置页面标题
	useEffect(() => {
		document.title = "测试任务 / Monitor Hub"
	}, [])
	
	// 加载任务列表
	useEffect(() => {
		const loadTasks = async () => {
			try {
				setLoading(true)
				setError(null)
				const taskList = await getAllTasks()
				setTasks(taskList)
				
				// 如果有任务，自动跳转到第一个任务
				if (taskList.length > 0) {
					navigate(`/task/${taskList[0].id}`)
				}
			} catch (err) {
				console.error("获取任务列表失败:", err)
				setError(err instanceof Error ? err.message : "获取任务列表失败")
			} finally {
				setLoading(false)
			}
		}
		
		loadTasks()
	}, [])
	
	// 新建任务成功后跳转
	const handleCreateSuccess = (task: TaskRecord) => {
		navigate(`/task/${task.id}`)
	}
	
	// 加载中
	if (loading) {
		return <PageLoading />
	}
	
	// 错误状态
	if (error) {
		return (
			<div className="flex items-center justify-center min-h-[60vh]">
				<Card className="w-full max-w-md">
					<CardHeader className="text-center">
						<div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
							<ClipboardListIcon className="h-6 w-6 text-destructive" />
						</div>
						<CardTitle>加载失败</CardTitle>
						<CardDescription>{error}</CardDescription>
					</CardHeader>
					<CardContent className="flex justify-center">
						<Button onClick={() => window.location.reload()}>
							重新加载
						</Button>
					</CardContent>
				</Card>
			</div>
		)
	}
	
	// 如果有任务但没有自动跳转（这种情况不太可能发生）
	if (tasks.length > 0) {
		return (
			<div className="flex items-center justify-center min-h-[60vh]">
				<Card className="w-full max-w-lg">
					<CardHeader className="text-center">
						<div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
							<ClipboardListIcon className="h-6 w-6 text-primary" />
						</div>
						<CardTitle>测试任务</CardTitle>
						<CardDescription>
							共有 {tasks.length} 个任务
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						{tasks.slice(0, 5).map((task) => (
							<button
								key={task.id}
								onClick={() => navigate(`/task/${task.id}`)}
								className="w-full flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors text-left"
							>
								<div className="flex items-center gap-3">
									<FileTextIcon className="h-4 w-4 text-muted-foreground" />
									<span className="truncate">{task.name}</span>
								</div>
								<ArrowRightIcon className="h-4 w-4 text-muted-foreground" />
							</button>
						))}
						{tasks.length > 5 && (
							<p className="text-center text-sm text-muted-foreground">
								还有 {tasks.length - 5} 个任务...
							</p>
						)}
					</CardContent>
				</Card>
			</div>
		)
	}
	
	// 没有任务 - 显示空状态和新建按钮
	return (
		<div className="flex items-center justify-center min-h-[60vh]">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<div className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
						<ClipboardListIcon className="h-8 w-8 text-muted-foreground" />
					</div>
					<CardTitle className="text-xl">还没有测试任务</CardTitle>
					<CardDescription className="text-base">
						测试任务可以将多个报告组织在一起，并添加自定义说明和信息
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col items-center gap-4">
					<Button 
						size="lg" 
						onClick={() => setCreateDialogOpen(true)}
						className="gap-2"
					>
						<PlusIcon className="h-5 w-5" />
						创建第一个任务
					</Button>
					<p className="text-sm text-muted-foreground text-center">
						创建任务后，您可以添加任务描述、自定义信息和关联报告
					</p>
				</CardContent>
			</Card>
			
			{/* 新建任务对话框 */}
			<CreateTaskDialog
				open={createDialogOpen}
				onOpenChange={setCreateDialogOpen}
				onSuccess={handleCreateSuccess}
			/>
		</div>
	)
})
