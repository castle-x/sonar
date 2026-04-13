/**
 * CaseOverviewCard - 用例概览与智能分析卡片
 * 
 * 预留区域，用于展示：
 * - 用例对比摘要
 * - AI 智能分析结果（流式输出效果）
 */

import { memo, useState, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

/** 渐变色星星图标 - 与按钮图标完全一致 */
const GradientSparklesIcon = ({ className }: { className?: string }) => (
	<svg className={className} viewBox="0 0 24 24" fill="none">
		<defs>
			<linearGradient id="card-icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
				<stop offset="0%" stopColor="#60a5fa" />
				<stop offset="50%" stopColor="#c084fc" />
				<stop offset="100%" stopColor="#f472b6" />
			</linearGradient>
		</defs>
		<path 
			d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"
			stroke="url(#card-icon-gradient)"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			fill="none"
		/>
		<path 
			d="M20 3v4M22 5h-4M4 17v2M5 18H3"
			stroke="url(#card-icon-gradient)"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	</svg>
)

// 模拟 AI 分析的 Markdown 文本（测试数据）
const SAMPLE_AI_ANALYSIS = `
> AI 智能分析功能正在开发中 ...

该功能将为您提供：
- 📊 性能数据智能分析
- 🎯 问题根因自动诊断  
- 💡 优化建议智能推荐
- 📈 趋势预测与风险预警

> 💫 即将上线，敬请期待
`

// 流式文本渲染 Hook
function useStreamingText(
	text: string,
	chunkSize: number = 3,
	speed: number = 30,
	enabled: boolean = true
) {
	const [displayedText, setDisplayedText] = useState('')
	const [isComplete, setIsComplete] = useState(false)
	const [currentIndex, setCurrentIndex] = useState(0)

	const reset = useCallback(() => {
		setDisplayedText('')
		setCurrentIndex(0)
		setIsComplete(false)
	}, [])

	useEffect(() => {
		if (!enabled) {
			// 如果禁用，直接显示全部
			setDisplayedText(text)
			setIsComplete(true)
			return
		}
		reset()
	}, [text, enabled, reset])

	useEffect(() => {
		if (!enabled) return
		
		if (currentIndex >= text.length) {
			setIsComplete(true)
			return
		}

		const timer = setTimeout(() => {
			const nextIndex = Math.min(currentIndex + chunkSize, text.length)
			setDisplayedText(text.slice(0, nextIndex))
			setCurrentIndex(nextIndex)
		}, speed)

		return () => clearTimeout(timer)
	}, [currentIndex, text, chunkSize, speed, enabled])

	const progress = text.length > 0 ? (currentIndex / text.length) * 100 : 0

	return { displayedText, isComplete, reset, progress }
}

export interface CaseOverviewCardProps {
	/** 用例数量 */
	caseCount?: number
	/** 自定义类名 */
	className?: string
	/** 是否可见（用于触发流式动画） */
	isVisible?: boolean
	/** AI 分析文本（可选，默认使用测试数据） */
	analysisText?: string
	/** 流式输出完成回调 */
	onStreamComplete?: () => void
	/** 导出模式 - 禁用动画 */
	isExportMode?: boolean
}

export const CaseOverviewCard = memo(function CaseOverviewCard({
	caseCount = 0,
	className,
	isVisible = true,
	analysisText = SAMPLE_AI_ANALYSIS,
	onStreamComplete,
	isExportMode = false,
}: CaseOverviewCardProps) {
	// 导出模式下直接显示完整内容，不使用流式渲染
	const { displayedText, isComplete, progress } = useStreamingText(
		analysisText,
		isExportMode ? analysisText.length : 3,  // 导出模式下一次显示全部
		isExportMode ? 0 : 30, // 导出模式下无延迟
		!isExportMode && isVisible // 导出模式下禁用流式动画，直接显示全部
	)
	
	// 导出模式下立即通知父组件完成
	useEffect(() => {
		if (isExportMode && onStreamComplete) {
			// 导出模式下，组件挂载后立即标记完成
			const timer = setTimeout(() => {
				onStreamComplete()
			}, 100)
			return () => clearTimeout(timer)
		}
	}, [isExportMode, onStreamComplete])
	
	// 流式输出完成时通知父组件
	useEffect(() => {
		if (!isExportMode && isComplete && onStreamComplete) {
			onStreamComplete()
		}
	}, [isComplete, onStreamComplete, isExportMode])

	return (
		<div className={cn("ai-rainbow-card active overflow-hidden", className)}>
			<div className="p-4 flex flex-col">
				{/* 标题栏 */}
				<div className="flex items-center justify-between mb-3">
					<div className="flex items-center gap-2">
						<GradientSparklesIcon className="size-5" />
						<span className="font-medium text-foreground">智能分析</span>
						{caseCount > 0 && (
							<span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
								{caseCount} 个用例
							</span>
						)}
					</div>
					{/* 进度指示 */}
					{!isComplete && (
						<span className="text-xs text-muted-foreground">
							生成中 {progress.toFixed(0)}%
						</span>
					)}
				</div>

				{/* 内容区域 - 流式 Markdown 渲染 */}
				<div className="flex-1 overflow-y-auto">
					<div 
						className="rich-text-content text-sm" 
						data-ai-content
						data-ai-complete={isComplete ? "true" : "false"}
					>
						<ReactMarkdown remarkPlugins={[remarkGfm]}>
							{displayedText}
						</ReactMarkdown>
						{/* 打字光标 */}
						{!isComplete && (
							<span className="inline-block w-2 h-4 bg-primary/60 animate-pulse ml-0.5 align-middle" />
						)}
					</div>
				</div>
			</div>
		</div>
	)
})

export default CaseOverviewCard

