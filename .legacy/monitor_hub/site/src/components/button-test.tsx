import { Button } from "@/components/ui/button"
import { PlusIcon } from "lucide-react"

/**
 * Button 测试组件
 * 
 * 用于测试 Button 的 hover 效果是否正常
 */
export function ButtonTest() {
	return (
		<div className="p-8 space-y-4">
			<h2 className="text-2xl font-bold">Button Hover 测试</h2>
			
			<div className="space-y-4">
				{/* 测试 1：基础 outline 按钮 */}
				<div>
					<p className="text-sm text-muted-foreground mb-2">测试 1：基础 outline 按钮</p>
					<Button variant="outline">
						Hover 我试试
					</Button>
				</div>

				{/* 测试 2：带图标的 outline 按钮 */}
				<div>
					<p className="text-sm text-muted-foreground mb-2">测试 2：带图标的 outline 按钮（和导航栏一样）</p>
					<Button variant="outline" className="flex gap-1">
						<PlusIcon className="h-4 w-4 -ms-1" />
						添加数据源
					</Button>
				</div>

				{/* 测试 3：其他变体 */}
				<div>
					<p className="text-sm text-muted-foreground mb-2">测试 3：其他变体</p>
					<div className="flex gap-2">
						<Button variant="default">Default</Button>
						<Button variant="secondary">Secondary</Button>
						<Button variant="ghost">Ghost</Button>
						<Button variant="destructive">Destructive</Button>
					</div>
				</div>
			</div>
		</div>
	)
}
