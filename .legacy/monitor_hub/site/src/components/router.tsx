import { createRouter } from "@nanostores/router"

const routes = {
	home: "/",
	dashboard: "/dashboard/:id",  // 数据源详情页面
	reportDetail: "/report/:id",  // 报告详情页面
	reportExport: "/report/:id/export",  // 报告导出页面（专为截图优化）
	taskList: "/task",  // 测试任务入口/列表页面
	taskDetail: "/task/:id",  // 测试任务详情页面
	taskShare: "/task/:id/share",  // 测试任务分享页面（只读）
	test: "/test",  // WebSocket 测试页面
	labelSelectorTest: "/label-selector-test",  // 标签筛选器测试页面
	chartTest: "/chart-test",  // 图表组件测试页面
	demoPage1: "/demo/analysis",  // 演示页面 1 - 数据分析
	demoPage2: "/demo/settings",  // 演示页面 2 - 系统配置
	fileManager: "/files",  // 文件管理器
	scoringManager: "/scoring-manager",  // 评分配置管理页面
	settings: "/settings/:name?",  // :name? 表示可选的路由参数
} as const

/**
 * The base path of the application.
 * This is used to prepend the base path to all routes.
 */
export const basePath = MONITOR_HUB?.BASE_PATH || ""

/**
 * Prepends the base path to the given path.
 * @param path The path to prepend the base path to.
 * @returns The path with the base path prepended.
 */
export const prependBasePath = (path: string) => (basePath + path).replaceAll("//", "/")

// prepend base path to routes
for (const route in routes) {
	// @ts-expect-error need as const above to get nanostores to parse types properly
	routes[route] = prependBasePath(routes[route])
}

export const $router = createRouter(routes, { links: false })

/** Navigate to url using router
 *  Base path is automatically prepended if serving from subpath
 */
export const navigate = (urlString: string) => {
	$router.open(urlString)
}

export function Link(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
	return (
		<a
			{...props}
			onClick={(e) => {
				e.preventDefault()
				const href = props.href || ""
				if (e.ctrlKey || e.metaKey) {
					window.open(href, "_blank")
				} else {
					navigate(href)
					props.onClick?.(e)
				}
			}}
		></a>
	)
}

