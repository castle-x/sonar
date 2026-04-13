package storage

import (
	"sort"
	"strings"
)

// ============================================
// 标签工具函数
// ============================================

// NormalizeLabels 标准化标签（排序并去除空值）
//
// 参数:
//   - labels: 标签键值对
//
// 返回:
//   - map[string]string: 标准化后的标签
func NormalizeLabels(labels map[string]string) map[string]string {
	if labels == nil {
		return make(map[string]string)
	}

	normalized := make(map[string]string, len(labels))
	for k, v := range labels {
		// 跳过空值
		if k == "" || v == "" {
			continue
		}
		normalized[k] = v
	}

	return normalized
}

// MergeLabels 合并多个标签集（后面的覆盖前面的）
//
// 参数:
//   - labelSets: 标签集列表
//
// 返回:
//   - map[string]string: 合并后的标签
func MergeLabels(labelSets ...map[string]string) map[string]string {
	result := make(map[string]string)
	for _, labels := range labelSets {
		for k, v := range labels {
			if k != "" && v != "" {
				result[k] = v
			}
		}
	}
	return result
}

// LabelsToString 将标签转换为字符串（用于日志和调试）
//
// 参数:
//   - labels: 标签键值对
//
// 返回:
//   - string: 标签字符串，格式：{key1="value1",key2="value2"}
func LabelsToString(labels map[string]string) string {
	if len(labels) == 0 {
		return "{}"
	}

	// 排序键
	keys := make([]string, 0, len(labels))
	for k := range labels {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	// 构建字符串
	var sb strings.Builder
	sb.WriteString("{")
	for i, k := range keys {
		if i > 0 {
			sb.WriteString(",")
		}
		sb.WriteString(k)
		sb.WriteString("=\"")
		sb.WriteString(labels[k])
		sb.WriteString("\"")
	}
	sb.WriteString("}")

	return sb.String()
}

// MatchLabels 检查标签是否匹配选择器
//
// 参数:
//   - labels: 待检查的标签
//   - selector: 选择器（部分匹配）
//
// 返回:
//   - bool: 是否匹配
//
// 示例:
//
//	labels := map[string]string{"env": "prod", "zone": "cn-south"}
//	selector := map[string]string{"env": "prod"}
//	matched := MatchLabels(labels, selector) // true
func MatchLabels(labels, selector map[string]string) bool {
	if len(selector) == 0 {
		return true
	}

	for k, v := range selector {
		if labels[k] != v {
			return false
		}
	}

	return true
}

// ============================================
// 时间工具函数
// ============================================

// AlignTimestamp 将时间戳对齐到指定间隔
//
// 参数:
//   - timestamp: Unix 时间戳（秒）
//   - intervalSeconds: 间隔（秒）
//
// 返回:
//   - int64: 对齐后的时间戳
//
// 示例:
//
//	aligned := AlignTimestamp(1699876823, 60) // 对齐到分钟
//	// 1699876800
func AlignTimestamp(timestamp int64, intervalSeconds int64) int64 {
	return (timestamp / intervalSeconds) * intervalSeconds
}

// ============================================
// 数据验证函数
// ============================================

// ValidateLabels 验证标签是否合法
//
// 参数:
//   - labels: 标签键值对
//
// 返回:
//   - error: 验证失败返回错误，否则返回 nil
func ValidateLabels(labels map[string]string) error {
	if labels == nil {
		return nil
	}

	for k, v := range labels {
		// 检查键
		if k == "" {
			return ErrInvalidLabels{"label key cannot be empty"}
		}

		// 检查值
		if v == "" {
			return ErrInvalidLabels{"label value cannot be empty for key: " + k}
		}

		// 检查长度（Prometheus 限制）
		if len(k) > 255 {
			return ErrInvalidLabels{"label key too long (max 255): " + k}
		}
		if len(v) > 1024 {
			return ErrInvalidLabels{"label value too long (max 1024) for key: " + k}
		}
	}

	return nil
}

// ErrInvalidLabels 无效标签错误
type ErrInvalidLabels struct {
	msg string
}

func (e ErrInvalidLabels) Error() string {
	return "invalid labels: " + e.msg
}
