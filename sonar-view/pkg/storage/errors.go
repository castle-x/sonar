package storage

import "errors"

var (
	ErrConfigNil              = errors.New("storage config cannot be nil")
	ErrDataDirEmpty           = errors.New("data directory cannot be empty")
	ErrInvalidRetentionDays   = errors.New("retention days must be positive")
	ErrInvalidBufferSize      = errors.New("buffer size must be positive")
	ErrInvalidChunkSize       = errors.New("chunk size must be positive")
	ErrStorageClosed          = errors.New("storage is closed")
	ErrSerializerNil          = errors.New("serializer cannot be nil")
	ErrInvalidTimestamp       = errors.New("timestamp is invalid")
	ErrEmptyPoints            = errors.New("points list is empty")
)

type ErrInvalidLabels struct {
	msg string
}

func (e ErrInvalidLabels) Error() string {
	return "invalid labels: " + e.msg
}
