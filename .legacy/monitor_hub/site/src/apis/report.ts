/**
 * ============================================
 * 报告 API 接口
 * ============================================
 * 
 * 这个文件定义了与报告相关的所有 API 调用方法
 * 对应后端的 ReportService (report.thrift)
 * 
 * API 路径前缀: /apis/v1/report/
 * 
 * ============================================
 * 重要：数据结构说明
 * ============================================
 * 
 * 1. 后端响应格式（base.Response）：
 *    - 结构：{ code: number, msg: string, data: any[], page?: PageInfo }
 * 
 * 2. 报告对象的实际格式：
 *    后端返回（嵌套结构）：
 *    {
 *      id: "xxx",
 *      createdAt: 1761812501,          // Unix 时间戳（秒）
 *      updatedAt: 1761812501,
 *      resource: {                     // ⚠️ 数据嵌套在 resource 中
 *        name: "报告名称",
 *        datasource_id: "xxx",
 *        datasource_name: "数据源名称",   // ✅ 后端已填充
 *        app_id: "项目ID",                // ✅ 后端已填充
 *        extra_info: ["key1", "val1", "key2", "val2"], // ⚠️ 数组格式（偶数元素）
 *        cases: [...],
 *        report_status: {...}
 *      }
 *    }
 *    
 *    前端转换后（展平结构 + 转换时间）：
 *    {
 *      id: "xxx",
 *      name: "报告名称",
 *      datasource_name: "数据源名称",      // 从 resource 提取
 *      app_id: "项目ID",                  // 从 resource 提取
 *      extra_info: ["key1", "val1", ...], // 保持数组格式
 *      createdAt: "2024-10-30T08:00:00Z", // 转换为 ISO 8601
 *      updatedAt: "2024-10-30T08:00:00Z"
 *    }
 * 
 * 3. extra_info 转换工具：
 *    - extraInfoArrayToObject(): 将数组转为对象（用于前端展示）
 *    - extraInfoObjectToArray(): 将对象转为数组（用于提交后端）
 * 
 * ============================================
 * 提供的方法
 * ============================================
 * 
 * - createReport: 创建报告（异步）
 * - getReport: 获取单个报告详情
 * - listReports: 获取报告列表（分页）
 * - deleteReport: 删除报告（归档）
 * - getReportTask: 获取报告任务进度
 * - getReportChunkList: 获取报告的所有 chunks 数据
 * - getAllReports: 获取所有报告（不分页）
 */

import { buildApiUrl } from "@/config/api"
import { extractUserInfoFromResponse } from "@/lib/http-interceptor"

// ============================================
// 类型定义
// ============================================

/**
 * 查询过滤器（对应 thrift 的 QueryFilter）
 */
export interface QueryFilter {
	/** 指标名称过滤 */
	name?: string
	
	/** 标签过滤（偶数个元素，key-value对） */
	labels?: string[]
}

/**
 * 数据查询配置（对应 thrift 的 QueryConfig）
 */
export interface QueryConfig {
	/** 测试开始时间（毫秒时间戳） */
	start_time: number
	
	/** 测试结束时间（毫秒时间戳） */
	end_time: number
	
	/** 聚合间隔，如 "15s", "1m", "1h" */
	aggregation_interval: string
	
	/** 查询过滤器列表 */
	filters?: QueryFilter[]

	/** [报告专用] 需要计算 rate（每分钟频率）的指标名列表 */
	rate_metrics?: string[]
}

/**
 * 单个指标的 rate 统计结果（对应 thrift 的 RateStatistic）
 */
export interface RateStatistic {
	/** 指标名称 */
	metric_name: string

	/** 每分钟出现次数 */
	rate: number

	/** 总数据点数 */
	total_count: number

	/** 统计时长（分钟） */
	duration_minutes: number

	/** 按标签分组的 rate（可选扩展） */
	by_label?: Record<string, number>
}

/**
 * 用例的 rate 统计列表（对应 thrift 的 CaseRateStatistics）
 */
export interface CaseRateStatistics {
	/** 用例名称 */
	case_name: string

	/** rate 统计列表 */
	statistics: RateStatistic[]
}

/**
 * 单个测试用例（对应 thrift 的 SingleCase）
 */
export interface SingleCase {
	/** 压测ID（标识本次压测） */
	stress_id: string
	
	/** 用例名称 */
	name: string
	
	/** 文本描述 */
	desc?: string
	
	/** 查询和聚合配置 */
	query_config: QueryConfig
	
	/** 数据ID（响应时返回，单个chunk或分片的第一个chunk） */
	chunk_id?: string

	/** [报告专用] rate 统计结果 */
	rate_statistics?: CaseRateStatistics

	/** 数据块ID列表（支持大数据分片存储） */
	chunk_ids?: string[]
}

/**
 * 报告状态（对应 thrift 的 ReportStatus）
 */
export interface ReportStatus {
	/** 状态："running" | "completed" | "failed" */
	status: 'running' | 'completed' | 'failed'
	
	/** 错误信息 */
	error_msg: string
	
	/** 任务ID */
	task_id: string
}

/**
 * 报告对象（对应 thrift 的 Report）
 */
export interface Report {
	/** 报告名称 */
	name: string
	
	/** 报告描述 */
	description?: string
	
	/** 一或多个测试用例 */
	cases: SingleCase[]
	
	/** 
	 * 扩展信息（项目、版本、测试人员等）
	 * 格式：偶数个元素的字符串数组，按顺序 [key1, value1, key2, value2, ...]
	 * 例如：["服务器版本", "v1.2.3", "测试人员", "张三"]
	 */
	extra_info?: string[]
	
	/** 归档方式："api_call" | "web_manual" | "scheduled" */
	create_type: string
	
	/** 操作人 */
	operator?: string
	
	/** 标签，用于分类和检索 */
	tags?: string[]
	
	/** 数据源ID */
	datasource_id: string
	
	/** 报告状态信息 */
	report_status?: ReportStatus
	
	/** 数据源名称（后端填充） */
	datasource_name?: string
	
	/** 项目ID（后端填充） */
	app_id?: string
	
	/** 持续时间（如 "1h2m3s"，后端填充） */
	duration?: string
	
	/** 测试时间线（如 "2025-09-22 10:00:00 ~ 2025-09-27 18:00:00"，后端填充） */
	test_timeline?: string
	
	/** 项目图标名称（后端填充，来自数据源） */
	icon_name?: string
	
	/** 报告专属图标名称（用户上传） */
	report_icon_name?: string
	
	/** 评分配置 */
	scoring_config?: ReportScoringConfig
	
	/** 评分结果（计算后存储） */
	report_score?: ReportScore
	
	/** 指标信息（用于评分配置时提供可选项） */
	metric_info?: MetricInfo
	
	/** 发布标记：true=已发布(正式报告)，false/undefined=未发布(测试报告) */
	release?: boolean
}

/**
 * 指标信息（用于提供可选项）
 */
export interface MetricInfo {
	/** 当前报告中存在的指标列表 */
	metric_name_list?: string[]
}

// ============================================
// 评分相关类型定义
// ============================================

/**
 * 评分区间配置（用于区间评分类型）
 */
export interface ScoringRange {
	/** 区间最小值 */
	min: number
	/** 区间最大值 */
	max: number
	/** 该区间得分（0-100） */
	score: number
	/** 描述（优秀/良好/正常/繁忙/危险） */
	label: string
	/** 颜色（用于UI展示） */
	color: string
	/** 健康等级（excellent/good/normal/warning/danger） */
	level: string
}

/**
 * 阈值条件配置（用于阈值评分类型）
 * 例如：失败数=0得100分，失败数<10得80分，失败数>=10得40分
 */
export interface ThresholdCondition {
	/** 比较运算符: "<", "<=", "=", ">=", ">" */
	operator: '<' | '<=' | '=' | '>=' | '>'
	/** 阈值 */
	value: number
	/** 该条件对应的分数（0-100） */
	score: number
	/** 描述（优秀/良好/正常/警告/危险） */
	label: string
	/** 颜色（用于UI展示） */
	color: string
	/** 健康等级（excellent/good/normal/warning/danger） */
	level: string
}

/**
 * 指标评分配置
 */
export interface MetricScoringConfig {
	/** 指标名称（如 "cpu_usage"） */
	name: string
	/** 别名/显示名称（如 "CPU使用率"） */
	alias?: string
	/** 单位（如 "%", "ms"） */
	unit?: string
	/** 转换表达式（如 "value/1024", "value*100"） */
	transform?: string
	/** 权重系数（任意正数，系统自动归一化） */
	weight: number
	/** 聚合类型列表（可配置多个，如 ["avg", "p95"]；source=rate 时为 ["rate"]） */
	aggregation_types: string[]
	/** 评分类型: "range"（区间）或 "threshold"（阈值） */
	scoring_type: 'range' | 'threshold'
	/** 评分区间列表（scoring_type="range" 时使用） */
	ranges?: ScoringRange[]
	/** 阈值条件列表（scoring_type="threshold" 时使用） */
	thresholds?: ThresholdCondition[]
	/** 数据来源: "summary"（汇总表格，默认）或 "rate"（Rate统计） */
	source?: 'summary' | 'rate'
	/** N/A处理策略: "skip"（跳过，默认）, "as_zero"（视为0）, "as_value"（视为指定值） */
	na_handling?: 'skip' | 'as_zero' | 'as_value'
	/** 当 na_handling="as_value" 时使用的值 */
	na_value?: number
}

/**
 * 用例评分配置
 */
export interface CaseScoringConfig {
	/** 用例名称（为空表示默认配置） */
	case_name?: string
	/** 该用例的指标评分配置 */
	metric_configs: MetricScoringConfig[]
}

/**
 * 报告评分配置
 */
export interface ReportScoringConfig {
	/** 评分标准名称/别名（如 "Web服务标准"），用于复用时识别 */
	name?: string
	/** 默认配置（新用例使用） */
	default_config: CaseScoringConfig
	/** 特定用例配置（可选） */
	case_configs?: CaseScoringConfig[]
}

/**
 * 指标得分结果
 */
export interface MetricScore {
	/** 指标名称_聚合类型 */
	metric_name: string
	/** 显示名称 */
	display_name: string
	/** 原始指标名（不含聚合类型） */
	name?: string
	/** 转换后的值（用于区间判断） */
	value: number
	/** 原始值（转换前） */
	original_value?: number
	/** 得分（0-100） */
	score: number
	/** 加权得分 */
	weighted_score: number
	/** 健康等级 */
	level: string
	/** 真实权重占比（归一化后） */
	weight: number
	/** 单位 */
	unit: string
	/** 原始表格行数据（列名->值） */
	row_data?: Record<string, string>
	/** 是否命中评分规则（未命中则不参与评分） */
	matched?: boolean
}

/**
 * 用例得分结果
 */
export interface CaseScore {
	/** 用例名称 */
	case_name: string
	/** 用例得分（0-100） */
	score: number
	/** 加权得分（贡献到报告总分） */
	weighted_score: number
	/** 健康等级 */
	level: string
	/** 用例权重（自动平均分配） */
	weight: number
	/** 各指标得分 */
	metric_scores: MetricScore[]
}

/**
 * 报告总评分结果
 */
export interface ReportScore {
	/** 报告总分（0-100） */
	total_score: number
	/** 总体健康等级 */
	level: string
	/** 各用例得分 */
	case_scores: CaseScore[]
	/** 评估时间戳（毫秒） */
	evaluated_at: number
}

/**
 * 报告记录（带 ID 和时间戳）
 * 从后端返回的数据会包含这些额外字段
 */
export interface ReportRecord extends Report {
	/** 报告唯一 ID */
	id: string
	
	/** 创建时间（ISO 8601 格式） */
	createdAt: string
	
	/** 更新时间（ISO 8601 格式） */
	updatedAt: string
}

/**
 * Chunk 数据结构
 */
export interface ChunkData {
	/** 汇总表 */
	t: any[]  // SummaryTable[]
	
	/** 数据点 */
	p: any    // PointsResponse
}

/**
 * Chunk 数据（带元信息）
 */
export interface ChunkDataWithInfo extends ChunkData {
	/** 压缩前大小（字节） */
	original_size: number
	
	/** 数据点数量 */
	point_count: number
	
	/** 指标数量 */
	metric_count: number
}

/**
 * API 通用响应格式（对应后端的 base.Response）
 */
interface ApiResponse {
	/** 响应码（0 表示成功） */
	code: number
	
	/** 响应消息 */
	msg?: string
	
	/** 数据 */
	data?: any[]
	
	/** 分页信息 */
	page?: PageInfo
}

/**
 * 分页信息（对应 thrift 的 base.Page）
 */
interface PageInfo {
	/** 总数据量 */
	total: number
	
	/** 当前页码 */
	page?: number
	
	/** 每页大小 */
	page_size?: number
	
	/** 总页数 */
	total_page?: number
	
	/** 当前页实际数量 */
	num?: number
	
	/** 查询条件 */
	query?: string
	
	/** 投影字段 */
	projection?: string
	
	/** 去重字段 */
	distinct?: string
}

/**
 * 分页查询参数（对应 thrift 的 base.QueryRequest）
 */
export interface QueryRequest {
	/** 页码（从 1 开始） */
	page?: number
	
	/** 每页数量 */
	page_size?: number
	
	/** 查询条件（JSON 字符串） */
	query?: string
	
	/** 投影字段 */
	projection?: string
	
	/** 去重字段 */
	distinct?: string
}

/**
 * 列表查询响应格式（前端封装）
 */
export interface ListResponse<T> {
	/** 数据列表 */
	list: T[]
	
	/** 总数量 */
	total: number
	
	/** 当前页码 */
	page: number
	
	/** 每页数量 */
	page_size: number
}

// ============================================
// 工具函数
// ============================================

/**
 * 智能解析数据项
 * 
 * @param item - 数据项（可能是对象或字符串）
 * @returns 解析后的对象
 */
function parseDataItem(item: any): any {
	if (typeof item === "string") {
		try {
			return JSON.parse(item)
		} catch {
			return item
		}
	}
	return item
}

/**
 * 将 extra_info 数组转换为对象格式（便于前端使用）
 * 
 * 后端格式：["key1", "value1", "key2", "value2"]
 * 前端格式：{ key1: "value1", key2: "value2" }
 * 
 * @param extraInfo - extra_info 数组
 * @returns 转换后的对象，如果输入为 undefined 或长度为 0 则返回空对象
 * 
 * @example
 * ```typescript
 * const obj = extraInfoArrayToObject(["服务器版本", "v1.2.3", "测试人员", "张三"])
 * // { "服务器版本": "v1.2.3", "测试人员": "张三" }
 * ```
 */
export function extraInfoArrayToObject(extraInfo?: string[]): Record<string, string> {
	if (!extraInfo || extraInfo.length === 0) {
		return {}
	}
	
	const result: Record<string, string> = {}
	for (let i = 0; i < extraInfo.length; i += 2) {
		if (i + 1 < extraInfo.length) {
			result[extraInfo[i]] = extraInfo[i + 1]
		}
	}
	return result
}

/**
 * 将对象格式转换为 extra_info 数组（用于提交到后端）
 * 
 * 前端格式：{ key1: "value1", key2: "value2" }
 * 后端格式：["key1", "value1", "key2", "value2"]
 * 
 * @param obj - 对象
 * @returns 转换后的数组
 * 
 * @example
 * ```typescript
 * const arr = extraInfoObjectToArray({ "服务器版本": "v1.2.3", "测试人员": "张三" })
 * // ["服务器版本", "v1.2.3", "测试人员", "张三"]
 * ```
 */
export function extraInfoObjectToArray(obj: Record<string, string>): string[] {
	const result: string[] = []
	for (const [key, value] of Object.entries(obj)) {
		result.push(key, value)
	}
	return result
}

/**
 * 转换后端报告对象为前端格式
 * 
 * 后端返回格式：
 * {
 *   id: "xxx",
 *   createdAt: 1761812501,  // Unix 时间戳（秒）
 *   updatedAt: 1761812501,
 *   resource: {
 *     name: "xxx",
 *     datasource_id: "xxx",
 *     datasource_name: "xxx",  // 后端已填充
 *     app_id: "xxx",           // 后端已填充
 *     cases: [...],
 *     report_status: {...}
 *   }
 * }
 * 
 * 前端期望格式：
 * {
 *   id: "xxx",
 *   name: "xxx",
 *   datasource_name: "xxx",
 *   app_id: "xxx",
 *   createdAt: "2024-10-30T08:00:00Z",  // ISO 8601 字符串
 *   updatedAt: "2024-10-30T08:00:00Z"
 * }
 */
function transformReportRecord(backendData: any): ReportRecord {
	const { id, createdAt, updatedAt, resource } = backendData
	
	return {
		id,
		// 将 Unix 时间戳（秒）转换为 ISO 8601 字符串，容错处理缺失的时间字段
		createdAt: createdAt ? new Date(createdAt * 1000).toISOString() : '',
		updatedAt: updatedAt ? new Date(updatedAt * 1000).toISOString() : '',
		// 展平 resource 对象的所有字段
		...resource,
	}
}

/**
 * API 请求类型
 */
type ApiRequestType = 
	| 'single'   // 单个资源
	| 'list'     // 列表资源
	| 'void'     // 无返回数据
	| 'raw'      // 原始数据（不转换）

/**
 * 发起 API 请求的封装函数
 * 
 * @param url - API 路径
 * @param options - fetch 配置项
 * @param type - 请求类型
 * @returns 响应数据
 * @throws 请求失败时抛出错误
 */
async function apiRequest<T = any>(url: string, options: RequestInit = {}, type: ApiRequestType = 'single'): Promise<T> {
	try {
		const response = await fetch(url, {
			headers: {
				"Content-Type": "application/json",
				...options.headers,
			},
			...options,
		})

		// 提取用户信息
		extractUserInfoFromResponse(response)

		// 解析 JSON 响应
		let result: ApiResponse
		try {
			const text = await response.text()
			// 检查是否返回了 HTML（说明路由没有被正确处理）
			if (text.startsWith('<!') || text.startsWith('<html')) {
				console.error('[API Response] 收到 HTML 响应，可能是后端服务需要重启:', text.substring(0, 200))
				throw new Error('后端服务需要重启以加载新路由，请重启后端服务后重试')
			}
			result = JSON.parse(text)
		} catch (parseError) {
			if (parseError instanceof Error && parseError.message.includes('后端服务需要重启')) {
				throw parseError
			}
			console.error('[API Response] JSON parse failed:', parseError)
			throw new Error(`响应解析失败: ${response.status} ${response.statusText}`)
		}

		// 检查状态码
		if (!response.ok || result.code !== 0) {
			const errorMsg = result.msg || `HTTP Error: ${response.status} ${response.statusText}`
			throw new Error(errorMsg)
		}

		// 根据请求类型处理响应
		switch (type) {
			case 'void':
				// 删除/更新等操作，不需要返回数据
				return undefined as T

			case 'raw':
				// 返回原始数据（不做任何转换）
				if (!result.data || result.data.length === 0) {
					return undefined as T
				}
				return parseDataItem(result.data[0]) as T

			case 'list':
				// 列表请求：解析所有数据项并转换格式
				if (!result.data || result.data.length === 0) {
					return {
						list: [],
						total: result.page?.total || 0,
						page: result.page?.page || 1,
						page_size: result.page?.page_size || 10,
					} as T
				}

				const list = result.data.map(item => {
					const parsed = parseDataItem(item)
					// 如果有 resource 字段，说明是报告对象，需要转换
					if (parsed.resource) {
						return transformReportRecord(parsed)
					}
					return parsed
				})

				return {
					list,
					total: result.page?.total || list.length,
					page: result.page?.page || 1,
					page_size: result.page?.page_size || list.length,
				} as T

			case 'single':
			default:
				// 单个资源请求
				if (!result.data || result.data.length === 0) {
					throw new Error("未找到数据")
				}

				const parsed = parseDataItem(result.data[0])
				// 如果有 resource 字段，需要转换
				if (parsed.resource) {
					return transformReportRecord(parsed) as T
				}
				return parsed as T
		}
		
	} catch (error) {
		console.error("API Request Error:", error)
		throw error instanceof Error ? error : new Error("未知错误")
	}
}

// ============================================
// 报告 API 方法
// ============================================

/**
 * 创建报告（异步处理）
 * 
 * 对应 API: POST /apis/v1/report/create
 * 
 * 立即返回 report_id，后台异步查询和聚合数据
 * 
 * @param report - 报告对象
 * @returns 创建成功的报告记录（带 ID 和 task_id）
 * 
 * @example
 * ```typescript
 * // 使用辅助函数转换 extra_info
 * const extraInfo = extraInfoObjectToArray({
 *   "服务器版本": "v1.2.3",
 *   "测试人员": "张三"
 * })
 * 
 * const newReport = await createReport({
 *   name: "性能测试报告 2024-12-02",
 *   datasource_id: "ds-001",
 *   create_type: "web_manual",
 *   operator: "张三",
 *   extra_info: extraInfo, // ["服务器版本", "v1.2.3", "测试人员", "张三"]
 *   cases: [
 *     {
 *       stress_id: "stress-001",
 *       name: "基线测试",
 *       query_config: {
 *         start_time: 1701504000000,
 *         end_time: 1701507600000,
 *         aggregation_interval: "1m"
 *       }
 *     }
 *   ]
 * })
 * console.log("报告ID:", newReport.id)
 * console.log("任务ID:", newReport.report_status?.task_id)
 * ```
 */
export async function createReport(report: Report): Promise<ReportRecord> {
	return apiRequest<ReportRecord>(
		buildApiUrl("/v1/report/create"),
		{
			method: "POST",
			body: JSON.stringify(report),
		},
		'single'
	)
}

/**
 * 获取单个报告详情
 * 
 * 对应 API: POST /apis/v1/report/get
 * 
 * @param id - 报告 ID
 * @returns 报告详情
 * 
 * @example
 * ```typescript
 * const report = await getReport("report-123")
 * console.log("报告名称:", report.name)
 * console.log("用例数量:", report.cases.length)
 * ```
 */
export async function getReport(id: string): Promise<ReportRecord> {
	return apiRequest<ReportRecord>(
		buildApiUrl("/v1/report/get"),
		{
			method: "POST",
			body: JSON.stringify({ id }),
		},
		'single'
	)
}

/**
 * 获取报告列表（分页查询）
 * 
 * 对应 API: POST /apis/v1/report/list
 * 
 * @param query - 查询参数（分页、搜索）
 * @returns 报告列表和分页信息
 * 
 * @example
 * ```typescript
 * // 获取第 1 页，每页 20 条
 * const result = await listReports({ page: 1, page_size: 20 })
 * console.log("总数:", result.total)
 * console.log("报告列表:", result.list)
 * 
 * // 按状态筛选
 * const completed = await listReports({ 
 *   page: 1, 
 *   page_size: 20,
 *   query: JSON.stringify({ "report_status.status": "completed" })
 * })
 * ```
 */
export async function listReports(query: QueryRequest = {}): Promise<ListResponse<ReportRecord>> {
	return apiRequest<ListResponse<ReportRecord>>(
		buildApiUrl("/v1/report/list"),
		{
			method: "POST",
			body: JSON.stringify(query),
		},
		'list'
	)
}

/**
 * 删除报告（归档）
 * 
 * 对应 API: POST /apis/v1/report/del
 * 
 * @param id - 报告 ID
 * 
 * @example
 * ```typescript
 * await deleteReport("report-123")
 * console.log("报告已归档")
 * ```
 */
export async function deleteReport(id: string): Promise<void> {
	await apiRequest(
		buildApiUrl("/v1/report/del"),
		{
			method: "POST",
			body: JSON.stringify({ id }),
		},
		'void'
	)
}

/**
 * 更新报告的测试信息（增量更新）
 * 
 * 对应 API: POST /apis/v1/report/update
 * 
 * 可更新的字段：
 * - name: 报告名称
 * - description: 报告描述
 * - extra_info: 扩展信息（偶数个元素数组）
 * - tags: 标签列表
 * - icon_name: 图标文件名
 * - test_timeline: 测试时间线
 * 
 * @param id - 报告 ID
 * @param data - 要更新的字段（增量更新，只传需要修改的字段）
 * @returns 更新后的报告详情
 * 
 * @example
 * ```typescript
 * const updatedReport = await updateReport("report-123", {
 *   test_timeline: "2025-12-02 14:15:26 ~ 2025-12-02 15:45:26",
 *   extra_info: ["测试人", "@castlexu{{red}}", "测试集群", "stresstest2"],
 *   tags: ["Debug{{blue}}", "单DS"]
 * })
 * console.log("更新后的报告:", updatedReport)
 * ```
 */
export async function updateReport(
	id: string, 
	data: {
		name?: string
		description?: string
		test_timeline?: string
		extra_info?: string[]
		tags?: string[]
		icon_name?: string
		scoring_config?: ReportScoringConfig
		release?: boolean
		file_list?: string[]
	}
): Promise<ReportRecord> {
	// 后端格式: { id: string, report: Report }
	return apiRequest<ReportRecord>(
		buildApiUrl("/v1/report/update"),
		{
			method: "POST",
			body: JSON.stringify({ 
				id, 
				report: data 
			}),
		},
		'single'
	)
}

/**
 * 获取报告任务进度
 * 
 * 对应 API: POST /apis/v1/report/task/get
 * 
 * @param id - 报告 ID
 * @returns 任务状态和进度信息
 * 
 * @example
 * ```typescript
 * const task = await getReportTask("report-123")
 * console.log("任务状态:", task.status)
 * console.log("进度:", task.progress_percent, "%")
 * ```
 */
export async function getReportTask(id: string): Promise<any> {
	return apiRequest<any>(
		buildApiUrl("/v1/report/task/get"),
		{
			method: "POST",
			body: JSON.stringify({ id }),
		},
		'raw'  // 返回原始数据
	)
}

/**
 * 获取单个 Chunk 数据（按需加载）
 * 
 * 对应 API: POST /apis/v1/chunk/get
 * 
 * @param chunkId - Chunk ID（来自 SingleCase.chunk_id）
 * @returns Chunk 数据（已解压）
 * 
 * @example
 * ```typescript
 * const chunk = await getChunk("chunk-123")
 * console.log("数据点数量:", chunk.point_count)
 * console.log("汇总表数量:", chunk.t.length)
 * ```
 */
export async function getChunk(chunkId: string): Promise<ChunkDataWithInfo> {
	return apiRequest<ChunkDataWithInfo>(
		buildApiUrl("/v1/chunk/get"),
		{
			method: "POST",
			body: JSON.stringify({ id: chunkId }),
		},
		'raw'  // 返回原始数据（已解压的 chunk 数据）
	)
}

/**
 * 获取报告的所有 Chunk 数据
 * 
 * 对应 API: POST /apis/v1/report/chunk/list
 * 
 * @param reportId - 报告 ID
 * @returns Chunk 数据列表（已解压）
 * 
 * @example
 * ```typescript
 * const chunks = await getReportChunkList("report-123")
 * console.log("Chunk 数量:", chunks.length)
 * chunks.forEach((chunk, index) => {
 *   console.log(`Chunk ${index + 1}:`, chunk.point_count, "个数据点")
 * })
 * ```
 */
export async function getReportChunkList(reportId: string): Promise<ChunkDataWithInfo[]> {
	return apiRequest<ChunkDataWithInfo[]>(
		buildApiUrl("/v1/report/chunk/list"),
		{
			method: "POST",
			body: JSON.stringify({ id: reportId }),
		},
		'raw'  // 返回原始数据（已解压的 chunk 数据）
	)
}

/**
 * 上传报告图标
 * 
 * 对应 API: POST /apis/v1/report/icon/upload
 * 
 * @param reportId - 报告 ID
 * @param file - 图标文件
 * @returns 更新后的报告详情
 * 
 * @example
 * ```typescript
 * const fileInput = document.querySelector('input[type="file"]')
 * const file = fileInput.files[0]
 * const updatedReport = await uploadReportIcon("report-123", file)
 * console.log("新图标:", updatedReport.report_icon_name)
 * ```
 */
export async function uploadReportIcon(reportId: string, file: File): Promise<ReportRecord> {
	// 验证文件类型
	const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml']
	if (!allowedTypes.includes(file.type)) {
		throw new Error('不支持的文件格式，仅支持 PNG、JPG、SVG')
	}
	
	// 验证文件大小（最大 2MB）
	const maxSize = 2 * 1024 * 1024
	if (file.size > maxSize) {
		throw new Error('文件大小不能超过 2MB')
	}
	
	// 将文件转换为 Base64（分块处理避免栈溢出）
	const arrayBuffer = await file.arrayBuffer()
	const uint8Array = new Uint8Array(arrayBuffer)
	
	// 分块转换为 base64
	const CHUNK_SIZE = 8192
	let binaryString = ''
	for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
		const chunk = uint8Array.slice(i, Math.min(i + CHUNK_SIZE, uint8Array.length))
		binaryString += String.fromCharCode(...chunk)
	}
	const base64Data = btoa(binaryString)
	
	return apiRequest<ReportRecord>(
		buildApiUrl("/v1/report/icon/upload"),
		{
			method: "POST",
			body: JSON.stringify({
				report_id: reportId,
				icon_data: base64Data,
				file_name: file.name,
			}),
		},
		'single'
	)
}

/**
 * 计算报告评分
 * 
 * @param reportId - 报告ID
 * @returns 报告评分结果
 * 
 * @example
 * ```typescript
 * const score = await calculateReportScore("report-id-123")
 * console.log("报告总分:", score.total_score)
 * console.log("健康等级:", score.level)
 * ```
 */
export async function calculateReportScore(reportId: string): Promise<ReportScore> {
	return apiRequest<ReportScore>(
		buildApiUrl("/v1/report/score/calculate"),
		{
			method: "POST",
			body: JSON.stringify({ id: reportId }),
		},
		'single'
	)
}

/**
 * 重载报告响应
 */
export interface ReloadReportResponse {
	report_id: string
	task_id: string
	status: string
}

/**
 * 重载报告数据
 * 
 * 从 Pushgateway 重新查询原始数据并重新聚合，生成新的 Chunk 数据
 * 
 * @param reportId - 报告ID
 * @returns 任务信息（异步处理）
 * 
 * @example
 * ```typescript
 * const result = await reloadReport("report-id-123")
 * console.log("任务ID:", result.task_id)
 * // 可以通过 getReportTask 查询进度
 * ```
 */
export async function reloadReport(reportId: string): Promise<ReloadReportResponse> {
	return apiRequest<ReloadReportResponse>(
		buildApiUrl("/v1/report/reload"),
		{
			method: "POST",
			body: JSON.stringify({ id: reportId }),
		},
		'single'
	)
}

/**
 * 转发报告响应
 */
export interface ForwardReportResponse {
	message: string
	source_id: string
	target_url: string
	chunk_count: number
	target_response: unknown
}

/**
 * 转发报告到其他 MonitorHub
 * 
 * @param reportId - 报告ID
 * @param targetUrl - 目标 MonitorHub 地址（如 http://192.168.1.100:8081）
 * @returns 转发结果
 */
export async function forwardReport(reportId: string, targetUrl: string): Promise<ForwardReportResponse> {
	return apiRequest<ForwardReportResponse>(
		buildApiUrl("/v1/report/forward"),
		{
			method: "POST",
			body: JSON.stringify({
				report_id: reportId,
				target_url: targetUrl,
			}),
		},
		'single'
	)
}

// ============================================
// 便捷方法
// ============================================

/**
 * 获取所有报告（全量查询，不分页）
 * 
 * @returns 所有报告列表
 * 
 * @example
 * ```typescript
 * const allReports = await getAllReports()
 * console.log("共有", allReports.length, "个报告")
 * ```
 */
export async function getAllReports(): Promise<ReportRecord[]> {
	const result = await listReports({})
	return result.list
}

/**
 * 按状态筛选报告
 * 
 * @param status - 报告状态
 * @returns 匹配的报告列表
 * 
 * @example
 * ```typescript
 * const completedReports = await getReportsByStatus("completed")
 * const processingReports = await getReportsByStatus("processing")
 * ```
 */
export async function getReportsByStatus(status: 'processing' | 'completed' | 'failed'): Promise<ReportRecord[]> {
	const result = await listReports({
		query: JSON.stringify({ "report_status.status": status })
	})
	return result.list
}

/**
 * 按数据源ID筛选报告
 * 
 * @param datasourceId - 数据源 ID
 * @returns 匹配的报告列表
 * 
 * @example
 * ```typescript
 * const reports = await getReportsByDatasource("ds-001")
 * ```
 */
export async function getReportsByDatasource(datasourceId: string): Promise<ReportRecord[]> {
	const result = await listReports({
		query: JSON.stringify({ datasource_id: datasourceId })
	})
	return result.list
}

// ============================================
// 导出所有方法
// ============================================

export default {
	// 基础 CRUD
	createReport,
	getReport,
	listReports,
	updateReport,
	deleteReport,
	
	// 任务和数据
	getReportTask,
	getChunk,
	getReportChunkList,
	
	// 图标上传
	uploadReportIcon,
	
	// 便捷方法
	getAllReports,
	getReportsByStatus,
	getReportsByDatasource,
}

