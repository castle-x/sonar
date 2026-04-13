/**
 * 页面加载组件
 * 
 * 用于 Suspense 的 fallback 或页面数据加载
 * 
 * @param text - 加载提示文本（默认："加载中..."）
 */
interface PageLoadingProps {
	text?: string
}

export function PageLoading({ text }: PageLoadingProps = {}) {
	return (
		<div className="flex items-center justify-center min-h-[50vh]">
			<div className="flex flex-col items-center gap-3">
				{/* 加载动画 */}
				<div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
				
				{/* 加载文本 */}
				<p className="text-sm text-muted-foreground">{text || "加载中..."}</p>
			</div>
		</div>
	)
}

/**
 * 组件加载（小尺寸）
 * 
 * 用于局部组件的 Suspense fallback
 */
export function ComponentLoading() {
	return (
		<div className="flex items-center justify-center py-8">
			<div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
		</div>
	)
}

