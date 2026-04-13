package aggregator

import "fmt"

// ============================================
// 数据质量
// ============================================

// DataQuality 数据质量标记
type DataQuality struct {
	// ActualPoints 实际采样点数
	ActualPoints int `json:"actual_points,omitempty"`

	// ExpectedPoints 期望采样点数
	ExpectedPoints int `json:"expected_points,omitempty"`

	// Score 质量分数 (0-100)
	// 100: 完整数据
	// 50-99: 部分数据
	// 1-49: 数据严重缺失
	// 0: 无数据
	Score float64 `json:"score"`

	// Status 状态标记
	Status DataStatus `json:"status"`

	// MissingReason 缺失原因（可选）
	MissingReason string `json:"missing_reason,omitempty"`
}

// DataStatus 数据状态
type DataStatus string

const (
	// DataStatusComplete 完整数据
	DataStatusComplete DataStatus = "complete"

	// DataStatusPartial 部分数据
	DataStatusPartial DataStatus = "partial"

	// DataStatusDegraded 降级数据（单点聚合）
	DataStatusDegraded DataStatus = "degraded"

	// DataStatusMissing 数据缺失
	DataStatusMissing DataStatus = "missing"
)

// ============================================
// 质量评估
// ============================================

// EvaluateDataQuality 评估数据质量
func EvaluateDataQuality(actual, expected int, mode FallbackMode) DataQuality {
	quality := DataQuality{
		ActualPoints:   actual,
		ExpectedPoints: expected,
	}

	// 计算质量分数
	if actual >= expected {
		quality.Score = 100.0
		quality.Status = DataStatusComplete
		return quality
	}

	// 数据不足，根据降级模式判断
	switch mode {
	case FallbackSkip:
		// 不允许降级，标记为缺失
		quality.Score = 0.0
		quality.Status = DataStatusMissing
		quality.MissingReason = fmt.Sprintf("Insufficient data: got %d, need %d", actual, expected)

	case FallbackSingle:
		// 允许单点聚合
		if actual >= 1 {
			quality.Score = float64(actual) / float64(expected) * 100
			quality.Status = DataStatusDegraded
			quality.MissingReason = "Single-point aggregation (service restart)"
		} else {
			quality.Score = 0.0
			quality.Status = DataStatusMissing
			quality.MissingReason = "No data points available"
		}

	case FallbackPartial:
		// 允许部分聚合（>=50%）
		minPartial := expected / 2
		if expected == 1 {
			minPartial = 1
		}

		if actual >= minPartial {
			quality.Score = float64(actual) / float64(expected) * 100
			quality.Status = DataStatusPartial
			quality.MissingReason = fmt.Sprintf("Partial data: %d/%d points", actual, expected)
		} else {
			quality.Score = 0.0
			quality.Status = DataStatusMissing
			quality.MissingReason = fmt.Sprintf("Too few points: got %d, need at least %d", actual, minPartial)
		}
	}

	return quality
}

// IsValid 检查质量是否有效（可以进行聚合）
func (q *DataQuality) IsValid() bool {
	return q.Status != DataStatusMissing
}

// String 返回质量描述
func (q *DataQuality) String() string {
	return fmt.Sprintf("status=%s, score=%.1f%%, points=%d/%d",
		q.Status, q.Score, q.ActualPoints, q.ExpectedPoints)
}
