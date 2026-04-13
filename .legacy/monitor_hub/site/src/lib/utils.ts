/**
 * 通用工具函数库
 * 
 * 从 Beszel 项目中精选的实用工具函数
 * 每个函数都有详细的中文注释和使用示例
 */

import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { useEffect, useState } from "react"
import { toast } from "@/components/ui/use-toast"

// ============================================
// 🎨 样式相关工具
// ============================================

/**
 * cn - 合并 Tailwind CSS 类名
 * 
 * 这是项目中最常用的工具函数！
 * - 使用 clsx 处理条件类名
 * - 使用 twMerge 智能合并和去重 Tailwind 类
 * 
 * @example
 * // 基础用法
 * cn("px-4", "py-2", "bg-blue-500")
 * // → "px-4 py-2 bg-blue-500"
 * 
 * // 条件类名
 * cn("text-sm", isActive && "font-bold")
 * // → isActive ? "text-sm font-bold" : "text-sm"
 * 
 * // 智能合并（自动去重冲突的类）
 * cn("p-4", "p-6")
 * // → "p-6" (只保留后面的)
 * 
 * // 组件中使用
 * <Button className={cn("px-4 py-2", variant === "primary" && "bg-blue-500", className)} />
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

// ============================================
// 🎧 事件监听工具
// ============================================

/**
 * listen - 添加事件监听器并返回清理函数
 * 
 * 封装了 addEventListener，返回一个函数用于移除监听器
 * 
 * @param node - DOM 节点
 * @param event - 事件名称
 * @param handler - 事件处理函数
 * @returns 返回一个函数，调用它可以移除监听器
 * 
 * @example
 * // 基础用法
 * const unlisten = listen(document, "click", (e) => {
 *   console.log("页面被点击", e)
 * })
 * // 移除监听
 * unlisten()
 * 
 * // 在 React 中使用
 * useEffect(() => {
 *   const unlisten = listen(window, "resize", () => {
 *     console.log("窗口大小改变")
 *   })
 *   return unlisten  // 组件卸载时自动清理
 * }, [])
 */
export function listen<T extends Event = Event>(
	node: Node,
	event: string,
	handler: (event: T) => void
) {
	node.addEventListener(event, handler as EventListener)
	return () => node.removeEventListener(event, handler as EventListener)
}

// ============================================
// 📋 剪贴板工具
// ============================================

/**
 * copyToClipboard - 复制文本到剪贴板
 * 
 * 使用现代 Clipboard API 复制文本，并显示 Toast 提示
 * 
 * @param content - 要复制的文本内容
 * 
 * @example
 * // 复制文本
 * await copyToClipboard("Hello World")
 * // → 显示 "已复制到剪贴板" 提示
 * 
 * // 在按钮中使用
 * <Button onClick={() => copyToClipboard(code)}>
 *   复制代码
 * </Button>
 */
export async function copyToClipboard(content: string) {
	try {
		await navigator.clipboard.writeText(content)
		toast({
			duration: 1500,
			description: "已复制到剪贴板",
		})
	} catch (error) {
		console.error("复制失败:", error)
		toast({
			duration: 1500,
			description: "复制失败",
			variant: "destructive"
		})
	}
}

// ============================================
// 🔢 数字格式化工具
// ============================================

/**
 * toFixedFloat - 格式化数字到指定小数位（不保留尾随零）
 * 
 * 与 toFixed() 不同，这个函数会移除尾随的零
 * 
 * @param num - 要格式化的数字
 * @param digits - 保留的小数位数
 * @returns 格式化后的数字
 * 
 * @example
 * toFixedFloat(3.14159, 2)  // → 3.14
 * toFixedFloat(3.10000, 2)  // → 3.1  (移除尾随零)
 * toFixedFloat(3.00000, 2)  // → 3
 * toFixedFloat(3.5, 0)      // → 4    (0位小数时向上取整)
 */
export function toFixedFloat(num: number, digits: number) {
	return parseFloat((digits === 0 ? Math.ceil(num) : num).toFixed(digits))
}

// 数字格式化器缓存（提高性能）
const decimalFormatters: Map<number, Intl.NumberFormat> = new Map()

/**
 * decimalString - 格式化数字到指定小数位（保留尾随零）
 * 
 * 使用 Intl.NumberFormat 格式化数字，保留尾随的零
 * 
 * @param num - 要格式化的数字
 * @param digits - 保留的小数位数（默认 2）
 * @returns 格式化后的字符串
 * 
 * @example
 * decimalString(3.1, 2)     // → "3.10"  (保留尾随零)
 * decimalString(3.14159, 2) // → "3.14"
 * decimalString(3.5, 0)     // → "4"     (0位小数时向上取整)
 */
export function decimalString(num: number, digits = 2) {
	if (digits === 0) {
		return Math.ceil(num).toString()
	}
	let formatter = decimalFormatters.get(digits)
	if (!formatter) {
		formatter = new Intl.NumberFormat(undefined, {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits,
		})
		decimalFormatters.set(digits, formatter)
	}
	return formatter.format(num)
}

/**
 * formatBytes - 格式化字节数为人类可读的格式
 * 
 * 将字节数转换为 KB、MB、GB 等单位
 * 
 * @param size - 字节数
 * @param perSecond - 是否添加 "/s" 后缀（用于网速）
 * @returns { value: 数值, unit: 单位 }
 * 
 * @example
 * formatBytes(1024)
 * // → { value: 1, unit: "KB" }
 * 
 * formatBytes(1048576)
 * // → { value: 1, unit: "MB" }
 * 
 * formatBytes(1024000, true)
 * // → { value: 1000, unit: "KB/s" }
 * 
 * // 在组件中使用
 * const { value, unit } = formatBytes(fileSize)
 * return <span>{toFixedFloat(value, 2)} {unit}</span>
 */
export function formatBytes(
	size: number,
	perSecond = false
): { value: number; unit: string } {
	const suffix = perSecond ? "/s" : ""
	
	if (size < 100) return { value: size, unit: `B${suffix}` }
	if (size < 1000 * 1024) return { value: size / 1024, unit: `KB${suffix}` }
	if (size < 1000 * 1024 ** 2) return { value: size / 1024 ** 2, unit: `MB${suffix}` }
	if (size < 1000 * 1024 ** 3) return { value: size / 1024 ** 3, unit: `GB${suffix}` }
	
	return { value: size / 1024 ** 4, unit: `TB${suffix}` }
}

/**
 * formatTemperature - 格式化温度（摄氏度转华氏度）
 * 
 * @param celsius - 摄氏度
 * @param toFahrenheit - 是否转换为华氏度
 * @returns { value: 温度值, unit: 单位符号 }
 * 
 * @example
 * formatTemperature(25)
 * // → { value: 25, unit: "°C" }
 * 
 * formatTemperature(25, true)
 * // → { value: 77, unit: "°F" }
 * 
 * // 在组件中使用
 * const { value, unit } = formatTemperature(cpuTemp, userPrefersFahrenheit)
 * return <span>{toFixedFloat(value, 1)}{unit}</span>
 */
export function formatTemperature(
	celsius: number,
	toFahrenheit = false
): { value: number; unit: string } {
	if (toFahrenheit) {
		return {
			value: celsius * 1.8 + 32,
			unit: "°F",
		}
	}
	return {
		value: celsius,
		unit: "°C",
	}
}

// ============================================
// 💾 浏览器存储工具
// ============================================

/**
 * 从 localStorage 或 sessionStorage 获取值
 * 
 * @param key - 存储的键名
 * @param defaultValue - 默认值
 * @param storageInterface - 存储接口（默认 localStorage）
 */
function getStorageValue(
	key: string,
	defaultValue: unknown,
	storageInterface: Storage = localStorage
) {
	const saved = storageInterface?.getItem(key)
	return saved ? JSON.parse(saved) : defaultValue
}

/**
 * useBrowserStorage - React Hook：同步值到浏览器存储
 * 
 * 自动在 localStorage 或 sessionStorage 中保存和恢复状态
 * 
 * @param key - 存储的键名（会自动添加前缀）
 * @param defaultValue - 默认值
 * @param storageInterface - 存储接口（默认 localStorage）
 * @returns [value, setValue] - 类似 useState
 * 
 * @example
 * // 基础用法（保存到 localStorage）
 * const [theme, setTheme] = useBrowserStorage("theme", "light")
 * // 改变主题时自动保存
 * setTheme("dark")
 * // 刷新页面后会自动恢复为 "dark"
 * 
 * // 使用 sessionStorage（标签页关闭后清除）
 * const [token, setToken] = useBrowserStorage("token", "", sessionStorage)
 * 
 * // 存储对象
 * const [user, setUser] = useBrowserStorage("user", { name: "", age: 0 })
 */
export function useBrowserStorage<T>(
	key: string,
	defaultValue: T,
	storageInterface: Storage = localStorage
): [T, (value: T) => void] {
	key = `monitor-hub-${key}` // 添加项目前缀避免冲突
	
	const [value, setValue] = useState<T>(() => {
		return getStorageValue(key, defaultValue, storageInterface)
	})
	
	useEffect(() => {
		storageInterface?.setItem(key, JSON.stringify(value))
	}, [key, value, storageInterface])

	return [value, setValue]
}

// ============================================
// ⏱️ 时间和持续时间工具
// ============================================

/**
 * formatDuration - 格式化时间间隔为人类可读的字符串
 * 
 * 计算两个日期之间的时间差并格式化
 * 
 * @param startDate - 开始时间（ISO 字符串）
 * @param endDate - 结束时间（ISO 字符串）
 * @returns 格式化后的时间间隔字符串
 * 
 * @example
 * formatDuration("2024-01-01T10:00:00", "2024-01-01T11:30:45")
 * // → "1h 30m 45s"
 * 
 * formatDuration("2024-01-01T10:00:00", "2024-01-01T13:00:00")
 * // → "3h" (超过1小时时省略秒)
 * 
 * formatDuration("2024-01-01T10:00:00", "2024-01-01T10:02:58")
 * // → "3m" (接近60秒时四舍五入)
 * 
 * // 在组件中使用
 * <span>宕机时长: {formatDuration(downtime.start, downtime.end)}</span>
 */
export function formatDuration(
	startDate: string | null | undefined,
	endDate: string | null | undefined
): string {
	const start = startDate ? new Date(startDate) : null
	const end = endDate ? new Date(endDate) : null

	if (!start || !end) return ""

	const diffMs = end.getTime() - start.getTime()
	if (diffMs < 0) return ""

	const totalSeconds = Math.floor(diffMs / 1000)
	let hours = Math.floor(totalSeconds / 3600)
	let minutes = Math.floor((totalSeconds % 3600) / 60)
	let seconds = totalSeconds % 60

	// 接近 60 秒时四舍五入到下一分钟
	if (seconds >= 58) {
		minutes += 1
		seconds = 0
	}
	// 接近 60 分钟时四舍五入到下一小时
	if (minutes >= 60) {
		hours += 1
		minutes = 0
	}

	// 超过 1 小时时省略秒数（更简洁）
	if (hours > 0) {
		return [
			hours ? `${hours}h` : null,
			minutes ? `${minutes}m` : null
		].filter(Boolean).join(" ")
	}

	return [
		hours ? `${hours}h` : null,
		minutes ? `${minutes}m` : null,
		seconds ? `${seconds}s` : null
	].filter(Boolean).join(" ")
}

// ============================================
// 🔐 安全和 Token 工具
// ============================================

/**
 * generateToken - 生成随机 Token
 * 
 * 优先使用 crypto.randomUUID()，如果不支持则使用备用方案
 * 
 * @returns 随机生成的 UUID 字符串
 * 
 * @example
 * const token = generateToken()
 * // → "550e8400-e29b-41d4-a716-446655440000"
 * 
 * // 用于 API 认证
 * const apiKey = generateToken()
 * localStorage.setItem("apiKey", apiKey)
 */
export function generateToken(): string {
	try {
		// 现代浏览器支持
		return crypto.randomUUID()
	} catch (e) {
		// 备用方案（兼容旧浏览器）
		return Array.from(
			{ length: 2 },
			() => (performance.now() * Math.random())
				.toString(16)
				.replace(".", "-")
		).join("-")
	}
}

// ============================================
// 📦 版本号工具
// ============================================

/**
 * SemVer - 语义化版本号
 */
export interface SemVer {
	major: number  // 主版本号
	minor: number  // 次版本号
	patch: number  // 补丁版本号
}

/**
 * parseSemVer - 解析版本号字符串
 * 
 * 将版本号字符串（如 "1.2.3"）解析为对象
 * 
 * @param semVer - 版本号字符串
 * @returns { major, minor, patch }
 * 
 * @example
 * parseSemVer("1.2.3")
 * // → { major: 1, minor: 2, patch: 3 }
 * 
 * parseSemVer("2.0.0-beta.1")
 * // → { major: 2, minor: 0, patch: 0 } (忽略预发布标签)
 * 
 * parseSemVer("v3.1.0")
 * // → { major: 3, minor: 1, patch: 0 }
 */
export function parseSemVer(semVer = ""): SemVer {
	// 移除 v 前缀
	if (semVer.startsWith("v")) {
		semVer = semVer.slice(1)
	}
	// 移除预发布标签（如 -beta.1）
	if (semVer.includes("-")) {
		semVer = semVer.slice(0, semVer.indexOf("-"))
	}
	const parts = semVer.split(".").map(Number)
	return {
		major: parts[0] ?? 0,
		minor: parts[1] ?? 0,
		patch: parts[2] ?? 0
	}
}

/**
 * compareSemVer - 比较两个版本号
 * 
 * @param a - 版本号 A
 * @param b - 版本号 B
 * @returns 负数表示 a < b，0 表示相等，正数表示 a > b
 * 
 * @example
 * compareSemVer({ major: 1, minor: 2, patch: 3 }, { major: 1, minor: 2, patch: 4 })
 * // → -1 (1.2.3 < 1.2.4)
 * 
 * compareSemVer({ major: 2, minor: 0, patch: 0 }, { major: 1, minor: 9, patch: 9 })
 * // → 1 (2.0.0 > 1.9.9)
 * 
 * // 在代码中使用
 * if (compareSemVer(currentVersion, latestVersion) < 0) {
 *   console.log("有新版本可用！")
 * }
 */
export function compareSemVer(a: SemVer, b: SemVer): number {
	if (a.major !== b.major) {
		return a.major - b.major
	}
	if (a.minor !== b.minor) {
		return a.minor - b.minor
	}
	return a.patch - b.patch
}

// ============================================
// 🎯 性能优化工具
// ============================================

/**
 * debounce - 防抖函数
 * 
 * 限制函数的调用频率，只在最后一次调用后的指定时间后执行
 * 常用于搜索框、窗口 resize 等场景
 * 
 * @param func - 要防抖的函数
 * @param wait - 等待时间（毫秒）
 * @returns 防抖后的函数
 * 
 * @example
 * // 搜索框防抖（用户停止输入 300ms 后才搜索）
 * const handleSearch = debounce((query: string) => {
 *   fetchSearchResults(query)
 * }, 300)
 * 
 * <input onChange={(e) => handleSearch(e.target.value)} />
 * 
 * // 窗口大小改变防抖
 * const handleResize = debounce(() => {
 *   console.log("窗口大小:", window.innerWidth)
 * }, 200)
 * 
 * window.addEventListener("resize", handleResize)
 */
export function debounce<T extends (...args: any[]) => any>(
	func: T,
	wait: number
): (...args: Parameters<T>) => void {
	let timeout: ReturnType<typeof setTimeout>
	return (...args: Parameters<T>) => {
		clearTimeout(timeout)
		timeout = setTimeout(() => func(...args), wait)
	}
}

// runOnce 缓存
const runOnceCache = new WeakMap<Function, { done: boolean; result: unknown }>()

/**
 * runOnce - 确保函数只执行一次
 * 
 * 第一次调用时执行函数并缓存结果，后续调用直接返回缓存的结果
 * 
 * @param fn - 要执行的函数
 * @returns 包装后的函数
 * 
 * @example
 * // 创建单例
 * const initApp = runOnce(() => {
 *   console.log("应用初始化")
 *   return { initialized: true }
 * })
 * 
 * initApp() // → 打印 "应用初始化"，返回 { initialized: true }
 * initApp() // → 直接返回缓存的 { initialized: true }，不再打印
 * 
 * // 预加载组件（只加载一次）
 * const preloadDashboard = runOnce(() => import("@/components/routes/dashboard"))
 * 
 * <Link onMouseEnter={preloadDashboard}>
 *   仪表盘
 * </Link>
 */
export function runOnce<T extends (...args: any[]) => any>(fn: T): T {
	return ((...args: Parameters<T>) => {
		let state = runOnceCache.get(fn)
		if (!state) {
			state = { done: false, result: undefined }
			runOnceCache.set(fn, state)
		}
		if (!state.done) {
			state.result = fn(...args)
			state.done = true
		}
		return state.result
	}) as T
}

// ============================================
// 🌐 全局配置工具
// ============================================

/**
 * getHubURL - 获取 Hub 服务器地址
 * 
 * 从全局配置对象或当前页面地址获取 Hub URL
 * 
 * @returns Hub 服务器地址
 * 
 * @example
 * const hubUrl = getHubURL()
 * // → "http://localhost:8080" 或当前页面地址
 * 
 * // 用于 API 请求
 * fetch(`${getHubURL()}/api/systems`)
 */
export const getHubURL = () => globalThis.MONITOR_HUB?.HUB_URL || window.location.origin

/**
 * getBasePath - 获取基础路径
 * 
 * 用于支持部署在子路径的情况（如 /monitor-hub/）
 * 
 * @returns 基础路径
 * 
 * @example
 * const basePath = getBasePath()
 * // → "" 或 "/monitor-hub"
 */
export const getBasePath = () => globalThis.MONITOR_HUB?.BASE_PATH || ""
