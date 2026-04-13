package dataprocess

import (
	pkgaggregator "monitor_hub/pkg/aggregator"
	"time"

	"git.woa.com/castlexu/goutils/ablog"
)

var logger = ablog.NewLogger("dataprocess")

// RawData 表示一个原始数据点
type RawData struct {
	T int64   `json:"t"` // 时间戳(Unix 毫秒)
	V float64 `json:"v"` // 值
}

// PointsResponse 表示压缩后的数据点响应格式
// 通过键值对列表和值矩阵实现高效的数据传输
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

// BuildCompressedData 将聚合数据点列表压缩为 PointsResponse 格式
// 通过去重和索引化，减少数据传输量和提升前端渲染性能
//
// 处理逻辑:
// 1. 按 name + labels 去重，每个唯一组合分配一个索引
// 2. 按聚合类型（avg, min, max, count, last）分组数据
// 3. 构建压缩格式：K 存储唯一键，V 存储对应的时序数据
//
// 调用场景:
// - biz/points/v1/handler.go: QueryPoints 中压缩 TSDB 查询结果
// - biz/report/v1: 报告生成时压缩聚合后的数据
// - pkg/aggregation: 数据聚合完成后压缩输出
func BuildCompressedData(points []pkgaggregator.AggregatedPoint) *PointsResponse {
	startTime := time.Now()
	uniqueLabels := make(map[string]int)
	compressedData := &PointsResponse{
		K: make([]string, 0),
		V: make([][][]RawData, 0),
	}

	for i := range points {
		point := &points[i]
		// 检查是否已存在
		name := point.Name
		labelstr := point.Labels.String()
		uniqueKey := name + "|" + labelstr

		if _, ok := uniqueLabels[uniqueKey]; !ok {
			// 新标签组合，创建新桶
			uniqueLabels[uniqueKey] = len(compressedData.V)
			compressedData.K = append(compressedData.K, name, labelstr)

			// 初始化每个聚合类型的数据为空切片（而非 nil）
			aggTypeData := make([][]RawData, len(pkgaggregator.AggregationTypeList))
			for i := range aggTypeData {
				aggTypeData[i] = make([]RawData, 0)
			}
			compressedData.V = append(compressedData.V, aggTypeData)
		}

		// 添加数据点到对应的聚合类型
		index := uniqueLabels[uniqueKey]
		aggTypeIndex := point.AggregationType.Index()
		compressedData.V[index][aggTypeIndex] = append(compressedData.V[index][aggTypeIndex], RawData{
			T: point.Timestamp.Time().UnixMilli(),
			V: point.Value,
		})
	}
	logger.Info("build compressed data map time: %v ms , %v points , %v keys",
		time.Since(startTime).Milliseconds(), len(points), len(compressedData.K)/2)
	return compressedData
}

// FilterCompressedData 根据指标名称列表过滤压缩数据
// 只保留 metricNames 中指定的指标
//
// 调用场景:
// - biz/points/v1: 根据 SummaryConfig 过滤需要的指标
// - biz/report/v1: 按需过滤报告数据
func FilterCompressedData(compressedData *PointsResponse, metricNames []string) *PointsResponse {
	if len(compressedData.K)%2 != 0 {
		// K 应该是偶数个元素（name, labels 对）
		return compressedData
	}

	// 构建指标名称快速查找表
	metricSet := make(map[string]bool)
	for _, name := range metricNames {
		metricSet[name] = true
	}

	filteredData := &PointsResponse{
		K: make([]string, 0),
		V: make([][][]RawData, 0),
	}

	// 遍历所有指标，只保留匹配的
	for i := 0; i < len(compressedData.K); i += 2 {
		nameIndex := i
		labelIndex := i + 1
		rawDataIndex := i / 2

		name := compressedData.K[nameIndex]
		labelstr := compressedData.K[labelIndex]
		aggRawData := compressedData.V[rawDataIndex]

		// 检查是否在过滤列表中
		if metricSet[name] {
			filteredData.K = append(filteredData.K, name, labelstr)
			filteredData.V = append(filteredData.V, aggRawData)
		}
	}

	return filteredData
}

// MergeCompressedData 合并多个压缩数据
// 用于合并不同时间段或不同来源的数据
//
// 调用场景:
// - biz/report/v1: 合并多个时间段的查询结果
// - pkg/aggregation: 合并分段查询的数据
func MergeCompressedData(dataList ...*PointsResponse) *PointsResponse {
	if len(dataList) == 0 {
		return &PointsResponse{
			K: make([]string, 0),
			V: make([][][]RawData, 0),
		}
	}

	if len(dataList) == 1 {
		return dataList[0]
	}

	// 使用第一个作为基础
	merged := &PointsResponse{
		K: make([]string, 0),
		V: make([][][]RawData, 0),
	}

	// 构建唯一键索引
	uniqueKeys := make(map[string]int)

	for _, data := range dataList {
		if len(data.K)%2 != 0 {
			continue
		}

		for i := 0; i < len(data.K); i += 2 {
			name := data.K[i]
			labelstr := data.K[i+1]
			uniqueKey := name + "|" + labelstr
			rawDataIndex := i / 2

			if existingIndex, exists := uniqueKeys[uniqueKey]; exists {
				// 已存在，合并数据点
				for aggTypeIdx := range data.V[rawDataIndex] {
					merged.V[existingIndex][aggTypeIdx] = append(
						merged.V[existingIndex][aggTypeIdx],
						data.V[rawDataIndex][aggTypeIdx]...,
					)
				}
			} else {
				// 新的指标，添加
				uniqueKeys[uniqueKey] = len(merged.V)
				merged.K = append(merged.K, name, labelstr)
				merged.V = append(merged.V, data.V[rawDataIndex])
			}
		}
	}

	return merged
}

// CountMetrics 统计压缩数据中的指标数量
//
// 调用场景:
// - biz/report/v1: 记录报告统计信息
// - 监控和日志输出
func CountMetrics(data *PointsResponse) int {
	if len(data.K)%2 != 0 {
		return 0
	}
	return len(data.K) / 2
}

// CountPoints 统计压缩数据中的数据点总数
//
// 调用场景:
// - biz/report/v1: 记录报告统计信息
// - 监控和日志输出
func CountPoints(data *PointsResponse) int {
	totalPoints := 0
	for _, metricData := range data.V {
		for _, aggTypeData := range metricData {
			totalPoints += len(aggTypeData)
		}
	}
	return totalPoints
}

// GetMetricNames 获取所有指标名称列表（去重）
//
// 调用场景:
// - 前端显示指标列表
// - 报告元数据生成
func GetMetricNames(data *PointsResponse) []string {
	if len(data.K)%2 != 0 {
		return []string{}
	}

	names := make([]string, 0, len(data.K)/2)
	for i := 0; i < len(data.K); i += 2 {
		names = append(names, data.K[i])
	}

	return names
}
