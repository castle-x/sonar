/**
 * ============================================
 * API 配置
 * ============================================
 * 
 * 管理 API 请求的基础配置
 * 
 * 配置方式：
 * 1. 环境变量：VITE_API_BASE_URL（优先级最高）
 * 2. 默认值：根据环境自动选择
 */

/**
 * 获取 API 基础路径
 * 
 * 优先级：
 * 1. 环境变量 VITE_API_BASE_URL
 * 2. 开发环境：/apis（通过 Vite 代理到 http://localhost:8080）
 * 3. 生产环境：/apis（前后端同域部署）
 */
export function getApiBaseUrl(): string {
	// 1. 优先使用环境变量
	if (import.meta.env.VITE_API_BASE_URL) {
		return import.meta.env.VITE_API_BASE_URL
	}

	// 2. 根据环境自动选择
	if (import.meta.env.DEV) {
		// 开发环境：使用相对路径，通过 Vite 代理
		return "/apis"
	}

	// 3. 生产环境：使用相对路径（前后端同域）
	return "/apis"
}

/**
 * 获取 WebSocket 基础路径
 * 
 * 优先级：
 * 1. 环境变量 VITE_WS_BASE_URL
 * 2. 根据环境自动推导
 * 
 * 开发环境：
 *   - 直接连接后端 WebSocket 端口（默认 8283）
 *   - 注意：Vite 的 WebSocket proxy 在远程访问时可能不工作
 * 
 * 生产环境：
 *   - 根据当前页面协议和主机自动推导（http -> ws, https -> wss）
 */
export function getWsBaseUrl(): string {
	// 1. 优先使用环境变量
	if (import.meta.env.VITE_WS_BASE_URL) {
		return import.meta.env.VITE_WS_BASE_URL
	}

	// 2. 根据环境自动推导
	if (import.meta.env.DEV) {
		// 开发环境：直接连接后端 WebSocket 端口
		// ⚠️ 原因：Vite proxy 在远程访问时无法正确转发 WebSocket 101 响应
		// 表现：后端收到请求并返回 101，但前端收不到响应，导致连接超时和后端连接泄露
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
		const hostname = window.location.hostname
		return `${protocol}//${hostname}:8081`
	}
	
	// 生产环境：使用当前域名的 /ws 路径
	const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
	const host = window.location.host
	return `${protocol}//${host}/ws`
}

/**
 * API 配置对象
 */
export const apiConfig = {
	/** API 基础路径 */
	baseUrl: getApiBaseUrl(),
	
	/** WebSocket 基础路径 */
	wsUrl: getWsBaseUrl(),
	
	/** 请求超时时间（毫秒） */
	timeout: 30000,
	
	/** 默认请求头 */
	headers: {
		"Content-Type": "application/json",
	},
}

/**
 * 构建完整的 API URL
 * 
 * @param path - API 路径（如 "/v1/datasource/create"）
 * @returns 完整的 URL
 * 
 * @example
 * ```typescript
 * buildApiUrl("/v1/datasource/create")
 * // 开发环境: "/apis/v1/datasource/create"
 * // 生产环境: "/apis/v1/datasource/create"
 * ```
 */
export function buildApiUrl(path: string): string {
	const baseUrl = apiConfig.baseUrl.replace(/\/$/, "")  // 移除末尾斜杠
	const apiPath = path.startsWith("/") ? path : `/${path}`  // 确保路径以 / 开头
	return `${baseUrl}${apiPath}`
}

/**
 * 构建 WebSocket URL
 * 
 * @param path - WebSocket 路径（可选，默认为空）
 * @returns WebSocket URL（可能是相对路径或完整URL）
 * 
 * @example
 * ```typescript
 * // 开发环境（直连模式）
 * buildWsUrl()  // => "ws://9.135.120.94:8081/ws"  ✅ 完整URL，直连后端
 * 
 * // 生产环境
 * buildWsUrl()  // => "wss://yourdomain.com/ws"  ✅ 通过反向代理
 * 
 * buildWsUrl("/custom")  // => "ws://host:port/ws/custom"
 * ```
 */
export function buildWsUrl(path: string = ""): string {
	const wsBaseUrl = apiConfig.wsUrl
	
	// 如果 wsBaseUrl 是完整的 WebSocket URL（以 ws:// 或 wss:// 开头）
	// 这是直连模式，返回完整 URL
	if (wsBaseUrl.startsWith("ws://") || wsBaseUrl.startsWith("wss://")) {
		const baseUrl = wsBaseUrl.replace(/\/$/, "")  // 移除末尾斜杠
		const wsPath = path.startsWith("/") ? path : (path ? `/${path}` : "")
		// 开发环境直连模式：baseUrl = ws://hostname:8081，需要补充 /ws
		if (import.meta.env.DEV && !baseUrl.endsWith("/ws")) {
			return `${baseUrl}/ws${wsPath}`
		}
		return `${baseUrl}${wsPath}`
	}
	// 如果是相对路径（如 "/ws"）
	// ⚠️ 关键：直接返回相对路径，让 Vite proxy 工作！
	const baseUrl = wsBaseUrl.replace(/\/$/, "")
	const wsPath = path.startsWith("/") ? path : (path ? `/${path}` : "")
	return `${baseUrl}${wsPath}`
}

// ============================================
// 开发工具
// ============================================

/**
 * 打印当前 API 配置（仅在开发环境）
 */
if (import.meta.env.DEV) {
	console.log("📡 API 配置:", {
		baseUrl: apiConfig.baseUrl,
		wsUrl: apiConfig.wsUrl,
		timeout: apiConfig.timeout,
		environment: import.meta.env.MODE,
	})
}

