package repo

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// AggLevel represents a single cascade-aggregation level stored in SQLite.
// Durations are stored as milliseconds so they survive round-trips without
// Go-specific type knowledge.
type AggLevel struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	IntervalMs   int64  `json:"interval_ms"`
	RetentionMs  int64  `json:"retention_ms"`
	Source       string `json:"source"`        // "raw" or another level name
	MinPoints    int    `json:"min_points"`
	FallbackMode string `json:"fallback_mode"` // "skip" | "single" | "partial"
	Description  string `json:"description"`
	SortOrder    int    `json:"sort_order"`
	CreatedAt    int64  `json:"created_at"`
	UpdatedAt    int64  `json:"updated_at"`
}

// AggLevelRepo handles CRUD for the aggregation_levels table.
type AggLevelRepo struct {
	db *sql.DB
}

func NewAggLevelRepo(db *sql.DB) *AggLevelRepo {
	return &AggLevelRepo{db: db}
}

// ListOrdered returns all levels ordered by sort_order ASC.
func (r *AggLevelRepo) ListOrdered(ctx context.Context) ([]*AggLevel, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, name, interval_ms, retention_ms, source,
		       min_points, fallback_mode, description, sort_order,
		       created_at, updated_at
		FROM aggregation_levels
		ORDER BY sort_order ASC, id ASC`)
	if err != nil {
		return nil, fmt.Errorf("list aggregation_levels: %w", err)
	}
	defer rows.Close()

	var list []*AggLevel
	for rows.Next() {
		l, err := scanAggLevel(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, l)
	}
	return list, rows.Err()
}

// Count returns the number of rows in the table.
func (r *AggLevelRepo) Count(ctx context.Context) (int, error) {
	var n int
	err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM aggregation_levels`).Scan(&n)
	return n, err
}

// BulkInsert inserts multiple levels in a single transaction (used for seeding).
func (r *AggLevelRepo) BulkInsert(ctx context.Context, levels []*AggLevel) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO aggregation_levels
		    (name, interval_ms, retention_ms, source, min_points, fallback_mode,
		     description, sort_order, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(name) DO NOTHING`)
	if err != nil {
		return fmt.Errorf("prepare: %w", err)
	}
	defer stmt.Close()

	now := time.Now().UnixMilli()
	for _, l := range levels {
		if l.CreatedAt == 0 {
			l.CreatedAt = now
		}
		if l.UpdatedAt == 0 {
			l.UpdatedAt = now
		}
		if _, err := stmt.ExecContext(ctx,
			l.Name, l.IntervalMs, l.RetentionMs, l.Source,
			l.MinPoints, l.FallbackMode, l.Description,
			l.SortOrder, l.CreatedAt, l.UpdatedAt,
		); err != nil {
			return fmt.Errorf("insert level %q: %w", l.Name, err)
		}
	}
	return tx.Commit()
}

// ─── scanner ─────────────────────────────────────────────────────────────────

func scanAggLevel(row rowScanner) (*AggLevel, error) {
	var l AggLevel
	err := row.Scan(
		&l.ID, &l.Name, &l.IntervalMs, &l.RetentionMs, &l.Source,
		&l.MinPoints, &l.FallbackMode, &l.Description, &l.SortOrder,
		&l.CreatedAt, &l.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("scan agg_level: %w", err)
	}
	return &l, nil
}
