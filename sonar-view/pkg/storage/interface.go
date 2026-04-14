package storage

import (
	"context"
	"time"

	"github.com/prometheus/prometheus/model/labels"
)

type Labels = labels.Labels
type Label = labels.Label

type Storage[T any] interface {
	Write(ctx context.Context, points []T) error
	QueryByLabels(ctx context.Context, req *LabelQuery) ([]T, error)
	QueryByPromQL(ctx context.Context, req *PromQLQuery) ([]T, error)
	GetStats(ctx context.Context) (*Stats, error)
	Delete(ctx context.Context, startTime, endTime int64, labels map[string]string) error
	Close() error
}

type LabelQuery struct {
	MetricName string
	Labels     Labels
	StartTime  int64
	EndTime    int64
	Limit      int
}

type PromQLQuery struct {
	Query     string
	StartTime int64
	EndTime   int64
	Step      time.Duration
}

type QueryResult struct {
	Points     []*DataPoint
	TotalCount int64
	StartTime  int64
	EndTime    int64
}

type DataPoint struct {
	MetricName string
	Labels     Labels
	Timestamp  int64
	Value      float64
}

type Serializer[T any] interface {
	ToLabels(point T) Labels
	ToTimestamp(point T) int64
	FromDataPoint(dp *DataPoint) T
	ToValue(point T) float64
}

type Config struct {
	DataDir               string
	RetentionDays         int
	CompactionInterval    time.Duration
	MaxChunkSize          int64
	WriteBufferSize       int
	MixBlockDuration      time.Duration
	MaxBlockDuration      time.Duration
	MemoryCleanupInterval time.Duration
}

type Stats struct {
	TotalSeries        int64 `json:"total_series"`
	TotalSamples       int64 `json:"total_samples"`
	DiskSize           int64 `json:"disk_size"`
	MinTime            int64 `json:"min_time"`
	MaxTime            int64 `json:"max_time"`
	LastCompactionTime int64 `json:"last_compaction_time"`
	LastCleanupTime    int64 `json:"last_cleanup_time"`
	TotalBlocks        int64 `json:"total_blocks"`
}

func ValidateConfig(config *Config) error {
	if config == nil {
		return ErrConfigNil
	}
	if config.DataDir == "" {
		return ErrDataDirEmpty
	}
	if config.RetentionDays <= 0 {
		return ErrInvalidRetentionDays
	}
	if config.WriteBufferSize <= 0 {
		return ErrInvalidBufferSize
	}
	if config.MaxChunkSize <= 0 {
		return ErrInvalidChunkSize
	}
	return nil
}
