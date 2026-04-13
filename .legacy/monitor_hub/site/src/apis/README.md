# 数据源 API 使用指南

## 📚 概述

本目录包含前端调用后端 API 的封装方法，提供类型安全的接口调用。

**当前支持的 API**：
- ✅ 数据源管理（`datasource.ts`）

---

## 🚀 快速开始

### 1. 导入 API 方法

```typescript
import { 
  createDatasource, 
  updateDatasource, 
  getDatasource, 
  listDatasources, 
  deleteDatasource,
  getAllDatasources,
  searchDatasources,
  validateDatasource,
} from "@/apis/datasource"
```

### 2. 创建数据源

```typescript
try {
  const newDatasource = await createDatasource({
    name: "生产环境监控",
    app_id: "prod-app-01",
    pushgateway_addr_list: [
      "http://pushgateway-1.example.com:9091",
      "http://pushgateway-2.example.com:9091",
    ],
    description: "生产环境主监控数据源，双节点高可用",
  })
  
  console.log("创建成功，ID:", newDatasource.id)
} catch (error) {
  console.error("创建失败:", error)
}
```

### 3. 获取数据源列表

```typescript
// 分页查询
const result = await listDatasources({
  page: 1,
  page_size: 10,
  keyword: "生产",
  sort_by: "createdAt",
  sort_order: "desc",
})

console.log("总数:", result.total)
console.log("数据:", result.list)

// 获取所有数据源（不分页）
const allDatasources = await getAllDatasources()
```

### 4. 更新数据源

```typescript
await updateDatasource("datasource-id", {
  name: "生产环境监控（更新）",
  app_id: "prod-app-01",
  pushgateway_addr_list: ["http://new-address:9091"],
})
```

### 5. 删除数据源

```typescript
await deleteDatasource("datasource-id")
console.log("删除成功")
```

### 6. 客户端验证

```typescript
const validation = validateDatasource({
  name: "",  // 错误：名称不能为空
  app_id: "my-app",
  pushgateway_addr_list: [],  // 错误：至少需要 1 个地址
})

if (!validation.valid) {
  console.error("验证失败:", validation.errors)
  // 输出: ["名称不能为空", "至少需要提供 1 个数据源地址"]
}
```

---

## 📊 数据结构

### Datasource（创建/更新时使用）

```typescript
interface Datasource {
  // 名称（必填，1-100 字符）
  name: string
  
  // 项目标识（必填，1-50 字符）
  app_id: string
  
  // 数据源地址列表（必填，至少 1 个）
  pushgateway_addr_list: string[]
  
  // 描述（可选，最大 500 字符）
  description?: string
}
```

### DatasourceRecord（从后端返回）

```typescript
interface DatasourceRecord extends Datasource {
  // 数据源唯一 ID
  id: string
  
  // 创建时间（ISO 8601 格式）
  createdAt: string
  
  // 更新时间（ISO 8601 格式）
  updatedAt: string
}
```

---

## 🔧 API 列表

| 方法 | 说明 | 参数 | 返回值 |
|------|------|------|--------|
| `createDatasource` | 创建数据源 | `Datasource` | `Promise<DatasourceRecord>` |
| `updateDatasource` | 更新数据源 | `id: string, Datasource` | `Promise<DatasourceRecord>` |
| `getDatasource` | 获取单个数据源 | `id: string` | `Promise<DatasourceRecord>` |
| `listDatasources` | 获取数据源列表 | `QueryRequest` | `Promise<ListResponse<DatasourceRecord>>` |
| `deleteDatasource` | 删除数据源 | `id: string` | `Promise<void>` |
| `getAllDatasources` | 获取所有数据源 | - | `Promise<DatasourceRecord[]>` |
| `searchDatasources` | 搜索数据源 | `keyword: string` | `Promise<DatasourceRecord[]>` |
| `validateDatasource` | 验证数据源 | `Partial<Datasource>` | `{ valid: boolean, errors: string[] }` |

---

## 🌐 后端 API 映射

| 前端方法 | 后端接口 | HTTP 方法 |
|----------|----------|-----------|
| `createDatasource` | `/apis/v1/datasource/create` | POST |
| `updateDatasource` | `/apis/v1/datasource/update` | POST |
| `getDatasource` | `/apis/v1/datasource/get` | POST |
| `listDatasources` | `/apis/v1/datasource/list` | POST |
| `deleteDatasource` | `/apis/v1/datasource/del` | POST |

---

## 💡 在组件中使用

### 在表格组件中获取数据

```typescript
// site/src/components/routes/home.tsx

import { useEffect, useState } from "react"
import { getAllDatasources, type DatasourceRecord } from "@/apis/datasource"
import DatasourceTable from "@/components/datasource-table/datasource-table"

export default function HomePage() {
  const [datasources, setDatasources] = useState<DatasourceRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 获取数据源列表
    getAllDatasources()
      .then(data => {
        setDatasources(data)
        setLoading(false)
      })
      .catch(error => {
        console.error("获取数据源失败:", error)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return <div>加载中...</div>
  }

  return <DatasourceTable data={datasources} />
}
```

### 在表单中创建数据源

```typescript
// site/src/components/add-datasource.tsx

import { createDatasource } from "@/apis/datasource"

async function handleSubmit(formData) {
  try {
    const result = await createDatasource({
      name: formData.name,
      app_id: formData.app_id,
      pushgateway_addr_list: formData.addresses,
      description: formData.description,
    })
    
    console.log("创建成功:", result)
    // 刷新列表...
  } catch (error) {
    console.error("创建失败:", error)
  }
}
```

---

## ⚠️ 注意事项

1. **错误处理**：所有 API 方法在失败时会抛出错误，请使用 `try-catch` 捕获
2. **验证**：建议在发送到后端前使用 `validateDatasource()` 进行客户端验证
3. **类型安全**：所有方法都提供了完整的 TypeScript 类型定义
4. **刷新数据**：创建/更新/删除后需要手动刷新数据列表（未来可使用 React Query 自动刷新）

---

## 🔄 未来计划

- [ ] 集成 React Query 实现自动缓存和刷新
- [ ] 添加乐观更新（Optimistic Updates）
- [ ] 添加请求重试机制
- [ ] 添加请求取消功能
- [ ] 添加更多业务 API（告警、图表等）

