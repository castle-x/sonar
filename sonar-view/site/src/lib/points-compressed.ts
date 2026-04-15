/**
 * ============================================
 * 压缩数据点格式 - 高性能数据结构
 * ============================================
 *
 * 后端返回的压缩格式（对应 pkg/dataprocess.PointsResponse）：
 *   k: [name1, labelstr1, name2, labelstr2, ...]  每2个为一组
 *   v: [metric_idx][agg_type_idx][time_points]
 *
 * 索引关系：
 *   k[i*2]   = 指标名称
 *   k[i*2+1] = 标签字符串（Prometheus 格式）
 *   v[i][0]  = avg 数据点数组
 *   v[i][1]  = min 数据点数组
 *   v[i][2]  = max 数据点数组
 *   v[i][3]  = count 数据点数组
 *   v[i][4]  = last 数据点数组
 */

// ============================================
// 类型定义
// ============================================

/** 原始数据点（时间戳 + 值） */
export interface RawData {
  /** Unix 毫秒时间戳 */
  t: number
  /** 值 */
  v: number
}

/** 压缩的数据响应格式（与后端 pkg/dataprocess.PointsResponse 一一对应） */
export interface CompressedPointsResponse {
  /** 键数组：[name1, labelstr1, name2, labelstr2, ...] 每2个为一组 */
  k: string[]
  /**
   * 值数组：三维数组
   *   [metric_idx][agg_type_idx][time_points]
   */
  v: RawData[][][]
}

/**
 * 聚合类型索引（必须与后端 pkg/aggregator 中的 AggregationTypeList 顺序完全一致）
 */
export const AGG_TYPE_INDEX = {
  avg: 0,
  min: 1,
  max: 2,
  count: 3,
  last: 4,
} as const

export type AggType = keyof typeof AGG_TYPE_INDEX

/** 聚合类型反向映射（索引 -> 名称） */
const AGG_TYPE_MAP: Record<number, AggType> = {
  0: 'avg',
  1: 'min',
  2: 'max',
  3: 'count',
  4: 'last',
}

/** 解压后的数据点 */
export interface AggregatedPoint {
  datasource_id: string
  name: string
  /** 业务标签（已过滤 __ 前缀的内部标签） */
  labels: Record<string, string>
  level: string
  /** Unix 毫秒时间戳 */
  timestamp: number
  aggregation_type: AggType
  value: number
}

// ============================================
// 工具函数
// ============================================

/**
 * 解析 Prometheus 标签字符串 -> Record<string, string>
 *
 * 输入格式: {__aggregation_level__="1m",instance="tap-1:9090",job="sonar-tap"}
 * 过滤掉 __ 前缀的内部标签（__aggregation_level__、__statistic_suffix__、__datasource_id__ 等）
 */
export function parseLabelsString(labelStr: string): Record<string, string> {
  const result: Record<string, string> = {}

  const trimmed = labelStr.trim().replace(/^\{|\}$/g, '')
  if (!trimmed) return result

  // 按逗号分割，处理值中可能含有转义引号的情况
  const pairs = trimmed.match(/[^,]+="[^"]*"/g) ?? []

  for (const pair of pairs) {
    const match = pair.match(/^\s*(.+?)\s*=\s*"(.*)"\s*$/)
    if (match) {
      const [, key, value] = match
      // 过滤内部标签
      if (!key.startsWith('__')) {
        result[key] = value
      }
    }
  }

  return result
}

// ============================================
// 完整解压（小数据集使用）
// ============================================

/**
 * 将压缩格式完整解压为 AggregatedPoint 数组
 * 适合数据量较小的场景；大数据集推荐使用 createCompressedDataIndex
 */
export function decompressPoints(
  data: CompressedPointsResponse,
  datasourceId: string,
  level: string,
): AggregatedPoint[] {
  const points: AggregatedPoint[] = []

  for (let i = 0; i < data.k.length; i += 2) {
    const name = data.k[i]
    const labelStr = data.k[i + 1] ?? ''
    const dataIndex = i / 2
    const labels = parseLabelsString(labelStr)
    const aggDataList = data.v[dataIndex]
    if (!aggDataList) continue

    aggDataList.forEach((rawPoints, aggTypeIndex) => {
      const aggType = AGG_TYPE_MAP[aggTypeIndex]
      if (!aggType || !Array.isArray(rawPoints) || rawPoints.length === 0) return

      for (const rawPoint of rawPoints) {
        points.push({
          datasource_id: datasourceId,
          name,
          labels,
          level,
          timestamp: rawPoint.t,
          aggregation_type: aggType,
          value: rawPoint.v,
        })
      }
    })
  }

  return points
}

// ============================================
// 高性能索引结构（大数据集使用，按需懒解压）
// ============================================

/**
 * 压缩数据索引
 *
 * 提供 O(1) 复杂度的指标名称查找，避免重复遍历 k 数组
 * metricToIndices: metricName -> 该指标在 k 数组中所有数据索引（k[idx*2] = name）
 */
export interface CompressedDataIndex {
  data: CompressedPointsResponse
  /** metricName -> data indices (k-index / 2)，一个指标可对应多个 label 组合 */
  metricToIndices: Map<string, number[]>
  datasourceId: string
  level: string
}

/**
 * 创建压缩数据索引
 *
 * 推荐方案：只遍历一次 k 数组，建立索引供后续快速访问
 */
export function createCompressedDataIndex(
  data: CompressedPointsResponse,
  datasourceId: string,
  level: string,
): CompressedDataIndex {
  const metricToIndices = new Map<string, number[]>()

  for (let i = 0; i < data.k.length; i += 2) {
    const name = data.k[i]
    const dataIndex = i / 2
    if (!metricToIndices.has(name)) {
      metricToIndices.set(name, [])
    }
    metricToIndices.get(name)!.push(dataIndex)
  }

  return { data, metricToIndices, datasourceId, level }
}

/**
 * 从索引中获取指定指标的所有数据点（懒解压）
 *
 * @param index - 压缩数据索引
 * @param metricName - 指标名称
 * @returns 该指标的所有 AggregatedPoint（包含所有 label 组合和聚合类型）
 */
export function getPointsFromIndex(
  index: CompressedDataIndex,
  metricName: string,
): AggregatedPoint[] {
  const points: AggregatedPoint[] = []
  const dataIndices = index.metricToIndices.get(metricName)
  if (!dataIndices) return points

  for (const dataIndex of dataIndices) {
    const name = index.data.k[dataIndex * 2]
    const labelStr = index.data.k[dataIndex * 2 + 1] ?? ''
    const labels = parseLabelsString(labelStr)
    const aggDataList = index.data.v[dataIndex]
    if (!aggDataList) continue

    aggDataList.forEach((rawPoints, aggTypeIndex) => {
      const aggType = AGG_TYPE_MAP[aggTypeIndex]
      if (!aggType || !Array.isArray(rawPoints) || rawPoints.length === 0) return

      for (const rawPoint of rawPoints) {
        points.push({
          datasource_id: index.datasourceId,
          name,
          labels,
          level: index.level,
          timestamp: rawPoint.t,
          aggregation_type: aggType,
          value: rawPoint.v,
        })
      }
    })
  }

  return points
}
