package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

func Open(path string) (*sql.DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return nil, fmt.Errorf("create db dir: %w", err)
	}
	db, err := sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(ON)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1) // SQLite 写串行
	if err := initSchema(db); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

func initSchema(db *sql.DB) error {
	if _, err := db.Exec(schema); err != nil {
		return err
	}
	return migrate(db)
}

// migrate 处理增量 schema 变更（ALTER TABLE 等）
func migrate(db *sql.DB) error {
	// 给 store_configs 加 is_active 列（旧库升级）
	_, _ = db.Exec(`ALTER TABLE store_configs ADD COLUMN is_active INTEGER DEFAULT 0`)
	// 确保索引存在
	_, _ = db.Exec(`CREATE INDEX IF NOT EXISTS idx_store_configs_active ON store_configs(is_active, mark_deleted)`)
	return nil
}

const schema = `
CREATE TABLE IF NOT EXISTS snapshots (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    description  TEXT,
    tags         TEXT DEFAULT '[]',
    app_id       TEXT,
    tap_ids      TEXT DEFAULT '[]',
    start_time   INTEGER,
    end_time     INTEGER,
    status       TEXT DEFAULT 'pending',
    error_msg    TEXT,
    chunk_count  INTEGER DEFAULT 0,
    total_bytes  INTEGER DEFAULT 0,
    score        TEXT,
    mark_deleted INTEGER DEFAULT 0,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_list ON snapshots(mark_deleted, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_app  ON snapshots(app_id, mark_deleted);

CREATE TABLE IF NOT EXISTS snapshot_chunks (
    id              TEXT PRIMARY KEY,
    snapshot_id     TEXT NOT NULL,
    part_index      INTEGER NOT NULL DEFAULT 0,
    total_parts     INTEGER NOT NULL DEFAULT 1,
    compressed_data BLOB NOT NULL,
    original_size   INTEGER,
    point_count     INTEGER,
    metric_count    INTEGER,
    created_at      INTEGER NOT NULL,
    FOREIGN KEY (snapshot_id) REFERENCES snapshots(id)
);
CREATE INDEX IF NOT EXISTS idx_chunks_snapshot ON snapshot_chunks(snapshot_id, part_index);

CREATE TABLE IF NOT EXISTS store_configs (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    addr         TEXT NOT NULL,
    description  TEXT,
    is_active    INTEGER DEFAULT 0,
    mark_deleted INTEGER DEFAULT 0,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_store_configs_list ON store_configs(mark_deleted, created_at DESC);
`
