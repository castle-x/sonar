/**
 * Demo Page 1 - 测试页面 1
 * 
 * 用于测试搜索功能和路由系统
 */

import { memo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Rocket, Sparkles, TrendingUp } from 'lucide-react'

export default memo(function DemoPage1() {
	return (
		<div className="space-y-6">
			{/* 页面标题 */}
			<div className="flex items-center gap-3">
				<Rocket className="size-8 text-emerald-600" />
				<div>
					<h1 className="text-3xl font-bold">测试页面 1 - 数据分析</h1>
					<p className="text-muted-foreground mt-1">这是一个用于测试搜索功能的演示页面</p>
				</div>
			</div>

			{/* 功能卡片区域 */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				{/* 卡片 1 */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Sparkles className="size-5 text-emerald-600" />
							实时监控
						</CardTitle>
						<CardDescription>
							查看系统实时性能指标
						</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground mb-4">
							监控 CPU、内存、网络等关键指标，实时了解系统运行状态。
						</p>
						<Button variant="outline" size="sm">
							查看详情
						</Button>
					</CardContent>
				</Card>

				{/* 卡片 2 */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<TrendingUp className="size-5 text-blue-600" />
							趋势分析
						</CardTitle>
						<CardDescription>
							分析历史数据趋势
						</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground mb-4">
							通过历史数据分析，预测系统未来的运行趋势。
						</p>
						<Button variant="outline" size="sm">
							查看详情
						</Button>
					</CardContent>
				</Card>

				{/* 卡片 3 */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Rocket className="size-5 text-purple-600" />
							性能优化
						</CardTitle>
						<CardDescription>
							获取性能优化建议
						</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground mb-4">
							基于 AI 分析，为您提供针对性的性能优化建议。
						</p>
						<Button variant="outline" size="sm">
							查看详情
						</Button>
					</CardContent>
				</Card>
			</div>

			{/* 演示数据表格 */}
			<Card>
				<CardHeader>
					<CardTitle>演示数据表格</CardTitle>
					<CardDescription>这是一个示例数据表格，展示基础功能</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto">
						<table className="w-full border-collapse">
							<thead className="bg-muted">
								<tr>
									<th className="px-4 py-3 text-left text-sm font-semibold">指标名称</th>
									<th className="px-4 py-3 text-center text-sm font-semibold">当前值</th>
									<th className="px-4 py-3 text-center text-sm font-semibold">平均值</th>
									<th className="px-4 py-3 text-center text-sm font-semibold">状态</th>
								</tr>
							</thead>
							<tbody>
								<tr className="border-b hover:bg-muted/50">
									<td className="px-4 py-3 text-sm">CPU 使用率</td>
									<td className="px-4 py-3 text-sm text-center">45%</td>
									<td className="px-4 py-3 text-sm text-center">38%</td>
									<td className="px-4 py-3 text-sm text-center">
										<span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">正常</span>
									</td>
								</tr>
								<tr className="border-b hover:bg-muted/50">
									<td className="px-4 py-3 text-sm">内存使用率</td>
									<td className="px-4 py-3 text-sm text-center">62%</td>
									<td className="px-4 py-3 text-sm text-center">55%</td>
									<td className="px-4 py-3 text-sm text-center">
										<span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">正常</span>
									</td>
								</tr>
								<tr className="border-b hover:bg-muted/50">
									<td className="px-4 py-3 text-sm">磁盘使用率</td>
									<td className="px-4 py-3 text-sm text-center">78%</td>
									<td className="px-4 py-3 text-sm text-center">70%</td>
									<td className="px-4 py-3 text-sm text-center">
										<span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">警告</span>
									</td>
								</tr>
								<tr className="hover:bg-muted/50">
									<td className="px-4 py-3 text-sm">网络带宽</td>
									<td className="px-4 py-3 text-sm text-center">120 Mbps</td>
									<td className="px-4 py-3 text-sm text-center">95 Mbps</td>
									<td className="px-4 py-3 text-sm text-center">
										<span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">正常</span>
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				</CardContent>
			</Card>
		</div>
	)
})

