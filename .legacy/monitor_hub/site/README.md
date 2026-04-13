# Monitor Hub 前端

基于 Beszel 架构的现代化监控中心前端应用。

## 技术栈

- **React 19** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **TailwindCSS 4** - 样式框架
- **Nanostores** - 轻量级状态管理
- **Radix UI** - 无样式组件库

## 目录结构

```
site/
├── embed.go              # Go 嵌入文件
├── index.html           # HTML 模板
├── package.json         # 依赖配置
├── vite.config.ts       # Vite 配置
├── tsconfig.json        # TypeScript 配置
├── src/
│   ├── main.tsx         # 应用入口
│   ├── index.css        # 全局样式
│   ├── components/      # React 组件
│   │   ├── router.tsx   # 路由配置
│   │   ├── routes/      # 页面组件
│   │   └── ui/          # UI 组件
│   └── lib/             # 工具函数
└── dist/                # 构建产物（会被 Go 嵌入）
```

## 开发

### 安装依赖

```bash
# 使用 npm
make install-web

# 或者手动
cd site && npm install
```

### 启动开发服务器

```bash
# 前端开发服务器 (http://localhost:5173)
make dev-web

# 后端服务 (http://localhost:8080)
make dev-backend
```

开发模式下，前端会通过 Vite 的代理将 `/apis` 请求转发到后端。

### 构建生产版本

```bash
# 构建前端
make build-web

# 构建前后端
make build
```

## 集成到 Go

前端构建产物会被嵌入到 Go 二进制文件中：

```go
import "monitor_hub/site"
import "monitor_hub/pkg/siteserver"

// 在 Hertz 中注册静态文件服务
siteserver.StaticFS(h, site.DistDirFS)
```

## 添加新页面

1. 在 `src/components/routes/` 创建新页面组件
2. 在 `src/components/router.tsx` 添加路由配置
3. 在 `src/main.tsx` 添加路由处理逻辑

## 样式系统

使用 TailwindCSS 4 + CSS 变量实现主题切换：

- 支持亮色/暗色主题
- 使用 `cn()` 工具函数合并样式
- 基于 Radix UI 构建可访问的组件

## 注意事项

- 开发模式下前后端分离运行
- 生产模式下前端会被嵌入到 Go 二进制文件
- 所有 API 请求应该使用 `/apis` 前缀
- 使用相对路径（`base: './'`）确保可以部署到子路径

