/**
 * ReportFilesDialog - 报告关联文件对话框
 * 
 * 功能：
 * 1. 展示报告的 file_list 字段
 * 2. 调用 getFilesByPaths 获取文件详情
 * 3. 显示 not_found 的文件并标记
 * 4. 支持手动添加/删除关联文件
 */

import { useState, useEffect, useCallback } from "react"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import {
	FileIcon,
	FolderIcon,
	FolderOpenIcon,
	FileTextIcon,
	ImageIcon,
	VideoIcon,
	MusicIcon,
	ArchiveIcon,
	CodeIcon,
	DownloadIcon,
	TrashIcon,
	PlusIcon,
	AlertCircleIcon,
	RefreshCwIcon,
	ChevronRightIcon,
	ChevronDownIcon,
	CheckIcon,
	XIcon,
	FolderPlusIcon,
} from "lucide-react"
import type { ReportRecord } from "@/apis/report"
import { updateReport } from "@/apis/report"
import type { FileNode, BatchFilesResponse } from "@/apis/filetree"
import { getFilesByPaths, getFileTree, downloadFile } from "@/apis/filetree"

interface ReportFilesDialogProps {
	report: ReportRecord
	open: boolean
	onOpenChange: (open: boolean) => void
	onSuccess?: () => void
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
			? <FolderOpenIcon className="size-4 text-blue-500" />
			: <FolderIcon className="size-4 text-blue-500" />
	}
	
	const ext = name.split('.').pop()?.toLowerCase()
	
	if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext || '')) {
		return <ImageIcon className="size-4 text-green-500" />
	}
	if (['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv'].includes(ext || '')) {
		return <VideoIcon className="size-4 text-purple-500" />
	}
	if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext || '')) {
		return <MusicIcon className="size-4 text-pink-500" />
	}
	if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext || '')) {
		return <ArchiveIcon className="size-4 text-orange-500" />
	}
	if (['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'cpp', 'c', 'go', 'rs', 'php', 'html', 'css', 'sh'].includes(ext || '')) {
		return <CodeIcon className="size-4 text-blue-600" />
	}
	if (['txt', 'md', 'log', 'csv', 'json'].includes(ext || '')) {
		return <FileTextIcon className="size-4 text-gray-600" />
	}
	
	return <FileIcon className="size-4 text-gray-500" />
}

// 扩展 FileNode 类型
interface TreeNode extends FileNode {
	children?: TreeNode[]
}

export function ReportFilesDialog({
	report,
	open,
	onOpenChange,
	onSuccess,
}: ReportFilesDialogProps) {
	const { toast } = useToast()
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const [files, setFiles] = useState<FileNode[]>([])
	const [notFound, setNotFound] = useState<string[]>([])
	
	// 文件选择器状态
	const [selectorOpen, setSelectorOpen] = useState(false)
	const [fileTree, setFileTree] = useState<TreeNode[]>([])
	const [treeLoading, setTreeLoading] = useState(false)
	const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['/']))
	const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
	
	// 当前关联的文件路径列表
	const [currentFileList, setCurrentFileList] = useState<string[]>([])
	
	// 加载文件信息
	const loadFiles = useCallback(async () => {
		const fileList = report.file_list || []
		setCurrentFileList(fileList)
		
		if (fileList.length === 0) {
			setFiles([])
			setNotFound([])
			return
		}
		
		setLoading(true)
		try {
			const result = await getFilesByPaths(fileList)
			setFiles(result.files || [])
			setNotFound(result.not_found || [])
		} catch (error: any) {
			console.error('加载文件信息失败:', error)
			toast({
				title: '加载失败',
				description: error.message || '无法加载文件信息',
				variant: 'destructive',
			})
			// 如果加载失败，将所有文件标记为 not found
			setFiles([])
			setNotFound(fileList)
		} finally {
			setLoading(false)
		}
	}, [report.file_list, toast])
	
	// 打开对话框时加载数据
	useEffect(() => {
		if (open) {
			loadFiles()
		}
	}, [open, loadFiles])
	
	// 删除关联文件
	const handleRemoveFile = (path: string) => {
		setCurrentFileList(prev => prev.filter(p => p !== path))
		setFiles(prev => prev.filter(f => f.path !== path))
		setNotFound(prev => prev.filter(p => p !== path))
	}
	
	// 保存关联文件
	const handleSave = async () => {
		setSaving(true)
		try {
			await updateReport(report.id, { file_list: currentFileList })
			toast({
				title: '保存成功',
				description: '关联文件已更新',
			})
			onSuccess?.()
			onOpenChange(false)
		} catch (error: any) {
			toast({
				title: '保存失败',
				description: error.message || '无法保存关联文件',
				variant: 'destructive',
			})
		} finally {
			setSaving(false)
		}
	}
	
	// ========================================
	// 文件选择器逻辑
	// ========================================
	
	// 加载文件树
	const loadFileTree = useCallback(async () => {
		setTreeLoading(true)
		try {
			const data = await getFileTree({ path: '/', depth: 10 })
			
			// 递归排序
			const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
				return [...nodes].sort((a, b) => {
					if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
					return b.modified_time - a.modified_time
				})
			}
			
			const sortTree = (node: TreeNode): TreeNode => {
				if (node.children) {
					node.children = sortNodes(node.children.map(sortTree))
				}
				return node
			}
			
			const sortedChildren = sortNodes((data.children || []).map(sortTree))
			setFileTree(sortedChildren)
		} catch (error: any) {
			toast({
				title: '加载失败',
				description: error.message || '无法加载文件树',
				variant: 'destructive',
			})
		} finally {
			setTreeLoading(false)
		}
	}, [toast])
	
	// 打开文件选择器时加载文件树
	useEffect(() => {
		if (selectorOpen) {
			loadFileTree()
			// 初始化已选择的文件
			setSelectedPaths(new Set(currentFileList))
		}
	}, [selectorOpen, loadFileTree, currentFileList])
	
	// 切换目录展开
	const toggleExpanded = (path: string) => {
		setExpandedPaths(prev => {
			const next = new Set(prev)
			if (next.has(path)) {
				next.delete(path)
			} else {
				next.add(path)
			}
			return next
		})
	}
	
	// 切换文件选择
	const toggleSelected = (path: string, isDir: boolean) => {
		if (isDir) return // 不选择目录
		setSelectedPaths(prev => {
			const next = new Set(prev)
			if (next.has(path)) {
				next.delete(path)
			} else {
				next.add(path)
			}
			return next
		})
	}
	
	// 确认选择
	const handleConfirmSelection = async () => {
		const newPaths = Array.from(selectedPaths)
		setCurrentFileList(newPaths)
		
		// 重新加载文件信息
		if (newPaths.length > 0) {
			try {
				const result = await getFilesByPaths(newPaths)
				setFiles(result.files || [])
				setNotFound(result.not_found || [])
			} catch {
				setFiles([])
				setNotFound(newPaths)
			}
		} else {
			setFiles([])
			setNotFound([])
		}
		
		setSelectorOpen(false)
	}
	
	// 渲染文件树节点
	const renderTreeNode = (node: TreeNode, level: number = 0): JSX.Element => {
		const isExpanded = expandedPaths.has(node.path)
		const isSelected = selectedPaths.has(node.path)
		const hasChildren = node.is_dir && node.children && node.children.length > 0
		
		return (
			<div key={node.path}>
				<div 
					className={cn(
						"flex items-center gap-2 py-1.5 px-2 hover:bg-muted/50 rounded cursor-pointer",
						isSelected && !node.is_dir && "bg-primary/10"
					)}
					style={{ paddingLeft: `${level * 16 + 8}px` }}
					onClick={() => {
						if (node.is_dir) {
							toggleExpanded(node.path)
						} else {
							toggleSelected(node.path, node.is_dir)
						}
					}}
				>
					{/* 展开图标 */}
					<div className="w-4 flex items-center justify-center shrink-0">
						{node.is_dir && (
							isExpanded ? (
								<ChevronDownIcon className="h-3 w-3" />
							) : (
								<ChevronRightIcon className="h-3 w-3" />
							)
						)}
					</div>
					
					{/* 选择框（仅文件） */}
					{!node.is_dir && (
						<div className={cn(
							"w-4 h-4 rounded border flex items-center justify-center shrink-0",
							isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
						)}>
							{isSelected && <CheckIcon className="h-3 w-3 text-primary-foreground" />}
						</div>
					)}
					
					{/* 图标和名称 */}
					<div className="shrink-0">{getFileIcon(node.name, node.is_dir, isExpanded)}</div>
					<span className="text-sm whitespace-nowrap">{node.name}</span>
					
					{/* 文件大小 */}
					{!node.is_dir && (
						<span className="text-xs text-muted-foreground shrink-0 ml-2">
							{formatSize(node.size)}
						</span>
					)}
				</div>
				
				{/* 子节点 */}
				{node.is_dir && isExpanded && hasChildren && (
					<div>
						{node.children!.map(child => renderTreeNode(child, level + 1))}
					</div>
				)}
			</div>
		)
	}
	
	return (
		<>
			{/* 主对话框 - 关联文件列表 */}
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="w-[95%] max-w-[1200px] max-h-[80vh] flex flex-col">
					<DialogHeader>
						<DialogTitle>关联文件</DialogTitle>
						<DialogDescription>
							管理报告关联的数据文件
						</DialogDescription>
					</DialogHeader>
					
					<div className="flex-1 overflow-hidden">
						{loading ? (
							<div className="flex items-center justify-center py-12">
								<RefreshCwIcon className="size-6 animate-spin text-muted-foreground" />
							</div>
						) : currentFileList.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
								<FileIcon className="size-12 mb-4 opacity-50" />
								<p className="text-sm">暂无关联文件</p>
								<p className="text-xs mt-1">点击下方按钮添加关联文件</p>
							</div>
						) : (
							<div 
								className="h-[300px] overflow-auto border rounded-lg"
								onWheel={(e) => {
									// 支持 shift+滚轮 横向滚动
									if (e.shiftKey) {
										e.currentTarget.scrollLeft += e.deltaY
										e.preventDefault()
									}
								}}
							>
								<div className="min-w-max space-y-2 p-2">
									{/* 已找到的文件 */}
									{files.map((file) => (
										<div
											key={file.path}
											className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 group"
										>
											<div className="shrink-0">{getFileIcon(file.name, file.is_dir)}</div>
											<span className="text-sm font-medium whitespace-nowrap">{file.name}</span>
											<div className="flex-1" />
											<div className="text-xs text-muted-foreground shrink-0">
												{formatSize(file.size)}
											</div>
											<div className="flex items-center gap-1 shrink-0">
												<Button
													variant="ghost"
													size="icon"
													className="h-7 w-7"
													onClick={() => downloadFile(file.path)}
													title="下载"
												>
													<DownloadIcon className="size-3.5" />
												</Button>
												<Button
													variant="ghost"
													size="icon"
													className="h-7 w-7 text-destructive hover:text-destructive"
													onClick={() => handleRemoveFile(file.path)}
													title="移除"
												>
													<TrashIcon className="size-3.5" />
												</Button>
											</div>
										</div>
									))}
									
									{/* 未找到的文件 */}
									{notFound.map((path) => (
										<div
											key={path}
											className="flex items-center gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5 group"
										>
											<AlertCircleIcon className="size-4 text-destructive shrink-0" />
											<span className="text-sm font-medium whitespace-nowrap text-destructive">
												{path.split('/').pop()}
											</span>
											<div className="flex-1" />
											<span className="text-xs text-destructive shrink-0 px-2 py-0.5 rounded bg-destructive/10">
												未找到
											</span>
											<Button
												variant="ghost"
												size="icon"
												className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
												onClick={() => handleRemoveFile(path)}
												title="移除"
											>
												<TrashIcon className="size-3.5" />
											</Button>
										</div>
									))}
								</div>
							</div>
						)}
					</div>
					
					<DialogFooter className="flex-col sm:flex-row gap-2">
						<Button
							variant="outline"
							onClick={() => setSelectorOpen(true)}
							className="w-full sm:w-auto"
						>
							<FolderPlusIcon className="size-4 mr-2" />
							选择文件
						</Button>
						<div className="flex gap-2 w-full sm:w-auto">
							<Button
								variant="outline"
								onClick={() => onOpenChange(false)}
								disabled={saving}
								className="flex-1 sm:flex-initial"
							>
								取消
							</Button>
							<Button
								onClick={handleSave}
								disabled={saving}
								className="flex-1 sm:flex-initial"
							>
								{saving ? '保存中...' : '保存'}
							</Button>
						</div>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			
			{/* 二级对话框 - 文件选择器 */}
			<Dialog open={selectorOpen} onOpenChange={setSelectorOpen}>
				<DialogContent className="w-[95%] max-w-[1200px] max-h-[80vh] flex flex-col">
					<DialogHeader>
						<DialogTitle>选择文件</DialogTitle>
						<DialogDescription>
							从文件树中选择要关联的文件（已选择 {selectedPaths.size} 个）
						</DialogDescription>
					</DialogHeader>
					
					<div 
						className="flex-1 border rounded-lg overflow-auto h-[400px]"
						onWheel={(e) => {
							// 支持 shift+滚轮 横向滚动
							if (e.shiftKey) {
								e.currentTarget.scrollLeft += e.deltaY
								e.preventDefault()
							}
						}}
					>
						{treeLoading ? (
							<div className="flex items-center justify-center py-12">
								<RefreshCwIcon className="size-6 animate-spin text-muted-foreground" />
							</div>
						) : fileTree.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
								<FolderIcon className="size-12 mb-4 opacity-50" />
								<p className="text-sm">文件树为空</p>
							</div>
						) : (
							<div className="min-w-max py-2">
								{fileTree.map(node => renderTreeNode(node, 0))}
							</div>
						)}
					</div>
					
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setSelectorOpen(false)}
						>
							取消
						</Button>
						<Button onClick={handleConfirmSelection}>
							确认选择
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}
