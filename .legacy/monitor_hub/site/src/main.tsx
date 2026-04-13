import "./index.css"
import { useStore } from "@nanostores/react"
import { lazy, memo, Suspense, useEffect } from "react"
import ReactDOM from "react-dom/client"
import Navbar from "@/components/navbar"
import { $router } from "@/components/router"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { PageLoading } from "@/components/loading"

// 懒加载页面组件（代码分割，提高性能）
const HomePage = lazy(() => import("@/components/routes/home"))
const Dashboard = lazy(() => import("@/components/routes/dashboard"))
const ReportDetailPage = lazy(() => import("@/components/routes/report-detail"))
const ReportExportPage = lazy(() => import("@/components/routes/report-export"))
const TaskListPage = lazy(() => import("@/components/routes/task-list"))
const TaskDetailPage = lazy(() => import("@/components/routes/task-detail"))
const TestPage = lazy(() => import("@/components/routes/test"))
const LabelSelectorTestPage = lazy(() => import("@/components/routes/label-selector-test"))
const ChartTestPage = lazy(() => import("@/components/routes/chart-test"))
const DemoPage1 = lazy(() => import("@/components/routes/demo-page-1"))
const DemoPage2 = lazy(() => import("@/components/routes/demo-page-2"))
const FileManager = lazy(() => import("@/components/routes/file-manager"))
const ScoringManager = lazy(() => import("@/components/routes/report-scoring-manager"))

/**
 * 应用路由组件
 * 
 * 根据当前路由显示不同的页面
 */
const App = memo(() => {
	const page = useStore($router)

	useEffect(() => {
		// 🔥 应用初始化：读取当前浏览器路径并初始化路由
		const currentPath = window.location.pathname + window.location.search
		console.log("[MonitorHub] App mounted")
		console.log("[MonitorHub] Current URL:", currentPath)
		console.log("[MonitorHub] Initial page state:", page)
		
		// 如果路由未初始化，手动打开当前路径
		if (!page) {
			console.log("[MonitorHub] Initializing router with:", currentPath)
			$router.open(currentPath)
		}
	}, []) // 只在组件挂载时执行一次

	// 调试：打印当前路由状态
	console.log("[MonitorHub] Rendering with page:", page)

	// 根据路由显示不同的页面
	if (!page) {
		console.log("[MonitorHub] No page matched, showing 404")
		return <h1 className="text-3xl text-center my-14">404 - No Page Found</h1>
	} else if (page.route === "home") {
		console.log("[MonitorHub] Rendering HomePage")
		return <HomePage />
	} else if (page.route === "dashboard") {
		console.log("[MonitorHub] Rendering Dashboard with id:", page.params.id)
		return <Dashboard id={page.params.id} />
	} else if (page.route === "reportDetail") {
		console.log("[MonitorHub] Rendering ReportDetailPage with id:", page.params.id)
		return <ReportDetailPage />
	} else if (page.route === "reportExport") {
		console.log("[MonitorHub] Rendering ReportExportPage with id:", page.params.id)
		return <ReportExportPage />
	} else if (page.route === "taskList") {
		console.log("[MonitorHub] Rendering TaskListPage")
		return <TaskListPage />
	} else if (page.route === "taskDetail") {
		console.log("[MonitorHub] Rendering TaskDetailPage with id:", page.params.id)
		return <TaskDetailPage />
	} else if (page.route === "taskShare") {
		console.log("[MonitorHub] Rendering TaskSharePage with id:", page.params.id)
		return <TaskDetailPage readOnly />
	} else if (page.route === "test") {
		return <TestPage />
	} else if (page.route === "labelSelectorTest") {
		return <LabelSelectorTestPage />
	} else if (page.route === "chartTest") {
		return <ChartTestPage />
	} else if (page.route === "demoPage1") {
		console.log("[MonitorHub] Rendering DemoPage1")
		return <DemoPage1 />
	} else if (page.route === "demoPage2") {
		console.log("[MonitorHub] Rendering DemoPage2")
		return <DemoPage2 />
	} else if (page.route === "fileManager") {
		console.log("[MonitorHub] Rendering FileManager")
		return <FileManager />
	} else if (page.route === "scoringManager") {
		console.log("[MonitorHub] Rendering ScoringManager")
		return <ScoringManager />
	}
	return null
})

/**
 * 全局布局组件
 */
const Layout = () => {
	const page = useStore($router)
	
	// 导出页面使用无导航栏的特殊布局
	const isExportPage = page?.route === "reportExport"
	
	// 任务页面和报告详情页面使用相同的宽度布局
	const isTaskPage = page?.route === "taskDetail" || page?.route === "taskList" || page?.route === "taskShare"
	
	// 报告详情页面使用较小的宽度
	const isReportDetail = page?.route === "reportDetail"
	const containerClass = (isTaskPage || isReportDetail)
		? "container max-w-[89rem]"  // 任务页面和报告页面使用相同宽度
		: "container"
	
	// 导出页面不显示导航栏，直接渲染内容
	if (isExportPage) {
		return (
			<Suspense fallback={<PageLoading />}>
				<App />
			</Suspense>
		)
	}
	
	return (
		<>
			{/* Navbar 独立的 container */}
			<div className={containerClass}>
				<Navbar />
			</div>

			{/* 主内容区独立的 container */}
		<div className={`${containerClass} relative pb-8`}>
				<Suspense fallback={<PageLoading />}>
					<App />
				</Suspense>
			</div>
		</>
	)
}

/**
 * 根组件
 */
const Root = () => {
	return (
		<ThemeProvider>
			<Layout />
			<Toaster />
		</ThemeProvider>
	)
}

// 🔥 在 React 渲染前预初始化路由器（可选，但建议保留）
console.log("[MonitorHub] Pre-initializing router")
console.log("[MonitorHub] window.location.pathname:", window.location.pathname)
$router.open(window.location.pathname + window.location.search)

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(<Root />)