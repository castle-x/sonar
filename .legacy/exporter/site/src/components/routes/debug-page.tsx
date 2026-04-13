/**
 * 调试工具页
 *
 * 正则调试   — POST /api/v1/debug/regex（后端）+ 本地 JS 实时预览
 * 进程匹配   — POST /api/v1/debug/match_process + GET /api/v1/processes
 * 日志匹配   — POST /api/v1/debug/match_log
 */

import { useState } from "react"
import {
	PlayIcon,
	LoaderIcon,
	CheckCircleIcon,
	XCircleIcon,
	BracketsIcon,
	SearchIcon,
	FileTextIcon,
	PlusIcon,
	Trash2Icon,
	RefreshCwIcon,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/toaster"
import {
	debugRegex, debugRegexLocal, debugMatchProcess, debugMatchLog, getProcesses,
	type RegexDebugResult, type MatchProcessResult, type LogLineResult, type ProcessInfo,
} from "@/apis/exporter"
import { cn } from "@/lib/utils"

export default function DebugPage() {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">调试工具</h1>
				<p className="text-sm text-muted-foreground mt-1">测试规则和正则表达式，无需修改配置</p>
			</div>

			<Tabs defaultValue="regex">
				<TabsList>
					<TabsTrigger value="regex">
						<BracketsIcon className="h-4 w-4 mr-2" />正则调试
					</TabsTrigger>
					<TabsTrigger value="process">
						<SearchIcon className="h-4 w-4 mr-2" />进程匹配
					</TabsTrigger>
					<TabsTrigger value="log">
						<FileTextIcon className="h-4 w-4 mr-2" />日志匹配
					</TabsTrigger>
				</TabsList>

				<TabsContent value="regex"><RegexDebugger /></TabsContent>
				<TabsContent value="process"><ProcessDebugger /></TabsContent>
				<TabsContent value="log"><LogDebugger /></TabsContent>
			</Tabs>
		</div>
	)
}

// ============================================================
// 正则调试器（本地实时预览 + 后端验证）
// ============================================================
function RegexDebugger() {
	const [pattern, setPattern] = useState("")
	const [input, setInput] = useState("")
	const [loading, setLoading] = useState(false)
	const [backendResult, setBackendResult] = useState<RegexDebugResult | null>(null)

	// 本地实时预览
	const live = (() => {
		if (!pattern || !input) return null
		return debugRegexLocal(pattern, input)
	})()

	const syntaxErr = (() => {
		if (!pattern) return null
		try { new RegExp(pattern); return null }
		catch (e: unknown) { return e instanceof Error ? e.message : "语法错误" }
	})()

	const runBackend = async () => {
		if (!pattern || syntaxErr) return
		setLoading(true)
		setBackendResult(null)
		try {
			const res = await debugRegex(pattern, input)
			setBackendResult(res)
		} catch (e: unknown) {
			toast({ title: "后端调试失败", description: String(e), variant: "destructive" })
		} finally {
			setLoading(false)
		}
	}

	// 高亮区间：本地计算（后端不再返回 highlights）
	const highlights: Array<{ start: number; end: number }> = (() => {
		if (!live?.matched || !input) return []
		try {
			const m = new RegExp(pattern).exec(input)
			if (!m) return []
			return [{ start: m.index, end: m.index + m[0].length }]
		} catch { return [] }
	})()

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>正则表达式调试器</CardTitle>
					<CardDescription>本地实时预览 + 后端精确验证</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div>
						<Label className="text-xs mb-1 block">正则表达式</Label>
						<Input
							placeholder="e.g. (?P<level>\w+)\s+(?P<msg>.*)"
							value={pattern}
							onChange={(e) => { setPattern(e.target.value); setBackendResult(null) }}
							className="font-mono"
						/>
						{pattern && (syntaxErr
							? <p className="text-xs text-destructive mt-1 flex items-center gap-1"><XCircleIcon className="h-3 w-3" />{syntaxErr}</p>
							: <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1"><CheckCircleIcon className="h-3 w-3" />语法有效</p>
						)}
					</div>

					<div>
						<Label className="text-xs mb-1 block">测试文本</Label>
						<Input
							placeholder="输入要匹配的日志行..."
							value={input}
							onChange={(e) => { setInput(e.target.value); setBackendResult(null) }}
							className="font-mono"
							onKeyDown={(e) => e.key === "Enter" && runBackend()}
						/>
					</div>

					{/* 本地实时高亮 */}
					{live && input && (
						<div>
							<Label className="text-xs mb-1 block">实时预览</Label>
							<HighlightedText text={input} highlights={highlights} />
							<GroupBadges groups={live.groups} namedGroups={live.named_groups} />
						</div>
					)}

					<div className="flex justify-end">
						<Button onClick={runBackend} disabled={loading || !pattern || !!syntaxErr} size="sm">
							{loading
								? <LoaderIcon className="h-4 w-4 mr-2 animate-spin" />
								: <PlayIcon className="h-4 w-4 mr-2" />}
							后端验证
						</Button>
					</div>
				</CardContent>
			</Card>

			{backendResult && (
				<ResultCard
					matched={backendResult.matched}
					title={backendResult.error ? "正则错误" : backendResult.matched ? "后端匹配成功" : "未匹配"}
					error={backendResult.error}
				>
					{backendResult.matched && (
						<GroupBadges groups={backendResult.groups} namedGroups={backendResult.named_groups} />
					)}
				</ResultCard>
			)}

			{/* 快捷示例 */}
			<Card className="bg-muted/30">
				<CardContent className="pt-4">
					<p className="text-xs font-medium mb-2">常用正则示例</p>
					<div className="space-y-1">
						{[
							{ label: "提取时间戳", pattern: "(?P<ts>\\d{4}-\\d{2}-\\d{2}\\s\\d{2}:\\d{2}:\\d{2})" },
							{ label: "提取日志级别", pattern: "\\[(INFO|WARN|ERROR|DEBUG)\\]" },
							{ label: "提取数值", pattern: "latency=(\\d+\\.?\\d*)ms" },
							{ label: "提取 IP", pattern: "(\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})" },
						].map(({ label, pattern: p }) => (
							<button key={label}
								onClick={() => { setPattern(p); setBackendResult(null) }}
								className="w-full flex items-center gap-3 text-left text-xs hover:bg-muted rounded px-2 py-1.5 transition-colors group"
							>
								<span className="text-muted-foreground w-20 shrink-0">{label}</span>
								<code className="font-mono text-primary group-hover:text-foreground transition-colors truncate">{p}</code>
							</button>
						))}
					</div>
				</CardContent>
			</Card>
		</div>
	)
}

// ============================================================
// 进程匹配调试器
// ============================================================
function ProcessDebugger() {
	const [cmdlines, setCmdlines] = useState<string[]>([""])
	const [loading, setLoading] = useState(false)
	const [loadingAll, setLoadingAll] = useState(false)
	const [result, setResult] = useState<MatchProcessResult | null>(null)
	const [allProcesses, setAllProcesses] = useState<ProcessInfo[] | null>(null)

	const run = async () => {
		const filled = cmdlines.filter((c) => c.trim())
		if (!filled.length) return
		setLoading(true); setResult(null)
		try {
			setResult(await debugMatchProcess(filled))
		} catch (e: unknown) {
			toast({ title: "匹配测试失败", description: String(e), variant: "destructive" })
		} finally { setLoading(false) }
	}

	const loadAll = async () => {
		setLoadingAll(true)
		try {
			setAllProcesses(await getProcesses())
		} catch (e: unknown) {
			toast({ title: "获取进程失败", description: String(e), variant: "destructive" })
		} finally { setLoadingAll(false) }
	}

	const updateCmd = (i: number, v: string) => {
		const next = [...cmdlines]; next[i] = v; setCmdlines(next)
	}

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>进程 cmdline 匹配测试</CardTitle>
					<CardDescription>输入过滤条件（!前缀=排除），查看当前机器上的匹配进程</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div>
						<div className="flex items-center justify-between mb-2">
							<Label className="text-xs">命令行过滤条件</Label>
							<Button variant="ghost" size="sm" className="h-6 text-xs"
								onClick={() => setCmdlines([...cmdlines, ""])}>
								<PlusIcon className="h-3 w-3 mr-1" />添加
							</Button>
						</div>
						{cmdlines.map((cmd, i) => (
							<div key={i} className="flex gap-2 mb-1.5">
								<Input
									placeholder="e.g. nginx  或  !test"
									value={cmd}
									onChange={(e) => updateCmd(i, e.target.value)}
									className={cn("font-mono text-sm", cmd.startsWith("!") && "text-red-600 dark:text-red-400")}
									onKeyDown={(e) => e.key === "Enter" && run()}
								/>
								{cmdlines.length > 1 && (
									<Button variant="ghost" size="icon" className="h-10 w-9 shrink-0 text-destructive"
										onClick={() => setCmdlines(cmdlines.filter((_, k) => k !== i))}>
										<Trash2Icon className="h-3.5 w-3.5" />
									</Button>
								)}
							</div>
						))}
					</div>
					<div className="flex gap-2 justify-end">
						<Button variant="outline" size="sm" onClick={loadAll} disabled={loadingAll}>
							{loadingAll ? <LoaderIcon className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCwIcon className="h-4 w-4 mr-2" />}
							查看所有进程
						</Button>
						<Button size="sm" onClick={run} disabled={loading || !cmdlines.some((c) => c.trim())}>
							{loading ? <LoaderIcon className="h-4 w-4 mr-2 animate-spin" /> : <PlayIcon className="h-4 w-4 mr-2" />}
							测试匹配
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* 匹配结果 */}
			{result && (
				<ResultCard
					matched={result.processes.length > 0}
					title={result.processes.length > 0
						? `命中 ${result.processes.length} 个进程`
						: "未匹配到任何进程"}
				>
					{result.processes.map((p) => <ProcessRow key={p.pid} proc={p} />)}
				</ResultCard>
			)}

			{/* 全部进程列表 */}
			{allProcesses && (
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-base">所有进程（{allProcesses.length} 个）</CardTitle>
					</CardHeader>
					<CardContent className="pt-0">
						<div className="space-y-1 max-h-80 overflow-y-auto">
							{allProcesses.map((p) => <ProcessRow key={p.pid} proc={p} />)}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	)
}

function ProcessRow({ proc }: { proc: ProcessInfo }) {
	return (
		<div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
			<div className="flex items-center gap-2 mb-0.5">
				<span className="font-mono text-xs text-muted-foreground">PID {proc.pid}</span>
				{proc.labels && Object.keys(proc.labels).length > 0 && (
					<div className="flex flex-wrap gap-1">
						{Object.entries(proc.labels).map(([k, v]) => (
							<span key={k} className="font-mono text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
								{k}={v}
							</span>
						))}
					</div>
				)}
			</div>
			<div className="font-mono text-xs text-muted-foreground truncate">{proc.cmdline}</div>
		</div>
	)
}

// ============================================================
// 日志匹配调试器
// ============================================================
function LogDebugger() {
	const [pattern, setPattern] = useState("")
	const [lineText, setLineText] = useState("")
	const [loading, setLoading] = useState(false)
	const [result, setResult] = useState<LogLineResult | null>(null)

	const syntaxErr = (() => {
		if (!pattern) return null
		try { new RegExp(pattern); return null }
		catch (e: unknown) { return e instanceof Error ? e.message : "语法错误" }
	})()

	const run = async () => {
		if (!pattern || syntaxErr) return
		if (!lineText.trim()) { toast({ description: "请输入日志文本" }); return }
		setLoading(true); setResult(null)
		try {
			setResult(await debugMatchLog(pattern, lineText))
		} catch (e: unknown) {
			toast({ title: "匹配测试失败", description: String(e), variant: "destructive" })
		} finally { setLoading(false) }
	}

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>日志行正则匹配测试</CardTitle>
					<CardDescription>输入正则和单行日志文本，查看匹配结果和捕获组</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div>
						<Label className="text-xs mb-1 block">匹配正则</Label>
						<Input
							placeholder="e.g. (?P<level>ERROR|WARN)\s+(?P<msg>.*)"
							value={pattern}
							onChange={(e) => { setPattern(e.target.value); setResult(null) }}
							className="font-mono"
						/>
						{pattern && (syntaxErr
							? <p className="text-xs text-destructive mt-1 flex items-center gap-1"><XCircleIcon className="h-3 w-3" />{syntaxErr}</p>
							: <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1"><CheckCircleIcon className="h-3 w-3" />语法有效</p>
						)}
					</div>

					<div>
						<Label className="text-xs mb-1 block">日志文本（单行）</Label>
						<Input
							placeholder="e.g. 2024-01-01 ERROR failed to connect to db"
							value={lineText}
							onChange={(e) => { setLineText(e.target.value); setResult(null) }}
							className="font-mono"
							onKeyDown={(e) => e.key === "Enter" && run()}
						/>
					</div>

					<div className="flex justify-end">
						<Button size="sm" onClick={run} disabled={loading || !pattern || !!syntaxErr}>
							{loading ? <LoaderIcon className="h-4 w-4 mr-2 animate-spin" /> : <PlayIcon className="h-4 w-4 mr-2" />}
							测试匹配
						</Button>
					</div>
				</CardContent>
			</Card>

			{result && (
				<ResultCard
					matched={result.matched}
					title={result.matched ? "匹配成功" : "未匹配"}
				>
					{result.matched && (
						<>
							{result.value && (
								<div>
									<Label className="text-xs mb-1 block">匹配值</Label>
									<code className="block font-mono text-sm bg-muted/50 border border-border/60 rounded px-3 py-2 break-all">
										{result.value}
									</code>
								</div>
							)}
							{result.captures && Object.keys(result.captures).length > 0 && (
								<div>
									<Label className="text-xs mb-1.5 block">捕获组</Label>
									<div className="flex flex-wrap gap-1.5">
										{Object.entries(result.captures).map(([k, v]) => (
											<span key={k} className="font-mono text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded">
												{k}={v}
											</span>
										))}
									</div>
								</div>
							)}
						</>
					)}
				</ResultCard>
			)}
		</div>
	)
}

// ============================================================
// 公共子组件
// ============================================================

function HighlightedText({ text, highlights }: {
	text: string
	highlights: Array<{ start: number; end: number }>
}) {
	if (!highlights.length) {
		return (
			<div className="rounded-md bg-muted/50 border border-border/60 p-3 font-mono text-sm break-all text-muted-foreground">
				{text || <em>（空）</em>}
			</div>
		)
	}

	// 切分高亮区间
	const segments: Array<{ text: string; highlight: boolean }> = []
	let cursor = 0
	for (const { start, end } of highlights) {
		if (cursor < start) segments.push({ text: text.slice(cursor, start), highlight: false })
		segments.push({ text: text.slice(start, end), highlight: true })
		cursor = end
	}
	if (cursor < text.length) segments.push({ text: text.slice(cursor), highlight: false })

	return (
		<div className="rounded-md bg-muted/50 border border-border/60 p-3 font-mono text-sm break-all">
			{segments.map((seg, i) =>
				seg.highlight
					? <mark key={i} className="bg-yellow-300 dark:bg-yellow-600/70 text-inherit rounded-sm px-0.5">{seg.text}</mark>
					: <span key={i}>{seg.text}</span>
			)}
		</div>
	)
}

function GroupBadges({ groups, namedGroups }: {
	groups?: string[]
	namedGroups?: Record<string, string>
}) {
	if ((!groups || !groups.length) && (!namedGroups || !Object.keys(namedGroups).length)) return null
	return (
		<div className="space-y-1">
			{groups && groups.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{groups.map((g, i) => (
						<span key={i} className="font-mono text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
							${i + 1}={g ?? "<undef>"}
						</span>
					))}
				</div>
			)}
			{namedGroups && Object.keys(namedGroups).length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{Object.entries(namedGroups).map(([k, v]) => (
						<span key={k} className="font-mono text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded">
							?&lt;{k}&gt;={v}
						</span>
					))}
				</div>
			)}
		</div>
	)
}

function ResultCard({
	matched, title, error, children,
}: {
	matched: boolean; title: string; error?: string
	children?: React.ReactNode
}) {
	return (
		<Card className={cn(!matched && !error && "opacity-70")}>
			<CardHeader className="pb-3">
				<div className="flex items-center gap-2">
					{error
						? <XCircleIcon className="h-5 w-5 text-destructive" />
						: matched
						? <CheckCircleIcon className="h-5 w-5 text-green-500" />
						: <XCircleIcon className="h-5 w-5 text-muted-foreground" />}
					<CardTitle className="text-base">{title}</CardTitle>
				</div>
			</CardHeader>
			{(error || children) && (
				<CardContent className="pt-0 space-y-2">
					{error && <p className="text-sm text-destructive font-mono">{error}</p>}
					{children}
				</CardContent>
			)}
		</Card>
	)
}
