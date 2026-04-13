import { getPagePath } from "@nanostores/router"
import { DialogDescription } from "@radix-ui/react-dialog"
import { LayoutDashboard, HardDrive, Calculator, ClipboardList } from "lucide-react"
import { memo, useEffect, useMemo } from "react"
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command"
import { listen } from "@/lib/utils"
import { $router, basePath, navigate } from "./router"

interface CommandPaletteProps {
	open: boolean
	setOpen: (open: boolean) => void
}

/**
 * 命令面板组件
 * 
 * 快速搜索和导航工具
 * - 支持键盘快捷键：Ctrl + K (Windows/Linux) 或 ⌘ + K (Mac)
 */
export default memo(function CommandPalette({ open, setOpen }: CommandPaletteProps) {
	// 监听键盘快捷键 Ctrl/Cmd + K
	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault()
				setOpen(!open)
			}
		}
		return listen(document, "keydown", down)
	}, [open, setOpen])

	return useMemo(() => {
		return (
			<CommandDialog open={open} onOpenChange={setOpen}>
				<DialogDescription className="sr-only">Command palette</DialogDescription>
				<CommandInput placeholder="搜索页面或设置..." />
				<CommandList>
					<CommandGroup heading="页面 / 设置">
						<CommandItem
							onSelect={() => {
								navigate(basePath)
								setOpen(false)
							}}
						>
							<LayoutDashboard className="me-2 size-4" />
							<span>仪表盘</span>
						</CommandItem>
						<CommandItem
							onSelect={() => {
								navigate(getPagePath($router, "taskList"))
								setOpen(false)
							}}
						>
							<ClipboardList className="me-2 size-4" />
							<span>测试任务</span>
						</CommandItem>
						<CommandItem
							onSelect={() => {
								navigate(getPagePath($router, "fileManager"))
								setOpen(false)
							}}
						>
							<HardDrive className="me-2 size-4" />
							<span>文件管理</span>
						</CommandItem>
						<CommandItem
							onSelect={() => {
								navigate(getPagePath($router, "scoringManager"))
								setOpen(false)
							}}
						>
							<Calculator className="me-2 size-4" />
							<span>评分配置</span>
						</CommandItem>
						{/* <CommandItem
							onSelect={() => {
								navigate(getPagePath($router, "settings", { name: "general" }))
								setOpen(false)
							}}
						>
							<SettingsIcon className="me-2 size-4" />
							<span>设置</span>
						</CommandItem> */}
					</CommandGroup>
					{/* <CommandGroup heading="演示页面">
						<CommandItem
							onSelect={() => {
								navigate(getPagePath($router, "demoPage1"))
								setOpen(false)
							}}
						>
							<Rocket className="me-2 size-4" />
							<span>数据分析</span>
						</CommandItem>
						<CommandItem
							onSelect={() => {
								navigate(getPagePath($router, "demoPage2"))
								setOpen(false)
							}}
						>
							<Settings className="me-2 size-4" />
							<span>系统配置</span>
						</CommandItem>
					</CommandGroup> */}
					<CommandEmpty>未找到结果</CommandEmpty>
				</CommandList>
			</CommandDialog>
		)
	}, [open, setOpen])
})

