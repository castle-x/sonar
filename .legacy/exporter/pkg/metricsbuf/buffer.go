// Package metricsbuf 提供最近采集指标的环形缓冲区，用于 /api/v1/metrics/preview 接口。
package metricsbuf

import (
	"sync"
	"time"

	v1 "exporter/pkg/datasource/apis/metrics/v1"
)

const defaultCap = 200

// Entry 一条预览记录
type Entry struct {
	ReceivedAt time.Time              `json:"received_at"`
	Name       string                 `json:"name"`
	Value      float64                `json:"value"`
	Timestamp  int64                  `json:"timestamp"`
	Labels     map[string]string      `json:"labels,omitempty"`
}

// RingBuffer 线程安全的环形缓冲区
type RingBuffer struct {
	mu   sync.Mutex
	buf  []Entry
	head int // 下一个写入位置
	size int // 当前已有条目数
	cap  int
}

// New 创建环形缓冲区
func New(capacity int) *RingBuffer {
	if capacity <= 0 {
		capacity = defaultCap
	}
	return &RingBuffer{
		buf: make([]Entry, capacity),
		cap: capacity,
	}
}

// Push 写入一条指标记录
func (r *RingBuffer) Push(pt *v1.RequestMetricPoint) {
	if pt == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()

	name := ""
	if pt.Name != nil {
		name = *pt.Name
	}
	r.buf[r.head] = Entry{
		ReceivedAt: time.Now(),
		Name:       name,
		Value:      pt.Value,
		Timestamp:  pt.Timestamp,
		Labels:     pt.Labels,
	}
	r.head = (r.head + 1) % r.cap
	if r.size < r.cap {
		r.size++
	}
}

// Latest 返回最近 n 条记录（最新在前）
func (r *RingBuffer) Latest(n int) []Entry {
	r.mu.Lock()
	defer r.mu.Unlock()

	if n <= 0 || r.size == 0 {
		return nil
	}
	if n > r.size {
		n = r.size
	}

	result := make([]Entry, n)
	// head 指向下一个写入位置，即最旧的位置（缓冲满时）
	// 从 head-1 往前取 n 条
	for i := 0; i < n; i++ {
		idx := (r.head - 1 - i + r.cap) % r.cap
		result[i] = r.buf[idx]
	}
	return result
}

// Len 返回当前记录数
func (r *RingBuffer) Len() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.size
}
