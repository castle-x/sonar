/**
 * 全局类型定义
 * 
 * 从 Beszel 复制的类型定义
 */

// 导入枚举（确保文件被识别为模块）
import type { Unit, Os, MeterState, HourFormat } from "@/lib/enums"

// 图表时间数据
export interface ChartTimeData {
	time: number
	value: number
}

// 指纹记录
export interface FingerprintRecord {
	id: string
	name: string
	created: string
	updated: string
}

// 语义化版本
export interface SemVer {
	major: number
	minor: number
	patch: number
}

// 系统记录
export interface SystemRecord {
	id: string
	name: string
	host: string
	port: number
	created: string
	updated: string
}

/**
 * 全局配置（由后端注入）
 * 
 * 在 index.html 中定义：
 * <script>
 *   globalThis.MONITOR_HUB = {
 *     BASE_PATH: "",
 *     VERSION: "1.0.0",
 *     HUB_URL: "http://localhost:8080"
 *   }
 * </script>
 * 
 * 参考 Beszel 的声明方式：不加 | undefined，这样 TypeScript 才能正确识别
 */
declare global {
	var MONITOR_HUB: {
		BASE_PATH: string
		VERSION: string
		HUB_URL: string
	}
}

