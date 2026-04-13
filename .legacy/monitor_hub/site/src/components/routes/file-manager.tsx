/**
 * FileManager - 文件管理器（树形结构版本）
 * 
 * 生产级文件管理界面，支持树形浏览、上传、下载、删除文件
 */

import { memo, useState, useEffect, useCallback } from 'react'
import { 
	FolderIcon, 
	FileIcon, 
	UploadIcon, 
	FolderPlusIcon, 
	TrashIcon, 
	DownloadIcon,
	ChevronRightIcon,
	ChevronDownIcon,
	RefreshCwIcon,
	FileTextIcon,
	ImageIcon,
	VideoIcon,
	MusicIcon,
	ArchiveIcon,
	CodeIcon,
	FolderOpenIcon,
	LinkIcon,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import type { FileNode, FileStats } from '@/apis/filetree'
import { 
	getFileTree, 
	downloadFile, 
	getDownloadUrl,
	getFileStats, 
	uploadFile as uploadFileApi, 
	deleteFile, 
	createDir 
} from '@/apis/filetree'

// 扩展 FileNode 类型以包含展开状态
interface TreeNode extends FileNode {
	children?: TreeNode[]
}

// 格式化文件大小
function formatSize(bytes: number): string {
	if (bytes === 0) return '0 B'
	const k = 1024
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
	const i = Math.floor(Math.log(bytes) / Math.log(k))
	return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

// 格式化时间
function formatTime(timestamp: number): string {
	const date = new Date(timestamp)
	return date.toLocaleString('zh-CN', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	})
}

// 根据文件扩展名获取图标
function getFileIcon(name: string, isDir: boolean, expanded: boolean = false) {
	if (isDir) {
		return expanded 
			? <FolderOpenIcon className="size-5 text-blue-500" />
			: <FolderIcon className="size-5 text-blue-500" />
	}
	
	const ext = name.split('.').pop()?.toLowerCase()
	
	// 图片
	if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext || '')) {
		return <ImageIcon className="size-5 text-green-500" />
	}
	
	// 视频
	if (['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv'].includes(ext || '')) {
		return <VideoIcon className="size-5 text-purple-500" />
	}
	
	// 音频
	if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext || '')) {
		return <MusicIcon className="size-5 text-pink-500" />
	}
	
	// 压缩包
	if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext || '')) {
		return <ArchiveIcon className="size-5 text-orange-500" />
	}
	
	// 代码文件
	if (['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'cpp', 'c', 'go', 'rs', 'php', 'html', 'css', 'sh'].includes(ext || '')) {
		return <CodeIcon className="size-5 text-blue-600" />
	}
	
	// 文本文件
	if (['txt', 'md', 'log', 'csv'].includes(ext || '')) {
		return <FileTextIcon className="size-5 text-gray-600" />
	}
	
	// 默认文件图标
	return <FileIcon className="size-5 text-gray-500" />
}

export default memo(function FileManager() {
	const { toast } = useToast()
	
	// 状态管理
	const [fileTree, setFileTree] = useState<TreeNode[]>([])
	const [stats, setStats] = useState<FileStats | null>(null)
	const [loading, setLoading] = useState(false)
	const [selectedFile, setSelectedFile] = useState<TreeNode | null>(null)
	const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['/']))
	
	// 对话框状态
	const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
	const [createDirDialogOpen, setCreateDirDialogOpen] = useState(false)
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const [uploadFile, setUploadFileState] = useState<File | null>(null)
	const [newDirName, setNewDirName] = useState('')
	const [uploading, setUploading] = useState(false)
	const [deleting, setDeleting] = useState(false)
	const [creating, setCreating] = useState(false)
	const [isDragging, setIsDragging] = useState(false)
	
	// 排序节点（最新的在上面）
	const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
		return [...nodes].sort((a, b) => {
			// 目录优先
			if (a.is_dir !== b.is_dir) {
				return a.is_dir ? -1 : 1
			}
			// 按修改时间降序（最新的在前）
			return b.modified_time - a.modified_time
		})
	}
	
	// 加载文件树
	const loadFiles = useCallback(async () => {
		setLoading(true)
		try {
			// 加载完整树（depth=10 应该足够了）
			const data = await getFileTree({ path: '/', depth: 10 })
			
			// 递归排序所有节点
			const sortTree = (node: TreeNode): TreeNode => {
				if (node.children) {
					node.children = sortNodes(node.children.map(sortTree))
				}
				return node
			}
			
			const sortedChildren = sortNodes((data.children || []).map(sortTree))
			setFileTree(sortedChildren)
			
			// 加载统计信息
			const statsData = await getFileStats({ path: '/' })
			setStats(statsData)
		} catch (error: any) {
			toast({
				title: '加载失败',
				description: error.message || '无法加载文件列表',
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}, [toast])
	
	// 初始加载
	useEffect(() => {
		loadFiles()
	}, [loadFiles])
	
	// 切换目录展开/折叠
	const toggleExpanded = useCallback((path: string) => {
		setExpandedPaths(prev => {
			const next = new Set(prev)
			if (next.has(path)) {
				next.delete(path)
			} else {
				next.add(path)
			}
			return next
		})
	}, [])
	
	// 下载文件
	const handleDownload = useCallback((node: TreeNode) => {
		try {
			downloadFile(node.path)
			toast({
				title: '下载开始',
				description: `正在下载文件: ${node.name}`,
			})
		} catch (error: any) {
			toast({
				title: '下载失败',
				description: error.message || '无法下载文件',
				variant: 'destructive',
			})
		}
	}, [toast])
	
	// 复制下载链接
	const handleCopyLink = useCallback(async (node: TreeNode) => {
		try {
			const downloadUrl = getDownloadUrl(node.path)
			// 构造完整的 URL（包含协议和域名）
			const fullUrl = new URL(downloadUrl, window.location.origin).href
			
			// 优先使用现代 Clipboard API（需要 HTTPS）
			if (navigator.clipboard && navigator.clipboard.writeText) {
				await navigator.clipboard.writeText(fullUrl)
			} else {
				// 后备方案：使用传统的 execCommand 方法（兼容 HTTP）
				const textArea = document.createElement('textarea')
				textArea.value = fullUrl
				textArea.style.position = 'fixed'
				textArea.style.left = '-999999px'
				textArea.style.top = '-999999px'
				document.body.appendChild(textArea)
				textArea.focus()
				textArea.select()
				
				try {
					document.execCommand('copy')
					textArea.remove()
				} catch (err) {
					textArea.remove()
					throw new Error('复制失败，请手动复制链接')
				}
			}
			
			toast({
				title: '复制成功',
				description: `已复制下载链接到剪贴板`,
			})
		} catch (error: any) {
			toast({
				title: '复制失败',
				description: error.message || '无法复制链接',
				variant: 'destructive',
			})
		}
	}, [toast])
	
	// 处理文件选择
	const handleFileSelect = useCallback((file: File) => {
		setUploadFileState(file)
		setIsDragging(false)
	}, [])
	
	// 处理拖拽
	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		setIsDragging(true)
	}, [])
	
	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		setIsDragging(false)
	}, [])
	
	const handleDrop = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		setIsDragging(false)
		
		const files = e.dataTransfer.files
		if (files.length > 0) {
			handleFileSelect(files[0])
		}
	}, [handleFileSelect])
	
	// 处理上传
	const handleUploadSubmit = useCallback(async () => {
		if (!uploadFile) return
		
		setUploading(true)
		try {
			await uploadFileApi('/', uploadFile, false)
			toast({
				title: '上传成功',
				description: `文件 ${uploadFile.name} 已上传`,
			})
			setUploadDialogOpen(false)
			setUploadFileState(null)
			loadFiles()
		} catch (error: any) {
			toast({
				title: '上传失败',
				description: error.message || '无法上传文件',
				variant: 'destructive',
			})
		} finally {
			setUploading(false)
		}
	}, [uploadFile, toast, loadFiles])
	
	// 处理创建目录
	const handleCreateDirSubmit = useCallback(async () => {
		if (!newDirName.trim()) return
		
		setCreating(true)
		try {
			await createDir(`/${newDirName}`, true)
			toast({
				title: '创建成功',
				description: `目录 ${newDirName} 已创建`,
			})
			setCreateDirDialogOpen(false)
			setNewDirName('')
			loadFiles()
		} catch (error: any) {
			toast({
				title: '创建失败',
				description: error.message || '无法创建目录',
				variant: 'destructive',
			})
		} finally {
			setCreating(false)
		}
	}, [newDirName, toast, loadFiles])
	
	// 处理删除
	const handleDeleteSubmit = useCallback(async () => {
		if (!selectedFile) return
		
		setDeleting(true)
		try {
			await deleteFile(selectedFile.path, selectedFile.is_dir)
			toast({
				title: '删除成功',
				description: `${selectedFile.is_dir ? '目录' : '文件'} ${selectedFile.name} 已删除`,
			})
			setDeleteDialogOpen(false)
			setSelectedFile(null)
			loadFiles()
		} catch (error: any) {
			toast({
				title: '删除失败',
				description: error.message || '无法删除',
				variant: 'destructive',
			})
		} finally {
			setDeleting(false)
		}
	}, [selectedFile, toast, loadFiles])
	
	// 递归渲染树节点
	const renderTreeNode = (node: TreeNode, level: number = 0): JSX.Element => {
		const isExpanded = expandedPaths.has(node.path)
		const hasChildren = node.is_dir && node.children && node.children.length > 0
		
		return (
			<div key={node.path}>
				{/* 节点行 */}
				<div 
					className="flex items-center gap-2 py-2 px-3 hover:bg-muted/50 group"
					style={{ paddingLeft: `${level * 24 + 12}px` }}
				>
					{/* 展开/折叠图标 */}
					<div className="w-5 flex items-center justify-center shrink-0">
						{node.is_dir && (
							<Button
								variant="ghost"
								size="icon"
								className="h-5 w-5 p-0"
								onClick={() => toggleExpanded(node.path)}
							>
								{isExpanded ? (
									<ChevronDownIcon className="h-4 w-4" />
								) : (
									<ChevronRightIcon className="h-4 w-4" />
								)}
							</Button>
						)}
					</div>
					
					{/* 文件/文件夹图标 */}
					<div 
						className={cn("flex items-center gap-2 flex-1 min-w-0", node.is_dir && "cursor-pointer")}
						onClick={() => node.is_dir && toggleExpanded(node.path)}
					>
						{getFileIcon(node.name, node.is_dir, isExpanded)}
						<span className="text-sm font-medium truncate">{node.name}</span>
						{node.is_dir && node.file_count !== undefined && node.file_count > 0 && (
							<span className="text-xs text-muted-foreground shrink-0">
								({Math.max(0, node.file_count - 1)} 项)
							</span>
						)}
					</div>
					
					{/* 文件大小 */}
					<div className="text-sm text-muted-foreground w-24 text-right shrink-0">
						{node.is_dir ? '-' : formatSize(node.size)}
					</div>
					
					{/* 修改时间 */}
					<div className="text-sm text-muted-foreground w-40 text-right shrink-0">
						{formatTime(node.modified_time)}
					</div>
					
					{/* 操作按钮 */}
					<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
						{!node.is_dir && (
							<>
								<Button
									variant="ghost"
									size="sm"
									className="h-8 w-8 p-0"
									onClick={(e) => {
										e.stopPropagation()
										handleDownload(node)
									}}
									title="下载"
								>
									<DownloadIcon className="size-4" />
								</Button>
								<Button
									variant="ghost"
									size="sm"
									className="h-8 w-8 p-0"
									onClick={(e) => {
										e.stopPropagation()
										handleCopyLink(node)
									}}
									title="复制下载链接"
								>
									<LinkIcon className="size-4" />
								</Button>
							</>
						)}
						<Button
							variant="ghost"
							size="sm"
							className="h-8 w-8 p-0 text-destructive hover:text-destructive"
							onClick={(e) => {
								e.stopPropagation()
								setSelectedFile(node)
								setDeleteDialogOpen(true)
							}}
							title="删除"
						>
							<TrashIcon className="size-4" />
						</Button>
					</div>
				</div>
				
				{/* 子节点（如果展开） */}
				{node.is_dir && isExpanded && hasChildren && (
					<div>
						{node.children!.map(child => renderTreeNode(child, level + 1))}
					</div>
				)}
			</div>
		)
	}
	
	return (
		<div className="space-y-6">
			
			{/* 统计信息卡片 */}
			{stats && (
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					<Card>
						<CardHeader className="pb-3">
							<CardDescription>文件数量</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">{stats.total_files}</div>
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="pb-3">
							<CardDescription>目录数量</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">{Math.max(0, stats.total_dirs - 1)}</div>
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="pb-3">
							<CardDescription>总大小</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">{stats.size_human || formatSize(stats.total_size)}</div>
						</CardContent>
					</Card>
				</div>
			)}
			
			{/* 文件树 */}
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div className="text-lg font-semibold">文件浏览</div>
						
						{/* 操作按钮 */}
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => loadFiles()}
								disabled={loading}
							>
								<RefreshCwIcon className={cn("size-4 mr-2", loading && "animate-spin")} />
								刷新
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setCreateDirDialogOpen(true)}
							>
								<FolderPlusIcon className="size-4 mr-2" />
								新建文件夹
							</Button>
							<Button
								variant="default"
								size="sm"
								onClick={() => setUploadDialogOpen(true)}
							>
								<UploadIcon className="size-4 mr-2" />
								上传文件
							</Button>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					{loading ? (
						<div className="flex items-center justify-center py-20">
							<RefreshCwIcon className="size-8 animate-spin text-muted-foreground" />
						</div>
					) : fileTree.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
							<FolderIcon className="size-16 mb-4 opacity-50" />
							<p>此目录为空</p>
						</div>
					) : (
						<div className="border rounded-lg overflow-hidden">
						{/* 表头 */}
						<div className="flex items-center gap-2 py-2 px-3 bg-muted/50 border-b font-medium text-sm">
							<div className="w-5 shrink-0"></div>
							<div className="flex-1">名称</div>
							<div className="w-24 text-right shrink-0">大小</div>
							<div className="w-40 text-right shrink-0">修改时间</div>
							<div className="w-28 shrink-0"></div>
						</div>
							
							{/* 树形列表 */}
							<div className="max-h-[600px] overflow-y-auto">
								{fileTree.map(node => renderTreeNode(node, 0))}
							</div>
						</div>
					)}
				</CardContent>
			</Card>
			
			{/* 上传文件对话框 */}
			<Dialog open={uploadDialogOpen} onOpenChange={(open) => {
				setUploadDialogOpen(open)
				if (!open) {
					setUploadFileState(null)
					setIsDragging(false)
				}
			}}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>上传文件</DialogTitle>
						<DialogDescription>
							上传到：根目录
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						{/* 拖拽上传区域 */}
						<div
							onDragOver={handleDragOver}
							onDragLeave={handleDragLeave}
							onDrop={handleDrop}
							className={cn(
								"relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
								isDragging 
									? "border-emerald-500 bg-emerald-50" 
									: "border-gray-300 hover:border-emerald-400 hover:bg-gray-50"
							)}
							onClick={() => document.getElementById('file-upload')?.click()}
						>
							<input
								id="file-upload"
								type="file"
								className="hidden"
								onChange={(e) => {
									const file = e.target.files?.[0]
									if (file) {
										handleFileSelect(file)
									}
								}}
							/>
							<div className="space-y-2">
								<UploadIcon className={cn(
									"size-10 mx-auto",
									isDragging ? "text-emerald-600" : "text-gray-400"
								)} />
								<div className="text-sm">
									{isDragging ? (
										<p className="font-medium text-emerald-600">松开鼠标上传文件</p>
									) : (
										<>
											<p className="font-medium text-gray-700">点击选择文件或拖拽到此处</p>
											<p className="text-gray-500 text-xs mt-1">支持任意文件类型</p>
										</>
									)}
								</div>
							</div>
						</div>
						
						{/* 已选择的文件信息 */}
						{uploadFile && (
							<div className="rounded-md border bg-muted/50 p-3">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2 min-w-0">
										<FileIcon className="size-4 text-gray-600 flex-shrink-0" />
										<span className="text-sm font-medium truncate">{uploadFile.name}</span>
									</div>
									<span className="text-sm text-muted-foreground ml-2 flex-shrink-0">
										{formatSize(uploadFile.size)}
									</span>
								</div>
							</div>
						)}
					</div>
					<DialogFooter className="mt-6">
						<Button
							variant="outline"
							onClick={() => setUploadDialogOpen(false)}
							disabled={uploading}
						>
							取消
						</Button>
						<Button
							onClick={handleUploadSubmit}
							disabled={!uploadFile || uploading}
						>
							{uploading && <RefreshCwIcon className="size-4 mr-2 animate-spin" />}
							{uploading ? '上传中...' : '上传'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			
			{/* 创建目录对话框 */}
			<Dialog open={createDirDialogOpen} onOpenChange={(open) => {
				setCreateDirDialogOpen(open)
				if (!open) {
					setNewDirName('')
				}
			}}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>新建文件夹</DialogTitle>
						<DialogDescription>
							在根目录创建新文件夹
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="dirname">文件夹名称</Label>
							<Input
								id="dirname"
								value={newDirName}
								onChange={(e) => setNewDirName(e.target.value)}
								placeholder="输入文件夹名称"
								onKeyDown={(e) => e.key === 'Enter' && handleCreateDirSubmit()}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setCreateDirDialogOpen(false)}
							disabled={creating}
						>
							取消
						</Button>
						<Button
							onClick={handleCreateDirSubmit}
							disabled={!newDirName.trim() || creating}
						>
							{creating && <RefreshCwIcon className="size-4 mr-2 animate-spin" />}
							{creating ? '创建中...' : '创建'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			
			{/* 删除确认对话框 */}
			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>确认删除</AlertDialogTitle>
						<AlertDialogDescription>
							确定要删除{selectedFile?.is_dir ? '目录' : '文件'} <strong>{selectedFile?.name}</strong> 吗？
							{selectedFile?.is_dir && ' 此操作将删除目录及其所有内容。'}
							此操作无法撤销。
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDeleteSubmit}
							disabled={deleting}
							className="bg-destructive hover:bg-destructive/90"
						>
							{deleting && <RefreshCwIcon className="size-4 mr-2 animate-spin" />}
							{deleting ? '删除中...' : '删除'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
})

