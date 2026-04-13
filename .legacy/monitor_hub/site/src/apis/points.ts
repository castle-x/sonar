/**
 * ============================================
 * 聚合数据点 API 接口
 * ============================================
 * 
 * 这个文件定义了与聚合数据点相关的所有通讯方法
 * 包括 HTTP API 和 WebSocket 订阅
 * 
 * API 路径前缀: /apis/v1/points/
 * WebSocket 路径: /ws
 * 
 * ============================================
 * 数据结构说明
 * ============================================
 * 
 * 1. 扁平化设计：
 *    - 每个指标的每个聚合类型是一个独立的数据点
 *    - 例如 cpu_usage 会产生 5 个点：avg, min, max, count, last
 * 
 * 2. 聚合级别：
 *    - 15s, 1m, 5m, 30m, 1h, 6h (根据配置)
 *    - 推荐通过 WebSocket 订阅小级别（15s-5m）
 *    - 大级别建议通过 HTTP API 查询
 * 
 * 3. 数据质量：
 *    - complete: 完整数据
 *    - partial: 部分数据
 *    - degraded: 降级数据
 *    - missing: 缺失数据
 * 
 * ============================================
 */

import { buildApiUrl, buildWsUrl } from "@/config/api"
import { WebSocketClient } from "./websocket"
import { extractUserInfoFromResponse } from "@/lib/http-interceptor"
import type { CompressedPointsResponse } from "./points-compressed"

// ============================================
// 类型定义
// ============================================

/**
 * 数据质量信息
 */
export interface DataQuality {
  /** 实际采样点数 */
  actual_points: number
  
  /** 期望采样点数 */
  expected_points: number
  
  /** 质量分数（0-100） */
  score: number
  
  /** 数据状态 */
  status: 'complete' | 'partial' | 'degraded' | 'missing'
  
  /** 缺失原因（可选） */
  missing_reason?: string
}

/**
 * 聚合数据点（扁平化结构）
 * 每个聚合类型对应一个数据点
 */
export interface AggregatedPoint {
  /** 数据源ID */
  datasource_id: string
  
  /** 指标名称 */
  name: string
  
  /** 标签集合 */
  labels: Record<string, string>
  
  /** 聚合级别 */
  level: string
  
  /** 时间戳（Unix 毫秒） */
  timestamp: number
  
  /** 日期（调试用） */
  date?: string
  
  /** 聚合类型 */
  aggregation_type: 'avg' | 'min' | 'max' | 'count' | 'last'
  
  /** 聚合后的值 */
  value: number
  
  /** 数据质量信息 */
  quality: DataQuality
}

/**
 * 查询过滤器
 */
export interface QueryPointFilter {
  /** 指标名称（可选） */
  name?: string
  
  /** 标签列表，格式：[key1, value1, key2, value2, ...] （可选） */
  labels?: string[]
}

/**
 * 查询聚合数据请求参数
 */
export interface QueryPointsRequest {
  /** 数据源ID（必填） */
  datasource_id: string
  
  /** 聚合级别列表（必填） */
  levels: string[]
  
  /** 开始时间（Unix 毫秒，可选） */
  start_time?: number
  
  /** 结束时间（Unix 毫秒，可选） */
  end_time?: number
  
  /** 过滤器列表（可选，不传则查询所有指标） */
  filters?: QueryPointFilter[]
  
  /** 返回数量限制（可选） */
  limit?: number
  
  /** 数据质量过滤（可选） */
  data_status?: 'complete' | 'partial' | 'degraded' | 'missing'
  
  /** 聚合类型列表（可选，不传则查询所有类型：avg/min/max/count） */
  aggregation_types?: ('avg' | 'min' | 'max' | 'count' | 'last')[]
}

/**
 * 汇总表格
 */
export interface SummaryTable {
  /** 表格名称 */
  name: string
  
  /** 表格数据（二维数组，第一行是表头） */
  table: string[][]
}


/**
 * 查询聚合数据响应
 */
export interface QueryPointsResponse {
  /** 压缩的数据点 */
  p: CompressedPointsResponse
  
  /** 汇总表格列表（可选） */
  t?: SummaryTable[]
  
  /** 时间序列数量 */
  count: number
  
  /** 查询耗时（毫秒） */
  took_ms?: number
}

/**
 * 后端原始响应格式（压缩格式）
 */
interface RawQueryPointsResponse {
  /** 压缩的数据点 */
  p: CompressedPointsResponse
  
  /** 汇总表格列表（可选） */
  t?: SummaryTable[]
}

/**
 * WebSocket 订阅聚合数据请求
 */
export interface SubscribePointsRequest {
  /** 数据源ID */
  datasource_id: string
  
  /** 要订阅的聚合等级列表 */
  aggregation_levels: string[]
  
  /** 指标名称过滤（可选） */
  metric_filters?: string[]
  
  /** 标签过滤（可选） */
  label_filters?: Record<string, string>
}

/**
 * WebSocket 取消订阅请求
 */
export interface UnsubscribePointsRequest {
  /** 数据源ID */
  datasource_id: string
  
  /** 要取消的聚合等级（为空表示取消所有） */
  aggregation_levels?: string[]
}

/**
 * WebSocket 聚合数据广播
 */
export interface PointsBroadcast {
  /** 数据点列表 */
  points: AggregatedPoint[]
  
  /** 数据点数量 */
  count: number
}

/**
 * API 通用响应格式
 */
interface ApiResponse<T = any> {
  code: number
  msg?: string
  data?: T
}


// ============================================
// HTTP API 方法
// ============================================

/**
 * 查询聚合数据点
 * 
 * 对应 API: POST /apis/v1/points/query
 * 
 * @param request - 查询参数
 * @returns 查询结果
 * 
 * @example
 * ```typescript
 * // 查询最近 1 小时的 15s 级别数据（所有指标）
 * const result = await queryPoints({
 *   datasource_id: "ds-test-001",
 *   levels: ["15s"],
 *   start_time: Date.now() - 3600000,
 *   end_time: Date.now(),
 * })
 * 
 * // 查询指定指标
 * const result2 = await queryPoints({
 *   datasource_id: "ds-test-001",
 *   levels: ["15s"],
 *   filters: [
 *     { name: "cpu_usage" },
 *     { name: "memory_usage" }
 *   ],
 *   aggregation_types: ["avg", "max"]
 * })
 * 
 * console.log(`查询到 ${result.count} 个数据点`)
 * console.log(`耗时 ${result.took_ms} ms`)
 * ```
 */
export async function queryPoints(request: QueryPointsRequest): Promise<QueryPointsResponse> {
  try {
    const response = await fetch(buildApiUrl("/v1/points/query"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    })

    // 提取用户信息
    extractUserInfoFromResponse(response)

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`)
    }

    const result: ApiResponse<any> = await response.json()

    if (result.code !== 0) {
      throw new Error(result.msg || "查询失败")
    }

    // 后端返回结构：data[0] 包含 { p: CompressedPointsResponse, t: SummaryTable[] }
    const responseData: RawQueryPointsResponse | null = 
      result.data && result.data.length > 0 ? result.data[0] : null
    
    if (!responseData || !responseData.p) {
      throw new Error("无数据返回")
    }

    return {
      p: responseData.p,
      t: responseData.t,
      count: responseData.p.k.length / 2, // 时间序列数量
    }
  } catch (error) {
    console.error("Query points error:", error)
    throw error instanceof Error ? error : new Error("查询失败")
  }
}

/**
 * 按时间范围查询聚合数据（便捷方法）
 * 
 * @param datasourceId - 数据源ID
 * @param level - 聚合级别
 * @param startTime - 开始时间（Date 对象）
 * @param endTime - 结束时间（Date 对象）
 * @returns 数据点列表
 * 
 * @example
 * ```typescript
 * // 查询最近 1 小时的数据
 * const now = new Date()
 * const oneHourAgo = new Date(now.getTime() - 3600000)
 * const points = await queryPointsByTimeRange("ds-test-001", "1m", oneHourAgo, now)
 * ```
 */
export async function queryPointsByTimeRange(
  datasourceId: string,
  level: string,
  startTime: Date,
  endTime: Date
): Promise<AggregatedPoint[]> {
  const result = await queryPoints({
    datasource_id: datasourceId,
    levels: [level],
    start_time: startTime.getTime(),
    end_time: endTime.getTime(),
  })
  
  // 解压数据
  const { decompressPoints } = await import('./points-compressed')
  return decompressPoints(result.p, datasourceId, level)
}

/**
 * 查询指定指标的聚合数据
 * 
 * @param datasourceId - 数据源ID
 * @param level - 聚合级别
 * @param metricNames - 指标名称列表
 * @param startTime - 开始时间（Date 对象）
 * @param endTime - 结束时间（Date 对象）
 * @returns 数据点列表
 * 
 * @example
 * ```typescript
 * // 查询 CPU 和内存指标
 * const points = await queryMetrics(
 *   "ds-test-001",
 *   "5m",
 *   ["cpu_usage", "memory_usage"],
 *   new Date(Date.now() - 3600000),
 *   new Date()
 * )
 * ```
 */
export async function queryMetrics(
  datasourceId: string,
  level: string,
  metricNames: string[],
  startTime: Date,
  endTime: Date
): Promise<AggregatedPoint[]> {
  const result = await queryPoints({
    datasource_id: datasourceId,
    levels: [level],
    start_time: startTime.getTime(),
    end_time: endTime.getTime(),
    filters: metricNames.map(name => ({ name })),  // 转换为 filters 格式
  })
  
  // 解压数据
  const { decompressPoints } = await import('./points-compressed')
  return decompressPoints(result.p, datasourceId, level)
}

// ============================================
// WebSocket 订阅方法
// ============================================

/**
 * WebSocket 客户端实例（单例）
 * 由调用方管理，这里只提供订阅方法
 */
let wsClientInstance: WebSocketClient | null = null

/**
 * 设置 WebSocket 客户端实例
 * 
 * @param client - WebSocket 客户端实例
 * 
 * @example
 * ```typescript
 * import { WebSocketClient } from "@/apis/websocket"
 * import { setWebSocketClient } from "@/apis/points"
 * 
 * const client = new WebSocketClient({ url: buildWsUrl() })
 * await client.connect()
 * setWebSocketClient(client)
 * ```
 */
export function setWebSocketClient(client: WebSocketClient) {
  wsClientInstance = client
}

/**
 * 获取 WebSocket 客户端实例
 * 如果不存在则创建一个新的
 * 
 * @returns WebSocket 客户端实例
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
 * 订阅聚合数据推送
 * 
 * WebSocket Topic: points
 * 
 * @param request - 订阅请求参数
 * @param onData - 数据回调函数
 * @returns 取消订阅函数
 * 
 * @example
 * ```typescript
 * // 订阅实时聚合数据
 * const unsubscribe = subscribePoints(
 *   {
 *     datasource_id: "ds-test-001",
 *     aggregation_levels: ["15s", "1m"],
 *     metric_filters: ["cpu_usage", "memory_usage"]
 *   },
 *   (broadcast) => {
 *     console.log(`收到 ${broadcast.count} 个数据点`)
 *     broadcast.points.forEach(point => {
 *       console.log(`${point.name} [${point.aggregation_type}]: ${point.value}`)
 *     })
 *   }
 * )
 * 
 * // 取消订阅
 * unsubscribe()
 * ```
 */
export function subscribePoints(
  request: SubscribePointsRequest,
  onData: (broadcast: PointsBroadcast) => void
): () => void {
  const client = getWebSocketClient()
  
  // WebSocketClient.subscribe 参数顺序：topic, data, callback
  return client.subscribe<PointsBroadcast>('points', request, onData)
}

/**
 * 取消订阅聚合数据推送
 * 
 * @param request - 取消订阅请求参数
 * 
 * @example
 * ```typescript
 * // 取消订阅特定级别
 * unsubscribePoints({
 *   datasource_id: "ds-test-001",
 *   aggregation_levels: ["15s"]
 * })
 * 
 * // 取消订阅所有级别
 * unsubscribePoints({
 *   datasource_id: "ds-test-001"
 * })
 * ```
 */
export function unsubscribePoints(request: UnsubscribePointsRequest): void {
  const client = getWebSocketClient()
  
  // 构造 WebSocket 消息并发送
  client.send({
    type: 'request',
    topic: 'points',
    path: '/unsubscribe',
    data: request
  })
}

// ============================================
// 数据处理工具方法
// ============================================

/**
 * 按指标名称分组数据点
 * 
 * @param points - 数据点列表
 * @returns 按指标名称分组的 Map
 * 
 * @example
 * ```typescript
 * const grouped = groupPointsByMetric(points)
 * grouped.forEach((points, metricName) => {
 *   console.log(`${metricName}: ${points.length} 个数据点`)
 * })
 * ```
 */
export function groupPointsByMetric(points: AggregatedPoint[]): Map<string, AggregatedPoint[]> {
  const grouped = new Map<string, AggregatedPoint[]>()
  
  points.forEach(point => {
    if (!grouped.has(point.name)) {
      grouped.set(point.name, [])
    }
    grouped.get(point.name)!.push(point)
  })
  
  return grouped
}

/**
 * 按指标名称+标签分组数据点（完整分组）
 * 
 * 同名但标签不同的指标会被分为不同的组
 * 
 * @param points - 数据点列表
 * @returns 按指标+标签分组的 Map（key 格式: name|label1=value1,label2=value2）
 * 
 * @example
 * ```typescript
 * const grouped = groupPointsByMetricAndLabels(points)
 * grouped.forEach((points, key) => {
 *   const [name, labels] = key.split('|')
 *   console.log(`${name} [${labels}]: ${points.length} 个数据点`)
 * })
 * ```
 */
export function groupPointsByMetricAndLabels(points: AggregatedPoint[]): Map<string, AggregatedPoint[]> {
  const grouped = new Map<string, AggregatedPoint[]>()
  
  points.forEach(point => {
    // 过滤内部标签并排序
    const businessLabels = Object.entries(point.labels)
      .filter(([key]) => !key.startsWith('__'))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',')
    
    const key = `${point.name}|${businessLabels}`
    
    if (!grouped.has(key)) {
      grouped.set(key, [])
    }
    grouped.get(key)!.push(point)
  })
  
  return grouped
}

/**
 * 按聚合类型过滤数据点
 * 
 * @param points - 数据点列表
 * @param types - 要保留的聚合类型
 * @returns 过滤后的数据点列表
 * 
 * @example
 * ```typescript
 * // 只保留 avg 和 max
 * const filtered = filterByAggregationType(points, ['avg', 'max'])
 * ```
 */
export function filterByAggregationType(
  points: AggregatedPoint[],
  types: ('avg' | 'min' | 'max' | 'count' | 'last')[]
): AggregatedPoint[] {
  return points.filter(point => types.includes(point.aggregation_type))
}

/**
 * 提取指定聚合类型的值
 * 
 * @param points - 同一指标的数据点列表
 * @param type - 聚合类型
 * @returns 该聚合类型的数据点（如果存在）
 * 
 * @example
 * ```typescript
 * const grouped = groupPointsByMetricAndLabels(points)
 * grouped.forEach((points) => {
 *   const avgPoint = getPointByType(points, 'avg')
 *   const maxPoint = getPointByType(points, 'max')
 *   if (avgPoint && maxPoint) {
 *     console.log(`平均值: ${avgPoint.value}, 最大值: ${maxPoint.value}`)
 *   }
 * })
 * ```
 */
export function getPointByType(
  points: AggregatedPoint[],
  type: 'avg' | 'min' | 'max' | 'count' | 'last'
): AggregatedPoint | undefined {
  return points.find(p => p.aggregation_type === type)
}

/**
 * 按时间排序数据点
 * 
 * @param points - 数据点列表
 * @param order - 排序方向（'asc' 升序，'desc' 降序）
 * @returns 排序后的数据点列表
 */
export function sortPointsByTime(
  points: AggregatedPoint[],
  order: 'asc' | 'desc' = 'asc'
): AggregatedPoint[] {
  return [...points].sort((a, b) => {
    return order === 'asc' 
      ? a.timestamp - b.timestamp 
      : b.timestamp - a.timestamp
  })
}

/**
 * 格式化聚合级别为可读文本
 * 
 * @param level - 聚合级别
 * @returns 可读文本
 * 
 * @example
 * ```typescript
 * formatLevel("15s")  // "15 秒"
 * formatLevel("1m")   // "1 分钟"
 * formatLevel("1h")   // "1 小时"
 * ```
 */
export function formatLevel(level: string): string {
  const map: Record<string, string> = {
    '15s': '15 秒',
    '30s': '30 秒',
    '1m': '1 分钟',
    '5m': '5 分钟',
    '15m': '15 分钟',
    '30m': '30 分钟',
    '1h': '1 小时',
    '6h': '6 小时',
    '1d': '1 天',
  }
  return map[level] || level
}

// ============================================
// 导出所有方法
// ============================================

export default {
  // HTTP API
  queryPoints,
  queryPointsByTimeRange,
  queryMetrics,
  
  // WebSocket
  setWebSocketClient,
  subscribePoints,
  unsubscribePoints,
  
  // 工具方法
  groupPointsByMetric,
  groupPointsByMetricAndLabels,
  filterByAggregationType,
  getPointByType,
  sortPointsByTime,
  formatLevel,
}

