// 通用 API 请求封装

// 后端响应格式
export interface ApiResponse<T> {
  code: number
  msg: string
  data: T[]
}

// 通用请求配置
interface RequestOptions extends RequestInit {
  timeout?: number
}

// 请求错误
export class ApiError extends Error {
  code: number
  constructor(message: string, code: number) {
    super(message)
    this.code = code
    this.name = 'ApiError'
  }
}

// 基础请求函数
async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { timeout = 30000, ...fetchOptions } = options

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new ApiError(`HTTP Error: ${response.status}`, response.status)
    }

    const result: ApiResponse<T> = await response.json()

    if (result.code !== 0) {
      throw new ApiError(result.msg || '请求失败', result.code)
    }

    // 后端返回的 data 是数组，取第一个元素
    if (result.data && result.data.length > 0) {
      return result.data[0]
    }

    return {} as T
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof ApiError) {
      throw error
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('请求超时', -1)
    }
    throw new ApiError('网络错误', -1)
  }
}

// GET 请求
export async function get<T>(url: string, params?: Record<string, string | number | undefined>): Promise<T> {
  let fullUrl = url
  if (params) {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value))
      }
    })
    const queryString = searchParams.toString()
    if (queryString) {
      fullUrl += `?${queryString}`
    }
  }
  return request<T>(fullUrl, { method: 'GET' })
}

// POST 请求
export async function post<T>(url: string, data?: unknown): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  })
}
