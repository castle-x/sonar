# Utils 工具包

本包包含项目中可复用的纯函数工具方法，按功能分为不同文件。

## 📁 文件组织

```
pkg/utils/
├── compress.go       # 数据压缩/解压工具
├── label.go          # Prometheus 标签处理工具
├── metric.go         # 指标计算和转换工具
└── README.md         # 本文件
```

---

## 📦 compress.go - 数据压缩工具

### 函数列表

```go
// 压缩数据（默认级别）
compressed, err := utils.Compress(jsonData)

// 指定压缩级别
compressed, err := utils.CompressWithLevel(jsonData, 9) // 最高压缩

// 解压数据
original, err := utils.Decompress(compressed)

// 计算压缩率
ratio := utils.CompressRatio(originalSize, compressedSize)

// 计算节省空间百分比
savings := utils.CompressionSavings(originalSize, compressedSize)
```

### 使用场景
- `biz/report/v1`: 压缩 chunk 数据存储到 MongoDB
- `pkg/repo`: 数据存储前压缩，读取后解压

---

## 📦 label.go - 标签处理工具

### 函数列表

```go
// 解析 Prometheus 标签字符串
labels := utils.ParseLabelStr(`{ip="192.168.1.1",pid="123"}`)
// => map[string]string{"ip": "192.168.1.1", "pid": "123"}

// 构建标签字符串
labelStr := utils.BuildLabelStr(map[string]string{"ip": "192.168.1.1"})
// => {ip="192.168.1.1"}

// 裁剪标签（只保留指定字段）
trimmed := utils.TrimLabelStr(labelStr, []string{"ip", "app"})

// 提取单个标签值
value, ok := utils.ExtractLabelValue(labelStr, "ip")

// 标签匹配
matched := utils.MatchLabels(labelStr, map[string]string{"ip": "192.168.1.1"})

// 合并标签
merged := utils.MergeLabels(labels1, labels2, labels3)

// 标签字符串转切片（用于 thrift）
slice := utils.LabelStrToSlice(`{ip="192.168.1.1",pid="123"}`)
// => ["ip", "192.168.1.1", "pid", "123"]

// 切片转标签 map（用于处理 thrift labels）
labelMap := utils.SliceToLabelMap([]string{"ip", "192.168.1.1", "pid", "123"})
```

### 使用场景
- `biz/points/v1`: NewSummaryTable 中解析和裁剪标签
- `biz/report/v1`: 处理 QueryFilter 的 labels 字段
- `pkg/aggregation`: 聚合时标签分组和匹配

---

## 📦 metric.go - 指标转换和格式化工具

### 函数列表

```go
// 表达式计算（支持四则运算和括号）
result := utils.EvaluateTransform("value * 100 + 50", 0.85)  // 135.0

// 格式化显示（添加单位和精度控制）
formatted := utils.FormatValue(45.867, "ms", 2)  // "45.87ms"
```

### 转换表达式支持
- 基本运算: `+`, `-`, `*`, `/`
- 括号: `(`, `)`
- 变量替换: `value` 会被替换为实际数值
- 示例: `value * 100`, `(value - 32) * 5 / 9`, `value * 100 + 50`

### 使用场景
- `pkg/dataprocess`: 计算指标值时应用转换表达式
- `biz/points/v1`: 格式化表格单元格显示
- `biz/report/v1`: 报告数据格式化

### 注意
数据聚合相关的函数（`AggregateValues`, `CalculateMetricValue`, `CalculatePercentile`）已移至 `pkg/dataprocess/aggregation.go`，
该包使用 `pkg/aggregator` 的枚举类型，更加类型安全。

---

## 🎯 使用示例

### 完整示例：处理报告数据

```go
package main

import (
    "encoding/json"
    "monitor_hub/pkg/utils"
)

func processReportData() {
    // 1. 准备数据
    data := map[string]interface{}{
        "k": []string{"cpu_usage", `{ip="192.168.1.1"}`, "memory_usage", `{ip="192.168.1.1"}`},
        "v": [][][]map[string]interface{}{...},
    }
    
    // 2. 序列化为 JSON
    jsonData, _ := json.Marshal(data)
    
    // 3. 压缩数据
    compressed, _ := utils.Compress(jsonData)
    
    // 计算压缩效果
    ratio := utils.CompressRatio(int64(len(jsonData)), int64(len(compressed)))
    savings := utils.CompressionSavings(int64(len(jsonData)), int64(len(compressed)))
    
    // 4. 解析标签
    labels := utils.ParseLabelStr(`{ip="192.168.1.1",pid="123",app="test"}`)
    
    // 5. 裁剪标签（只保留需要的）
    trimmed := utils.TrimLabelStr(`{ip="192.168.1.1",pid="123"}`, []string{"ip"})
    
    // 6. 计算指标
    values := []utils.RawDataPoint{
        {T: 1732627200000, V: 45.6},
        {T: 1732627215000, V: 48.2},
    }
    
    avg := utils.AggregateValues(values, "avg")
    formatted := utils.FormatValue(avg, "ms", 2)
}
```

---

## 🧪 测试

每个文件都应该有对应的测试文件：

```
pkg/utils/
├── compress.go
├── compress_test.go
├── label.go
├── label_test.go
├── metric.go
└── metric_test.go
```

运行测试：
```bash
go test ./pkg/utils/...
```

---

## 📝 注意事项

1. **纯函数设计**：所有函数无副作用，无全局状态
2. **并发安全**：所有函数可安全并发调用
3. **错误处理**：压缩/解压函数返回 error，其他函数返回零值
4. **性能考虑**：
   - 压缩：默认级别（6）平衡速度和效果
   - 标签解析：简单字符串操作，性能良好
   - 指标计算：小数据量适用，大数据量考虑优化
5. **安全性**：表达式计算有安全检查，防止注入攻击

