package scoring

import (
	"fmt"
	"math"
	"strconv"
	"strings"

	pointsV1 "monitor_hub/apis/monitor_hub/points/v1"
	reportV1 "monitor_hub/apis/monitor_hub/report/v1"
)

// ============================================
// 常量定义
// ============================================

// DataSource 数据来源常量
const (
	DataSourceSummary = "summary" // 汇总表格（默认）
	DataSourceRate    = "rate"    // Rate 统计
)

// NAHandling N/A 处理策略常量
const (
	NAHandlingSkip    = "skip"     // 跳过，不参与评分（默认）
	NAHandlingAsZero  = "as_zero"  // 视为 0
	NAHandlingAsValue = "as_value" // 视为指定值
)

// MetricRowValue 表示表格中一行的指标值
type MetricRowValue struct {
	Value   float64           // 指标值
	Label   string            // 行标签（如进程名、IP等）
	RowData map[string]string // 原始表格行数据（列名->值）
	IsNA    bool              // 是否为 N/A 值
}

// ============================================
// Rate 统计数据提取
// ============================================

// ExtractRateMetricValue 从 Rate 统计中提取指标值
// rateStatistics: 用例的 Rate 统计数据
// metricName: 指标名称
// 返回: rate 值（每分钟出现次数）、是否找到
func ExtractRateMetricValue(rateStatistics *reportV1.CaseRateStatistics, metricName string) (float64, bool) {
	if rateStatistics == nil || len(rateStatistics.Statistics) == 0 {
		return 0, false
	}

	// 在统计列表中查找匹配的指标
	for _, stat := range rateStatistics.Statistics {
		if stat.MetricName == metricName {
			return stat.Rate, true
		}
	}

	return 0, false
}

// ExtractRateMetricRows 从 Rate 统计中提取指标值（作为单行数据）
// 返回 MetricRowValue 切片，用于与汇总表格数据保持一致的处理流程
func ExtractRateMetricRows(rateStatistics *reportV1.CaseRateStatistics, metricName string) ([]MetricRowValue, bool) {
	rate, found := ExtractRateMetricValue(rateStatistics, metricName)
	if !found {
		return nil, false
	}

	// 构建行数据
	rowData := make(map[string]string)
	rowData["metric_name"] = metricName
	rowData["rate"] = fmt.Sprintf("%.4f", rate)

	// 查找完整的统计信息以填充更多数据
	if rateStatistics != nil {
		for _, stat := range rateStatistics.Statistics {
			if stat.MetricName == metricName {
				rowData["total_count"] = fmt.Sprintf("%d", stat.TotalCount)
				rowData["duration_minutes"] = fmt.Sprintf("%.2f", stat.DurationMinutes)
				break
			}
		}
	}

	return []MetricRowValue{
		{
			Value:   rate,
			Label:   metricName,
			RowData: rowData,
			IsNA:    false,
		},
	}, true
}

// ============================================
// N/A 值处理
// ============================================

// HandleNAValue 处理 N/A 值
// naHandling: N/A 处理策略（skip/as_zero/as_value）
// naValue: 当策略为 as_value 时使用的值
// source: 数据来源（summary/rate），用于决定默认行为
// 返回: 处理后的值、是否应该参与评分
func HandleNAValue(naHandling *string, naValue *float64, source string) (float64, bool) {
	// 获取处理策略
	handling := NAHandlingSkip // 默认跳过

	if naHandling != nil && *naHandling != "" {
		handling = *naHandling
	} else if source == DataSourceRate {
		// Rate 指标默认视为 0（没有出现就是好事）
		handling = NAHandlingAsZero
	}

	switch handling {
	case NAHandlingAsZero:
		return 0, true // 视为 0，参与评分
	case NAHandlingAsValue:
		if naValue != nil {
			return *naValue, true // 视为指定值，参与评分
		}
		return 0, true // 如果没有指定值，默认为 0
	default:
		return 0, false // 跳过，不参与评分
	}
}

// IsNAValue 检查字符串是否为 N/A 值
func IsNAValue(s string) bool {
	s = strings.TrimSpace(strings.ToUpper(s))
	return s == "N/A" || s == "NA" || s == "-" || s == ""
}

// ExtractMetricRowsWithAlias 从汇总表格中提取指标的每行值（支持别名匹配）
// 返回所有行的值和标签，用于逐行评分
// 注意：此函数会标记 N/A 值但不会跳过它们，由调用方决定如何处理
func ExtractMetricRowsWithAlias(tables []*pointsV1.SummaryTable, metricName string, alias string, aggType string) ([]MetricRowValue, error) {
	// 先尝试用别名匹配（如果提供了别名）
	if alias != "" && alias != metricName {
		rows, err := extractMetricRowsByName(tables, alias, aggType)
		if err == nil && len(rows) > 0 {
			return rows, nil
		}
	}

	// 如果别名匹配失败，尝试用原始名称匹配
	return extractMetricRowsByName(tables, metricName, aggType)
}

// extractMetricRowsByName 从汇总表格中提取指标的每行值（内部实现）
// 会保留 N/A 值并标记 IsNA=true
func extractMetricRowsByName(tables []*pointsV1.SummaryTable, metricName string, aggType string) ([]MetricRowValue, error) {
	// 遍历所有表格，找到包含该指标的表格
	for _, table := range tables {
		if table == nil || table.Table == nil || len(table.Table) < 2 {
			continue
		}

		// 检查表头是否包含该指标名称
		header := table.Table[0]
		targetColIdx := -1
		labelColIdx := -1 // 用于标识行的列（如 name, ip 等）

		// 查找目标列和标签列
		for colIdx, colName := range header {
			colNameLower := strings.ToLower(colName)

			// 查找目标指标列
			if strings.Contains(colNameLower, strings.ToLower(metricName)) {
				// 检查是否包含正确的聚合类型后缀
				if strings.Contains(colNameLower, "("+strings.ToLower(aggType)+")") {
					targetColIdx = colIdx
				} else if targetColIdx == -1 {
					// 如果还没找到精确匹配，先记录这个
					targetColIdx = colIdx
				}
			}

			// 查找标签列（优先级：name > host > ip > pid）
			if labelColIdx == -1 {
				if colNameLower == "name" || colNameLower == "名称" {
					labelColIdx = colIdx
				} else if colNameLower == "host" || colNameLower == "主机" {
					labelColIdx = colIdx
				} else if colNameLower == "ip" {
					labelColIdx = colIdx
				} else if colNameLower == "pid" || colNameLower == "进程id" {
					labelColIdx = colIdx
				} else if colNameLower == "request_name" || colNameLower == "请求名称" {
					labelColIdx = colIdx
				} else if colNameLower == "interface" || colNameLower == "接口" {
					labelColIdx = colIdx
				}
			}
		}

		if targetColIdx == -1 {
			continue
		}

		// 提取每行的值
		rows := make([]MetricRowValue, 0, len(table.Table)-1)
		for i := 1; i < len(table.Table); i++ {
			row := table.Table[i]
			if targetColIdx >= len(row) {
				continue
			}

			// 获取原始值字符串
			valueStr := row[targetColIdx]

			// 获取标签
			label := ""
			if labelColIdx >= 0 && labelColIdx < len(row) {
				label = row[labelColIdx]
			}
			if label == "" {
				label = fmt.Sprintf("行%d", i)
			}

			// 构建完整的行数据 map（列名 -> 值）
			rowData := make(map[string]string)
			for colIdx, colName := range header {
				if colIdx < len(row) && colName != "" {
					rowData[colName] = row[colIdx]
				}
			}

			// 检查是否为 N/A 值
			if IsNAValue(valueStr) {
				// N/A 值：标记 IsNA=true，Value 设为 0
				rows = append(rows, MetricRowValue{
					Value:   0,
					Label:   label,
					RowData: rowData,
					IsNA:    true,
				})
			} else {
				// 正常值：解析数值
				value, err := parseNumericValue(valueStr)
				if err != nil {
					continue
				}
				rows = append(rows, MetricRowValue{
					Value:   value,
					Label:   label,
					RowData: rowData,
					IsNA:    false,
				})
			}
		}

		if len(rows) > 0 {
			return rows, nil
		}
	}

	return nil, fmt.Errorf("在汇总表格中未找到指标: %s", metricName)
}

// ExtractMetricValue 从汇总表格中提取指标的聚合值
// tables: 用例的汇总表格列表
// metricName: 指标名称（如 "cpu_usage"）
// aggType: 聚合类型（avg/max/min/p95/p99）
// ExtractMetricValueWithAlias 从汇总表格中提取指标值（支持别名匹配）
// tables: 汇总表格列表
// metricName: 原始指标名称
// alias: 指标别名（优先匹配）
// aggType: 聚合类型
func ExtractMetricValueWithAlias(tables []*pointsV1.SummaryTable, metricName string, alias string, aggType string) (float64, error) {
	// 先尝试用别名匹配（如果提供了别名）
	if alias != "" && alias != metricName {
		value, err := extractMetricValueByName(tables, alias, aggType)
		if err == nil {
			return value, nil
		}
	}

	// 如果别名匹配失败，尝试用原始名称匹配
	return extractMetricValueByName(tables, metricName, aggType)
}

// ExtractMetricValue 从汇总表格中提取指标值（保持向后兼容）
func ExtractMetricValue(tables []*pointsV1.SummaryTable, metricName string, aggType string) (float64, error) {
	return extractMetricValueByName(tables, metricName, aggType)
}

// extractMetricValueByName 从汇总表格中提取指标值（内部实现）
func extractMetricValueByName(tables []*pointsV1.SummaryTable, metricName string, aggType string) (float64, error) {
	// 收集所有可用的表格名称和列名（用于调试）
	availableMetrics := make([]string, 0)

	// 遍历所有表格，找到包含该指标的表格
	for _, table := range tables {
		if table == nil || table.Table == nil || len(table.Table) < 2 {
			continue
		}

		// 收集表格名称
		if table.Name != "" {
			availableMetrics = append(availableMetrics, fmt.Sprintf("表[%s]", table.Name))
		}

		// 检查表格名称是否匹配
		if table.Name != "" && strings.Contains(strings.ToLower(table.Name), strings.ToLower(metricName)) {
			// 找到匹配的表格，提取值
			return extractValueFromTable(table.Table, aggType)
		}

		// 检查表头是否包含该指标名称
		header := table.Table[0]
		for colIdx, colName := range header {
			// 收集列名
			if colName != "" && colName != "IP" && colName != "Case" {
				availableMetrics = append(availableMetrics, fmt.Sprintf("列[%s]", colName))
			}

			if strings.Contains(strings.ToLower(colName), strings.ToLower(metricName)) {
				// 找到匹配的列，提取该列的聚合值
				return extractValueFromColumn(table.Table, colIdx, aggType)
			}
		}
	}

	// 构建详细的错误信息
	return 0, fmt.Errorf("在汇总表格中未找到指标: %s，可用的指标有: %v", metricName, availableMetrics)
}

// extractValueFromTable 从表格中提取聚合值
// table: 二维数组表格（第一行是表头）
// aggType: 聚合类型
func extractValueFromTable(table [][]string, aggType string) (float64, error) {
	if len(table) < 2 {
		return 0, fmt.Errorf("表格数据不足")
	}

	header := table[0]

	// 查找聚合类型对应的列
	aggColIdx := -1
	aggTypeLower := strings.ToLower(aggType)

	for i, colName := range header {
		colNameLower := strings.ToLower(colName)
		// 匹配列名中包含聚合类型的列
		if strings.Contains(colNameLower, aggTypeLower) ||
			strings.Contains(colNameLower, "平均") && aggTypeLower == "avg" ||
			strings.Contains(colNameLower, "最大") && aggTypeLower == "max" ||
			strings.Contains(colNameLower, "最小") && aggTypeLower == "min" {
			aggColIdx = i
			break
		}
	}

	// 如果没有找到特定聚合类型的列，尝试找第一个数值列
	if aggColIdx == -1 {
		for i := 1; i < len(header); i++ {
			if isNumericColumn(table, i) {
				aggColIdx = i
				break
			}
		}
	}

	if aggColIdx == -1 || aggColIdx >= len(table[1]) {
		return 0, fmt.Errorf("未找到聚合类型 %s 对应的列", aggType)
	}

	// 提取第一行数据（通常汇总表只有一行数据）
	valueStr := table[1][aggColIdx]
	value, err := parseNumericValue(valueStr)
	if err != nil {
		return 0, fmt.Errorf("无法解析数值 %s: %w", valueStr, err)
	}

	return value, nil
}

// extractValueFromColumn 从指定列提取聚合值
func extractValueFromColumn(table [][]string, colIdx int, aggType string) (float64, error) {
	if len(table) < 2 || colIdx >= len(table[1]) {
		return 0, fmt.Errorf("列索引超出范围")
	}

	// 收集该列的所有数值
	values := make([]float64, 0, len(table)-1)
	for i := 1; i < len(table); i++ {
		if colIdx >= len(table[i]) {
			continue
		}
		value, err := parseNumericValue(table[i][colIdx])
		if err == nil {
			values = append(values, value)
		}
	}

	if len(values) == 0 {
		return 0, fmt.Errorf("该列没有有效的数值")
	}

	// 根据聚合类型计算
	switch strings.ToLower(aggType) {
	case "avg":
		return calculateAvg(values), nil
	case "max":
		return calculateMax(values), nil
	case "min":
		return calculateMin(values), nil
	case "p95":
		return calculatePercentile(values, 95), nil
	case "p99":
		return calculatePercentile(values, 99), nil
	default:
		// 默认返回平均值
		return calculateAvg(values), nil
	}
}

// parseNumericValue 解析数值字符串
// 支持：123, 123.45, 123%, 123ms, 123MB 等格式
func parseNumericValue(s string) (float64, error) {
	// 移除空格
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, fmt.Errorf("空字符串")
	}

	// 移除常见的单位后缀
	s = strings.TrimSuffix(s, "%")
	s = strings.TrimSuffix(s, "ms")
	s = strings.TrimSuffix(s, "MB")
	s = strings.TrimSuffix(s, "GB")
	s = strings.TrimSuffix(s, "KB")
	s = strings.TrimSuffix(s, "s")
	s = strings.TrimSpace(s)

	// 解析数值
	value, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, err
	}

	return value, nil
}

// isNumericColumn 检查列是否为数值列
func isNumericColumn(table [][]string, colIdx int) bool {
	if len(table) < 2 || colIdx >= len(table[1]) {
		return false
	}

	// 检查该列的第一个数据是否为数值
	_, err := parseNumericValue(table[1][colIdx])
	return err == nil
}

// 聚合计算函数

func calculateAvg(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sum := 0.0
	for _, v := range values {
		sum += v
	}
	return sum / float64(len(values))
}

func calculateMax(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	max := values[0]
	for _, v := range values {
		if v > max {
			max = v
		}
	}
	return max
}

func calculateMin(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	min := values[0]
	for _, v := range values {
		if v < min {
			min = v
		}
	}
	return min
}

func calculatePercentile(values []float64, percentile float64) float64 {
	if len(values) == 0 {
		return 0
	}

	// 排序
	sorted := make([]float64, len(values))
	copy(sorted, values)

	// 简单的冒泡排序（对于小数据集足够）
	for i := 0; i < len(sorted); i++ {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[i] > sorted[j] {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}

	// 计算百分位索引
	index := int(float64(len(sorted)-1) * percentile / 100.0)
	if index >= len(sorted) {
		index = len(sorted) - 1
	}

	return sorted[index]
}

// ApplyTransform 应用转换表达式
// value: 原始值
// transform: 转换表达式（如 "value/1024", "value*100", "value-32"）
// 返回转换后的值，如果transform为空或nil，返回原始值
func ApplyTransform(value float64, transform *string) (float64, error) {
	// 如果没有配置transform，直接返回原始值
	if transform == nil || *transform == "" {
		return value, nil
	}

	expr := strings.TrimSpace(*transform)
	if expr == "" || expr == "value" {
		return value, nil
	}

	// 替换 "value" 为实际的值
	// 支持的操作：+, -, *, /, ^(幂), %
	expr = strings.ReplaceAll(expr, "value", fmt.Sprintf("%f", value))

	// 解析并计算表达式
	result, err := evaluateSimpleExpression(expr)
	if err != nil {
		return value, fmt.Errorf("transform表达式 '%s' 计算失败: %w", *transform, err)
	}

	return result, nil
}

// evaluateSimpleExpression 计算简单的数学表达式
// 支持：+, -, *, /, ()
func evaluateSimpleExpression(expr string) (float64, error) {
	expr = strings.TrimSpace(expr)

	// 移除所有空格
	expr = strings.ReplaceAll(expr, " ", "")

	// 尝试直接解析为数字
	if val, err := strconv.ParseFloat(expr, 64); err == nil {
		return val, nil
	}

	// 处理括号
	for strings.Contains(expr, "(") {
		// 找到最内层的括号
		start := strings.LastIndex(expr, "(")
		if start == -1 {
			break
		}
		end := strings.Index(expr[start:], ")")
		if end == -1 {
			return 0, fmt.Errorf("括号不匹配")
		}
		end += start

		// 计算括号内的表达式
		inner := expr[start+1 : end]
		innerResult, err := evaluateSimpleExpression(inner)
		if err != nil {
			return 0, err
		}

		// 替换括号部分
		expr = expr[:start] + fmt.Sprintf("%f", innerResult) + expr[end+1:]
	}

	// 处理加减法（优先级最低）
	for i := len(expr) - 1; i >= 0; i-- {
		if expr[i] == '+' || (expr[i] == '-' && i > 0 && expr[i-1] >= '0' && expr[i-1] <= '9') {
			left, err := evaluateSimpleExpression(expr[:i])
			if err != nil {
				continue
			}
			right, err := evaluateSimpleExpression(expr[i+1:])
			if err != nil {
				continue
			}
			if expr[i] == '+' {
				return left + right, nil
			}
			return left - right, nil
		}
	}

	// 处理乘除法
	for i := len(expr) - 1; i >= 0; i-- {
		if expr[i] == '*' || expr[i] == '/' || expr[i] == '%' {
			left, err := evaluateSimpleExpression(expr[:i])
			if err != nil {
				continue
			}
			right, err := evaluateSimpleExpression(expr[i+1:])
			if err != nil {
				continue
			}
			switch expr[i] {
			case '*':
				return left * right, nil
			case '/':
				if right == 0 {
					return 0, fmt.Errorf("除数不能为0")
				}
				return left / right, nil
			case '%':
				if right == 0 {
					return 0, fmt.Errorf("除数不能为0")
				}
				return math.Mod(left, right), nil
			}
		}
	}

	// 处理幂运算
	for i := len(expr) - 1; i >= 0; i-- {
		if expr[i] == '^' {
			left, err := evaluateSimpleExpression(expr[:i])
			if err != nil {
				continue
			}
			right, err := evaluateSimpleExpression(expr[i+1:])
			if err != nil {
				continue
			}
			return math.Pow(left, right), nil
		}
	}

	// 如果无法解析，返回错误
	return 0, fmt.Errorf("无法解析表达式: %s", expr)
}
