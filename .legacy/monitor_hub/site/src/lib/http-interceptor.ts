/**
 * HTTP 拦截器
 * 
 * 用于拦截所有 HTTP 响应，提取用户信息等全局数据
 */

/**
 * 从响应头中提取用户信息并触发事件
 */
export function extractUserInfoFromResponse(response: Response) {
	const userName = response.headers.get('X-User-Name')
	const userExpiration = response.headers.get('X-User-Expiration')

	if (userName && userExpiration) {
		// 触发自定义事件，通知 UserInfoButton 更新
		const event = new CustomEvent('user-info-updated', {
			detail: {
				userName,
				expiration: userExpiration,
			},
		})
		window.dispatchEvent(event)
	}
}

/**
 * 包装 fetch 函数，自动提取用户信息
 */
export async function fetchWithUserInfo(
	input: RequestInfo | URL,
	init?: RequestInit
): Promise<Response> {
	const response = await fetch(input, init)
	
	// 提取用户信息
	extractUserInfoFromResponse(response)
	
	return response
}

