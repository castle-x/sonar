# DataProcess 数据处理包

本包负责监控数据的格式化、压缩和表格生成，是连接数据存储层和展示层的核心处理模块。

## 📁 文件组织

```
pkg/dataprocess/
├── pointsformat.go    # 数据点格式化和压缩
├── aggregation.go     # 数据聚合计算
├── summary.go         # 汇总表格生成
└── README.md          # 本文件
```

---

## 📦 pointsformat.go - 数据点格式化

### 核心数据结构

```go
// 原始数据点
type RawData struct {
    T int64   `json:"t"` // 时间戳(Unix 毫秒)
    V float64 `json:"v"` // 值
}

// 压缩后的数据响应格式
type PointsResponse struct {
    K []string        `json:"k"` // [name1, labels1, name2, labels2, ...]
    V [][][]RawData   `json:"v"` // [metric_index][agg_type_index][time_points]
}
```

### 主要功能

#### 1. 构建压缩数据

```go
import (
    "monitor_hub/pkg/dataprocess"
    pkgaggregator "monitor_hub/pkg/aggregator"
)

// 从 TSDB 查询结果构建压缩数据
points := []pkgaggregator.AggregatedPoint{...}
compressed := dataprocess.BuildCompressedData(points)

// compressed.K: ["cpu_usage", "{ip=\"192.168.1.1\"}", "memory_usage", "{ip=\"192.168.1.1\"}"]
// compressed.V: [
//   [ // cpu_usage 的数据
//     [{T:xxx,V:45.6},{T:xxx,V:46.2}], // avg
//     [{T:xxx,V:40.1},{T:xxx,V:41.5}], // min
//     [{T:xxx,V:50.3},{T:xxx,V:51.2}], // max
//     [{T:xxx,V:1000},{T:xxx,V:1000}]  // count
//   ],
//   [ // memory_usage 的数据
//     [...], [...], [...], [...]
//   ]
// ]
```

#### 2. 过滤数据

```go
// 只保留指定的指标
metricNames := []string{"cpu_usage", "memory_usage"}
filtered := dataprocess.FilterCompressedData(compressed, metricNames)
```

#### 3. 合并数据

```go
// 合并多个时间段或来源的数据
data1 := dataprocess.BuildCompressedData(points1)
data2 := dataprocess.BuildCompressedData(points2)
merged := dataprocess.MergeCompressedData(data1, data2)
```

#### 4. 统计信息

```go
// 统计指标数量
metricCount := dataprocess.CountMetrics(compressed)

// 统计数据点总数
pointCount := dataprocess.CountPoints(compressed)

// 获取所有指标名称
metricNames := dataprocess.GetMetricNames(compressed)
```

### 使用场景

- ✅ `biz/points/v1`: QueryPoints 中压缩 TSDB 查询结果
- ✅ `biz/report/v1`: 报告生成时压缩聚合后的数据
- ✅ `pkg/aggregation`: 数据聚合完成后压缩输出

---

## 📦 aggregation.go - 数据聚合计算

### 核心功能

使用 `pkg/aggregator` 包定义的聚合类型枚举，避免字符串类型的分裂。

#### 1. 聚合计算

```go
import (
    "monitor_hub/pkg/dataprocess"
    pkgaggregator "monitor_hub/pkg/aggregator"
)

// 数据点
values := []dataprocess.RawData{
    {T: 1732627200000, V: 45.6},
    {T: 1732627215000, V: 48.2},
    {T: 1732627230000, V: 43.8},
}

// 使用枚举类型聚合
avg := dataprocess.AggregateValues(values, pkgaggregator.AggregationTypeAvg)
min := dataprocess.AggregateValues(values, pkgaggregator.AggregationTypeMin)
max := dataprocess.AggregateValues(values, pkgaggregator.AggregationTypeMax)
count := dataprocess.AggregateValues(values, pkgaggregator.AggregationTypeCount)
```

#### 2. 带转换表达式的计算

```go
// 计算聚合值并应用转换表达式
result := dataprocess.CalculateMetricValue(
    pkgaggregator.AggregationTypeAvg,
    "value * 100",  // 转换表达式
    values,
)
```

#### 3. 计算百分位数

```go
p95 := dataprocess.CalculatePercentile(values, 95)
p99 := dataprocess.CalculatePercentile(values, 99)
```

#### 4. 批量聚合

```go
// 一次性计算所有聚合类型
allAggs := dataprocess.AggregateAllTypes(values)
// allAggs = map[AggregationType]float64{
//     AggregationTypeAvg: 45.87,
//     AggregationTypeMin: 43.8,
//     AggregationTypeMax: 48.2,
//     AggregationTypeCount: 3,
// }
```

### 支持的聚合类型

- `AggregationTypeAvg` - 平均值
- `AggregationTypeMin` - 最小值
- `AggregationTypeMax` - 最大值
- `AggregationTypeCount` - 计数（累加）
- `AggregationTypeLast` - 最后一个值

### 使用场景

- ✅ `pkg/dataprocess/summary.go`: 表格生成时计算指标值
- ✅ `biz/report/v1`: 重新聚合数据时使用
- ✅ `pkg/aggregation`: 数据聚合服务中计算窗口值

---

## 📦 summary.go - 汇总表格生成

### 核心数据结构

```go
type SummaryTable struct {
    Name  string     `json:"name"`  // 表格名称
    Table [][]string `json:"table"` // 表格数据（第一行是header）
}
```

### 主要功能

#### 1. 生成汇总表格

```go
import (
    "monitor_hub/pkg/dataprocess"
    datasourceV1 "monitor_hub/apis/monitor_hub/datasource/v1"
)

// 准备配置
summaryConfig := &datasourceV1.SummaryConfig{
    Name: "性能概览",
    Labels: []string{"ip", "pid"},
    Metrics: []*datasourceV1.MetricAgg{
        {MetricName: "cpu_usage", AggTypes: []string{"avg", "max"}},
        {MetricName: "memory_usage", AggTypes: []string{"avg"}},
    },
}

metricConfigMap := dataprocess.BuildMetricConfigMap(ds.Resource.GetGroupmap())

// 过滤数据
filteredData := dataprocess.FilterCompressedDataByConfig(compressed, summaryConfig)

// 生成表格
table := dataprocess.BuildSummaryTable(
    summaryConfig.Name,
    summaryConfig,
    metricConfigMap,
    filteredData,
)

// 表格结果示例:
// table.Table = [
//   ["ip", "pid", "cpu_usage(avg)", "cpu_usage(max)", "memory_usage(avg)"],
//   ["192.168.1.1", "123", "45.67ms", "89.23ms", "2048.00MB"],
//   ["192.168.1.2", "456", "38.92ms", "76.54ms", "1536.00MB"],
// ]
```

#### 2. 批量生成多个表格

```go
// 为多个 SummaryConfig 生成表格
tables := dataprocess.GenerateMultipleTables(
    compressed,
    ds.Resource.GetSummaryConfig(),
    metricConfigMap,
)
```

#### 3. 导出 CSV

```go
// 导出表格为 CSV 格式
csv := dataprocess.ExportTableToCSV(table)
```

### 表格生成流程

```
1. 解析压缩数据（PointsResponse）
   ↓
2. 根据配置的 Labels 对数据分组（每组一行）
   ↓
3. 构建表头（标签列 + 指标聚合类型列）
   ↓
4. 填充数据行
   - 解析标签值
   - 计算指标值（聚合 + 转换）
   - 格式化显示（单位 + 精度）
   ↓
5. 生成完整表格
```

### 使用场景

- ✅ `biz/points/v1`: QueryPoints 中生成实时汇总表格
- ✅ `biz/report/v1`: 报告生成时创建汇总表格
- ✅ 前端展示实时性能统计

---

## 🎯 完整使用示例

### 示例1: Points Handler 中的使用

```go
package v1

import (
    "monitor_hub/pkg/dataprocess"
    pkgaggregator "monitor_hub/pkg/aggregator"
)

func (s *PointsHandler) QueryPoints(ctx context.Context, req *QueryPointsRequest) *Response {
    // 1. 查询 TSDB 数据
    var allPoints []pkgaggregator.AggregatedPoint
    queryList := buildTsdbQueryList(req)
    for _, query := range queryList {
        points, _ := s.tsdb.QueryByLabels(ctx, &query)
        allPoints = append(allPoints, points...)
    }

    // 2. 压缩数据
    compressed := dataprocess.BuildCompressedData(allPoints)

    // 3. 生成汇总表格
    ds, _ := s.datasourceRepo.GetDatasource(ctx, req.DatasourceID)
    metricConfigMap := dataprocess.BuildMetricConfigMap(ds.Resource.GetGroupmap())
    
    tables := dataprocess.GenerateMultipleTables(
        compressed,
        ds.Resource.GetSummaryConfig(),
        metricConfigMap,
    )

    return Success(WithData(map[string]any{
        "p": compressed,  // 压缩数据（前端渲染图表）
        "t": tables,      // 汇总表格（前端展示表格）
    }))
}
```

### 示例2: Report 生成中的使用

```go
package v1

import (
    "monitor_hub/pkg/dataprocess"
)

func (s *ReportService) generateReport(ctx context.Context, singleCase *SingleCase) {
    // 1. 从 Pushgateway 查询原始数据
    rawMetrics := s.queryRawData(ctx, singleCase.QueryConfig)

    // 2. 重新聚合数据
    aggregated := s.aggregateData(rawMetrics, singleCase.QueryConfig)

    // 3. 构建压缩数据
    compressed := dataprocess.BuildCompressedData(aggregated)

    // 4. 生成表格（可选）
    tables := dataprocess.GenerateMultipleTables(compressed, summaryConfigs, metricConfigMap)

    // 5. 压缩存储
    jsonData, _ := json.Marshal(compressed)
    compressedData, _ := utils.Compress(jsonData)

    // 6. 存储 chunk
    chunk := &Chunk{
        CompressedData: compressedData,
        PointCount:     dataprocess.CountPoints(compressed),
        MetricCount:    dataprocess.CountMetrics(compressed),
    }
}
```

---

## 🔄 数据流转

```
原始数据
  ↓
AggregatedPoint[] (TSDB/Aggregation)
  ↓
BuildCompressedData()
  ↓
PointsResponse (压缩格式)
  ↓
┌─────────────────┬─────────────────┐
│                 │                 │
FilterByConfig()  BuildSummaryTable()
│                 │
Filtered Data     SummaryTable
│                 │
前端图表渲染      前端表格展示
```

---

## 📊 性能优化

### 数据压缩效果

- **原始格式**: 每个点包含完整的 name + labels + timestamp + value
- **压缩格式**: name + labels 只存储一次，相同指标的点共享索引
- **压缩率**: 约 60-80%（取决于指标数量和时间点数）

### 内存优化

- 使用索引化避免重复存储标签
- 切片预分配减少内存重新分配
- 批量处理减少函数调用开销

---

## 🧪 测试

```bash
# 运行测试
go test ./pkg/dataprocess/...

# 运行基准测试
go test -bench=. ./pkg/dataprocess/...
```

---

## 📝 注意事项

1. **数据完整性**: PointsResponse.K 必须是偶数个元素（name, labels 对）
2. **索引对应**: V 的索引 = K 的索引 / 2
3. **聚合类型顺序**: V 的第二维固定为 [avg, min, max, count] 顺序
4. **标签唯一性**: 表格分组时使用裁剪后的标签确保唯一性
5. **并发安全**: 所有函数都是无状态的，可安全并发调用

