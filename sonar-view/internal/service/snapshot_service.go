package service

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Snapshot 快照数据
type Snapshot struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	StartTime   int64                  `json:"start_time"`
	EndTime     int64                  `json:"end_time"`
	AppID       string                 `json:"app_id"`
	Tags        []string               `json:"tags"`
	Metadata    map[string]interface{} `json:"metadata"`
	CreatedAt   int64                  `json:"created_at"`
	UpdatedAt   int64                  `json:"updated_at"`
}

// CreateSnapshotReq 创建快照请求
type CreateSnapshotReq struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	StartTime   int64                  `json:"start_time"`
	EndTime     int64                  `json:"end_time"`
	AppID       string                 `json:"app_id"`
	Tags        []string               `json:"tags"`
	Metadata    map[string]interface{} `json:"metadata"`
}

// SnapshotService 快照服务（内存实现）
type SnapshotService struct {
	snapshots map[string]*Snapshot
	mu        sync.RWMutex
}

func NewSnapshotService() *SnapshotService {
	return &SnapshotService{
		snapshots: make(map[string]*Snapshot),
	}
}

func (s *SnapshotService) Create(ctx context.Context, req *CreateSnapshotReq) (*Snapshot, error) {
	if req.Name == "" {
		return nil, fmt.Errorf("snapshot name is required")
	}
	now := time.Now().UnixMilli()
	snap := &Snapshot{
		ID:          uuid.New().String(),
		Name:        req.Name,
		Description: req.Description,
		StartTime:   req.StartTime,
		EndTime:     req.EndTime,
		AppID:       req.AppID,
		Tags:        req.Tags,
		Metadata:    req.Metadata,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if snap.Tags == nil {
		snap.Tags = []string{}
	}
	if snap.Metadata == nil {
		snap.Metadata = map[string]interface{}{}
	}
	s.mu.Lock()
	s.snapshots[snap.ID] = snap
	s.mu.Unlock()
	return snap, nil
}

func (s *SnapshotService) Get(ctx context.Context, id string) (*Snapshot, error) {
	s.mu.RLock()
	snap, ok := s.snapshots[id]
	s.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("snapshot not found: %s", id)
	}
	return snap, nil
}

func (s *SnapshotService) List(ctx context.Context, appID string) ([]*Snapshot, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]*Snapshot, 0, len(s.snapshots))
	for _, snap := range s.snapshots {
		if appID == "" || snap.AppID == appID {
			result = append(result, snap)
		}
	}
	return result, nil
}

func (s *SnapshotService) Delete(ctx context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.snapshots[id]; !ok {
		return fmt.Errorf("snapshot not found: %s", id)
	}
	delete(s.snapshots, id)
	return nil
}
