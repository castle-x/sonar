/**
 * Exporter 管理 API 客户端
 *
 * 配置接口：
 *   GET   /api/v1/config               查看当前配置
 *   PUT   /api/v1/config               全量更新+持久化+热更新
 *   POST  /api/v1/config/reload        热重载（从磁盘读取）
 *   PATCH /api/v1/config/node          仅更新 node_exporter 段
 *   PATCH /api/v1/config/process       仅更新 process_exporter 段
 *   PATCH /api/v1/config/log           仅更新 log_config 段
 *
 * 状态接口：
 *   GET /api/v1/health                 健康检查
 *   GET /api/v1/stats                  watcher 汇总统计
 *   GET /api/v1/watchers               所有 watcher 详情
 *   GET /api/v1/debug/status           整体状态快照
 *   GET /api/v1/processes              当前机器所有进程
 *   GET /api/v1/metrics/preview?n=50   最近 N 条指标预览
 *
 * 调试接口：
 *   POST /api/v1/debug/regex           正则匹配 + 高亮
 *   POST /api/v1/debug/match_process   进程 cmdline 匹配测试
 *   POST /api/v1/debug/match_log       日志行正则匹配测试
 */

const BASE = "/api/v1"

// 后端统一响应格式
interface ApiResponse<T> {
	code: number
	message?: string
	data?: T
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
	const res = await fetch(`${BASE}${path}`, {
		method,
		headers: body ? { "Content-Type": "application/json" } : {},
		body: body ? JSON.stringify(body) : undefined,
	})
	if (!res.ok) {
		const text = await res.text()
		throw new Error(`HTTP ${res.status}: ${text}`)
	}
	const json = (await res.json()) as ApiResponse<T>
	if (json.code !== 0) {
		throw new Error(json.message ?? `API error code ${json.code}`)
	}
	return json.data as T
}

// ============================================================
// 配置类型定义（对齐 config/config.go）
// ============================================================

export interface ExtractConfig {
	/** 提取类型：default / split / regex */
	type: "default" | "split" | "regex"
	/** 分隔符（split 模式） */
	sep?: string
	/** 正则表达式（regex 模式） */
	pattern?: string
	/** 标签映射 */
	labels?: Record<string, string>
}

export interface ProcessRule {
	/** 直接指定 PID（可选） */
	pid?: number
	/** 进程名称 */
	name: string
	/** 命令行过滤条件（!前缀代表反选） */
	cmdlines?: string[]
	/** 从命令行中提取日志路径的正则（log_exporter 专用） */
	log_path_pattern?: string
	/** 标签提取规则 */
	extracts?: ExtractConfig[]
}

export interface MetricConfig {
	name: string
	help?: string
	/** 匹配正则 */
	pattern: string
	enabled: boolean
	/** 采样密度（秒），0 代表不限制 */
	density?: number
	/** 时间戳字段索引，如 "$1" */
	timestamp?: string
	timestamp_format?: string
	time_zone?: string
	/** 值字段索引，如 "$2" */
	value?: string
	labels?: Record<string, string>
	is_record_minute_count?: boolean
}

export interface WatchConfig {
	poll_interval?: string
	use_inotify?: boolean
	rotate_check_interval?: string
	max_retries?: number
}

export interface LogConfig {
	name: string
	file_path: string
	rules?: ProcessRule[]
	dynamic_interval?: number
	encoding?: string
	enabled: boolean
	read_mode?: "tail" | "head"
	max_file_size_mb?: number
	time_zone?: string
	watch?: WatchConfig
	metrics?: MetricConfig[]
}

export interface PushGateway {
	app_id?: string
	enabled: boolean
	host?: string
	req_timeout?: number
	report_interval?: number
	buf_size?: number
	print_metrics?: boolean
	labels?: Record<string, string>
	channel_size?: number
}

export interface ProcessExporter {
	enabled: boolean
	dynamic_interval?: number
	rules?: ProcessRule[]
}

export interface NodeExporter {
	enabled: boolean
	labels?: Record<string, string>
}

export interface ExporterConfig {
	step?: number
	push_gateway: PushGateway
	process_exporter: ProcessExporter
	node_exporter: NodeExporter
	log_config?: LogConfig[]
}

// ============================================================
// WatcherStats 类型（对齐 watcher/watcher.go）
// ============================================================

export interface WatcherStats {
	files_watched: number
	lines_processed: number
	errors: number
	retries: number
	file_rotations: number
	last_process_time: string
	uptime: number
	current_files: string[]
	current_files_pid_map: Record<number, string>
}

// ============================================================
// debug/status 快照类型
// ============================================================

export interface DebugStatus {
	config: ExporterConfig
	watcher_total: WatcherStats
	watcher_details: Record<string, WatcherStats>
	watcher_count: number
}

// ============================================================
// 调试接口类型定义
// ============================================================

/**
 * POST /api/v1/debug/regex 响应（直接返回对象，无 code/data 包装）
 * groups: 位置捕获组数组
 * named_groups: 命名捕获组对象
 */
export interface RegexDebugResult {
	matched: boolean
	groups?: string[]
	named_groups?: Record<string, string>
	error?: string
}

/** GET /api/v1/processes 单条进程 */
export interface ProcessInfo {
	pid: number
	cmdline: string
	labels?: Record<string, string>
}

/**
 * POST /api/v1/debug/match_process
 * 请求：{ cmdlines: string[], name?: string }
 * 响应：{ processes: [...] }
 */
export interface MatchProcessResult {
	processes: ProcessInfo[]
}

/**
 * POST /api/v1/debug/match_log
 * 请求：{ pattern: string, text: string }（单行）
 * 响应：{ matched: bool, value: string, captures: {...} }
 */
export interface LogLineResult {
	matched: boolean
	value: string
	captures?: Record<string, string>
}

/** GET /api/v1/metrics/preview 单条指标 */
export interface MetricSample {
	name: string
	labels: Record<string, string>
	value: number
	timestamp?: number
}

// ============================================================
// 本地正则调试（兜底，无需后端）
// ============================================================

export function debugRegexLocal(pattern: string, input: string): RegexDebugResult {
	try {
		const re = new RegExp(pattern)
		const match = re.exec(input)
		if (!match) return { matched: false }
		return {
			matched: true,
			groups: match.slice(1),
			named_groups: match.groups ? { ...match.groups } : undefined,
		}
	} catch (e: unknown) {
		return { matched: false, error: e instanceof Error ? e.message : String(e) }
	}
}

// ============================================================
// API 函数
// ============================================================

/** 健康检查 */
export const getHealth = () =>
	fetch(`${BASE}/health`).then((r) => r.json() as Promise<{ status: string }>)

/** 获取完整配置 */
export const getConfig = () => request<ExporterConfig>("GET", "/config")

/** 全量更新配置（持久化 + 热更新） */
export const putConfig = (config: ExporterConfig) =>
	request<void>("PUT", "/config", config)

/** 热重载配置（从磁盘重新加载） */
export const reloadConfig = () => request<void>("POST", "/config/reload")

/** 仅更新 node_exporter 段 */
export const patchNodeConfig = (node: NodeExporter) =>
	request<void>("PATCH", "/config/node", node)

/** 仅更新 process_exporter 段 */
export const patchProcessConfig = (process: ProcessExporter) =>
	request<void>("PATCH", "/config/process", process)

/** 仅更新 log_config 段 */
export const patchLogConfig = (logConfig: LogConfig[]) =>
	request<void>("PATCH", "/config/log", logConfig)

/** 获取 watcher 汇总统计 */
export const getStats = () => request<WatcherStats>("GET", "/stats")

/** 获取所有 watcher 详情 */
export const getWatchers = () =>
	fetch(`${BASE}/watchers`)
		.then((r) => r.json())
		.then((json: { code: number; count: number; data: Record<string, WatcherStats> }) => {
			if (json.code !== 0) throw new Error("API error")
			return { count: json.count, data: json.data }
		})

/** 获取整体状态快照（config + stats + watchers） */
export const getDebugStatus = () => request<DebugStatus>("GET", "/debug/status")

/** 获取当前机器所有进程（响应直接为 { processes: [...] }，无 code/data 包装） */
export const getProcesses = () =>
	fetch(`${BASE}/processes`)
		.then((r) => r.json() as Promise<{ processes: ProcessInfo[] }>)
		.then((json) => json.processes)

/** 获取最近指标预览（query param: limit，默认 50） */
export const getMetricsPreview = (limit = 50) =>
	request<MetricSample[]>("GET", `/metrics/preview?limit=${limit}`)

/** 调试：正则匹配（响应直接返回对象，无 code/data 包装） */
export const debugRegex = (pattern: string, input: string) =>
	fetch(`${BASE}/debug/regex`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ pattern, input }),
	}).then((r) => r.json() as Promise<RegexDebugResult>)

/** 调试：进程 cmdline 匹配测试，支持可选 name 字段 */
export const debugMatchProcess = (cmdlines: string[], name?: string) =>
	request<MatchProcessResult>("POST", "/debug/match_process", { cmdlines, ...(name ? { name } : {}) })

/** 调试：单行日志正则匹配测试，响应 { matched, value, captures } */
export const debugMatchLog = (pattern: string, text: string) =>
	request<LogLineResult>("POST", "/debug/match_log", { pattern, text })
