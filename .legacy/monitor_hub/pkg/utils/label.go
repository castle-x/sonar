package utils

import (
	"fmt"
	"strings"
)

// ParseLabelStr 解析 Prometheus 格式的标签字符串为 map
// 输入示例: {ip="192.168.1.1",pid="123",app="test"}
// 输出示例: map[string]string{"ip": "192.168.1.1", "pid": "123", "app": "test"}
//
// 调用场景:
// - biz/points/v1/handler.go: NewSummaryTable 中解析标签生成表格行
// - biz/report/v1/service.go: 生成报告时解析标签
// - pkg/summary: 表格生成时解析标签
func ParseLabelStr(labelstr string) map[string]string {
	result := make(map[string]string)

	// 去除首尾的大括号
	labelstr = strings.Trim(labelstr, "{}")
	if labelstr == "" {
		return result
	}

	// 按逗号分割标签
	pairs := strings.Split(labelstr, ",")
	for _, pair := range pairs {
		// 分割键值对
		parts := strings.SplitN(pair, "=", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		value := strings.Trim(strings.TrimSpace(parts[1]), "\"")
		result[key] = value
	}

	return result
}

// BuildLabelStr 从 map 构建 Prometheus 格式的标签字符串
// 输入示例: map[string]string{"ip": "192.168.1.1", "pid": "123"}
// 输出示例: {ip="192.168.1.1",pid="123"}
//
// 调用场景:
// - pkg/aggregation: 聚合数据时构建标签字符串
// - pkg/summary: 生成表格时重建标签字符串
func BuildLabelStr(labels map[string]string) string {
	if len(labels) == 0 {
		return "{}"
	}

	var pairs []string
	for k, v := range labels {
		pairs = append(pairs, fmt.Sprintf("%s=\"%s\"", k, v))
	}

	return "{" + strings.Join(pairs, ",") + "}"
}

// TrimLabelStr 根据配置的标签列表裁剪标签字符串
// 只保留 keepLabels 中指定的标签，并按照 keepLabels 的顺序排列
//
// 输入示例:
//
//	labelstr: {ip="192.168.1.1",pid="123",app="test",host="server1"}
//	keepLabels: ["ip", "app"]
//
// 输出示例: {ip="192.168.1.1",app="test"}
//
// 调用场景:
// - biz/points/v1/handler.go: NewSummaryTable 中根据配置裁剪标签
// - pkg/summary: 表格生成时统一标签维度
func TrimLabelStr(labelstr string, keepLabels []string) string {
	labelMap := ParseLabelStr(labelstr)

	// 按照 keepLabels 的顺序拼接
	newLabelstr := "{"
	for _, cfgLabel := range keepLabels {
		if value, ok := labelMap[cfgLabel]; ok {
			newLabelstr += fmt.Sprintf("%s=\"%s\",", cfgLabel, value)
		}
	}

	newLabelstr = strings.TrimRight(newLabelstr, ",") + "}"
	return newLabelstr
}

// ExtractLabelValue 从标签字符串中提取指定标签的值
// 输入示例: labelstr: {ip="192.168.1.1",pid="123"}, key: "ip"
// 输出示例: "192.168.1.1", true
//
// 调用场景:
// - biz/report/v1: 报告生成时提取特定标签值
// - pkg/aggregation: 数据聚合时提取标签进行分组
func ExtractLabelValue(labelstr, key string) (string, bool) {
	labelMap := ParseLabelStr(labelstr)
	value, ok := labelMap[key]
	return value, ok
}

// MatchLabels 检查标签字符串是否匹配过滤条件
// filters 中的所有键值对都必须匹配才返回 true
//
// 输入示例:
//
//	labelstr: {ip="192.168.1.1",pid="123",app="test"}
//	filters: map[string]string{"app": "test", "ip": "192.168.1.1"}
//
// 输出: true
//
// 调用场景:
// - biz/points/v1: 过滤数据点
// - biz/report/v1: 根据标签筛选指标数据
// - pkg/aggregation: 查询时过滤数据
func MatchLabels(labelstr string, filters map[string]string) bool {
	if len(filters) == 0 {
		return true
	}

	labelMap := ParseLabelStr(labelstr)

	for key, expectedValue := range filters {
		actualValue, exists := labelMap[key]
		if !exists || actualValue != expectedValue {
			return false
		}
	}

	return true
}

// MergeLabels 合并多个标签 map，后面的会覆盖前面的
//
// 调用场景:
// - pkg/aggregation: 合并查询时的默认标签和自定义标签
// - biz/datasource: 合并数据源配置的标签
func MergeLabels(labelMaps ...map[string]string) map[string]string {
	result := make(map[string]string)

	for _, labelMap := range labelMaps {
		for k, v := range labelMap {
			result[k] = v
		}
	}

	return result
}

// LabelStrToSlice 将标签字符串转换为键值对切片（偶数个元素）
// 输入示例: {ip="192.168.1.1",pid="123"}
// 输出示例: ["ip", "192.168.1.1", "pid", "123"]
//
// 调用场景:
// - apis/monitor_hub/report/v1: QueryFilter 中的 labels 字段格式
// - biz/report/v1: 构建查询过滤器
func LabelStrToSlice(labelstr string) []string {
	labelMap := ParseLabelStr(labelstr)

	var result []string
	for k, v := range labelMap {
		result = append(result, k, v)
	}

	return result
}

// SliceToLabelMap 将键值对切片转换为 map
// 输入示例: ["ip", "192.168.1.1", "pid", "123"]
// 输出示例: map[string]string{"ip": "192.168.1.1", "pid": "123"}
//
// 调用场景:
// - biz/points/v1: buildTsdbQueryList 中处理 filters
// - biz/report/v1: 处理 QueryFilter 的 labels 字段
func SliceToLabelMap(labels []string) map[string]string {
	result := make(map[string]string)

	// 标签切片应该是偶数个元素（key-value 对）
	for i := 0; i < len(labels)-1; i += 2 {
		key := labels[i]
		value := labels[i+1]
		result[key] = value
	}

	return result
}
