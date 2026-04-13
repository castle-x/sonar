import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, AlertCircle, Settings } from 'lucide-react'
import { getAllReports, type ReportRecord } from '@/apis/report'
import { ReportScoringConfigDialog } from '@/components/report-scoring-config-dialog'

export default function ReportScoringManager() {
	const [reports, setReports] = useState<ReportRecord[]>([])
	const [selectedReportId, setSelectedReportId] = useState<string>('')
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string>('')
	const [dialogOpen, setDialogOpen] = useState(false)

	useEffect(() => {
		loadReports()
	}, [])

	const loadReports = async () => {
		try {
			setLoading(true)
			setError('')
			const data = await getAllReports()
			setReports(data)
			if (data.length > 0) {
				setSelectedReportId(data[0].id)
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : '加载报告列表失败')
		} finally {
			setLoading(false)
		}
	}

	const selectedReport = reports.find(r => r.id === selectedReportId)

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold">报告评分管理</h1>
				<p className="text-muted-foreground mt-2">
					配置报告的评分标准，并测试评分功能
				</p>
			</div>

			{/* 选择报告 */}
			<Card>
				<CardHeader>
					<CardTitle>选择报告</CardTitle>
					<CardDescription>
						选择要配置评分的报告
					</CardDescription>
				</CardHeader>
				<CardContent>
					{loading ? (
						<div className="flex items-center justify-center py-8">
							<Loader2 className="size-6 animate-spin text-muted-foreground" />
						</div>
					) : reports.length === 0 ? (
						<Alert>
							<AlertDescription>
								没有找到任何报告，请先创建报告。
							</AlertDescription>
						</Alert>
					) : (
						<div className="space-y-4">
							<div className="space-y-2">
								<label className="text-sm font-medium">报告</label>
								<Select
									value={selectedReportId}
									onValueChange={setSelectedReportId}
								>
									<SelectTrigger>
										<SelectValue placeholder="选择报告" />
									</SelectTrigger>
									<SelectContent>
										{reports.map(report => (
											<SelectItem key={report.id} value={report.id}>
												{report.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							{selectedReport && (
								<div className="p-4 bg-muted rounded-lg space-y-2 text-sm">
									<div className="flex justify-between">
										<span className="text-muted-foreground">报告名称：</span>
										<span className="font-medium">{selectedReport.name}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">用例数量：</span>
										<span className="font-medium">{selectedReport.cases.length}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">数据源：</span>
										<span className="font-medium">{selectedReport.datasource_name || '-'}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">评分配置：</span>
										<span className="font-medium">
											{selectedReport.scoring_config ? (
												<span className="text-green-600">
													已配置 ({selectedReport.scoring_config.default_config.metric_configs.length} 个指标)
												</span>
											) : (
												<span className="text-orange-600">未配置</span>
											)}
										</span>
									</div>
								</div>
							)}

							{selectedReport && (
								<Button
									onClick={() => setDialogOpen(true)}
									className="w-full"
								>
									<Settings className="size-4 mr-2" />
									{selectedReport.scoring_config ? '编辑评分配置' : '配置评分标准'}
								</Button>
							)}
						</div>
					)}
				</CardContent>
			</Card>

			{/* 错误提示 */}
			{error && (
				<Alert variant="destructive">
					<AlertCircle className="size-4" />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{/* 配置对话框 */}
			{selectedReportId && (
				<ReportScoringConfigDialog
					reportId={selectedReportId}
					open={dialogOpen}
					onOpenChange={setDialogOpen}
					onSuccess={() => {
						// 保存后刷新报告列表
						loadReports()
					}}
				/>
			)}
		</div>
	)
}

