/**
 * 聚合粒度配置
 *
 * 定义各聚合级别的显示标签、轮询间隔和查询时间窗口
 */

export interface AggregationLevel {
  /** 后端聚合级别名称，如 "15s"、"1m" */
  name: string
  /** UI 显示标签 */
  displayLabel: string
  /** 前端轮询间隔（ms），用于 useQuery refetchInterval */
  refreshInterval: number
  /** 查询时间窗口长度（ms），startTime = endTime - retention */
  retention: number
}

export const AGGREGATION_LEVELS: AggregationLevel[] = [
  { name: '15s', displayLabel: '15 秒',  refreshInterval: 5_000,       retention: 900_000 },
  { name: '30s', displayLabel: '30 秒',  refreshInterval: 10_000,      retention: 1_800_000 },
  { name: '1m',  displayLabel: '1 分钟', refreshInterval: 15_000,      retention: 3_600_000 },
  { name: '5m',  displayLabel: '5 分钟', refreshInterval: 60_000,      retention: 18_000_000 },
  { name: '1h',  displayLabel: '1 小时', refreshInterval: 300_000,     retention: 86_400_000 },
  { name: '6h',  displayLabel: '6 小时', refreshInterval: 600_000,     retention: 259_200_000 },
  { name: '1d',  displayLabel: '1 天',   refreshInterval: 3_600_000,   retention: 604_800_000 },
]

/**
 * 计算查询时间窗口
 *
 * endTime 往前偏移 40s（查询延迟补偿），startTime = endTime - retention
 */
export function calculateQueryTimeWindow(level: AggregationLevel): {
  startTime: number
  endTime: number
} {
  const endTime = Date.now() - 40_000
  const startTime = endTime - level.retention
  return { startTime, endTime }
}

/**
 * 返回默认聚合级别（1m）
 */
export function getDefaultAggregationLevel(): AggregationLevel {
  return AGGREGATION_LEVELS.find((l) => l.name === '1m')!
}

/**
 * 根据名称查找聚合级别，找不到则返回默认值
 */
export function findAggregationLevel(name: string): AggregationLevel {
  return AGGREGATION_LEVELS.find((l) => l.name === name) ?? getDefaultAggregationLevel()
}
