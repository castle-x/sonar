package repo

import (
	"context"
	"sync"
	"time"

	"sonar-view/pkg/scoring"
)

const (
	CollectionSnapshots        = "snapshots"
	CollectionScoringTemplates = "scoring_templates"
)

// SnapshotStatus 快照状态
type SnapshotStatus string

const (
	SnapshotStatusPending  SnapshotStatus = "pending"
	SnapshotStatusBuilding SnapshotStatus = "building"
	SnapshotStatusDone     SnapshotStatus = "done"
	SnapshotStatusFailed   SnapshotStatus = "failed"
)

// SnapshotMeta 快照元数据
type SnapshotMeta struct {
	ID          string                 `json:"id" bson:"_id"`
	Name        string                 `json:"name" bson:"name"`
	Description string                 `json:"description" bson:"description"`
	Tags        []string               `json:"tags" bson:"tags"`
	CreatedAt   int64                  `json:"created_at" bson:"created_at"`
	UpdatedAt   int64                  `json:"updated_at" bson:"updated_at"`
	MarkDeleted bool                   `json:"mark_deleted" bson:"mark_deleted"`
	StartTime   int64                  `json:"start_time" bson:"start_time"`
	EndTime     int64                  `json:"end_time" bson:"end_time"`
	AppID       string                 `json:"app_id" bson:"app_id"`
	TapIDs      []string               `json:"tap_ids" bson:"tap_ids"`
	Status      SnapshotStatus         `json:"status" bson:"status"`
	ErrorMsg    string                 `json:"error_msg" bson:"error_msg"`
	ChunkCount  int                    `json:"chunk_count" bson:"chunk_count"`
	TotalBytes  int64                  `json:"total_bytes" bson:"total_bytes"`
	Score       *scoring.ReportScore   `json:"score,omitempty" bson:"score,omitempty"`
}

// ScoringTemplate 评分模板
type ScoringTemplate struct {
	ID          string                 `json:"id" bson:"_id"`
	Name        string                 `json:"name" bson:"name"`
	Description string                 `json:"description" bson:"description"`
	CreatedAt   int64                  `json:"created_at" bson:"created_at"`
	UpdatedAt   int64                  `json:"updated_at" bson:"updated_at"`
	MarkDeleted bool                   `json:"mark_deleted" bson:"mark_deleted"`
	Config      *scoring.ScoringConfig `json:"config" bson:"config"`
}

// SnapshotRepo 快照存储（内存实现）
type SnapshotRepo struct {
	mu       sync.RWMutex
	store    map[string]*SnapshotMeta
}

func NewSnapshotRepo() *SnapshotRepo {
	return &SnapshotRepo{store: make(map[string]*SnapshotMeta)}
}

func (r *SnapshotRepo) Create(ctx context.Context, meta *SnapshotMeta) (*SnapshotMeta, error) {
	r.mu.Lock()
	r.store[meta.ID] = meta
	r.mu.Unlock()
	return meta, nil
}

func (r *SnapshotRepo) Get(ctx context.Context, id string) (*SnapshotMeta, error) {
	r.mu.RLock()
	meta, ok := r.store[id]
	r.mu.RUnlock()
	if !ok {
		return nil, nil
	}
	return meta, nil
}

func (r *SnapshotRepo) Update(ctx context.Context, meta *SnapshotMeta) (*SnapshotMeta, error) {
	meta.UpdatedAt = time.Now().UnixMilli()
	r.mu.Lock()
	r.store[meta.ID] = meta
	r.mu.Unlock()
	return meta, nil
}

func (r *SnapshotRepo) Delete(ctx context.Context, id string) error {
	r.mu.Lock()
	delete(r.store, id)
	r.mu.Unlock()
	return nil
}

func (r *SnapshotRepo) List(ctx context.Context) ([]*SnapshotMeta, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var list []*SnapshotMeta
	for _, m := range r.store {
		if !m.MarkDeleted {
			list = append(list, m)
		}
	}
	return list, nil
}

func (r *SnapshotRepo) UpdateStatus(ctx context.Context, id string, status SnapshotStatus, errMsg string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	meta, ok := r.store[id]
	if !ok {
		return nil
	}
	meta.Status = status
	meta.ErrorMsg = errMsg
	meta.UpdatedAt = time.Now().UnixMilli()
	return nil
}

// ScoringTemplateRepo 评分模板存储（内存实现）
type ScoringTemplateRepo struct {
	mu    sync.RWMutex
	store map[string]*ScoringTemplate
}

func NewScoringTemplateRepo() *ScoringTemplateRepo {
	return &ScoringTemplateRepo{store: make(map[string]*ScoringTemplate)}
}

func (r *ScoringTemplateRepo) Create(ctx context.Context, tmpl *ScoringTemplate) (*ScoringTemplate, error) {
	r.mu.Lock()
	r.store[tmpl.ID] = tmpl
	r.mu.Unlock()
	return tmpl, nil
}

func (r *ScoringTemplateRepo) Get(ctx context.Context, id string) (*ScoringTemplate, error) {
	r.mu.RLock()
	tmpl, ok := r.store[id]
	r.mu.RUnlock()
	if !ok {
		return nil, nil
	}
	return tmpl, nil
}

func (r *ScoringTemplateRepo) Update(ctx context.Context, tmpl *ScoringTemplate) (*ScoringTemplate, error) {
	tmpl.UpdatedAt = time.Now().UnixMilli()
	r.mu.Lock()
	r.store[tmpl.ID] = tmpl
	r.mu.Unlock()
	return tmpl, nil
}

func (r *ScoringTemplateRepo) Delete(ctx context.Context, id string) error {
	r.mu.Lock()
	delete(r.store, id)
	r.mu.Unlock()
	return nil
}

func (r *ScoringTemplateRepo) List(ctx context.Context) ([]*ScoringTemplate, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var list []*ScoringTemplate
	for _, t := range r.store {
		if !t.MarkDeleted {
			list = append(list, t)
		}
	}
	return list, nil
}
