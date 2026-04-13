// 空状态组件

interface EmptyStateProps {
  message: string
  icon?: string
}

export function EmptyState({ message, icon = '📭' }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <div className="empty-message">{message}</div>
    </div>
  )
}
