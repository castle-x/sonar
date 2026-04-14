package repo

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
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
	ID          string               `json:"id" bson:"_id"`
	Name        string               `json:"name" bson:"name"`
	Description string               `json:"description" bson:"description"`
	Tags        []string             `json:"tags" bson:"tags"`
	CreatedAt   int64                `json:"created_at" bson:"created_at"`
	UpdatedAt   int64                `json:"updated_at" bson:"updated_at"`
	MarkDeleted bool                 `json:"mark_deleted" bson:"mark_deleted"`
	StartTime   int64                `json:"start_time" bson:"start_time"`
	EndTime     int64                `json:"end_time" bson:"end_time"`
	AppID       string               `json:"app_id" bson:"app_id"`
	TapIDs      []string             `json:"tap_ids" bson:"tap_ids"`
	Status      SnapshotStatus       `json:"status" bson:"status"`
	ErrorMsg    string               `json:"error_msg" bson:"error_msg"`
	ChunkCount  int                  `json:"chunk_count" bson:"chunk_count"`
	TotalBytes  int64                `json:"total_bytes" bson:"total_bytes"`
	Score       *scoring.ReportScore `json:"score,omitempty" bson:"score,omitempty"`
}

// SnapshotRepo 快照存储（SQLite 实现）
type SnapshotRepo struct {
	db *sql.DB
}

func NewSnapshotRepo(db *sql.DB) *SnapshotRepo {
	return &SnapshotRepo{db: db}
}

func (r *SnapshotRepo) Create(ctx context.Context, meta *SnapshotMeta) (*SnapshotMeta, error) {
	tagsJSON, err := json.Marshal(meta.Tags)
	if err != nil {
		return nil, fmt.Errorf("marshal tags: %w", err)
	}
	tapIDsJSON, err := json.Marshal(meta.TapIDs)
	if err != nil {
		return nil, fmt.Errorf("marshal tap_ids: %w", err)
	}
	var scoreJSON []byte
	if meta.Score != nil {
		scoreJSON, err = json.Marshal(meta.Score)
		if err != nil {
			return nil, fmt.Errorf("marshal score: %w", err)
		}
	}

	now := time.Now().UnixMilli()
	meta.CreatedAt = now
	meta.UpdatedAt = now

	_, err = r.db.ExecContext(ctx,
		`INSERT INTO snapshots
		 (id,name,description,tags,app_id,tap_ids,start_time,end_time,status,error_msg,
		  chunk_count,total_bytes,score,mark_deleted,created_at,updated_at)
		 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		meta.ID, meta.Name, meta.Description, string(tagsJSON),
		meta.AppID, string(tapIDsJSON), meta.StartTime, meta.EndTime,
		string(meta.Status), meta.ErrorMsg, meta.ChunkCount, meta.TotalBytes,
		nullableString(scoreJSON), boolToInt(meta.MarkDeleted), meta.CreatedAt, meta.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert snapshot: %w", err)
	}
	return meta, nil
}

func (r *SnapshotRepo) Get(ctx context.Context, id string) (*SnapshotMeta, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT id,name,description,tags,app_id,tap_ids,start_time,end_time,status,error_msg,
		        chunk_count,total_bytes,score,mark_deleted,created_at,updated_at
		 FROM snapshots WHERE id=?`, id)
	return scanSnapshot(row)
}

func (r *SnapshotRepo) List(ctx context.Context) ([]*SnapshotMeta, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id,name,description,tags,app_id,tap_ids,start_time,end_time,status,error_msg,
		        chunk_count,total_bytes,score,mark_deleted,created_at,updated_at
		 FROM snapshots WHERE mark_deleted=0 ORDER BY created_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("list snapshots: %w", err)
	}
	defer rows.Close()

	var list []*SnapshotMeta
	for rows.Next() {
		meta, err := scanSnapshot(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, meta)
	}
	return list, rows.Err()
}

func (r *SnapshotRepo) Update(ctx context.Context, meta *SnapshotMeta) (*SnapshotMeta, error) {
	meta.UpdatedAt = time.Now().UnixMilli()

	tagsJSON, err := json.Marshal(meta.Tags)
	if err != nil {
		return nil, fmt.Errorf("marshal tags: %w", err)
	}
	tapIDsJSON, err := json.Marshal(meta.TapIDs)
	if err != nil {
		return nil, fmt.Errorf("marshal tap_ids: %w", err)
	}
	var scoreJSON []byte
	if meta.Score != nil {
		scoreJSON, err = json.Marshal(meta.Score)
		if err != nil {
			return nil, fmt.Errorf("marshal score: %w", err)
		}
	}

	_, err = r.db.ExecContext(ctx,
		`UPDATE snapshots SET
		 name=?,description=?,tags=?,app_id=?,tap_ids=?,start_time=?,end_time=?,
		 status=?,error_msg=?,chunk_count=?,total_bytes=?,score=?,mark_deleted=?,updated_at=?
		 WHERE id=?`,
		meta.Name, meta.Description, string(tagsJSON),
		meta.AppID, string(tapIDsJSON), meta.StartTime, meta.EndTime,
		string(meta.Status), meta.ErrorMsg, meta.ChunkCount, meta.TotalBytes,
		nullableString(scoreJSON), boolToInt(meta.MarkDeleted), meta.UpdatedAt,
		meta.ID,
	)
	if err != nil {
		return nil, fmt.Errorf("update snapshot: %w", err)
	}
	return meta, nil
}

// Delete 软删除
func (r *SnapshotRepo) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE snapshots SET mark_deleted=1, updated_at=? WHERE id=?`,
		time.Now().UnixMilli(), id)
	return err
}

func (r *SnapshotRepo) UpdateStatus(ctx context.Context, id string, status SnapshotStatus, errMsg string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE snapshots SET status=?, error_msg=?, updated_at=? WHERE id=?`,
		string(status), errMsg, time.Now().UnixMilli(), id)
	return err
}

func (r *SnapshotRepo) UpdateChunkInfo(ctx context.Context, id string, chunkCount int, totalBytes int64) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE snapshots SET chunk_count=?, total_bytes=?, updated_at=? WHERE id=?`,
		chunkCount, totalBytes, time.Now().UnixMilli(), id)
	return err
}

func (r *SnapshotRepo) UpdateScore(ctx context.Context, id string, score *scoring.ReportScore) error {
	var scoreJSON []byte
	var err error
	if score != nil {
		scoreJSON, err = json.Marshal(score)
		if err != nil {
			return fmt.Errorf("marshal score: %w", err)
		}
	}
	_, err = r.db.ExecContext(ctx,
		`UPDATE snapshots SET score=?, updated_at=? WHERE id=?`,
		nullableString(scoreJSON), time.Now().UnixMilli(), id)
	return err
}

// ListFilter 列表查询过滤条件
type ListFilter struct {
	AppID  string
	Limit  int
	Offset int
}

func (r *SnapshotRepo) ListWithFilter(ctx context.Context, f ListFilter) ([]*SnapshotMeta, error) {
	query := `SELECT id,name,description,tags,app_id,tap_ids,start_time,end_time,status,error_msg,
			         chunk_count,total_bytes,score,mark_deleted,created_at,updated_at
			  FROM snapshots WHERE mark_deleted=0`
	args := []any{}
	if f.AppID != "" {
		query += " AND app_id=?"
		args = append(args, f.AppID)
	}
	query += " ORDER BY created_at DESC"
	if f.Limit > 0 {
		query += " LIMIT ?"
		args = append(args, f.Limit)
		if f.Offset > 0 {
			query += " OFFSET ?"
			args = append(args, f.Offset)
		}
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list snapshots: %w", err)
	}
	defer rows.Close()

	var list []*SnapshotMeta
	for rows.Next() {
		meta, err := scanSnapshot(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, meta)
	}
	return list, rows.Err()
}

// ─── ScoringTemplateRepo ────────────────────────────────────────────────────

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

// ScoringTemplateRepo 评分模板存储（内存实现，暂不持久化）
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

// ─── helpers ────────────────────────────────────────────────────────────────

type rowScanner interface {
	Scan(dest ...any) error
}

func scanSnapshot(row rowScanner) (*SnapshotMeta, error) {
	var (
		m           SnapshotMeta
		tagsStr     string
		tapIDsStr   string
		scoreStr    sql.NullString
		markDeleted int
		status      string
	)
	err := row.Scan(
		&m.ID, &m.Name, &m.Description, &tagsStr,
		&m.AppID, &tapIDsStr, &m.StartTime, &m.EndTime,
		&status, &m.ErrorMsg,
		&m.ChunkCount, &m.TotalBytes, &scoreStr,
		&markDeleted, &m.CreatedAt, &m.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("scan snapshot: %w", err)
	}

	m.Status = SnapshotStatus(status)
	m.MarkDeleted = markDeleted != 0

	if err := json.Unmarshal([]byte(tagsStr), &m.Tags); err != nil {
		m.Tags = []string{}
	}
	if err := json.Unmarshal([]byte(tapIDsStr), &m.TapIDs); err != nil {
		m.TapIDs = []string{}
	}
	if scoreStr.Valid && scoreStr.String != "" {
		var score scoring.ReportScore
		if err := json.Unmarshal([]byte(scoreStr.String), &score); err == nil {
			m.Score = &score
		}
	}
	return &m, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func nullableString(b []byte) sql.NullString {
	if len(b) == 0 {
		return sql.NullString{}
	}
	return sql.NullString{String: string(b), Valid: true}
}
