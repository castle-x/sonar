/**
 * CreateTaskDialog - 新建任务对话框
 * 
 * 创建新的测试任务
 */

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { createTask, type TaskRecord } from "@/apis/task"

interface CreateTaskDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onSuccess?: (task: TaskRecord) => void
}

export function CreateTaskDialog({
	open,
	onOpenChange,
	onSuccess,
}: CreateTaskDialogProps) {
	const [name, setName] = useState('')
	const [loading, setLoading] = useState(false)
	const { toast } = useToast()
	
	// 重置表单
	const resetForm = () => {
		setName('')
	}
	
	// 关闭对话框
	const handleClose = () => {
		resetForm()
		onOpenChange(false)
	}
	
	// 提交表单
	const handleSubmit = async (e: React.FormEvent) => {
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
			const newTask = await createTask({
				name: name.trim(),
				create_type: 'web_manual',
			})
			
			toast({
				title: "创建成功",
				description: `任务 "${newTask.name}" 已创建`,
			})
			
			resetForm()
			onOpenChange(false)
			onSuccess?.(newTask)
			
		} catch (error) {
			console.error("创建任务失败:", error)
			toast({
				title: "创建失败",
				description: error instanceof Error ? error.message : "未知错误",
				variant: "destructive",
			})
		} finally {
			setLoading(false)
		}
	}
	
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="w-[90%] sm:max-w-[425px] rounded-lg">
				<DialogHeader>
					<DialogTitle>新建任务</DialogTitle>
					<DialogDescription>
						创建一个新的测试任务，之后可以添加详细信息和关联报告
					</DialogDescription>
				</DialogHeader>
				
				<form onSubmit={handleSubmit}>
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="task-name" className="text-sm font-semibold">
								任务名称 *
							</Label>
							<Input
								id="task-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="请输入任务名称"
								autoFocus
							/>
						</div>
					</div>
					
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={handleClose}
							disabled={loading}
						>
							取消
						</Button>
						<Button type="submit" disabled={loading}>
							{loading ? "创建中..." : "创建"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
