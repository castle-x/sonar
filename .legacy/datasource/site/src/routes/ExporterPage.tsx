// Exporter 监控页面

import { useState, useEffect, useCallback } from 'react'
import { StatsCard, LoadingSkeleton, EmptyState, ErrorState } from '../components'
import { getExporterStats, listExporters, Exporter, ExporterStats } from '../apis'

// 常量
const STATE_MAP: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: 'UP', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
  2: { label: 'DOWN', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
  3: { label: 'UNKNOWN', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
}

// 工具函数
function formatTimestamp(ts: number): string {
  if (!ts) return '-'
  const date = new Date(ts * 1000)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时`
  return `${Math.floor(seconds / 86400)}天`
}

function getTimeAgo(ts: number): string {
  if (!ts) return '-'
  const now = Math.floor(Date.now() / 1000)
  const diff = now - ts
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  return `${Math.floor(diff / 86400)}天前`
}

// Exporter 行组件
function ExporterRow({
  exporter,
  isExpanded,
  onToggle,
}: {
  exporter: Exporter
  isExpanded: boolean
  onToggle: () => void
}) {
  const stateInfo = STATE_MAP[exporter.state] || STATE_MAP[3]

  return (
    <div className={`exporter-row ${isExpanded ? 'expanded' : ''}`}>
      <div className="exporter-header" onClick={onToggle}>
        <div className="exporter-main-info">
          <span className="status-badge" style={{ color: stateInfo.color, backgroundColor: stateInfo.bg }}>
            {stateInfo.label}
          </span>
          <span className="app-id">{exporter.app_id}</span>
          <span className="instance">{exporter.instance}</span>
        </div>
        <div className="exporter-meta">
          <span className="last-scrape" title={formatTimestamp(exporter.last_scrape)}>
            {getTimeAgo(exporter.last_scrape)}
          </span>
          <span className={`expand-icon ${isExpanded ? 'rotated' : ''}`}>▼</span>
        </div>
      </div>

      {isExpanded && (
        <div className="exporter-details">
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">ID</span>
              <span className="detail-value mono">{exporter.id}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">首次上报</span>
              <span className="detail-value">{formatTimestamp(exporter.first_scrape)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">最后上报</span>
              <span className="detail-value">{formatTimestamp(exporter.last_scrape)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">上报次数</span>
              <span className="detail-value">{exporter.scrape_count.toLocaleString()}</span>
            </div>
            {exporter.scrape_interval && (
              <div className="detail-item">
                <span className="detail-label">上报间隔</span>
                <span className="detail-value">{formatDuration(exporter.scrape_interval)}</span>
              </div>
            )}
            {exporter.last_error && (
              <div className="detail-item full-width">
                <span className="detail-label error">最后错误</span>
                <span className="detail-value error-text">{exporter.last_error}</span>
              </div>
            )}
            {exporter.labels && Object.keys(exporter.labels).length > 0 && (
              <div className="detail-item full-width">
                <span className="detail-label">标签</span>
                <div className="labels-container">
                  {Object.entries(exporter.labels).map(([key, value]) => (
                    <span key={key} className="label-tag">
                      {key}={value}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// 主组件
export function ExporterPage() {
  const [exporters, setExporters] = useState<Exporter[]>([])
  const [stats, setStats] = useState<ExporterStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterState, setFilterState] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20

  const fetchStats = useCallback(async () => {
    try {
      const result = await getExporterStats()
      setStats(result.stats)
    } catch (err) {
      console.error('获取统计信息失败:', err)
    }
  }, [])

  const fetchExporters = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, number | undefined> = {
        page,
        page_size: pageSize,
      }
      if (filterState !== null) {
        params.state = filterState
      }
      const result = await listExporters(params)
      setExporters(result.exporters || [])
      setTotal(result.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [page, filterState])

  useEffect(() => {
    fetchStats()
    fetchExporters()

    const interval = setInterval(() => {
      fetchStats()
      fetchExporters()
    }, 30000)

    return () => clearInterval(interval)
  }, [fetchStats, fetchExporters])

  const filteredExporters = exporters.filter((exp) => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      exp.app_id.toLowerCase().includes(term) ||
      exp.instance.toLowerCase().includes(term) ||
      exp.id.toLowerCase().includes(term)
    )
  })

  const handleFilterClick = (state: number | null) => {
    setFilterState(state === filterState ? null : state)
    setPage(1)
    setExpandedId(null)
  }

  const handleRefresh = () => {
    fetchStats()
    fetchExporters()
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="page exporter-page">
      <header className="page-header">
        <div className="header-content">
          <h1>Exporter 监控</h1>
          <p>实时追踪所有 Exporter 实例状态</p>
        </div>
        <button className="refresh-btn" onClick={handleRefresh} title="刷新">
          ↻
        </button>
      </header>

      {/* Stats Cards */}
      <section className="stats-section">
        <StatsCard
          title="总计"
          value={stats?.total || 0}
          icon="📊"
          color="#6366f1"
          onClick={() => handleFilterClick(null)}
          isActive={filterState === null}
        />
        <StatsCard
          title="运行中"
          value={stats?.up_count || 0}
          icon="✅"
          color="#10b981"
          onClick={() => handleFilterClick(1)}
          isActive={filterState === 1}
        />
        <StatsCard
          title="已下线"
          value={stats?.down_count || 0}
          icon="⛔"
          color="#ef4444"
          onClick={() => handleFilterClick(2)}
          isActive={filterState === 2}
        />
        <StatsCard
          title="未知"
          value={stats?.unknown_count || 0}
          icon="❓"
          color="#f59e0b"
          onClick={() => handleFilterClick(3)}
          isActive={filterState === 3}
        />
      </section>

      {/* Search Bar */}
      <div className="search-section">
        <div className="search-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="搜索 App ID、Instance 或 ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="clear-btn" onClick={() => setSearchTerm('')}>
              ✕
            </button>
          )}
        </div>
        <div className="result-count">
          共 {filteredExporters.length} 条结果
          {filterState !== null && (
            <span className="filter-tag">
              {STATE_MAP[filterState]?.label}
              <button onClick={() => handleFilterClick(null)}>✕</button>
            </span>
          )}
        </div>
      </div>

      {/* Exporter List */}
      <main className="main">
        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={handleRefresh} />
        ) : filteredExporters.length === 0 ? (
          <EmptyState message="暂无 Exporter 数据" />
        ) : (
          <div className="exporter-list">
            {filteredExporters.map((exporter) => (
              <ExporterRow
                key={exporter.id}
                exporter={exporter}
                isExpanded={expandedId === exporter.id}
                onToggle={() => setExpandedId(expandedId === exporter.id ? null : exporter.id)}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="pagination">
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              ← 上一页
            </button>
            <span className="page-info">
              {page} / {totalPages}
            </span>
            <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              下一页 →
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
