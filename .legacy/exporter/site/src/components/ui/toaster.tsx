import { useState, useCallback } from "react"
import {
	ToastProvider,
	ToastViewport,
	Toast,
	ToastTitle,
	ToastDescription,
	ToastClose,
} from "./toast"

type ToastData = {
	id: string
	title?: string
	description?: string
	variant?: "default" | "destructive"
	duration?: number
}

let toastListener: ((toast: Omit<ToastData, "id">) => void) | null = null

export function toast(data: Omit<ToastData, "id">) {
	toastListener?.(data)
}

export function Toaster() {
	const [toasts, setToasts] = useState<ToastData[]>([])

	const addToast = useCallback((data: Omit<ToastData, "id">) => {
		const id = Math.random().toString(36).slice(2)
		setToasts((prev) => [...prev, { id, ...data }])
		setTimeout(() => {
			setToasts((prev) => prev.filter((t) => t.id !== id))
		}, data.duration ?? 3000)
	}, [])

	// Register the listener
	toastListener = addToast

	return (
		<ToastProvider>
			{toasts.map(({ id, title, description, variant }) => (
				<Toast key={id} variant={variant}>
					<div className="grid gap-1">
						{title && <ToastTitle>{title}</ToastTitle>}
						{description && <ToastDescription>{description}</ToastDescription>}
					</div>
					<ToastClose />
				</Toast>
			))}
			<ToastViewport />
		</ToastProvider>
	)
}
