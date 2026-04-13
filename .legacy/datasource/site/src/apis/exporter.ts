// Exporter 相关 API

import { get } from './request'

// 类型定义
export interface Exporter {
  id: string
  app_id: string
  instance: string
  labels?: Record<string, string>
  state: number // 1=UP, 2=DOWN, 3=UNKNOWN
  last_scrape: number
  first_scrape: number
  scrape_count: number
  last_error?: string
  scrape_interval?: number
}

export interface ExporterStats {
  total: number
  up_count: number
  down_count: number
  unknown_count: number
}

export interface ListExportersResponse {
  exporters: Exporter[]
  total: number
  page?: number
  page_size?: number
}

export interface ListExportersParams {
  page?: number
  page_size?: number
  state?: number
  app_id?: string
}

// API 函数
export async function getExporterStats(): Promise<{ stats: ExporterStats }> {
  return get('/apis/v1/exporters/stats')
}

export async function listExporters(params: ListExportersParams = {}): Promise<ListExportersResponse> {
  return get('/apis/v1/exporters', params as Record<string, string | number | undefined>)
}

export async function getExporter(id: string): Promise<{ exporter: Exporter }> {
  return get(`/apis/v1/exporters/${id}`)
}
