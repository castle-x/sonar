import "./index.css"
import { useStore } from "@nanostores/react"
import { lazy, memo, Suspense } from "react"
import ReactDOM from "react-dom/client"
import Navbar from "@/components/navbar"
import { $router } from "@/components/router"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"

const ConfigPage = lazy(() => import("@/components/routes/config-page"))
const DebugPage = lazy(() => import("@/components/routes/debug-page"))
const StatusPage = lazy(() => import("@/components/routes/status-page"))

function PageLoading() {
	return (
		<div className="flex items-center justify-center min-h-[50vh]">
			<div className="flex flex-col items-center gap-3">
				<div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
				<p className="text-sm text-muted-foreground">加载中...</p>
			</div>
		</div>
	)
}

const App = memo(() => {
	const page = useStore($router)

	if (!page) {
		return <h1 className="text-3xl text-center my-14 text-muted-foreground">404 - 页面未找到</h1>
	}

	if (page.route === "config") return <ConfigPage />
	if (page.route === "debug") return <DebugPage />
	if (page.route === "status") return <StatusPage />

	return null
})

const Layout = () => (
	<div className="container max-w-5xl">
		<Navbar />
		<Suspense fallback={<PageLoading />}>
			<App />
		</Suspense>
	</div>
)

const Root = () => (
	<ThemeProvider>
		<Layout />
		<Toaster />
	</ThemeProvider>
)

// 初始化路由
$router.open(window.location.pathname + window.location.search)

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(<Root />)
