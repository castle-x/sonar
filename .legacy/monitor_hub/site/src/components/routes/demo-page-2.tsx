/**
 * Demo Page 2 - 测试页面 2
 * 
 * 用于测试搜索功能和路由系统
 */

import { memo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Settings, Database, Bell, Shield, Users, Activity } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

export default memo(function DemoPage2() {
	const [activeTab, setActiveTab] = useState('overview')

	return (
		<div className="space-y-6">
			{/* 页面标题 */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<Settings className="size-8 text-blue-600" />
					<div>
						<h1 className="text-3xl font-bold">测试页面 2 - 系统配置</h1>
						<p className="text-muted-foreground mt-1">管理系统配置和设置选项</p>
					</div>
				</div>
				<Button variant="default">
					<Shield className="size-4 mr-2" />
					保存配置
				</Button>
			</div>

			{/* 统计卡片 */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				<Card>
					<CardHeader className="pb-3">
						<div className="flex items-center justify-between">
							<CardDescription>活跃用户</CardDescription>
							<Users className="size-4 text-muted-foreground" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">1,234</div>
						<p className="text-xs text-muted-foreground mt-1">
							<span className="text-green-600">+12.5%</span> 较上月
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-3">
						<div className="flex items-center justify-between">
							<CardDescription>系统负载</CardDescription>
							<Activity className="size-4 text-muted-foreground" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">2.45</div>
						<p className="text-xs text-muted-foreground mt-1">
							<span className="text-green-600">正常</span> 运行中
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-3">
						<div className="flex items-center justify-between">
							<CardDescription>数据库连接</CardDescription>
							<Database className="size-4 text-muted-foreground" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">48 / 100</div>
						<p className="text-xs text-muted-foreground mt-1">
							连接池使用率 48%
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-3">
						<div className="flex items-center justify-between">
							<CardDescription>告警数量</CardDescription>
							<Bell className="size-4 text-muted-foreground" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">3</div>
						<p className="text-xs text-muted-foreground mt-1">
							<span className="text-yellow-600">2 条</span> 待处理
						</p>
					</CardContent>
				</Card>
			</div>

			{/* 标签页内容 */}
			<Card>
				<CardHeader>
					<CardTitle>配置选项</CardTitle>
					<CardDescription>管理系统的各项配置和参数</CardDescription>
				</CardHeader>
				<CardContent>
					<Tabs value={activeTab} onValueChange={setActiveTab}>
						<TabsList className="grid w-full grid-cols-3">
							<TabsTrigger value="overview">概览</TabsTrigger>
							<TabsTrigger value="security">安全</TabsTrigger>
							<TabsTrigger value="advanced">高级</TabsTrigger>
						</TabsList>

						<TabsContent value="overview" className="space-y-4 mt-4">
							<div className="space-y-4">
								<div className="flex items-center justify-between p-4 border rounded-lg">
									<div>
										<h3 className="font-semibold">自动备份</h3>
										<p className="text-sm text-muted-foreground">每日自动备份系统数据</p>
									</div>
									<Badge variant="default">已启用</Badge>
								</div>
								<div className="flex items-center justify-between p-4 border rounded-lg">
									<div>
										<h3 className="font-semibold">邮件通知</h3>
										<p className="text-sm text-muted-foreground">系统事件邮件提醒</p>
									</div>
									<Badge variant="secondary">已禁用</Badge>
								</div>
								<div className="flex items-center justify-between p-4 border rounded-lg">
									<div>
										<h3 className="font-semibold">日志保留</h3>
										<p className="text-sm text-muted-foreground">日志文件保留 30 天</p>
									</div>
									<Badge variant="default">已启用</Badge>
								</div>
							</div>
						</TabsContent>

						<TabsContent value="security" className="space-y-4 mt-4">
							<div className="space-y-4">
								<div className="flex items-center justify-between p-4 border rounded-lg">
									<div>
										<h3 className="font-semibold">双因素认证</h3>
										<p className="text-sm text-muted-foreground">为账户添加额外安全保护</p>
									</div>
									<Badge variant="default">已启用</Badge>
								</div>
								<div className="flex items-center justify-between p-4 border rounded-lg">
									<div>
										<h3 className="font-semibold">登录日志</h3>
										<p className="text-sm text-muted-foreground">记录所有登录活动</p>
									</div>
									<Badge variant="default">已启用</Badge>
								</div>
								<div className="flex items-center justify-between p-4 border rounded-lg">
									<div>
										<h3 className="font-semibold">IP 白名单</h3>
										<p className="text-sm text-muted-foreground">限制访问来源 IP</p>
									</div>
									<Badge variant="secondary">已禁用</Badge>
								</div>
							</div>
						</TabsContent>

						<TabsContent value="advanced" className="space-y-4 mt-4">
							<div className="space-y-4">
								<div className="flex items-center justify-between p-4 border rounded-lg">
									<div>
										<h3 className="font-semibold">调试模式</h3>
										<p className="text-sm text-muted-foreground">启用详细日志输出</p>
									</div>
									<Badge variant="destructive">已禁用</Badge>
								</div>
								<div className="flex items-center justify-between p-4 border rounded-lg">
									<div>
										<h3 className="font-semibold">性能监控</h3>
										<p className="text-sm text-muted-foreground">实时性能指标采集</p>
									</div>
									<Badge variant="default">已启用</Badge>
								</div>
								<div className="flex items-center justify-between p-4 border rounded-lg">
									<div>
										<h3 className="font-semibold">API 限流</h3>
										<p className="text-sm text-muted-foreground">限制 API 请求频率</p>
									</div>
									<Badge variant="default">已启用</Badge>
								</div>
							</div>
						</TabsContent>
					</Tabs>
				</CardContent>
			</Card>
		</div>
	)
})

