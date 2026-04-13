package dataprocess

import (
	"testing"
)

func TestCalculateRateStatistics(t *testing.T) {
	tests := []struct {
		name           string
		compressedData *PointsResponse
		rateMetrics    []string
		startTimeMs    int64
		endTimeMs      int64
		wantLen        int
		wantRate       float64
		wantCount      int64
	}{
		{
			name: "正常计算 - 单指标单标签",
			compressedData: &PointsResponse{
				K: []string{"http_requests", "method=GET"},
				V: [][][]RawData{
					{
						{}, // avg
						{}, // min
						{}, // max
						{   // count (index=3)
							{T: 1000, V: 100},
							{T: 2000, V: 100},
							{T: 3000, V: 100},
						},
						{}, // last
					},
				},
			},
			rateMetrics: []string{"http_requests"},
			startTimeMs: 0,
			endTimeMs:   60000, // 1 分钟
			wantLen:     1,
			wantRate:    300.0, // 300 / 1 分钟 = 300
			wantCount:   300,
		},
		{
			name: "正常计算 - 单指标多标签",
			compressedData: &PointsResponse{
				K: []string{
					"http_requests", "method=GET",
					"http_requests", "method=POST",
				},
				V: [][][]RawData{
					{
						{}, {}, {},
						{{T: 1000, V: 100}}, // count for GET
						{},
					},
					{
						{}, {}, {},
						{{T: 1000, V: 50}}, // count for POST
						{},
					},
				},
			},
			rateMetrics: []string{"http_requests"},
			startTimeMs: 0,
			endTimeMs:   60000,
			wantLen:     1,
			wantRate:    150.0, // (100 + 50) / 1 分钟
			wantCount:   150,
		},
		{
			name: "多指标计算",
			compressedData: &PointsResponse{
				K: []string{
					"http_requests", "method=GET",
					"db_queries", "type=select",
				},
				V: [][][]RawData{
					{
						{}, {}, {},
						{{T: 1000, V: 120}},
						{},
					},
					{
						{}, {}, {},
						{{T: 1000, V: 60}},
						{},
					},
				},
			},
			rateMetrics: []string{"http_requests", "db_queries"},
			startTimeMs: 0,
			endTimeMs:   60000,
			wantLen:     2,
			wantRate:    120.0, // 第一个指标的 rate
			wantCount:   120,
		},
		{
			name: "指标不存在",
			compressedData: &PointsResponse{
				K: []string{"http_requests", "method=GET"},
				V: [][][]RawData{
					{
						{}, {}, {},
						{{T: 1000, V: 100}},
						{},
					},
				},
			},
			rateMetrics: []string{"not_exist_metric"},
			startTimeMs: 0,
			endTimeMs:   60000,
			wantLen:     0,
			wantRate:    0,
			wantCount:   0,
		},
		{
			name:           "空数据",
			compressedData: &PointsResponse{K: []string{}, V: [][][]RawData{}},
			rateMetrics:    []string{"http_requests"},
			startTimeMs:    0,
			endTimeMs:      60000,
			wantLen:        0,
			wantRate:       0,
			wantCount:      0,
		},
		{
			name:           "nil 数据",
			compressedData: nil,
			rateMetrics:    []string{"http_requests"},
			startTimeMs:    0,
			endTimeMs:      60000,
			wantLen:        0,
			wantRate:       0,
			wantCount:      0,
		},
		{
			name: "无效时间范围",
			compressedData: &PointsResponse{
				K: []string{"http_requests", "method=GET"},
				V: [][][]RawData{
					{
						{}, {}, {},
						{{T: 1000, V: 100}},
						{},
					},
				},
			},
			rateMetrics: []string{"http_requests"},
			startTimeMs: 60000, // 结束时间小于开始时间
			endTimeMs:   0,
			wantLen:     0,
			wantRate:    0,
			wantCount:   0,
		},
		{
			name: "长时间范围计算",
			compressedData: &PointsResponse{
				K: []string{"http_requests", "method=GET"},
				V: [][][]RawData{
					{
						{}, {}, {},
						{{T: 1000, V: 6000}}, // 60 分钟内总共 6000 次
						{},
					},
				},
			},
			rateMetrics: []string{"http_requests"},
			startTimeMs: 0,
			endTimeMs:   3600000, // 60 分钟
			wantLen:     1,
			wantRate:    100.0, // 6000 / 60 = 100 次/分钟
			wantCount:   6000,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			results := CalculateRateStatistics(tt.compressedData, tt.rateMetrics, tt.startTimeMs, tt.endTimeMs)

			if len(results) != tt.wantLen {
				t.Errorf("CalculateRateStatistics() returned %d results, want %d", len(results), tt.wantLen)
				return
			}

			if tt.wantLen > 0 && len(results) > 0 {
				// 验证第一个结果
				result := results[0]
				if result.Rate != tt.wantRate {
					t.Errorf("CalculateRateStatistics() rate = %v, want %v", result.Rate, tt.wantRate)
				}
				if result.TotalCount != tt.wantCount {
					t.Errorf("CalculateRateStatistics() totalCount = %v, want %v", result.TotalCount, tt.wantCount)
				}
			}
		})
	}
}

func TestCalculateCaseRateStatistics(t *testing.T) {
	tests := []struct {
		name           string
		caseName       string
		compressedData *PointsResponse
		rateMetrics    []string
		startTimeMs    int64
		endTimeMs      int64
		wantNil        bool
		wantStatCount  int
	}{
		{
			name:     "正常计算",
			caseName: "test_case_1",
			compressedData: &PointsResponse{
				K: []string{"http_requests", "method=GET"},
				V: [][][]RawData{
					{
						{}, {}, {},
						{{T: 1000, V: 100}},
						{},
					},
				},
			},
			rateMetrics:   []string{"http_requests"},
			startTimeMs:   0,
			endTimeMs:     60000,
			wantNil:       false,
			wantStatCount: 1,
		},
		{
			name:           "空 rateMetrics 返回 nil",
			caseName:       "test_case_2",
			compressedData: &PointsResponse{K: []string{}, V: [][][]RawData{}},
			rateMetrics:    []string{},
			startTimeMs:    0,
			endTimeMs:      60000,
			wantNil:        true,
			wantStatCount:  0,
		},
		{
			name:           "nil rateMetrics 返回 nil",
			caseName:       "test_case_3",
			compressedData: &PointsResponse{K: []string{}, V: [][][]RawData{}},
			rateMetrics:    nil,
			startTimeMs:    0,
			endTimeMs:      60000,
			wantNil:        true,
			wantStatCount:  0,
		},
		{
			name:     "指标不存在返回 nil",
			caseName: "test_case_4",
			compressedData: &PointsResponse{
				K: []string{"http_requests", "method=GET"},
				V: [][][]RawData{
					{
						{}, {}, {},
						{{T: 1000, V: 100}},
						{},
					},
				},
			},
			rateMetrics:   []string{"not_exist"},
			startTimeMs:   0,
			endTimeMs:     60000,
			wantNil:       true,
			wantStatCount: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := CalculateCaseRateStatistics(tt.caseName, tt.compressedData, tt.rateMetrics, tt.startTimeMs, tt.endTimeMs)

			if tt.wantNil {
				if result != nil {
					t.Errorf("CalculateCaseRateStatistics() = %v, want nil", result)
				}
				return
			}

			if result == nil {
				t.Errorf("CalculateCaseRateStatistics() = nil, want non-nil")
				return
			}

			if result.CaseName != tt.caseName {
				t.Errorf("CalculateCaseRateStatistics() caseName = %v, want %v", result.CaseName, tt.caseName)
			}

			if len(result.Statistics) != tt.wantStatCount {
				t.Errorf("CalculateCaseRateStatistics() statistics count = %v, want %v", len(result.Statistics), tt.wantStatCount)
			}
		})
	}
}
