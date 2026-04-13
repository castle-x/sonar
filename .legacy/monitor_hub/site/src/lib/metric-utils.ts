/**
 * 指标相关工具函数
 * 
 * 包含数据转换、格式化等通用功能
 */

/**
 * 应用转换表达式到数值
 * @param value 原始值
 * @param transform 转换表达式（如 "value * 100", "value / 1024"）
 * @returns 转换后的值
 * 
 * @example
 * applyTransform(100, "value * 100") // 10000
 * applyTransform(1024, "value / 1024") // 1
 */
export function applyTransform(value: number, transform?: string): number {
	if (!transform || transform.trim() === '') {
		return value
	}
	
	try {
		// 创建一个安全的计算环境
		// 支持的表达式：value * N, value / N, value + N, value - N
		const expr = transform.trim().replace(/value/g, String(value))
		
		// 简单的安全检查：只允许数字、基本运算符、小数点、括号
		if (!/^[\d\s+\-*/().]+$/.test(expr)) {
			console.warn(`Invalid transform expression: ${transform}`)
			return value
		}
		
		// 使用 Function 构造器来计算表达式（比 eval 稍微安全一点）
		const result = new Function(`return ${expr}`)()
		
		// 检查结果是否有效
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
 * 
 * @example
 * formatBytes(1024) // "1.00 KB"
 * formatBytes(1048576) // "1.00 MB"
 */
export function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B"
	const k = 1024
	const sizes = ["B", "KB", "MB", "GB", "TB"]
	const i = Math.floor(Math.log(bytes) / Math.log(k))
	return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

/**
 * 复制表格数据到剪贴板
 * @param table 二维数组表格数据
 * @returns Promise<boolean> 是否成功
 */
export async function copyTableToClipboard(table: string[][]): Promise<boolean> {
	try {
		// 将表格转换为制表符分隔的文本
		const text = table.map(row => row.join('\t')).join('\n')
		
		// 优先使用现代 Clipboard API
		if (navigator.clipboard && navigator.clipboard.writeText) {
			await navigator.clipboard.writeText(text)
		} else {
			// 降级方案：使用传统的 execCommand
			const textarea = document.createElement('textarea')
			textarea.value = text
			textarea.style.position = 'fixed'
			textarea.style.opacity = '0'
			document.body.appendChild(textarea)
			textarea.select()
			const success = document.execCommand('copy')
			document.body.removeChild(textarea)
			
			if (!success) {
				throw new Error('execCommand copy failed')
			}
		}
		
		return true
	} catch (err) {
		console.error('Failed to copy table:', err)
		return false
	}
}

/**
 * 导出表格为 CSV 文件
 * @param table 二维数组表格数据
 * @param fileName 文件名（不含扩展名）
 * @returns boolean 是否成功
 */
export function exportTableAsCSV(table: string[][], fileName: string): boolean {
	try {
		// 将表格转换为 CSV 格式（使用逗号分隔，字段包含逗号时用引号括起来）
		const csvContent = table.map(row => 
			row.map(cell => {
				// 如果单元格包含逗号、换行符或引号，需要用引号括起来并转义引号
				if (cell.includes(',') || cell.includes('\n') || cell.includes('"')) {
					return `"${cell.replace(/"/g, '""')}"`
				}
				return cell
			}).join(',')
		).join('\n')
		
		// 添加 BOM 头以支持中文（Excel 兼容）
		const bom = '\uFEFF'
		const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
		
		// 创建下载链接
		const url = URL.createObjectURL(blob)
		const link = document.createElement('a')
		link.href = url
		link.download = `${fileName}.csv`
		
		// 触发下载
		document.body.appendChild(link)
		link.click()
		document.body.removeChild(link)
		
		// 释放 URL 对象
		URL.revokeObjectURL(url)
		
		return true
	} catch (err) {
		console.error('Failed to export table:', err)
		return false
	}
}

// 可用的聚合类型列表（常量）
export const AGGREGATION_TYPES: Array<'avg' | 'min' | 'max' | 'count' | 'last'> = ['avg', 'min', 'max', 'count', 'last']

