import { cn } from "@/lib/utils"

/**
 * Logo 组件
 * 
 * 使用 SVG 图片（<img> 标签引入），带悬停效果和深色模式支持
 * 
 * 功能：
 * - 浅色模式：显示原始黑色 Logo
 * - 深色模式：使用 CSS filter: invert() 反转颜色（黑色 → 白色）
 * - 悬停效果：轻微缩放 + 亮度/对比度调整 + 阴影
 */
export function Logo({ className }: { className?: string }) {
	return (
		<img 
			src="/static/1.svg" 
			alt="Monitor Hub Logo" 
			className={cn(
				// 固定尺寸 - 稍微大一些
				"h-6 md:h-7 w-auto",
				// 深色模式下反转颜色（黑色 → 白色）
				"dark:invert",
				// 悬停效果 - 缩放 + 滤镜 + 阴影
				"transition-all duration-200",
				"group-hover:scale-105",
				"group-hover:brightness-110 group-hover:contrast-125",
				"group-hover:drop-shadow-[0_0_8px_rgba(0,0,0,0.3)]",
				"dark:group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]",
				className
			)}
		/>
	)
}
