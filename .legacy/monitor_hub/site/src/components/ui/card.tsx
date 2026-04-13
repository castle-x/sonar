/**
 * Card 卡片组件 (Beszel 风格)
 * 
 * 完全参考 Beszel 的卡片实现
 * 使用边框而非重阴影
 */

import * as React from "react"
import { cn } from "@/lib/utils"

// 卡片容器
const Card = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
	<div
		ref={ref}
		// Beszel 风格：border border-border/60 + 极浅阴影
		className={cn(
			"rounded-lg border border-border/60 bg-card text-card-foreground shadow-xs",
			className
		)}
		{...props}
	/>
))
Card.displayName = "Card"

// 卡片头部
const CardHeader = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
	<div
		ref={ref}
		className={cn("grid gap-1.5 p-6", className)}
		{...props}
	/>
))
CardHeader.displayName = "CardHeader"

// 卡片标题
const CardTitle = React.forwardRef<
	HTMLParagraphElement,
	React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
	<h3
		ref={ref}
		className={cn(
			"text-2xl font-semibold leading-none tracking-tight",
			className
		)}
		{...props}
	/>
))
CardTitle.displayName = "CardTitle"

// 卡片描述
const CardDescription = React.forwardRef<
	HTMLParagraphElement,
	React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
	<p
		ref={ref}
		className={cn("text-sm text-muted-foreground", className)}
		{...props}
	/>
))
CardDescription.displayName = "CardDescription"

// 卡片内容
const CardContent = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
	<div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

// 卡片底部
const CardFooter = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
	<div
		ref={ref}
		className={cn("flex items-center p-6 pt-0", className)}
		{...props}
	/>
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }

/**
 * 使用示例：
 * 
 * // 基础卡片
 * <Card>
 *   <CardHeader>
 *     <CardTitle>标题</CardTitle>
 *     <CardDescription>描述文字</CardDescription>
 *   </CardHeader>
 *   <CardContent>
 *     卡片内容
 *   </CardContent>
 *   <CardFooter>
 *     底部内容
 *   </CardFooter>
 * </Card>
 * 
 * // 简化版（只有内容）
 * <Card className="p-6">
 *   直接放内容
 * </Card>
 * 
 * // Hover 效果
 * <Card className="hover:border-border transition-colors cursor-pointer">
 *   可点击的卡片
 * </Card>
 */
