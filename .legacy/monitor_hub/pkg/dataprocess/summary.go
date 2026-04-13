package dataprocess

import (
	"fmt"
	datasourceV1 "monitor_hub/apis/monitor_hub/datasource/v1"
	pkgaggregator "monitor_hub/pkg/aggregator"
	"monitor_hub/pkg/utils"
)

// SummaryTable 表示一个汇总表格
type SummaryTable struct {
	Name  string     `json:"name"`  // 表格名称
	Table [][]string `json:"table"` // 表格数据（第一行是header）
}

// MetricConfig 指标配置的简化结构（用于避免直接依赖 datasource）
type MetricConfig struct {
	Name      string
	Alias     string
	Unit      string
	Transform string
}

// BuildSummaryTable 基于压缩数据结构生成汇总表格
//
// 参数:
// - name: 表格名称
// - summaryConfig: 表格配置（标签、指标等）
// - metricsConfig: 指标配置映射（别名、单位、转换等）
// - filteredData: 已过滤的压缩数据
//
// 调用场景:
// - biz/points/v1/handler.go: QueryPoints 中生成实时汇总表格
// - biz/report/v1: 报告生成时创建汇总表格
func BuildSummaryTable(name string, summaryConfig *datasourceV1.SummaryConfig,
	metricsConfig map[string]*datasourceV1.MetricConfig, filteredData *PointsResponse) *SummaryTable {

	table := &SummaryTable{
		Name:  name,
		Table: make([][]string, 0),
	}

	// ===== 构建完整的 header =====
	header := []string{}
	// 1.1 添加标签列
	header = append(header, summaryConfig.Labels...)

	// 1.2 添加指标聚合类型列
	// 按配置顺序遍历（list 保持了配置中定义的顺序）
	for _, metricAgg := range summaryConfig.Metrics {
		metricName := metricAgg.MetricName
		// 获取别名
		alias := metricName
		if metricConfig, ok := metricsConfig[metricName]; ok {
			if metricConfig.IsSetAlias() {
				alias = metricConfig.GetAlias()
			}
		}

		// 为每个聚合类型添加列
		for _, aggType := range metricAgg.AggTypes {
			header = append(header, alias+"("+aggType+")")
		}
	}

	// ===== 将 header 作为第一行添加到 content =====
	content := [][]string{header}

	// ===== 基于压缩数据结构构建数据行 =====
	// 筛选出label，作为唯一值，每个唯一的label这里代表一行
	labelList := make([]string, 0)
	labelFirstMap := make(map[string]map[string]int) // labelstr -> metricName -> dataIndex

	for i := 0; i < len(filteredData.K); i += 2 {
		labelIndex := i + 1
		nameIndex := i
		dataIndex := i / 2
		name := filteredData.K[nameIndex]
		labelstr := filteredData.K[labelIndex]

		// 根据用户配置裁剪标签，确保唯一性
		trimLabelStr := utils.TrimLabelStr(labelstr, summaryConfig.Labels)
		if _, ok := labelFirstMap[trimLabelStr]; !ok {
			labelFirstMap[trimLabelStr] = make(map[string]int)
			labelList = append(labelList, trimLabelStr)
		}
		if _, ok := labelFirstMap[trimLabelStr][name]; !ok {
			labelFirstMap[trimLabelStr][name] = dataIndex
		}
	}

	// 遍历每个唯一的标签组合，生成一行数据
	for _, labelstr := range labelList {
		metricNameMap := labelFirstMap[labelstr]
		row := []string{}

		// 解析labelstr，得到需要的标签值
		labelMap := utils.ParseLabelStr(labelstr)

		// 按照配置的顺序填充标签值
		for _, labelKey := range summaryConfig.Labels {
			if value, ok := labelMap[labelKey]; ok {
				row = append(row, value)
			} else {
				row = append(row, "N/A")
			}
		}

		// 填充指标值
		for _, metricCfg := range summaryConfig.Metrics {
			// 指标不存在直接跳过
			dataIndex, ok := metricNameMap[metricCfg.MetricName]
			if !ok {
				// 为每个聚合类型添加 N/A
				for range metricCfg.AggTypes {
					row = append(row, "N/A")
				}
				continue
			}

			aggRawDataList := filteredData.V[dataIndex]
			nameCfg := metricCfg.MetricName
			aggTypeListCfg := metricCfg.AggTypes
			unitCfg := ""
			transformCfg := ""

			// 获取指标配置
			if metricConfig, ok := metricsConfig[nameCfg]; ok {
				if metricConfig.IsSetUnit() {
					unitCfg = metricConfig.GetUnit()
				}
				if metricConfig.IsSetTransform() {
					transformCfg = metricConfig.GetTransform()
				}
			}

			// 为每个聚合类型计算值
			for _, aggTypeStr := range aggTypeListCfg {
				aggType := pkgaggregator.AggregationType(aggTypeStr)
				aggTypeIndex := aggType.Index()

				// 聚合数据不存在直接跳过
				if aggTypeIndex >= len(aggRawDataList) || len(aggRawDataList[aggTypeIndex]) == 0 {
					row = append(row, "N/A")
					continue
				}

				rawDataList := aggRawDataList[aggTypeIndex]

				// 计算指标值（使用 dataprocess 的聚合函数）
				value := CalculateMetricValue(aggType, transformCfg, rawDataList)

				// 格式化显示
				valueStr := utils.FormatValue(value, unitCfg, 2)
				row = append(row, valueStr)
			}
		}

		content = append(content, row)
	}

	table.Table = content
	return table
}

// FilterCompressedDataByConfig 根据 SummaryConfig 过滤压缩数据
// 只保留配置中需要的指标和聚合类型
//
// 调用场景:
// - biz/points/v1/handler.go: 在生成表格前过滤数据
// - 减少不必要的数据传输
func FilterCompressedDataByConfig(compressedData *PointsResponse, summaryConfig *datasourceV1.SummaryConfig) *PointsResponse {
	if len(compressedData.K)%2 != 0 {
		return compressedData
	}

	filteredData := &PointsResponse{
		K: make([]string, 0),
		V: make([][][]RawData, 0),
	}

	// 根据SummaryConfig过滤掉不需要的metrics点位
	for i := 0; i < len(compressedData.K); i += 2 {
		nameIndex := i
		labelIndex := i + 1
		rawDataIndex := i / 2
		name := compressedData.K[nameIndex]
		labelstr := compressedData.K[labelIndex]
		aggRawData := compressedData.V[rawDataIndex]

		// 根据SummaryConfig过滤掉不需要的metrics点位
		for _, metricCfg := range summaryConfig.Metrics {
			if metricCfg.MetricName == name {
				filteredData.K = append(filteredData.K, name, labelstr)

				// 初始化每个聚合类型的数据为空切片（而非 nil）
				aggTypeData := make([][]RawData, len(pkgaggregator.AggregationTypeList))
				for i := range aggTypeData {
					aggTypeData[i] = make([]RawData, 0)
				}
				filteredData.V = append(filteredData.V, aggTypeData)

				// 如果匹配，留下，准备注入到filteredData中
				for _, aggType := range metricCfg.AggTypes {
					aggTypeIndex := pkgaggregator.AggregationType(aggType).Index()
					// 看下V是否有对应的aggTypeIndex的数据
					if aggTypeIndex < len(aggRawData) && len(aggRawData[aggTypeIndex]) > 0 {
						// 使用 filteredData 的当前索引，而不是原始数据的索引
						currentIndex := len(filteredData.V) - 1
						filteredData.V[currentIndex][aggTypeIndex] = aggRawData[aggTypeIndex]
					}
				}
				break
			}
		}
	}

	return filteredData
}

// BuildMetricConfigMap 从 datasource 的 groupmap 构建指标配置映射
// 方便快速查找指标的配置（别名、单位、转换等）
//
// 调用场景:
// - biz/points/v1/handler.go: QueryPoints 中准备表格生成的配置
// - biz/report/v1: 报告生成时获取指标配置
func BuildMetricConfigMap(groupmap map[string][]*datasourceV1.MetricConfig) map[string]*datasourceV1.MetricConfig {
	metricConfigMap := make(map[string]*datasourceV1.MetricConfig)
	for _, group := range groupmap {
		for _, mc := range group {
			metricConfigMap[mc.Name] = mc
		}
	}
	return metricConfigMap
}

// GenerateMultipleTables 为多个 SummaryConfig 生成多个表格
// 批量处理，提高效率
//
// 调用场景:
// - biz/points/v1/handler.go: QueryPoints 中一次性生成所有配置的表格
func GenerateMultipleTables(compressedData *PointsResponse,
	summaryConfigs []*datasourceV1.SummaryConfig,
	metricConfigMap map[string]*datasourceV1.MetricConfig) []*SummaryTable {

	tables := make([]*SummaryTable, 0, len(summaryConfigs))

	for _, summaryConfig := range summaryConfigs {
		// 过滤数据
		filteredData := FilterCompressedDataByConfig(compressedData, summaryConfig)

		// 生成表格
		table := BuildSummaryTable(summaryConfig.GetName(), summaryConfig, metricConfigMap, filteredData)
		tables = append(tables, table)
	}

	return tables
}

// ExportTableToCSV 将表格导出为 CSV 格式
//
// 调用场景:
// - biz/report/v1: 导出报告数据
// - 前端下载功能
func ExportTableToCSV(table *SummaryTable) string {
	var csv string
	for _, row := range table.Table {
		for i, cell := range row {
			if i > 0 {
				csv += ","
			}
			// 简单的 CSV 转义（如果包含逗号或引号则用引号包裹）
			if containsCommaOrQuote(cell) {
				csv += fmt.Sprintf("\"%s\"", cell)
			} else {
				csv += cell
			}
		}
		csv += "\n"
	}
	return csv
}

func containsCommaOrQuote(s string) bool {
	for _, c := range s {
		if c == ',' || c == '"' {
			return true
		}
	}
	return false
}
