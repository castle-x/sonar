import { useState } from 'react'
import { ExporterPage, MetricsPage } from './routes'

// 导航项
type NavItem = 'exporter' | 'metrics'

const NAV_ITEMS: { key: NavItem; label: string; icon: string }[] = [
  { key: 'exporter', label: 'Exporter 监控', icon: '📡' },
  { key: 'metrics', label: '指标查询', icon: '📈' },
]

function App() {
  const [currentPage, setCurrentPage] = useState<NavItem>('exporter')

  return (
    <div className="app">
      {/* 顶部导航栏 */}
      <nav className="nav-bar">
        <div className="nav-brand">
          <span className="brand-icon">📊</span>
          <span className="brand-text">Datasource</span>
        </div>
        <div className="nav-items">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`nav-item ${currentPage === item.key ? 'active' : ''}`}
              onClick={() => setCurrentPage(item.key)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* 页面内容 */}
      <div className="page-container">
        {currentPage === 'exporter' && <ExporterPage />}
        {currentPage === 'metrics' && <MetricsPage />}
      </div>

      {/* 底部 */}
      <footer className="footer">
        <p>Datasource Monitor • 自动刷新间隔 30s</p>
      </footer>
    </div>
  )
}

export default App
