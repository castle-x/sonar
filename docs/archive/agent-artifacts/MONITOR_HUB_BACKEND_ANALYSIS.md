# Monitor_Hub 后端链路深度分析报告

**分析人员**: analyst-1  
**完成日期**: 2026-04-14  
**分析范围**: `.legacy/monitor_hub` 后端聚合引擎、TSDB 查询、数据压缩实现

---

## 目录

1. [聚合标签结构定义](#1-聚合标签结构定义)
2. [QueryPoints 后端实现](#2-querypoints-后端实现)
3. [数据压缩格式（PointsResponse）](#3-数据压缩格式pointsresponse)
4. [Datasource MongoDB 数据结构](#4-datasource-mongodb-数据结构)
5. [聚合触发时机与级联机制](#5-聚合触发时机与级联机制)
6. [Sonar-View 实现对标](#6-sonar-view-实现对标)

---

## 1. 聚合标签结构定义

### 1.1 内部标签常量（AggregatedInternalLabel）

**文件**: `pkg/aggregator/types.go`

```go
type AggregatedInternalLabel string

const (
    AggregatedInternalLabelName             AggregatedInternalLabel = "__name__"
    AggregatedInternalLabelAggregationLevel AggregatedInternalLabel = "__aggregation_level__"
    AggregatedInternalLabelDataStatus       AggregatedInternalLabel = "__data_status__"
    AggregatedInternalLabelDataScore        AggregatedInternalLabel = "__data_score__"
    AggregatedInternalLabelStatisticSuffix  AggregatedInternalLabel = "__statistic_suffix__"
    AggregatedInternalLabelDatasourceId     AggregatedInternalLabel = "__datasource_id__"
)
```

### 1.2 标签用途说明

| 标签名 | 用途 | 示例值 | 位置 |
|--------|------|--------|------|
| `__aggregation_level__` | 聚合级别分类 | `"15s"`, `"1m"`, `"1h"` | TSDB 标签，用于 QueryByLabels 过滤 |
| `__statistic_suffix__` | 聚合类型（aggregation_type） | `"avg"`, `"min"`, `"max"`, `"count"`, `"last"` | TSDB 标签，每个指标产生 5 个值 |
| `__datasource_id__` | 数据源标识 | `"abc123"` | TSDB 标签，QueryByLabels 必填过滤条件 |
| `__data_status__` | 数据状态质量标记 | `"complete"`, `"partial"`, `"degraded"`, `"missing"` | 存储在 AggregatedPoint.Quality.Status |
| `__data_score__` | 数据质量分数 | `100.0`, `75.5` | 存储在 AggregatedPoint.Quality.Score |
| `__name__` | 指标名称 | `"cpu_usage"` | Prometheus 标准标签 |

### 1.3 聚合类型索引（AggregationType.Index()）

**文件**: `pkg/aggregator/types.go`

```go
type AggregationType string

func (a AggregationType) Index() int {
    switch a {
    case AggregationTypeAvg:
        return 0
    case AggregationTypeMin:
        return 1
    case AggregationTypeMax:
        return 2
    case AggregationTypeCount:
        return 3
    case AggregationTypeLast:
        return 4
    default:
        return 0
    }
}

const (
    AggregationTypeAvg   AggregationType = "avg"
    AggregationTypeMin   AggregationType = "min"
    AggregationTypeMax   AggregationType = "max"
    AggregationTypeCount AggregationType = "count"
    AggregationTypeLast  AggregationType = "last"
)

var AggregationTypeList = []AggregationType{
    AggregationTypeAvg,      // 索引 0
    AggregationTypeMin,      // 索引 1
    AggregationTypeMax,      // 索引 2
    AggregationTypeCount,    // 索引 3
    AggregationTypeLast,     // 索引 4
}
```

### 1.4 聚合完成后的标签写入

**文件**: `pkg/aggregator/aggregator.go` (aggregateGroup & aggregateRawGroup)

**关键代码**：

```go
return AggregatedPoint{
    DatasourceId:    datasourceId,
    Name:            first.Name,
    Labels:          first.Labels,  // 保留原有业务标签
    Level:           level,          // 对应的 __aggregation_level__
    Timestamp:       UnixMilliTime(timestamp),
    Date:            timestamp.Format(time.DateTime),
    Quality:         quality,  // 包含 status/score
    AggregationType: aggregationType,  // 对应的 __statistic_suffix__
    Value:           value,
}
```

**TSDB 写入时的标签构造**：由 `storage.Serializer[AggregatedPoint]` 负责将以上字段转换为 Prometheus Labels：

- `first.Labels` 的所有原业务标签被保留
- `__datasource_id__` = `datasourceId`
- `__aggregation_level__` = `level`
- `__statistic_suffix__` = `aggregationType.String()`（"avg", "min" 等）
- `__data_status__` = `quality.Status.String()`
- `__data_score__` = fmt.Sprintf("%.1f", quality.Score)

---

## 2. QueryPoints 后端实现

### 2.1 QueryPoints 路由和请求响应

**文件**: `biz/points/v1/handler.go`

**路由**:
```go
// @route /apis/v1/points/query [POST]
func (s *PointsHandler) QueryPoints(ctx context.Context, req *v1.QueryPointsRequest) *baseV1.Response
```

**请求参数** (QueryPointsRequest):
```thrift
// 典型请求示例
{
    "datasource_id": "abc123",
    "levels": ["15s", "1m"],
    "aggregation_types": ["avg", "max"],
    "start_time": 1713052800000,  // Unix 毫秒
    "end_time": 1713139200000,
    "filters": [
        {
            "name": "cpu_usage",
            "labels": ["instance", "server1"]
        }
    ],
    "limit": 1000
}
```

**响应格式**:
```json
{
    "p": {
        "k": ["cpu_usage", "{instance=\"server1\"}", "memory_usage", "{instance=\"server1\"}"],
        "v": [
            [
                [{"t": 1713052815000, "v": 45.2}, {"t": 1713052830000, "v": 46.1}],  // avg
                [{"t": 1713052815000, "v": 42.1}, {"t": 1713052830000, "v": 44.5}],  // min
                [{"t": 1713052815000, "v": 48.3}, {"t": 1713052830000, "v": 48.9}],  // max
                [{"t": 1713052815000, "v": 15}, {"t": 1713052830000, "v": 15}],     // count
                [{"t": 1713052815000, "v": 46.1}, {"t": 1713052830000, "v": 46.1}]  // last
            ],
            [
                [{"t": 1713052815000, "v": 2048}, ...],  // 另一个指标的 avg
                ...  // 其他聚合类型
            ]
        ]
    },
    "t": [
        {
            "name": "Performance Summary",
            "labels": ["instance"],
            "metrics": [
                {
                    "name": "cpu_usage",
                    "aggregations": [
                        {"type": "avg", "label": "Avg CPU"},
                        {"type": "max", "label": "Max CPU"}
                    ]
                }
            ]
        }
    ]
}
```

### 2.2 buildTsdbQueryList 完整实现

**文件**: `biz/points/v1/handler.go`

**完整代码**：

```go
func buildTsdbQueryList(req *v1.QueryPointsRequest, rawLevel string) []storage.LabelQuery {
    queryList := make([]storage.LabelQuery, 0)
    
    // ========== Step 1: 确定聚合类型和级别 ==========
    aggTypes := req.GetAggregationTypes()
    if len(aggTypes) == 0 {
        // 默认查询全部聚合类型
        aggTypes = pkgaggregator.AggregationTypeStringList
    }
    
    levels := req.GetLevels()
    if len(levels) == 0 {
        // 默认查询原始级别
        levels = []string{rawLevel}
    }
    
    // ========== Step 2: 按级别构建基础查询 ==========
    for _, level := range levels {
        globReq := &storage.LabelQuery{}
        
        // 构建全局标签：datasource_id 和 aggregation_level
        builder := labels.NewBuilder(labels.EmptyLabels())
        builder.Set(
            string(pkgaggregator.AggregatedInternalLabelDatasourceId),
            req.DatasourceID,
        )
        builder.Set(
            string(pkgaggregator.AggregatedInternalLabelAggregationLevel),
            level,
        )
        
        // ========== Step 3: 设置时间范围 ==========
        if req.IsSetStartTime() {
            globReq.StartTime = req.GetStartTime()
        }
        if req.IsSetEndTime() {
            globReq.EndTime = req.GetEndTime()
        }
        
        // ========== Step 4: 设置查询限制 ==========
        if req.IsSetLimit() {
            globReq.Limit = int(req.GetLimit())
        }
        
        // ========== Step 5: 按聚合类型扩展 ==========
        for _, aggType := range aggTypes {
            builder.Set(
                string(pkgaggregator.AggregatedInternalLabelStatisticSuffix),
                aggType,
            )
            
            // ========== Step 6: 按过滤器扩展 ==========
            if !req.IsSetFilters() {
                // 无过滤器，直接添加查询
                copyReq := *globReq
                copyReq.Labels = builder.Labels()
                queryList = append(queryList, copyReq)
                continue
            }
            
            // 有过滤器，按每个过滤器创建一个查询
            for _, filter := range req.GetFilters() {
                copyBuilder := labels.NewBuilder(builder.Labels())
                copyReq := *globReq
                
                // 设置指标名称（MetricName）
                if filter.IsSetName() {
                    copyReq.MetricName = filter.GetName()
                }
                
                // 设置额外标签过滤
                if filter.IsSetLabels() {
                    labelList := filter.GetLabels()
                    // labelList 格式: ["key1", "value1", "key2", "value2", ...]
                    if len(labelList)%2 != 0 {
                        logger.Error("labelList count is not even, %v", labelList)
                        continue
                    }
                    for i := 0; i < len(labelList); i += 2 {
                        copyBuilder.Set(labelList[i], labelList[i+1])
                    }
                }
                
                copyReq.Labels = copyBuilder.Labels()
                queryList = append(queryList, copyReq)
            }
        }
    }
    
    return queryList
}
```

### 2.3 TSDB 查询流程

**文件**: `biz/points/v1/handler.go` (QueryPoints 方法)

**关键步骤**:

```go
func (s *PointsHandler) QueryPoints(ctx context.Context, req *v1.QueryPointsRequest) *baseV1.Response {
    resp := struct {
        Tables []*dataprocess.SummaryTable `json:"t"`
        Points *dataprocess.PointsResponse `json:"p"`
    }{}
    
    // ========== Step 1: 验证参数 ==========
    if req.DatasourceID == "" {
        return baseV1.Failed(fmt.Errorf("datasource_id is required"), ...)
    }
    if len(req.Levels) == 0 {
        return baseV1.Failed(fmt.Errorf("levels is required"), ...)
    }
    
    // ========== Step 2: 查询数据源配置 ==========
    ds, err := s.datasourceRepo.GetDatasource(ctx, req.DatasourceID)
    if err != nil {
        return baseV1.Failed(err, ...)
    }
    
    // ========== Step 3: 构建 TSDB 查询列表 ==========
    startTime := time.Now()
    var allPoints []pkgaggregator.AggregatedPoint
    queryList := buildTsdbQueryList(req, s.cfg.Aggregation.Levels[0].Interval)
    
    // ========== Step 4: 执行多个查询 ==========
    for _, query := range queryList {
        points, err := s.tsdb.QueryByLabels(ctx, &query)
        if err != nil {
            logger.Error("QueryPoints: query by labels error: %v, query: %v", err, query)
            continue
        }
        allPoints = append(allPoints, points...)
    }
    logger.Info("QueryPoints: query time: %v ms", time.Since(startTime).Milliseconds())
    
    // ========== Step 5: 压缩数据 ==========
    compressedData := dataprocess.BuildCompressedData(allPoints)
    resp.Points = compressedData
    
    // ========== Step 6: 生成汇总表格（可选） ==========
    if len(ds.Resource.GetSummaryConfig()) == 0 {
        return baseV1.Success(baseV1.WithData(resp))
    }
    
    metricConfigMap := dataprocess.BuildMetricConfigMap(ds.Resource.GetGroupmap())
    resp.Tables = dataprocess.GenerateMultipleTables(compressedData, ds.Resource.GetSummaryConfig(), metricConfigMap)
    
    return baseV1.Success(baseV1.WithData(resp))
}
```

### 2.4 Label Matchers 详细说明

| Matcher | 值 | 作用 | 必填 |
|---------|-----|------|------|
| `__datasource_id__` | 请求中的 `datasource_id` | 选择数据源分片 | ✅ 必填 |
| `__aggregation_level__` | 请求中的 `levels` (可多个) | 选择聚合级别 | ✅ 必填 |
| `__statistic_suffix__` | 请求中的 `aggregation_types` (可多个) | 选择聚合类型 | ❌ 默认全部 |
| `__name__` | 指标名称（来自 filter.name） | 过滤指标名称 | ❌ 可选 |
| 业务标签（如 `instance`, `job`） | filter.labels 中的值 | 过滤业务维度 | ❌ 可选 |

---

## 3. 数据压缩格式（PointsResponse）

### 3.1 PointsResponse 结构定义

**文件**: `pkg/dataprocess/pointsformat.go`

```go
type RawData struct {
    T int64   `json:"t"` // 时间戳(Unix 毫秒)
    V float64 `json:"v"` // 值
}

type PointsResponse struct {
    // K: 指标名+标签字符串列表（关键唯一性标识）
    // 格式: [name1, labels1, name2, labels2, ...]
    // 每两个元素代表一个指标: name 和 labels
    K []string `json:"k"`
    
    // V: k 索引对应的一组 t+v 数据
    // 格式: [metric_index][agg_type_index][time_points]
    // metric_index: K 的索引 / 2
    // agg_type_index: 聚合类型索引 (avg=0, min=1, max=2, count=3, last=4)
    // time_points: 时间序列数据点列表
    V [][][]RawData `json:"v"`
}
```

### 3.2 数据组织逻辑

**示例**：假设查询返回两个指标 cpu_usage 和 memory_usage，各有 2 个时间点

```
输入（原始 AggregatedPoint 列表）:
- cpu_usage{instance=server1} avg, t=1000, v=45.2
- cpu_usage{instance=server1} min, t=1000, v=42.1
- cpu_usage{instance=server1} max, t=1000, v=48.3
- cpu_usage{instance=server1} count, t=1000, v=15
- cpu_usage{instance=server1} last, t=1000, v=46.1
- cpu_usage{instance=server1} avg, t=2000, v=46.1
- ... (其他点)
- memory_usage{instance=server1} avg, t=1000, v=2048
- ... (其他点)

压缩后（PointsResponse）:
K = [
    "cpu_usage", "{instance=\"server1\"}",      // 指标 0
    "memory_usage", "{instance=\"server1\"}"    // 指标 1
]

V = [
    [  // 指标 0: cpu_usage{instance=server1}
        [  // 聚合类型 0: avg
            {"t": 1000, "v": 45.2},
            {"t": 2000, "v": 46.1}
        ],
        [  // 聚合类型 1: min
            {"t": 1000, "v": 42.1}
        ],
        [  // 聚合类型 2: max
            {"t": 1000, "v": 48.3}
        ],
        [  // 聚合类型 3: count
            {"t": 1000, "v": 15}
        ],
        [  // 聚合类型 4: last
            {"t": 1000, "v": 46.1}
        ]
    ],
    [  // 指标 1: memory_usage{instance=server1}
        [  // 聚合类型 0: avg
            {"t": 1000, "v": 2048}
        ],
        [...],  // 其他聚合类型
        [...],
        [...],
        [...]
    ]
]
```

### 3.3 BuildCompressedData 完整实现

**文件**: `pkg/dataprocess/pointsformat.go`

```go
func BuildCompressedData(points []pkgaggregator.AggregatedPoint) *PointsResponse {
    startTime := time.Now()
    uniqueLabels := make(map[string]int)
    compressedData := &PointsResponse{
        K: make([]string, 0),
        V: make([][][]RawData, 0),
    }
    
    // ========== 遍历所有数据点 ==========
    for i := range points {
        point := &points[i]
        
        // ========== 构建唯一键 ==========
        // 注意：这里使用 name + labels，不包含聚合类型
        name := point.Name
        labelstr := point.Labels.String()  // 标签的字符串表示
        uniqueKey := name + "|" + labelstr
        
        // ========== 检查是否已存在该指标 ==========
        if _, ok := uniqueLabels[uniqueKey]; !ok {
            // 新标签组合，创建新桶
            uniqueLabels[uniqueKey] = len(compressedData.V)
            
            // 添加到 K 列表（成对添加：name 和 labels）
            compressedData.K = append(compressedData.K, name, labelstr)
            
            // 初始化聚合类型的数据为空切片
            aggTypeData := make([][]RawData, len(pkgaggregator.AggregationTypeList))
            for i := range aggTypeData {
                aggTypeData[i] = make([]RawData, 0)
            }
            compressedData.V = append(compressedData.V, aggTypeData)
        }
        
        // ========== 添加数据点 ==========
        index := uniqueLabels[uniqueKey]
        aggTypeIndex := point.AggregationType.Index()  // 获取聚合类型索引
        
        compressedData.V[index][aggTypeIndex] = append(
            compressedData.V[index][aggTypeIndex],
            RawData{
                T: point.Timestamp.Time().UnixMilli(),
                V: point.Value,
            },
        )
    }
    
    logger.Info("build compressed data map time: %v ms , %v points , %v keys",
        time.Since(startTime).Milliseconds(), len(points), len(compressedData.K)/2)
    
    return compressedData
}
```

### 3.4 AggregationTypeList 顺序

```go
var AggregationTypeList = []AggregationType{
    AggregationTypeAvg,      // 索引 0
    AggregationTypeMin,      // 索引 1
    AggregationTypeMax,      // 索引 2
    AggregationTypeCount,    // 索引 3
    AggregationTypeLast,     // 索引 4
}
```

**前端访问方式**:
```javascript
// 获取 cpu_usage 指标的平均值时间序列
avgPoints = response.v[0][0];  // 指标 0，聚合类型 0 (avg)

// 获取 cpu_usage 指标的最大值时间序列
maxPoints = response.v[0][2];  // 指标 0，聚合类型 2 (max)
```

---

## 4. Datasource MongoDB 数据结构

### 4.1 Datasource 结构体（Thrift 定义）

**文件**: `apis/monitor_hub/datasource/v1/datasource.thrift`

**完整结构**:

```thrift
struct Datasource {
    1: list<string> pushgateway_addr_list (
        go.tag = "json:\"pushgateway_addr_list\" bson:\"pushgateway_addr_list\"",
        vt.min_size = "1"
    ),                                          // 数据源列表（必填）
    
    2: optional string description (
        go.tag = "json:\"description,omitempty\" bson:\"description\"",
        vt.max_size = "500"
    ),                                          // 描述信息
    
    3: string app_id (
        go.tag = "json:\"app_id\" bson:\"app_id\"",
        vt.min_size = "1",
        vt.max_size = "50"
    ),                                          // 项目标识（必填）
    
    4: string name (
        go.tag = "json:\"name\" bson:\"name\"",
        vt.min_size = "1",
        vt.max_size = "100"
    ),                                          // 名称（必填）
    
    5: optional string status (
        go.tag = "json:\"status,omitempty\" bson:\"status\"",
        vt.in = "healthy", vt.in = "degraded", vt.in = "down"
    ),                                          // 状态：healthy/degraded/down
    
    6: optional map<string, list<MetricConfig>> groupmap (
        go.tag = "json:\"groupmap,omitempty\" bson:\"groupmap\"",
    ),                                          // 分组字典，组名 -> 指标配置列表
    
    7: optional list<SummaryConfig> summary_config (
        go.tag = "json:\"summary_config,omitempty\" bson:\"summary_config\"",
    ),                                          // 汇总表格配置列表
    
    8: optional string icon_name(
        go.tag = "json:\"icon_name\" bson:\"icon_name\"",
    ),                                          // 项目图标名称
    
    9: optional list<string> groupmap_sort_keys (
        go.tag = "json:\"groupmap_sort_keys,omitempty\" bson:\"groupmap_sort_keys\"",
    )                                           // groupmap 排序键列表
}
```

### 4.2 MetricConfig 子结构

```thrift
struct MetricConfig {
    1: string name (
        go.tag = "json:\"name\" bson:\"name\"",
        vt.min_size = "1",
        vt.max_size = "100"
    ),                                          // 指标名称（必填）
    
    2: optional string alias (
        go.tag = "json:\"alias,omitempty\" bson:\"alias\"",
        vt.max_size = "100"
    ),                                          // 别名
    
    3: optional string description (
        go.tag = "json:\"description,omitempty\" bson:\"description\"",
        vt.max_size = "500"
    ),                                          // 描述
    
    4: optional string unit (
        go.tag = "json:\"unit,omitempty\" bson:\"unit\"",
        vt.max_size = "20"
    ),                                          // 单位（%, MB, ms）
    
    5: optional string transform (
        go.tag = "json:\"transform,omitempty\" bson:\"transform\"",
        vt.max_size = "200"
    ),                                          // 单位转换表达式（value/1024）
    
    6: optional list<string> display_labels (
        go.tag = "json:\"display_labels,omitempty\" bson:\"display_labels\""
    ),                                          // 图例显示的标签键列表
    
    7: optional string column_span (
        go.tag = "json:\"column_span,omitempty\" bson:\"column_span\"",
        vt.in = "full,half"
    ),                                          // 图表列跨度: full/half
    
    8: optional string chart_type (
        go.tag = "json:\"chart_type,omitempty\" bson:\"chart_type\"",
        vt.in = "area,scatter"
    )                                           // 图表类型: area/scatter
}
```

### 4.3 SummaryConfig 汇总表格配置

```thrift
struct SummaryConfig {
    1: string name (
        go.tag = "json:\"name\" bson:\"name\"",
        vt.min_size = "1",
        vt.max_size = "100"
    ),                                          // 表格名称
    
    2: list<string> labels (
        go.tag = "json:\"labels,omitempty\" bson:\"labels\"",
    ),                                          // 表格左侧显示的标签列表
    
    3: list<MetricAggregation> metrics(
        go.tag = "json:\"metrics\" bson:\"metrics\"",
    )                                           // 右侧要展示的指标和聚合类型
}

struct MetricAggregation {
    1: string metric_name (
        go.tag = "json:\"metric_name\" bson:\"metric_name\"",
        vt.min_size = "1",
        vt.max_size = "100"
    ),                                          // 指标名称
    
    2: list<string> agg_types (
        go.tag = "json:\"agg_types\" bson:\"agg_types\"",
        vt.min_size = "1"
    )                                           // 聚合类型列表 ["avg", "max", "min"]
}
```

### 4.4 MongoDB 文档示例

```json
{
    "_id": "datasource_001",
    "pushgateway_addr_list": ["http://pushgateway-1:9090", "http://pushgateway-2:9090"],
    "app_id": "game_server",
    "name": "Game Server Monitoring",
    "description": "Performance metrics for game servers",
    "status": "healthy",
    "icon_name": "game-icon.png",
    "groupmap": {
        "Server Metrics": [
            {
                "name": "cpu_usage",
                "alias": "CPU Usage",
                "unit": "%",
                "display_labels": ["instance", "zone"],
                "chart_type": "area",
                "column_span": "half"
            },
            {
                "name": "memory_usage",
                "alias": "Memory Usage",
                "unit": "MB",
                "transform": "value/1024",
                "chart_type": "area",
                "column_span": "half"
            }
        ],
        "Network Metrics": [
            {
                "name": "network_in",
                "alias": "Network In",
                "unit": "MB/s",
                "chart_type": "area"
            }
        ]
    },
    "groupmap_sort_keys": ["Server Metrics", "Network Metrics"],
    "summary_config": [
        {
            "name": "System Overview",
            "labels": ["instance", "zone"],
            "metrics": [
                {
                    "metric_name": "cpu_usage",
                    "agg_types": ["avg", "max"]
                },
                {
                    "metric_name": "memory_usage",
                    "agg_types": ["avg", "max"]
                }
            ]
        },
        {
            "name": "Network Summary",
            "labels": ["instance"],
            "metrics": [
                {
                    "metric_name": "network_in",
                    "agg_types": ["avg", "max"]
                }
            ]
        }
    ]
}
```

---

## 5. 聚合触发时机与级联机制

### 5.1 聚合配置结构（LevelConfig）

**文件**: `pkg/aggregator/config.go`

```go
type LevelConfig struct {
    Name         string        // 级别名称: 15s, 30s, 1m, 5m, 1h, 6h, 1d
    Interval     time.Duration // 聚合间隔
    Retention    time.Duration // 数据保留时间
    Source       string        // 数据来源："raw" 或其他级别名称
    MinPoints    int           // 最少需要的数据点数
    FallbackMode FallbackMode  // 降级模式：skip/single/partial
    Description  string        // 描述
}

type FallbackMode string

const (
    FallbackSkip     FallbackMode = "skip"     // 跳过聚合（保证质量）
    FallbackSingle   FallbackMode = "single"   // 允许单点聚合（保证连续性）
    FallbackPartial  FallbackMode = "partial"  // 允许部分聚合（>=50%）
)
```

### 5.2 默认聚合级别配置

**文件**: `pkg/aggregator/config.go` (DefaultConfig)

| 级别 | 间隔 | 保留时长 | 来源 | MinPoints | FallbackMode | 说明 |
|------|------|---------|------|-----------|--------------|------|
| 15s | 15s | 15min | raw | 1 | skip | 原始采集数据 |
| 30s | 30s | 30min | 15s | 2 | single | 30秒聚合 |
| 1m | 1min | 1h | 30s | 2 | partial | 1分钟聚合 |
| 5m | 5min | 6h | 1m | 5 | partial | 5分钟聚合 |
| 1h | 1h | 7天 | 5m | 12 | skip | 1小时聚合 |
| 6h | 6h | 30天 | 1h | 6 | skip | 6小时聚合 |
| 1d | 1天 | 90天 | 6h | 4 | skip | 1天聚合 |

### 5.3 聚合触发时机（AggregationTrigger）

**文件**: `pkg/aggregator/trigger.go`

**触发器类型**: `TriggerTypeInterval`

**触发间隔**: 等于最小聚合间隔（15s）

```go
type AggregationTrigger struct {
    manager  *Manager
    interval time.Duration  // = config.GetMinInterval() = 15s
}

func (t *AggregationTrigger) Execute(ctx context.Context) error {
    now := time.Now()
    if err := t.manager.RunOnce(ctx, now); err != nil {
        logger.Error("Aggregation RunOnce failed: %v", err)
        return err
    }
    return nil
}
```

**触发逻辑** (每 15 秒执行一次):

1. **第一次** (t=0s): 执行 15s 级别聚合
2. **第二次** (t=15s): 执行 15s 级别 + 检查 30s/1m/5m/1h/6h/1d 时间边界
3. ...

### 5.4 RunOnce 执行流程（Manager.RunOnce）

**文件**: `pkg/aggregator/manager.go`

**完整流程**:

```go
func (m *Manager) RunOnce(ctx context.Context, now time.Time) error {
    allAggregatedPoints := make([]AggregatedPoint, 0)
    
    // ========== 步骤 1: 始终执行最小级别聚合 ==========
    // 始终处理 15s 级别，无需检查时间边界
    firstLevel := m.config.Levels[0]  // 15s
    points, err := m.aggregateLevel(ctx, &firstLevel, now)
    if err != nil {
        logger.Error("Failed to aggregate %s: %v", firstLevel.Name, err)
    } else if len(points) > 0 {
        allAggregatedPoints = append(allAggregatedPoints, points...)
    }
    
    // ========== 步骤 2: 逐级检查时间边界 ==========
    for i := 1; i < len(m.config.Levels); i++ {
        level := &m.config.Levels[i]
        
        // 🔑 关键：检查是否到达该级别的时间边界
        if m.isTimeBoundary(level, now) {
            points, err := m.aggregateLevel(ctx, level, now)
            if err != nil {
                logger.Error("Failed to aggregate %s: %v", level.Name, err)
            } else if len(points) > 0 {
                allAggregatedPoints = append(allAggregatedPoints, points...)
            }
        }
    }
    
    // ========== 步骤 3: 发布聚合事件 ==========
    if len(allAggregatedPoints) > 0 {
        m.publishAggregationEvent("all", now, allAggregatedPoints)
    }
    
    return nil
}

// isTimeBoundary 检查时间边界
func (m *Manager) isTimeBoundary(level *LevelConfig, now time.Time) bool {
    return IsTimeBoundary(now, level.Interval, m.minInterval)
}

// IsTimeBoundary 实现
func IsTimeBoundary(now time.Time, interval, minInterval time.Duration) bool {
    aligned := now.Truncate(interval)
    // 当前时间与对齐时间的差值小于最小间隔，认为到达边界
    return now.Sub(aligned) < minInterval
}
```

### 5.5 aggregateLevel 核心逻辑

**文件**: `pkg/aggregator/manager.go`

```go
func (m *Manager) aggregateLevel(ctx context.Context, level *LevelConfig, now time.Time) ([]AggregatedPoint, error) {
    // ========== 步骤 1: 应用查询延迟 ==========
    // 用于等待迟到的数据，默认 40s
    queryDelay := m.config.QueryDelay
    if queryDelay == 0 {
        queryDelay = 40 * time.Second
    }
    adjustedNow := now.Add(-queryDelay)
    
    // ========== 步骤 2: 对齐时间戳到边界 ==========
    timestamp := AlignTimestamp(adjustedNow, level.Interval)
    
    // ========== 步骤 3: 检查是否已聚合过 ==========
    m.mu.RLock()
    lastTime, exists := m.lastAggregation[level.Name]
    m.mu.RUnlock()
    
    if exists && !timestamp.After(lastTime) {
        return nil, nil  // 已经聚合过，跳过
    }
    
    // ========== 步骤 4: 判断数据来源 ==========
    if level.Source == "raw" {
        // 从 Pushgateway 采集原始数据
        return m.collectAndAggregate(ctx, level, timestamp)
    }
    
    // 从 TSDB 查询源级别数据
    return m.cascadeAggregate(ctx, level, timestamp)
}
```

### 5.6 级联聚合（cascadeAggregate）

**文件**: `pkg/aggregator/manager.go`

```go
func (m *Manager) cascadeAggregate(ctx context.Context, level *LevelConfig, timestamp time.Time) ([]AggregatedPoint, error) {
    // ========== 步骤 1: 计算查询时间范围 ==========
    endTime := timestamp
    startTime := timestamp.Add(-level.Interval)
    
    // ========== 步骤 2: 从 TSDB 查询源级别数据 ==========
    // ✅ 关键：必须过滤 __aggregation_level__ 标签，只查询源级别数据
    sourcePoints, err := m.tsdb.QueryByLabels(ctx, &storage.LabelQuery{
        Labels:    labels.FromStrings(
            string(AggregatedInternalLabelAggregationLevel), 
            level.Source,  // 查询源级别的数据（如查询 "1m" 来生成 "5m"）
        ),
        StartTime: startTime.UnixMilli(),
        EndTime:   endTime.UnixMilli(),
    })
    if err != nil {
        return nil, fmt.Errorf("query failed: %w", err)
    }
    
    // ========== 步骤 3: 计算期望的数据点数 ==========
    sourceLevel := m.config.GetSourceLevel(level.Name)
    baseExpectedPoints := CalculateExpectedPoints(level.Interval, sourceLevel.Interval)
    if baseExpectedPoints < level.MinPoints {
        baseExpectedPoints = level.MinPoints
    }
    
    // 🔑 关键修复：统计实际有多少个唯一指标
    // 扁平化设计中，每个指标会产生 4 种聚合类型（avg/min/max/count/last = 5 种）
    uniqueMetrics := countUniqueMetrics(sourcePoints)
    
    // 期望数据点数 = 基础时间点数 × 5（聚合类型） × 指标数量
    expectedCount := baseExpectedPoints * 5 * uniqueMetrics
    
    // ========== 步骤 4: 评估数据质量 ==========
    quality := EvaluateDataQuality(len(sourcePoints), expectedCount, level.FallbackMode)
    
    if !quality.IsValid() {
        logger.Warn("Skipping %s: %s", level.Name, quality.MissingReason)
        return nil, nil
    }
    
    // ========== 步骤 5: 执行聚合 ==========
    aggregated := Aggregate(sourcePoints, level.Name, timestamp, quality)
    
    // ========== 步骤 6: 写入 TSDB ==========
    if err := m.tsdb.Write(ctx, aggregated); err != nil {
        return nil, fmt.Errorf("write failed: %w", err)
    }
    
    // ========== 步骤 7: 更新最后聚合时间 ==========
    m.mu.Lock()
    m.lastAggregation[level.Name] = timestamp
    m.mu.Unlock()
    
    return aggregated, nil
}
```

### 5.7 数据质量评估（DataQuality）

**文件**: `pkg/aggregator/quality.go`

```go
type DataQuality struct {
    ActualPoints   int        // 实际采样点数
    ExpectedPoints int        // 期望采样点数
    Score          float64    // 质量分数 (0-100)
    Status         DataStatus // 状态
    MissingReason  string     // 缺失原因
}

type DataStatus string

const (
    DataStatusComplete DataStatus = "complete"  // 完整数据
    DataStatusPartial  DataStatus = "partial"   // 部分数据
    DataStatusDegraded DataStatus = "degraded"  // 降级数据（单点聚合）
    DataStatusMissing  DataStatus = "missing"   // 数据缺失
)

// EvaluateDataQuality 评估数据质量
func EvaluateDataQuality(actual, expected int, mode FallbackMode) DataQuality {
    if actual >= expected {
        return DataQuality{
            ActualPoints:   actual,
            ExpectedPoints: expected,
            Score:          100.0,
            Status:         DataStatusComplete,
        }
    }
    
    switch mode {
    case FallbackSkip:
        // 不允许降级
        return DataQuality{
            ActualPoints:   actual,
            ExpectedPoints: expected,
            Score:          0.0,
            Status:         DataStatusMissing,
            MissingReason:  fmt.Sprintf("Insufficient data: got %d, need %d", actual, expected),
        }
    
    case FallbackSingle:
        // 允许单点聚合
        if actual >= 1 {
            return DataQuality{
                ActualPoints:   actual,
                ExpectedPoints: expected,
                Score:          float64(actual) / float64(expected) * 100,
                Status:         DataStatusDegraded,
                MissingReason:  "Single-point aggregation (service restart)",
            }
        }
        return DataQuality{...}  // 0 点处理
    
    case FallbackPartial:
        // 允许部分聚合（>=50%）
        minPartial := expected / 2
        if actual >= minPartial {
            return DataQuality{
                ActualPoints:   actual,
                ExpectedPoints: expected,
                Score:          float64(actual) / float64(expected) * 100,
                Status:         DataStatusPartial,
                MissingReason:  fmt.Sprintf("Partial data: %d/%d points", actual, expected),
            }
        }
        return DataQuality{...}  // 不足 50% 处理
    }
}

// IsValid 检查质量是否有效（可以进行聚合）
func (q *DataQuality) IsValid() bool {
    return q.Status != DataStatusMissing
}
```

---

## 6. Sonar-View 实现对标

### 6.1 核心差距分析表

| 功能模块 | Monitor_Hub 实现 | Sonar-View 现状 | 需要实现 | 优先级 |
|---------|-----------------|-----------------|---------|--------|
| **标签定义** | ✅ 6 个内部标签常量 | ❌ 未定义 | 复制 types.go 中的常量定义 | 🔴 P0 |
| **聚合类型** | ✅ Index() 方法映射 | ❌ 未实现 | 实现 AggregationType.Index() | 🔴 P0 |
| **TSDB 查询** | ✅ buildTsdbQueryList 完整 | ❌ 查询逻辑不清 | 实现相同的查询构建逻辑 | 🔴 P0 |
| **数据压缩** | ✅ BuildCompressedData | ❌ 可能有差异 | 验证压缩格式是否一致 | 🟡 P1 |
| **数据质量评估** | ✅ EvaluateDataQuality + FallbackMode | ❌ 未实现 | 实现数据质量评分机制 | 🟡 P1 |
| **聚合触发** | ✅ AggregationTrigger + Manager | ❌ 未实现 | 实现定时聚合触发器 | 🟡 P1 |
| **级联聚合** | ✅ cascadeAggregate 完整 | ❌ 未实现 | 实现从源级别聚合逻辑 | 🟡 P1 |
| **Datasource 配置** | ✅ MongoDB 存储 + groupmap | ❌ 可能不完整 | 确保 groupmap_sort_keys 支持 | 🟢 P2 |
| **汇总表格** | ✅ SummaryConfig + GenerateMultipleTables | ⚠️ 部分实现 | 完善表格生成逻辑 | 🟢 P2 |

### 6.2 重点实现步骤

#### Step 1: 标签常量定义（P0）

**Sonar-View 应新增**:

```go
// sonar/sonar-view/internal/aggregator/types.go

type AggregatedInternalLabel string

const (
    AggregatedInternalLabelName             AggregatedInternalLabel = "__name__"
    AggregatedInternalLabelAggregationLevel AggregatedInternalLabel = "__aggregation_level__"
    AggregatedInternalLabelDataStatus       AggregatedInternalLabel = "__data_status__"
    AggregatedInternalLabelDataScore        AggregatedInternalLabel = "__data_score__"
    AggregatedInternalLabelStatisticSuffix  AggregatedInternalLabel = "__statistic_suffix__"
    AggregatedInternalLabelDatasourceId     AggregatedInternalLabel = "__datasource_id__"
)

type AggregationType string

func (a AggregationType) Index() int {
    switch a {
    case AggregationTypeAvg:
        return 0
    case AggregationTypeMin:
        return 1
    case AggregationTypeMax:
        return 2
    case AggregationTypeCount:
        return 3
    case AggregationTypeLast:
        return 4
    default:
        return 0
    }
}

const (
    AggregationTypeAvg   AggregationType = "avg"
    AggregationTypeMin   AggregationType = "min"
    AggregationTypeMax   AggregationType = "max"
    AggregationTypeCount AggregationType = "count"
    AggregationTypeLast  AggregationType = "last"
)

var AggregationTypeList = []AggregationType{
    AggregationTypeAvg,
    AggregationTypeMin,
    AggregationTypeMax,
    AggregationTypeCount,
    AggregationTypeLast,
}
```

#### Step 2: TSDB 查询构建（P0）

**Sonar-View 应复制**:

```go
// sonar/sonar-view/biz/points/v1/handler.go

func buildTsdbQueryList(req *v1.QueryPointsRequest, rawLevel string) []storage.LabelQuery {
    // 完全复制 monitor_hub 的 buildTsdbQueryList 实现
    // 包括三层嵌套循环：level -> aggregation_type -> filters
}
```

#### Step 3: 数据压缩验证（P0）

**Sonar-View 应确认**:

```go
// sonar/sonar-view/pkg/dataprocess/pointsformat.go

// ✅ 确认 PointsResponse 结构定义一致
// ✅ 确认 BuildCompressedData 逻辑完全相同
// ✅ 确认 AggregationTypeList.Index() 顺序一致
```

**前端访问方式必须统一**:

```typescript
// 前端获取数据点时使用相同的索引逻辑
const aggregationTypeIndices = {
  'avg': 0,
  'min': 1,
  'max': 2,
  'count': 3,
  'last': 4,
};

// 获取某指标的聚合数据
const metricIndex = 0;  // k 中的索引 / 2
const aggTypeIndex = aggregationTypeIndices['avg'];
const timeSeriesPoints = response.v[metricIndex][aggTypeIndex];
```

#### Step 4: 数据质量评估（P1）

**Sonar-View 应实现**:

```go
// sonar/sonar-view/pkg/aggregator/quality.go

type DataQuality struct {
    ActualPoints   int     `json:"actual_points,omitempty"`
    ExpectedPoints int     `json:"expected_points,omitempty"`
    Score          float64 `json:"score"`
    Status         DataStatus `json:"status"`
    MissingReason  string  `json:"missing_reason,omitempty"`
}

type DataStatus string

const (
    DataStatusComplete DataStatus = "complete"
    DataStatusPartial  DataStatus = "partial"
    DataStatusDegraded DataStatus = "degraded"
    DataStatusMissing  DataStatus = "missing"
)

// 实现 EvaluateDataQuality 函数（完全复制 monitor_hub 实现）
```

#### Step 5: 聚合触发器（P1）

**Sonar-View 应实现**:

```go
// sonar/sonar-view/pkg/aggregator/trigger.go 和 manager.go

type AggregationTrigger struct {
    manager  *Manager
    interval time.Duration
}

// 实现 Execute 方法，每 15s 调用一次 manager.RunOnce()
```

#### Step 6: 级联聚合（P1）

**Sonar-View 的 cascadeAggregate 必须确保**:

```go
// 关键点 1: 查询源级别数据时必须过滤 __aggregation_level__
sourcePoints, err := m.tsdb.QueryByLabels(ctx, &storage.LabelQuery{
    Labels: labels.FromStrings(
        string(AggregatedInternalLabelAggregationLevel),
        level.Source,  // 注意：这里查询的是源级别的标签值
    ),
    StartTime: startTime.UnixMilli(),
    EndTime:   endTime.UnixMilli(),
})

// 关键点 2: 计算期望点数时必须考虑聚合类型数量
uniqueMetrics := countUniqueMetrics(sourcePoints)
expectedCount := baseExpectedPoints * 5 * uniqueMetrics  // 5 = 聚合类型数量

// 关键点 3: 按分组统计唯一指标
func countUniqueMetrics(points []AggregatedPoint) int {
    uniqueKeys := make(map[string]struct{})
    for _, point := range points {
        businessLabels := filterBusinessLabels(point.Labels)
        key := fmt.Sprintf("%s|%s", point.DatasourceId, generateMetricKey(point.Name, businessLabels))
        uniqueKeys[key] = struct{}{}
    }
    return len(uniqueKeys)
}
```

### 6.3 已有实现状态检查清单

- [ ] **类型定义**
  - [ ] AggregatedInternalLabel 常量定义完整
  - [ ] AggregationType 及 Index() 方法
  - [ ] AggregationTypeList 顺序确认
  
- [ ] **TSDB 查询**
  - [ ] buildTsdbQueryList 三层嵌套循环正确
  - [ ] 标签构建逻辑正确
  - [ ] 时间范围传递正确
  
- [ ] **数据压缩**
  - [ ] PointsResponse 结构定义一致
  - [ ] BuildCompressedData 去重逻辑一致
  - [ ] 聚合类型索引顺序一致
  
- [ ] **数据质量**
  - [ ] DataQuality 结构定义完整
  - [ ] EvaluateDataQuality 评分逻辑一致
  - [ ] FallbackMode 三种模式支持
  
- [ ] **聚合管理**
  - [ ] aggregateLevel 核心逻辑
  - [ ] cascadeAggregate 级联逻辑
  - [ ] 时间边界检查正确
  - [ ] 聚合触发间隔为 15s

---

## 7. 关键要点总结

### 7.1 扁平化设计的数据存储

Monitor_Hub 采用**扁平化聚合类型设计**（而非分层存储）：

- **每个指标** × **每个聚合类型** = **单独的数据序列**
- 示例：`cpu_usage{instance=server1}` 产生 5 条时间序列：
  - `cpu_usage{instance=server1,__statistic_suffix__=avg}`
  - `cpu_usage{instance=server1,__statistic_suffix__=min}`
  - `cpu_usage{instance=server1,__statistic_suffix__=max}`
  - `cpu_usage{instance=server1,__statistic_suffix__=count}`
  - `cpu_usage{instance=server1,__statistic_suffix__=last}`

### 7.2 压缩格式优化

**PointsResponse** 压缩优化：

1. **K 列表**: `[name1, labels1, name2, labels2, ...]` 去重存储指标和标签
2. **V 矩阵**: `[metric_index][agg_type_index][time_points]` 按聚合类型分别索引
3. **前端访问**: `v[metric_idx][agg_type_idx]` 获取某聚合类型的时间序列

### 7.3 级联聚合的关键约束

1. **时间对齐**: 聚合时间戳必须对齐到 level.Interval 边界
2. **时间边界触发**: 非最小级别需检查边界才聚合
3. **数据质量评估**: 必须考虑聚合类型数量和指标数量来计算期望点数
4. **查询延迟**: 默认 40s 延迟，用于等待迟到的数据（日志采集场景）

### 7.4 性能考量

- **内存占用**: 扁平化设计因聚合类型数量增长而增加
- **查询效率**: buildTsdbQueryList 可能产生多个查询请求，需要 batching 优化
- **TSDB 写入**: 每次聚合产生多条时间序列，需要 batch write 支持

---

## 附录 A：文件清单

| 文件路径 | 主要内容 | 行数 |
|---------|---------|------|
| `pkg/aggregator/types.go` | 标签定义、AggregationType、AggregatedPoint | ~180 |
| `pkg/aggregator/aggregator.go` | 核心聚合算法 | ~270 |
| `pkg/aggregator/config.go` | LevelConfig、FallbackMode、默认配置 | ~210 |
| `pkg/aggregator/quality.go` | DataQuality、EvaluateDataQuality | ~130 |
| `pkg/aggregator/trigger.go` | AggregationTrigger、CleanupTrigger | ~100 |
| `pkg/aggregator/manager.go` | Manager、RunOnce、cascadeAggregate 核心 | ~480 |
| `biz/points/v1/handler.go` | QueryPoints、buildTsdbQueryList | ~180 |
| `pkg/dataprocess/pointsformat.go` | BuildCompressedData、PointsResponse | ~280 |
| `apis/monitor_hub/datasource/v1/datasource.thrift` | Datasource、MetricConfig、SummaryConfig | ~180 |
| `apis/monitor_hub/datasource/v1/datasource.go` | 生成的 Go struct（自动生成） | ~2000+ |

---

## 附录 B：关键方法调用链

```
HTTP 请求: POST /apis/v1/points/query
    ↓
PointsHandler.QueryPoints()
    ├─ buildTsdbQueryList() → []storage.LabelQuery
    ├─ tsdb.QueryByLabels() → []AggregatedPoint（多次调用）
    ├─ BuildCompressedData() → PointsResponse
    └─ GenerateMultipleTables() → []SummaryTable

Aggregation 定时触发: 每 15s 执行一次
    ↓
AggregationTrigger.Execute()
    ↓
Manager.RunOnce(now)
    ├─ 始终调用 aggregateLevel(15s)
    ├─ 检查时间边界 → 调用 aggregateLevel(30s/1m/5m/1h/6h/1d)
    │
    ├─ aggregateLevel(level.Source == "raw")
    │   ├─ collector.Collect() → []RawMetricPoint
    │   ├─ AggregateRaw() → []AggregatedPoint
    │   └─ tsdb.Write()
    │
    └─ aggregateLevel(level.Source != "raw")
        ├─ tsdb.QueryByLabels(__aggregation_level__=level.Source) → []AggregatedPoint
        ├─ EvaluateDataQuality()
        ├─ Aggregate() → []AggregatedPoint
        └─ tsdb.Write()
```

---

**分析完成**。本文档可作为 sonar-view 后端实现的参考蓝图。

