// Metrics 相关 API

import { post } from './request'

// 类型定义
export interface MetricPoint {
  timestamp: number
  value: number
  name?: string
  labels?: Record<string, string>
  label_list?: string[]
}

export interface MetricQuery {
  app_id: string
  metric_name?: string
  start_time: number
  end_time: number
  labels?: string[]
  promql?: string
  limit?: number
}

export interface QueryMetricsResponse {
  points?: MetricPoint[]
  total_count: number
  start_time?: number
  end_time?: number
  request_id?: string
}

export interface StorageStats {
  total_series: number
  disk_size: number
  retention_days: number
  total_samples: number
  total_blocks: number
  min_time_date: string
  max_time_date: string
  min_time: number
  max_time: number
}

export interface GetStatsResponse {
  stats?: StorageStats
  request_id?: string
}

// API 函数
export async function queryMetrics(query: MetricQuery): Promise<QueryMetricsResponse> {
  return post('/apis/v1/metrics/query', query)
}

export async function getMetricsStats(): Promise<GetStatsResponse> {
  return post('/apis/v1/metrics/query_stats', {})
}
