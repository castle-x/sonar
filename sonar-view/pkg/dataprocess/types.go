package dataprocess

// RawData 原始数据点
type RawData struct {
	T int64   `json:"t"` // 时间戳(Unix 毫秒)
	V float64 `json:"v"` // 值
}

// PointsResponse 压缩数据点响应格式
type PointsResponse struct {
	K []string    `json:"k"` // [name1, labels1, name2, labels2, ...]
	V [][][]RawData `json:"v"` // [metric_index][agg_type_index][time_points]
}

// SummaryTable 汇总表格
type SummaryTable struct {
	Name  string     `json:"name"`
	Table [][]string `json:"table"`
}
