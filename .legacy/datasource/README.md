# datasource
基于 HZX 工具生成的 Hertz HTTP 服务项目，使用 Wire 进行依赖注入。

## ⚡ 核心特性

### 协议支持
- **HTTP 服务**：基于 Thrift IDL 定义，类型安全、高性能
- **WebSocket 服务**：基于 ws.yaml 配置驱动（自研规则），简化实时通信开发

### WebSocket 能力
- 开箱即用的 WebSocket 封装，支持连接管理、消息路由
- 内置订阅/发布机制，轻松实现消息广播和点对点通信
- 自动心跳检测，保障长连接稳定性

### MongoDB 集成
- 开箱即用的 MongoDB 存储层，提供统一的数据访问接口
- 支持高级查询、分页、去重、字段投影等常用操作
- 通过配置自动生成索引，优化查询性能

### Trigger 任务调度
- 灵活的触发器（Trigger）系统，支持多种调度模式：
  - **cron**：基于 Cron 表达式的定时任务
  - **interval**：固定间隔的周期任务
  - **event**：事件驱动的触发机制
  - **once**：一次性任务执行

### 服务发现
- 内置 Consul 集成，通过配置即可加入服务发现集群
- 支持服务注册与健康检查，实现微服务间的自动发现
- 零代码侵入，配置化管理服务注册信息

### 强大的代码生成
- **配置生成**：自动生成项目配置结构和加载逻辑
- **协议生成**：基于 Thrift IDL 和 ws.yaml 生成完整的服务代码
- **业务逻辑脚手架**：自动生成 Handler、Service、Repository 层代码模板
- **依赖注入**：自动生成 Wire Provider 和依赖关系配置
- 极大提升开发效率，让你专注于业务逻辑实现


## 📁 项目结构

```
datasource/
├── cmd/datasource/             
│   ├── app/                      # 应用程序结构
│   │   ├── app.go                # 应用主入口
│   │   └── wire.go               # Wire依赖注入配置
│   └── datasource.go           
├── internal/                     # 内部代码
│   ├── hzapp/                    # Hertz应用封装
│   ├── middleware/               # 全局中间件
│   ├── mongodb/                  # 通用MongoDB实现
│   ├── provider/                 # Wire Provider依赖注入模块
│   ├── trigger/                  # 通用触发器实现
│   └── websocket/                # 通用WebSocket实现
├── config/v1/    
│   ├── config.go                 # 配置结构定义
│   └── config.yaml.tmpl          # 配置模板
├── biz/                          # 业务逻辑代码
│   └── {service}/                # 按服务分组
│       └── {version}/            # 按版本分组
│           ├── service.go        # 服务结构（依赖注入）
│           ├── handler.go        # HTTP处理函数
│           ├── middleware.go     # 服务级中间件
│           └── router.go         # 路由注册
├── apis/                         # 协议目录
└── script/                       # 运维脚本
```

## 📝 开发规范

### 📄 协议定义规范（Thrift IDL）

**目录结构**：```apis/datasource/{resource}/{version}/{resource}.thrift```

- **根目录规则**：apis 目录第一级必须是项目名称 ```datasource```
- **命名空间**：遵循 ```datasource.{resource}.{version}``` 规则
- **Service 定义**：每个 Thrift 文件通常只定义一个 Service
- **HTTP 方法**：建议统一使用 POST 请求，通过 path 参数区分不同方法
- **路径规范**：method 的 path 应遵循 RESTful 风格
- **响应格式**：返回值建议使用 ```base.Response``` 结构体，保持响应格式统一
- **请求参数**：
  - 每个 method 只允许一个参数，且必须为结构体类型
  - 路径参数（如 ```:id```）需在结构体中通过 go.tag 标注：```go.tag = "json:\"id\" api.path:\"/:id\""```

### 🏗️ 业务代码规范

**目录结构**：```biz/{resource}/{version}/```

框架自动生成五类业务文件：

| 文件 | 职责 | 是否需要修改 |
|------|------|------------|
| ```service.go``` | 服务结构体定义 | ❌ 通常不需要 |
| ```router.go``` | HTTP/WebSocket 路由注册 | ❌ 通常不需要 |
| ```handler.go``` | 业务逻辑处理 | ✅ **核心业务代码** |
| ```middleware.go``` | 服务级中间件 | ⚙️ 按需实现 |
| ```broadcast.go``` | WebSocket 广播处理 | ⚙️ 有 WebSocket 协议时实现 |

### ⚙️ 配置管理规范

**目录结构**：```config/v1/config.yaml.tmpl```

- **内置配置**：默认提供 Hertz、MongoDB、Consul、WebSocket 四类配置
- **扩展配置**：支持自定义配置项，修改模板后自动生成 ```config.go``` 文件
- **类型安全**：所有配置项都有对应的 Go 结构体和类型检查

### 💉 依赖注入规范（Wire）

**目录结构**：```internal/provider/```

自动管理三类 Provider 文件：

1. **```gen_provider.go```**（自动生成，无需修改）
   - 自动扫描 biz 目录下的所有依赖
   - 自动生成 Wire Provider 配置
   - 每次代码生成时自动更新

2. **```custom_provider.go```**（按需实现）
   - 自定义依赖注入逻辑
   - 注入第三方库或自定义组件

3. **```trigger_provider.go```**（按需实现）
   - 定义触发器（Trigger）相关依赖
   - 注入定时任务所需的组件

> 💡 **智能合并**：框架会自动对比 gen 和 custom 的依赖冲突，智能合并依赖关系，无需担心重复注入

## 🚀 使用方法

### 1. 更新协议文件

默认协议存放在apis目录下，hzx工具会自动扫描该目录下的所有.thrift或.ws.yaml文件，自动转换为.go 或 .ws.go文件

```bash
hzx update apis
```

### 2. 更新业务代码

默认业务代码存放在biz目录下，当协议文件新增服务或方法后，hzx工具会根据最新的协议更新业务代码
注意：对于handler.go中的方法，不会覆盖已实现的逻辑，只增加新的方法，如果需要覆盖已实现的逻辑，请手动删除handler.go中的代码

```bash
hzx update biz
```

### 3. 更新依赖注入

当biz中的服务新增依赖后，hzx工具会自动扫描依赖模块，更新至internal/provider/gen_provider.go文件中，并重新执行wire完成依赖注入

```bash
hzx update wire
```

### 4. 更新配置文件

默认配置文件在config/v1/config.yaml.tmpl文件中，当配置文件新增或修改后，hzx工具会基于config.yaml.tmpl生成config.go文件

```bash
hzx update config
```

### 5. 一键更新所有

自动获取当前项目模块名称，并更新apis,biz,wire,config

```bash
hzx update
```

### 4. 构建和运行

```bash
# 使用脚本构建，打包二进制、配置文件至bin目录中
sh build.sh

# 默认后台运行服务，日志存放在bin/logs/*.log文件中
sh bin/bootstrap.sh

# 停止服务
sh bin/terminate.sh
```
---