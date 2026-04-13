// Loading 组件

export function LoadingSkeleton() {
  return (
    <div className="loading-skeleton">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton-badge"></div>
          <div className="skeleton-text long"></div>
          <div className="skeleton-text short"></div>
        </div>
      ))}
    </div>
  )
}

export function LoadingSpinner({ message = '加载中...' }: { message?: string }) {
  return (
    <div className="loading-spinner">
      <div className="spinner"></div>
      <div className="loading-message">{message}</div>
    </div>
  )
}
