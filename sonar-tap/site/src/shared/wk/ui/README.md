# SubNav

二级侧边导航组件，支持分组展示、URL 驱动的激活状态、可选图标和徽标。

## 安装

```bash
gve ui add ui/sub-nav
```

## Props

### SubNavProps

| Prop | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `groups` | `SubNavGroup[]` | 是 | — | 导航分组列表 |
| `title` | `string` | 否 | — | 导航区域标题 |
| `basePath` | `string` | 否 | — | 路径前缀，与子项 `path` 拼接生成完整链接 |
| `className` | `string` | 否 | — | 自定义类名 |

### SubNavGroup

| Prop | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `label` | `string` | 是 | — | 分组标题 |
| `items` | `SubNavItem[]` | 是 | — | 分组内的导航项 |

### SubNavItem

| Prop | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `label` | `string` | 是 | — | 导航项文字 |
| `path` | `string` | 是 | — | 导航路径（相对路径，会与 `basePath` 拼接） |
| `icon` | `IconSvgElement` | 否 | — | Hugeicons 图标 |
| `badge` | `string` | 否 | — | 右侧徽标文字 |

## 基础用法

```tsx
import { SubNav } from "@/shared/wk/ui/sub-nav"
import { Settings02Icon, UserIcon } from "@hugeicons/core-free-icons"

const groups = [
  {
    label: "配置",
    items: [
      { label: "通用", path: "general", icon: Settings02Icon },
      { label: "账户", path: "account", icon: UserIcon, badge: "New" },
    ],
  },
  {
    label: "其他",
    items: [
      { label: "关于", path: "about" },
    ],
  },
]

<SubNav groups={groups} title="设置" basePath="/settings" />
```

## 激活状态

组件通过 `react-router` 的 `useLocation()` 自动检测当前路径，与导航项的完整路径（`basePath + "/" + item.path`）进行匹配：

- 精确匹配或前缀匹配时，导航项显示激活样式
- 激活项：深色背景 + 深色文字 + 深色图标
- 未激活项：浅色文字 + hover 效果
