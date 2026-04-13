/**
 * 全局状态管理
 * 
 * 使用 nanostores 进行轻量级状态管理
 * nanostores 是一个极小（<1KB）的状态管理库
 */
import { atom } from "nanostores"

/**
 * 用户设置状态
 * 
 * 存储用户的偏好设置
 * 
 * @example
 * import { $userSettings } from "@/lib/stores"
 * 
 * // 读取设置
 * const settings = $userSettings.get()
 * 
 * // 更新设置
 * $userSettings.set({ ...settings, theme: "dark" })
 * 
 * // 在 React 中使用
 * import { useStore } from "@nanostores/react"
 * const settings = useStore($userSettings)
 */
export const $userSettings = atom<{
	theme?: "light" | "dark"
	language?: string
	[key: string]: any
}>({})

/**
 * 复制内容状态（用于剪贴板回退方案）
 * 
 * 当 clipboard API 不可用时，可以用这个存储要复制的内容
 * 
 * @example
 * import { $copyContent } from "@/lib/stores"
 * 
 * // 设置要复制的内容
 * $copyContent.set("Hello World")
 * 
 * // 在 React 中监听
 * const content = useStore($copyContent)
 * useEffect(() => {
 *   if (content) {
 *     // 显示复制对话框
 *   }
 * }, [content])
 */
export const $copyContent = atom<string>("")

