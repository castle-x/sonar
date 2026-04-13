/**
 * 运行状态页
 *
 * 接口：
 *   GET /api/v1/debug/status  — 整体快照（config + watcher_total + watcher_details + watcher_count）
 *   GET /api/v1/stats         — watcher 汇总统计（备用刷新）
 *   GET /api/v1/health        — 健康检查
 */

import { useEffect, useState, useCallback } from "react"
import {
	RefreshCwIcon,
	ActivityIcon,
	CheckCircleIcon,
	XCircleIcon,
	AlertCircleIcon,
	FileTextIcon,
	ClockIcon,
	LoaderIcon,
	DatabaseIcon,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getDebugStatus, getHealth, type DebugStatus, type WatcherStats } from "@/apis/exporter"
import { cn } from "@/lib/utils"

export default function StatusPage() {
	const [status, setStatus] = useState<DebugStatus | null>(null)
	const [healthy, setHealthy] = useState<boolean | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
	const [autoRefresh, setAutoRefresh] = useState(true)

	const load = useCallback(async () => {
		setError(null)
		try {
			// 并行请求：健康检查 + 状态快照
			const [healthRes, debugRes] = await Promise.allSettled([
				getHealth(),
				getDebugStatus(),
			])

			if (healthRes.status === "fulfilled") {
				setHealthy(healthRes.value.status === "ok")
			} else {
				setHealthy(false)
			}

			if (debugRes.status === "fulfilled") {
				setStatus(debugRes.value)
			} else {
				throw debugRes.reason
			}

			setLastUpdated(new Date())
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : String(e))
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		load()
	}, [load])

	// 15s 自动刷新
	useEffect(() => {
		if (!autoRefresh) return
		const timer = setInterval(load, 15_000)
		return () => clearInterval(timer)
	}, [autoRefresh, load])

	const formatDuration = (ns: number) => {
		const s = Math.floor(ns / 1e9)
		const h = Math.floor(s / 3600)
		const m = Math.floor((s % 3600) / 60)
		const sec = s % 60
		if (h > 0) return `${h}h ${m}m`
		if (m > 0) return `${m}m ${sec}s`
		return `${sec}s`
	}

	const formatTime = (t: string) => {
		if (!t || t.startsWith("0001")) return "—"
		return new Date(t).toLocaleTimeString()
	}

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-[40vh]">
				<div className="flex flex-col items-center gap-3">
					<div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
					<p className="text-sm text-muted-foreground">加载状态中...</p>
				</div>
			</div>
		)
	}

	return (
		<div className="space-y-6">
			{/* 顶部操作栏 */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">运行状态</h1>
					<p className="text-sm text-muted-foreground mt-1">
						实时监控 watcher 运行状态和日志采集健康情况
					</p>
				</div>
				<div className="flex items-center gap-3">
					{lastUpdated && (
						<span className="text-xs text-muted-foreground flex items-center gap-1">
							<ClockIcon className="h-3.5 w-3.5" />
							{lastUpdated.toLocaleTimeString()}
						</span>
					)}
					<Button
						variant="outline"
						size="sm"
						onClick={() => setAutoRefresh(!autoRefresh)}
						className={cn(autoRefresh && "border-green-500/50 text-green-600 dark:text-green-400")}
					>
						<ActivityIcon className="h-4 w-4 mr-2" />
						{autoRefresh ? "自动刷新" : "已暂停"}
					</Button>
					<Button variant="outline" size="sm" onClick={load}>
						<RefreshCwIcon className="h-4 w-4 mr-2" />
						刷新
					</Button>
				</div>
			</div>

			{error && (
				<Card className="border-destructive/40">
					<CardContent className="pt-4">
						<div className="flex items-center gap-2 text-destructive text-sm">
							<XCircleIcon className="h-4 w-4 shrink-0" />
							{error}
						</div>
					</CardContent>
				</Card>
			)}

			{/* 概览 */}
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
				{/* 健康状态 */}
				<Card>
					<CardContent className="pt-4 pb-4">
						<div className="flex items-center gap-3">
							<div className={cn(
								"p-2 rounded-md",
								healthy === null ? "bg-muted text-muted-foreground" :
								healthy ? "bg-green-500/10 text-green-600 dark:text-green-400" :
								"bg-destructive/10 text-destructive"
							)}>
								{healthy ? (
									<CheckCircleIcon className="h-5 w-5" />
								) : (
									<XCircleIcon className="h-5 w-5" />
								)}
							</div>
							<div>
								<p className="text-xs text-muted-foreground">服务健康</p>
								<p className="font-semibold">
									{healthy === null ? "检测中" : healthy ? "正常" : "异常"}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Watcher 数量 */}
				<Card>
					<CardContent className="pt-4 pb-4">
						<div className="flex items-center gap-3">
							<div className="p-2 rounded-md bg-muted text-muted-foreground">
								<FileTextIcon className="h-5 w-5" />
							</div>
							<div>
								<p className="text-xs text-muted-foreground">Watcher 数量</p>
								<p className="font-semibold">{status?.watcher_count ?? "—"}</p>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* 推送网关 */}
				<Card>
					<CardContent className="pt-4 pb-4">
						<div className="flex items-center gap-3">
							<div className={cn(
								"p-2 rounded-md",
								status?.config.push_gateway.enabled
									? "bg-green-500/10 text-green-600 dark:text-green-400"
									: "bg-muted text-muted-foreground"
							)}>
								<DatabaseIcon className="h-5 w-5" />
							</div>
							<div>
								<p className="text-xs text-muted-foreground">推送网关</p>
								<p className="font-semibold text-sm truncate max-w-[160px]">
									{status?.config.push_gateway.enabled
										? (status.config.push_gateway.host || "已启用")
										: "未启用"}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{status && (
				<>
					{/* 汇总统计 */}
					<TotalStatsCard stats={status.watcher_total} formatDuration={formatDuration} formatTime={formatTime} />

					{/* 各 Watcher 详情 */}
					<Card>
						<CardHeader>
							<CardTitle>Watcher 详情</CardTitle>
							<CardDescription>
								每个日志文件监视器的独立统计信息（共 {status.watcher_count} 个）
							</CardDescription>
						</CardHeader>
						<CardContent>
							{status.watcher_count === 0 ? (
								<p className="text-sm text-muted-foreground text-center py-6">
									暂无运行中的 Watcher
								</p>
							) : (
								<div className="space-y-3">
									{Object.entries(status.watcher_details).map(([name, stats]) => (
										<WatcherDetailCard
											key={name}
											name={name}
											stats={stats}
											formatDuration={formatDuration}
											formatTime={formatTime}
										/>
									))}
								</div>
							)}
						</CardContent>
					</Card>

					{/* 采集器概况（来自 config） */}
					<Card>
						<CardHeader>
							<CardTitle>采集器状态</CardTitle>
							<CardDescription>各采集器的启用状态（基于配置）</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								<CollectorRow
									name="Node Exporter"
									enabled={status.config.node_exporter.enabled}
									detail={status.config.step ? `采集间隔 ${status.config.step}s` : undefined}
								/>
								<CollectorRow
									name="Process Exporter"
									enabled={status.config.process_exporter.enabled}
									detail={`${status.config.process_exporter.rules?.length ?? 0} 条规则`}
								/>
								<CollectorRow
									name="Log Exporter"
									enabled={(status.config.log_config?.filter(lc => lc.enabled).length ?? 0) > 0}
									detail={`${status.config.log_config?.filter(lc => lc.enabled).length ?? 0} / ${status.config.log_config?.length ?? 0} 个配置已启用`}
								/>
								<CollectorRow
									name="Push Gateway"
									enabled={status.config.push_gateway.enabled}
									detail={status.config.push_gateway.host}
								/>
							</div>
						</CardContent>
					</Card>
				</>
			)}

			{!status && !loading && !error && (
				<div className="text-center text-sm text-muted-foreground py-8">
					<LoaderIcon className="h-6 w-6 animate-spin mx-auto mb-2" />
					等待数据...
				</div>
			)}
		</div>
	)
}

// ============================================================
// 汇总统计卡片
// ============================================================
function TotalStatsCard({
	stats,
	formatDuration,
	formatTime,
}: {
	stats: WatcherStats
	formatDuration: (ns: number) => string
	formatTime: (t: string) => string
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>汇总统计</CardTitle>
				<CardDescription>所有 Watcher 的合计数据</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
					<StatBox label="监视文件数" value={String(stats.files_watched)} />
					<StatBox label="处理行数" value={stats.lines_processed.toLocaleString()} />
					<StatBox
						label="错误数"
						value={String(stats.errors)}
						danger={stats.errors > 0}
					/>
					<StatBox label="重试次数" value={String(stats.retries)} />
					<StatBox label="文件轮转" value={String(stats.file_rotations)} />
					<StatBox
						label="最后处理"
						value={formatTime(stats.last_process_time)}
					/>
					<StatBox
						label="运行时长"
						value={stats.uptime > 0 ? formatDuration(stats.uptime) : "—"}
					/>
					<StatBox
						label="当前文件"
						value={`${stats.current_files?.length ?? 0} 个`}
					/>
				</div>

				{stats.current_files && stats.current_files.length > 0 && (
					<div className="mt-4">
						<p className="text-xs text-muted-foreground mb-2">当前监视的文件</p>
						<div className="space-y-1 max-h-32 overflow-y-auto">
							{stats.current_files.map((f) => (
								<div key={f} className="font-mono text-xs text-muted-foreground flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50">
									<FileTextIcon className="h-3 w-3 shrink-0" />
									{f}
								</div>
							))}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	)
}

// ============================================================
// 单个 Watcher 详情卡片
// ============================================================
function WatcherDetailCard({
	name,
	stats,
	formatDuration,
	formatTime,
}: {
	name: string
	stats: WatcherStats
	formatDuration: (ns: number) => string
	formatTime: (t: string) => string
}) {
	const [expanded, setExpanded] = useState(false)
	const hasError = stats.errors > 0

	return (
		<div className={cn(
			"rounded-md border border-border/60 overflow-hidden",
			hasError && "border-destructive/30"
		)}>
			<button
				className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/30 transition-colors"
				onClick={() => setExpanded(!expanded)}
			>
				{hasError ? (
					<AlertCircleIcon className="h-4 w-4 text-destructive shrink-0" />
				) : (
					<CheckCircleIcon className="h-4 w-4 text-green-500 shrink-0" />
				)}
				<span className="font-medium flex-1 text-left truncate">{name}</span>
				<span className="text-xs text-muted-foreground">
					{stats.lines_processed.toLocaleString()} 行
				</span>
				{stats.errors > 0 && (
					<span className="text-xs text-destructive">{stats.errors} 错误</span>
				)}
				{expanded ? (
					<ChevronUpIconSm />
				) : (
					<ChevronDownIconSm />
				)}
			</button>

			{expanded && (
				<div className="px-4 pb-4 border-t border-border/40">
					<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
						<StatBox label="监视文件" value={String(stats.files_watched)} />
						<StatBox label="处理行数" value={stats.lines_processed.toLocaleString()} />
						<StatBox label="错误数" value={String(stats.errors)} danger={stats.errors > 0} />
						<StatBox label="重试" value={String(stats.retries)} />
						<StatBox label="文件轮转" value={String(stats.file_rotations)} />
						<StatBox label="最后处理" value={formatTime(stats.last_process_time)} />
						<StatBox label="运行时长" value={stats.uptime > 0 ? formatDuration(stats.uptime) : "—"} />
					</div>

					{stats.current_files && stats.current_files.length > 0 && (
						<div className="mt-3">
							<p className="text-xs text-muted-foreground mb-1">监视文件</p>
							{stats.current_files.map((f) => (
								<div key={f} className="font-mono text-xs text-muted-foreground py-0.5">
									{f}
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	)
}

function ChevronDownIconSm() {
	return (
		<svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
			<path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
		</svg>
	)
}

function ChevronUpIconSm() {
	return (
		<svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
			<path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
		</svg>
	)
}

// ============================================================
// 采集器行
// ============================================================
function CollectorRow({
	name,
	enabled,
	detail,
}: {
	name: string
	enabled: boolean
	detail?: string
}) {
	return (
		<div className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2.5 text-sm">
			{enabled ? (
				<CheckCircleIcon className="h-4 w-4 text-green-500 shrink-0" />
			) : (
				<XCircleIcon className="h-4 w-4 text-muted-foreground shrink-0" />
			)}
			<span className="font-medium flex-1">{name}</span>
			{detail && <span className="text-xs text-muted-foreground">{detail}</span>}
		</div>
	)
}

// ============================================================
// 数值展示盒子
// ============================================================
function StatBox({
	label,
	value,
	danger,
}: {
	label: string
	value: string
	danger?: boolean
}) {
	return (
		<div className="rounded-md bg-muted/30 border border-border/40 px-3 py-2">
			<p className="text-xs text-muted-foreground mb-0.5">{label}</p>
			<p className={cn("text-sm font-semibold", danger && "text-destructive")}>{value}</p>
		</div>
	)
}
