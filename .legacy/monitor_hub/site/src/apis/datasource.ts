/**
 * ============================================
 * 数据源 API 接口
 * ============================================
 * 
 * 这个文件定义了与数据源相关的所有 API 调用方法
 * 对应后端的 DatasourceService (datasource.thrift)
 * 
 * API 路径前缀: /apis/v1/datasource/
 * API 地址配置: 见 @/config/api.ts
 * 
 * ============================================
 * 重要：前后端数据结构说明
 * ============================================
 * 
 * 1. 后端响应格式（base.Response）：
 *    - thrift 定义：data 是 list<string>（JSON 字符串数组）
 *    - Go 实际实现：data 是 []any（为了灵活性手动修改）
 *    - 结构：{ code: number, msg: string, data: any[], page?: PageInfo }
 * 
 * 2. data 字段的处理：
 *    - 可能是对象数组：[{...}, {...}]（已序列化）
 *    - 可能是字符串数组：["...", "..."]（JSON 字符串）
 *    - 前端智能检测并自动处理
 * 
 * 3. 数据源对象的实际格式（⚠️ 重要）：
 *    后端返回（嵌套结构）：
 *    {
 *      id: "690320159dddf76a6714048f",
 *      createdAt: 1761812501,          // Unix 时间戳（秒）
 *      updatedAt: 1761812501,
 *      resource: {                     // ⚠️ 数据嵌套在 resource 中
 *        name: "数据源名称",
 *        app_id: "项目ID",
 *        pushgateway_addr_list: ["host:port"],
 *        description: "描述信息"
 *      }
 *    }
 *    
 *    前端转换后（展平结构 + 转换时间）：
 *    {
 *      id: "690320159dddf76a6714048f",
 *      name: "数据源名称",              // 从 resource 提取
 *      app_id: "项目ID",               // 从 resource 提取
 *      pushgateway_addr_list: ["host:port"],  // 从 resource 提取
 *      description: "描述信息",         // 从 resource 提取
 *      createdAt: "2024-10-30T08:00:00Z",  // 转换为 ISO 8601
 *      updatedAt: "2024-10-30T08:00:00Z"
 *    }
 * 
 * 4. 列表请求的数据结构：
 *    后端返回：
 *    {
 *      code: 0,
 *      data: [datasource1, datasource2, ...],  // 数据直接在 data 数组中
 *      page: { total: 100, page: 1, ... }      // 分页信息在 page 对象中
 *    }
 *    
 *    前端封装为：
 *    {
 *      list: [datasource1, datasource2, ...],  // 重命名为 list
 *      total: 100,                              // 提取 page.total
 *      page: 1,                                 // 提取 page.page
 *      page_size: 10                            // 提取 page.page_size
 *    }
 * 
 * ============================================
 * 提供的方法
 * ============================================
 * 
 * - createDatasource: 创建数据源
 * - updateDatasource: 更新数据源
 * - getDatasource: 获取单个数据源详情
 * - listDatasources: 获取数据源列表
 * - deleteDatasource: 删除数据源
 * - getAllDatasources: 获取所有数据源（不分页）
 * - searchDatasources: 按关键词搜索数据源
 * - validateDatasource: 客户端数据验证
 */

import { buildApiUrl, buildWsUrl } from "@/config/api"
import { WebSocketClient } from "./websocket"
import { extractUserInfoFromResponse } from "@/lib/http-interceptor"

// ============================================
// 类型定义
// ============================================

/**
 * 指标聚合配置（对应 thrift 的 MetricAggregation 结构）
 */
export interface MetricAggregation {
	/** 指标名称（必填，1-100 字符） */
	metric_name: string
	
	/** 聚合类型列表（必填，至少 1 个，例如: ["avg", "max", "min"]） */
	agg_types: string[]
}

/**
 * 汇总数据表格配置（对应 thrift 的 SummaryConfig 结构）
 */
export interface SummaryConfig {
	/** 表格名称（必填，1-100 字符） */
	name: string
	
	/** 表格左侧要展示的标签列表（例如: ["ip", "host"]） */
	labels: string[]
	
	/** 表格右侧要展示的指标及其聚合类型（按配置顺序排列） */
	metrics: MetricAggregation[]
}

/**
 * 指标配置（对应 thrift 的 MetricConfig 结构）
 */
export interface MetricConfig {
	/** 指标名称（必填，1-100 字符） */
	name: string
	
	/** 别名（可选，最大 100 字符） */
	alias?: string
	
	/** 描述信息（可选，最大 500 字符） */
	description?: string
	
	/** 单位（可选，最大 20 字符，例如: %, MB, ms） */
	unit?: string
	
	/** 单位转换表达式（可选，最大 200 字符，例如: value/1024, value*100） */
	transform?: string
	
	/** 图例显示的标签键列表（可选，仅影响图例显示，不影响数据唯一性） */
	display_labels?: string[]
	
	/** 图表列跨度（可选，'full': 占满整行, 'half': 占半行, 不设置则跟随全局布局） */
	column_span?: 'full' | 'half'
	
	/** 图表类型：area(面积图，默认), scatter(散点图，适合随机触发的稀疏数据) */
	chart_type?: 'area' | 'scatter'
}

/**
 * 数据源对象（对应 thrift 的 Datasource 结构）
 */
export interface Datasource {
	/** 数据源地址列表（必填，至少 1 个） */
	pushgateway_addr_list: string[]
	
	/** 描述信息（可选，最大 500 字符） */
	description?: string
	
	/** 项目标识（必填，1-50 字符） */
	app_id: string
	
	/** 名称（必填，1-100 字符） */
	name: string
	
	/** 分组字典（可选），组名对应一组指标配置 */
	groupmap?: Record<string, MetricConfig[]>
	
	/** 汇总数据表格配置（可选），每个元素代表一张表 */
	summary_config?: SummaryConfig[]
	
	/** 图标文件名（可选） */
	icon_name?: string
	
	/** groupmap 的排序键列表（可选），用于控制分组显示顺序（因为 map 是无序的） */
	groupmap_sort_keys?: string[]
}

/**
 * 数据源记录（带 ID 和时间戳）
 * 从后端返回的数据会包含这些额外字段
 */
export interface DatasourceRecord extends Datasource {
	/** 数据源唯一 ID */
	id: string
	
	/** 数据源状态（healthy | degraded | down） */
	status: string
	
	/** 创建时间（ISO 8601 格式） */
	createdAt: string
	
	/** 更新时间（ISO 8601 格式） */
	updatedAt: string
}

/**
 * API 通用响应格式（对应后端的 base.Response）
 * 
 * 注意：后端 Go 代码中 Data 字段的实际类型是 []any，而不是 []string
 * 虽然 thrift 定义是 list<string>，但为了灵活性，后端手动改为了 []any
 * 
 * 这意味着：
 * - data 可能是对象数组（已反序列化）
 * - data 也可能是字符串数组（需要 JSON.parse）
 * 
 * 前端需要在运行时检测并处理
 */
interface ApiResponse {
	/** 响应码（0 表示成功） */
	code: number
	
	/** 响应消息（注意字段名是 msg，不是 message） */
	msg?: string
	
	/** 数据（any 数组，可能是对象或字符串） */
	data?: any[]
	
	/** 分页信息（可选） */
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
	
	/** 查询条件（可选） */
	query?: string
	
	/** 投影字段（可选） */
	projection?: string
	
	/** 去重字段（可选） */
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
	
	/** 查询条件（注意字段名是 query，不是 keyword） */
	query?: string
	
	/** 投影字段（可选） */
	projection?: string
	
	/** 去重字段（可选） */
	distinct?: string
}

// ============================================
// 工具函数
// ============================================

/**
 * 智能解析数据项
 * 
 * 由于后端 Data 字段是 []any，可能直接返回对象，也可能返回 JSON 字符串
 * 此函数会自动检测并处理
 * 
 * @param item - 数据项（可能是对象或字符串）
 * @returns 解析后的对象
 */
function parseDataItem(item: any): any {
	// 如果是字符串，尝试 JSON.parse
	if (typeof item === "string") {
		try {
			return JSON.parse(item)
		} catch {
			// 如果解析失败，返回原字符串
			return item
		}
	}
	// 如果已经是对象，直接返回
	return item
}

/**
 * 转换后端数据源对象为前端格式
 * 
 * 后端返回格式：
 * {
 *   id: "xxx",
 *   createdAt: 1761812501,  // Unix 时间戳（秒）
 *   updatedAt: 1761812501,
 *   resource: {
 *     name: "xxx",
 *     app_id: "xxx",
 *     pushgateway_addr_list: ["host:port"],
 *     description: "xxx",
 *     status: "healthy"  // 状态字段在 resource 中
 *   }
 * }
 * 
 * 前端期望格式：
 * {
 *   id: "xxx",
 *   name: "xxx",
 *   app_id: "xxx",
 *   pushgateway_addr_list: ["host:port"],
 *   description: "xxx",
 *   status: "healthy",
 *   createdAt: "2024-10-30T08:00:00Z",  // ISO 8601 字符串
 *   updatedAt: "2024-10-30T08:00:00Z"
 * }
 */
function transformDatasourceRecord(backendData: any): DatasourceRecord {
	// 展平结构：提取 resource 中的字段
	const { id, createdAt, updatedAt, resource } = backendData
	
	return {
		id,
		// 将 Unix 时间戳（秒）转换为 ISO 8601 字符串
		createdAt: new Date(createdAt * 1000).toISOString(),
		updatedAt: new Date(updatedAt * 1000).toISOString(),
		// 展平 resource 对象的所有字段（包括 status）
		...resource,
	}
}

/**
 * API 请求类型
 */
type ApiRequestType = 
	| 'single'   // 单个资源（默认）
	| 'list'     // 列表资源
	| 'void'     // 无返回数据（如删除操作）

/**
 * 发起 API 请求的封装函数
 * 
 * 统一处理：
 * - 请求头设置（Content-Type）
 * - 错误处理
 * - 响应解析（智能处理 []any 类型的 data 字段）
 * 
 * @param url - API 路径
 * @param options - fetch 配置项
 * @param type - 请求类型（'single' | 'list' | 'void'）
 * @returns 响应数据
 * @throws 请求失败时抛出错误
 */
async function apiRequest<T = any>(url: string, options: RequestInit = {}, type: ApiRequestType = 'single'): Promise<T> {
	try {
		// 发起请求
		const response = await fetch(url, {
			headers: {
				"Content-Type": "application/json",
				...options.headers,
			},
			...options,
		})

		// 提取用户信息
		extractUserInfoFromResponse(response)

		// 解析 JSON 响应（无论状态码是否 ok，都尝试解析响应体）
		let result: ApiResponse
		try {
			result = await response.json()
		} catch (parseError) {
			// 如果响应体无法解析为 JSON，使用 HTTP 状态文本
			throw new Error(`HTTP Error: ${response.status} ${response.statusText}`)
		}

		// 检查 HTTP 状态码或业务状态码
		if (!response.ok || result.code !== 0) {
			// 优先使用后端返回的 msg，其次是 HTTP 状态文本
			const errorMsg = result.msg || `HTTP Error: ${response.status} ${response.statusText}`
			throw new Error(errorMsg)
		}

	// 根据请求类型处理响应
	switch (type) {
		case 'void':
			// 删除/更新等操作，不需要返回数据
			// 只要 code === 0 就表示成功
			return undefined as T

		case 'list':
			// 列表请求：解析所有数据项并转换格式
			if (!result.data || result.data.length === 0) {
				// 空列表，返回空数组和分页信息
				return {
					list: [],
					total: result.page?.total || 0,
					page: result.page?.page || 1,
					page_size: result.page?.page_size || 10,
				} as T
			}

			const list = result.data.map(item => {
				const parsed = parseDataItem(item)
				// 如果有 resource 字段，说明是数据源对象，需要转换
				if (parsed.resource) {
					return transformDatasourceRecord(parsed)
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
			// 单个资源请求：解析第一个数据项并转换格式
			if (!result.data || result.data.length === 0) {
				throw new Error("未找到数据")
			}

			const parsed = parseDataItem(result.data[0])
			// 如果有 resource 字段，说明是数据源对象，需要转换
			if (parsed.resource) {
				return transformDatasourceRecord(parsed) as T
			}
			return parsed as T
	}
		
	} catch (error) {
		// 统一错误处理
		console.error("API Request Error:", error)
		throw error instanceof Error ? error : new Error("未知错误")
	}
}

// ============================================
// 数据源 API 方法
// ============================================

/**
 * 列表查询响应格式（前端封装）
 * 
 * 后端返回格式：
 * {
 *   code: 0,
 *   msg: "success",
 *   data: [obj1, obj2, obj3],  // 多个数据对象直接在 data 数组中
 *   page: {                     // 分页信息
 *     total: 100,
 *     page: 1,
 *     page_size: 10,
 *     ...
 *   }
 * }
 * 
 * 前端封装为更友好的格式：
 * {
 *   list: [obj1, obj2, obj3],  // 重命名 data 为 list
 *   total: 100,                 // 提取 page.total
 *   page: 1,                    // 提取 page.page
 *   page_size: 10               // 提取 page.page_size
 * }
 */
export interface ListResponse<T> {
	/** 数据列表（对应后端的 data 数组） */
	list: T[]
	
	/** 总数（对应后端的 page.total） */
	total: number
	
	/** 当前页码（对应后端的 page.page） */
	page: number
	
	/** 每页数量（对应后端的 page.page_size） */
	page_size: number
}

/**
 * 创建数据源
 * 
 * 对应 API: POST /apis/v1/datasource/create
 * 
 * @param datasource - 数据源对象
 * @returns 创建成功的数据源记录（带 ID）
 * 
 * @example
 * ```typescript
 * const newDatasource = await createDatasource({
 *   name: "Prometheus 生产环境",
 *   app_id: "my-app",
 *   pushgateway_addr_list: ["localhost:9091"],
 *   description: "生产环境监控数据源",
 * })
 * console.log("创建成功，ID:", newDatasource.id)
 * ```
 */
export async function createDatasource(datasource: Datasource): Promise<DatasourceRecord> {
	return apiRequest<DatasourceRecord>(
		buildApiUrl("/v1/datasource/create"), 
		{
			method: "POST",
			body: JSON.stringify({ datasource }),
		},
		'single' // 返回单个资源
	)
}

/**
 * 更新数据源
 * 
 * 对应 API: POST /apis/v1/datasource/update
 * 
 * @param id - 数据源 ID
 * @param datasource - 要更新的数据源对象
 * @returns 更新后的数据源记录
 * 
 * @example
 * ```typescript
 * const updated = await updateDatasource("datasource-123", {
 *   name: "Prometheus 生产环境（更新）",
 *   app_id: "my-app",
 *   pushgateway_addr_list: ["new-address:9091"],
 * })
 * console.log("更新成功")
 * ```
 */
export async function updateDatasource(id: string, datasource: Datasource): Promise<DatasourceRecord> {
	return apiRequest<DatasourceRecord>(
		buildApiUrl("/v1/datasource/update"), 
		{
			method: "POST",
			body: JSON.stringify({ id, datasource }),
		},
		'single' // 返回单个资源
	)
}

/**
 * 获取单个数据源详情
 * 
 * 对应 API: POST /apis/v1/datasource/get
 * 
 * @param id - 数据源 ID
 * @returns 数据源详情
 * 
 * @example
 * ```typescript
 * const datasource = await getDatasource("datasource-123")
 * console.log("数据源名称:", datasource.name)
 * console.log("创建时间:", datasource.createdAt)
 * ```
 */
export async function getDatasource(id: string): Promise<DatasourceRecord> {
	return apiRequest<DatasourceRecord>(
		buildApiUrl("/v1/datasource/get"), 
		{
			method: "POST",
			body: JSON.stringify({ id }),
		},
		'single' // 返回单个资源
	)
}

/**
 * 获取数据源列表（分页查询）
 * 
 * 对应 API: POST /apis/v1/datasource/list
 * 
 * @param query - 查询参数（分页、搜索）
 * @returns 数据源列表和分页信息
 * 
 * @example
 * ```typescript
 * // 获取第 1 页，每页 10 条
 * const result = await listDatasources({ page: 1, page_size: 10 })
 * console.log("总数:", result.total)
 * console.log("数据:", result.list)
 * 
 * // 搜索 "Prometheus"
 * const searchResult = await listDatasources({ query: "Prometheus" })
 * ```
 */
export async function listDatasources(query: QueryRequest = {}): Promise<ListResponse<DatasourceRecord>> {
	return apiRequest<ListResponse<DatasourceRecord>>(
		buildApiUrl("/v1/datasource/list"), 
		{
			method: "POST",
			body: JSON.stringify(query),
		},
		'list' // 返回列表
	)
}

/**
 * 删除数据源
 * 
 * 对应 API: POST /apis/v1/datasource/del
 * 
 * @param id - 数据源 ID
 * 
 * @example
 * ```typescript
 * await deleteDatasource("datasource-123")
 * console.log("删除成功")
 * ```
 */
export async function deleteDatasource(id: string): Promise<void> {
	// 删除操作不返回数据，只检查响应码
	await apiRequest(
		buildApiUrl("/v1/datasource/del"), 
		{
			method: "POST",
			body: JSON.stringify({ id }),
		},
		'void' // 不返回数据
	)
}

/**
 * 上传数据源图标
 * 
 * 对应 API: POST /apis/v1/datasource/icon/upload
 * 
 * 支持的图片格式：png, jpg, jpeg, svg
 * 
 * @param datasourceId - 数据源 ID
 * @param file - 图标文件
 * @returns 更新后的数据源记录
 * 
 * @example
 * ```typescript
 * const fileInput = document.querySelector('input[type="file"]')
 * const file = fileInput.files[0]
 * const updatedDatasource = await uploadDatasourceIcon("datasource-123", file)
 * console.log("图标已更新:", updatedDatasource.icon_name)
 * ```
 */
export async function uploadDatasourceIcon(datasourceId: string, file: File): Promise<DatasourceRecord> {
	// 验证文件类型
	const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml']
	if (!allowedTypes.includes(file.type)) {
		throw new Error('不支持的文件格式，仅支持 png/jpg/jpeg/svg')
	}

	// 验证文件大小（最大 2MB）
	const maxSize = 2 * 1024 * 1024
	if (file.size > maxSize) {
		throw new Error('文件大小不能超过 2MB')
	}

	// 读取文件为 ArrayBuffer 并转换为 Base64
	const arrayBuffer = await file.arrayBuffer()
	const uint8Array = new Uint8Array(arrayBuffer)
	
	// 分块转换为 Base64（避免调用栈溢出）
	const chunkSize = 8192
	let binaryString = ''
	for (let i = 0; i < uint8Array.length; i += chunkSize) {
		const chunk = uint8Array.subarray(i, i + chunkSize)
		binaryString += String.fromCharCode.apply(null, Array.from(chunk))
	}
	const base64Data = btoa(binaryString)

	// 发送请求
	const response = await fetch(buildApiUrl("/v1/datasource/icon/upload"), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			datasource_id: datasourceId,
			icon_data: base64Data,
			file_name: file.name,
		}),
	})

	// 提取用户信息
	extractUserInfoFromResponse(response)

	// 解析响应
	const result = await response.json()

	// 检查响应
	if (!response.ok || result.code !== 0) {
		throw new Error(result.msg || `上传失败: ${response.status}`)
	}

	// 解析返回的数据源记录
	if (!result.data || result.data.length === 0) {
		throw new Error("未返回更新后的数据")
	}

	const parsed = parseDataItem(result.data[0])
	if (parsed.resource) {
		return transformDatasourceRecord(parsed)
	}
	return parsed
}

// ============================================
// 便捷方法（可选）
// ============================================

/**
 * 获取所有数据源（全量查询，不分页）
 * 
 * 不传分页参数，后端会返回所有数据。
 * 适用于数据源数量不多的场景（通常 < 100 个）。
 * 
 * @returns 所有数据源列表
 * 
 * @example
 * ```typescript
 * const allDatasources = await getAllDatasources()
 * console.log("共有", allDatasources.length, "个数据源")
 * ```
 */
export async function getAllDatasources(): Promise<DatasourceRecord[]> {
	// 不传分页参数，后端返回所有数据
	const result = await listDatasources({})
	return result.list
}

/**
 * 按关键词搜索数据源
 * 
 * @param keyword - 搜索关键词（匹配名称、项目ID、描述等字段）
 * @returns 匹配的数据源列表
 * 
 * @example
 * ```typescript
 * const results = await searchDatasources("Prometheus")
 * console.log("找到", results.length, "个匹配的数据源")
 * ```
 */
export async function searchDatasources(keyword: string): Promise<DatasourceRecord[]> {
	// 使用 query 字段进行搜索（对应后端的 QueryRequest.query）
	const result = await listDatasources({ query: keyword })
	return result.list
}

/**
 * 验证数据源对象是否合法
 * 
 * 在发送到后端前进行客户端验证
 * 
 * @param datasource - 要验证的数据源对象
 * @returns 验证结果 { valid: boolean, errors: string[] }
 * 
 * @example
 * ```typescript
 * const validation = validateDatasource({
 *   name: "",  // 错误：名称不能为空
 *   app_id: "my-app",
 *   pushgateway_addr_list: [],  // 错误：至少需要 1 个地址
 * })
 * 
 * if (!validation.valid) {
 *   console.error("验证失败:", validation.errors)
 * }
 * ```
 */
export function validateDatasource(datasource: Partial<Datasource>): { 
	valid: boolean
	errors: string[] 
} {
	const errors: string[] = []

	// 验证 name
	if (!datasource.name || datasource.name.trim().length === 0) {
		errors.push("名称不能为空")
	} else if (datasource.name.length > 100) {
		errors.push("名称不能超过 100 个字符")
	}

	// 验证 app_id
	if (!datasource.app_id || datasource.app_id.trim().length === 0) {
		errors.push("项目 ID 不能为空")
	} else if (datasource.app_id.length > 50) {
		errors.push("项目 ID 不能超过 50 个字符")
	}

	// 验证 pushgateway_addr_list
	if (!datasource.pushgateway_addr_list || datasource.pushgateway_addr_list.length === 0) {
		errors.push("至少需要提供 1 个数据源地址")
	} else {
		// 验证每个地址格式（host:port）
		const hostPortRegex = /^[a-zA-Z0-9.-]+:\d+$/
		datasource.pushgateway_addr_list.forEach((addr, index) => {
			if (!addr || addr.trim().length === 0) {
				errors.push(`第 ${index + 1} 个地址不能为空`)
			} else if (!hostPortRegex.test(addr.trim())) {
				errors.push(`第 ${index + 1} 个地址格式不正确: ${addr}（应为 host:port 格式，例如：localhost:9091）`)
			}
		})
	}

	// 验证 description（可选）
	if (datasource.description && datasource.description.length > 500) {
		errors.push("描述不能超过 500 个字符")
	}

	return {
		valid: errors.length === 0,
		errors,
	}
}

// ============================================
// WebSocket 订阅方法
// ============================================

/**
 * 单个 Pushgateway 地址的状态信息
 */
export interface AddressStatus {
	/** 地址（host:port） */
	address: string
	
	/** 状态：online / offline */
	status: "online" | "offline"
	
	/** 响应延迟（毫秒），offline 时为 0 */
	latency_ms: number
	
	/** 错误信息（仅在 offline 时有值） */
	error_message?: string
	
	/** 最后一次在线时间（Unix 时间戳，秒） */
	last_online_time?: number
	
	/** 总序列数 */
	total_series?: number
	
	/** 磁盘占用大小（字节） */
	disk_size?: number
	
	/** 数据保留天数 */
	retention_days?: number
	
	/** 采样点总数 */
	total_samples?: number
}

/**
 * 数据源状态信息（WebSocket 推送）
 */
export interface DatasourceStatus {
	/** 数据源ID */
	datasource_id: string
	
	/** 数据源名称 */
	name: string
	
	/** 项目标识 */
	app_id: string
	
	/** 所有 Pushgateway 地址的状态 */
	addresses: AddressStatus[]
	
	/** 整体状态 */
	overall_status: "healthy" | "degraded" | "down"
	
	/** 健康的地址数量 */
	healthy_count: number
	
	/** 总地址数量 */
	total_count: number
	
	/** 最后检查时间（Unix 时间戳，秒） */
	last_check_time: number
}

/**
 * 订阅数据源状态请求参数（对应 SubscribeDatasourceStatusRequest）
 */
export interface SubscribeDatasourceStatusRequest {
	/** 要订阅的数据源ID列表，空列表或不传表示订阅全部 */
	datasource_ids?: string[]
	
	/** 是否包含详细信息（如每个地址的状态），默认 true */
	include_details?: boolean
}

/**
 * 取消订阅请求（对应 UnsubscribeRequest）
 */
export interface UnsubscribeRequest {
	/** 要取消订阅的主题 */
	topic: string
}

/**
 * 数据源状态广播（对应 DatasourceStatusBroadcast）
 */
export interface DatasourceStatusBroadcast {
	/** 更新的数据源状态列表 */
	updates: DatasourceStatus[]
}

/**
 * WebSocket 客户端实例（单例）
 */
let wsClientInstance: WebSocketClient | null = null

/**
 * 设置 WebSocket 客户端实例
 * 
 * @param client - WebSocket 客户端实例
 */
export function setWebSocketClient(client: WebSocketClient) {
	wsClientInstance = client
}

/**
 * 获取 WebSocket 客户端实例
 */
function getWebSocketClient(): WebSocketClient {
	if (!wsClientInstance) {
		wsClientInstance = new WebSocketClient({
			url: buildWsUrl(),
			autoReconnect: true,
			reconnectInterval: 3000,
			maxReconnectAttempts: 10,
			heartbeatInterval: 30000,
			debug: import.meta.env.DEV,
		})
	}
	return wsClientInstance
}

/**
 * 订阅数据源状态推送
 * 
 * WebSocket Topic: datasource.status
 * 
 * @param request - 订阅请求参数（可选）
 * @param onData - 数据回调函数
 * @returns 取消订阅函数（调用时会向服务器发送取消订阅请求）
 * 
 * @example
 * ```typescript
 * // 订阅所有数据源状态
 * const unsubscribe = subscribeDatasourceStatus(
 *   {},
 *   (broadcast) => {
 *     console.log(`收到 ${broadcast.updates.length} 个数据源状态更新`)
 *     broadcast.updates.forEach(status => {
 *       console.log(`${status.datasource_id}: ${status.overall_status}`)
 *     })
 *   }
 * )
 * 
 * // 订阅特定数据源
 * const unsubscribe2 = subscribeDatasourceStatus(
 *   {
 *     datasource_ids: ['ds-001', 'ds-002'],
 *     include_details: true
 *   },
 *   (broadcast) => {
 *     // 处理状态更新
 *   }
 * )
 * 
 * // 取消订阅（会自动发送取消订阅请求到服务器）
 * unsubscribe()
 * ```
 */
export function subscribeDatasourceStatus(
	request: SubscribeDatasourceStatusRequest = {},
	onData: (broadcast: DatasourceStatusBroadcast) => void
): () => void {
	const client = getWebSocketClient()
	
	// WebSocketClient.subscribe 参数顺序：topic, data, callback
	// 返回的函数在调用时会自动向服务器发送取消订阅请求
	return client.subscribe<DatasourceStatusBroadcast>('datasource.status', request, onData)
}

/**
 * 显式取消订阅数据源状态推送
 * 
 * 注意：通常不需要手动调用此方法，subscribe 返回的函数已经包含了取消订阅逻辑
 * 此方法用于需要显式控制取消订阅请求的场景
 * 
 * WebSocket Topic: datasource.status
 * Path: /unsubscribe
 * 
 * @example
 * ```typescript
 * // 取消订阅数据源状态
 * unsubscribeDatasourceStatus()
 * ```
 */
export function unsubscribeDatasourceStatus(): void {
	const client = getWebSocketClient()
	
	// 发送取消订阅请求
	client.send({
		type: 'request',
		topic: 'datasource.status',
		path: '/unsubscribe',
		data: { topic: 'datasource.status' }
	})
}

// ============================================
// 导出所有方法
// ============================================

export default {
	// 基础 CRUD
	createDatasource,
	updateDatasource,
	getDatasource,
	listDatasources,
	deleteDatasource,
	
	// 图标管理
	uploadDatasourceIcon,
	
	// 便捷方法
	getAllDatasources,
	searchDatasources,
	
	// WebSocket
	setWebSocketClient,
	subscribeDatasourceStatus,
	unsubscribeDatasourceStatus,
	
	// 工具方法
	validateDatasource,
}

