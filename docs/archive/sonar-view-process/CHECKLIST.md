# sonar-view 开发检查清单

> 使用方式：打印或收藏此文档，在实施 ACTION_PLAN.md 时参照  
> 更新频率：每完成一项，勾选对应的 [ ]  
> 最后更新：2026-04-14

---

## 【快速导航】

选择你的角色快速定位检查清单：

- **项目经理** → [【总体里程碑】](#总体里程碑)
- **后端开发** → [【P0 后端工作项】](#p0-后端工作项) + [【后端依赖验证】](#后端依赖验证)
- **前端开发** → [【P0 前端工作项】](#p0-前端工作项) + [【前端依赖验证】](#前端依赖验证)
- **QA/测试** → [【集成测试清单】](#集成测试清单)
- **DevOps** → [【发布准备清单】](#发布准备清单)

---

## 【总体里程碑】

### 周目标 Week 1: Feature Complete (本周)

**目标**: 完成所有 P0 工作项，系统达到功能完整状态

- [ ] **P0-1 评分系统实现** (2-3 天)
  - [ ] scoring_service.go 完成
  - [ ] scoring_config_repo.go 完成
  - [ ] 本地单元测试通过
  - [ ] Code review 通过

- [ ] **P0-2 快照指标查询** (1 天)
  - [ ] GET /api/v1/snapshots/:id/metrics 端点完成
  - [ ] 快照块解压和反序列化工作正常
  - [ ] 端点测试通过

- [ ] **P0-3 快照评分 API** (1 天)
  - [ ] POST /api/v1/snapshots/:id/score 端点完成
  - [ ] POST /api/v1/snapshots/:id/score 重新评分端点完成
  - [ ] 端点测试通过

- [ ] **P0-4 评分模板 API** (0.5 天)
  - [ ] GET/POST/PUT/DELETE /api/v1/scoring/templates 端点完成
  - [ ] 端点测试通过

- [ ] **P0-5 前端数据绑定** (1 天)
  - [ ] SnapshotDetailPage 评分数据加载完成
  - [ ] 前端组件测试通过
  - [ ] 本地手动测试通过

- [ ] **集成测试** (0.5 天)
  - [ ] 快照创建 → 指标查询 → 评分 → 前端显示全流程验证
  - [ ] WebSocket 实时推送验证
  - [ ] 没有重大缺陷

**周目标完成标准**: 
- ✓ 所有 P0 工作项 100% 完成
- ✓ Feature Complete (功能完整)
- ✓ Internal Beta Ready (内测就绪)

---

### 周目标 Week 2: Public Beta (下周)

**目标**: 完成所有 P1 工作项，系统达到公测就绪状态

- [ ] **P1-1 快照异步创建完善** (2 天)
  - [ ] 异步任务队列实现
  - [ ] WebSocket 状态推送实现
  - [ ] 本地测试通过

- [ ] **P1-2 快照列表筛选** (1 天)
  - [ ] 后端筛选参数支持
  - [ ] 前端筛选 UI 完成
  - [ ] 端到端测试通过

- [ ] **P1-3 状态端点优化** (0.5 天)
  - [ ] GET /api/v1/status 真实数据
  - [ ] 测试通过

- [ ] **P1-4 雷达图完善** (1 天)
  - [ ] ScoreRadar 组件完善
  - [ ] 数据绑定正确
  - [ ] 前端测试通过

- [ ] **错误处理和降级** (1-2 天)
  - [ ] 所有 API 返回有意义的错误信息
  - [ ] 前端显示加载状态
  - [ ] 前端显示错误状态
  - [ ] 前端显示空状态

**周目标完成标准**:
- ✓ 所有 P1 工作项 100% 完成
- ✓ Public Beta Ready (公测就绪)
- ✓ 用户可进行完整的快照工作流

---

### 后续里程碑 Weeks 3-4: GA Ready

**目标**: 完成 P2 工作项，系统达到生产就绪状态

- [ ] **Dockerfile / docker-compose** (0.5 天)
- [ ] **API 文档** (1 天)
- [ ] **单元测试** (2-3 天)
- [ ] **集成测试** (1-2 天)
- [ ] **监控和告警** (2-3 天)
- [ ] **性能优化** (2-3 天)

**目标完成标准**:
- ✓ GA Ready (生产就绪)
- ✓ 可进行 v1.0 正式发布

---

## 【P0 后端工作项】

### 工作项 P0-1: ScoringService 实现

**文件**: `internal/service/scoring_service.go`

**任务分解**:

```
□ 文件创建和基础结构
  □ 创建 scoring_service.go 文件
  □ 定义 ScoringService struct
  □ 定义 New 构造函数
  
□ 方法实现
  □ CalculateScore(ctx, snapshotId, config) 方法
    □ 获取快照指标数据
    □ 按指标名分组
    □ 调用 pkg/scoring 计算指标分数
    □ 计算加权总分
    □ 等级转换 (A-F)
    □ 保存评分结果
    
  □ PreviewScore(ctx, metrics, config) 方法
    □ 不保存，仅计算返回
    
  □ RescoreSnapshot(ctx, snapshotId, newConfig) 方法
    □ 重新计算既有快照评分

□ 错误处理
  □ 指标缺失时返回有意义错误
  □ 配置无效时返回有意义错误
  □ 数据库错误传递

□ 测试
  □ 单个指标评分计算测试
  □ 加权总分计算测试
  □ 等级转换测试 (0-100 → A-F)
  □ 异常处理测试
  □ 本地运行测试通过

□ Code Review
  □ 自检代码质量
  □ 请队友 review
  □ 修复 review 意见
```

**验收标准**:
- ✓ 所有方法实现完整
- ✓ 所有单元测试通过
- ✓ Code review 通过
- ✓ 可被 handler 调用

---

### 工作项 P0-2: ScoringConfigRepo 实现

**文件**: `internal/repo/scoring_config_repo.go`

**任务分解**:

```
□ 文件创建和接口定义
  □ 创建 scoring_config_repo.go 文件
  □ 定义 ScoringConfigRepo interface
    □ Create(ctx, config) error
    □ Get(ctx, configId) (*ScoringConfig, error)
    □ List(ctx) ([]*ScoringConfig, error)
    □ Update(ctx, configId, config) error
    □ Delete(ctx, configId) error
    □ SaveScore(ctx, snapshotId, score) error

□ MongoDB 后端实现
  □ 定义 mongoScoringConfigRepo struct
  □ New 构造函数
  □ Create 方法
    □ 生成 UUID
    □ 插入 MongoDB
    □ 返回错误
  □ Get 方法
    □ 按 ID 查询
    □ 返回 ScoringConfig
  □ List 方法
    □ 返回所有模板
    □ 按 created_at 倒序
  □ Update 方法
    □ 按 ID 更新
    □ 只更新必要字段
  □ Delete 方法
    □ 按 ID 删除
  □ SaveScore 方法
    □ 更新 snapshots 集合中的 score 字段

□ MongoDB 索引
  □ 创建 {name: 1} 索引
  □ 创建 {created_at: -1} 索引
  □ 创建 {_id: 1} (主键)

□ 数据结构验证
  □ ScoringConfig 结构体定义
  □ MetricScoringRule 结构体定义
  □ SnapshotScore 结构体定义
  □ MetricScore 结构体定义

□ 测试
  □ MongoDB 连接测试
  □ Create 操作测试
  □ Get 操作测试
  □ List 操作测试
  □ Update 操作测试
  □ Delete 操作测试
  □ SaveScore 操作测试
  □ 所有测试本地通过

□ Code Review
  □ 自检代码质量
  □ 请队友 review
  □ 修复 review 意见
```

**验收标准**:
- ✓ 所有 CRUD 操作实现
- ✓ 所有测试通过
- ✓ MongoDB 索引创建
- ✓ Code review 通过

---

### 工作项 P0-3: 快照指标查询 API

**文件**: `internal/handler/api_handler.go`, `internal/service/snapshot_service.go`

**任务分解**:

```
□ Handler 层
  □ GetSnapshotMetrics 方法实现
    □ 从 URL 提取 snapshotId
    □ 调用 snapshotService.GetMetrics
    □ 处理错误，返回 HTTP 404
    □ 返回 {code: 0, data: metrics}
    
□ Service 层
  □ GetMetrics 方法实现
    □ 从 repo 查询快照元数据
    □ 读取所有快照块
    □ 逐块解压 gzip
    □ 反序列化 JSON MetricPoint[]
    □ 合并所有块数据
    □ 返回 []MetricPoint
    
□ 错误处理
  □ 快照不存在 → 404
  □ 快照块损坏 → 500
  □ 解压失败 → 500
  □ 反序列化失败 → 500

□ 性能优化
  □ 快照块解压不阻塞主线程
  □ 大快照 (<100MB) 可正确处理

□ 测试
  □ 单块快照查询测试
  □ 多块快照查询测试
  □ 快照不存在测试
  □ 快照块损坏测试
  □ 性能测试（100MB 快照查询耗时）
  
□ Code Review
  □ 自检代码质量
  □ 请队友 review
  □ 修复 review 意见

□ 路由注册 (main.go)
  □ mux.HandleFunc("GET /api/v1/snapshots/{id}/metrics", handler.GetSnapshotMetrics)
```

**验收标准**:
- ✓ 端点实现完整
- ✓ 快照块正确解压
- ✓ 反序列化正确
- ✓ 所有测试通过
- ✓ Code review 通过

---

### 工作项 P0-4: 快照评分 API

**文件**: `internal/handler/api_handler.go`

**任务分解**:

```
□ 端点 1: GET /api/v1/snapshots/:id/score
  □ Handler 方法实现
    □ 从 URL 提取 snapshotId
    □ 调用 snapshotService.GetScore
    □ 返回 {code: 0, data: score}
    
□ 端点 2: POST /api/v1/snapshots/:id/score (重新评分)
  □ Handler 方法实现
    □ 从 URL 提取 snapshotId
    □ 解析 JSON 请求体 {config_id: string}
    □ 获取评分模板
    □ 调用 scoringService.RescoreSnapshot
    □ 返回 {code: 0, data: score}
    
□ 端点 3: GET /api/v1/scoring/templates
  □ Handler 方法实现
    □ 调用 scoringConfigRepo.List
    □ 返回 {code: 0, data: templates[]}
    
□ 端点 4: POST /api/v1/scoring/templates
  □ Handler 方法实现
    □ 解析 JSON 请求体
    □ 生成 UUID + 时间戳
    □ 调用 scoringConfigRepo.Create
    □ 返回 {code: 0, data: config}
    
□ 端点 5: PUT /api/v1/scoring/templates/:id
  □ Handler 方法实现
    □ 从 URL 提取 configId
    □ 解析 JSON 请求体
    □ 调用 scoringConfigRepo.Update
    □ 返回 {code: 0, data: config}
    
□ 端点 6: DELETE /api/v1/scoring/templates/:id
  □ Handler 方法实现
    □ 从 URL 提取 configId
    □ 调用 scoringConfigRepo.Delete
    □ 返回 {code: 0}
    
□ 端点 7: POST /api/v1/scoring/preview
  □ Handler 方法实现
    □ 解析 JSON 请求体 {metrics: [], config: ScoringConfig}
    □ 调用 scoringService.PreviewScore
    □ 返回 {code: 0, data: score}

□ 错误处理
  □ 快照不存在 → 404
  □ 配置无效 → 400
  □ 权限错误 → 403

□ 测试
  □ 获取快照评分测试
  □ 创建模板测试
  □ 列表模板测试
  □ 更新模板测试
  □ 删除模板测试
  □ 重新评分测试
  □ 评分预览测试
  □ 错误处理测试

□ Code Review
  □ 自检代码质量
  □ 请队友 review
  □ 修复 review 意见

□ 路由注册 (main.go)
  □ 所有 7 个端点注册完整
```

**验收标准**:
- ✓ 7 个端点全部实现
- ✓ 所有测试通过
- ✓ Code review 通过
- ✓ 无 HTTP 400+ 错误

---

### 后端集成测试

**测试清单**:

```
□ 快照创建流程
  □ POST /api/v1/snapshots 创建快照
  □ 快照状态为 "creating"
  □ 返回快照 ID

□ 快照指标查询流程
  □ GET /api/v1/snapshots/:id/metrics 查询
  □ 返回指标数组
  □ 指标包含 name/value/timestamp/labels

□ 快照评分流程
  □ GET /api/v1/snapshots/:id/score 查询初始评分
  □ POST /api/v1/snapshots/:id/score 重新评分
  □ 返回 total/grade/metrics

□ 评分模板流程
  □ GET /api/v1/scoring/templates 获取模板列表
  □ POST /api/v1/scoring/templates 创建模板
  □ PUT /api/v1/scoring/templates/:id 更新模板
  □ DELETE /api/v1/scoring/templates/:id 删除模板

□ 评分预览流程
  □ POST /api/v1/scoring/preview 预览评分
  □ 给定指标和配置，返回评分结果
  □ 不保存数据

□ 错误处理流程
  □ 查询不存在的快照 → 404
  □ 使用无效的配置 → 400
  □ MongoDB 连接失败 → 500
  □ 快照块损坏 → 500

□ WebSocket 实时推送
  □ 评分完成后通过 WebSocket 推送
  □ 前端收到推送并更新 UI
```

**验收标准**:
- ✓ 所有流程无误
- ✓ 错误处理正确
- ✓ 没有重大缺陷
- ✓ 性能满足要求 (<5s 单个快照)

---

## 【P0 前端工作项】

### 工作项 P0-5: 前端评分数据绑定

**文件**: `site/src/views/snapshots/detail.tsx`, `site/src/shared/hooks/use-view-api.ts`

**任务分解**:

```
□ 新增 Hooks (use-view-api.ts)
  □ useSnapshotScore(snapshotId)
    □ 查询 /api/v1/snapshots/:id/score
    □ 启用条件：snapshotId 存在
    □ staleTime: Infinity (快照不变，评分不变)
    
  □ useRescoreSnapshot()
    □ POST /api/v1/snapshots/:id/score
    □ 成功后 invalidate snapshot-score query
    
  □ useScoringTemplates()
    □ 查询 /api/v1/scoring/templates
    □ 缓存模板列表

□ SnapshotDetailPage 更新
  □ 导入新增的 Hooks
  □ 调用 useSnapshotScore(snapshotId)
  □ 调用 useScoringTemplates()
  □ 调用 useRescoreSnapshot()
  
  □ 评分头显示
    □ 显示快照总分
    □ 显示等级徽标 (A-F)
    □ 重新评分按钮
    
  □ 评分分解侧栏
    □ 显示每个指标的单独评分
    □ 显示权重和加权分数
    □ 显示进度条
    
  □ 雷达图
    □ 调用 ScoreRadar 组件
    □ 传递评分数据
    
  □ 加载状态
    □ 评分加载中显示 Skeleton
    □ 快照不存在显示错误信息
    
  □ 重新评分对话框
    □ 选择评分模板
    □ 确认重新评分
    □ 显示进度

□ 错误处理
  □ API 返回 404 → 显示 "快照不存在"
  □ API 返回 500 → 显示 "加载失败"
  □ 网络错误 → 显示 "连接失败，请重试"

□ 测试
  □ 快照评分数据加载测试
  □ 重新评分流程测试
  □ 错误状态测试
  □ 加载状态测试
  □ 本地手动测试通过

□ Code Review
  □ 自检代码质量
  □ 请队友 review
  □ 修复 review 意见
```

**验收标准**:
- ✓ 所有 Hooks 实现完整
- ✓ SnapshotDetailPage 页面完整
- ✓ 评分数据正确显示
- ✓ 所有测试通过
- ✓ Code review 通过

---

## 【前端依赖验证】

**检查清单** (实施前必须全部通过):

```
□ 开发环境
  □ Node.js 版本 18+ (npm -v 检查)
  □ npm 依赖全部安装 (npm install)
  
□ React 和路由
  □ React 19 正常导入
  □ React Router v7 正常导入
  □ useParams 钩子可用
  □ useNavigate 钩子可用
  
□ 数据查询 (TanStack Query)
  □ @tanstack/react-query 5.x 安装
  □ useQuery 钩子可用
  □ useMutation 钩子可用
  □ QueryClient 正确配置
  □ 本地开发中 QueryClient 可正常工作
  
□ 状态管理 (Zustand)
  □ zustand 5.x 安装
  □ 现有 Zustand store 可正常使用
  □ 新 store 可正常创建
  
□ HTTP 客户端
  □ api.get/post/put/delete 方法可用
  □ 请求头正确设置
  □ 本地 API 调用成功
  
□ WebSocket 客户端
  □ SonarWSClient 单例可用
  □ ws:// 连接成功
  □ 消息订阅可用
  
□ 组件库 (shadcn/ui)
  □ 现有组件正常使用
  □ 新增组件可正常导入
  
□ 图表库 (recharts)
  □ recharts 3.8 安装
  □ LineChart/RadarChart 组件可用
  
□ 本地开发服务
  □ npm run dev 启动成功
  □ 页面 http://localhost:5173 可访问
  □ HMR (Hot Module Replacement) 正常工作
```

---

## 【后端依赖验证】

**检查清单** (实施前必须全部通过):

```
□ Go 环境
  □ Go 版本 1.21+ (go version 检查)
  □ GOPATH 正确设置
  
□ 依赖管理
  □ go.mod 文件存在
  □ go mod tidy 无错误
  □ go get 无网络错误
  
□ MongoDB
  □ MongoDB 6.0+ 运行中
  □ mongo 客户端连接成功
  □ 数据库 sonar-view 存在
  □ 集合 snapshots 存在
  □ 集合 snapshot_chunks 存在
  □ 集合 scoring_templates 存在
  
□ 关键依赖
  □ gorilla/websocket 可导入
  □ prometheus/prometheus 可导入
  □ mongodb driver 可导入
  □ viper 配置库可导入
  
□ 代码编译
  □ go build ./cmd/server 无错误
  □ go test ./... 无编译错误
  
□ 配置文件
  □ config.yaml 存在
  □ sonar-store 地址配置正确
  □ MongoDB 连接字符串正确
  
□ sonar-store 依赖
  □ sonar-store 运行中
  □ sonar-store:8082 可访问
  □ /apis/v1/metrics/query 端点可用
  
□ 日志输出
  □ 启动日志不含 ERROR
  □ 启动日志显示服务监听
```

---

## 【集成测试清单】

**测试场景 1: 完整快照工作流**

```
□ 前置条件
  □ sonar-store 运行中
  □ sonar-view 后端运行中
  □ sonar-view 前端运行中 (npm run dev)
  □ MongoDB 连接正常
  
□ 步骤 1: 创建快照
  □ 打开 /snapshots 页面
  □ 点击 "+ 创建快照" 按钮
  □ 填写快照信息 (名称、tap、时间范围)
  □ 点击创建
  
□ 验证 1: 快照创建成功
  □ 快照列表中出现新快照
  □ 快照状态显示 "creating"
  □ WebSocket 收到状态推送
  
□ 步骤 2: 等待快照就绪
  □ 观察快照状态变化
  □ 大约 5-30 秒后状态变为 "ready"
  □ 页面自动刷新显示评分
  
□ 验证 2: 快照指标加载
  □ 点击快照进入详情页
  □ 页面右侧图表显示指标数据
  □ 多条折线正确显示

□ 验证 3: 快照评分显示
  □ 页面左上角显示总分 (0-100)
  □ 显示等级徽标 (A-F)
  □ 右侧评分分解栏显示各指标分数
  □ 雷达图显示评分分布
  
□ 步骤 3: 重新评分
  □ 点击 "重新评分" 按钮
  □ 选择不同的评分模板
  □ 点击确认
  
□ 验证 4: 重新评分成功
  □ 页面重新加载评分
  □ 新的评分结果显示
  
□ 步骤 4: 删除快照
  □ 点击快照卡片上的删除按钮
  □ 确认删除
  
□ 验证 5: 删除成功
  □ 快照从列表中消失
  □ 没有错误提示
```

---

**测试场景 2: 快照列表筛选 (P1 功能)**

```
□ 前置条件
  □ 系统中存在多个快照
  □ 快照来自不同的 tap
  □ 快照有不同的状态
  
□ 步骤 1: 按 Tap 筛选
  □ 打开 /snapshots 页面
  □ 在筛选区选择特定 tap
  □ 列表只显示该 tap 的快照
  
□ 步骤 2: 按状态筛选
  □ 选择 "ready" 状态
  □ 列表只显示就绪的快照
  
□ 步骤 3: 按时间范围筛选
  □ 选择时间范围
  □ 列表只显示时间范围内的快照
  
□ 验证
  □ 筛选组合工作正常
  □ 列表更新及时
  □ 没有性能问题
```

---

**测试场景 3: WebSocket 实时推送 (P1 功能)**

```
□ 前置条件
  □ WebSocket 连接已建立
  □ 浏览器开发者工具打开
  
□ 步骤 1: 监听 WebSocket 消息
  □ 打开浏览器 DevTools → Network → WS
  □ 查看 /ws 连接
  
□ 步骤 2: 创建快照并观察推送
  □ 创建新快照
  □ 在 DevTools 中观察 WebSocket 消息
  □ 应该看到 "creating" → "ready" 状态变化消息
  
□ 验证
  □ WebSocket 消息格式正确
  □ 状态变化及时推送
  □ 前端 UI 及时更新
```

---

**性能测试**

```
□ 快照创建耗时
  □ 小快照 (<5MB) 创建耗时 <5s
  □ 中等快照 (5-50MB) 创建耗时 <30s
  □ 大快照 (>50MB) 创建耗时 <60s
  
□ 指标查询耗时
  □ 小快照指标查询 <1s
  □ 大快照指标查询 <5s
  
□ 评分计算耗时
  □ 评分计算 <1s
  
□ 页面加载耗时
  □ 快照列表页 <2s
  □ 快照详情页 <3s
  
□ 内存使用
  □ 没有明显内存泄漏
  □ 快照删除后内存释放
```

---

## 【发布准备清单】

**P0 发布前检查** (Feature Complete)

```
□ 功能完整性
  □ 所有设计的功能已实现
  □ 没有明显的功能缺陷
  □ 核心工作流可正常完成
  
□ 代码质量
  □ 所有代码已 review
  □ 没有待处理的 review 意见
  □ 代码风格一致
  □ 没有明显的代码坏味道
  
□ 测试覆盖
  □ 单元测试通过率 >80%
  □ 集成测试覆盖关键路径
  □ 没有已知的缺陷
  □ 性能测试通过
  
□ 文档
  □ API 文档基本完整
  □ 代码注释清晰
  □ 部署文档基本完整
  
□ 错误处理
  □ 所有 HTTP 错误返回正确的状态码
  □ 错误消息清晰有意义
  □ 没有 stack trace 暴露给用户
  
□ 安全性
  □ 没有明显的安全漏洞
  □ 输入验证完整
  □ 权限检查完整
  
□ 性能
  □ 没有明显的性能瓶颈
  □ 页面加载速度 <5s
  □ API 响应时间 <2s
  
□ 打包和部署
  □ 后端编译无错误
  □ 前端构建无错误
  □ 配置文件完整
```

---

**P1 发布前检查** (Public Beta)

```
□ 前 P0 的所有检查项

□ P1 功能完整性
  □ 快照异步创建完善
  □ 快照列表筛选功能
  □ 状态端点优化
  □ 雷达图完善
  
□ 错误处理加强
  □ 异常恢复机制
  □ 降级方案
  □ 重试机制
  
□ 用户体验
  □ 加载状态清晰
  □ 错误提示有帮助
  □ 空状态提示清晰
  
□ 监控准备
  □ 关键路径监控
  □ 错误告警规则
  □ 性能指标收集
```

---

**GA 发布前检查** (Production Ready)

```
□ 前 P1 的所有检查项

□ 文档完整性
  □ 完整的 API 文档
  □ 部署和运维手册
  □ 用户使用文档
  □ 故障排查指南
  
□ 测试覆盖
  □ 单元测试覆盖率 >70%
  □ 集成测试完整
  □ 端到端测试覆盖关键路径
  □ 压力测试通过
  □ 安全测试通过
  
□ 部署就绪
  □ Dockerfile 完整测试
  □ docker-compose 完整测试
  □ 多环境部署手册
  □ 滚动更新方案
  
□ 监控和告警
  □ 所有关键指标监控
  □ 告警规则配置完整
  □ 仪表板配置完整
  
□ 性能优化
  □ 数据库查询优化
  □ 缓存策略优化
  □ 前端渲染优化
  
□ 安全加固
  □ 身份认证完整
  □ 权限管理完整
  □ 加密传输配置
  □ 安全审计日志
```

---

## 【关键路径检查】

**快速验证系统是否可用**

快照完整流程检查清单（5 分钟快速验证）：

```
1️⃣ 创建快照
   curl -X POST http://localhost:8283/api/v1/snapshots \
     -H "Content-Type: application/json" \
     -d '{"name": "test", "tap_id": "tap-1", "start_time": 1700000000, "end_time": 1700003600}'
   
   ✓ 返回 200 + snapshotId

2️⃣ 查询快照列表
   curl http://localhost:8283/api/v1/snapshots
   
   ✓ 返回 200 + 快照列表

3️⃣ 查询快照详情
   curl http://localhost:8283/api/v1/snapshots/{snapshotId}
   
   ✓ 返回 200 + 快照数据

4️⃣ 查询快照指标
   curl http://localhost:8283/api/v1/snapshots/{snapshotId}/metrics
   
   ✓ 返回 200 + 指标数据

5️⃣ 查询快照评分
   curl http://localhost:8283/api/v1/snapshots/{snapshotId}/score
   
   ✓ 返回 200 + 评分数据

6️⃣ 前端访问
   打开 http://localhost:5173/snapshots
   
   ✓ 快照列表显示
   ✓ 点击快照进入详情页
   ✓ 详情页显示图表和评分

✅ 如果全部通过，系统可用！
```

---

## 【常见问题排查】

**Q: 前端页面加载不出来？**

```
A: 检查清单
  □ sonar-view 后端是否运行中 (localhost:8283)
  □ npm run dev 是否启动 (localhost:5173)
  □ 浏览器控制台是否有错误
  □ 网络标签是否有 4xx/5xx 错误
  
建议：
  1. 重启后端：go run ./cmd/server
  2. 重启前端：npm run dev
  3. 清除浏览器缓存：Ctrl+Shift+Delete
  4. 查看浏览器控制台错误
```

**Q: API 返回 404 错误？**

```
A: 检查清单
  □ 路由是否注册在 main.go
  □ Handler 方法是否存在
  □ 方法签名是否正确
  □ 路由参数是否提取正确
  
建议：
  1. 检查 main.go 中的路由注册
  2. 检查 Handler 中的方法实现
  3. 使用 curl 或 Postman 测试 API
```

**Q: MongoDB 连接失败？**

```
A: 检查清单
  □ MongoDB 是否运行中 (mongosh 测试)
  □ config.yaml 中的连接字符串是否正确
  □ 数据库和集合是否存在
  □ 防火墙是否允许 27017 端口
  
建议：
  1. 启动 MongoDB：mongod
  2. 测试连接：mongosh mongodb://localhost:27017
  3. 创建数据库和集合
  4. 更新 config.yaml
```

**Q: 评分数据无法加载？**

```
A: 检查清单
  □ GET /api/v1/snapshots/:id/score 是否返回 200
  □ 响应数据格式是否正确
  □ SnapshotDetailPage 是否正确调用 Hook
  □ 前端浏览器控制台是否有错误
  
建议：
  1. 使用 curl 测试 API 返回
  2. 检查前端 console.log 输出
  3. 使用浏览器 DevTools 检查网络请求
```

---

## 【团队协作提示】

**代码 Review 检查项**

```
后端 Review:
  □ 错误处理完整 (所有 err != nil 都处理)
  □ 日志记录清晰 (关键路径有日志)
  □ 并发安全 (goroutine 和 channel 使用正确)
  □ 资源释放 (数据库连接、文件等正确关闭)
  □ 性能考虑 (没有 O(n²) 算法、没有死循环)

前端 Review:
  □ Hook 依赖正确 (useEffect 依赖数组完整)
  □ 内存泄漏防止 (组件卸载时清理)
  □ 错误处理 (try-catch、错误状态)
  □ 可访问性 (ARIA 标签、键盘导航)
  □ 性能优化 (虚拟化、防抖、缓存)
```

**协作流程**

```
1. 创建特性分支
   git checkout -b feature/p0-scoring-system

2. 提交代码
   git commit -m "feat: implement scoring system"

3. 推送并创建 Pull Request
   git push origin feature/p0-scoring-system

4. 请队友 Review
   @ 在 PR 中标记 reviewer

5. 修复 Review 意见
   git commit -m "fix: address review comments"

6. 合并到 main
   git merge --no-ff feature/p0-scoring-system

7. 删除分支
   git branch -d feature/p0-scoring-system
```

---

## 【每日进度报告模板】

**每天下班前填写此模板，便于团队同步**

```
日期: 2026-04-XX
完成工作: [描述今天完成的工作项]
遇到问题: [描述遇到的问题]
明日计划: [描述明天的计划]
进度百分比: XX%
预计完成时间: 2026-04-YY

示例:
日期: 2026-04-15
完成工作: 
  - 完成 ScoringService 的 CalculateScore 方法
  - 编写单元测试 (3/5 通过)
遇到问题:
  - pkg/scoring 的 Range 型评分逻辑需要澄清
  - MongoDB 索引创建有权限问题
明日计划:
  - 修复 pkg/scoring 集成
  - 完成 MongoDB 索引配置
  - 完成 ScoringConfigRepo 基本框架
进度百分比: 30%
预计完成时间: 2026-04-17
```

---

## 【更新记录】

| 日期 | 版本 | 更新内容 |
|------|------|---------|
| 2026-04-14 | v1.0 | 初版发布，包含 P0/P1/P2 完整检查清单 |

---

**使用建议**：
1. 打印此文档放在办公桌上
2. 每完成一项，勾选对应的 [ ]
3. 每天下班前查看 "每日进度报告模板" 填写
4. 每周一检查 "【总体里程碑】" 进度
5. 遇到问题参考 "【常见问题排查】"

**最后更新**：2026-04-14  
**下次更新**：每周一

---

*Happy Coding! 🚀*
