// 错误状态组件

interface ErrorStateProps {
  message: string
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="error-state">
      <div className="error-icon">⚠️</div>
      <div className="error-message">{message}</div>
      {onRetry && (
        <button className="retry-btn" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  )
}
