import { UserIcon } from "lucide-react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"

interface UserInfo {
	userName: string
	expiration: string
}

/**
 * 从响应头中获取用户信息
 */
function getUserInfoFromHeaders(): UserInfo | null {
	// 在页面加载时，从第一个 API 请求的响应头中获取用户信息
	// 这里我们需要存储这些信息到 localStorage 或 state
	const storedUserName = localStorage.getItem('user_name')
	const storedExpiration = localStorage.getItem('user_expiration')
	
	if (storedUserName && storedExpiration) {
		return {
			userName: storedUserName,
			expiration: storedExpiration,
		}
	}
	
	return null
}

/**
 * 格式化过期时间为简洁的一行显示
 */
function formatExpiration(expiration: string): string {
	const expDate = new Date(expiration)
	
	// 格式化日期时间
	const dateStr = expDate.toLocaleDateString('zh-CN', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).replace(/\//g, '/')
	
	const timeStr = expDate.toLocaleTimeString('zh-CN', {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	})
	
	return `${dateStr} ${timeStr}`
}

/**
 * 用户信息按钮组件
 * 
 * 显示用户头像图标，点击展示用户名和登录过期时间
 */
export function UserInfoButton() {
	const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
	const [open, setOpen] = useState(false)

	useEffect(() => {
		// 尝试从 localStorage 读取用户信息
		const info = getUserInfoFromHeaders()
		if (info) {
			setUserInfo(info)
		}

		// 监听自定义事件来更新用户信息（当 API 调用时触发）
		const handleUserInfoUpdate = (event: CustomEvent<UserInfo>) => {
			setUserInfo(event.detail)
			localStorage.setItem('user_name', event.detail.userName)
			localStorage.setItem('user_expiration', event.detail.expiration)
		}

		window.addEventListener('user-info-updated' as any, handleUserInfoUpdate as any)

		return () => {
			window.removeEventListener('user-info-updated' as any, handleUserInfoUpdate as any)
		}
	}, [])

	const userName = userInfo?.userName || 'Guest'
	const expirationText = userInfo?.expiration ? formatExpiration(userInfo.expiration) : '暂未获取到过期时间'

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="ghost" size="icon" aria-label="用户信息">
					<UserIcon className="h-[1.2rem] w-[1.2rem]" />
				</Button>
			</PopoverTrigger>
		<PopoverContent className="w-auto p-2" align="center" side="bottom">
			<div>	
				{/* 用户名 - 加粗、左对齐 */}
				<p className="text-sm font-bold">hi, {userName} !</p>

				{/* 分割线 */}
				{/* <div className="border-t my-1" /> */}

				{/* 过期时间 - 灰色虚字 */}
				{/* <p className="text-xs text-muted-foreground">
					{expirationText}
				</p> */}
			</div>
		</PopoverContent>
		</Popover>
	)
}

