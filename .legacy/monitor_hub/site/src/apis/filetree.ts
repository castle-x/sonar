/**
 * FileTree API - 文件管理接口
 */

import { buildApiUrl } from "@/config/api"
import { extractUserInfoFromResponse } from "@/lib/http-interceptor"

export interface FileNode {
	name: string
	path: string
	is_dir: boolean
	size: number
	modified_time: number
	file_count?: number
	children?: FileNode[]
}

export interface FileStats {
	total_files: number
	total_dirs: number
	total_size: number
	size_human?: string
}

export interface GetFileTreeParams {
	path?: string
	depth?: number
	include_hidden?: boolean
}

interface ApiResponse {
	code: number
	msg?: string
	data?: any[]
}

/**
 * 通用 API 请求函数
 */
async function apiRequest<T = any>(url: string, options: RequestInit = {}): Promise<T> {
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

		// 解析响应
		let result: ApiResponse
		try {
			result = await response.json()
		} catch (parseError) {
			console.error("Failed to parse JSON response:", parseError)
			throw new Error(`解析响应失败: ${response.status} ${response.statusText}`)
		}

		// 调试日志
		console.log('[FileTree API] Response:', { url, status: response.status, result })

		// 检查状态
		if (!response.ok || result.code !== 0) {
			const errorMsg = result.msg || `HTTP Error: ${response.status} ${response.statusText}`
			throw new Error(errorMsg)
		}

		// 返回第一个数据项
		if (!result.data || result.data.length === 0) {
			console.warn('[FileTree API] Empty data array:', result)
			throw new Error("未找到数据")
		}

		return result.data[0] as T
	} catch (error) {
		console.error("[FileTree API] Request Error:", error)
		throw error
	}
}

/**
 * 获取文件树
 */
export async function getFileTree(params: GetFileTreeParams = {}): Promise<FileNode> {
	const queryParams = new URLSearchParams()
	if (params.path) queryParams.append('path', params.path)
	if (params.depth !== undefined) queryParams.append('depth', String(params.depth))
	if (params.include_hidden !== undefined) queryParams.append('include_hidden', String(params.include_hidden))
	
	const url = buildApiUrl(`/v1/filetree/get?${queryParams}`)
	return apiRequest<FileNode>(url, { method: 'GET' })
}

/**
 * 获取文件下载链接
 */
export function getDownloadUrl(path: string): string {
	return buildApiUrl(`/v1/filetree/download?path=${encodeURIComponent(path)}`)
}

/**
 * 下载文件
 * 直接打开下载链接，浏览器会自动下载文件
 */
export function downloadFile(path: string): void {
	const url = getDownloadUrl(path)
	window.open(url, '_blank')
}

/**
 * 获取文件统计信息
 */
export async function getFileStats(params: GetFileTreeParams = {}): Promise<FileStats> {
	const queryParams = new URLSearchParams()
	if (params.path) queryParams.append('path', params.path)
	if (params.include_hidden !== undefined) queryParams.append('include_hidden', String(params.include_hidden))
	
	const url = buildApiUrl(`/v1/filetree/stats?${queryParams}`)
	return apiRequest<FileStats>(url, { method: 'GET' })
}

/**
 * 上传文件
 */
export async function uploadFile(path: string, file: File, overwrite = false): Promise<any> {
	const url = buildApiUrl('/v1/filetree/upload')
	
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
	
	console.log('[FileTree] Uploading file:', {
		path,
		fileName: file.name,
		fileSize: file.size,
		base64Length: base64Data.length,
		overwrite
	})
	
	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				path,
				file_data: base64Data,
				file_name: file.name,
				overwrite
			}),
		})

		extractUserInfoFromResponse(response)

		const result: ApiResponse = await response.json()

		if (!response.ok || result.code !== 0) {
			throw new Error(result.msg || '上传失败')
		}

		return result.data?.[0]
	} catch (error) {
		console.error("[FileTree] Upload Error:", error)
		throw error
	}
}

/**
 * 删除文件/目录
 */
export async function deleteFile(path: string, recursive = false): Promise<any> {
	const url = buildApiUrl('/v1/filetree/delete')
	return apiRequest(url, {
		method: 'POST',
		body: JSON.stringify({ path, recursive }),
	})
}

/**
 * 创建目录
 */
export async function createDir(path: string, recursive = true): Promise<any> {
	const url = buildApiUrl('/v1/filetree/mkdir')
	return apiRequest(url, {
		method: 'POST',
		body: JSON.stringify({ path, recursive }),
	})
}

/**
 * 批量获取文件信息的响应
 */
export interface BatchFilesResponse {
	files: FileNode[]
	not_found: string[]
}

/**
 * 批量获取文件信息
 * 根据路径列表返回对应的文件信息
 */
export async function getFilesByPaths(paths: string[]): Promise<BatchFilesResponse> {
	const url = buildApiUrl('/v1/filetree/batch')
	
	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ paths }),
	})

	extractUserInfoFromResponse(response)

	const result = await response.json()

	if (!response.ok || result.code !== 0) {
		throw new Error(result.msg || '获取文件信息失败')
	}

	return result.data?.[0] as BatchFilesResponse
}

