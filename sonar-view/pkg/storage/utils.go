package storage

import (
	"sort"
	"strings"
)

func NormalizeLabels(labels map[string]string) map[string]string {
	if labels == nil {
		return make(map[string]string)
	}
	normalized := make(map[string]string, len(labels))
	for k, v := range labels {
		if k == "" || v == "" {
			continue
		}
		normalized[k] = v
	}
	return normalized
}

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

func LabelsToString(labels map[string]string) string {
	if len(labels) == 0 {
		return "{}"
	}
	keys := make([]string, 0, len(labels))
	for k := range labels {
		keys = append(keys, k)
	}
	sort.Strings(keys)
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

func AlignTimestamp(timestamp int64, intervalSeconds int64) int64 {
	return (timestamp / intervalSeconds) * intervalSeconds
}

func ValidateLabels(labels map[string]string) error {
	if labels == nil {
		return nil
	}
	for k, v := range labels {
		if k == "" {
			return ErrInvalidLabels{"label key cannot be empty"}
		}
		if v == "" {
			return ErrInvalidLabels{"label value cannot be empty for key: " + k}
		}
		if len(k) > 255 {
			return ErrInvalidLabels{"label key too long (max 255): " + k}
		}
		if len(v) > 1024 {
			return ErrInvalidLabels{"label value too long (max 1024) for key: " + k}
		}
	}
	return nil
}
