# 🎯 Monitor Hub 级联聚合最终方案

## 📐 整体架构

```
┌─────────────────┐
│  Pushgateway    │ (原始TSDB, 15s保留)
└────────┬────────┘
         │ Pull (15s 间隔)
         ↓
┌─────────────────┐
│  采集触发器      │ (每15s执行一次)
└────────┬────────┘
         │
         ↓
┌─────────────────────────────────────────┐
│  级联聚合管理器 (单协程)                  │
│  ┌─────────────────────────────────┐   │
│  │ 1. 采集 → 聚合15s → 写入TSDB     │   │
│  │ 2. 检查时间边界 → 触发级联聚合    │   │
│  │    - 30s (from 15s × 2)         │   │
│  │    - 1m  (from 30s × 2)         │   │
│  │    - 5m  (from 1m × 5)          │   │
│  │    - 1h  (from 5m × 12)         │   │
│  │    - 6h  (from 1h × 6)          │   │
│  │    - 1d  (from 6h × 4)          │   │
│  │    - 30d (from 1d × 30)         │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
         ↓
┌─────────────────┐
│  TSDB 存储       │ (VictoriaMetrics / Prometheus)
│  (仅聚合数据)    │
└─────────────────┘
         ↓
┌─────────────────┐
│  前端查询/展示   │
└─────────────────┘
```

---

## 📊 级联聚合配置

### **配置文件示例**

```yaml
# config/aggregation.yaml
aggregation:
  # 启用级联聚合
  enabled: true
  
  # 级联配置
  levels:
    # 最小级别：从 Pushgateway 采集原始数据
    - name: "15s"
      interval: 15s
      retention: 15m
      source: "raw"                    # 特殊标记：从原始源采集
      min_points: 1                    # 至少1个点
      fallback_mode: "skip"            # 缺失时跳过
      description: "原始采集数据"
      
    # 30秒级别
    - name: "30s"
      interval: 30s
      retention: 30m
      source: "15s"                    # 从15s级别聚合
      min_points: 2                    # 至少2个点
      fallback_mode: "single"          # 允许单点（服务重启场景）
      description: "30秒聚合"
      
    # 1分钟级别
    - name: "1m"
      interval: 1m
      retention: 1h
      source: "30s"
      min_points: 2
      fallback_mode: "partial"         # 允许部分聚合(>=50%)
      description: "1分钟聚合"
      
    # 5分钟级别
    - name: "5m"
      interval: 5m
      retention: 6h
      source: "1m"
      min_points: 5
      fallback_mode: "partial"
      description: "5分钟聚合"
      
    # 1小时级别
    - name: "1h"
      interval: 1h
      retention: 7d
      source: "5m"
      min_points: 12
      fallback_mode: "skip"            # 长期数据要求完整
      description: "1小时聚合"
      
    # 6小时级别
    - name: "6h"
      interval: 6h
      retention: 30d
      source: "1h"
      min_points: 6
      fallback_mode: "skip"
      description: "6小时聚合"
      
    # 1天级别
    - name: "1d"
      interval: 24h
      retention: 90d
      source: "6h"
      min_points: 4
      fallback_mode: "skip"
      description: "1天聚合"

# 降级模式说明
# - skip: 跳过聚合，不写入数据（保证质量）
# - single: 允许单点聚合（保证连续性）
# - partial: 允许部分聚合，点数>=min_points/2（平衡）
```

---

## 🗄️ 数据结构设计

### **1. TSDB 存储结构**

```go
// pkg/aggregator/tsdb/types.go

// AggregatedPoint 聚合后的数据点
type AggregatedPoint struct {
    // ===== 指标标识 =====
    Name      string            `json:"name"`       // 指标名称
    Labels    map[string]string `json:"labels"`     // 标签集合
    
    // ===== 时间和级别 =====
    Level     string            `json:"level"`      // 聚合级别: 15s/30s/1m/5m/1h/6h/1d
    Timestamp time.Time         `json:"timestamp"`  // 时间戳（对齐到级别边界）
    
    // ===== 统计值 =====
    Stats     ValueStats        `json:"stats"`
    
    // ===== 质量标记 =====
    Quality   DataQuality       `json:"quality"`
}

// ValueStats 统计值
type ValueStats struct {
    Avg   float64 `json:"avg"`    // 平均值
    Min   float64 `json:"min"`    // 最小值
    Max   float64 `json:"max"`    // 最大值
    Sum   float64 `json:"sum"`    // 总和
    Last  float64 `json:"last"`   // 最后一个值
    P50   float64 `json:"p50"`    // 中位数（可选）
    P95   float64 `json:"p95"`    // 95分位（可选）
    P99   float64 `json:"p99"`    // 99分位（可选）
}

// DataQuality 数据质量标记
type DataQuality struct {
    // 实际采样点数
    ActualPoints int `json:"actual_points"`
    
    // 期望采样点数
    ExpectedPoints int `json:"expected_points"`
    
    // 质量分数 (0-100)
    // 100: 完整数据
    // 50-99: 部分数据
    // 1-49: 数据严重缺失
    // 0: 无数据
    Score float64 `json:"score"`
    
    // 状态标记
    Status DataStatus `json:"status"`
    
    // 缺失原因（可选）
    MissingReason string `json:"missing_reason,omitempty"`
}

// DataStatus 数据状态
type DataStatus string

const (
    DataStatusComplete  DataStatus = "complete"   // 完整数据
    DataStatusPartial   DataStatus = "partial"    // 部分数据
    DataStatusDegraded  DataStatus = "degraded"   // 降级数据（单点聚合）
    DataStatusMissing   DataStatus = "missing"    // 数据缺失
)
```

### **2. 存储示例（JSON表示）**

```json
{
  "name": "cpu_use_percent",
  "labels": {
    "datasource_id": "ds-001",
    "ip": "192.168.1.1",
    "zone": "cn-south"
  },
  "level": "1m",
  "timestamp": "2025-11-11T15:01:00Z",
  "stats": {
    "avg": 45.2,
    "min": 40.1,
    "max": 52.3,
    "sum": 90.4,
    "last": 48.5
  },
  "quality": {
    "actual_points": 1,
    "expected_points": 2,
    "score": 50.0,
    "status": "degraded",
    "missing_reason": "Service restart at 15:00:30"
  }
}
```

---

## 🔧 核心算法

### **1. 聚合触发逻辑**

```go
// pkg/aggregator/manager.go

// RunOnce 执行一次聚合检查（每15s调用）
func (m *Manager) RunOnce(ctx context.Context, now time.Time) error {
    // 1️⃣ 始终执行最小级别的聚合（15s）
    firstLevel := m.config.Levels[0]
    if err := m.aggregateLevel(ctx, firstLevel, now); err != nil {
        logger.Error("Failed to aggregate %s: %v", firstLevel.Name, err)
    }
    
    // 2️⃣ 遍历其他级别，检查时间边界
    for i := 1; i < len(m.config.Levels); i++ {
        level := m.config.Levels[i]
        
        // 🔑 检查是否到达该级别的时间边界
        if m.isTimeBoundary(level, now) {
            logger.Info("Time boundary reached for level %s at %s", 
                       level.Name, now.Format(time.RFC3339))
            
            if err := m.aggregateLevel(ctx, level, now); err != nil {
                logger.Error("Failed to aggregate %s: %v", level.Name, err)
                // 继续执行其他级别
            }
        }
    }
    
    return nil
}

// isTimeBoundary 检查是否到达时间边界
func (m *Manager) isTimeBoundary(level AggregationLevel, now time.Time) bool {
    aligned := now.Truncate(level.Interval)
    return now.Equal(aligned) || now.Sub(aligned) < m.minInterval
}
```

### **2. 级联聚合核心逻辑**

```go
// aggregateLevel 执行单个级别的聚合
func (m *Manager) aggregateLevel(ctx context.Context, level AggregationLevel, now time.Time) error {
    // 1️⃣ 对齐到时间边界
    timestamp := now.Truncate(level.Interval)
    
    // 2️⃣ 判断数据来源
    if level.Source == "raw" {
        // 从 Pushgateway 采集原始数据
        return m.collectAndAggregate(ctx, level, timestamp)
    }
    
    // 3️⃣ 计算查询时间范围
    endTime := timestamp
    startTime := timestamp.Add(-level.Interval)
    
    logger.Debug("Aggregating %s: query %s from [%s, %s)",
        level.Name, level.Source, startTime, endTime)
    
    // 4️⃣ 从 TSDB 查询源级别数据
    sourcePoints, err := m.tsdb.Query(ctx, level.Source, startTime, endTime, nil)
    if err != nil {
        return fmt.Errorf("query failed: %w", err)
    }
    
    actualCount := len(sourcePoints)
    expectedCount := level.MinPoints
    
    // 5️⃣ 检查数据点数量 + 降级处理
    quality := m.evaluateDataQuality(actualCount, expectedCount, level.FallbackMode)
    
    if quality.Status == DataStatusMissing {
        logger.Warn("Skipping %s at %s: insufficient data (got %d, need %d)",
            level.Name, timestamp, actualCount, expectedCount)
        return nil
    }
    
    // 6️⃣ 聚合数据
    aggregated := m.aggregate(sourcePoints, level.Name, timestamp, quality)
    
    // 7️⃣ 写入 TSDB
    if err := m.tsdb.Write(ctx, aggregated); err != nil {
        return fmt.Errorf("write failed: %w", err)
    }
    
    logger.Info("Aggregated %d points to %s at %s (quality: %s, score: %.1f)",
        len(aggregated), level.Name, timestamp, quality.Status, quality.Score)
    
    return nil
}
```

### **3. 数据质量评估**

```go
// evaluateDataQuality 评估数据质量
func (m *Manager) evaluateDataQuality(actual, expected int, mode FallbackMode) DataQuality {
    quality := DataQuality{
        ActualPoints:   actual,
        ExpectedPoints: expected,
    }
    
    // 计算质量分数
    if actual >= expected {
        quality.Score = 100.0
        quality.Status = DataStatusComplete
        return quality
    }
    
    // 数据不足，根据降级模式判断
    switch mode {
    case FallbackSkip:
        // 不允许降级，标记为缺失
        quality.Score = 0.0
        quality.Status = DataStatusMissing
        quality.MissingReason = fmt.Sprintf("Insufficient data: got %d, need %d", actual, expected)
        
    case FallbackSingle:
        // 允许单点聚合
        if actual >= 1 {
            quality.Score = float64(actual) / float64(expected) * 100
            quality.Status = DataStatusDegraded
            quality.MissingReason = "Single-point aggregation (service restart)"
        } else {
            quality.Score = 0.0
            quality.Status = DataStatusMissing
        }
        
    case FallbackPartial:
        // 允许部分聚合（>=50%）
        minPartial := expected / 2
        if actual >= minPartial {
            quality.Score = float64(actual) / float64(expected) * 100
            quality.Status = DataStatusPartial
            quality.MissingReason = fmt.Sprintf("Partial data: %d/%d points", actual, expected)
        } else {
            quality.Score = 0.0
            quality.Status = DataStatusMissing
            quality.MissingReason = fmt.Sprintf("Too few points: got %d, need at least %d", actual, minPartial)
        }
    }
    
    return quality
}
```

---

## 🎨 前端展示方案

### **1. API 响应格式**

```typescript
// 查询指标数据 API
interface MetricsQueryRequest {
  datasource_id: string
  metric_name: string
  labels?: Record<string, string>
  level: string              // 15s/30s/1m/5m/1h/6h/1d
  start_time: number
  end_time: number
}

interface MetricsQueryResponse {
  code: number
  message: string
  data: {
    metric_name: string
    labels: Record<string, string>
    level: string
    points: DataPoint[]
  }
}

interface DataPoint {
  timestamp: number          // Unix时间戳（秒）
  stats: {
    avg: number
    min: number
    max: number
    last: number
  }
  quality: {
    actual_points: number
    expected_points: number
    score: number            // 0-100
    status: 'complete' | 'partial' | 'degraded' | 'missing'
    missing_reason?: string
  }
}
```

### **2. 图表渲染示例**

```typescript
// site/src/components/metrics-chart.tsx

interface MetricsChartProps {
  data: DataPoint[]
  metric_name: string
}

function MetricsChart({ data, metric_name }: MetricsChartProps) {
  // 根据数据质量分类
  const chartData = data.map(point => ({
    x: point.timestamp * 1000,
    y: point.stats.avg,
    quality: point.quality.score,
    status: point.quality.status,
  }))
  
  return (
    <LineChart data={chartData}>
      {/* 完整数据：实线 */}
      <Line
        data={chartData.filter(p => p.status === 'complete')}
        stroke="#10b981"
        strokeWidth={2}
      />
      
      {/* 部分数据：虚线 */}
      <Line
        data={chartData.filter(p => p.status === 'partial')}
        stroke="#f59e0b"
        strokeWidth={2}
        strokeDasharray="5,5"
      />
      
      {/* 降级数据：点线 */}
      <Line
        data={chartData.filter(p => p.status === 'degraded')}
        stroke="#ef4444"
        strokeWidth={1}
        strokeDasharray="2,2"
      />
      
      {/* Tooltip 显示质量信息 */}
      <Tooltip
        content={({ payload }) => {
          if (!payload?.[0]) return null
          const point = payload[0].payload
          return (
            <div className="bg-white p-2 border rounded shadow">
              <div>值: {point.y.toFixed(2)}</div>
              <div>质量: {point.quality.toFixed(0)}%</div>
              <div>状态: {point.status}</div>
            </div>
          )
        }}
      />
    </LineChart>
  )
}
```

### **3. 质量标识图例**

```tsx
function QualityLegend() {
  return (
    <div className="flex gap-4 text-sm">
      <div className="flex items-center gap-2">
        <div className="w-8 h-0.5 bg-green-500"></div>
        <span>完整数据 (100%)</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-8 h-0.5 bg-yellow-500 border-dashed"></div>
        <span>部分数据 (50-99%)</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-8 h-0.5 bg-red-500 border-dotted"></div>
        <span>降级数据 (&lt;50%)</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-8 h-2 bg-gray-200"></div>
        <span>数据缺失</span>
      </div>
    </div>
  )
}
```

---

## 📦 包结构

```
pkg/aggregator/
├── config.go              # 配置定义和加载
├── manager.go             # 聚合管理器
├── aggregator.go          # 聚合算法实现
├── quality.go             # 数据质量评估
├── trigger.go             # 触发器（可选，manager内部有定时器）
├── collector.go           # 数据采集器接口
└── tsdb/
    ├── types.go           # 数据结构定义
    ├── interface.go       # TSDB 接口
    ├── prometheus.go      # Prometheus TSDB 实现
    ├── victoriametrics.go # VictoriaMetrics 实现
    └── memory.go          # 内存TSDB（测试用）
```

---

## ✅ 方案总结

### **核心特性**：

1. ✅ **级联聚合**：15s → 30s → 1m → 5m → 1h → 6h → 1d
2. ✅ **单触发器**：避免协程爆炸，统一时间管理
3. ✅ **时间边界触发**：严格按真实时间触发
4. ✅ **质量标记**：记录数据完整性和缺失原因
5. ✅ **降级策略**：可配置（skip/single/partial）
6. ✅ **前端可视化**：不同样式标识数据质量
7. ✅ **灵活配置**：YAML 配置所有级别和策略

### **数据丢失处理**：

| 场景 | 处理策略 | 数据状态 | 前端展示 |
|------|---------|---------|---------|
| 服务重启丢失1个点 | FallbackSingle | degraded | 红色点线 + 提示 |
| 部分数据缺失(>=50%) | FallbackPartial | partial | 黄色虚线 + 质量分数 |
| 数据严重缺失(<50%) | FallbackSkip | missing | 空白 + 缺失标记 |
| 完整数据 | - | complete | 绿色实线 |

---