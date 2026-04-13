import { forwardRef } from "react"

/**
 * Input 输入框组件
 * 
 * 基础输入框，支持所有标准 HTML input 属性
 */
export const Input = forwardRef<
	HTMLInputElement,
	React.InputHTMLAttributes<HTMLInputElement>
>(({ className = "", type = "text", ...props }, ref) => {
	return (
		<input
			type={type}
			className={`
				flex h-10 w-full rounded-md 
				border border-input
				bg-background 
				px-3 py-2 
				text-sm 
				placeholder:text-muted-foreground
				focus-visible:outline-none 
				focus-visible:ring-2 
				focus-visible:ring-ring 
				focus-visible:ring-offset-2
				disabled:cursor-not-allowed 
				disabled:opacity-50
				${className}
			`}
			ref={ref}
			{...props}
		/>
	)
})

Input.displayName = "Input"

