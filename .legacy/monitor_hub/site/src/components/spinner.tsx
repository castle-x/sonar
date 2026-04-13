/**
 * 加载动画组件
 * 
 * 用于显示加载状态（懒加载、数据请求等）
 */
export default function Spinner({ 
  size = "md",
  className = "" 
}: { 
  size?: "sm" | "md" | "lg"
  className?: string 
}) {
  const sizeClasses = {
    sm: "h-4 w-4 border-2",
    md: "h-8 w-8 border-3",
    lg: "h-12 w-12 border-4"
  }
  
  return (
    <div className="flex items-center justify-center p-8">
      <div
        className={`
          animate-spin rounded-full 
          border-solid border-primary border-t-transparent
          ${sizeClasses[size]}
          ${className}
        `}
      />
    </div>
  )
}

/**
 * 全屏加载组件
 */
export function FullScreenSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Spinner size="lg" />
    </div>
  )
}

