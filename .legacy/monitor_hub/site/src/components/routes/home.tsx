import { memo, useCallback, useEffect, useState } from "react"
import { FooterRepoLink } from "@/components/footer-repo-link"
import DatasourceTable, { type DatasourceRecord } from "@/components/datasource-table/datasource-table"
import ReportTable from "@/components/report-table/report-table"
import { getAllDatasources } from "@/apis/datasource"
import { PageLoading } from "@/components/loading"

export default memo(() => {
	// 状态管理
	const [datasources, setDatasources] = useState<DatasourceRecord[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	// 设置页面标题
	useEffect(() => {
		document.title = `数据源 / Monitor Hub`
	}, [])

	// 获取数据源列表的函数（可复用）
	const fetchDatasources = useCallback(async () => {
		try {
			setLoading(true)
			setError(null)
			
			// 调用 API 获取数据
			const data = await getAllDatasources()
			setDatasources(data)
			
		} catch (err) {
			console.error("获取数据源失败:", err)
			setError(err instanceof Error ? err.message : "获取数据失败")
			
			// 如果 API 失败，使用假数据作为后备
			// 开发环境下可以注释掉这段，强制使用真实 API
			setDatasources([
				{
					id: "1",
					status: "healthy",
					name: "本地默认数据源",
					app_id: "local-default",
					pushgateway_addr_list: ["localhost:8280"],
					description: "本地默认数据源，用于开发环境",
					createdAt: "2025-10-30T08:30:00Z",
					updatedAt: "2025-10-30T08:30:00Z",
				},
			])
		} finally {
			setLoading(false)
		}
	}, []) // 没有依赖项，函数不会重新创建

	// 初始加载数据
	useEffect(() => {
		fetchDatasources()
	}, [fetchDatasources])

	// 监听全局刷新事件（从 Navbar 等全局组件触发）
	useEffect(() => {
		const handleRefresh = () => {
			fetchDatasources()
		}
		
		window.addEventListener('datasource-changed', handleRefresh)
		
		return () => {
			window.removeEventListener('datasource-changed', handleRefresh)
		}
	}, [fetchDatasources])

	// 加载状态
	if (loading) {
		return (
			<>
				<PageLoading text="加载数据源..." />
				<FooterRepoLink />
			</>
		)
	}

	// 渲染主界面
	return (
		<>
			<div className="flex flex-col gap-8">
				{/* 错误提示（如果有） */}
				{error && (
					<div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm text-destructive">
						<strong>⚠️ 获取数据失败：</strong> {error}
						<div className="mt-2 text-xs text-muted-foreground">
							已加载 {datasources.length} 个本地数据源作为后备
						</div>
					</div>
				)}
				
			{/* 数据源表格 */}
			<DatasourceTable data={datasources} onRefresh={fetchDatasources} />
				
				{/* 测试报告表格 */}
				<ReportTable />
			</div>
			<FooterRepoLink />
		</>
	)
})
