package aggregator

import "fmt"

type DataQuality struct {
	ActualPoints   int        `json:"actual_points,omitempty"`
	ExpectedPoints int        `json:"expected_points,omitempty"`
	Score          float64    `json:"score"`
	Status         DataStatus `json:"status"`
	MissingReason  string     `json:"missing_reason,omitempty"`
}

type DataStatus string

const (
	DataStatusComplete  DataStatus = "complete"
	DataStatusPartial   DataStatus = "partial"
	DataStatusDegraded  DataStatus = "degraded"
	DataStatusMissing   DataStatus = "missing"
)

func EvaluateDataQuality(actual, expected int, mode FallbackMode) DataQuality {
	quality := DataQuality{ActualPoints: actual, ExpectedPoints: expected}
	if actual >= expected {
		quality.Score = 100.0
		quality.Status = DataStatusComplete
		return quality
	}
	switch mode {
	case FallbackSkip:
		quality.Score = 0.0
		quality.Status = DataStatusMissing
		quality.MissingReason = fmt.Sprintf("Insufficient data: got %d, need %d", actual, expected)
	case FallbackSingle:
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

func (q *DataQuality) IsValid() bool {
	return q.Status != DataStatusMissing
}

func (q *DataQuality) String() string {
	return fmt.Sprintf("status=%s, score=%.1f%%, points=%d/%d",
		q.Status, q.Score, q.ActualPoints, q.ExpectedPoints)
}
