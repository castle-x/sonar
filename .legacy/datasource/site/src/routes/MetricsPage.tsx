// 指标查询页面 - 类似 Prometheus 查询界面

import { useState, useCallback } from 'react'
import { LineChart, LoadingSpinner, EmptyState, ErrorState } from '../components'
import { queryMetrics, getMetricsStats, MetricPoint, StorageStats } from '../apis'

// 时间范围预设
const TIME_RANGES = [
  { label: '最近 5 分钟', value: 5 * 60 },
  { label: '最近 15 分钟', value: 15 * 60 },
  { label: '最近 30 分钟', value: 30 * 60 },
  { label: '最近 1 小时', value: 60 * 60 },
  { label: '最近 3 小时', value: 3 * 60 * 60 },
  { label: '最近 6 小时', value: 6 * 60 * 60 },
  { label: '最近 12 小时', value: 12 * 60 * 60 },
  { label: '最近 24 小时', value: 24 * 60 * 60 },
  { label: '最近 7 天', value: 7 * 24 * 60 * 60 },
]

// 查询模式
type QueryMode = 'promql' | 'labels'

export function MetricsPage() {
  // 查询表单状态
  const [queryMode, setQueryMode] = useState<QueryMode>('promql')
  const [appId, setAppId] = useState('debug_app')
  const [promql, setPromql] = useState('')
  const [metricName, setMetricName] = useState('')
  const [labelsInput, setLabelsInput] = useState('') // 格式: key1=value1,key2=value2
  const [timeRange, setTimeRange] = useState(60 * 60) // 默认 1 小时
  const [limit, setLimit] = useState(1000)

  // 结果状态
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [points, setPoints] = useState<MetricPoint[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [queryTime, setQueryTime] = useState<number | null>(null)
  const [stats, setStats] = useState<StorageStats | null>(null)

  // 解析标签输入
  const parseLabels = (input: string): string[] => {
    if (!input.trim()) return []
    const result: string[] = []
    input.split(',').forEach((pair) => {
      const [key, value] = pair.split('=').map((s) => s.trim())
      if (key && value) {
        result.push(key, value)
      }
    })
    return result
  }

  // 执行查询
  const handleQuery = useCallback(async () => {
    if (!appId.trim()) {
      setError('请输入 App ID')
      return
    }

    if (queryMode === 'promql' && !promql.trim()) {
      setError('请输入 PromQL 查询语句')
      return
    }

    setLoading(true)
    setError(null)
    const startTime = performance.now()

    try {
      const now = Math.floor(Date.now() / 1000)
      const query = {
        app_id: appId,
        start_time: now - timeRange,
        end_time: now,
        limit,
        ...(queryMode === 'promql'
          ? { promql }
          : {
              metric_name: metricName || undefined,
              labels: parseLabels(labelsInput),
            }),
      }

      const result = await queryMetrics(query)
      setPoints(result.points || [])
      setTotalCount(result.total_count)
      setQueryTime(performance.now() - startTime)
    } catch (err) {
      setError(err instanceof Error ? err.message : '查询失败')
      setPoints([])
      setTotalCount(0)
    } finally {
      setLoading(false)
    }
  }, [appId, queryMode, promql, metricName, labelsInput, timeRange, limit])

  // 获取存储统计
  const fetchStats = useCallback(async () => {
    try {
      const result = await getMetricsStats()
      setStats(result.stats || null)
    } catch (err) {
      console.error('获取统计信息失败:', err)
    }
  }, [])

  // 格式化数据点为图表数据
  const chartData = points.map((p) => ({
    timestamp: p.timestamp,
    value: p.value,
    label: p.name,
  }))

  // 按指标名称分组
  const groupedByName = points.reduce(
    (acc, p) => {
      const name = p.name || 'unknown'
      if (!acc[name]) acc[name] = []
      acc[name].push(p)
      return acc
    },
    {} as Record<string, MetricPoint[]>
  )

  const metricNames = Object.keys(groupedByName)

  return (
    <div className="page metrics-page">
      <header className="page-header">
        <div className="header-content">
          <h1>指标查询</h1>
          <p>查询和可视化时序指标数据</p>
        </div>
        <button className="refresh-btn" onClick={fetchStats} title="刷新统计">
          📊
        </button>
      </header>

      {/* 存储统计 */}
      {stats && (
        <div className="storage-stats">
          <span>序列数: {stats.total_series.toLocaleString()}</span>
          <span>采样点: {stats.total_samples.toLocaleString()}</span>
          <span>
            磁盘: {(stats.disk_size / 1024 / 1024).toFixed(2)} MB
          </span>
          <span>保留: {stats.retention_days} 天</span>
        </div>
      )}

      {/* 查询表单 */}
      <section className="query-section">
        <div className="query-form">
          {/* 查询模式切换 */}
          <div className="form-row">
            <label className="form-label">查询模式</label>
            <div className="mode-switch">
              <button
                className={`mode-btn ${queryMode === 'promql' ? 'active' : ''}`}
                onClick={() => setQueryMode('promql')}
              >
                PromQL
              </button>
              <button
                className={`mode-btn ${queryMode === 'labels' ? 'active' : ''}`}
                onClick={() => setQueryMode('labels')}
              >
                标签查询
              </button>
            </div>
          </div>

          {/* App ID */}
          <div className="form-row">
            <label className="form-label">App ID *</label>
            <input
              type="text"
              className="form-input"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="输入应用 ID"
            />
          </div>

          {/* PromQL 模式 */}
          {queryMode === 'promql' && (
            <div className="form-row">
              <label className="form-label">PromQL 表达式 *</label>
              <textarea
                className="form-textarea"
                value={promql}
                onChange={(e) => setPromql(e.target.value)}
                placeholder="例如: rate(http_requests_total[5m]) 或 up{job=~'.*'}"
                rows={3}
              />
              <div className="form-hint">
                支持正则匹配: =~(匹配), !~(不匹配), =(精确), !=(不等于)
              </div>
            </div>
          )}

          {/* 标签查询模式 */}
          {queryMode === 'labels' && (
            <>
              <div className="form-row">
                <label className="form-label">指标名称</label>
                <input
                  type="text"
                  className="form-input"
                  value={metricName}
                  onChange={(e) => setMetricName(e.target.value)}
                  placeholder="例如: http_requests_total"
                />
              </div>
              <div className="form-row">
                <label className="form-label">标签过滤</label>
                <input
                  type="text"
                  className="form-input"
                  value={labelsInput}
                  onChange={(e) => setLabelsInput(e.target.value)}
                  placeholder="格式: key1=value1,key2=value2"
                />
                <div className="form-hint">多个标签用逗号分隔，格式为 key=value</div>
              </div>
            </>
          )}

          {/* 时间范围 */}
          <div className="form-row">
            <label className="form-label">时间范围</label>
            <div className="time-range-buttons">
              {TIME_RANGES.map((range) => (
                <button
                  key={range.value}
                  className={`time-btn ${timeRange === range.value ? 'active' : ''}`}
                  onClick={() => setTimeRange(range.value)}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          {/* 返回数量限制 */}
          <div className="form-row">
            <label className="form-label">返回数量限制</label>
            <input
              type="number"
              className="form-input short"
              value={limit}
              onChange={(e) => setLimit(Math.max(1, parseInt(e.target.value) || 1000))}
              min={1}
              max={100000}
            />
          </div>

          {/* 查询按钮 */}
          <div className="form-row">
            <button className="query-btn" onClick={handleQuery} disabled={loading}>
              {loading ? '查询中...' : '执行查询'}
            </button>
          </div>
        </div>
      </section>

      {/* 查询结果 */}
      <section className="result-section">
        {loading ? (
          <LoadingSpinner message="正在查询数据..." />
        ) : error ? (
          <ErrorState message={error} onRetry={handleQuery} />
        ) : points.length === 0 ? (
          <EmptyState message="暂无查询结果，请调整查询条件后重试" icon="📈" />
        ) : (
          <>
            {/* 查询统计 */}
            <div className="result-stats">
              <span>返回 {totalCount.toLocaleString()} 个数据点</span>
              {queryTime && <span>耗时 {queryTime.toFixed(2)} ms</span>}
              <span>共 {metricNames.length} 个指标</span>
            </div>

            {/* 图表 - 按指标分组 */}
            <div className="charts-container">
              {metricNames.length === 1 ? (
                // 单个指标，显示一个大图
                <div className="chart-wrapper">
                  <h3 className="chart-title">{metricNames[0]}</h3>
                  <LineChart
                    data={chartData}
                    width={800}
                    height={300}
                    color="#6366f1"
                  />
                </div>
              ) : (
                // 多个指标，显示多个小图
                metricNames.slice(0, 6).map((name) => (
                  <div key={name} className="chart-wrapper small">
                    <h3 className="chart-title">{name}</h3>
                    <LineChart
                      data={groupedByName[name].map((p) => ({
                        timestamp: p.timestamp,
                        value: p.value,
                      }))}
                      width={380}
                      height={200}
                      color="#6366f1"
                    />
                  </div>
                ))
              )}
              {metricNames.length > 6 && (
                <div className="more-metrics">
                  还有 {metricNames.length - 6} 个指标未显示
                </div>
              )}
            </div>

            {/* 数据表格 */}
            <div className="data-table-wrapper">
              <h3>数据点详情 (前 100 条)</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>指标名称</th>
                    <th>值</th>
                    <th>标签</th>
                  </tr>
                </thead>
                <tbody>
                  {points.slice(0, 100).map((p, i) => (
                    <tr key={i}>
                      <td className="mono">
                        {new Date(p.timestamp * 1000).toLocaleString('zh-CN')}
                      </td>
                      <td>{p.name || '-'}</td>
                      <td className="mono">{p.value.toFixed(4)}</td>
                      <td>
                        {p.labels ? (
                          <div className="labels-inline">
                            {Object.entries(p.labels).map(([k, v]) => (
                              <span key={k} className="label-mini">
                                {k}={v}
                              </span>
                            ))}
                          </div>
                        ) : p.label_list ? (
                          <div className="labels-inline">
                            {p.label_list
                              .reduce((acc: string[], curr, idx, arr) => {
                                if (idx % 2 === 0 && arr[idx + 1]) {
                                  acc.push(`${curr}=${arr[idx + 1]}`)
                                }
                                return acc
                              }, [])
                              .map((l) => (
                                <span key={l} className="label-mini">
                                  {l}
                                </span>
                              ))}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
