/**
 * ============================================
 * 组件测试页面
 * ============================================
 * 
 * 用于测试和调试各种 UI 组件
 * - 标签筛选器测试
 * - 分页组件测试
 * - 报告详情测试
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import { LabelSelector } from '@/components/charts/label-selector'
import { LabelSelectorButton } from '@/components/charts/label-selector-button'
import {
	extractAvailableLabels,
	filterPointsByLabels,
	groupByTimeSeries,
	formatSeriesLabel,
} from '@/components/charts/label-utils'
import type { AggregatedPoint } from '@/apis/points'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Pagination } from '@/components/ui/pagination'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ReportDetailCard } from '@/components/report-detail/report-detail-card'
import { DescriptionCard } from '@/components/report-detail/description-card'
import { ReportChartsCard } from '@/components/report-detail/report-charts-card'
import { getReport, type ReportRecord } from '@/apis/report'
import { PageLoading } from '@/components/loading'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { RichTextEditor } from '@/components/ui/rich-text-editor'

// ============================================
// 模拟数据
// ============================================

const MOCK_DATA: AggregatedPoint[] = [
	// 服务器 1 的进程数据
	{
		datasource_id: 'ds-001',
		name: 'cpu_percent',
		labels: { ip: '192.168.1.1', pid: '12', process: 'nginx', host: 'server-01' },
		level: '15s',
		timestamp: 1699999999000,
		date: '2023-11-15 15:46:39',
		aggregation_type: 'avg',
		value: 45.2,
		quality: { status: 'complete', score: 100, actual_points: 1, expected_points: 1 },
	},
	{
		datasource_id: 'ds-001',
		name: 'cpu_percent',
		labels: { ip: '192.168.1.1', pid: '123', process: 'mysql', host: 'server-01' },
		level: '15s',
		timestamp: 1699999999000,
		date: '2023-11-15 15:46:39',
		aggregation_type: 'avg',
		value: 68.5,
		quality: { status: 'complete', score: 100, actual_points: 1, expected_points: 1 },
	},
	{
		datasource_id: 'ds-001',
		name: 'mem_percent',
		labels: { ip: '192.168.1.1', pid: '12', process: 'nginx', host: 'server-01' },
		level: '15s',
		timestamp: 1699999999000,
		date: '2023-11-15 15:46:39',
		aggregation_type: 'avg',
		value: 25.8,
		quality: { status: 'complete', score: 100, actual_points: 1, expected_points: 1 },
	},
	{
		datasource_id: 'ds-001',
		name: 'mem_percent',
		labels: { ip: '192.168.1.1', pid: '123', process: 'mysql', host: 'server-01' },
		level: '15s',
		timestamp: 1699999999000,
		date: '2023-11-15 15:46:39',
		aggregation_type: 'avg',
		value: 42.1,
		quality: { status: 'complete', score: 100, actual_points: 1, expected_points: 1 },
	},
	// 服务器 2 的进程数据
	{
		datasource_id: 'ds-001',
		name: 'cpu_percent',
		labels: { ip: '192.168.1.2', pid: '234', process: 'nginx', host: 'server-02' },
		level: '15s',
		timestamp: 1699999999000,
		date: '2023-11-15 15:46:39',
		aggregation_type: 'avg',
		value: 52.3,
		quality: { status: 'complete', score: 100, actual_points: 1, expected_points: 1 },
	},
	{
		datasource_id: 'ds-001',
		name: 'cpu_percent',
		labels: { ip: '192.168.1.2', pid: '456', process: 'redis', host: 'server-02' },
		level: '15s',
		timestamp: 1699999999000,
		date: '2023-11-15 15:46:39',
		aggregation_type: 'avg',
		value: 18.7,
		quality: { status: 'complete', score: 100, actual_points: 1, expected_points: 1 },
	},
	{
		datasource_id: 'ds-001',
		name: 'mem_percent',
		labels: { ip: '192.168.1.2', pid: '234', process: 'nginx', host: 'server-02' },
		level: '15s',
		timestamp: 1699999999000,
		date: '2023-11-15 15:46:39',
		aggregation_type: 'avg',
		value: 28.4,
		quality: { status: 'complete', score: 100, actual_points: 1, expected_points: 1 },
	},
	{
		datasource_id: 'ds-001',
		name: 'mem_percent',
		labels: { ip: '192.168.1.2', pid: '456', process: 'redis', host: 'server-02' },
		level: '15s',
		timestamp: 1699999999000,
		date: '2023-11-15 15:46:39',
		aggregation_type: 'avg',
		value: 15.2,
		quality: { status: 'complete', score: 100, actual_points: 1, expected_points: 1 },
	},
	// 服务器 3 的进程数据
	{
		datasource_id: 'ds-001',
		name: 'cpu_percent',
		labels: { ip: '192.168.1.3', pid: '789', process: 'kafka', host: 'server-03' },
		level: '15s',
		timestamp: 1699999999000,
		date: '2023-11-15 15:46:39',
		aggregation_type: 'avg',
		value: 75.1,
		quality: { status: 'complete', score: 100, actual_points: 1, expected_points: 1 },
	},
]

// ============================================
// 组件实现
// ============================================

function LabelSelectorTestContent() {
	const [selectedMetric, setSelectedMetric] = useState<string>('cpu_percent')
	const [selectedLabels, setSelectedLabels] = useState<Record<string, string[] | undefined>>({})
	
	// 按指标筛选数据
	const metricData = useMemo(() => 
		MOCK_DATA.filter(p => p.name === selectedMetric),
		[selectedMetric]
	)
	
	// 提取可用标签
	const availableLabels = useMemo(() => 
		extractAvailableLabels(metricData),
		[metricData]
	)
	
	// 筛选后的数据
	const filteredData = useMemo(() => 
		filterPointsByLabels(metricData, selectedLabels),
		[metricData, selectedLabels]
	)
	
	// 按时间序列分组
	const series = useMemo(() => 
		groupByTimeSeries(filteredData),
		[filteredData]
	)
	
	// 统计信息
	const stats = useMemo(() => ({
		totalPoints: metricData.length,
		filteredPoints: filteredData.length,
		seriesCount: series.size,
		labelKeys: Object.keys(availableLabels).length,
		selectedLabelCount: Object.values(selectedLabels).reduce(
			(sum, arr) => sum + (arr?.length || 0), 
			0
		),
	}), [metricData, filteredData, series, availableLabels, selectedLabels])
	
	// 获取所有唯一的指标名称
	const uniqueMetrics = useMemo(() => 
		Array.from(new Set(MOCK_DATA.map(p => p.name))),
		[]
	)
	
	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold">标签筛选器测试</h1>
				<p className="text-muted-foreground mt-2">
					测试标签筛选器的功能，包括多选、清空、实时反馈等
				</p>
			</div>
			
			<Separator />
			
			{/* 指标选择 */}
			<Card>
				<CardHeader>
					<CardTitle>选择指标</CardTitle>
					<CardDescription>切换不同的指标查看标签筛选效果</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex gap-2">
						{uniqueMetrics.map(metric => (
							<button
								key={metric}
								onClick={() => {
									setSelectedMetric(metric)
									setSelectedLabels({})  // 切换指标时清空筛选
								}}
								className={`px-4 py-2 rounded border transition-all ${
									selectedMetric === metric
										? 'bg-primary text-primary-foreground border-primary'
										: 'bg-background hover:bg-muted'
								}`}
							>
								{metric}
							</button>
						))}
					</div>
				</CardContent>
			</Card>
			
			{/* 统计信息 */}
			<Card>
				<CardHeader>
					<CardTitle>数据统计</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-2 md:grid-cols-5 gap-4">
						<div className="space-y-1">
							<div className="text-sm text-muted-foreground">总数据点</div>
							<div className="text-2xl font-bold">{stats.totalPoints}</div>
						</div>
						<div className="space-y-1">
							<div className="text-sm text-muted-foreground">筛选后</div>
							<div className="text-2xl font-bold text-primary">{stats.filteredPoints}</div>
						</div>
						<div className="space-y-1">
							<div className="text-sm text-muted-foreground">序列数</div>
							<div className="text-2xl font-bold text-green-600">{stats.seriesCount}</div>
						</div>
						<div className="space-y-1">
							<div className="text-sm text-muted-foreground">标签键数</div>
							<div className="text-2xl font-bold">{stats.labelKeys}</div>
						</div>
						<div className="space-y-1">
							<div className="text-sm text-muted-foreground">已选标签</div>
							<div className="text-2xl font-bold text-blue-600">{stats.selectedLabelCount}</div>
						</div>
					</div>
				</CardContent>
			</Card>
			
			{/* 按钮式标签筛选器 */}
			<Card>
				<CardHeader>
					<CardTitle>按钮式标签筛选器（推荐用于图表）</CardTitle>
					<CardDescription>
						点击按钮弹出筛选表格，节省页面空间，宽度自适应标签数量
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
						<div className="space-y-1">
							<div className="font-medium">点击按钮测试弹出效果</div>
							<div className="text-sm text-muted-foreground">
								表格宽度会根据标签数量自动调整（最小 600px，最大 1400px）
							</div>
						</div>
						<LabelSelectorButton
							availableLabels={availableLabels}
							selectedLabels={selectedLabels}
							onSelectionChange={setSelectedLabels}
							matchedSeriesCount={series.size}
							buttonText="筛选标签"
						/>
					</div>
					
					<div className="text-sm text-muted-foreground">
						<strong>使用场景：</strong>
						<ul className="list-disc list-inside mt-2 space-y-1">
							<li>指标卡片上方，作为筛选控制器</li>
							<li>图表工具栏，与其他控制按钮并列</li>
							<li>仪表盘页面，节省垂直空间</li>
						</ul>
					</div>
				</CardContent>
			</Card>
			
			{/* 嵌入式标签筛选器 */}
			<Card>
				<CardHeader>
					<CardTitle>嵌入式标签筛选器（推荐用于配置）</CardTitle>
					<CardDescription>
						直接嵌入页面，适合需要详细展示所有标签的场景
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<LabelSelector
						availableLabels={availableLabels}
						selectedLabels={selectedLabels}
						onSelectionChange={setSelectedLabels}
						matchedSeriesCount={series.size}
					/>
					
					<div className="text-sm text-muted-foreground">
						<strong>使用场景：</strong>
						<ul className="list-disc list-inside mt-2 space-y-1">
							<li>数据源配置页面，需要详细展示所有标签</li>
							<li>筛选配置界面，用户需要频繁切换</li>
							<li>管理后台，空间充足的页面</li>
						</ul>
					</div>
				</CardContent>
			</Card>
			
			{/* 筛选结果 */}
			<Card>
				<CardHeader>
					<CardTitle>筛选结果</CardTitle>
					<CardDescription>匹配到 {series.size} 条时间序列</CardDescription>
				</CardHeader>
				<CardContent>
					{series.size > 0 ? (
						<div className="space-y-2">
							{Array.from(series.entries()).map(([seriesKey, points]) => (
								<div
									key={seriesKey}
									className="p-3 bg-muted/50 rounded border"
								>
									<div className="flex items-center justify-between">
										<div className="font-mono text-sm font-medium">
											{formatSeriesLabel(seriesKey).full}
										</div>
										<div className="text-xs text-muted-foreground">
											{points.length} 个数据点
										</div>
									</div>
									<div className="mt-2 text-xs text-muted-foreground">
										序列键: <code className="bg-background px-1 py-0.5 rounded">{seriesKey}</code>
									</div>
								</div>
							))}
						</div>
					) : (
						<div className="text-center py-8 text-muted-foreground">
							没有匹配的序列
						</div>
					)}
				</CardContent>
			</Card>
			
			{/* 原始数据（调试用） */}
			<Card>
				<CardHeader>
					<CardTitle>原始数据</CardTitle>
					<CardDescription>
						当前指标 "{selectedMetric}" 的所有数据点
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto">
						<table className="w-full text-xs">
							<thead className="bg-muted">
								<tr>
									<th className="px-2 py-1 text-left">指标名</th>
									<th className="px-2 py-1 text-left">IP</th>
									<th className="px-2 py-1 text-left">PID</th>
									<th className="px-2 py-1 text-left">进程</th>
									<th className="px-2 py-1 text-left">主机</th>
									<th className="px-2 py-1 text-right">值</th>
								</tr>
							</thead>
							<tbody>
								{metricData.map((point, idx) => (
									<tr 
										key={idx}
										className={`border-t ${
											filteredData.includes(point) 
												? 'bg-primary/5' 
												: 'opacity-50'
										}`}
									>
										<td className="px-2 py-1 font-mono">{point.name}</td>
										<td className="px-2 py-1 font-mono">{point.labels.ip}</td>
										<td className="px-2 py-1 font-mono">{point.labels.pid}</td>
										<td className="px-2 py-1">{point.labels.process}</td>
										<td className="px-2 py-1">{point.labels.host}</td>
										<td className="px-2 py-1 text-right font-medium">
											{point.value.toFixed(1)}%
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}

// ============================================
// 分页组件测试页面
// ============================================

function PaginationTestContent() {
	const [currentPage, setCurrentPage] = useState(1)
	const [pageSize, setPageSize] = useState(20)
	
	// 模拟总数据量
	const total = 500
	const totalPages = Math.ceil(total / pageSize)
	
	// 生成当前页的模拟数据
	const startIndex = (currentPage - 1) * pageSize
	const currentPageData = Array.from({ length: Math.min(pageSize, total - startIndex) }, (_, i) => ({
		id: startIndex + i + 1,
		name: `数据项 ${startIndex + i + 1}`,
		value: Math.random() * 100,
	}))
	
	return (
		<div className="space-y-6">
			{/* 标题 */}
			<div className="space-y-2">
				<h1 className="text-3xl font-bold">分页组件测试</h1>
				<p className="text-muted-foreground">
					测试通用分页组件的各项功能
				</p>
			</div>
			
			<Separator />
			
			{/* 分页组件功能测试 */}
			<Card>
				<CardHeader>
					<CardTitle>分页组件功能</CardTitle>
					<CardDescription>
						支持页码按钮、上一页/下一页、首页/末页、Page Size 选择、跳转输入
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					{/* 当前状态显示 */}
					<div className="bg-muted/50 rounded-lg p-4 space-y-2">
						<h3 className="font-semibold text-sm">当前状态</h3>
						<div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
							<div>
								<span className="text-muted-foreground">当前页：</span>
								<span className="font-medium ml-2">{currentPage}</span>
							</div>
							<div>
								<span className="text-muted-foreground">总页数：</span>
								<span className="font-medium ml-2">{totalPages}</span>
							</div>
							<div>
								<span className="text-muted-foreground">每页数量：</span>
								<span className="font-medium ml-2">{pageSize}</span>
							</div>
							<div>
								<span className="text-muted-foreground">总数据量：</span>
								<span className="font-medium ml-2">{total}</span>
							</div>
						</div>
					</div>
					
					{/* 模拟数据表格 */}
					<div className="border rounded-lg overflow-hidden">
						<table className="w-full text-sm">
							<thead className="bg-muted/50">
								<tr>
									<th className="px-4 py-2 text-left">ID</th>
									<th className="px-4 py-2 text-left">名称</th>
									<th className="px-4 py-2 text-right">数值</th>
								</tr>
							</thead>
							<tbody>
								{currentPageData.map((item) => (
									<tr key={item.id} className="border-t hover:bg-muted/30">
										<td className="px-4 py-2 font-mono">{item.id}</td>
										<td className="px-4 py-2">{item.name}</td>
										<td className="px-4 py-2 text-right font-medium">
											{item.value.toFixed(2)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					
					{/* 分页组件 */}
					<Pagination
						currentPage={currentPage}
						totalPages={totalPages}
						pageSize={pageSize}
						total={total}
						onPageChange={setCurrentPage}
						onPageSizeChange={(size) => {
							setPageSize(size)
							setCurrentPage(1) // 切换 Page Size 时重置到第 1 页
						}}
					/>
				</CardContent>
			</Card>
			
			{/* 不同数据量测试 */}
			<Card>
				<CardHeader>
					<CardTitle>不同数据量场景</CardTitle>
					<CardDescription>
						测试不同总数据量下的分页表现
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{[
						{ total: 5, pageSize: 10, desc: '少量数据（5 条）' },
						{ total: 50, pageSize: 10, desc: '中等数据（50 条）' },
						{ total: 150, pageSize: 20, desc: '较多数据（150 条）' },
						{ total: 1000, pageSize: 20, desc: '大量数据（1000 条）' },
					].map((scenario, index) => {
						const [page, setPage] = useState(1)
						const [size, setSize] = useState(scenario.pageSize)
						const pages = Math.ceil(scenario.total / size)
						
						return (
							<div key={index} className="border rounded-lg p-4 space-y-3">
								<div className="flex items-center justify-between">
									<h4 className="font-semibold text-sm">{scenario.desc}</h4>
									<span className="text-xs text-muted-foreground">
										总 {scenario.total} 条 / 每页 {size} 条 / 共 {pages} 页
									</span>
								</div>
								<Pagination
									currentPage={page}
									totalPages={pages}
									pageSize={size}
									total={scenario.total}
									onPageChange={setPage}
									onPageSizeChange={(newSize) => {
										setSize(newSize)
										setPage(1)
									}}
								/>
							</div>
						)
					})}
				</CardContent>
			</Card>
		</div>
	)
}

// ============================================
// 主测试页面（使用标签页组织）
// ============================================

export default function ComponentTestPage() {
	return (
		<div>
			<Tabs defaultValue="label-selector" className="space-y-6">
				<div className="space-y-4">
					<div className="space-y-2">
						<h1 className="text-3xl font-bold">组件测试页面</h1>
						<p className="text-muted-foreground">
							用于测试和调试各种 UI 组件
						</p>
					</div>
					
				<TabsList>
					<TabsTrigger value="label-selector">标签筛选器测试</TabsTrigger>
					<TabsTrigger value="pagination">分页组件测试</TabsTrigger>
					<TabsTrigger value="report-detail">报告详情测试</TabsTrigger>
					<TabsTrigger value="streaming-text">流式输出测试</TabsTrigger>
				</TabsList>
			</div>
			
			<TabsContent value="label-selector" className="space-y-6">
				<LabelSelectorTestContent />
			</TabsContent>
			
			<TabsContent value="pagination" className="space-y-6">
				<PaginationTestContent />
			</TabsContent>
			
			<TabsContent value="report-detail" className="space-y-6">
				<ReportDetailTestContent />
			</TabsContent>
			
			<TabsContent value="streaming-text" className="space-y-6">
				<StreamingTextTestContent />
			</TabsContent>
		</Tabs>
	</div>
)
}

// ============================================
// 流式输出测试页面
// ============================================

// 模拟 AI 分析的 Markdown 文本
const SAMPLE_MARKDOWN = `## 📊 测试用例分析报告

### 1. 性能概览

本次测试共执行了 **5 个测试用例**，整体表现良好。以下是详细分析：

- ✅ CPU 使用率保持在 **45%** 以下
- ✅ 内存占用稳定在 **2.3GB**
- ⚠️ 网络延迟略高，平均 **120ms**

### 2. 关键指标

| 指标 | 数值 | 状态 |
|------|------|------|
| 帧率 | 60 FPS | 🟢 正常 |
| 加载时间 | 2.3s | 🟡 一般 |
| 崩溃率 | 0% | 🟢 优秀 |

### 3. 代码示例

\`\`\`python
def analyze_performance(data):
    """分析性能数据"""
    avg_fps = sum(data['fps']) / len(data['fps'])
    return {
        'average_fps': avg_fps,
        'status': 'good' if avg_fps > 55 else 'warning'
    }
\`\`\`

### 4. 建议

1. 优化网络请求，减少延迟
2. 考虑使用 \`CDN\` 加速资源加载
3. 定期进行性能回归测试

> 💡 **提示**：建议在下次迭代中重点关注网络优化部分。
`

// 自定义 Hook：逐字打印效果
function useTypewriter(text: string, speed: number = 30, enabled: boolean = true) {
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
			setDisplayedText(text)
			setIsComplete(true)
			return
		}
		
		reset()
	}, [text, enabled, reset])
	
	useEffect(() => {
		if (!enabled || currentIndex >= text.length) {
			if (currentIndex >= text.length) {
				setIsComplete(true)
			}
			return
		}
		
		const timer = setTimeout(() => {
			setDisplayedText(prev => prev + text[currentIndex])
			setCurrentIndex(prev => prev + 1)
		}, speed)
		
		return () => clearTimeout(timer)
	}, [currentIndex, text, speed, enabled])
	
	return { displayedText, isComplete, reset, progress: text.length > 0 ? (currentIndex / text.length) * 100 : 0 }
}

// 方案 1：基础打字效果（纯文本）
function BasicTypewriter({ text, speed = 30 }: { text: string; speed?: number }) {
	const { displayedText, isComplete, reset, progress } = useTypewriter(text, speed)
	
	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between text-sm text-muted-foreground">
				<span>进度: {progress.toFixed(0)}%</span>
				<Button variant="outline" size="sm" onClick={reset}>重新播放</Button>
			</div>
			<div className="p-4 bg-muted/30 rounded-lg min-h-[100px] font-mono text-sm whitespace-pre-wrap">
				{displayedText}
				{!isComplete && <span className="animate-pulse">▌</span>}
			</div>
		</div>
	)
}

// 方案 2：Markdown 流式渲染
function MarkdownTypewriter({ text, speed = 20 }: { text: string; speed?: number }) {
	const { displayedText, isComplete, reset, progress } = useTypewriter(text, speed)
	
	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between text-sm text-muted-foreground">
				<span>进度: {progress.toFixed(0)}%</span>
				<Button variant="outline" size="sm" onClick={reset}>重新播放</Button>
			</div>
			<div className="p-4 bg-muted/30 rounded-lg min-h-[200px] rich-text-content">
				<ReactMarkdown remarkPlugins={[remarkGfm]}>
					{displayedText}
				</ReactMarkdown>
				{!isComplete && <span className="animate-pulse text-primary">▌</span>}
			</div>
		</div>
	)
}

// 方案 3：按块流式渲染（更流畅）
function ChunkedMarkdownTypewriter({ text, chunkSize = 5, speed = 50 }: { text: string; chunkSize?: number; speed?: number }) {
	const [displayedText, setDisplayedText] = useState('')
	const [isComplete, setIsComplete] = useState(false)
	const [currentIndex, setCurrentIndex] = useState(0)
	
	const reset = useCallback(() => {
		setDisplayedText('')
		setCurrentIndex(0)
		setIsComplete(false)
	}, [])
	
	useEffect(() => {
		reset()
	}, [text, reset])
	
	useEffect(() => {
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
	}, [currentIndex, text, chunkSize, speed])
	
	const progress = text.length > 0 ? (currentIndex / text.length) * 100 : 0
	
	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between text-sm text-muted-foreground">
				<span>进度: {progress.toFixed(0)}% | 每次 {chunkSize} 字符</span>
				<Button variant="outline" size="sm" onClick={reset}>重新播放</Button>
			</div>
			<div className="p-4 bg-muted/30 rounded-lg min-h-[200px] rich-text-content">
				<ReactMarkdown remarkPlugins={[remarkGfm]}>
					{displayedText}
				</ReactMarkdown>
				{!isComplete && <span className="animate-pulse text-primary">▌</span>}
			</div>
		</div>
	)
}

function StreamingTextTestContent() {
	const [speed, setSpeed] = useState(20)
	const [chunkSize, setChunkSize] = useState(3)
	const [editorContent, setEditorContent] = useState('<p>在这里编辑文本，测试<strong>字体大小</strong>、<span style="color: #ef4444">文字颜色</span>和<mark data-color="#fef08a" style="background-color: #fef08a">背景高亮</mark>功能。</p>')
	
	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-2xl font-bold">流式输出效果测试</h2>
				<p className="text-muted-foreground mt-2">
					模拟 AI 生成文本的逐字打印效果，支持 Markdown 渲染
				</p>
			</div>
			
			<Separator />
			
			{/* 富文本编辑器测试 */}
			<Card>
				<CardHeader>
					<CardTitle>富文本编辑器（新增功能测试）</CardTitle>
					<CardDescription>
						测试新增的三个功能：字体大小、文字颜色、背景高亮
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<RichTextEditor
						content={editorContent}
						onChange={setEditorContent}
						placeholder="输入文本，测试新功能..."
					/>
					<div className="text-sm text-muted-foreground">
						<strong>新增功能：</strong>
						<ul className="list-disc list-inside mt-2 space-y-1">
							<li><strong>字体大小</strong>：点击 A 图标选择 12px ~ 32px</li>
							<li><strong>文字颜色</strong>：点击调色板图标选择颜色</li>
							<li><strong>背景高亮</strong>：点击荧光笔图标选择高亮色</li>
						</ul>
					</div>
				</CardContent>
			</Card>
			
			<Separator />
			
			{/* 控制面板 */}
			<Card>
				<CardHeader>
					<CardTitle>参数调整</CardTitle>
					<CardDescription>调整打字速度和块大小</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<label className="text-sm font-medium">打字速度 (ms): {speed}</label>
							<input 
								type="range" 
								min="5" 
								max="100" 
								value={speed}
								onChange={(e) => setSpeed(Number(e.target.value))}
								className="w-full"
							/>
						</div>
						<div className="space-y-2">
							<label className="text-sm font-medium">块大小 (字符): {chunkSize}</label>
							<input 
								type="range" 
								min="1" 
								max="20" 
								value={chunkSize}
								onChange={(e) => setChunkSize(Number(e.target.value))}
								className="w-full"
							/>
						</div>
					</div>
				</CardContent>
			</Card>
			
			{/* 方案 1：基础打字效果 */}
			<Card>
				<CardHeader>
					<CardTitle>方案 1：基础打字效果（纯文本）</CardTitle>
					<CardDescription>
						逐字显示，不解析 Markdown，适合简单场景
					</CardDescription>
				</CardHeader>
				<CardContent>
					<BasicTypewriter text="这是一段测试文本，用于展示基础的打字机效果。每个字符会依次显示出来，模拟真实的打字过程。" speed={speed} />
				</CardContent>
			</Card>
			
			{/* 方案 2：Markdown 逐字渲染 */}
			<Card>
				<CardHeader>
					<CardTitle>方案 2：Markdown 逐字渲染</CardTitle>
					<CardDescription>
						逐字显示 + 实时 Markdown 解析，效果最接近 AI 输出
					</CardDescription>
				</CardHeader>
				<CardContent>
					<MarkdownTypewriter text={SAMPLE_MARKDOWN} speed={speed} />
				</CardContent>
			</Card>
			
			{/* 方案 3：按块流式渲染 */}
			<Card>
				<CardHeader>
					<CardTitle>方案 3：按块流式渲染（推荐）</CardTitle>
					<CardDescription>
						每次显示多个字符，性能更好，渲染更流畅
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ChunkedMarkdownTypewriter text={SAMPLE_MARKDOWN} chunkSize={chunkSize} speed={speed} />
				</CardContent>
			</Card>
		</div>
	)
}

// ============================================
// 报告详情测试页面
// ============================================

function ReportDetailTestContent() {
	const [report, setReport] = useState<ReportRecord | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	
	// 测试用报告 ID（支持动态修改）
	const [reportId, setReportId] = useState("692fbcc3a547ab13db17a9f4")
	const [inputValue, setInputValue] = useState(reportId)
	
	// 获取报告数据
	const fetchReport = async (id: string) => {
		try {
			setLoading(true)
			setError(null)
			const data = await getReport(id)
			setReport(data)
		} catch (err) {
			console.error('Failed to fetch report:', err)
			setError(err instanceof Error ? err.message : '获取报告失败')
		} finally {
			setLoading(false)
		}
	}
	
	useEffect(() => {
		fetchReport(reportId)
	}, [reportId])
	
	// 处理加载新报告
	const handleLoadReport = () => {
		if (inputValue.trim() && inputValue !== reportId) {
			setReportId(inputValue.trim())
		} else if (inputValue.trim() === reportId) {
			// 重新加载当前报告
			fetchReport(reportId)
		}
	}
	
	// 加载状态
	if (loading) {
		return (
			<Card>
				<CardContent className="p-6">
					<PageLoading text="加载报告数据..." />
				</CardContent>
			</Card>
		)
	}
	
	// 报告 ID 输入控制区
	const ReportIdInput = () => (
		<Card className="mb-6">
			<CardHeader className="pb-3">
				<CardTitle className="text-lg">调试控制台</CardTitle>
				<CardDescription>输入报告 ID 进行动态调试</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex gap-3 items-center">
					<div className="flex-1">
						<Input
							placeholder="输入报告 ID..."
							value={inputValue}
							onChange={(e) => setInputValue(e.target.value)}
							onKeyDown={(e) => e.key === 'Enter' && handleLoadReport()}
							className="font-mono"
						/>
					</div>
					<Button onClick={handleLoadReport} disabled={loading}>
						{loading ? '加载中...' : '加载报告'}
					</Button>
				</div>
				<p className="text-xs text-muted-foreground mt-2">
					当前报告 ID: <code className="bg-muted px-1 py-0.5 rounded">{reportId}</code>
				</p>
			</CardContent>
		</Card>
	)
	
	// 错误状态
	if (error) {
		return (
			<div className="space-y-6">
				<ReportIdInput />
				<Card>
					<CardHeader>
						<CardTitle className="text-destructive">加载失败</CardTitle>
						<CardDescription>{error}</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="text-sm text-muted-foreground">
							<p>测试报告 ID: {reportId}</p>
							<p className="mt-2">请检查：</p>
							<ul className="list-disc list-inside mt-2 space-y-1">
								<li>报告 ID 是否正确</li>
								<li>后端服务是否正常运行</li>
								<li>网络连接是否正常</li>
							</ul>
						</div>
					</CardContent>
				</Card>
			</div>
		)
	}
	
	// 成功状态
	if (!report) {
		return (
			<div className="space-y-6">
				<ReportIdInput />
				<Card>
					<CardHeader>
						<CardTitle>未找到报告</CardTitle>
						<CardDescription>报告 ID: {reportId}</CardDescription>
					</CardHeader>
				</Card>
			</div>
		)
	}
	
	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-2xl font-bold">报告详情组件测试</h2>
				<p className="text-muted-foreground mt-2">
					测试报告详情卡片的展示效果，包括标题、状态、系统信息、项目ICON和扩展信息
				</p>
			</div>
			
			<ReportIdInput />
			
			<Separator />
			
			{/* 报告详情卡片 */}
			<ReportDetailCard
				report={report}
				onRegenerate={() => {
					console.log('重载报告:', report.id)
					alert('重载功能待实现')
				}}
				onArchive={() => {
					console.log('归档报告:', report.id)
					alert('归档功能待实现')
				}}
				onShare={() => {
					console.log('分享报告:', report.id)
					alert('分享功能待实现')
				}}
				onEditSuccess={() => {
					// 编辑成功后重新获取报告数据
					fetchReport(reportId)
				}}
			/>
			
			{/* 报告描述卡片（富文本） */}
			<DescriptionCard
				reportId={report.id}
				description={report.description}
				defaultExpanded={true}
				onSaveSuccess={() => {
					// 保存成功后重新获取报告数据
					fetchReport(reportId)
				}}
			/>
			
			{/* 报告图表卡片 */}
			<ReportChartsCard report={report} />
			
			{/* 原始数据（调试用） */}
			<Card>
				<CardHeader>
					<CardTitle>原始数据（调试）</CardTitle>
					<CardDescription>查看从 API 获取的原始报告数据</CardDescription>
				</CardHeader>
				<CardContent>
					<pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-96">
						{JSON.stringify(report, null, 2)}
					</pre>
				</CardContent>
			</Card>
		</div>
	)
}

