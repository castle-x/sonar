import { GithubIcon } from "lucide-react"
import { Separator } from "./ui/separator"

export function FooterRepoLink() {
	return (
		<div className="flex gap-1.5 justify-end items-center pe-3 sm:pe-6 mt-3.5 mb-4 text-xs opacity-80">
			<a
				href="https://github.com/henrygd/beszel"
				target="_blank"
				className="flex items-center gap-0.5 text-muted-foreground hover:text-foreground duration-75"
				rel="noopener"
			>
				<GithubIcon className="h-3 w-3" /> 工蜂
			</a>
			<Separator orientation="vertical" className="h-2.5 bg-muted-foreground opacity-70" />
			<a
				href="https://git.woa.com/castlexu/monitor_hub"
				target="_blank"
				className="text-muted-foreground hover:text-foreground duration-75"
				rel="noopener"
			>
				Monitor Hub {globalThis.MONITOR_HUB.VERSION === '{{V}}' ? "0.0.1" : globalThis.MONITOR_HUB.VERSION}
			</a>
		</div>
	)
}
