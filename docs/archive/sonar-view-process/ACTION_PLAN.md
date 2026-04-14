# sonar-view 优先级行动计划

> 基于完整进度分析 (PROGRESS_ANALYSIS.md)  
> 目标：1-2 周内达成 Feature Complete + Internal Beta  
> 发布日期：2026-04-14 制定

---

## 第一阶段：P0 缺口补齐 (本周 ~ 1 周)

### 工作项 P0-1：实现评分系统核心 (2-3 天)

**文件**: `internal/service/scoring_service.go` (新建)

**功能清单**:
- [ ] 定义 `ScoringService` struct
  - 依赖：`scoringRepo`, `snapshotRepo`, `storageClient`
- [ ] 实现 `CalculateScore(ctx, snapshotId, config) → SnapshotScore` 方法
  - 调用 `snapshotRepo.GetMetrics(snapshotId)` 获取指标数据
  - 调用 `pkg/scoring/calculator.Range/Threshold` 计算指标得分
  - 聚合为快照总分 (0-100) 和等级 (A-F)
  - 保存评分结果到 `snapshotRepo`
- [ ] 实现 `PreviewScore(ctx, metrics, config) → SnapshotScore` 方法
  - 给定原始指标数据 + 评分配置，返回评分结果 (不保存)
- [ ] 实现 `RescoreSnapshot(ctx, snapshotId, newConfig) → SnapshotScore` 方法
  - 重新计算既有快照的评分

**关键实现细节**:
```go
// 伪代码示例
func (s *ScoringService) CalculateScore(ctx context.Context, snapshotId string, config *ScoringConfig) (*SnapshotScore, error) {
    // 1. 获取快照指标数据
    metrics, err := s.snapshotRepo.GetMetrics(snapshotId)
    
    // 2. 按指标名分组
    metricsMap := groupByName(metrics)
    
    // 3. 为每个指标计算分数
    var metricScores []MetricScore
    for _, rule := range config.MetricRules {
        rule := rule // copy for concurrency
        values := metricsMap[rule.MetricName]
        
        // 使用 pkg/scoring 的 calculator
        score := calculator.CalculateMetricScore(values, rule.ScoringMethod)
        metricScores = append(metricScores, score)
    }
    
    // 4. 计算加权总分
    totalScore := calculateWeightedScore(metricScores, config.Weights)
    grade := scoreToGrade(totalScore)
    
    // 5. 保存评分结果
    snapshotScore := &SnapshotScore{
        Total: totalScore,
        Grade: grade,
        Metrics: metricScores,
    }
    
    return snapshotScore, s.snapshotRepo.SaveScore(ctx, snapshotId, snapshotScore)
}
```

**测试覆盖**:
- [ ] 单个指标评分计算
- [ ] 加权总分计算
- [ ] 等级转换 (A-F)
- [ ] 异常处理 (指标缺失、配置无效)

**依赖验证**:
- [ ] `pkg/scoring/calculator.go` 已复用
- [ ] `snapshotRepo.SaveScore()` 需在 repo 层实现

---

### 工作项 P0-2：实现评分配置存储层 (1 天)

**文件**: `internal/repo/scoring_config_repo.go` (新建)

**功能清单**:
- [ ] 定义 `ScoringConfigRepo` interface
  - `Create(ctx, config) → error`
  - `Get(ctx, configId) → *ScoringConfig, error`
  - `List(ctx) → []*ScoringConfig, error`
  - `Update(ctx, configId, config) → error`
  - `Delete(ctx, configId) → error`
- [ ] 实现 MongoDB 后端
  - 集合名: `scoring_templates`
  - 索引: `{name: 1}`, `{created_at: -1}`
- [ ] 实现 `SaveScore(ctx, snapshotId, score)` 方法
  - 保存评分结果到 `snapshots` 集合的 `score` 字段

**数据结构** (参考 MASTER_DESIGN.md):
```go
type ScoringConfig struct {
    ID          string                 // UUID
    Name        string                 // 模板名称
    Description string                 // 描述
    MetricRules []MetricScoringRule   // 指标规则
    Weights     map[string]float64     // 指标权重
    CreatedAt   int64
    UpdatedAt   int64
}

type MetricScoringRule struct {
    MetricName   string      // 指标名 (e.g., "avg_fps")
    ScoringType  string      // "range" 或 "threshold"
    // Range 模式参数
    MinValue    float64      // 最小值（对应 score 0）
    MaxValue    float64      // 最大值（对应 score 100）
    // Threshold 模式参数
    Thresholds  []float64    // [50, 70, 85, 95] → scores [60, 75, 90, 100]
}

type SnapshotScore struct {
    Total    int          // 0-100
    Grade    string       // "A"|"B"|"C"|"D"|"F"
    Metrics  []MetricScore
}

type MetricScore struct {
    MetricName string
    Score      int          // 0-100
    Weight     float64
    WeightedScore float64  // Score * Weight
}
```

**MongoDB 操作示例**:
```go
// Create
collection.InsertOne(ctx, config)

// List with filters
opts := options.Find().SetSort(bson.M{"created_at": -1})
cursor := collection.Find(ctx, bson.M{}, opts)

// Update score in snapshot
collection.UpdateOne(ctx, 
    bson.M{"_id": snapshotId},
    bson.M{"$set": bson.M{"score": score}},
)
```

**测试覆盖**:
- [ ] CRUD 操作
- [ ] 列表查询排序
- [ ] 评分保存

---

### 工作项 P0-3：实现评分 API 端点 (1 天)

**文件**: `internal/handler/api_handler.go` (添加新方法)

**新增端点**:

#### 1. GET /api/v1/snapshots/:id/score
```go
func (h *Handler) GetSnapshotScore(w http.ResponseWriter, r *http.Request) {
    snapshotId := mux.Vars(r)["id"]
    
    score, err := h.snapshotService.GetScore(r.Context(), snapshotId)
    if err != nil {
        writeErrorJSON(w, http.StatusNotFound, "Snapshot not found")
        return
    }
    
    writeJSON(w, http.StatusOK, map[string]interface{}{
        "code": 0,
        "data": score,
    })
}
```

#### 2. POST /api/v1/snapshots/:id/score (重新评分)
```go
func (h *Handler) RescoreSnapshot(w http.ResponseWriter, r *http.Request) {
    snapshotId := mux.Vars(r)["id"]
    
    var req struct {
        ConfigId string `json:"config_id"` // 使用指定的评分模板
    }
    json.NewDecoder(r.Body).Decode(&req)
    
    // 获取评分模板
    config, err := h.scoringConfigRepo.Get(r.Context(), req.ConfigId)
    if err != nil {
        writeErrorJSON(w, http.StatusBadRequest, "Invalid config")
        return
    }
    
    // 重新评分
    score, err := h.scoringService.RescoreSnapshot(r.Context(), snapshotId, config)
    if err != nil {
        writeErrorJSON(w, http.StatusInternalServerError, "Rescore failed")
        return
    }
    
    writeJSON(w, http.StatusOK, map[string]interface{}{
        "code": 0,
        "data": score,
    })
}
```

#### 3. GET /api/v1/scoring/templates
```go
func (h *Handler) ListScoringTemplates(w http.ResponseWriter, r *http.Request) {
    templates, err := h.scoringConfigRepo.List(r.Context())
    if err != nil {
        templates = []*ScoringConfig{} // 返回空列表而非错误
    }
    
    writeJSON(w, http.StatusOK, map[string]interface{}{
        "code": 0,
        "data": templates,
    })
}
```

#### 4. POST /api/v1/scoring/templates
```go
func (h *Handler) CreateScoringTemplate(w http.ResponseWriter, r *http.Request) {
    var config *ScoringConfig
    json.NewDecoder(r.Body).Decode(&config)
    
    config.ID = uuid.New().String()
    config.CreatedAt = time.Now().Unix()
    
    err := h.scoringConfigRepo.Create(r.Context(), config)
    if err != nil {
        writeErrorJSON(w, http.StatusBadRequest, "Create failed")
        return
    }
    
    writeJSON(w, http.StatusCreated, map[string]interface{}{
        "code": 0,
        "data": config,
    })
}
```

#### 5. PUT /api/v1/scoring/templates/:id
- 类似 Create，使用 Update 方法

#### 6. DELETE /api/v1/scoring/templates/:id
- 删除指定评分模板

#### 7. POST /api/v1/scoring/preview
```go
func (h *Handler) PreviewScoring(w http.ResponseWriter, r *http.Request) {
    var req struct {
        Metrics []MetricPoint `json:"metrics"`
        Config  *ScoringConfig `json:"config"`
    }
    json.NewDecoder(r.Body).Decode(&req)
    
    // 直接计算，不保存
    score, err := h.scoringService.PreviewScore(r.Context(), req.Metrics, req.Config)
    if err != nil {
        writeErrorJSON(w, http.StatusBadRequest, "Preview failed")
        return
    }
    
    writeJSON(w, http.StatusOK, map[string]interface{}{
        "code": 0,
        "data": score,
    })
}
```

**路由注册** (在 main.go 中):
```go
mux.HandleFunc("GET /api/v1/snapshots/{id}/score", handler.GetSnapshotScore)
mux.HandleFunc("POST /api/v1/snapshots/{id}/score", handler.RescoreSnapshot)
mux.HandleFunc("GET /api/v1/scoring/templates", handler.ListScoringTemplates)
mux.HandleFunc("POST /api/v1/scoring/templates", handler.CreateScoringTemplate)
mux.HandleFunc("PUT /api/v1/scoring/templates/{id}", handler.UpdateScoringTemplate)
mux.HandleFunc("DELETE /api/v1/scoring/templates/{id}", handler.DeleteScoringTemplate)
mux.HandleFunc("POST /api/v1/scoring/preview", handler.PreviewScoring)
```

**测试覆盖**:
- [ ] 获取快照评分
- [ ] 重新评分
- [ ] 模板 CRUD
- [ ] 评分预览
- [ ] 错误处理

---

### 工作项 P0-4：实现快照指标查询 API (1 天)

**文件**: `internal/handler/api_handler.go` (添加新方法)

**新增端点**: GET /api/v1/snapshots/:id/metrics

**实现**:
```go
func (h *Handler) GetSnapshotMetrics(w http.ResponseWriter, r *http.Request) {
    snapshotId := mux.Vars(r)["id"]
    
    // 从 snapshot_repo 查询指标数据
    metrics, err := h.snapshotService.GetMetrics(r.Context(), snapshotId)
    if err != nil {
        writeErrorJSON(w, http.StatusNotFound, "Metrics not found")
        return
    }
    
    // 按指标名分组 (前端需要)
    grouped := groupMetricsByName(metrics)
    
    writeJSON(w, http.StatusOK, map[string]interface{}{
        "code": 0,
        "data": grouped,
    })
}
```

**SnapshotService 方法**:
```go
func (s *SnapshotService) GetMetrics(ctx context.Context, snapshotId string) ([]MetricPoint, error) {
    // 从 MongoDB 快照块读取数据
    snapshot, err := s.repo.GetSnapshot(ctx, snapshotId)
    if err != nil {
        return nil, err
    }
    
    // 读取快照块、解压、合并
    var metrics []MetricPoint
    for i := 0; i < snapshot.ChunkCount; i++ {
        chunk, err := s.repo.GetChunk(ctx, snapshotId, i)
        if err != nil {
            return nil, err
        }
        
        // 解压 gzip
        decompressed, err := gzipDecompress(chunk.Data)
        if err != nil {
            return nil, err
        }
        
        // 反序列化 JSON
        var chunkMetrics []MetricPoint
        json.Unmarshal(decompressed, &chunkMetrics)
        metrics = append(metrics, chunkMetrics...)
    }
    
    return metrics, nil
}
```

**路由注册**:
```go
mux.HandleFunc("GET /api/v1/snapshots/{id}/metrics", handler.GetSnapshotMetrics)
```

**测试覆盖**:
- [ ] 查询快照指标
- [ ] 解压和反序列化
- [ ] 多块合并
- [ ] 错误处理

---

### 工作项 P0-5：前端评分数据绑定 (1 天)

**文件**: `site/src/views/snapshots/detail.tsx`, `site/src/shared/hooks/use-view-api.ts`

**新增 Hook** (use-view-api.ts):
```typescript
// Hook 用于获取快照评分
export function useSnapshotScore(snapshotId: string | undefined) {
  return useQuery({
    queryKey: ['snapshot-score', snapshotId],
    queryFn: () => {
      if (!snapshotId) return null;
      return api.get<SnapshotScore>(`/api/v1/snapshots/${snapshotId}/score`);
    },
    enabled: !!snapshotId,
    staleTime: Infinity, // 快照不变，评分不变
  });
}

// Hook 用于重新评分
export function useRescoreSnapshot() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ snapshotId, configId }: { snapshotId: string; configId: string }) =>
      api.post(`/api/v1/snapshots/${snapshotId}/score`, { config_id: configId }),
    
    onSuccess: (_, { snapshotId }) => {
      // 重新获取快照评分
      queryClient.invalidateQueries({ queryKey: ['snapshot-score', snapshotId] });
    },
  });
}

// Hook 用于列表评分模板
export function useScoringTemplates() {
  return useQuery({
    queryKey: ['scoring-templates'],
    queryFn: () => api.get<ScoringConfig[]>('/api/v1/scoring/templates'),
  });
}
```

**SnapshotDetailPage 更新**:
```typescript
export function SnapshotDetailPage() {
  const { id } = useParams();
  
  // 获取快照数据
  const { data: snapshot } = useSnapshot(id);
  
  // 获取指标数据
  const { data: metrics } = useSnapshotMetrics(id);
  
  // 获取评分数据
  const { data: score, isLoading: scoreLoading } = useSnapshotScore(id);
  
  // 重新评分
  const { mutate: rescore } = useRescoreSnapshot();
  const { data: templates } = useScoringTemplates();
  
  return (
    <div className="snapshot-detail">
      {/* 快照信息头 */}
      <div className="header">
        <h1>{snapshot?.name}</h1>
        
        {/* 评分显示 */}
        {scoreLoading ? (
          <Skeleton />
        ) : score ? (
          <ScoreBadge score={score.total} grade={score.grade} size="lg" />
        ) : null}
        
        {/* 重新评分按钮 */}
        <Dialog>
          <DialogTrigger asChild>
            <Button>重新评分</Button>
          </DialogTrigger>
          <DialogContent>
            <Select onValueChange={(configId) => rescore({ snapshotId: id, configId })}>
              <SelectTrigger>选择评分模板</SelectTrigger>
              <SelectContent>
                {templates?.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DialogContent>
        </Dialog>
      </div>
      
      {/* 指标图表 */}
      <MetricChartsGrid data={metrics} />
      
      {/* 评分分解侧栏 */}
      <div className="score-breakdown">
        {score?.metrics.map(metric => (
          <div key={metric.metricName} className="metric-score">
            <span>{metric.metricName}</span>
            <Progress value={metric.score} />
            <span>{metric.score}/A</span>
          </div>
        ))}
      </div>
      
      {/* 雷达图 */}
      {score && <ScoreRadar score={score} />}
    </div>
  );
}
```

**测试覆盖**:
- [ ] 加载快照评分
- [ ] 显示评分数据
- [ ] 重新评分流程
- [ ] 错误状态处理

---

### P0 阶段检查清单

```
□ scoring_service.go 完整实现 + 测试
□ scoring_config_repo.go 完整实现 + 测试
□ scoring 相关 7 个 API 端点完整实现 + 测试
□ GET /api/v1/snapshots/:id/metrics 端点实现 + 测试
□ 前端 SnapshotDetailPage 评分数据绑定完成
□ 本地集成测试：快照创建 → 指标查询 → 评分计算 → 前端显示
□ 所有 P0 功能本地验证无误
```

---

## 第二阶段：P1 优化 (下周 ~ 1.5 周)

### 工作项 P1-1：快照异步创建完善 (2 天)

**目标**: 实现异步任务队列，优化快照创建流程

**改造**:
1. 创建 `internal/tasks/snapshot_task.go` 异步任务处理
2. 使用 channel + goroutine 处理快照创建
3. 通过 WebSocket 推送 status 变化

**实现框架**:
```go
type SnapshotTask struct {
    SnapshotId string
    Status     string // "creating" → "ready" / "failed"
    Progress   int
}

type TaskQueue struct {
    queue chan *SnapshotTask
}

func (tq *TaskQueue) Start(ctx context.Context) {
    for {
        select {
        case task := <-tq.queue:
            tq.processSnapshot(ctx, task)
        case <-ctx.Done():
            return
        }
    }
}

func (tq *TaskQueue) processSnapshot(ctx context.Context, task *SnapshotTask) {
    // 1. 从 store 查询快照时段数据
    // 2. 写入 MongoDB 快照块（分块、压缩）
    // 3. 计算评分
    // 4. 更新快照状态
    // 5. 通过 WebSocket Hub 推送状态变化
}
```

**WebSocket 状态推送**:
```go
hub.Broadcast(&ws.Message{
    Type: "snapshot_status",
    Topic: fmt.Sprintf("snapshot/%s/status", snapshotId),
    Data: map[string]interface{}{
        "status": "ready",
        "score": score,
    },
    Timestamp: time.Now().Unix(),
})
```

**前端订阅** (useSnapshot hook):
```typescript
useEffect(() => {
  wsClient.on(`snapshot/${snapshotId}/status`, (data) => {
    // 更新本地状态
    queryClient.invalidateQueries({ queryKey: ['snapshot', snapshotId] });
  });
}, [snapshotId]);
```

---

### 工作项 P1-2：快照列表筛选 (1 天)

**后端** (internal/handler/api_handler.go):
```go
func (h *Handler) ListSnapshots(w http.ResponseWriter, r *http.Request) {
    // 解析查询参数
    tapId := r.URL.Query().Get("tap_id")
    status := r.URL.Query().Get("status")
    startTime := r.URL.Query().Get("start_time")
    endTime := r.URL.Query().Get("end_time")
    
    // 构建 MongoDB 过滤条件
    filter := bson.M{}
    if tapId != "" {
        filter["tap_id"] = tapId
    }
    if status != "" {
        filter["status"] = status
    }
    if startTime != "" && endTime != "" {
        filter["created_at"] = bson.M{
            "$gte": parseTime(startTime),
            "$lte": parseTime(endTime),
        }
    }
    
    // 查询
    snapshots, err := h.snapshotService.ListSnapshots(r.Context(), filter)
    
    writeJSON(w, http.StatusOK, map[string]interface{}{
        "code": 0,
        "data": snapshots,
    })
}
```

**前端** (use-view-api.ts Hook):
```typescript
export function useSnapshots(filters?: {
  tapId?: string;
  status?: 'creating' | 'ready' | 'failed';
  startTime?: number;
  endTime?: number;
}) {
  return useQuery({
    queryKey: ['snapshots', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.tapId) params.set('tap_id', filters.tapId);
      if (filters?.status) params.set('status', filters.status);
      if (filters?.startTime) params.set('start_time', String(filters.startTime));
      if (filters?.endTime) params.set('end_time', String(filters.endTime));
      
      return api.get(`/api/v1/snapshots?${params.toString()}`);
    },
  });
}
```

**前端 UI** (SnapshotListPage):
```typescript
const [filters, setFilters] = useState({});
const { data: snapshots } = useSnapshots(filters);

return (
  <div>
    <FilterBar onFiltersChange={setFilters} />
    <SnapshotGrid snapshots={snapshots} />
  </div>
);
```

---

### 工作项 P1-3：GET /api/v1/status 真实数据 (0.5 天)

**改造** internal/service/aggregation_service.go:
```go
type AggregationStatus struct {
    Enabled             bool
    Uptime              int64
    StoreAddr           string
    TsdbStats           map[string]interface{} // points count, etc
    LastAggregationTime map[string]int64       // per level
    MetricsCount        int
    ErrorCount          int
    LastError           string
}

func (s *AggregationService) GetStatus() *AggregationStatus {
    return &AggregationStatus{
        Enabled: s.enabled,
        Uptime: time.Now().Unix() - s.startTime.Unix(),
        StoreAddr: s.storeAddr,
        TsdbStats: s.storage.Stats(),
        LastAggregationTime: s.lastAggregationTimes,
        MetricsCount: s.metricsCollected,
        ErrorCount: s.errorCount,
        LastError: s.lastError,
    }
}
```

---

### 工作项 P1-4：ScoreRadar 雷达图完善 (1 day)

**优化** site/src/shared/components/ScoreRadar.tsx:
```typescript
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, Tooltip } from 'recharts';

export function ScoreRadar({ score }: { score: SnapshotScore }) {
  const data = score.metrics.map(m => ({
    metric: m.metricName,
    score: m.score,
  }));
  
  return (
    <RadarChart data={data} width={300} height={300}>
      <PolarGrid />
      <PolarAngleAxis dataKey="metric" />
      <Radar name="Score" dataKey="score" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
      <Tooltip />
    </RadarChart>
  );
}
```

---

### P1 阶段检查清单

```
□ 快照异步创建机制完善 + WebSocket 推送
□ 快照列表筛选（tap_id, status, 时间范围）
□ GET /api/v1/status 真实数据
□ ScoreRadar 雷达图完善
□ 本地集成测试：筛选流程、异步创建、状态推送
□ 前端 UI 微调：加载状态、错误提示、空状态
```

---

## 第三阶段：P2 优化与发布 (可并行 or 稍后)

### 工作项 P2-1：Dockerfile 和 docker-compose

**backend Dockerfile**:
```dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY . .
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -o sonar-view ./cmd/server

FROM alpine:latest
RUN apk --no-cache add ca-certificates
COPY --from=builder /app/sonar-view /usr/local/bin/
EXPOSE 8283
ENTRYPOINT ["sonar-view"]
```

**frontend Dockerfile**:
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY site/package*.json .
RUN npm ci
COPY site .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist /app/public
COPY site/server.js .
EXPOSE 8283
CMD ["node", "server.js"]
```

**docker-compose.yml**:
```yaml
version: '3.8'

services:
  sonar-view:
    build: .
    ports:
      - "8283:8283"
    environment:
      SONAR_STORE_ADDR: "sonar-store:8082"
      MONGODB_URI: "mongodb://mongo:27017"
    depends_on:
      - sonar-store
      - mongo

  sonar-store:
    image: sonar-store:latest
    ports:
      - "8082:8082"

  mongo:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db

volumes:
  mongo-data:
```

---

### 工作项 P2-2：API 文档

使用 OpenAPI spec (swagger) 或 `swagger.io` 生成文档

---

### 工作项 P2-3：单元 + 集成测试

优先覆盖关键路径：
- 聚合 → 快照创建 → 指标查询 → 评分计算

---

### 工作项 P2-4：监控和告警

使用 Prometheus metrics:
- `sonar_aggregation_failed_total` (计数)
- `sonar_store_connection_failed` (布尔)
- `sonar_mongodb_latency_ms` (直方图)

---

## 时间表

### Week 1 (本周)

| 日期 | 任务 | 预计 | 状态 |
|------|------|------|------|
| Mon | P0-1: scoring_service | 2-3 days | |
| Wed | P0-2: scoring_config_repo | 1 day | |
| Thu | P0-3: scoring API endpoints | 1 day | |
| Thu | P0-4: snapshot metrics API | 1 day | |
| Fri | P0-5: frontend scoring binding | 1 day | |
| Fri | **P0 集成测试 & 验证** | 0.5-1 day | |

**周目标**: Feature Complete, Internal Beta Ready

### Week 2 (下周)

| 日期 | 任务 | 预计 | 状态 |
|------|------|------|------|
| Mon | P1-1: async snapshot creation | 2 days | |
| Wed | P1-2: snapshot list filtering | 1 day | |
| Wed | P1-3: status endpoint real data | 0.5 day | |
| Thu | P1-4: score radar chart | 1 day | |
| Thu-Fri | **P1 集成测试 & 错误处理** | 1-2 day | |

**周目标**: Public Beta Ready

### Week 3+ (可并行或稍后)

| 任务 | 预计 | 优先级 |
|------|------|--------|
| Dockerfile / docker-compose | 0.5 day | P2 |
| API 文档 | 1 day | P2 |
| 单元 + 集成测试 | 2-3 days | P2 |
| 监控和告警 | 2-3 days | P2 |
| 性能优化 | 2-3 days | P2 |

**目标**: GA Ready (4+ weeks)

---

## 验收标准

### P0 完成标准

- [ ] 评分系统完整实现
  - [ ] `ScoringService` 所有方法可用
  - [ ] `ScoringConfigRepo` CRUD 正常
  - [ ] 7 个 API 端点返回正确数据
- [ ] 快照指标查询
  - [ ] GET /api/v1/snapshots/:id/metrics 返回指标数据
  - [ ] 快照块正确解压
- [ ] 前端评分数据绑定
  - [ ] SnapshotDetailPage 显示评分
  - [ ] 重新评分流程可用
- [ ] 本地集成测试通过
  - [ ] 快照创建 → 指标查询 → 评分 → 前端显示 全流程

### P1 完成标准

- [ ] 快照异步创建
  - [ ] 大快照创建 >5 分钟不阻塞
  - [ ] WebSocket 推送状态变化
- [ ] 快照列表筛选
  - [ ] 所有筛选条件工作正常
- [ ] 快照列表排序
  - [ ] 按时间、分数排序
- [ ] 错误处理
  - [ ] 所有 API 返回有意义的错误信息
  - [ ] 前端显示加载/错误/空状态

### GA 就绪标准

- [ ] 完整的 API 文档
- [ ] 单元测试覆盖率 >70%
- [ ] 集成测试覆盖关键路径
- [ ] Dockerfile 能正确打包
- [ ] 监控指标有效
- [ ] 用户文档和运维手册

---

## 依赖和前置条件

### 后端依赖
- ✓ `pkg/scoring` 已复用
- ✓ `pkg/mongodb` 已复用
- ✓ `pkg/aggregator` 已复用
- 需要: MongoDB 连接配置正确

### 前端依赖
- ✓ recharts 已安装
- ✓ React Query 已配置
- 需要: 后端 API 完整实现

### 本地开发环境
- [ ] MongoDB 本地运行
- [ ] sonar-store 本地运行
- [ ] sonar-view 后端和前端本地运行

---

## 风险及应对

| 风险 | 影响 | 应对 |
|------|------|------|
| 评分计算逻辑复杂 | 算法错误 | 从 pkg/scoring 复用，最小化改动 |
| 快照块解压失败 | 数据丢失 | 完整单元测试 + 错误恢复 |
| MongoDB 连接断开 | 数据无法保存 | 重试机制 + 缓存 |
| WebSocket 推送延迟 | 前端卡顿 | 增加 channel buffer |
| 大快照创建超时 | 用户等待 | 异步处理 + 进度推送 |

---

## 成功指标

- [ ] **P0 完成率**: 100% (所有 P0 工作项完成)
- [ ] **API 完整率**: 100% (31/31 端点实现或确认无需)
- [ ] **页面完整率**: 100% (所有 7 个路由可用)
- [ ] **集成测试**: 关键路径全覆盖
- [ ] **发布就绪**: Feature Complete + Internal Beta

---

*Action Plan 制定于 2026-04-14 | 预期完成日期：2026-04-28 (Feature Complete)*
