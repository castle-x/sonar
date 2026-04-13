// 统计卡片组件

interface StatsCardProps {
  title: string
  value: number | string
  icon: string
  color: string
  onClick?: () => void
  isActive?: boolean
}

export function StatsCard({ title, value, icon, color, onClick, isActive }: StatsCardProps) {
  return (
    <div
      className={`stats-card ${isActive ? 'active' : ''}`}
      style={{ '--accent-color': color } as React.CSSProperties}
      onClick={onClick}
    >
      <div className="stats-icon">{icon}</div>
      <div className="stats-content">
        <div className="stats-value">{value}</div>
        <div className="stats-title">{title}</div>
      </div>
    </div>
  )
}
