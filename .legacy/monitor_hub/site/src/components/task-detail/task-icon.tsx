/**
 * TaskIcon - 任务图标组件
 * 
 * 支持三种显示方式：
 * 1. 如果有 iconName，显示上传的图标
 * 2. 否则显示任务名称的首字母头像（带渐变背景）
 * 
 * 支持上传功能：
 * - 鼠标悬停显示上传提示
 * - 点击可选择图片上传
 */

import { UploadIcon } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/components/ui/use-toast"
import { uploadTaskIcon } from "@/apis/task"

interface TaskIconProps {
	/** 任务 ID（上传时需要，也用于构建图标 URL） */
	taskId: string
	/** 任务名称（用于显示首字母） */
	taskName?: string
	/** 图标名称（用户上传） */
	iconName?: string
	/** 图标尺寸 */
	size?: number
	/** 是否可上传 */
	uploadable?: boolean
	/** 上传成功回调 */
	onUploadSuccess?: () => void
}

/**
 * 根据字符串生成一致的渐变色
 */
function getGradientColor(str: string): string {
	// 简单的字符串哈希
	let hash = 0
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i)
		hash = ((hash << 5) - hash) + char
		hash = hash & hash
	}
	
	// 预设渐变色
	const gradients = [
		'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
		'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
		'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
		'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
		'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
		'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
		'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
		'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
	]
	
	const index = Math.abs(hash) % gradients.length
	return gradients[index]
}

export function TaskIcon({ 
	taskId,
	taskName,
	iconName,
	size = 56,
	uploadable = false,
	onUploadSuccess 
}: TaskIconProps) {
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [isUploading, setIsUploading] = useState(false)
	const [isHovered, setIsHovered] = useState(false)
	const { toast } = useToast()
	
	// 计算首字母和渐变色
	const { initial, gradient } = useMemo(() => {
		const firstChar = taskName ? taskName[0].toUpperCase() : '?'
		const color = getGradientColor(taskName || taskId || 'default')
		return { initial: firstChar, gradient: color }
	}, [taskName, taskId])
	
	// 计算图标 URL
	const iconUrl = useMemo(() => {
		if (iconName && taskId) {
			return `/icons/${taskId}/${iconName}`
		}
		return null
	}, [iconName, taskId])
	
	// 处理文件选择
	const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file || !taskId) return
		
		setIsUploading(true)
		try {
			await uploadTaskIcon(taskId, file)
			toast({
				title: "上传成功",
				description: "图标已更新",
			})
			onUploadSuccess?.()
		} catch (error) {
			toast({
				title: "上传失败",
				description: error instanceof Error ? error.message : "未知错误",
				variant: "destructive",
			})
		} finally {
			setIsUploading(false)
			// 清空 input 以便重复选择同一文件
			if (fileInputRef.current) {
				fileInputRef.current.value = ''
			}
		}
	}
	
	// 点击触发文件选择
	const handleClick = () => {
		if (uploadable && taskId && !isUploading) {
			fileInputRef.current?.click()
		}
	}
	
	// 上传遮罩层
	const UploadOverlay = () => (
		<div 
			className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white rounded-lg transition-opacity duration-200"
			style={{ opacity: isHovered && uploadable ? 1 : 0 }}
		>
			{isUploading ? (
				<div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
			) : (
				<>
					<UploadIcon className="h-5 w-5 mb-0.5" />
					<span className="text-[10px]">上传</span>
				</>
			)}
		</div>
	)
	
	// 隐藏的文件输入
	const FileInput = () => (
		<input
			ref={fileInputRef}
			type="file"
			accept="image/png,image/jpeg,image/jpg,image/svg+xml"
			className="hidden"
			onChange={handleFileChange}
		/>
	)
	
	// 基础容器样式
	const containerClassName = `rounded-lg overflow-hidden border shadow-sm shrink-0 relative ${
		uploadable ? 'cursor-pointer' : ''
	}`
	
	const containerProps = {
		className: containerClassName,
		style: { width: size, height: size },
		onClick: handleClick,
		onMouseEnter: () => setIsHovered(true),
		onMouseLeave: () => setIsHovered(false),
	}
	
	// 如果可上传，包装在 Tooltip 中
	const wrapWithTooltip = (content: React.ReactNode) => {
		if (!uploadable) return content
		
		return (
			<TooltipProvider>
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						{content}
					</TooltipTrigger>
					<TooltipContent>
						<p>点击上传自定义图标</p>
						<p className="text-xs text-muted-foreground">支持 PNG、JPG、SVG，最大 2MB</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		)
	}
	
	// 如果有图标 URL，显示图片
	if (iconUrl) {
		return wrapWithTooltip(
			<div {...containerProps}>
				<img 
					src={iconUrl} 
					alt={taskName} 
					className="w-full h-full object-cover" 
				/>
				<UploadOverlay />
				<FileInput />
			</div>
		)
	}
	
	// 否则显示首字母头像
	return wrapWithTooltip(
		<div {...containerProps}>
			<div 
				className="w-full h-full flex items-center justify-center text-white font-bold"
				style={{ 
					background: gradient,
					fontSize: size * 0.4,
				}}
			>
				{initial}
			</div>
			<UploadOverlay />
			<FileInput />
		</div>
	)
}
