/**
 * CaseCharts - 单个用例的图表渲染组件
 * 
 * 功能：
 * 1. 解压并渲染 chunk 数据
 * 2. 显示汇总表格（SummaryTablesCard）
 * 3. 显示指标图表（使用通用 MetricChartsGrid 组件）
 * 
 * 与 MetricCharts 的区别：
 * - 接受已有的 chunk 数据，不从 API 获取
 * - 没有定时刷新
 */

import { memo, useMemo, useState, useTransition } from 'react'
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card'
import { SummaryTablesCard } from '@/components/charts/summary-tables-card'
import {
	MetricChartsGrid,
	type MetricData,
	groupByTimeSeries,
	formatSeriesLabel,
	extractAvailableLabels,
	filterPointsByLabels,
} from '@/components/charts'
import { AGGREGATION_TYPES, applyTransform } from '@/lib/metric-utils'
import { createCompressedDataIndex, getPointsFromIndex } from '@/apis/points-compressed'
import type { ChunkDataWithInfo, SingleCase } from '@/apis/report'
import type { MetricConfig } from '@/apis/datasource'
import type { SummaryTable, AggregatedPoint } from '@/apis/points'
import { CaseRateStatistics } from './case-rate-statistics'

// ============================================
// 类型定义
// ============================================

export interface CaseChartsProps {
	/** Chunk 数据 */
	chunk: ChunkDataWithInfo
	/** 用例信息 */
	caseInfo: SingleCase
	/** 是否显示图例 */
	legendVisible: boolean
	/** 网格列数 */
	gridCols: 1 | 2
	/** 指标分组配置（来自数据源） */
	groupmap?: Record<string, MetricConfig[]>
	/** 分组排序键（来自数据源） */
	groupmapSortKeys?: string[]
	/** 汇总表格布局模式 */
	tableLayout?: 'tabs' | 'list'
}

// 颜色缓存
const colorCache = new Map<string, string>()

// ============================================
// 主组件
// ============================================

export const CaseCharts = memo(function CaseCharts({
	chunk,
	caseInfo,
	legendVisible,
	gridCols,
	groupmap,
	groupmapSortKeys,
	tableLayout = 'tabs',
}: CaseChartsProps) {
	// 图例位置根据布局自动决定
	const legendPosition = gridCols === 1 ? 'right' : 'bottom'
	
	// 🚀 使用 useTransition 优化筛选状态更新，避免阻塞UI
	const [, startTransition] = useTransition()
	
	// 每个指标的标签筛选状态
	const [metricLabelSelections, setMetricLabelSelections] = useState<Record<string, Record<string, string[] | undefined>>>({})
	
	// 每个指标的聚合类型选择状态
	const [metricAggregationTypes, setMetricAggregationTypes] = useState<Record<string, 'avg' | 'min' | 'max' | 'count' | 'last'>>({})
	
	// 解压数据点
	const allPoints = useMemo(() => {
		if (!chunk?.p) return []
		
		try {
			// chunk.p 是压缩格式的 PointsResponse，需要解压
			// 创建索引
			const index = createCompressedDataIndex(chunk.p, 'report', 'snapshot')
			
		// 提取所有数据点
		const metricNames = Array.from(index.metricToIndices.keys()) as string[]
		const points: AggregatedPoint[] = []
		for (const metricName of metricNames) {
			const metricPoints = getPointsFromIndex(index, metricName)
			// 使用 for 循环逐个添加，避免大数据量时 spread operator 导致调用栈溢出
			for (const point of metricPoints) {
				points.push(point)
			}
		}
			
			console.log(`[CaseCharts] 解压完成: ${points.length} 个数据点`)
			return points
		} catch (err) {
			console.error('[CaseCharts] 解压数据失败:', err)
			return []
		}
	}, [chunk?.p])
	
	// 汇总表格数据
	const summaryTables: SummaryTable[] = useMemo(() => {
		return chunk?.t || []
	}, [chunk?.t])
	
	// 建立按指标名称和聚合类型的索引
	const pointsByMetric = useMemo(() => {
		const index = new Map<string, AggregatedPoint[]>()
		
		if (!allPoints || !Array.isArray(allPoints)) {
			return index
		}
		
		for (const point of allPoints) {
			const key = `${point.name}|${point.aggregation_type}`
			if (!index.has(key)) {
				index.set(key, [])
			}
			index.get(key)!.push(point)
		}
		
		return index
	}, [allPoints])
	
	// 将 groupmap 展平为按分组排序的指标列表，并添加未配置的指标到 default 组
	const sortedMetrics = useMemo(() => {
		// 1. 收集 groupmap 中配置的指标
		const configuredMetrics = new Set<string>()
		const metrics: Array<{
			groupName: string
			metricConfig: MetricConfig
			isDefault?: boolean
		}> = []
		
		if (groupmap && Object.keys(groupmap).length > 0) {
			// 根据 groupmapSortKeys 确定分组顺序
			let groupNames: string[]
			if (groupmapSortKeys && groupmapSortKeys.length > 0) {
				// 使用自定义排序：先排已配置的 keys，再排未配置的 keys（字母序）
				const sortedKeys = groupmapSortKeys.filter(key => key in groupmap)
				const unsortedKeys = Object.keys(groupmap).filter(key => !sortedKeys.includes(key)).sort()
				groupNames = [...sortedKeys, ...unsortedKeys]
			} else {
				// 回退到字母排序
				groupNames = Object.keys(groupmap).sort()
			}
			
			groupNames.forEach(groupName => {
				const metricConfigs = groupmap[groupName]
				metricConfigs.forEach(config => {
					configuredMetrics.add(config.name)
					metrics.push({
						groupName,
						metricConfig: config,
						isDefault: false,
					})
				})
			})
		}
		
		// 2. 从索引中找出未配置的指标（default 组）
		const unconfiguredMetrics = new Set<string>()
		for (const key of pointsByMetric.keys()) {
			const metricName = key.split('|')[0]
			if (!configuredMetrics.has(metricName)) {
				unconfiguredMetrics.add(metricName)
			}
		}
		
		// 3. 将未配置的指标添加到 default 组（排在最后）
		Array.from(unconfiguredMetrics).sort().forEach(metricName => {
			metrics.push({
				groupName: 'default',
				metricConfig: {
					name: metricName,
					// 不设置 alias、unit、transform 等
				},
				isDefault: true,
			})
		})
		
		return metrics
	}, [groupmap, pointsByMetric])
	
	// 🔥 性能优化：预计算每个指标的分组结果和可用标签
	// 这个 useMemo 不依赖 metricLabelSelections，所以筛选变化时不会重新计算
	const preGroupedMetrics = useMemo(() => {
		const result = new Map<string, {
			allSeries: Map<string, import('@/apis/points').AggregatedPoint[]>
			availableLabels: Record<string, string[]>
		}>()
		
		sortedMetrics.forEach(({ metricConfig }) => {
			const metricName = metricConfig.name
			// 对于每个聚合类型都预计算
			AGGREGATION_TYPES.forEach(aggType => {
				const key = `${metricName}|${aggType}`
				const metricPoints = pointsByMetric.get(key) || []
				
				if (metricPoints.length > 0) {
					const availableLabels = extractAvailableLabels(metricPoints)
					const allSeries = groupByTimeSeries(metricPoints)
					result.set(key, { allSeries, availableLabels })
				}
			})
		})
		
		return result
	}, [sortedMetrics, pointsByMetric]) // 注意：不依赖 metricLabelSelections!
	
	// 为每个指标计算图表数据（基于预计算的分组结果）
	const allMetricsData = useMemo(() => {
		const result = sortedMetrics.map(({ metricConfig, groupName, isDefault }) => {
			const metricName = metricConfig.name
			const selectedAggType = metricAggregationTypes[metricName] || 'avg'
			const key = `${metricName}|${selectedAggType}`
			
			// 从预计算结果获取
			const preGrouped = preGroupedMetrics.get(key)
			if (!preGrouped) {
				return {
					metricConfig,
					groupName,
					isDefault,
					chartData: [],
					dataPoints: [],
					availableLabels: {},
					selectedLabels: {},
					seriesCount: 0,
					truncatedCount: 0,
				}
			}
			
			const { allSeries, availableLabels } = preGrouped
			const selectedLabels = metricLabelSelections[metricName] || {}
			
			// 🔥 快速过滤：直接从预分组的 Map 中过滤 seriesKey
			let filteredSeries: Map<string, import('@/apis/points').AggregatedPoint[]>
			
			if (Object.keys(selectedLabels).length === 0) {
				// 没有筛选，直接使用全部
				filteredSeries = allSeries
			} else {
				// 有筛选，从 seriesKey 中匹配
				filteredSeries = new Map()
				for (const [seriesKey, points] of allSeries) {
					// 检查 seriesKey 是否匹配所有选中的标签
					let matches = true
					for (const [labelKey, selectedValues] of Object.entries(selectedLabels)) {
						if (selectedValues.length === 0) continue
						// 从 seriesKey 中提取标签值
						const labelPattern = `${labelKey}=`
						const labelPart = seriesKey.split('|')[2] || ''
						const labelValue = labelPart.split(',')
							.find(part => part.startsWith(labelPattern))
							?.substring(labelPattern.length)
						
						if (!labelValue || !selectedValues.includes(labelValue)) {
							matches = false
							break
						}
					}
				if (matches) {
					filteredSeries.set(seriesKey, points)
				}
			}
		}
			
			// 🔥 性能优化: 在数据层面限制序列数量，避免后续大量计算
			const MAX_SERIES_PER_METRIC = 30
			const seriesKeys = Array.from(filteredSeries.keys())
			const truncatedSeriesCount = Math.max(0, seriesKeys.length - MAX_SERIES_PER_METRIC)
			const limitedSeriesKeys = seriesKeys.slice(0, MAX_SERIES_PER_METRIC)
			const series = new Map(limitedSeriesKeys.map(key => [key, filteredSeries.get(key)!]))
			
			// 生成图表数据（应用 transform）
			const timeMap = new Map<number, any>()
			series.forEach((points, seriesKey) => {
				points.forEach(point => {
					if (!timeMap.has(point.timestamp)) {
						timeMap.set(point.timestamp, { timestamp: point.timestamp })
					}
					const row = timeMap.get(point.timestamp)!
					// 应用数值转换
					row[seriesKey] = metricConfig.transform 
						? applyTransform(point.value, metricConfig.transform)
						: point.value
				})
			})
			
			const chartData = Array.from(timeMap.values()).sort((a, b) => a.timestamp - b.timestamp)
			
			// 生成数据点配置
			const dataPoints = Array.from(series.keys()).map((seriesKey, index) => {
				const cacheKey = `${seriesKey}-${index}`
				let color = colorCache.get(cacheKey)
				
				if (!color) {
					const baseHues = [0, 45, 210, 270, 180]
					let hash = 0
					for (let i = 0; i < seriesKey.length; i++) {
						hash = ((hash << 5) - hash) + seriesKey.charCodeAt(i)
						hash = hash & hash
					}
					const colorIndex = (Math.abs(hash) + index) % baseHues.length
					const baseHue = baseHues[colorIndex]
					const hueOffset = ((Math.abs(hash) * 7 + index * 13) % 20) - 10
					const hue = (baseHue + hueOffset + 360) % 360
					const saturation = 45 + ((Math.abs(hash) + index * 3) % 16)
					const lightness = 55 + ((Math.abs(hash) * 5 + index * 7) % 11)
					color = `hsl(${hue}, ${saturation}%, ${lightness}%)`
					colorCache.set(cacheKey, color)
				}
				
				// 应用 display_labels 配置（仅影响显示，不影响数据唯一性）
				const labels = formatSeriesLabel(seriesKey, { 
					showMetricName: false,
					displayLabels: metricConfig.display_labels
				})
				return {
					label: labels.truncated,
					fullLabel: labels.full,
					dataKey: seriesKey,
					color,
					fillOpacity: 0.3,
				}
			})
			
			return {
				metricConfig,
				groupName,
				isDefault,
				chartData,
				dataPoints,
				availableLabels,
				selectedLabels: metricLabelSelections[metricName] || {},
				seriesCount: filteredSeries.size, // 筛选后的序列总数
				truncatedCount: truncatedSeriesCount, // 被截断的数量
			}
		})
		
		return result
	}, [sortedMetrics, preGroupedMetrics, metricAggregationTypes, metricLabelSelections])
	
	// 分离有数据和没数据的指标
	const { metricsData, metricsWithoutData } = useMemo(() => {
		const withData: typeof allMetricsData = []
		const withoutData: typeof allMetricsData = []
		
		allMetricsData.forEach(metric => {
			if (metric.chartData.length > 0) {
				withData.push(metric)
			} else {
				withoutData.push(metric)
			}
		})
		
		return { metricsData: withData, metricsWithoutData: withoutData }
	}, [allMetricsData])
	
	// 计算时间范围
	const timeRange = useMemo(() => {
		if (!allPoints || allPoints.length === 0) {
			return { start: 0, end: 0 }
		}
		
		let minTime = allPoints[0].timestamp
		let maxTime = allPoints[0].timestamp
		
		for (let i = 1; i < allPoints.length; i++) {
			const timestamp = allPoints[i].timestamp
			if (timestamp < minTime) minTime = timestamp
			if (timestamp > maxTime) maxTime = timestamp
		}
		
		return { start: minTime, end: maxTime }
	}, [allPoints])
	
	// 无数据状态
	if (allPoints.length === 0) {
		return (
			<div className="flex items-center justify-center h-48 text-muted-foreground">
				暂无图表数据
			</div>
		)
	}
	
	return (
		<div className="space-y-6">
			{/* Rate 统计展示 - 如果有配置 rate_metrics */}
			{caseInfo.rate_statistics && (
				<CaseRateStatistics rateStatistics={caseInfo.rate_statistics} />
			)}

			{/* 汇总表格 */}
			{summaryTables.length > 0 && (
				<SummaryTablesCard tables={summaryTables} variant="flat" layout={tableLayout} />
			)}
			
			{/* 使用通用的指标图表网格组件 */}
			<MetricChartsGrid
				metricsData={metricsData}
				timeRange={timeRange}
				legendVisible={legendVisible}
				gridCols={gridCols}
				legendPosition={legendPosition}
				metricAggregationTypes={metricAggregationTypes}
				onAggregationTypeChange={(metricName, aggType) => {
					setMetricAggregationTypes(prev => ({
						...prev,
						[metricName]: aggType,
					}))
				}}
		onLabelSelectionChange={(metricName, selection) => {
			// 🚀 使用 startTransition 将筛选变更标记为低优先级，避免阻塞UI
			startTransition(() => {
				setMetricLabelSelections(prev => ({
					...prev,
					[metricName]: selection,
				}))
			})
		}}
			/>
			
			{/* 没有数据的指标提示 */}
			{metricsWithoutData.length > 0 && (
				<Card className="border-dashed">
					<CardHeader className="pb-3">
						<div className="flex items-center gap-2">
							<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									className="text-muted-foreground"
								>
									<circle cx="12" cy="12" r="10" />
									<line x1="12" y1="16" x2="12" y2="12" />
									<line x1="12" y1="8" x2="12.01" y2="8" />
								</svg>
							</div>
							<div className="flex-1">
								<CardTitle className="text-base">暂无监控数据的指标</CardTitle>
								<CardDescription className="text-xs mt-0.5">
									以下 {metricsWithoutData.length} 个指标已配置，但当前快照中没有数据
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent className="pt-0">
						<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
							{metricsWithoutData.map((metric) => {
								const displayName = metric.metricConfig.alias || metric.metricConfig.name
								const hasAlias = !!metric.metricConfig.alias
								
								return (
									<div
										key={`${metric.groupName}-${metric.metricConfig.name}`}
										className="flex items-start gap-2 rounded-lg border bg-card p-3 text-sm"
									>
										<div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
											<div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
										</div>
										<div className="flex-1 min-w-0">
											<div className="font-medium truncate">
												{hasAlias ? (
													<span className="cursor-help" title={metric.metricConfig.name}>
														{displayName}
													</span>
												) : (
													displayName
												)}
											</div>
											{metric.metricConfig.description && (
												<div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
													{metric.metricConfig.description}
												</div>
											)}
											{!metric.isDefault && (
												<div className="text-xs text-muted-foreground mt-1">
													分组：{metric.groupName}
												</div>
											)}
										</div>
									</div>
								)
							})}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	)
})

export default CaseCharts

