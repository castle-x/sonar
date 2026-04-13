/**
 * ReportScoreDetailDialog - 报告评分详情弹窗
 * 
 * 简化版本：只展示报告总评和计算公式
 * 详细的指标评分信息已集成到数据总览表格中
 */

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Calculator } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ReportScore } from "@/apis/report"

// ============================================
// 类型定义
// ============================================

interface ReportScoreDetailDialogProps {
	score: ReportScore
	open: boolean
	onOpenChange: (open: boolean) => void
}

// ============================================
// 辅助函数
// ============================================

const LEVEL_COLORS = {
	excellent: "bg-green-500",
	good: "bg-blue-500",
	normal: "bg-yellow-500",
	warning: "bg-orange-500",
	danger: "bg-red-500",
} as const

const LEVEL_LABELS = {
	excellent: "低风险",
	good: "中低风险",
	normal: "中风险",
	warning: "中高风险",
	danger: "高风险",
} as const

const LEVEL_EMOJIS = {
	excellent: "🟢",
	good: "🔵",
	normal: "🟡",
	warning: "🟠",
	danger: "🔴",
} as const

function getLevelColor(level: string) {
	return LEVEL_COLORS[level as keyof typeof LEVEL_COLORS] || LEVEL_COLORS.normal
}

function getLevelLabel(level: string) {
	return LEVEL_LABELS[level as keyof typeof LEVEL_LABELS] || level
}

function getLevelEmoji(level: string) {
	return LEVEL_EMOJIS[level as keyof typeof LEVEL_EMOJIS] || "📊"
}

// ============================================
// 主组件
// ============================================

export function ReportScoreDetailDialog({ 
	score, 
	open, 
	onOpenChange 
}: ReportScoreDetailDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				
				
				<div className="space-y-4">
					{/* 报告总评 */}
					<Card className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950">
						<CardContent className="py-4">
							<div className="flex items-center justify-between">
								<div className="space-y-1">
									<h4 className="font-semibold text-lg">评分详情</h4>
									<p className="text-sm text-muted-foreground">
										共 {score.case_scores.length} 个用例，
										{score.case_scores.reduce((sum, c) => sum + c.metric_scores.length, 0)} 个指标参与评分，满分100
									</p>
									<p className="text-xs text-muted-foreground">
										评估时间：{new Date(score.evaluated_at).toLocaleString('zh-CN')}
									</p>
								</div>
								<div className="text-right">
									<div className="text-5xl font-bold">{score.total_score.toFixed(1)}</div>
									<Badge className={cn("mt-2 text-sm px-3 py-1", getLevelColor(score.level))}>
										{getLevelEmoji(score.level)} {getLevelLabel(score.level)}
									</Badge>
								</div>
							</div>
						</CardContent>
					</Card>
					
					{/* 评分公式说明 */}
					<Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200">
						<AlertDescription className="text-sm">
							<strong>计算公式：</strong> 报告总分 = Σ(用例得分 × 用例权重)，用例得分 = Σ(指标得分 × 指标权重)
						</AlertDescription>
					</Alert>
					
					{/* 提示信息 */}
					<p className="text-xs text-muted-foreground text-center">
						💡 详细的指标评分信息请查看下方「数据总览」表格中的标记
					</p>
				</div>
			</DialogContent>
		</Dialog>
	)
}
