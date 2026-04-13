/**
 * 配置管理页（可编辑）
 *
 * 接口：
 *   GET   /api/v1/config              加载当前配置
 *   PUT   /api/v1/config              全量保存（持久化 + 热更新）
 *   PATCH /api/v1/config/node         仅保存 node_exporter 段
 *   PATCH /api/v1/config/process      仅保存 process_exporter 段
 *   PATCH /api/v1/config/log          仅保存 log_config 段
 *   POST  /api/v1/config/reload       重新从磁盘加载
 */

import { useEffect, useState } from "react"
import {
	PlusIcon,
	Trash2Icon,
	SaveIcon,
	LoaderIcon,
	RefreshCwIcon,
	ChevronDownIcon,
	ChevronUpIcon,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/toaster"
import {
	getConfig, putConfig, reloadConfig,
	patchNodeConfig, patchProcessConfig, patchLogConfig,
	type ExporterConfig, type ProcessRule, type LogConfig,
	type MetricConfig, type ExtractConfig, type NodeExporter,
} from "@/apis/exporter"
import { cn } from "@/lib/utils"

// ============================================================
// 默认值工厂
// ============================================================

const emptyRule = (): ProcessRule => ({ name: "", cmdlines: [], extracts: [] })
const emptyExtract = (): ExtractConfig => ({ type: "default", labels: {} })
const emptyMetric = (): MetricConfig => ({ name: "", pattern: "", enabled: true })
const emptyLogConfig = (): LogConfig => ({
	name: "", file_path: "", enabled: true,
	read_mode: "tail", metrics: [], rules: [],
})

// ============================================================
// 根组件
// ============================================================

export default function ConfigPage() {
	const [config, setConfig] = useState<ExporterConfig | null>(null)
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const [reloading, setReloading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const loadConfig = async () => {
		setLoading(true)
		setError(null)
		try {
			setConfig(await getConfig())
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e)
			setError(msg)
			toast({ title: "加载配置失败", description: msg, variant: "destructive" })
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => { loadConfig() }, [])

	const handleSaveAll = async () => {
		if (!config) return
		setSaving(true)
		try {
			await putConfig(config)
			toast({ title: "保存成功", description: "配置已持久化并触发热更新" })
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e)
			toast({ title: "保存失败", description: msg, variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	const handleReload = async () => {
		setReloading(true)
		try {
			await reloadConfig()
			toast({ title: "热重载成功", description: "已从磁盘重新加载配置" })
			await loadConfig()
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e)
			toast({ title: "热重载失败", description: msg, variant: "destructive" })
		} finally {
			setReloading(false)
		}
	}

	if (loading) return <PageSpinner text="加载配置中..." />
	if (error || !config) return (
		<div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
			<p className="text-destructive text-sm">{error || "无法加载配置"}</p>
			<Button variant="outline" onClick={loadConfig}><RefreshCwIcon className="h-4 w-4 mr-2" />重试</Button>
		</div>
	)

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">配置管理</h1>
					<p className="text-sm text-muted-foreground mt-1">编辑采集规则，保存后立即生效</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" size="sm" onClick={handleReload} disabled={reloading}>
						{reloading ? <LoaderIcon className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCwIcon className="h-4 w-4 mr-2" />}
						重载磁盘
					</Button>
					<Button size="sm" onClick={handleSaveAll} disabled={saving}>
						{saving ? <LoaderIcon className="h-4 w-4 mr-2 animate-spin" /> : <SaveIcon className="h-4 w-4 mr-2" />}
						保存全部
					</Button>
				</div>
			</div>

			<Tabs defaultValue="process">
				<TabsList>
					<TabsTrigger value="node">Node 采集</TabsTrigger>
					<TabsTrigger value="process">进程采集</TabsTrigger>
					<TabsTrigger value="log">日志采集</TabsTrigger>
				</TabsList>

				<TabsContent value="node">
					<NodePanel
						value={config.node_exporter}
						onChange={(node) => setConfig({ ...config, node_exporter: node })}
						onSave={async (node) => {
							await patchNodeConfig(node)
							toast({ title: "Node 配置已保存" })
						}}
					/>
				</TabsContent>

				<TabsContent value="process">
					<ProcessPanel
						value={config.process_exporter}
						onChange={(pe) => setConfig({ ...config, process_exporter: pe })}
						onSave={async (pe) => {
							await patchProcessConfig(pe)
							toast({ title: "进程配置已保存" })
						}}
					/>
				</TabsContent>

				<TabsContent value="log">
					<LogPanel
						value={config.log_config ?? []}
						onChange={(lc) => setConfig({ ...config, log_config: lc })}
						onSave={async (lc) => {
							await patchLogConfig(lc)
							toast({ title: "日志配置已保存" })
						}}
					/>
				</TabsContent>
			</Tabs>
		</div>
	)
}

// ============================================================
// Node 采集面板
// ============================================================
function NodePanel({
	value, onChange, onSave,
}: {
	value: NodeExporter
	onChange: (v: NodeExporter) => void
	onSave: (v: NodeExporter) => Promise<void>
}) {
	const [saving, setSaving] = useState(false)
	const save = async () => {
		setSaving(true)
		try { await onSave(value) } catch (e: unknown) {
			toast({ title: "保存失败", description: String(e), variant: "destructive" })
		} finally { setSaving(false) }
	}

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle>Node 指标采集</CardTitle>
						<CardDescription>主机基础指标（CPU、内存、磁盘、网络）</CardDescription>
					</div>
					<SectionSaveButton saving={saving} onSave={save} />
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex items-center gap-3">
					<Switch checked={value.enabled} onCheckedChange={(v) => onChange({ ...value, enabled: v })} />
					<Label>{value.enabled ? "已启用" : "已禁用"}</Label>
				</div>
				<div>
					<Label className="text-xs mb-2 block">全局标签（附加到所有 node 指标）</Label>
					<LabelsEditor
						labels={value.labels ?? {}}
						onChange={(labels) => onChange({ ...value, labels })}
					/>
				</div>
			</CardContent>
		</Card>
	)
}

// ============================================================
// 进程采集面板
// ============================================================
function ProcessPanel({
	value, onChange, onSave,
}: {
	value: ExporterConfig["process_exporter"]
	onChange: (v: ExporterConfig["process_exporter"]) => void
	onSave: (v: ExporterConfig["process_exporter"]) => Promise<void>
}) {
	const [saving, setSaving] = useState(false)
	const save = async () => {
		setSaving(true)
		try { await onSave(value) } catch (e: unknown) {
			toast({ title: "保存失败", description: String(e), variant: "destructive" })
		} finally { setSaving(false) }
	}

	const updateRule = (i: number, rule: ProcessRule) => {
		const rules = [...(value.rules ?? [])]
		rules[i] = rule
		onChange({ ...value, rules })
	}
	const deleteRule = (i: number) =>
		onChange({ ...value, rules: (value.rules ?? []).filter((_, idx) => idx !== i) })
	const addRule = () =>
		onChange({ ...value, rules: [...(value.rules ?? []), emptyRule()] })

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle>进程采集配置</CardTitle>
							<CardDescription>匹配规则：通过进程名称或命令行过滤目标进程</CardDescription>
						</div>
						<SectionSaveButton saving={saving} onSave={save} />
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center gap-6">
						<div className="flex items-center gap-3">
							<Switch
								checked={value.enabled}
								onCheckedChange={(v) => onChange({ ...value, enabled: v })}
							/>
							<Label>启用进程采集</Label>
						</div>
						<div className="flex items-center gap-2">
							<Label className="text-xs">动态刷新间隔（秒，0=禁用）</Label>
							<Input
								type="number" className="w-24"
								value={value.dynamic_interval ?? 0}
								onChange={(e) => onChange({ ...value, dynamic_interval: Number(e.target.value) })}
								min={0}
							/>
						</div>
					</div>
				</CardContent>
			</Card>

			{(value.rules ?? []).map((rule, i) => (
				<ProcessRuleCard
					key={i} rule={rule} index={i}
					onChange={(r) => updateRule(i, r)}
					onDelete={() => deleteRule(i)}
				/>
			))}

			<Button variant="outline" className="w-full" onClick={addRule}>
				<PlusIcon className="h-4 w-4 mr-2" />添加进程规则
			</Button>
		</div>
	)
}

function ProcessRuleCard({
	rule, index, onChange, onDelete,
}: {
	rule: ProcessRule; index: number
	onChange: (r: ProcessRule) => void; onDelete: () => void
}) {
	const [expanded, setExpanded] = useState(true)

	return (
		<Card>
			<CardHeader className="py-3 px-4">
				<div className="flex items-center gap-2">
					<button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground">
						{expanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
					</button>
					<span className="text-xs text-muted-foreground font-mono">#{index + 1}</span>
					<span className="font-medium text-sm flex-1">
						{rule.name || <span className="text-muted-foreground italic">未命名规则</span>}
					</span>
					<Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete}>
						<Trash2Icon className="h-3.5 w-3.5" />
					</Button>
				</div>
			</CardHeader>

			{expanded && (
				<CardContent className="pt-0 space-y-4">
					<div className="grid grid-cols-2 gap-3">
						<div>
							<Label className="text-xs mb-1 block">规则名称</Label>
							<Input placeholder="e.g. nginx" value={rule.name}
								onChange={(e) => onChange({ ...rule, name: e.target.value })} />
						</div>
						<div>
							<Label className="text-xs mb-1 block">指定 PID（可选，0 表示不指定）</Label>
							<Input type="number" value={rule.pid ?? 0}
								onChange={(e) => onChange({ ...rule, pid: Number(e.target.value) })} className="w-32" />
						</div>
					</div>

					{/* 命令行过滤 */}
					<div>
						<div className="flex items-center justify-between mb-2">
							<Label className="text-xs">命令行过滤条件（!前缀=排除）</Label>
							<Button variant="ghost" size="sm" className="h-6 text-xs"
								onClick={() => onChange({ ...rule, cmdlines: [...(rule.cmdlines ?? []), ""] })}>
								<PlusIcon className="h-3 w-3 mr-1" />添加
							</Button>
						</div>
						{(rule.cmdlines ?? []).map((cmd, ci) => (
							<div key={ci} className="flex gap-2 mb-1.5">
								<Input
									placeholder="e.g. nginx  或  !test"
									value={cmd}
									onChange={(e) => {
										const cmdlines = [...(rule.cmdlines ?? [])]
										cmdlines[ci] = e.target.value
										onChange({ ...rule, cmdlines })
									}}
									className={cn("font-mono text-sm", cmd.startsWith("!") && "text-red-600 dark:text-red-400")}
								/>
								<Button variant="ghost" size="icon" className="h-10 w-9 shrink-0 text-destructive"
									onClick={() => onChange({ ...rule, cmdlines: (rule.cmdlines ?? []).filter((_, k) => k !== ci) })}>
									<Trash2Icon className="h-3.5 w-3.5" />
								</Button>
							</div>
						))}
					</div>

					{/* 日志路径提取正则 */}
					<div>
						<Label className="text-xs mb-1 block">日志路径提取正则（log_exporter 专用，可选）</Label>
						<Input
							placeholder="e.g. --log-file=(\S+)"
							value={rule.log_path_pattern ?? ""}
							onChange={(e) => onChange({ ...rule, log_path_pattern: e.target.value })}
							className="font-mono"
						/>
					</div>

					{/* 标签提取规则 */}
					<div>
						<div className="flex items-center justify-between mb-2">
							<Label className="text-xs">标签提取规则</Label>
							<Button variant="ghost" size="sm" className="h-6 text-xs"
								onClick={() => onChange({ ...rule, extracts: [...(rule.extracts ?? []), emptyExtract()] })}>
								<PlusIcon className="h-3 w-3 mr-1" />添加
							</Button>
						</div>
						{(rule.extracts ?? []).map((ext, ei) => (
							<ExtractEditor
								key={ei} extract={ext}
								onChange={(ex) => {
									const extracts = [...(rule.extracts ?? [])]
									extracts[ei] = ex
									onChange({ ...rule, extracts })
								}}
								onDelete={() => onChange({ ...rule, extracts: (rule.extracts ?? []).filter((_, k) => k !== ei) })}
							/>
						))}
					</div>
				</CardContent>
			)}
		</Card>
	)
}

function ExtractEditor({
	extract, onChange, onDelete,
}: {
	extract: ExtractConfig
	onChange: (e: ExtractConfig) => void
	onDelete: () => void
}) {
	return (
		<div className="rounded-md border border-border/60 p-3 mb-2 space-y-2">
			<div className="flex items-center gap-2">
				<div className="flex gap-1">
					{(["default", "split", "regex"] as const).map((t) => (
						<button key={t} onClick={() => onChange({ ...extract, type: t })}
							className={cn(
								"px-2 py-1 rounded text-xs font-medium border transition-colors",
								extract.type === t
									? "bg-primary text-primary-foreground border-primary"
									: "bg-background text-muted-foreground border-border hover:border-primary"
							)}>
							{t}
						</button>
					))}
				</div>
				<Button variant="ghost" size="icon" className="h-7 w-7 text-destructive ms-auto"
					onClick={onDelete}><Trash2Icon className="h-3.5 w-3.5" /></Button>
			</div>
			{extract.type === "split" && (
				<Input placeholder="分隔符，如 =" value={extract.sep ?? ""}
					onChange={(e) => onChange({ ...extract, sep: e.target.value })}
					className="font-mono text-sm" />
			)}
			{extract.type === "regex" && (
				<Input placeholder="正则表达式，如 version=(\S+)" value={extract.pattern ?? ""}
					onChange={(e) => onChange({ ...extract, pattern: e.target.value })}
					className="font-mono text-sm" />
			)}
			<LabelsEditor labels={extract.labels ?? {}} onChange={(labels) => onChange({ ...extract, labels })} />
		</div>
	)
}

// ============================================================
// 日志采集面板
// ============================================================
function LogPanel({
	value, onChange, onSave,
}: {
	value: LogConfig[]
	onChange: (v: LogConfig[]) => void
	onSave: (v: LogConfig[]) => Promise<void>
}) {
	const [saving, setSaving] = useState(false)
	const save = async () => {
		setSaving(true)
		try { await onSave(value) } catch (e: unknown) {
			toast({ title: "保存失败", description: String(e), variant: "destructive" })
		} finally { setSaving(false) }
	}

	const update = (i: number, lc: LogConfig) => {
		const next = [...value]; next[i] = lc; onChange(next)
	}

	return (
		<div className="space-y-4">
			<div className="flex justify-end">
				<SectionSaveButton saving={saving} onSave={save} />
			</div>

			{value.map((lc, i) => (
				<LogConfigCard
					key={i} config={lc} index={i}
					onChange={(c) => update(i, c)}
					onDelete={() => onChange(value.filter((_, idx) => idx !== i))}
				/>
			))}

			<Button variant="outline" className="w-full" onClick={() => onChange([...value, emptyLogConfig()])}>
				<PlusIcon className="h-4 w-4 mr-2" />添加日志配置
			</Button>
		</div>
	)
}

function LogConfigCard({
	config, index, onChange, onDelete,
}: {
	config: LogConfig; index: number
	onChange: (c: LogConfig) => void; onDelete: () => void
}) {
	const [expanded, setExpanded] = useState(true)
	const [metricsExpanded, setMetricsExpanded] = useState(false)

	return (
		<Card>
			<CardHeader className="py-3 px-4">
				<div className="flex items-center gap-2">
					<button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground">
						{expanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
					</button>
					<span className="text-xs text-muted-foreground font-mono">#{index + 1}</span>
					<span className="font-medium text-sm flex-1">
						{config.name || <span className="text-muted-foreground italic">未命名</span>}
					</span>
					<span className={cn(
						"text-xs px-2 py-0.5 rounded-full",
						config.enabled ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-muted text-muted-foreground"
					)}>{config.enabled ? "启用" : "禁用"}</span>
					<Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete}>
						<Trash2Icon className="h-3.5 w-3.5" />
					</Button>
				</div>
			</CardHeader>

			{expanded && (
				<CardContent className="pt-0 space-y-4">
					<div className="grid grid-cols-2 gap-3">
						<div>
							<Label className="text-xs mb-1 block">配置名称</Label>
							<Input placeholder="e.g. nginx-access" value={config.name}
								onChange={(e) => onChange({ ...config, name: e.target.value })} />
						</div>
						<div>
							<Label className="text-xs mb-1 block">文件路径（支持 glob）</Label>
							<Input placeholder="/var/log/nginx/*.log" value={config.file_path}
								onChange={(e) => onChange({ ...config, file_path: e.target.value })}
								className="font-mono" />
						</div>
					</div>

					<div className="flex items-center gap-6">
						<div className="flex items-center gap-3">
							<Switch checked={config.enabled}
								onCheckedChange={(v) => onChange({ ...config, enabled: v })} />
							<Label className="text-sm">启用</Label>
						</div>
						<div className="flex items-center gap-2">
							<Label className="text-xs">读取模式</Label>
							<div className="flex gap-1">
								{(["tail", "head"] as const).map((m) => (
									<button key={m} onClick={() => onChange({ ...config, read_mode: m })}
										className={cn(
											"px-3 py-1 rounded text-xs font-medium border transition-colors",
											config.read_mode === m
												? "bg-primary text-primary-foreground border-primary"
												: "bg-background text-muted-foreground border-border hover:border-primary"
										)}>{m}</button>
								))}
							</div>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div>
							<Label className="text-xs mb-1 block">编码（可选）</Label>
							<Input placeholder="utf-8" value={config.encoding ?? ""}
								onChange={(e) => onChange({ ...config, encoding: e.target.value })} />
						</div>
						<div>
							<Label className="text-xs mb-1 block">最大文件大小（MB，0=不限）</Label>
							<Input type="number" value={config.max_file_size_mb ?? 0}
								onChange={(e) => onChange({ ...config, max_file_size_mb: Number(e.target.value) })}
								min={0} />
						</div>
					</div>

					{/* 指标配置折叠区 */}
					<div>
						<button
							className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
							onClick={() => setMetricsExpanded(!metricsExpanded)}
						>
							{metricsExpanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
							指标配置（{config.metrics?.length ?? 0} 条）
						</button>
						{metricsExpanded && (
							<div className="mt-3 space-y-2">
								{(config.metrics ?? []).map((m, mi) => (
									<MetricConfigCard
										key={mi} metric={m}
										onChange={(nm) => {
											const metrics = [...(config.metrics ?? [])]; metrics[mi] = nm
											onChange({ ...config, metrics })
										}}
										onDelete={() => onChange({
											...config,
											metrics: (config.metrics ?? []).filter((_, k) => k !== mi)
										})}
									/>
								))}
								<Button variant="outline" size="sm" className="w-full"
									onClick={() => onChange({ ...config, metrics: [...(config.metrics ?? []), emptyMetric()] })}>
									<PlusIcon className="h-3.5 w-3.5 mr-1.5" />添加指标
								</Button>
							</div>
						)}
					</div>
				</CardContent>
			)}
		</Card>
	)
}

function MetricConfigCard({
	metric, onChange, onDelete,
}: {
	metric: MetricConfig
	onChange: (m: MetricConfig) => void
	onDelete: () => void
}) {
	return (
		<div className="rounded-md border border-border/60 p-3 space-y-2">
			<div className="flex items-center gap-2">
				<Switch checked={metric.enabled} onCheckedChange={(v) => onChange({ ...metric, enabled: v })} />
				<Input placeholder="指标名称 e.g. nginx_error_total" value={metric.name}
					onChange={(e) => onChange({ ...metric, name: e.target.value })}
					className="font-mono text-sm" />
				<Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive" onClick={onDelete}>
					<Trash2Icon className="h-3.5 w-3.5" />
				</Button>
			</div>
			<Input placeholder="匹配正则，如 ERROR (?P<msg>.*)" value={metric.pattern}
				onChange={(e) => onChange({ ...metric, pattern: e.target.value })}
				className="font-mono text-sm" />
			<div className="grid grid-cols-2 gap-2">
				<Input placeholder="值字段 e.g. $1" value={metric.value ?? ""}
					onChange={(e) => onChange({ ...metric, value: e.target.value })}
					className="font-mono text-sm" />
				<Input placeholder="时间戳字段 e.g. $2（可选）" value={metric.timestamp ?? ""}
					onChange={(e) => onChange({ ...metric, timestamp: e.target.value })}
					className="font-mono text-sm" />
			</div>
		</div>
	)
}

// ============================================================
// 公共子组件
// ============================================================

function SectionSaveButton({ saving, onSave }: { saving: boolean; onSave: () => void }) {
	return (
		<Button size="sm" variant="outline" onClick={onSave} disabled={saving}>
			{saving ? <LoaderIcon className="h-4 w-4 mr-2 animate-spin" /> : <SaveIcon className="h-4 w-4 mr-2" />}
			保存此项
		</Button>
	)
}

function LabelsEditor({
	labels, onChange,
}: {
	labels: Record<string, string>
	onChange: (l: Record<string, string>) => void
}) {
	const entries = Object.entries(labels)
	const add = () => onChange({ ...labels, "": "" })
	const updateKey = (old: string, nk: string) => {
		const next: Record<string, string> = {}
		for (const [k, v] of Object.entries(labels)) next[k === old ? nk : k] = v
		onChange(next)
	}
	const updateVal = (k: string, v: string) => onChange({ ...labels, [k]: v })
	const remove = (k: string) => { const n = { ...labels }; delete n[k]; onChange(n) }

	return (
		<div>
			<div className="flex items-center justify-between mb-1.5">
				<span className="text-xs text-muted-foreground">标签</span>
				<Button variant="ghost" size="sm" className="h-6 text-xs" onClick={add}>
					<PlusIcon className="h-3 w-3 mr-1" />添加
				</Button>
			</div>
			{entries.map(([k, v], i) => (
				<div key={i} className="flex gap-2 mb-1.5 items-center">
					<Input placeholder="key" value={k} onChange={(e) => updateKey(k, e.target.value)}
						className="font-mono h-8 text-xs" />
					<span className="text-muted-foreground text-xs">=</span>
					<Input placeholder="value" value={v} onChange={(e) => updateVal(k, e.target.value)}
						className="font-mono h-8 text-xs" />
					<Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive" onClick={() => remove(k)}>
						<Trash2Icon className="h-3 w-3" />
					</Button>
				</div>
			))}
		</div>
	)
}

function PageSpinner({ text }: { text: string }) {
	return (
		<div className="flex items-center justify-center min-h-[40vh]">
			<div className="flex flex-col items-center gap-3">
				<div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
				<p className="text-sm text-muted-foreground">{text}</p>
			</div>
		</div>
	)
}
