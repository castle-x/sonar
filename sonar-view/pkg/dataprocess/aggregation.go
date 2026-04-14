package dataprocess

import (
	"math"
	pkgaggregator "sonar-view/pkg/aggregator"
)

func AggregateValues(values []RawData, aggType pkgaggregator.AggregationType) float64 {
	if len(values) == 0 {
		return 0
	}
	min := math.MaxFloat64
	max := -math.MaxFloat64
	sum := 0.0
	for _, point := range values {
		v := point.V
		sum += v
		if v < min {
			min = v
		}
		if v > max {
			max = v
		}
	}
	switch aggType {
	case pkgaggregator.AggregationTypeAvg:
		return sum / float64(len(values))
	case pkgaggregator.AggregationTypeMin:
		return min
	case pkgaggregator.AggregationTypeMax:
		return max
	case pkgaggregator.AggregationTypeCount:
		return sum
	case pkgaggregator.AggregationTypeLast:
		return values[len(values)-1].V
	default:
		return 0
	}
}

func CalculatePercentile(values []RawData, p float64) float64 {
	if len(values) == 0 {
		return 0
	}
	nums := make([]float64, len(values))
	for i, v := range values {
		nums[i] = v.V
	}
	for i := 0; i < len(nums); i++ {
		for j := i + 1; j < len(nums); j++ {
			if nums[i] > nums[j] {
				nums[i], nums[j] = nums[j], nums[i]
			}
		}
	}
	idx := int(float64(len(nums)-1) * p / 100)
	return nums[idx]
}

func AggregateByWindow(values []RawData, aggTypes []pkgaggregator.AggregationType) map[pkgaggregator.AggregationType]float64 {
	result := make(map[pkgaggregator.AggregationType]float64)
	for _, aggType := range aggTypes {
		result[aggType] = AggregateValues(values, aggType)
	}
	return result
}
