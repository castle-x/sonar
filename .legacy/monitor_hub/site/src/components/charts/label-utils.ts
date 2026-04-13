/**
 * ============================================
 * 标签数据处理工具函数
 * ============================================
 * 
 * 提供标签提取、筛选、分组等功能
 */

import type { AggregatedPoint } from '@/apis/points'

// ============================================
// 标签提取
// ============================================

/**
 * 从数据点中提取所有可用的标签
 * 
 * @param points - 聚合数据点数组
 * @returns 标签键 -> 所有可能值的映射
 * 
 * @example
 * ```typescript
 * const labels = extractAvailableLabels(points)
 * // { ip: Set(['192.168.1.1', '192.168.1.2']), pid: Set(['12', '123']) }
 * ```
 */
export function extractAvailableLabels(
	points: AggregatedPoint[]
): Record<string, Set<string>> {
	const labels: Record<string, Set<string>> = {}
	
	for (const point of points) {
		for (const [key, value] of Object.entries(point.labels)) {
			// 排除内部标签（以 __ 开头）
			if (key.startsWith('__')) {
				continue
			}
			
			if (!labels[key]) {
				labels[key] = new Set()
			}
			labels[key].add(value)
		}
	}
	
	return labels
}

// ============================================
// 数据筛选
// ============================================

/**
 * 根据选中的标签筛选数据点
 * 
 * @param points - 聚合数据点数组
 * @param selectedLabels - 选中的标签值
 * @returns 筛选后的数据点数组
 * 
 * @example
 * ```typescript
 * const filtered = filterPointsByLabels(points, {
 *   ip: ['192.168.1.1'],
 *   pid: ['12', '123']
 * })
 * ```
 */
export function filterPointsByLabels(
	points: AggregatedPoint[],
	selectedLabels: Record<string, string[] | undefined>
): AggregatedPoint[] {
	// 如果没有选择任何标签，返回所有数据
	const hasSelection = Object.values(selectedLabels).some(
		values => values && values.length > 0
	)
	
	if (!hasSelection) {
		return points
	}
	
	return points.filter(point => {
		// 检查每个选中的标签条件
		for (const [key, selectedValues] of Object.entries(selectedLabels)) {
			// 跳过空选择或 undefined
			if (!selectedValues || selectedValues.length === 0) {
				continue
			}
			
			// 该标签的值必须在选中列表中
			const pointValue = point.labels[key]
			if (!pointValue || !selectedValues.includes(pointValue)) {
				return false
			}
		}
		
		return true
	})
}

// ============================================
// 时间序列分组
// ============================================

/**
 * 生成时间序列唯一键
 * 
 * 格式: datasource_id|metric_name|label1=value1,label2=value2
 * 
 * @param point - 聚合数据点
 * @returns 唯一键
 */
export function generateSeriesKey(point: AggregatedPoint): string {
	// 提取业务标签（排除内部标签）
	const businessLabels = Object.entries(point.labels)
		.filter(([key]) => !key.startsWith('__'))
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, v]) => `${k}=${v}`)
		.join(',')
	
	return `${point.datasource_id}|${point.name}|${businessLabels}`
}

/**
 * 按时间序列分组数据点
 * 
 * @param points - 聚合数据点数组
 * @returns 序列键 -> 数据点数组的映射
 * 
 * @example
 * ```typescript
 * const series = groupByTimeSeries(points)
 * for (const [seriesKey, seriesPoints] of series) {
 *   console.log(seriesKey, seriesPoints.length)
 * }
 * ```
 */
export function groupByTimeSeries(
	points: AggregatedPoint[]
): Map<string, AggregatedPoint[]> {
	const series = new Map<string, AggregatedPoint[]>()
	
	for (const point of points) {
		const seriesKey = generateSeriesKey(point)
		
		if (!series.has(seriesKey)) {
			series.set(seriesKey, [])
		}
		series.get(seriesKey)!.push(point)
	}
	
	// 按时间戳排序每个序列的数据点
	for (const seriesPoints of series.values()) {
		seriesPoints.sort((a, b) => a.timestamp - b.timestamp)
	}
	
	return series
}

/**
 * 格式化序列标签（用于图表显示）
 * 
 * @param seriesKey - 序列键
 * @param options - 格式化选项
 * @returns 格式化后的标签字符串
 * 
 * @example
 * ```typescript
 * formatSeriesLabel('ds-001|cpu_usage|ip=192.168.1.1,pid=12')
 * // "cpu_usage {ip=192.168.1.1, pid=12}"
 * 
 * formatSeriesLabel('ds-001|cpu_usage|ip=192.168.1.1,pid=12', { 
 *   showDatasourceId: true 
 * })
 * // "[ds-001] cpu_usage {ip=192.168.1.1, pid=12}"
 * ```
 */
export function formatSeriesLabel(
	seriesKey: string,
	options: {
		showDatasourceId?: boolean
		showMetricName?: boolean
		maxLabelLength?: number
		displayLabels?: string[]
	} = {}
): { truncated: string; full: string } {
	const {
		showDatasourceId = false,
		showMetricName = true,
		maxLabelLength = 50,
		displayLabels,
	} = options
	
	const [datasourceId, metricName, labelsStr] = seriesKey.split('|')
	
	const truncatedParts: string[] = []
	const fullParts: string[] = []
	
	if (showDatasourceId) {
		truncatedParts.push(`[${datasourceId}]`)
		fullParts.push(`[${datasourceId}]`)
	}
	
	if (showMetricName) {
		truncatedParts.push(metricName)
		fullParts.push(metricName)
	}
	
	if (labelsStr) {
		// 解析标签为 Map<key, value>
		const labelsMap = new Map<string, string>()
		labelsStr.split(',').forEach(label => {
			const [key, value] = label.trim().split('=')
			if (key && value) {
				labelsMap.set(key, value)
			}
		})
		
		// 决定要显示的标签
		let displayLabelsArray = Array.from(labelsMap.entries())
		
		// 如果配置了 displayLabels，只显示配置的标签
		if (displayLabels && displayLabels.length > 0) {
			const filteredLabels = displayLabels
				.map(key => {
					const value = labelsMap.get(key)
					return value ? [key, value] as [string, string] : null
				})
				.filter((item): item is [string, string] => item !== null)
			
			// 如果有至少一个标签匹配，使用过滤后的标签；否则使用全量标签
			if (filteredLabels.length > 0) {
				displayLabelsArray = filteredLabels
			}
		}
		
		// 格式化为字符串
		const formattedLabels = displayLabelsArray
			.map(([key, value]) => `${key}=${value}`)
			.join(', ')
		
		// 完整标签（始终使用真实数据的全量标签）
		const fullFormattedLabels = Array.from(labelsMap.entries())
			.map(([key, value]) => `${key}=${value}`)
			.join(', ')
		fullParts.push(`{${fullFormattedLabels}}`)
		
		// 截断显示标签
		const truncatedLabels = formattedLabels.length > maxLabelLength
			? formattedLabels.substring(0, maxLabelLength) + '...'
			: formattedLabels
		
		truncatedParts.push(`{${truncatedLabels}}`)
	}
	
	return {
		truncated: truncatedParts.join(' '),
		full: fullParts.join(' ')
	}
}

// ============================================
// 数据统计
// ============================================

/**
 * 统计每个标签键的值分布
 * 
 * @param points - 聚合数据点数组
 * @returns 标签键 -> 值分布的映射
 * 
 * @example
 * ```typescript
 * const distribution = getLabelDistribution(points)
 * // { ip: { '192.168.1.1': 100, '192.168.1.2': 50 }, ... }
 * ```
 */
export function getLabelDistribution(
	points: AggregatedPoint[]
): Record<string, Record<string, number>> {
	const distribution: Record<string, Record<string, number>> = {}
	
	for (const point of points) {
		for (const [key, value] of Object.entries(point.labels)) {
			if (key.startsWith('__')) continue
			
			if (!distribution[key]) {
				distribution[key] = {}
			}
			
			distribution[key][value] = (distribution[key][value] || 0) + 1
		}
	}
	
	return distribution
}

/**
 * 获取标签值的建议顺序（按出现频率排序）
 * 
 * @param points - 聚合数据点数组
 * @param labelKey - 标签键
 * @returns 排序后的标签值数组
 */
export function getSuggestedLabelOrder(
	points: AggregatedPoint[],
	labelKey: string
): string[] {
	const distribution = getLabelDistribution(points)
	const counts = distribution[labelKey] || {}
	
	return Object.entries(counts)
		.sort(([, a], [, b]) => b - a)  // 按出现次数降序
		.map(([value]) => value)
}

