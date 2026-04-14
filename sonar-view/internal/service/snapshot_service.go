package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"sonar-view/internal/repo"
)

// SnapshotService 快照服务（SQLite 实现）
type SnapshotService struct {
	snapshotRepo *repo.SnapshotRepo
	chunkRepo    *repo.ChunkRepo
}

func NewSnapshotService(snapshotRepo *repo.SnapshotRepo, chunkRepo *repo.ChunkRepo) *SnapshotService {
	return &SnapshotService{
		snapshotRepo: snapshotRepo,
		chunkRepo:    chunkRepo,
	}
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
	// MetricsJSON 可选：原始时序数据 JSON（存入 chunk）
	MetricsJSON []byte `json:"-"`
}

// Snapshot 对外返回的快照数据（兼容旧接口）
type Snapshot struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	StartTime   int64                  `json:"start_time"`
	EndTime     int64                  `json:"end_time"`
	AppID       string                 `json:"app_id"`
	Tags        []string               `json:"tags"`
	Metadata    map[string]interface{} `json:"metadata"`
	Status      string                 `json:"status"`
	ChunkCount  int                    `json:"chunk_count"`
	TotalBytes  int64                  `json:"total_bytes"`
	CreatedAt   int64                  `json:"created_at"`
	UpdatedAt   int64                  `json:"updated_at"`
}

func metaToSnapshot(m *repo.SnapshotMeta) *Snapshot {
	if m == nil {
		return nil
	}
	return &Snapshot{
		ID:          m.ID,
		Name:        m.Name,
		Description: m.Description,
		StartTime:   m.StartTime,
		EndTime:     m.EndTime,
		AppID:       m.AppID,
		Tags:        m.Tags,
		Metadata:    map[string]interface{}{},
		Status:      string(m.Status),
		ChunkCount:  m.ChunkCount,
		TotalBytes:  m.TotalBytes,
		CreatedAt:   m.CreatedAt,
		UpdatedAt:   m.UpdatedAt,
	}
}

func (s *SnapshotService) Create(ctx context.Context, req *CreateSnapshotReq) (*Snapshot, error) {
	if req.Name == "" {
		return nil, fmt.Errorf("snapshot name is required")
	}
	now := time.Now().UnixMilli()
	meta := &repo.SnapshotMeta{
		ID:          uuid.New().String(),
		Name:        req.Name,
		Description: req.Description,
		StartTime:   req.StartTime,
		EndTime:     req.EndTime,
		AppID:       req.AppID,
		Tags:        req.Tags,
		Status:      repo.SnapshotStatusPending,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if meta.Tags == nil {
		meta.Tags = []string{}
	}

	created, err := s.snapshotRepo.Create(ctx, meta)
	if err != nil {
		return nil, fmt.Errorf("create snapshot: %w", err)
	}

	// 如果有时序数据，写入 chunk 并更新元数据
	if len(req.MetricsJSON) > 0 {
		if err := s.chunkRepo.Save(ctx, created.ID, req.MetricsJSON); err != nil {
			return nil, fmt.Errorf("save chunk: %w", err)
		}
		if err := s.snapshotRepo.UpdateChunkInfo(ctx, created.ID, 1, int64(len(req.MetricsJSON))); err != nil {
			return nil, fmt.Errorf("update chunk info: %w", err)
		}
		created.ChunkCount = 1
		created.TotalBytes = int64(len(req.MetricsJSON))
	}

	return metaToSnapshot(created), nil
}

func (s *SnapshotService) Get(ctx context.Context, id string) (*Snapshot, error) {
	meta, err := s.snapshotRepo.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if meta == nil {
		return nil, fmt.Errorf("snapshot not found: %s", id)
	}
	return metaToSnapshot(meta), nil
}

func (s *SnapshotService) List(ctx context.Context, appID string) ([]*Snapshot, error) {
	metas, err := s.snapshotRepo.List(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]*Snapshot, 0, len(metas))
	for _, m := range metas {
		if appID == "" || m.AppID == appID {
			result = append(result, metaToSnapshot(m))
		}
	}
	return result, nil
}

func (s *SnapshotService) Delete(ctx context.Context, id string) error {
	return s.snapshotRepo.Delete(ctx, id)
}

// GetSnapshotMetrics 返回快照的时序数据（解压后的 JSON bytes）
func (s *SnapshotService) GetSnapshotMetrics(ctx context.Context, id string) ([]byte, error) {
	data, err := s.chunkRepo.Load(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("load chunk: %w", err)
	}
	if data == nil {
		return []byte("null"), nil
	}
	return data, nil
}
