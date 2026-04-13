# 数据源表格组件 - 简化版

## 📋 概述

这是从 Beszel 的 `system-table` 简化而来的数据源表格组件。

### 保留的功能

✅ **核心表格功能**
- 表格视图 / 网格视图切换
- 搜索过滤
- 多列排序
- 列可见性控制
- 响应式设计

✅ **操作功能**
- 编辑数据源
- 删除数据源（带确认）
- 复制名称

### 移除的功能

❌ 告警功能（Alert）
❌ 复杂的状态过滤（up/down/paused）
❌ 虚拟滚动（简化，适合中小数据量）
❌ Lingui 国际化（改用纯中文）
❌ 所有监控指标列（CPU/内存/磁盘等）
❌ 预加载优化

---

## 🚀 快速开始

### 1. 基础使用

```tsx
import DatasourceTable from "@/components/datasource-table/datasource-table-simplified"
import type { DatasourceRecord } from "@/components/datasource-table/datasource-table-simplified"

function DatasourcesPage() {
  const [datasources, setDatasources] = useState<DatasourceRecord[]>([])

  // 获取数据
  useEffect(() => {
    fetch("/api/v1/datasources")
      .then((res) => res.json())
      .then((data) => setDatasources(data))
  }, [])

  return <DatasourceTable data={datasources} />
}
```

### 2. 数据类型

```typescript
export interface DatasourceRecord {
  id: string           // 数据源 ID
  name: string         // 数据源名称
  type: string         // 数据源类型（如 Prometheus、MySQL 等）
  url: string          // 数据源 URL
  description?: string // 可选描述
  created: string      // 创建时间（ISO 格式）
  updated: string      // 更新时间（ISO 格式）
}
```

### 3. 集成到首页

```tsx
// src/components/routes/home.tsx
import { useEffect, useState } from "react"
import DatasourceTable from "@/components/datasource-table/datasource-table-simplified"
import type { DatasourceRecord } from "@/components/datasource-table/datasource-table-simplified"

export default function HomePage() {
  const [datasources, setDatasources] = useState<DatasourceRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDatasources()
  }, [])

  async function fetchDatasources() {
    try {
      const response = await fetch("/api/v1/datasources")
      const data = await response.json()
      setDatasources(data)
    } catch (error) {
      console.error("获取数据源失败:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div>加载中...</div>
  }

  return (
    <div className="space-y-8">
      <div className="text-center py-12">
        <h1 className="text-5xl font-bold mb-4">Monitor Hub</h1>
        <p className="text-xl text-gray-600">现代化的监控中心</p>
      </div>

      {/* 数据源表格 */}
      <DatasourceTable data={datasources} />
    </div>
  )
}
```

---

## 📁 文件结构

```
datasource-table/
├── README.md                                    # 本文档
├── datasource-table-simplified.tsx             # 主表格组件（简化版）
├── datasource-table-columns-simplified.tsx     # 列定义（简化版）
├── datasource-table.tsx                        # 原始 Beszel 代码（保留参考）
└── datasource-table-columns.tsx                # 原始 Beszel 列定义（保留参考）
```

---

## 🎨 自定义

### 添加新列

在 `datasource-table-columns-simplified.tsx` 中：

```typescript
{
  accessorKey: "status",
  id: "status",
  name: () => "状态",
  size: 80,
  cell: (info) => {
    const status = info.getValue() as string
    return (
      <span className={cn(
        "px-2 py-1 rounded text-xs",
        status === "active" ? "bg-green-500/20 text-green-600" : "bg-gray-500/20"
      )}>
        {status}
      </span>
    )
  },
  header: sortableHeader,
},
```

### 自定义操作

修改 `ActionsButton` 组件，添加更多操作项：

```typescript
<DropdownMenuItem onClick={() => {
  // 自定义操作
  console.log("Custom action:", datasource.id)
}}>
  <YourIcon className="me-2.5 size-4" />
  自定义操作
</DropdownMenuItem>
```

---

## 🔧 TODO

- [ ] 实现编辑对话框（目前只是占位符）
- [ ] 实现删除后自动刷新列表
- [ ] 添加批量操作功能
- [ ] 添加导出功能
- [ ] 添加分页（如果数据量大）

---

## 📝 对比 Beszel

| 功能 | Beszel | 简化版 |
|------|--------|--------|
| 表格视图 | ✅ | ✅ |
| 网格视图 | ✅ | ✅ |
| 排序 | ✅ | ✅ |
| 搜索 | ✅ | ✅ |
| 列可见性 | ✅ | ✅ |
| 状态过滤 | ✅ | ❌ |
| 虚拟滚动 | ✅ | ❌ |
| 告警功能 | ✅ | ❌ |
| 国际化 | ✅ | ❌ |
| 监控指标列 | ✅ | ❌ |
| 预加载优化 | ✅ | ❌ |

---

## 💡 提示

1. **性能优化**：如果数据量超过 1000 条，建议添加分页或恢复虚拟滚动
2. **状态管理**：可以使用 Nanostores 管理全局数据源列表
3. **实时更新**：可以使用 WebSocket 或轮询实现数据自动刷新
4. **权限控制**：在操作按钮中添加权限检查

---

## 📞 需要帮助？

如果遇到问题，请查看：
1. Beszel 原始代码：`datasource-table.tsx` 和 `datasource-table-columns.tsx`
2. [@tanstack/react-table 文档](https://tanstack.com/table/v8)
3. 项目中的 `CODING_STANDARDS.md`

