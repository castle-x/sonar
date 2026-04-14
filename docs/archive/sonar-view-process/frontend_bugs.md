# 前端 Bug 记录

> 最后更新：2026-04-13

## 已修复问题（测试过程中发现并修复）

### BUG-FE-001：Playwright 测试 baseURL 指向错误服务

- **发现时机**：首次运行 E2E 测试
- **现象**：所有测试导航至 `http://localhost:5173/` 但返回的是另一个项目（nanomind）的内容，页面快照显示 `No spaces available`
- **根因**：端口 5173 被另一个开发服务器（`/Users/castlexu/github/rightkey-cdg/nanomind`）占用，Playwright 的 `reuseExistingServer: true` 复用了错误的服务器
- **修复**：将 Playwright 配置改为使用端口 5374，并在 webServer command 中指定 `--port 5374`
- **状态**：✅ 已修复

### BUG-FE-002：导航测试 strict mode 违规（多元素匹配）

- **发现时机**：修复 BUG-FE-001 后第二次运行
- **现象**：`getByText('监控')` 命中 3 个元素（侧边栏链接 + header h1 + 监控描述文字），Playwright strict mode 报错
- **根因**：测试选择器不够精确，i18n 文本在多处渲染
- **修复**：改用 `getByRole('link', { name: '...' })` 精确匹配侧边栏导航链接
- **状态**：✅ 已修复

### BUG-FE-003：页面标题 h1 多元素 strict mode 违规

- **发现时机**：修复 BUG-FE-001 后第二次运行
- **现象**：`locator('h1').filter({ hasText: '设置' })` 命中 2 个 h1（顶部 header 标题 + 页面内容标题）
- **根因**：DashboardLayout 的 SiteHeader 也渲染了当前页面名称作为 h1，与页面内容的 h1 重复
- **修复**：改用 `.nth(1)` 精确定位内容区域的第二个 h1
- **状态**：✅ 已修复

### BUG-FE-004：导航点击测试使用 `locator('nav')` 超时

- **发现时机**：修复 BUG-FE-001 后第二次运行
- **现象**：`page.locator('nav').getByText('快照').click()` 30s 超时，元素不可点击
- **根因**：侧边栏使用 shadcn `SidebarMenu` 渲染，实际 DOM 中无 `<nav>` 元素（或不在预期层级）
- **修复**：改用 `page.getByRole('link', { name: '快照' }).click()` 直接定位链接
- **状态**：✅ 已修复

---

## 当前已知问题（无阻塞）

无。所有 22 个测试用例均通过。
