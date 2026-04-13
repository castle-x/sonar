/**
 * ForwardDialog - 转发对话框
 * 
 * 用于将任务或报告转发到其他 MonitorHub 实例
 */

import { useState } from "react"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { SendIcon, Loader2Icon } from "lucide-react"

interface ForwardDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	/** 类型：任务或报告 */
	type: 'task' | 'report'
	/** 资源 ID */
	resourceId: string
	/** 资源名称（用于显示） */
	resourceName: string
	/** 转发函数 */
	onForward: (targetUrl: string) => Promise<void>
}

export function ForwardDialog({
	open,
	onOpenChange,
	type,
	resourceId,
	resourceName,
	onForward,
}: ForwardDialogProps) {
	const [targetUrl, setTargetUrl] = useState("")
	const [forwarding, setForwarding] = useState(false)
	const { toast } = useToast()

	const typeLabel = type === 'task' ? '任务' : '报告'

	const handleForward = async () => {
		// 验证 URL
		if (!targetUrl.trim()) {
			toast({
				title: "请输入目标地址",
				description: "目标地址不能为空",
				variant: "destructive",
			})
			return
		}

		// 验证 URL 格式
		let url = targetUrl.trim()
		if (!url.startsWith("http://") && !url.startsWith("https://")) {
			url = "http://" + url
		}

		try {
			new URL(url)
		} catch {
			toast({
				title: "地址格式错误",
				description: "请输入有效的 URL，如 http://192.168.1.100:8081",
				variant: "destructive",
			})
			return
		}

		setForwarding(true)
		try {
			await onForward(url)
			toast({
				title: "转发成功",
				description: `${typeLabel}已成功转发到 ${url}`,
			})
			onOpenChange(false)
			setTargetUrl("")
		} catch (error) {
			toast({
				title: "转发失败",
				description: error instanceof Error ? error.message : "未知错误",
				variant: "destructive",
			})
		} finally {
			setForwarding(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<SendIcon className="h-5 w-5" />
						转发{typeLabel}
					</DialogTitle>
					<DialogDescription>
						将{typeLabel}「{resourceName}」转发到其他 MonitorHub 实例
					</DialogDescription>
				</DialogHeader>
				
				<div className="grid gap-4 py-4">
					<div className="grid gap-2">
						<Label htmlFor="target-url">目标地址</Label>
						<Input
							id="target-url"
							placeholder="如 192.168.1.100:8081 或 http://..."
							value={targetUrl}
							onChange={(e) => setTargetUrl(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && !forwarding) {
									handleForward()
								}
							}}
						/>
						<p className="text-xs text-muted-foreground">
							输入目标 MonitorHub 的 IP 地址和端口
						</p>
					</div>
					
					<div className="rounded-md bg-muted p-3 text-sm">
						<div className="font-medium mb-1">转发内容</div>
						<div className="text-muted-foreground text-xs space-y-1">
							<div>• {typeLabel} ID: {resourceId}</div>
							<div>• {typeLabel}名称: {resourceName}</div>
							{type === 'report' && (
								<div>• 包含完整的图表数据（Chunk）</div>
							)}
						</div>
					</div>
				</div>
				
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={forwarding}
					>
						取消
					</Button>
					<Button onClick={handleForward} disabled={forwarding}>
						{forwarding ? (
							<>
								<Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
								转发中...
							</>
						) : (
							<>
								<SendIcon className="h-4 w-4 mr-2" />
								确认转发
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
