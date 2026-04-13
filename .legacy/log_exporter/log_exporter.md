# Log Exporter 项目设计文档

## 项目概述

基于Prometheus规则开发的log_exporter，使用Golang实现，目的是采样日志内容，转化为Prometheus监控指标，提供给Prometheus查询，接入Prometheus体系监控。

### 核心特性
- 完全通用，用户可自定义被监控的日志名（支持采样多个日志）
- 自定义采样规则（正则匹配）
- 自定义指标规则（如指标类型、标签值）

## 技术架构

### 工作原理
```
日志文件 → 持续监听 → 实时解析 → 更新内存指标 → Prometheus定期抓取当前状态
   ↓           ↓         ↓          ↓                    ↓
app.log    inotify    regex     counter++         GET /metrics
           监听       匹配      gauge.set()       返回当前值
```

**关键理解**：
- log_exporter需要作为**常驻进程**运行，持续监听和解析日志文件
- Prometheus抓取的是**当前累积状态**，不是触发解析
- 数据存储在**内存中**，由Prometheus SDK自动管理

## 核心问题解答

### 1. 数据存储机制
- **存储位置**：Prometheus Go SDK将指标数据存储在内存中
- **内存管理**：SDK自动处理，提供HTTP `/metrics`端点
- **持久化**：不需要手动处理，Prometheus server定期抓取

### 2. 指标类型选择

#### Counter（计数器）
- **适用场景**：错误日志计数、请求总数等只增不减的指标
- **内存特性**：固定占用，只存储累积值
- **配置示例**：
```yaml
- name: "error_logs_total"
  type: "counter"
  pattern: "ERROR"
  labels:
    level: "error"
```

#### Gauge（仪表盘）
- **适用场景**：当前连接数、最新值等可增可减的指标
- **内存特性**：固定占用，只存储当前值（会覆盖历史值）
- **配置示例**：
```yaml
- name: "current_low_fps"
  type: "gauge"
  pattern: "帧率:([0-9.]+)"
  value: "$1"
```

#### Histogram（直方图）
- **适用场景**：响应时间分布、数值分布统计
- **内存特性**：固定占用，存储预定义bucket计数
- **配置示例**：
```yaml
- name: "low_fps_distribution"
  type: "histogram"
  pattern: "帧率:([0-9.]+)"
  value: "$1"
  buckets: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
```

#### Summary（摘要）
- **适用场景**：分位数统计，如P50、P95
- **内存特性**：可能增长，需要保留样本计算分位数

### 3. 内存控制策略

#### 潜在问题
- **高基数标签**：每个唯一标签组合都是独立的时间序列
- **动态标签值**：如用户ID、请求ID等会导致无限时间序列

#### 解决方案
1. **限制标签基数**
```yaml
labels:
  method: "$1"     # 有限的HTTP方法
  status: "$2"     # 有限的状态码
max_cardinality: 1000
```

2. **标签值映射**
```go
func mapStatusCode(code string) string {
    switch {
    case strings.HasPrefix(code, "2"): return "2xx"
    case strings.HasPrefix(code, "4"): return "4xx"
    case strings.HasPrefix(code, "5"): return "5xx"
    default: return "other"
    }
}
```

3. **定期清理和监控**
```yaml
memory_management:
  max_memory_mb: 512
  cleanup_interval: "1h"
  max_metrics_per_type: 10000
```

## 配置设计

### 通用化配置结构
```yaml
global:
  scrape_interval: 15s
  metrics_port: 9090

log_config:
  - name: "nginx_access"
    file_path: "/var/log/nginx/access.log"
    file_pattern: "*.log"
    encoding: "utf-8"
    
    metrics:
      - name: "nginx_requests_total"
        type: "counter"
        help: "Total nginx requests"
        pattern: '^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) \S+" (\d+) (\d+)'
        labels:
          method: "$3"
          status: "$5"
          
      - name: "nginx_response_size_bytes"
        type: "histogram"
        help: "Response size distribution"
        pattern: '^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) \S+" (\d+) (\d+)'
        value: "$6"
        buckets: [100, 1000, 10000, 100000]
```

### 高级配置
```yaml
performance:
  buffer_size: 1024
  batch_size: 100
  max_goroutines: 10
  
sampling:
  frequency: "1s"
  max_lines_per_sec: 1000
  
reliability:
  checkpoint_file: "/tmp/log_exporter.checkpoint"
  retry_interval: "5s"
  max_retries: 3
```

## 标签设计原则

### 1. 标签跟着指标定义
```go
// 创建指标时定义标签名
var httpRequestsTotal = prometheus.NewCounterVec(
    prometheus.CounterOpts{
        Name: "http_requests_total",
        Help: "Total number of HTTP requests",
    },
    []string{"method", "status", "path"}, // 定义标签名
)

// 使用时提供标签值
httpRequestsTotal.WithLabelValues("GET", "200", "/api/users").Inc()
```

### 2. 低基数原则
```yaml
# 好的设计 - 低基数
labels:
  method: "$1"        # GET, POST, PUT, DELETE (4个值)
  status_class: "$2"  # 2xx, 4xx, 5xx (3个值)
  service: "nginx"    # 固定值 (1个值)
# 总基数 = 4 × 3 × 1 = 12 个时间序列

# 避免的设计 - 高基数
labels:
  user_id: "$1"       # 可能有百万个用户
  request_id: "$2"    # 每个请求都不同
```

### 3. 标签命名规范
```yaml
labels:
  # 推荐命名
  http_method: "$1"      # 清晰描述
  status_code: "$2"      # 标准术语
  service_name: "api"    # 有意义的名称
  
  # 避免命名
  m: "$1"               # 太简短
  temp_var: "$2"        # 无意义
```

## 特殊场景处理

### 事件驱动型指标（如低帧率）
对于不规律的日志输出，推荐组合策略：

```yaml
metrics:
  # 1. 基础计数 - 内存固定
  - name: "low_fps_events_total"
    type: "counter"
    pattern: "低帧率检测.*帧率:([0-9.]+)"
    
  # 2. 分布统计 - 内存固定，信息丰富
  - name: "low_fps_distribution"
    type: "histogram"
    pattern: "低帧率检测.*帧率:([0-9.]+)"
    value: "$1"
    buckets: [5, 10, 15, 20, 25, 30]
    
  # 3. 最新值 - 便于实时监控
  - name: "last_low_fps_value"
    type: "gauge"
    pattern: "低帧率检测.*帧率:([0-9.]+)"
    value: "$1"
    
  # 4. 严重程度分类 - 便于告警
  - name: "low_fps_by_severity_total"
    type: "counter"
    pattern: "低帧率检测.*帧率:([0-9.]+)"
    labels:
      severity: |
        if $1 < 10: "critical"
        elif $1 < 20: "warning"
        else: "minor"
```

## 项目架构建议

```
log_exporter/
├── cmd/
│   └── log_exporter/
│       └── main.go
├── pkg/
│   ├── config/          # 配置解析
│   ├── collector/       # 日志收集器
│   ├── parser/          # 日志解析器
│   ├── metrics/         # 指标管理
│   └── watcher/         # 文件监听
├── config/
│   └── example.yaml
└── README.md
```

## 历史数据存储方案

对于需要保存每个历史值的场景，推荐混合架构：

1. **Prometheus** - 实时监控、告警、Dashboard
2. **外部数据库**（InfluxDB/SQLite/PostgreSQL）- 存储所有原始历史数据
3. **HTTP API** - 提供历史数据查询接口

```yaml
outputs:
  # Prometheus用于实时监控
  prometheus:
    enabled: true
    
  # 数据库用于历史数据
  database:
    type: "sqlite"
    file: "/data/fps_history.db"
    
  # 文件备份
  file:
    path: "/logs/raw_data.log"
    format: "jsonlines"
```

## 总结

Log Exporter项目的核心是：
1. **持续监听**日志文件变化
2. **实时解析**并更新内存中的Prometheus指标
3. **合理设计**标签结构避免内存爆炸
4. **灵活配置**支持不同项目的监控需求
5. **混合存储**满足实时监控和历史查询的双重需要

通过Prometheus SDK的标准指标类型，可以满足大部分日志监控场景。对于特殊的历史数据需求，可以结合外部存储系统实现完整的解决方案。
