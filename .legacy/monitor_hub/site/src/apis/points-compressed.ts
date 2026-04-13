/**
 * ============================================
 * 压缩数据点格式 - 高性能数据结构
 * ============================================
 * 
 * 后端返回的压缩格式，用于减少网络传输和内存占用
 * 
 * 数据组织：
 * - K: [name1, labelstr1, name2, labelstr2, ...] (每2个为一组)
 * - V: 对应每组的数据 [桶1[avg[], min[], max[], count[], last[]], 桶2[...], ...]
 * 
 * 索引关系：
 * - K[i*2] = 指标名称
 * - K[i*2+1] = 标签字符串 (Prometheus 格式，如 "{ip=\"192.168.1.1\",pid=\"123\"}")
 * - V[i] = 该组的所有聚合类型数据
 * - V[i][0] = avg 数据点数组
 * - V[i][1] = min 数据点数组
 * - V[i][2] = max 数据点数组
 * - V[i][3] = count 数据点数组
 * - V[i][4] = last 数据点数组
 */

import type { AggregatedPoint } from './points'

// ============================================
// 类型定义
// ============================================

/** 原始数据点（时间戳 + 值） */
export interface RawDataPoint {
  /** 时间戳（Unix 毫秒） */
  t: number
  /** 值 */
  v: number
}

/** 压缩的数据响应格式 */
export interface CompressedPointsResponse {
  /** 键数组：[指标名, 标签字符串, 指标名, 标签字符串, ...] */
  k: string[]
  
  /** 
   * 值数组：三维数组
   * - 第一维：对应 k 中的每一组（索引 = k索引 / 2）
   * - 第二维：聚合类型索引（0=avg, 1=min, 2=max, 3=count, 4=last）
   * - 第三维：该聚合类型的时间序列数据点
   */
  v: RawDataPoint[][][]
}

/** 聚合类型枚举 */
export enum AggregationType {
  Avg = 0,
  Min = 1,
  Max = 2,
  Count = 3,
  Last = 4,
}

/** 聚合类型映射 */
export const AGG_TYPE_MAP: Record<AggregationType, 'avg' | 'min' | 'max' | 'count' | 'last'> = {
  [AggregationType.Avg]: 'avg',
  [AggregationType.Min]: 'min',
  [AggregationType.Max]: 'max',
  [AggregationType.Count]: 'count',
  [AggregationType.Last]: 'last',
}

/** 聚合类型反向映射 */
export const AGG_TYPE_INDEX: Record<'avg' | 'min' | 'max' | 'count' | 'last', AggregationType> = {
  'avg': AggregationType.Avg,
  'min': AggregationType.Min,
  'max': AggregationType.Max,
  'count': AggregationType.Count,
  'last': AggregationType.Last,
}

// ============================================
// 工具函数
// ============================================

/**
 * 解析标签字符串（Prometheus 格式）
 * 
 * @param labelStr - 标签字符串，如 "{ip=\"192.168.1.1\",pid=\"123\"}"
 * @returns 标签对象
 * 
 * @example
 * ```ts
 * parseLabels("{ip=\"192.168.1.1\",pid=\"123\"}")
 * // => { ip: "192.168.1.1", pid: "123" }
 * ```
 */
export function parseLabels(labelStr: string): Record<string, string> {
  const result: Record<string, string> = {}
  
  // 去除首尾的大括号
  const trimmed = labelStr.trim().replace(/^{|}$/g, '')
  if (!trimmed) {
    return result
  }
  
  // 按逗号分割标签，但要注意值中可能包含逗号
  const pairs = trimmed.match(/[^,]+="[^"]*"/g) || []
  
  for (const pair of pairs) {
    const match = pair.match(/^\s*(.+?)\s*=\s*"(.*)"\s*$/)
    if (match) {
      const [, key, value] = match
      result[key] = value
    }
  }
  
  return result
}

/**
 * 将压缩格式转换为标准 AggregatedPoint 数组
 * 
 * 注意：这个函数会完全解压数据，适合数据量较小的场景
 * 对于大数据量，建议使用 createCompressedDataIndex 创建索引
 * 
 * @param compressed - 压缩的数据响应
 * @param datasourceId - 数据源ID
 * @param level - 聚合级别
 * @returns 标准的数据点数组
 */
export function decompressPoints(
  compressed: CompressedPointsResponse,
  datasourceId: string,
  level: string
): AggregatedPoint[] {
  const points: AggregatedPoint[] = []
  
  // 遍历 K 数组，每2个为一组
  for (let i = 0; i < compressed.k.length; i += 2) {
    const name = compressed.k[i]
    const labelStr = compressed.k[i + 1]
    const dataIndex = i / 2
    
    // 解析标签
    const labels = parseLabels(labelStr)
    
    // 获取该组的所有聚合类型数据
    const aggDataList = compressed.v[dataIndex]
    
    // 遍历每个聚合类型
    aggDataList.forEach((rawPoints, aggTypeIndex) => {
      const aggType = AGG_TYPE_MAP[aggTypeIndex as AggregationType]
      if (!aggType) return
      
      // 检查数据是否存在
      if (!rawPoints || !Array.isArray(rawPoints) || rawPoints.length === 0) {
        return
      }
      
      // 遍历该聚合类型的所有时间点
      rawPoints.forEach(rawPoint => {
        points.push({
          datasource_id: datasourceId,
          name,
          labels,
          level,
          timestamp: rawPoint.t,
          aggregation_type: aggType,
          value: rawPoint.v,
          quality: {
            actual_points: 1,
            expected_points: 1,
            score: 100,
            status: 'complete',
          },
        })
      })
    })
  }
  
  return points
}

// ============================================
// 高性能索引结构
// ============================================

/**
 * 压缩数据索引
 * 
 * 提供 O(1) 复杂度的数据访问，避免重复解析
 */
export interface CompressedDataIndex {
  /** 原始压缩数据引用 */
  compressed: CompressedPointsResponse
  
  /** 快速查找：uniqueKey -> dataIndex */
  keyToIndex: Map<string, number>
  
  /** 快速查找：metricName -> dataIndex[] */
  metricToIndices: Map<string, number[]>
  
  /** 快速查找：labelStr -> dataIndex[] */
  labelToIndices: Map<string, number[]>
  
  /** 解析后的标签缓存：dataIndex -> labels */
  labelCache: Map<number, Record<string, string>>
  
  /** 元数据 */
  metadata: {
    datasourceId: string
    level: string
    totalSeries: number
    totalDataPoints: number
  }
}

/**
 * 创建压缩数据索引
 * 
 * 这是推荐的高性能方案：只解析一次，建立索引供后续快速访问
 * 
 * @param compressed - 压缩的数据响应
 * @param datasourceId - 数据源ID
 * @param level - 聚合级别
 * @returns 压缩数据索引
 */
export function createCompressedDataIndex(
  compressed: CompressedPointsResponse,
  datasourceId: string,
  level: string
): CompressedDataIndex {
  const keyToIndex = new Map<string, number>()
  const metricToIndices = new Map<string, number[]>()
  const labelToIndices = new Map<string, number[]>()
  const labelCache = new Map<number, Record<string, string>>()
  
  let totalDataPoints = 0
  
  // 遍历构建索引
  for (let i = 0; i < compressed.k.length; i += 2) {
    const name = compressed.k[i]
    const labelStr = compressed.k[i + 1]
    const dataIndex = i / 2
    
    // 构建唯一键
    const uniqueKey = `${name}|${labelStr}`
    keyToIndex.set(uniqueKey, dataIndex)
    
    // 按指标名索引
    if (!metricToIndices.has(name)) {
      metricToIndices.set(name, [])
    }
    metricToIndices.get(name)!.push(dataIndex)
    
    // 按标签字符串索引
    if (!labelToIndices.has(labelStr)) {
      labelToIndices.set(labelStr, [])
    }
    labelToIndices.get(labelStr)!.push(dataIndex)
    
    // 解析并缓存标签
    const labels = parseLabels(labelStr)
    labelCache.set(dataIndex, labels)
    
    // 统计数据点总数
    const aggDataList = compressed.v[dataIndex]
    aggDataList.forEach(rawPoints => {
      if (rawPoints && Array.isArray(rawPoints)) {
        totalDataPoints += rawPoints.length
      }
    })
  }
  
  return {
    compressed,
    keyToIndex,
    metricToIndices,
    labelToIndices,
    labelCache,
    metadata: {
      datasourceId,
      level,
      totalSeries: compressed.k.length / 2,
      totalDataPoints,
    },
  }
}

/**
 * 从索引中获取指定指标的数据
 * 
 * @param index - 压缩数据索引
 * @param metricName - 指标名称
 * @param aggType - 聚合类型（可选，不指定则返回所有类型）
 * @returns 标准的数据点数组
 */
export function getPointsFromIndex(
  index: CompressedDataIndex,
  metricName: string,
  aggType?: 'avg' | 'min' | 'max' | 'count' | 'last'
): AggregatedPoint[] {
  const points: AggregatedPoint[] = []
  const dataIndices = index.metricToIndices.get(metricName)
  
  if (!dataIndices) {
    return points
  }
  
  const aggTypeIndex = aggType ? AGG_TYPE_INDEX[aggType] : undefined
  
  for (const dataIndex of dataIndices) {
    const name = index.compressed.k[dataIndex * 2]
    const labels = index.labelCache.get(dataIndex)!
    const aggDataList = index.compressed.v[dataIndex]
    
    // 遍历聚合类型
    aggDataList.forEach((rawPoints, currentAggTypeIndex) => {
      // 如果指定了聚合类型，只处理该类型
      if (aggTypeIndex !== undefined && currentAggTypeIndex !== aggTypeIndex) {
        return
      }
      
      const currentAggType = AGG_TYPE_MAP[currentAggTypeIndex as AggregationType]
      if (!currentAggType) return
      
      // 检查数据是否存在
      if (!rawPoints || !Array.isArray(rawPoints) || rawPoints.length === 0) {
        return
      }
      
      // 遍历时间点
      rawPoints.forEach(rawPoint => {
        points.push({
          datasource_id: index.metadata.datasourceId,
          name,
          labels,
          level: index.metadata.level,
          timestamp: rawPoint.t,
          aggregation_type: currentAggType,
          value: rawPoint.v,
          quality: {
            actual_points: 1,
            expected_points: 1,
            score: 100,
            status: 'complete',
          },
        })
      })
    })
  }
  
  return points
}

/**
 * 从索引中获取所有数据点（懒加载）
 * 
 * @param index - 压缩数据索引
 * @returns 数据点迭代器
 */
export function* iteratePointsFromIndex(
  index: CompressedDataIndex
): Generator<AggregatedPoint> {
  for (let i = 0; i < index.compressed.k.length; i += 2) {
    const dataIndex = i / 2
    const name = index.compressed.k[i]
    const labels = index.labelCache.get(dataIndex)!
    const aggDataList = index.compressed.v[dataIndex]
    
    for (let aggTypeIndex = 0; aggTypeIndex < aggDataList.length; aggTypeIndex++) {
      const aggType = AGG_TYPE_MAP[aggTypeIndex as AggregationType]
      if (!aggType) continue
      
      const rawPoints = aggDataList[aggTypeIndex]
      for (const rawPoint of rawPoints) {
        yield {
          datasource_id: index.metadata.datasourceId,
          name,
          labels,
          level: index.metadata.level,
          timestamp: rawPoint.t,
          aggregation_type: aggType,
          value: rawPoint.v,
          quality: {
            actual_points: 1,
            expected_points: 1,
            score: 100,
            status: 'complete',
          },
        }
      }
    }
  }
}

/**
 * 获取压缩数据的统计信息
 * 
 * @param compressed - 压缩的数据响应
 * @returns 统计信息
 */
export function getCompressedDataStats(compressed: CompressedPointsResponse) {
  let totalPoints = 0
  let minTimestamp = Infinity
  let maxTimestamp = -Infinity
  const metricNames = new Set<string>()
  const aggTypes = new Set<number>()
  
  for (let i = 0; i < compressed.k.length; i += 2) {
    const name = compressed.k[i]
    const dataIndex = i / 2
    
    metricNames.add(name)
    
    const aggDataList = compressed.v[dataIndex]
    aggDataList.forEach((rawPoints, aggTypeIndex) => {
      if (rawPoints && Array.isArray(rawPoints) && rawPoints.length > 0) {
        aggTypes.add(aggTypeIndex)
        totalPoints += rawPoints.length
        
        rawPoints.forEach(point => {
          if (point.t < minTimestamp) minTimestamp = point.t
          if (point.t > maxTimestamp) maxTimestamp = point.t
        })
      }
    })
  }
  
  return {
    totalSeries: compressed.k.length / 2,
    totalPoints,
    uniqueMetrics: metricNames.size,
    aggTypes: Array.from(aggTypes).map(i => AGG_TYPE_MAP[i as AggregationType]),
    timeRange: minTimestamp !== Infinity ? {
      start: minTimestamp,
      end: maxTimestamp,
    } : null,
  }
}

