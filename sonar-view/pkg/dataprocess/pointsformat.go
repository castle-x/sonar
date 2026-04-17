package dataprocess

import (
	"github.com/castle-x/goutils/ablog"
	"math"
	"strconv"
	"time"

	pkgaggregator "sonar-view/pkg/aggregator"
)

var logger = ablog.NewLogger("dataprocess")

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
	logger.Debug("dataprocess: build compressed data: %v ms, %v points, %v keys",
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

// GenerateSummaryTables creates summary tables from compressed data
// Generates a summary table for each metric, showing aggregation statistics
func GenerateSummaryTables(data *PointsResponse) []*SummaryTable {
	if data == nil || len(data.K) == 0 {
		return make([]*SummaryTable, 0)
	}

	tables := make([]*SummaryTable, 0)

	// Process each metric (K contains alternating name and labelstr)
	for i := 0; i < len(data.K); i += 2 {
		name := data.K[i]
		labelstr := data.K[i+1]
		metricIndex := i / 2

		if metricIndex >= len(data.V) {
			continue
		}

		// Create table for this metric
		table := &SummaryTable{
			Name:  name,
			Table: make([][]string, 0),
		}

		// Add header row: [Metric, Labels, Type, Count, Min, Avg, Max, Last]
		table.Table = append(table.Table, []string{
			"Metric", "Labels", "Type", "Count", "Min", "Avg", "Max", "Last",
		})

		// Collect all aggregation types
		aggTypeData := data.V[metricIndex]
		aggTypes := []pkgaggregator.AggregationType{
			pkgaggregator.AggregationTypeAvg,
			pkgaggregator.AggregationTypeMin,
			pkgaggregator.AggregationTypeMax,
			pkgaggregator.AggregationTypeLast,
		}

		// Add data row for each aggregation type
		for typeIdx, aggType := range aggTypes {
			if typeIdx >= len(aggTypeData) {
				continue
			}

			points := aggTypeData[typeIdx]
			if len(points) == 0 {
				continue
			}

			// Calculate statistics
			min := math.MaxFloat64
			max := -math.MaxFloat64
			sum := 0.0
			var last float64

			for _, point := range points {
				if point.V < min {
					min = point.V
				}
				if point.V > max {
					max = point.V
				}
				sum += point.V
				last = point.V
			}

			avg := sum / float64(len(points))

			// Format values
			formatFloat := func(v float64) string {
				if math.IsInf(v, 0) {
					return "N/A"
				}
				return FormatFloat(v)
			}

			row := []string{
				name,
				labelstr,
				string(aggType),
				FormatInt(int64(len(points))),
				formatFloat(min),
				formatFloat(avg),
				formatFloat(max),
				formatFloat(last),
			}

			table.Table = append(table.Table, row)
		}

		if len(table.Table) > 1 { // Only add if has data rows
			tables = append(tables, table)
		}
	}

	return tables
}

// FormatFloat formats a float64 value with 2 decimal places
func FormatFloat(v float64) string {
	if math.IsNaN(v) {
		return "N/A"
	}
	if math.IsInf(v, 1) {
		return "+Inf"
	}
	if math.IsInf(v, -1) {
		return "-Inf"
	}
	return formatFloatValue(v)
}

// formatFloatValue is a helper to format float with appropriate precision
func formatFloatValue(v float64) string {
	// Use 2 decimal places for display
	return strconv.FormatFloat(v, 'f', 2, 64)
}

// FormatInt formats an int64 value as string
func FormatInt(v int64) string {
	return strconv.FormatInt(v, 10)
}
