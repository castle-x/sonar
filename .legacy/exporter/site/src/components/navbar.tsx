import { useStore } from "@nanostores/react"
import { SettingsIcon, BugIcon, ActivityIcon, MoonStarIcon, SunIcon } from "lucide-react"
import { $router, navigate } from "./router"
import { useTheme } from "./theme-provider"
import { Button } from "./ui/button"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
	{ route: "config", href: "/", label: "配置管理", icon: SettingsIcon },
	{ route: "debug", href: "/debug", label: "调试工具", icon: BugIcon },
	{ route: "status", href: "/status", label: "运行状态", icon: ActivityIcon },
] as const

export default function Navbar() {
	const page = useStore($router)
	const { theme, setTheme } = useTheme()

	return (
		<div className="flex items-center h-14 bg-card px-4 sm:px-6 border border-border/60 rounded-md mt-4 mb-6">
			{/* Logo */}
			<div className="flex items-center gap-2 me-6">
				<div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
					<ActivityIcon className="h-4 w-4 text-primary-foreground" />
				</div>
				<span className="font-semibold text-sm hidden sm:block">Exporter 管理</span>
			</div>

			{/* 导航 */}
			<nav className="flex items-center gap-1">
				{NAV_ITEMS.map(({ route, href, label, icon: Icon }) => (
					<button
						key={route}
						onClick={() => navigate(href)}
						className={cn(
							"flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
							page?.route === route
								? "bg-accent text-accent-foreground"
								: "text-muted-foreground hover:text-foreground hover:bg-accent/50"
						)}
					>
						<Icon className="h-4 w-4" />
						<span className="hidden sm:inline">{label}</span>
					</button>
				))}
			</nav>

			{/* 右侧 - 主题切换 */}
			<div className="ms-auto">
				<Button
					variant="ghost"
					size="icon"
					aria-label="切换主题"
					onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
				>
					<SunIcon className="h-[1.2rem] w-[1.2rem] transition-all -rotate-90 dark:opacity-0 dark:rotate-0" />
					<MoonStarIcon className="absolute h-[1.2rem] w-[1.2rem] transition-all opacity-0 -rotate-90 dark:opacity-100 dark:rotate-0" />
				</Button>
			</div>
		</div>
	)
}
