export const AGGREGATION_TYPES: Array<'avg' | 'min' | 'max' | 'count' | 'last'> = ['avg', 'min', 'max', 'count', 'last']

/**
 * 应用转换表达式到数值
 * @param value 原始值
 * @param transform 转换表达式（如 "value * 100", "value / 1024"）
 * @returns 转换后的值
 */
export function applyTransform(value: number, transform?: string): number {
	if (!transform || transform.trim() === '') {
		return value
	}

	try {
		const expr = transform.trim().replace(/value/g, String(value))

		if (!/^[\d\s+\-*/().]+$/.test(expr)) {
			console.warn(`Invalid transform expression: ${transform}`)
			return value
		}

		const result = new Function(`return ${expr}`)()

		if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
			return result
		}

		console.warn(`Transform expression returned invalid value: ${transform}`)
		return value
	} catch (error) {
		console.warn(`Failed to apply transform: ${transform}`, error)
		return value
	}
}

/**
 * 格式化字节大小
 * @param bytes 字节数
 * @returns 格式化后的字符串，如 "1.5 GB"
 */
export function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B"
	const k = 1024
	const sizes = ["B", "KB", "MB", "GB", "TB"]
	const i = Math.floor(Math.log(bytes) / Math.log(k))
	return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}
