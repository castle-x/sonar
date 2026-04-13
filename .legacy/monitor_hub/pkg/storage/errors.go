package storage

import "errors"

// ============================================
// 存储错误定义
// ============================================

var (
	// ErrConfigNil 配置为空
	ErrConfigNil = errors.New("storage config cannot be nil")

	// ErrDataDirEmpty 数据目录为空
	ErrDataDirEmpty = errors.New("data directory cannot be empty")

	// ErrInvalidRetentionDays 保留天数无效
	ErrInvalidRetentionDays = errors.New("retention days must be positive")

	// ErrInvalidBufferSize 缓冲区大小无效
	ErrInvalidBufferSize = errors.New("buffer size must be positive")

	// ErrInvalidChunkSize 块大小无效
	ErrInvalidChunkSize = errors.New("chunk size must be positive")

	// ErrStorageClosed 存储已关闭
	ErrStorageClosed = errors.New("storage is closed")

	// ErrSerializerNil 序列化器为空
	ErrSerializerNil = errors.New("serializer cannot be nil")

	// ErrInvalidTimestamp 时间戳无效
	ErrInvalidTimestamp = errors.New("timestamp is invalid")

	// ErrEmptyPoints 数据点列表为空
	ErrEmptyPoints = errors.New("points list is empty")
)
