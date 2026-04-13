/**
 * CaseRateStatistics - 用例 Rate 统计展示组件
 * 
 * 功能：
 * 1. 展示指定指标的频率统计（每分钟出现次数）
 * 2. 支持多个指标的 rate 展示
 * 3. 显示总数据点数和统计时长
 */

import { memo } from 'react'
import { ActivityIcon, ClockIcon, HashIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CaseRateStatistics as CaseRateStatisticsType } from '@/apis/report'

// ============================================
// 类型定义
// ============================================

export interface CaseRateStatisticsProps {
	/** Rate 统计数据 */
	rateStatistics?: CaseRateStatisticsType | null
	/** 自定义类名 */
	className?: string
}

// ============================================
// 工具函数
// ============================================

/** 格式化 rate 值 */
function formatRate(rate: number): string {
	if (rate >= 10000) {
		return `${(rate / 1000).toFixed(1)}k`
	}
	if (rate >= 1000) {
		return rate.toFixed(0)
	}
	if (rate >= 100) {
		return rate.toFixed(1)
	}
	if (rate >= 10) {
		return rate.toFixed(2)
	}
	return rate.toFixed(3)
}

/** 格式化大数字（总数） */
function formatCount(count: number): string {
	if (count >= 1000000) {
		return `${(count / 1000000).toFixed(2)}M`
	}
	if (count >= 1000) {
		return `${(count / 1000).toFixed(1)}k`
	}
	return count.toString()
}

/** 格式化时长 */
function formatDuration(minutes: number): string {
	if (minutes >= 60) {
		const hours = Math.floor(minutes / 60)
		const remainingMinutes = Math.round(minutes % 60)
		if (remainingMinutes === 0) {
			return `${hours}小时`
		}
		return `${hours}小时${remainingMinutes}分钟`
	}
	return `${minutes.toFixed(1)}分钟`
}

// ============================================
// 主组件
// ============================================

export const CaseRateStatistics = memo(function CaseRateStatistics({
	rateStatistics,
	className,
}: CaseRateStatisticsProps) {
	// 如果没有数据，不渲染
	if (!rateStatistics || !rateStatistics.statistics || rateStatistics.statistics.length === 0) {
		return null
	}

	const { statistics } = rateStatistics
	// 获取统计时长（所有指标的时长相同）
	const durationMinutes = statistics[0]?.duration_minutes || 0

	return (
		<div className={cn("bg-sky-50/50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-800 rounded-lg", className)}>
			{/* 标题栏 */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-sky-200 dark:border-sky-800">
				<div className="flex items-center gap-2">
					<ActivityIcon className="size-4 text-sky-600 dark:text-sky-400" />
					<span className="font-medium text-foreground">频率统计 (Rate)</span>
				</div>
				{durationMinutes > 0 && (
					<div className="flex items-center gap-1 text-xs text-muted-foreground">
						<ClockIcon className="size-3.5" />
						<span>统计时长: {formatDuration(durationMinutes)}</span>
					</div>
				)}
			</div>

			{/* 统计卡片网格 */}
			<div className="p-4">
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
					{statistics.map((stat, index) => (
						<div
							key={`${stat.metric_name}-${index}`}
							className="bg-white dark:bg-slate-900 rounded-lg border border-sky-100 dark:border-sky-900 p-3 hover:shadow-sm transition-shadow"
						>
							{/* 指标名称 */}
							<div className="text-sm font-medium text-muted-foreground mb-2 truncate" title={stat.metric_name}>
								{stat.metric_name}
							</div>
							
							{/* Rate 值 - 突出显示 */}
							<div className="flex items-baseline gap-1.5 mb-2">
								<span className="text-2xl font-bold text-sky-600 dark:text-sky-400">
									{formatRate(stat.rate)}
								</span>
								<span className="text-sm text-muted-foreground">/分钟</span>
							</div>
							
							{/* 总数 */}
							<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
								<HashIcon className="size-3.5" />
								<span>总计: {formatCount(stat.total_count)} 次</span>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	)
})

export default CaseRateStatistics
