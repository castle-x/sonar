/**
 * Points 查询 API
 *
 * 对应后端接口：POST /api/v1/points/query
 * 返回压缩的时序数据，由前端按需解压
 */

import { api } from '@/lib/api-client'
import type { CompressedPointsResponse } from './points-compressed'

// ============================================
// 请求类型
// ============================================

export interface QueryFilter {
  /** 指标名称（可选，不填则查询所有指标） */
  name?: string
  /** 标签过滤，格式：[key1, val1, key2, val2, ...] */
  labels?: string[]
}

export interface QueryPointsRequest {
  /** 数据源 ID（必填） */
  datasource_id: string
  /** 聚合级别列表（必填） */
  levels: string[]
  /** 开始时间（Unix 毫秒，可选） */
  start_time?: number
  /** 结束时间（Unix 毫秒，可选） */
  end_time?: number
  /** 指标过滤器（可选，不填则查询所有） */
  filters?: QueryFilter[]
  /** 聚合类型列表（可选，不填则返回所有类型） */
  aggregation_types?: string[]
}

// ============================================
// 响应类型
// ============================================

export interface SummaryTable {
  name: string
  table: string[][]
}

export interface QueryPointsResponse {
  /** 压缩的数据点 */
  p: CompressedPointsResponse
  /** 汇总表格（可选） */
  t?: SummaryTable[]
}

// 后端标准响应包装
interface PointsApiWrapper {
  code: number
  msg?: string
  data: QueryPointsResponse
}

// ============================================
// API 函数
// ============================================

/**
 * 查询聚合数据点
 *
 * POST /api/v1/points/query
 *
 * @example
 * ```typescript
 * const resp = await queryPoints({
 *   datasource_id: 'tap-001',
 *   levels: ['1m'],
 *   start_time: Date.now() - 3_600_000,
 *   end_time: Date.now(),
 * })
 * const index = createCompressedDataIndex(resp.p, 'tap-001', '1m')
 * ```
 */
export async function queryPoints(req: QueryPointsRequest): Promise<QueryPointsResponse> {
  const resp = await api.post<PointsApiWrapper>('/api/v1/points/query', req)
  if (resp.code !== 0) {
    throw new Error(resp.msg ?? '查询失败')
  }
  return resp.data
}
