
/**
 * ============================================
 * 聚合级别配置
 * ============================================
 * 
 * 与后端 config.yaml.tmpl 保持一致的聚合级别配置
 * 用于前端选择时间范围和数据粒度
 */

export interface AggregationLevel {
	/** 级别名称（如 "15s", "1m", "5m" 等） */
	name: string
	
	/** 聚合间隔（如 "15s", "1m", "5m" 等） */
	interval: string
	
	/** 数据保留时间（如 "30m", "2h", "7d" 等） */
	retention: string
	
	/** 数据来源（如 "raw", "15s", "1m" 等） */
	source: string
	
	/** 描述信息 */
	description: string
	
	/** 用于显示的标签（格式化后的保留时间，如 "30分钟", "2小时" 等） */
	displayLabel: string
	
	/** 保留时间的毫秒数（用于排序和计算） */
	retentionMs: number
	
	/** 前端刷新间隔（毫秒），用于定时刷新当前级别的图表数据 */
	refreshInterval: number
}

/**
 * 将时间字符串转换为毫秒
 */
function parseTimeToMs(timeStr: string): number {
	const match = timeStr.match(/^(\d+)(s|m|h|d)$/)
	if (!match) return 0
	
	const value = parseInt(match[1])
	const unit = match[2]
	
	switch (unit) {
		case 's': return value * 1000
		case 'm': return value * 60 * 1000
		case 'h': return value * 60 * 60 * 1000
		case 'd': return value * 24 * 60 * 60 * 1000
		default: return 0
	}
}

/**
 * 将时间字符串格式化为中文显示
 */
function formatRetentionLabel(retention: string): string {
	const match = retention.match(/^(\d+)(s|m|h|d)$/)
	if (!match) return retention
	
	const value = parseInt(match[1])
	const unit = match[2]
	
	const unitMap: Record<string, string> = {
		's': '秒',
		'm': '分钟',
		'h': '小时',
		'd': '天',
	}
	
	// 特殊处理：如果是 1 周，显示为 "1周" 而不是 "7天"
	if (unit === 'd' && value === 7) {
		return '1周'
	}
	
	// 特殊处理：如果是 30 天，显示为 "30天" 或 "1月"
	if (unit === 'd' && value === 30) {
		return '30天'
	}
	
	return `${value}${unitMap[unit] || unit}`
}

/**
 * 前端聚合级别配置（与后端保持一致）
 */
export const AGGREGATION_LEVELS: AggregationLevel[] = [
	{
		name: '15s',
		interval: '15s',
		retention: '30m',
		source: 'raw',
		description: '实时监控级别：从 Pushgateway 采集原始数据，保留 30 分钟用于实时告警和问题定位',
		displayLabel: formatRetentionLabel('30m'),
		retentionMs: parseTimeToMs('30m'),
		refreshInterval: 15 * 1000, // 15秒刷新一次
	},
	{
		name: '1m',
		interval: '1m',
		retention: '2h',
		source: '15s',
		description: '短期分析级别：从 15s 聚合，保留 2 小时用于短期趋势分析',
		displayLabel: formatRetentionLabel('2h'),
		retentionMs: parseTimeToMs('2h'),
		refreshInterval: 60 * 1000, // 1分钟刷新一次
	},
	{
		name: '5m',
		interval: '5m',
		retention: '12h',
		source: '1m',
		description: '当日分析级别：从 1m 聚合，保留 12 小时用于当日性能分析',
		displayLabel: formatRetentionLabel('12h'),
		retentionMs: parseTimeToMs('12h'),
		refreshInterval: 5 * 60 * 1000, // 5分钟刷新一次
	},
	{
		name: '30m',
		interval: '30m',
		retention: '24h',
		source: '5m',
		description: '近期趋势级别：从 5m 聚合，保留 24 小时用于近期趋势对比',
		displayLabel: formatRetentionLabel('24h'),
		retentionMs: parseTimeToMs('24h'),
		refreshInterval: 30 * 60 * 1000, // 30分钟刷新一次
	},
	{
		name: '1h',
		interval: '1h',
		retention: '7d',
		source: '30m',
		description: '周级历史级别：从 30m 聚合，保留 7 天用于周级趋势和容量规划',
		displayLabel: formatRetentionLabel('7d'),
		retentionMs: parseTimeToMs('7d'),
		refreshInterval: 60 * 60 * 1000, // 1小时刷新一次
	},
	{
		name: '6h',
		interval: '6h',
		retention: '30d',
		source: '1h',
		description: '月级历史级别：从 1h 聚合，保留 30 天用于长期趋势和同比分析',
		displayLabel: formatRetentionLabel('30d'),
		retentionMs: parseTimeToMs('30d'),
		refreshInterval: 6 * 60 * 60 * 1000, // 6小时刷新一次
	},
]

/**
 * 根据级别名称获取配置
 */
export function getAggregationLevel(name: string): AggregationLevel | undefined {
	return AGGREGATION_LEVELS.find(level => level.name === name)
}

/**
 * 获取默认聚合级别（30分钟）
 */
export function getDefaultAggregationLevel(): AggregationLevel {
	return AGGREGATION_LEVELS.find(level => level.retention === '30m') || AGGREGATION_LEVELS[0]
}

/**
 * 后端查询延迟（毫秒）
 * 对应后端配置：aggregation.query_delay
 * 用于等待迟到的数据，避免数据断档
 */
export const QUERY_DELAY_MS = 60 * 1000 // 60秒

/**
 * 计算查询时间窗口
 * 
 * @param level - 聚合级别配置
 * @returns 查询时间窗口 { startTime, endTime }（Unix 毫秒时间戳）
 * 
 * @example
 * ```typescript
 * const level = getAggregationLevel('1m')
 * const { startTime, endTime } = calculateQueryTimeWindow(level)
 * 
 * // 如果当前时间是 2024-11-27 10:00:00
 * // endTime = 2024-11-27 09:59:00 (当前时间 - 60秒延迟)
 * // startTime = 2024-11-27 07:59:00 (endTime - 2小时保留时间)
 * ```
 */
export function calculateQueryTimeWindow(level: AggregationLevel): {
	startTime: number
	endTime: number
} {
	const now = Date.now()
	
	// endTime = 当前时间 - 查询延迟
	// 减去延迟是为了避免查询到还未完全聚合的数据
	const endTime = now - QUERY_DELAY_MS
	
	// startTime = endTime - 保留时间
	// 确保查询的数据都在保留窗口内
	const startTime = endTime - level.retentionMs
	
	return { startTime, endTime }
}

