package repo

import (
	"bytes"
	"compress/gzip"
	"context"
	"database/sql"
	"fmt"
	"io"
	"time"

	"github.com/google/uuid"
)

// ChunkRepo 快照数据块存储（SQLite 实现，gzip 压缩）
type ChunkRepo struct {
	db *sql.DB
}

func NewChunkRepo(db *sql.DB) *ChunkRepo {
	return &ChunkRepo{db: db}
}

// Save gzip 压缩 rawJSON 后存入单片
func (r *ChunkRepo) Save(ctx context.Context, snapshotID string, rawJSON []byte) error {
	compressed, origSize, err := compressGzip(rawJSON)
	if err != nil {
		return fmt.Errorf("compress chunk: %w", err)
	}
	_, err = r.db.ExecContext(ctx,
		`INSERT INTO snapshot_chunks(id,snapshot_id,part_index,total_parts,compressed_data,original_size,created_at)
		 VALUES(?,?,0,1,?,?,?)`,
		uuid.NewString(), snapshotID, compressed, origSize, time.Now().UnixMilli())
	if err != nil {
		return fmt.Errorf("insert chunk: %w", err)
	}
	return nil
}

// Load 读取所有片段（按 part_index）合并后 gzip 解压
func (r *ChunkRepo) Load(ctx context.Context, snapshotID string) ([]byte, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT compressed_data FROM snapshot_chunks WHERE snapshot_id=? ORDER BY part_index`, snapshotID)
	if err != nil {
		return nil, fmt.Errorf("query chunks: %w", err)
	}
	defer rows.Close()

	var combined []byte
	for rows.Next() {
		var chunk []byte
		if err := rows.Scan(&chunk); err != nil {
			return nil, fmt.Errorf("scan chunk: %w", err)
		}
		combined = append(combined, chunk...)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iter chunks: %w", err)
	}
	if len(combined) == 0 {
		return nil, nil
	}
	return decompressGzip(combined)
}

// Delete 硬删除（重建快照时清理旧数据）
func (r *ChunkRepo) Delete(ctx context.Context, snapshotID string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM snapshot_chunks WHERE snapshot_id=?`, snapshotID)
	return err
}

// ─── gzip helpers ────────────────────────────────────────────────────────────

func compressGzip(data []byte) ([]byte, int, error) {
	var buf bytes.Buffer
	w, err := gzip.NewWriterLevel(&buf, 7)
	if err != nil {
		return nil, 0, err
	}
	if _, err := w.Write(data); err != nil {
		return nil, 0, err
	}
	if err := w.Close(); err != nil {
		return nil, 0, err
	}
	return buf.Bytes(), len(data), nil
}

func decompressGzip(data []byte) ([]byte, error) {
	r, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("gzip reader: %w", err)
	}
	defer r.Close()
	result, err := io.ReadAll(r)
	if err != nil {
		return nil, fmt.Errorf("gzip read: %w", err)
	}
	return result, nil
}
