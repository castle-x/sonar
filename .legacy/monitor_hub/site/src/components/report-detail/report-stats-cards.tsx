/**
 * ReportStatsCards - 报告统计卡片组件
 * 
 * 展示报告的关键统计指标，包括：
 * - 用例总数
 * - 总数据点数量
 * - 指标覆盖度
 */

import { memo, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { 
	FlaskConicalIcon, 
	DatabaseIcon, 
	ActivityIcon,
	TrendingUpIcon,
	TrendingDownIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReportRecord, ChunkDataWithInfo } from '@/apis/report'
import { getCompressedDataStats, type CompressedPointsResponse } from '@/apis/points-compressed'

// ============================================
// 类型定义
// ============================================

export interface ReportStatsCardsProps {
	/** 报告数据 */
	report: ReportRecord
	/** 所有 chunk 数据（用于计算数据点总数） */
	chunks: (ChunkDataWithInfo | null)[]
	/** 自定义类名 */
	className?: string
}

interface StatCardData {
	title: string
	value: string | number
	trend?: {
		value: string
		direction: 'up' | 'down' | 'neutral'
	}
	description: string
	icon: React.ReactNode
	iconColor: string
}

// ============================================
// 辅助函数
// ============================================

/**
 * 格式化大数字（如：1,234 或 1.2万）
 */
function formatLargeNumber(num: number): string {
	if (num >= 10000) {
		return `${(num / 10000).toFixed(1)}万`
	}
	return num.toLocaleString('zh-CN')
}

/**
 * 计算所有指标名称（去重）
 */
function getUniqueMetricNames(chunks: (ChunkDataWithInfo | null)[]): Set<string> {
	const metricNames = new Set<string>()
	
	for (const chunk of chunks) {
		if (!chunk?.p) continue
		
		// 从压缩数据中提取指标名称
		const compressed = chunk.p as CompressedPointsResponse
		if (!compressed?.k || !Array.isArray(compressed.k)) continue
		
		// K 数组中每2个元素一组，第一个是指标名称
		for (let i = 0; i < compressed.k.length; i += 2) {
			const metricName = compressed.k[i]
			if (metricName) {
				metricNames.add(metricName)
			}
		}
	}
	
	return metricNames
}

// ============================================
// 主组件
// ============================================

export const ReportStatsCards = memo(function ReportStatsCards({
	report,
	chunks,
	className,
}: ReportStatsCardsProps) {
	// 计算统计数据
	const stats = useMemo((): StatCardData[] => {
		// 1. 用例总数
		const caseCount = report.cases?.length || 0
		
		// 2. 总数据点数量
		const totalDataPoints = chunks.reduce((sum, chunk) => {
			return sum + (chunk?.point_count || 0)
		}, 0)
		
		// 3. 指标覆盖度（不同指标类型的数量）
		const uniqueMetrics = getUniqueMetricNames(chunks)
		const metricCount = uniqueMetrics.size
		
		return [
			{
				title: '用例总数',
				value: caseCount,
				description: `共包含 ${caseCount} 个测试用例`,
				icon: <FlaskConicalIcon className="h-5 w-5" />,
				iconColor: 'text-blue-500',
			},
			{
				title: '总数据点数量',
				value: formatLargeNumber(totalDataPoints),
				description: `采集了 ${formatLargeNumber(totalDataPoints)} 个监控数据点`,
				icon: <DatabaseIcon className="h-5 w-5" />,
				iconColor: 'text-green-500',
			},
			{
				title: '指标覆盖度',
				value: metricCount,
				description: `监控 ${metricCount} 种关键指标`,
				icon: <ActivityIcon className="h-5 w-5" />,
				iconColor: 'text-purple-500',
			},
		]
	}, [report, chunks])
	
	return (
		<div className={cn('grid grid-cols-1 md:grid-cols-3 gap-4', className)}>
			{stats.map((stat, index) => (
				<StatCard key={index} data={stat} />
			))}
		</div>
	)
})

// ============================================
// 子组件
// ============================================

/**
 * 单个统计卡片
 */
function StatCard({ data }: { data: StatCardData }) {
	return (
		<Card className="overflow-hidden">
			<CardContent className="p-6">
				{/* 顶部：标题和趋势 */}
				<div className="flex items-center justify-between mb-3">
					<span className="text-sm font-medium text-muted-foreground">
						{data.title}
					</span>
					{data.trend && (
						<div className={cn(
							'flex items-center gap-1 text-xs font-medium',
							data.trend.direction === 'up' && 'text-green-500',
							data.trend.direction === 'down' && 'text-red-500',
							data.trend.direction === 'neutral' && 'text-gray-500',
						)}>
							{data.trend.direction === 'up' ? (
								<TrendingUpIcon className="h-3 w-3" />
							) : data.trend.direction === 'down' ? (
								<TrendingDownIcon className="h-3 w-3" />
							) : null}
							{data.trend.value}
						</div>
					)}
				</div>
				
				{/* 中间：数值和图标 */}
				<div className="flex items-center justify-between mb-3">
					<div className="text-3xl font-bold">
						{data.value}
					</div>
					<div className={cn(
						'flex items-center justify-center w-12 h-12 rounded-full bg-muted',
						data.iconColor
					)}>
						{data.icon}
					</div>
				</div>
				
				{/* 底部：描述 */}
				<p className="text-xs text-muted-foreground">
					{data.description}
				</p>
			</CardContent>
		</Card>
	)
}

