/**
 * ============================================
 * 图表工具函数
 * ============================================
 *
 * 提供图表相关的工具函数，包括：
 * - 时间格式化
 * - 数值格式化
 * - 数据处理
 */

// ============================================
// 时间格式化
// ============================================

/**
 * 格式化时间戳为简短格式
 *
 * @param timestamp - Unix 毫秒时间戳
 * @returns 格式化后的时间字符串
 *
 * @example
 * formatShortTime(1699999999999) // "15:46"
 */
export function formatShortTime(timestamp: number): string {
	const date = new Date(timestamp)
	const hour = String(date.getHours()).padStart(2, '0')
	const minute = String(date.getMinutes()).padStart(2, '0')
	return `${hour}:${minute}`
}

/**
 * 格式化时间戳为短日期时间
 *
 * @param timestamp - Unix 毫秒时间戳
 * @returns 格式化后的日期时间字符串
 *
 * @example
 * formatShortDateTime(1699999999999) // "11-15 15:46"
 */
export function formatShortDateTime(timestamp: number): string {
	const date = new Date(timestamp)
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')
	const hour = String(date.getHours()).padStart(2, '0')
	const minute = String(date.getMinutes()).padStart(2, '0')
	return `${month}-${day} ${hour}:${minute}`
}

/**
 * 格式化时间戳为完整日期时间
 *
 * @param timestamp - Unix 毫秒时间戳
 * @returns 格式化后的完整日期时间字符串
 *
 * @example
 * formatFullDateTime(1699999999999) // "11月15日 15:46:39"
 */
export function formatFullDateTime(timestamp: number): string {
	const date = new Date(timestamp)
	const month = date.getMonth() + 1
	const day = date.getDate()
	const hour = String(date.getHours()).padStart(2, '0')
	const minute = String(date.getMinutes()).padStart(2, '0')
	const second = String(date.getSeconds()).padStart(2, '0')
	return `${month}月${day}日 ${hour}:${minute}:${second}`
}

// ============================================
// 数值格式化
// ============================================

/**
 * 格式化数值（保留指定小数位，不添加单位）
 *
 * @param value - 数值
 * @param decimals - 小数位数
 * @returns 格式化后的数值字符串
 *
 * @example
 * formatValue(45.678, 1) // "45.7"
 */
export function formatValue(value: number, decimals: number = 1): string {
	// 如果是无效数字，返回 "0"
	if (!isFinite(value) || isNaN(value)) {
		return '0'
	}

	// 使用 toFixed 后转换为数字再转回字符串，去除多余的0
	return Number(value.toFixed(decimals)).toString()
}

/**
 * 格式化数值为百分比
 *
 * @param value - 数值（0-100）
 * @param decimals - 小数位数
 * @returns 格式化后的百分比字符串
 *
 * @example
 * formatPercentage(45.678, 1) // "45.7%"
 */
export function formatPercentage(value: number, decimals: number = 1): string {
	if (!isFinite(value) || isNaN(value)) {
		return '0%'
	}
	return `${Number(value.toFixed(decimals))}%`
}

/**
 * 格式化字节大小
 *
 * @param bytes - 字节数
 * @param decimals - 小数位数
 * @returns 格式化后的大小字符串
 *
 * @example
 * formatBytes(1536) // "1.5 KB"
 * formatBytes(1048576) // "1 MB"
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
	if (bytes === 0 || !isFinite(bytes) || isNaN(bytes)) return '0 B'

	const k = 1024
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
	const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k))

	return `${Number((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`
}

/**
 * 格式化数值（自动选择单位）
 *
 * @param value - 数值
 * @param decimals - 小数位数
 * @returns 格式化后的数值字符串
 *
 * @example
 * formatNumber(1234) // "1.2K"
 * formatNumber(1234567) // "1.2M"
 */
export function formatNumber(value: number, decimals: number = 1): string {
	if (value === 0 || !isFinite(value) || isNaN(value)) return '0'

	const absValue = Math.abs(value)

	if (absValue >= 1000000000) {
		return `${Number((value / 1000000000).toFixed(decimals))}G`
	} else if (absValue >= 1000000) {
		return `${Number((value / 1000000).toFixed(decimals))}M`
	} else if (absValue >= 1000) {
		return `${Number((value / 1000).toFixed(decimals))}K`
	}

	return Number(value.toFixed(decimals)).toString()
}

/**
 * 智能格式化数值（根据大小自动选择精度）
 *
 * @param value - 数值
 * @returns 格式化后的数值字符串
 *
 * @example
 * formatSmartNumber(0.003) // "0.003"
 * formatSmartNumber(45.678) // "45.68"
 * formatSmartNumber(1234567) // "1.23M"
 */
export function formatSmartNumber(value: number): string {
	if (!isFinite(value) || isNaN(value)) return '0'

	const absValue = Math.abs(value)

	// 大数使用 K/M/G 单位
	if (absValue >= 1000000) {
		return formatNumber(value, 2)
	} else if (absValue >= 1000) {
		return formatNumber(value, 2)
	}

	// 小数智能精度
	if (absValue === 0) return '0'
	if (absValue >= 100) return Number(value.toFixed(2)).toString()
	if (absValue >= 10) return Number(value.toFixed(3)).toString()
	if (absValue >= 1) return Number(value.toFixed(4)).toString()
	if (absValue >= 0.01) return Number(value.toFixed(4)).toString()
	if (absValue >= 0.0001) return Number(value.toFixed(6)).toString()
	return value.toExponential(2)
}

// ============================================
// 数据处理
// ============================================

/**
 * 计算时间刻度
 *
 * @param startTime - 开始时间（Unix 毫秒）
 * @param endTime - 结束时间（Unix 毫秒）
 * @param tickCount - 刻度数量
 * @returns 刻度数组
 *
 * @example
 * calculateTimeTicks(1000, 10000, 5) // [1000, 3250, 5500, 7750, 10000]
 */
export function calculateTimeTicks(
	startTime: number,
	endTime: number,
	tickCount: number = 6
): number[] {
	const ticks: number[] = []
	const interval = (endTime - startTime) / (tickCount - 1)

	for (let i = 0; i < tickCount; i++) {
		ticks.push(startTime + interval * i)
	}

	return ticks
}

/**
 * 过滤数据点（按时间范围）
 *
 * @param data - 数据数组
 * @param startTime - 开始时间
 * @param endTime - 结束时间
 * @param timeKey - 时间字段名
 * @returns 过滤后的数据数组
 *
 * @example
 * filterDataByTime(data, 1000, 5000, 'timestamp')
 */
export function filterDataByTime<T extends Record<string, any>>(
	data: T[],
	startTime: number,
	endTime: number,
	timeKey: string = 'timestamp'
): T[] {
	return data.filter(item => {
		const time = item[timeKey]
		return time >= startTime && time <= endTime
	})
}

/**
 * 数据降采样（减少数据点数量）
 *
 * 使用简单的间隔采样算法
 *
 * @param data - 数据数组
 * @param maxPoints - 最大数据点数量
 * @returns 降采样后的数据数组
 *
 * @example
 * downsampleData(largeDataArray, 100)
 */
export function downsampleData<T>(data: T[], maxPoints: number): T[] {
	if (data.length <= maxPoints) {
		return data
	}

	const result: T[] = []
	const step = data.length / maxPoints

	for (let i = 0; i < maxPoints; i++) {
		const index = Math.floor(i * step)
		result.push(data[index])
	}

	// 确保包含最后一个点
	if (result[result.length - 1] !== data[data.length - 1]) {
		result[result.length - 1] = data[data.length - 1]
	}

	return result
}

/**
 * 填充缺失的时间点
 *
 * @param data - 数据数组
 * @param startTime - 开始时间
 * @param endTime - 结束时间
 * @param interval - 时间间隔（毫秒）
 * @param timeKey - 时间字段名
 * @param defaultValue - 缺失值的默认数据
 * @returns 填充后的数据数组
 */
export function fillMissingTimePoints<T extends Record<string, any>>(
	data: T[],
	startTime: number,
	endTime: number,
	interval: number,
	timeKey: string = 'timestamp',
	defaultValue: Partial<T> = {}
): T[] {
	const result: T[] = []
	const dataMap = new Map<number, T>()

	// 构建时间 -> 数据的映射
	data.forEach(item => {
		const time = item[timeKey]
		dataMap.set(time, item)
	})

	// 填充所有时间点
	for (let time = startTime; time <= endTime; time += interval) {
		if (dataMap.has(time)) {
			result.push(dataMap.get(time)!)
		} else {
			result.push({
				...defaultValue,
				[timeKey]: time,
			} as T)
		}
	}

	return result
}
