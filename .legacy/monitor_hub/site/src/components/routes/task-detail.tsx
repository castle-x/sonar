/**
 * 任务详情页面
 * 
 * 布局结构：
 * - 任务信息栏（KV 展示）
 * - 任务正文（富文本）
 * - 关联报告列表
 * 
 * 任务切换通过 navbar 中的任务列表按钮实现
 * 
 * Props:
 * - readOnly: 只读模式（分享页面使用）
 */

import { memo, useEffect, useState, useCallback } from "react"
import { useStore } from "@nanostores/react"
import { $router, navigate } from "@/components/router"
import { getTask, type TaskRecord } from "@/apis/task"
import { PageLoading } from "@/components/loading"
import { Button } from "@/components/ui/button"
import { ArrowLeftIcon } from "lucide-react"
import { TaskDetailCard } from "@/components/task-detail/task-detail-card"
import { TaskDescriptionCard } from "@/components/task-detail/task-description-card"
import { TaskReportList } from "@/components/task-detail/task-report-list"

interface TaskDetailPageProps {
	readOnly?: boolean
}

export default memo(({ readOnly = false }: TaskDetailPageProps) => {
	const page = useStore($router)
	// 支持 taskDetail 和 taskShare 两种路由
	const taskId = (page?.route === "taskDetail" || page?.route === "taskShare") ? page.params.id : null
	
	const [task, setTask] = useState<TaskRecord | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	
	// 设置页面标题
	useEffect(() => {
		if (task) {
			document.title = `${task.name || '任务详情'} / Monitor Hub`
		} else {
			document.title = `任务详情 / Monitor Hub`
		}
	}, [task])
	
	// 获取任务详情
	const fetchTask = useCallback(async () => {
		if (!taskId) {
			setError("缺少任务 ID")
			setLoading(false)
			return
		}
		
		try {
			setLoading(true)
			setError(null)
			const data = await getTask(taskId)
			setTask(data)
		} catch (err) {
			console.error("获取任务详情失败:", err)
			setError(err instanceof Error ? err.message : "获取任务详情失败")
		} finally {
			setLoading(false)
		}
	}, [taskId])
	
	// 初始加载
	useEffect(() => {
		fetchTask()
	}, [fetchTask])
	
	// 返回首页
	const handleBack = () => {
		navigate("/")
	}
	
	// 任务更新成功后刷新
	const handleTaskUpdate = async () => {
		await fetchTask()
	}
	
	// 加载状态
	if (loading) {
		return <PageLoading />
	}
	
	// 错误状态
	if (error) {
		return (
			<div className="flex flex-col items-center justify-center py-20">
				<p className="text-destructive mb-4">{error}</p>
				<Button variant="outline" onClick={handleBack}>
					<ArrowLeftIcon className="h-4 w-4 mr-2" />
					返回首页
				</Button>
			</div>
		)
	}
	
	// 无数据
	if (!task) {
		return (
			<div className="flex flex-col items-center justify-center py-20">
				<p className="text-muted-foreground mb-4">任务不存在</p>
				<Button variant="outline" onClick={handleBack}>
					<ArrowLeftIcon className="h-4 w-4 mr-2" />
					返回首页
				</Button>
			</div>
		)
	}
	
	return (
		<div className="space-y-6">
			{/* 任务信息栏 */}
			<TaskDetailCard
				task={task}
				onEditSuccess={handleTaskUpdate}
				readOnly={readOnly}
			/>
			
			{/* 任务正文 */}
			<TaskDescriptionCard
				taskId={task.id}
				description={task.description || ""}
				onSaveSuccess={handleTaskUpdate}
				readOnly={readOnly}
			/>
			
			{/* 关联报告列表 */}
			<TaskReportList
				taskId={task.id}
				reportIds={task.report_ids || []}
				onUpdate={handleTaskUpdate}
				readOnly={readOnly}
			/>
		</div>
	)
})
