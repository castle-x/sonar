# 前端 E2E 测试报告

> 日期：2026-04-13  
> 框架：Playwright v1.59.1 + Chromium  
> 项目：sonar-view/site  
> 测试目录：`site/tests/`  
> 配置文件：`site/playwright.config.ts`  

---

## 执行结果摘要

| 指标 | 值 |
|------|-----|
| 总测试用例数 | 22 |
| ✅ 通过 | **22** |
| ❌ 失败 | **0** |
| ⏭ 跳过 | 0 |
| 总耗时 | ~14.3s |
| 并发 workers | 4 |

**结论：全部 22 个测试用例通过，无失败。**

---

## 测试套件明细

### Navigation（导航）— 6/6 通过

| 用例 | 状态 | 耗时 |
|------|------|------|
| should redirect / to /monitor | ✅ | ~860ms |
| sidebar shows 监控, 快照, 采集器, 设置 nav items | ✅ | ~358ms |
| clicking 快照 navigates to /snapshots | ✅ | ~460ms |
| clicking 采集器 navigates to /taps | ✅ | ~453ms |
| clicking 设置 navigates to /settings | ✅ | ~440ms |
| unknown route redirects to /monitor | ✅ | ~397ms |

### Monitor Page（监控页面）— 4/4 通过

| 用例 | 状态 | 耗时 |
|------|------|------|
| loads successfully with 200 status | ✅ | ~902ms |
| granularity selector buttons are visible | ✅ | ~922ms |
| shows no-tap empty state or monitor content | ✅ | ~944ms |
| granularity buttons visible when tap is selected | ✅ | ~833ms |

### Snapshots Page（快照页面）— 5/5 通过

| 用例 | 状态 | 耗时 |
|------|------|------|
| page loads successfully | ✅ | ~1.5s |
| page title 快照 is visible in main content | ✅ | ~962ms |
| create snapshot button is visible | ✅ | ~922ms |
| shows list or empty state | ✅ | ~876ms |
| clicking 创建快照 opens dialog | ✅ | ~931ms |

### Settings Page（设置页面）— 7/7 通过

| 用例 | 状态 | 耗时 |
|------|------|------|
| page loads successfully | ✅ | ~1.5s |
| page title 设置 is visible in main content | ✅ | ~979ms |
| server URL input is present with placeholder | ✅ | ~936ms |
| save button is present | ✅ | ~867ms |
| server address section heading is visible | ✅ | ~854ms |
| connected taps section is visible | ✅ | ~828ms |
| can type in server URL input and save | ✅ | ~887ms |

---

## 失败截图

无（所有测试通过）。

---

## Bug 列表（测试过程中发现并修复）

详见 `docs/bugs/frontend_bugs.md`，共发现 4 个问题，均已在测试调试阶段修复：

| ID | 描述 | 严重性 | 状态 |
|----|------|--------|------|
| BUG-FE-001 | Playwright 端口 5173 被其他项目占用，测试命中错误服务 | 高 | ✅ 已修复 |
| BUG-FE-002 | 导航文本 getByText 匹配多元素导致 strict mode 报错 | 低（测试问题） | ✅ 已修复 |
| BUG-FE-003 | 页面 h1 重复（header + content 各一个）导致严格模式违规 | 低（测试问题） | ✅ 已修复 |
| BUG-FE-004 | `locator('nav')` 无法找到侧边栏导航元素 | 低（测试问题） | ✅ 已修复 |

> 注：以上 BUG 均为测试代码层面的选择器问题，不涉及应用代码 Bug。

---

## 覆盖范围

- ✅ 路由重定向（`/` → `/monitor`，未知路由 → `/monitor`）
- ✅ 侧边栏导航（4 个导航项可见 + 点击跳转）
- ✅ 监控页面加载（空状态 + 粒度选择器）
- ✅ 快照页面加载（标题 + 创建按钮 + 列表/空状态 + 创建弹窗）
- ✅ 设置页面（标题 + 输入框 + 保存 + Toast 反馈）

---

## 环境

| 项目 | 版本 |
|------|------|
| @playwright/test | 1.59.1 |
| Browser | Chromium 147.0.7727.15 |
| Node | 系统 Node |
| pnpm | 10.33.0 |
| Dev server port | 5374 |
