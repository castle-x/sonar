/**
 * ============================================
 * 图表相关 Hooks
 * ============================================
 * 
 * 提供图表组件使用的自定义 Hook
 */

import { useState } from "react"

// ============================================
// useYAxisWidth - 动态计算 Y 轴宽度
// ============================================

/**
 * 动态计算并设置 Y 轴宽度
 * 
 * 根据 Y 轴标签的最长文本自动调整宽度，避免标签被截断
 * 宽度 = 文本实际宽度 + 16px padding
 * 
 * @returns {Object} yAxisWidth 和 updateYAxisWidth 函数
 * 
 * @example
 * ```typescript
 * const { yAxisWidth, updateYAxisWidth } = useYAxisWidth()
 * 
 * <YAxis
 *   width={yAxisWidth}
 *   tickFormatter={(value) => updateYAxisWidth(formatValue(value))}
 * />
 * ```
 */
export function useYAxisWidth() {
	const [yAxisWidth, setYAxisWidth] = useState(0)
	let maxChars = 0
	let timeout: ReturnType<typeof setTimeout>

	/**
	 * 更新 Y 轴宽度
	 * 
	 * @param str - Y 轴标签文本
	 * @returns 原始字符串（用于 tickFormatter）
	 */
	function updateYAxisWidth(str: string) {
		if (str.length > maxChars) {
			maxChars = str.length
			const div = document.createElement("div")
			div.className = "text-xs tabular-nums tracking-tighter table sr-only"
			div.innerHTML = str
			clearTimeout(timeout)
			timeout = setTimeout(() => {
				document.body.appendChild(div)
				// 根据实际文本宽度计算，留16px的padding以确保文本不被截断
				const width = div.offsetWidth + 16
				if (width > yAxisWidth) {
					setYAxisWidth(width)
				}
				document.body.removeChild(div)
			})
		}
		return str
	}

	return { yAxisWidth, updateYAxisWidth }
}

// ============================================
// useChartColors - 生成图表颜色
// ============================================

/**
 * 生成图表颜色
 * 
 * 根据数据项数量生成均匀分布的 HSL 颜色
 * 
 * @param count - 颜色数量
 * @param saturation - 饱和度 (0-100)
 * @param lightness - 亮度 (0-100)
 * @returns 颜色数组
 * 
 * @example
 * ```typescript
 * const colors = useChartColors(5, 60, 55)
 * // ['hsl(0, 60%, 55%)', 'hsl(72, 60%, 55%)', ...]
 * ```
 */
export function useChartColors(
	count: number,
	saturation: number = 60,
	lightness: number = 55
): string[] {
	const colors: string[] = []
	for (let i = 0; i < count; i++) {
		const hue = ((i * 360) / count) % 360
		colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`)
	}
	return colors
}

// ============================================
// useChartTheme - 图表主题配置
// ============================================

/**
 * 图表主题颜色
 */
export interface ChartTheme {
	/** 主色调 */
	primary: string
	/** 次要色调 */
	secondary: string
	/** 成功色 */
	success: string
	/** 警告色 */
	warning: string
	/** 错误色 */
	error: string
	/** 信息色 */
	info: string
	/** 中性色 */
	neutral: string
	/** 自定义颜色数组 */
	charts: string[]
}

/**
 * 获取图表主题配置
 * 
 * @returns 图表主题颜色
 */
export function useChartTheme(): ChartTheme {
	return {
		primary: "hsl(var(--primary))",
		secondary: "hsl(var(--secondary))",
		success: "hsl(142 76% 36%)",   // 绿色
		warning: "hsl(38 92% 50%)",    // 橙色
		error: "hsl(0 84% 60%)",       // 红色
		info: "hsl(199 89% 48%)",      // 蓝色
		neutral: "hsl(var(--muted))",
		charts: [
			"hsl(220 70% 50%)",  // Chart 1 - 蓝色
			"hsl(160 60% 45%)",  // Chart 2 - 青色
			"hsl(30 80% 55%)",   // Chart 3 - 橙色
			"hsl(280 65% 60%)",  // Chart 4 - 紫色
			"hsl(340 75% 55%)",  // Chart 5 - 红色
			"hsl(120 60% 50%)",  // Chart 6 - 绿色
			"hsl(60 70% 55%)",   // Chart 7 - 黄色
			"hsl(190 70% 50%)",  // Chart 8 - 蓝绿色
		],
	}
}

