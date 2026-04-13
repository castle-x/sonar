/**
 * ProjectIcon - 项目图标组件
 * 
 * 支持三种显示方式：
 * 1. 如果有 reportIconName，显示报告专属图标
 * 2. 如果有 datasourceIconName，显示数据源图标
 * 3. 否则显示 app_id 的首字母头像（带渐变背景）
 * 4. 如果都没有，显示默认图标
 * 
 * 支持上传功能：
 * - 鼠标悬停显示上传提示
 * - 点击可选择图片上传
 */

import { FolderKanbanIcon, UploadIcon } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/components/ui/use-toast"
import { uploadReportIcon } from "@/apis/report"

interface ProjectIconProps {
	/** 报告 ID（上传时需要，也用于构建报告图标 URL） */
	reportId?: string
	/** 数据源 ID（用于构建数据源图标 URL） */
	datasourceId?: string
	/** 项目 ID */
	appId?: string
	/** 数据源图标名称（来自数据源） */
	datasourceIconName?: string
	/** 报告专属图标名称（用户上传） */
	reportIconName?: string
	/** 图标尺寸 */
	size?: number
	/** 是否可上传（需要 reportId） */
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
		hash = ((hash << 5) - hash) + str.charCodeAt(i)
		hash = hash & hash
	}
	
	// 定义几种好看的渐变色组合
	const gradients = [
		'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', // 紫色
		'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', // 粉红
		'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', // 蓝色
		'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', // 绿色
		'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', // 橙色
		'linear-gradient(135deg, #30cfd0 0%, #330867 100%)', // 青紫
		'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)', // 淡彩
		'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)', // 粉橙
	]
	
	const index = Math.abs(hash) % gradients.length
	return gradients[index]
}

export function ProjectIcon({ 
	reportId,
	datasourceId,
	appId, 
	datasourceIconName,
	reportIconName,
	size = 120,
	uploadable = false,
	onUploadSuccess 
}: ProjectIconProps) {
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [isUploading, setIsUploading] = useState(false)
	const [isHovered, setIsHovered] = useState(false)
	const { toast } = useToast()
	
	// 计算首字母和渐变色
	const { initial, gradient } = useMemo(() => {
		const firstChar = appId ? appId[0].toUpperCase() : '?'
		const color = getGradientColor(appId || 'default')
		return { initial: firstChar, gradient: color }
	}, [appId])
	
	// 计算图标 URL
	// 优先使用报告专属图标，其次使用数据源图标
	const iconUrl = useMemo(() => {
		if (reportIconName && reportId) {
			// 报告图标存储在 /icon/{report_id}/{filename}
			return `/icons/${reportId}/${reportIconName}`
		}
		if (datasourceIconName && datasourceId) {
			// 数据源图标存储在 /icon/{datasource_id}/{filename}
			return `/icons/${datasourceId}/${datasourceIconName}`
		}
		return null
	}, [reportIconName, reportId, datasourceIconName, datasourceId])
	
	// 处理文件选择
	const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file || !reportId) return
		
		setIsUploading(true)
		try {
			await uploadReportIcon(reportId, file)
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
		if (uploadable && reportId && !isUploading) {
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
				<div className="animate-spin h-6 w-6 border-2 border-white border-t-transparent rounded-full" />
			) : (
				<>
					<UploadIcon className="h-6 w-6 mb-1" />
					<span className="text-xs">点击上传</span>
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
					alt={appId} 
					className="w-full h-full object-cover" 
				/>
				<UploadOverlay />
				<FileInput />
			</div>
		)
	}
	
	// 否则显示首字母头像
	if (appId) {
		return wrapWithTooltip(
			<div 
				{...containerProps}
				className={`${containerClassName} flex items-center justify-center text-white font-bold`}
				style={{ 
					...containerProps.style,
					background: gradient,
					fontSize: `${size * 0.4}px`
				}}
			>
				{initial}
				<UploadOverlay />
				<FileInput />
			</div>
		)
	}
	
	// 默认图标
	return wrapWithTooltip(
		<div 
			{...containerProps}
			className={`${containerClassName} flex items-center justify-center bg-muted`}
		>
			<FolderKanbanIcon className="text-muted-foreground" style={{ width: size * 0.5, height: size * 0.5 }} />
			<UploadOverlay />
			<FileInput />
		</div>
	)
}
