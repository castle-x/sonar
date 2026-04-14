package scoring

// ScoringRange 评分区间
type ScoringRange struct {
	Min   float64 `json:"min"`
	Max   float64 `json:"max"`
	Score int32   `json:"score"`
	Level string  `json:"level"`
}

// ThresholdCondition 阈值条件
type ThresholdCondition struct {
	Operator string  `json:"operator"`
	Value    float64 `json:"value"`
	Score    int32   `json:"score"`
	Level    string  `json:"level"`
}

// MetricScoringConfig 指标评分配置
type MetricScoringConfig struct {
	Name             string                `json:"name"`
	Alias            *string               `json:"alias,omitempty"`
	Weight           float64               `json:"weight"`
	Unit             *string               `json:"unit,omitempty"`
	AggregationTypes []string              `json:"aggregation_types"`
	ScoringType      string                `json:"scoring_type"`
	Ranges           []*ScoringRange       `json:"ranges,omitempty"`
	Thresholds       []*ThresholdCondition `json:"thresholds,omitempty"`
	Source           *string               `json:"source,omitempty"`
	NaHandling       *string               `json:"na_handling,omitempty"`
	NaValue          *float64              `json:"na_value,omitempty"`
	Transform        *string               `json:"transform,omitempty"`
}

// CaseScoringConfig 用例评分配置
type CaseScoringConfig struct {
	CaseName      string                 `json:"case_name"`
	MetricConfigs []*MetricScoringConfig `json:"metric_configs"`
}

// MetricScore 指标得分
type MetricScore struct {
	MetricName    string            `json:"metric_name"`
	DisplayName   string            `json:"display_name"`
	Value         float64           `json:"value"`
	Score         int32             `json:"score"`
	WeightedScore float64           `json:"weighted_score"`
	Level         string            `json:"level"`
	Weight        float64           `json:"weight"`
	Unit          string            `json:"unit"`
	OriginalValue *float64          `json:"original_value,omitempty"`
	Matched       *bool             `json:"matched,omitempty"`
	RowData       map[string]string `json:"row_data,omitempty"`
}

// CaseScore 用例得分
type CaseScore struct {
	CaseName      string         `json:"case_name"`
	Score         float64        `json:"score"`
	WeightedScore float64        `json:"weighted_score"`
	Level         string         `json:"level"`
	Weight        float64        `json:"weight"`
	MetricScores  []*MetricScore `json:"metric_scores"`
}

// ReportScore 报告总分
type ReportScore struct {
	TotalScore  float64      `json:"total_score"`
	Level       string       `json:"level"`
	CaseScores  []*CaseScore `json:"case_scores"`
	EvaluatedAt int64        `json:"evaluated_at"`
}

// MetricRowValue 表格中一行的指标值
type MetricRowValue struct {
	Value   float64
	Label   string
	RowData map[string]string
	IsNA    bool
}

const (
	DataSourceSummary = "summary"
	DataSourceRate    = "rate"
	NAHandlingSkip    = "skip"
	NAHandlingAsZero  = "as_zero"
	NAHandlingAsValue = "as_value"
)

// SummaryTable 汇总表格（用于评分提取）
type SummaryTable struct {
	Name  string     `json:"name"`
	Table [][]string `json:"table"`
}

// SnapshotScore 快照评分结果
type SnapshotScore struct {
	SnapshotID  string       `json:"snapshot_id" bson:"snapshot_id"`
	TotalScore  float64      `json:"total_score" bson:"total_score"`
	Level       string       `json:"level" bson:"level"`
	CaseScores  []*CaseScore `json:"case_scores" bson:"case_scores"`
	EvaluatedAt int64        `json:"evaluated_at" bson:"evaluated_at"`
}

// ScoringConfig 评分配置
type ScoringConfig struct {
	Name        string               `json:"name" bson:"name"`
	Description string               `json:"description" bson:"description"`
	Cases       []*CaseScoringConfig `json:"cases" bson:"cases"`
}
