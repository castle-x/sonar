package repo

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// StoreConfig store 连接配置
type StoreConfig struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Addr        string `json:"addr"`
	Description string `json:"description"`
	IsActive    bool   `json:"is_active"`
	MarkDeleted bool   `json:"mark_deleted"`
	CreatedAt   int64  `json:"created_at"`
	UpdatedAt   int64  `json:"updated_at"`
}

// StoreConfigRepo store_configs 表操作
type StoreConfigRepo struct {
	db *sql.DB
}

func NewStoreConfigRepo(db *sql.DB) *StoreConfigRepo {
	return &StoreConfigRepo{db: db}
}

func (r *StoreConfigRepo) Create(ctx context.Context, cfg *StoreConfig) (*StoreConfig, error) {
	now := time.Now().UnixMilli()
	cfg.CreatedAt = now
	cfg.UpdatedAt = now
	isActive := 0
	if cfg.IsActive {
		isActive = 1
	}
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO store_configs(id,name,addr,description,is_active,mark_deleted,created_at,updated_at)
		 VALUES(?,?,?,?,?,0,?,?)`,
		cfg.ID, cfg.Name, cfg.Addr, cfg.Description, isActive, cfg.CreatedAt, cfg.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert store_config: %w", err)
	}
	return cfg, nil
}

func (r *StoreConfigRepo) Get(ctx context.Context, id string) (*StoreConfig, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT id,name,addr,description,is_active,mark_deleted,created_at,updated_at
		 FROM store_configs WHERE id=?`, id)
	return scanStoreConfig(row)
}

func (r *StoreConfigRepo) List(ctx context.Context) ([]*StoreConfig, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id,name,addr,description,is_active,mark_deleted,created_at,updated_at
		 FROM store_configs WHERE mark_deleted=0 ORDER BY created_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("list store_configs: %w", err)
	}
	defer rows.Close()

	var list []*StoreConfig
	for rows.Next() {
		cfg, err := scanStoreConfig(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, cfg)
	}
	return list, rows.Err()
}

func (r *StoreConfigRepo) Update(ctx context.Context, cfg *StoreConfig) (*StoreConfig, error) {
	cfg.UpdatedAt = time.Now().UnixMilli()
	_, err := r.db.ExecContext(ctx,
		`UPDATE store_configs SET name=?,addr=?,description=?,updated_at=? WHERE id=?`,
		cfg.Name, cfg.Addr, cfg.Description, cfg.UpdatedAt, cfg.ID,
	)
	if err != nil {
		return nil, fmt.Errorf("update store_config: %w", err)
	}
	return cfg, nil
}

func (r *StoreConfigRepo) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE store_configs SET mark_deleted=1, updated_at=? WHERE id=?`,
		time.Now().UnixMilli(), id,
	)
	return err
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func (r *StoreConfigRepo) SetActive(ctx context.Context, id string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx,
		`UPDATE store_configs SET is_active=0, updated_at=? WHERE mark_deleted=0`,
		time.Now().UnixMilli(),
	); err != nil {
		return fmt.Errorf("clear active: %w", err)
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE store_configs SET is_active=1, updated_at=? WHERE id=?`,
		time.Now().UnixMilli(), id,
	); err != nil {
		return fmt.Errorf("set active: %w", err)
	}
	return tx.Commit()
}

func (r *StoreConfigRepo) GetActive(ctx context.Context) (*StoreConfig, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT id,name,addr,description,is_active,mark_deleted,created_at,updated_at
		 FROM store_configs WHERE is_active=1 AND mark_deleted=0 LIMIT 1`)
	return scanStoreConfig(row)
}

func scanStoreConfig(row rowScanner) (*StoreConfig, error) {
	var (
		cfg         StoreConfig
		isActive    int
		markDeleted int
	)
	err := row.Scan(
		&cfg.ID, &cfg.Name, &cfg.Addr, &cfg.Description,
		&isActive, &markDeleted, &cfg.CreatedAt, &cfg.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("scan store_config: %w", err)
	}
	cfg.IsActive = isActive != 0
	cfg.MarkDeleted = markDeleted != 0
	return &cfg, nil
}
