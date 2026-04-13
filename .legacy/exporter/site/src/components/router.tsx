import { createRouter } from "@nanostores/router"

const routes = {
	config: "/",
	debug: "/debug",
	status: "/status",
} as const

export const $router = createRouter(routes, { links: false })

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
		/>
	)
}
