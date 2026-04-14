# 前端 E2E 测试用例

> 框架：Playwright + Chromium | 测试目录：`sonar-view/site/tests/`

---

## 测试套件：Navigation（导航）

| # | 用例名称 | 描述 | 预期结果 |
|---|---------|------|---------|
| N-01 | should redirect / to /monitor | 访问根路径 `/` | 自动重定向到 `/monitor` |
| N-02 | sidebar shows nav items | 侧边栏显示全部导航项 | 可见「监控」「快照」「采集器」「设置」链接 |
| N-03 | clicking 快照 navigates to /snapshots | 点击快照导航链接 | URL 跳转至 `/snapshots` |
| N-04 | clicking 采集器 navigates to /taps | 点击采集器导航链接 | URL 跳转至 `/taps` |
| N-05 | clicking 设置 navigates to /settings | 点击设置导航链接 | URL 跳转至 `/settings` |
| N-06 | unknown route redirects to /monitor | 访问不存在的路由 `/nonexistent` | 重定向到 `/monitor` |

---

## 测试套件：Monitor Page（监控页面）

| # | 用例名称 | 描述 | 预期结果 |
|---|---------|------|---------|
| M-01 | loads successfully with 200 status | 访问 `/monitor` | HTTP 响应状态码 < 400 |
| M-02 | granularity selector buttons are visible | 粒度选择按钮存在 | 页面正常渲染，body 内容非空 |
| M-03 | shows no-tap empty state or monitor content | 空状态或监控内容 | 显示「请选择一个 Tap 实例」或粒度按钮其一 |
| M-04 | granularity buttons visible when tap is selected | 选中 tap 时显示粒度按钮 | 若有 tap 则显示 15s / 1m / 5m / 1h 四个按钮 |

---

## 测试套件：Snapshots Page（快照页面）

| # | 用例名称 | 描述 | 预期结果 |
|---|---------|------|---------|
| S-01 | page loads successfully | 访问 `/snapshots` | HTTP 响应状态码 < 400 |
| S-02 | page title 快照 is visible in main content | 页面主内容标题 | h1 标题「快照」可见（内容区第二个 h1） |
| S-03 | create snapshot button is visible | 创建快照按钮 | 「+ 创建快照」按钮可见 |
| S-04 | shows list or empty state | 列表或空状态 | 显示「暂无快照」或至少一张卡片 |
| S-05 | clicking 创建快照 opens dialog | 点击创建按钮 | 弹出 Dialog，含「创建快照」标题 |

---

## 测试套件：Settings Page（设置页面）

| # | 用例名称 | 描述 | 预期结果 |
|---|---------|------|---------|
| C-01 | page loads successfully | 访问 `/settings` | HTTP 响应状态码 < 400 |
| C-02 | page title 设置 is visible in main content | 页面主内容标题 | h1 标题「设置」可见（内容区第二个 h1） |
| C-03 | server URL input is present with placeholder | 服务器地址输入框 | `placeholder="http://localhost:8283"` 输入框可见 |
| C-04 | save button is present | 保存按钮 | 「保存」按钮可见 |
| C-05 | server address section heading is visible | 服务器地址区块标题 | 「服务器地址」文本可见 |
| C-06 | connected taps section is visible | 已连接 Tap 区块 | 「已连接的 Tap 实例」文本可见 |
| C-07 | can type in server URL input and save | 输入并保存 | 填写 URL → 点击保存 → Toast「设置已保存」出现 |

---

## 汇总

| 套件 | 用例数 |
|------|--------|
| Navigation | 6 |
| Monitor Page | 4 |
| Snapshots Page | 5 |
| Settings Page | 7 |
| **总计** | **22** |
