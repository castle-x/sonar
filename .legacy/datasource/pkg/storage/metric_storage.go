package storage

import (
	v1 "datasource/apis/datasource/metrics/v1"
)

type MetricStorage struct {
	Storage[*v1.MetricPoint]
}

func NewMetricStorage(storage Storage[*v1.MetricPoint]) *MetricStorage {
	return &MetricStorage{Storage: storage}
}
