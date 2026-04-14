package dataprocess

import (
	"log"
	"time"

	pkgaggregator "sonar-view/pkg/aggregator"
)

func BuildCompressedData(points []pkgaggregator.AggregatedPoint) *PointsResponse {
	startTime := time.Now()
	uniqueLabels := make(map[string]int)
	compressedData := &PointsResponse{
		K: make([]string, 0),
		V: make([][][]RawData, 0),
	}
	for i := range points {
		point := &points[i]
		name := point.Name
		labelstr := point.Labels.String()
		uniqueKey := name + "|" + labelstr
		if _, ok := uniqueLabels[uniqueKey]; !ok {
			uniqueLabels[uniqueKey] = len(compressedData.V)
			compressedData.K = append(compressedData.K, name, labelstr)
			aggTypeData := make([][]RawData, len(pkgaggregator.AggregationTypeList))
			for i := range aggTypeData {
				aggTypeData[i] = make([]RawData, 0)
			}
			compressedData.V = append(compressedData.V, aggTypeData)
		}
		index := uniqueLabels[uniqueKey]
		aggTypeIndex := point.AggregationType.Index()
		compressedData.V[index][aggTypeIndex] = append(compressedData.V[index][aggTypeIndex], RawData{
			T: point.Timestamp.Time().UnixMilli(),
			V: point.Value,
		})
	}
	log.Printf("[DEBUG] dataprocess: build compressed data: %v ms, %v points, %v keys",
		time.Since(startTime).Milliseconds(), len(points), len(compressedData.K)/2)
	return compressedData
}

func FilterCompressedData(compressedData *PointsResponse, metricNames []string) *PointsResponse {
	if len(compressedData.K)%2 != 0 {
		return compressedData
	}
	metricSet := make(map[string]bool)
	for _, name := range metricNames {
		metricSet[name] = true
	}
	filteredData := &PointsResponse{
		K: make([]string, 0),
		V: make([][][]RawData, 0),
	}
	for i := 0; i < len(compressedData.K); i += 2 {
		name := compressedData.K[i]
		labelstr := compressedData.K[i+1]
		rawDataIndex := i / 2
		if metricSet[name] {
			filteredData.K = append(filteredData.K, name, labelstr)
			filteredData.V = append(filteredData.V, compressedData.V[rawDataIndex])
		}
	}
	return filteredData
}

func MergeCompressedData(dataList ...*PointsResponse) *PointsResponse {
	if len(dataList) == 0 {
		return &PointsResponse{K: make([]string, 0), V: make([][][]RawData, 0)}
	}
	if len(dataList) == 1 {
		return dataList[0]
	}
	merged := &PointsResponse{K: make([]string, 0), V: make([][][]RawData, 0)}
	uniqueKeys := make(map[string]int)
	for _, data := range dataList {
		if len(data.K)%2 != 0 {
			continue
		}
		for i := 0; i < len(data.K); i += 2 {
			name := data.K[i]
			labelstr := data.K[i+1]
			uniqueKey := name + "|" + labelstr
			rawDataIndex := i / 2
			if existingIndex, exists := uniqueKeys[uniqueKey]; exists {
				for aggTypeIdx := range data.V[rawDataIndex] {
					merged.V[existingIndex][aggTypeIdx] = append(merged.V[existingIndex][aggTypeIdx], data.V[rawDataIndex][aggTypeIdx]...)
				}
			} else {
				uniqueKeys[uniqueKey] = len(merged.V)
				merged.K = append(merged.K, name, labelstr)
				merged.V = append(merged.V, data.V[rawDataIndex])
			}
		}
	}
	return merged
}

func CountMetrics(data *PointsResponse) int {
	if len(data.K)%2 != 0 {
		return 0
	}
	return len(data.K) / 2
}

func CountPoints(data *PointsResponse) int {
	total := 0
	for _, metricData := range data.V {
		for _, aggTypeData := range metricData {
			total += len(aggTypeData)
		}
	}
	return total
}
