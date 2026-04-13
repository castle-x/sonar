/**
 * ============================================
 * 测试任务 API 接口
 * ============================================
 * 
 * 这个文件定义了与测试任务相关的所有 API 调用方法
 * 对应后端的 TaskService (task.thrift)
 * 
 * API 路径前缀: /v1/task/ (buildApiUrl 会自动添加 /apis 前缀)
 * 
 * ============================================
 * 数据结构说明
 * ============================================
 * 
 * 后端返回（嵌套结构）：
 * {
 *   id: "xxx",
 *   createdAt: 1761812501,
 *   updatedAt: 1761812501,
 *   resource: {
 *     name: "任务名称",
 *     description: "任务正文",
 *     extra_info: ["key1", "val1", ...],
 *     tags: ["tag1", "tag2"],
 *     report_ids: ["reportId1", "reportId2"],
 *     app_id: "项目ID",
 *     operator: "操作人",
 *     create_type: "web_manual",
 *     icon_name: "图标名称"
 *   }
 * }
 * 
 * 前端转换后（展平结构）：
 * {
 *   id: "xxx",
 *   name: "任务名称",
 *   description: "任务正文",
 *   extra_info: ["key1", "val1", ...],
 *   tags: ["tag1", "tag2"],
 *   report_ids: ["reportId1", "reportId2"],
 *   app_id: "项目ID",
 *   operator: "操作人",
 *   create_type: "web_manual",
 *   icon_name: "图标名称",
 *   createdAt: "2024-10-30T08:00:00Z",
 *   updatedAt: "2024-10-30T08:00:00Z"
 * }
 */

import { buildApiUrl } from "@/config/api"

// ============================================
// 类型定义
// ============================================

/**
 * 测试任务（对应 thrift 的 TestTask）
 */
export interface TestTask {
	/** 任务名称 */
	name: string
	
	/** 任务正文（富文本） */
	description?: string
	
	/** 
	 * 自定义 KV 信息
	 * 格式：偶数个元素的字符串数组，按顺序 [key1, value1, key2, value2, ...]
	 */
	extra_info?: string[]
	
	/** 标签列表 */
	tags?: string[]
	
	/** 关联报告 ID 列表（有序，可重复） */
	report_ids?: string[]
	
	/** 关联项目 ID */
	app_id?: string
	
	/** 操作人 */
	operator?: string
	
	/** 创建方式: "web_manual" | "api_call" */
	create_type?: string
	
	/** 任务图标名称 */
	icon_name?: string
}

/**
 * 任务记录（前端使用的扁平结构）
 */
export interface TaskRecord extends TestTask {
	/** 任务 ID */
	id: string
	
	/** 创建时间（ISO 8601 格式） */
	createdAt: string
	
	/** 更新时间（ISO 8601 格式） */
	updatedAt: string
}

/**
 * 分页信息
 */
export interface PageInfo {
	total: number
	page: number
	page_size: number
	total_page: number
	num: number
}

/**
 * API 响应格式
 */
interface ApiResponse<T = unknown> {
	code: number
	msg: string
	data: T[]
	page?: PageInfo
}

// ============================================
// 工具函数
// ============================================

/**
 * 将 Unix 时间戳转换为 ISO 8601 格式
 */
function unixToISO(timestamp: number): string {
	return new Date(timestamp * 1000).toISOString()
}

/**
 * 将后端返回的嵌套结构转换为前端使用的扁平结构
 */
function transformTaskRecord(raw: {
	id: string
	createdAt: number
	updatedAt: number
	resource: TestTask
}): TaskRecord {
	return {
		id: raw.id,
		...raw.resource,
		createdAt: unixToISO(raw.createdAt),
		updatedAt: unixToISO(raw.updatedAt),
	}
}

// ============================================
// API 方法
// ============================================

/**
 * 创建任务
 */
export async function createTask(task: TestTask): Promise<TaskRecord> {
	const response = await fetch(buildApiUrl("/v1/task/create"), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ task }),
	})
	
	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`)
	}
	
	const result: ApiResponse = await response.json()
	
	if (result.code !== 0) {
		throw new Error(result.msg || "创建任务失败")
	}
	
	if (!result.data || result.data.length === 0) {
		throw new Error("创建任务失败：返回数据为空")
	}
	
	return transformTaskRecord(result.data[0] as Parameters<typeof transformTaskRecord>[0])
}

/**
 * 获取单个任务详情
 */
export async function getTask(id: string): Promise<TaskRecord> {
	const response = await fetch(buildApiUrl("/v1/task/get"), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ id }),
	})
	
	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`)
	}
	
	const result: ApiResponse = await response.json()
	
	if (result.code !== 0) {
		throw new Error(result.msg || "获取任务失败")
	}
	
	if (!result.data || result.data.length === 0) {
		throw new Error("任务不存在")
	}
	
	return transformTaskRecord(result.data[0] as Parameters<typeof transformTaskRecord>[0])
}

/**
 * 获取任务列表
 */
export async function listTasks(params?: {
	page?: number
	page_size?: number
	query?: string
}): Promise<{ tasks: TaskRecord[]; page?: PageInfo }> {
	const response = await fetch(buildApiUrl("/v1/task/list"), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			page: params?.page || 0,
			page_size: params?.page_size || 0,
			query: params?.query || "",
		}),
	})
	
	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`)
	}
	
	const result: ApiResponse = await response.json()
	
	if (result.code !== 0) {
		throw new Error(result.msg || "获取任务列表失败")
	}
	
	const tasks = (result.data || []).map((item) =>
		transformTaskRecord(item as Parameters<typeof transformTaskRecord>[0])
	)
	
	return { tasks, page: result.page }
}

/**
 * 获取所有任务（不分页）
 */
export async function getAllTasks(): Promise<TaskRecord[]> {
	const { tasks } = await listTasks({ page: 0, page_size: 0 })
	return tasks
}

/**
 * 更新任务（增量更新）
 */
export async function updateTask(
	id: string,
	task: Partial<TestTask>
): Promise<TaskRecord> {
	const response = await fetch(buildApiUrl("/v1/task/update"), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ id, task }),
	})
	
	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`)
	}
	
	const result: ApiResponse = await response.json()
	
	if (result.code !== 0) {
		throw new Error(result.msg || "更新任务失败")
	}
	
	if (!result.data || result.data.length === 0) {
		throw new Error("更新任务失败：返回数据为空")
	}
	
	return transformTaskRecord(result.data[0] as Parameters<typeof transformTaskRecord>[0])
}

/**
 * 删除任务
 */
export async function deleteTask(id: string): Promise<void> {
	const response = await fetch(buildApiUrl("/v1/task/del"), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ id }),
	})
	
	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`)
	}
	
	const result: ApiResponse = await response.json()
	
	if (result.code !== 0) {
		throw new Error(result.msg || "删除任务失败")
	}
}

/**
 * 转发任务到其他 MonitorHub
 */
export async function forwardTask(taskId: string, targetUrl: string): Promise<{
	message: string
	source_id: string
	target_url: string
	target_response: unknown
}> {
	const response = await fetch(buildApiUrl("/v1/task/forward"), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			task_id: taskId,
			target_url: targetUrl,
		}),
	})
	
	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`)
	}
	
	const result: ApiResponse = await response.json()
	
	if (result.code !== 0) {
		throw new Error(result.msg || "转发任务失败")
	}
	
	if (!result.data || result.data.length === 0) {
		throw new Error("转发任务失败：返回数据为空")
	}
	
	return result.data[0] as {
		message: string
		source_id: string
		target_url: string
		target_response: unknown
	}
}

/**
 * 上传任务图标
 */
export async function uploadTaskIcon(taskId: string, file: File): Promise<TaskRecord> {
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
	
	const response = await fetch(buildApiUrl("/v1/task/icon/upload"), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			task_id: taskId,
			icon_data: base64Data,
			file_name: file.name,
		}),
	})
	
	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`)
	}
	
	const result: ApiResponse = await response.json()
	
	if (result.code !== 0) {
		throw new Error(result.msg || "上传图标失败")
	}
	
	if (!result.data || result.data.length === 0) {
		throw new Error("上传图标失败：返回数据为空")
	}
	
	return transformTaskRecord(result.data[0] as Parameters<typeof transformTaskRecord>[0])
}
