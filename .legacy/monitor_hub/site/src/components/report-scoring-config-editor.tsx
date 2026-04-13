import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Loader2, Plus, Trash2, Save, AlertCircle } from 'lucide-react'
import { updateReport, getReport, type ReportRecord, type ReportScoringConfig, type MetricScoringConfig, type ScoringRange } from '@/apis/report'
import { cn } from '@/lib/utils'

interface ReportScoringConfigEditorProps {
	reportId: string
	onSave?: () => void
}

export function ReportScoringConfigEditor({ reportId, onSave }: ReportScoringConfigEditorProps) {
	const [report, setReport] = useState<ReportRecord | null>(null)
	const [config, setConfig] = useState<ReportScoringConfig | null>(null)
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string>('')

	useEffect(() => {
		loadReport()
	}, [reportId])

	const loadReport = async () => {
		try {
			setLoading(true)
			setError('')
			const data = await getReport(reportId)
			setReport(data)
			
			// 初始化配置或使用已有配置
			if (data.scoring_config) {
				setConfig(data.scoring_config)
			} else {
				// 创建默认配置
				setConfig({
					default_config: {
						metric_configs: []
					}
				})
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : '加载报告失败')
		} finally {
			setLoading(false)
		}
	}

	const handleSaveConfig = async () => {
		if (!config) return

		// 验证配置
		if (config.default_config.metric_configs.length === 0) {
			setError('请至少添加一个指标配置')
			return
		}

		// 验证每个指标
		for (const metric of config.default_config.metric_configs) {
			if (!metric.metric_name || !metric.display_name) {
				setError('指标名称和显示名称不能为空')
				return
			}
			if (metric.weight <= 0) {
				setError('指标权重必须大于0')
				return
			}
			if (metric.ranges.length === 0) {
				setError(`指标 ${metric.display_name} 必须至少有一个评分区间`)
				return
			}
		}

		try {
			setSaving(true)
			setError('')
			
			await updateReport(reportId, {
				scoring_config: config
			} as any)
			
			onSave?.()
		} catch (err) {
			setError(err instanceof Error ? err.message : '保存配置失败')
		} finally {
			setSaving(false)
		}
	}

	const addMetric = () => {
		if (!config) return
		
		const newMetric: MetricScoringConfig = {
			metric_name: '',
			display_name: '',
			weight: 1,
			unit: '%',
			aggregation_type: 'avg',
			ranges: []
		}
		
		setConfig({
			...config,
			default_config: {
				...config.default_config,
				metric_configs: [...config.default_config.metric_configs, newMetric]
			}
		})
	}

	const removeMetric = (index: number) => {
		if (!config) return
		
		const newMetrics = config.default_config.metric_configs.filter((_, i) => i !== index)
		setConfig({
			...config,
			default_config: {
				...config.default_config,
				metric_configs: newMetrics
			}
		})
	}

	const updateMetric = (index: number, field: keyof MetricScoringConfig, value: any) => {
		if (!config) return
		
		const newMetrics = [...config.default_config.metric_configs]
		newMetrics[index] = { ...newMetrics[index], [field]: value }
		
		setConfig({
			...config,
			default_config: {
				...config.default_config,
				metric_configs: newMetrics
			}
		})
	}

	const addRange = (metricIndex: number) => {
		if (!config) return
		
		const newRange: ScoringRange = {
			min: 0,
			max: 100,
			score: 100,
			label: '中风险',
			color: '#10b981',
			level: 'normal'
		}
		
		const newMetrics = [...config.default_config.metric_configs]
		newMetrics[metricIndex] = {
			...newMetrics[metricIndex],
			ranges: [...newMetrics[metricIndex].ranges, newRange]
		}
		
		setConfig({
			...config,
			default_config: {
				...config.default_config,
				metric_configs: newMetrics
			}
		})
	}

	const removeRange = (metricIndex: number, rangeIndex: number) => {
		if (!config) return
		
		const newMetrics = [...config.default_config.metric_configs]
		newMetrics[metricIndex] = {
			...newMetrics[metricIndex],
			ranges: newMetrics[metricIndex].ranges.filter((_, i) => i !== rangeIndex)
		}
		
		setConfig({
			...config,
			default_config: {
				...config.default_config,
				metric_configs: newMetrics
			}
		})
	}

	const updateRange = (metricIndex: number, rangeIndex: number, field: keyof ScoringRange, value: any) => {
		if (!config) return
		
		const newMetrics = [...config.default_config.metric_configs]
		const newRanges = [...newMetrics[metricIndex].ranges]
		newRanges[rangeIndex] = { ...newRanges[rangeIndex], [field]: value }
		newMetrics[metricIndex] = { ...newMetrics[metricIndex], ranges: newRanges }
		
		setConfig({
			...config,
			default_config: {
				...config.default_config,
				metric_configs: newMetrics
			}
		})
	}

	if (loading) {
		return (
			<div className="flex items-center justify-center py-12">
				<Loader2 className="size-8 animate-spin text-muted-foreground" />
			</div>
		)
	}

	if (!report || !config) {
		return (
			<Alert variant="destructive">
				<AlertCircle className="size-4" />
				<AlertDescription>加载报告失败</AlertDescription>
			</Alert>
		)
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-2xl font-bold">评分配置</h2>
					<p className="text-muted-foreground">
						为报告 "{report.name}" 配置评分标准
					</p>
				</div>
				<Button onClick={handleSaveConfig} disabled={saving}>
					{saving ? (
						<>
							<Loader2 className="size-4 mr-2 animate-spin" />
							保存中...
						</>
					) : (
						<>
							<Save className="size-4 mr-2" />
							保存配置
						</>
					)}
				</Button>
			</div>

			{error && (
				<Alert variant="destructive">
					<AlertCircle className="size-4" />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{/* 指标配置列表 */}
			<div className="space-y-4">
				{config.default_config.metric_configs.map((metric, metricIdx) => (
					<Card key={metricIdx}>
						<CardHeader>
							<div className="flex items-center justify-between">
								<CardTitle className="text-lg">
									指标 {metricIdx + 1}
								</CardTitle>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => removeMetric(metricIdx)}
								>
									<Trash2 className="size-4" />
								</Button>
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							{/* 基本信息 */}
							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label>指标名称</Label>
									<Input
										value={metric.metric_name}
										onChange={(e) => updateMetric(metricIdx, 'metric_name', e.target.value)}
										placeholder="如: cpu_usage"
									/>
								</div>
								<div className="space-y-2">
									<Label>显示名称</Label>
									<Input
										value={metric.display_name}
										onChange={(e) => updateMetric(metricIdx, 'display_name', e.target.value)}
										placeholder="如: CPU使用率"
									/>
								</div>
								<div className="space-y-2">
									<Label>权重系数</Label>
									<Input
										type="number"
										min="0.1"
										step="0.1"
										value={metric.weight}
										onChange={(e) => updateMetric(metricIdx, 'weight', parseFloat(e.target.value) || 1)}
									/>
								</div>
								<div className="space-y-2">
									<Label>单位</Label>
									<Input
										value={metric.unit}
										onChange={(e) => updateMetric(metricIdx, 'unit', e.target.value)}
										placeholder="如: %"
									/>
								</div>
								<div className="space-y-2">
									<Label>聚合类型</Label>
									<Select
										value={metric.aggregation_type}
										onValueChange={(value) => updateMetric(metricIdx, 'aggregation_type', value)}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="avg">平均值</SelectItem>
											<SelectItem value="max">最大值</SelectItem>
											<SelectItem value="min">最小值</SelectItem>
											<SelectItem value="p95">P95</SelectItem>
											<SelectItem value="p99">P99</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>

							{/* 评分区间 */}
							<div className="space-y-3">
								<div className="flex items-center justify-between">
									<Label>评分区间</Label>
									<Button
										variant="outline"
										size="sm"
										onClick={() => addRange(metricIdx)}
									>
										<Plus className="size-4 mr-1" />
										添加区间
									</Button>
								</div>
								
								{metric.ranges.map((range, rangeIdx) => (
									<div key={rangeIdx} className="flex gap-2 items-end">
										<div className="flex-1 grid grid-cols-5 gap-2">
											<div className="space-y-1">
												<Label className="text-xs">最小值</Label>
												<Input
													type="number"
													value={range.min}
													onChange={(e) => updateRange(metricIdx, rangeIdx, 'min', parseFloat(e.target.value) || 0)}
												/>
											</div>
											<div className="space-y-1">
												<Label className="text-xs">最大值</Label>
												<Input
													type="number"
													value={range.max}
													onChange={(e) => updateRange(metricIdx, rangeIdx, 'max', parseFloat(e.target.value) || 0)}
												/>
											</div>
											<div className="space-y-1">
												<Label className="text-xs">得分</Label>
												<Input
													type="number"
													min="0"
													max="100"
													value={range.score}
													onChange={(e) => updateRange(metricIdx, rangeIdx, 'score', parseInt(e.target.value) || 0)}
												/>
											</div>
											<div className="space-y-1">
												<Label className="text-xs">标签</Label>
												<Input
													value={range.label}
													onChange={(e) => updateRange(metricIdx, rangeIdx, 'label', e.target.value)}
												/>
											</div>
											<div className="space-y-1">
												<Label className="text-xs">等级</Label>
												<Select
													value={range.level}
													onValueChange={(value) => updateRange(metricIdx, rangeIdx, 'level', value)}
												>
													<SelectTrigger>
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="excellent">低风险</SelectItem>
														<SelectItem value="good">中低风险</SelectItem>
														<SelectItem value="normal">中风险</SelectItem>
														<SelectItem value="warning">中高风险</SelectItem>
														<SelectItem value="danger">高风险</SelectItem>
													</SelectContent>
												</Select>
											</div>
										</div>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => removeRange(metricIdx, rangeIdx)}
										>
											<Trash2 className="size-4" />
										</Button>
									</div>
								))}
							</div>
						</CardContent>
					</Card>
				))}

				<Button onClick={addMetric} variant="outline" className="w-full">
					<Plus className="size-4 mr-2" />
					添加指标
				</Button>
			</div>
		</div>
	)
}

