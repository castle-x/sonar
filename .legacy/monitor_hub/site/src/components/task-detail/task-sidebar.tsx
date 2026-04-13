/**
 * 任务列表侧边栏组件
 * 
 * 显示所有任务的列表，点击切换当前任务
 */

import { useState } from "react"
import { type TaskRecord } from "@/apis/task"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
	ChevronLeftIcon,
	PlusIcon,
	SearchIcon,
	FileTextIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface TaskSidebarProps {
	tasks: TaskRecord[]
	currentTaskId: string
	onTaskSelect: (taskId: string) => void
	onCollapse: () => void
	onCreateTask: () => void
}

export function TaskSidebar({
	tasks,
	currentTaskId,
	onTaskSelect,
	onCollapse,
	onCreateTask,
}: TaskSidebarProps) {
	const [searchQuery, setSearchQuery] = useState("")
	
	// 过滤任务
	const filteredTasks = tasks.filter((task) =>
		task.name.toLowerCase().includes(searchQuery.toLowerCase())
	)
	
	return (
		<div className="flex flex-col h-[calc(100vh-8rem)] rounded-lg border bg-card">
			{/* 头部 */}
			<div className="flex items-center justify-between p-3 border-b">
				<span className="font-medium text-sm">任务目录</span>
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon"
						onClick={onCreateTask}
						className="h-7 w-7"
						title="新建任务"
					>
						<PlusIcon className="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						onClick={onCollapse}
						className="h-7 w-7"
						title="折叠侧边栏"
					>
						<ChevronLeftIcon className="h-4 w-4" />
					</Button>
				</div>
			</div>
			
			{/* 搜索框 */}
			<div className="p-2 border-b">
				<div className="relative">
					<SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="搜索任务..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="pl-8 h-8 text-sm"
					/>
				</div>
			</div>
			
			{/* 任务列表 */}
			<ScrollArea className="flex-1">
				<div className="p-2 space-y-1">
					{filteredTasks.length === 0 ? (
						<div className="text-center py-8 text-muted-foreground text-sm">
							{searchQuery ? "没有匹配的任务" : "暂无任务"}
						</div>
					) : (
						filteredTasks.map((task) => (
							<button
								key={task.id}
								onClick={() => onTaskSelect(task.id)}
								className={cn(
									"w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors",
									"hover:bg-accent hover:text-accent-foreground",
									task.id === currentTaskId 
										? "bg-accent text-accent-foreground font-medium" 
										: "text-muted-foreground"
								)}
							>
								<FileTextIcon className="h-4 w-4 flex-shrink-0" />
								<span className="truncate">{task.name}</span>
							</button>
						))
					)}
				</div>
			</ScrollArea>
			
			{/* 底部统计 */}
			<div className="p-2 border-t text-xs text-muted-foreground text-center">
				共 {tasks.length} 个任务
			</div>
		</div>
	)
}
