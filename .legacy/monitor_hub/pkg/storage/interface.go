package storage

import (
	"context"
	"time"

	"github.com/prometheus/prometheus/model/labels"
)

// ============================================
// 泛型存储接口
// ============================================

type Labels = labels.Labels
type Label = labels.Label

// Storage 通用 TSDB 存储接口
//
// T: 数据点类型（由外部定义，如 MetricPoint, AggregatedPoint 等）
//
// 通过 Serializer[T] 将外部数据结构转换为 Prometheus 内部格式
type Storage[T any] interface {
	// Write 批量写入数据点
	//
	// 参数:
	//   - ctx: 上下文
	//   - points: 数据点列表
	//
	// 返回:
	//   - []string: 新创建的 Series 引用列表
	//   - error: 错误信息
	Write(ctx context.Context, points []T) error

	// QueryByLabels 通过标签查询数据
	//
	// 参数:
	//   - ctx: 上下文
	//   - req: 查询请求
	//
	// 返回:
	//   - []T: 数据点列表（已反序列化）
	//   - error: 错误信息
	QueryByLabels(ctx context.Context, req *LabelQuery) ([]T, error)

	// QueryByPromQL 通过 PromQL 查询数据
	//
	// 参数:
	//   - ctx: 上下文
	//   - req: PromQL 查询请求
	//
	// 返回:
	//   - []T: 数据点列表（已反序列化）
	//   - error: 错误信息
	QueryByPromQL(ctx context.Context, req *PromQLQuery) ([]T, error)

	// GetStats 获取存储统计信息
	//
	// 返回:
	//   - *Stats: 统计信息
	//   - error: 错误信息
	GetStats(ctx context.Context) (*Stats, error)

	// Delete 删除指定时间范围和标签的数据
	//
	// 参数:
	//   - ctx: 上下文
	//   - startTime: 开始时间（Unix 毫秒，包含）
	//   - endTime: 结束时间（Unix 毫秒，包含）
	//   - labels: 标签过滤器（精确匹配）
	//
	// 返回:
	//   - error: 错误信息
	Delete(ctx context.Context, startTime, endTime int64, labels map[string]string) error

	// Close 关闭存储
	//
	// 返回:
	//   - error: 错误信息
	Close() error
}

// ============================================
// 查询请求和结果
// ============================================

// LabelQuery 标签查询请求
type LabelQuery struct {
	// MetricName 指标名称（可选）
	MetricName string

	// Labels 标签过滤器（精确匹配）
	Labels Labels

	// StartTime 开始时间（Unix 毫秒）
	StartTime int64

	// EndTime 结束时间（Unix 毫秒）
	EndTime int64

	// Limit 结果限制（0 表示无限制）
	Limit int
}

// PromQLQuery PromQL 查询请求
type PromQLQuery struct {
	// Query PromQL 查询语句
	Query string

	// StartTime 开始时间（Unix 毫秒）
	StartTime int64

	// EndTime 结束时间（Unix 毫秒）
	EndTime int64

	// Step 查询步长（用于范围查询）
	Step time.Duration
}

// QueryResult 查询结果
type QueryResult struct {
	// Points 数据点列表
	Points []*DataPoint

	// TotalCount 总数量
	TotalCount int64

	// StartTime 实际开始时间（Unix 毫秒）
	StartTime int64

	// EndTime 实际结束时间（Unix 毫秒）
	EndTime int64
}

// DataPoint 通用数据点
type DataPoint struct {
	// MetricName 指标名称
	MetricName string

	// Labels 标签
	Labels Labels

	// Timestamp 时间戳（Unix 毫秒）
	Timestamp int64

	// Value 指标值
	Value float64
}

// ============================================
// 序列化接口（由外部实现）
// ============================================

// Serializer 数据序列化接口
//
// 用于将外部数据类型转换为 Prometheus 内部格式
//
// T: 外部数据类型
type Serializer[T any] interface {
	// ToLabels 将数据点转换为 Prometheus Labels
	//
	// 参数:
	//   - point: 数据点
	//
	// 返回:
	//   - labels.Labels: 标签
	ToLabels(point T) Labels

	// ToTimestamp 提取时间戳（Unix 毫秒）
	//
	// 参数:
	//   - point: 数据点
	//
	// 返回:
	//   - int64: Unix 时间戳（毫秒）
	ToTimestamp(point T) int64

	// FromDataPoint 反序列化：从查询结果转换回数据点
	//
	// 参数:
	//   - dp: TSDB 查询结果数据点
	//
	// 返回:
	//   - T: 业务数据点
	FromDataPoint(dp *DataPoint) T

	// ToValue 提取指标值
	//
	// 参数:
	//   - point: 数据点
	//
	// 返回:
	//   - float64: 指标值
	ToValue(point T) float64
}

// ============================================
// 配置和统计信息
// ============================================

// Config TSDB 存储配置
type Config struct {
	// DataDir 数据目录
	DataDir string

	// RetentionDays 数据保留天数
	RetentionDays int

	// CompactionInterval 数据压缩间隔
	CompactionInterval time.Duration

	// MaxChunkSize 最大块大小（字节）
	MaxChunkSize int64

	// WriteBufferSize 写缓冲区大小
	WriteBufferSize int

	// MixBlockDuration 混合块时长
	MixBlockDuration time.Duration

	// MaxBlockDuration 最大块时长
	MaxBlockDuration time.Duration

	// MemoryCleanupInterval 内存清理间隔
	MemoryCleanupInterval time.Duration
}

// Stats 存储统计信息
type Stats struct {
	// TotalSeries 总 Series 数量
	TotalSeries int64 `json:"total_series"`

	// TotalSamples 总采样点数量
	TotalSamples int64 `json:"total_samples"`

	// DiskSize 磁盘占用大小（字节）
	DiskSize int64 `json:"disk_size"`

	// MinTime 最小时间戳（Unix 毫秒）
	MinTime int64 `json:"min_time"`

	// MaxTime 最大时间戳（Unix 毫秒）
	MaxTime int64 `json:"max_time"`

	// LastCompactionTime 最后压缩时间（Unix 秒）
	LastCompactionTime int64 `json:"last_compaction_time"`

	// LastCleanupTime 最后清理时间（Unix 秒）
	LastCleanupTime int64 `json:"last_cleanup_time"`

	// TotalBlocks 总块数量
	TotalBlocks int64 `json:"total_blocks"`
}

// ValidateConfig 验证配置
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
