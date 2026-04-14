package db_test

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"sonar-view/internal/db"
	"sonar-view/internal/repo"
)

// openTempDB creates a temp SQLite DB for testing and returns cleanup func.
func openTempDB(t *testing.T) (*sql.DB, func()) {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "test.db")
	sqlDB, err := db.Open(path)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	return sqlDB, func() {
		sqlDB.Close()
		os.RemoveAll(dir)
	}
}

// TestStoreConfigsPersistence verifies CRUD + soft-delete for store_configs.
func TestStoreConfigsPersistence(t *testing.T) {
	sqlDB, cleanup := openTempDB(t)
	defer cleanup()

	r := repo.NewStoreConfigRepo(sqlDB)
	ctx := context.Background()

	// ── Create ────────────────────────────────────────────────────────────────
	cfg := &repo.StoreConfig{
		ID:          "sc-001",
		Name:        "test-store",
		Addr:        "localhost:8082",
		Description: "e2e test store",
	}
	if _, err := r.Create(ctx, cfg); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if cfg.CreatedAt == 0 || cfg.UpdatedAt == 0 {
		t.Error("timestamps should be set after Create")
	}

	// ── Get ───────────────────────────────────────────────────────────────────
	got, err := r.Get(ctx, "sc-001")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Name != "test-store" {
		t.Errorf("Name: want %q, got %q", "test-store", got.Name)
	}
	if got.Addr != "localhost:8082" {
		t.Errorf("Addr: want %q, got %q", "localhost:8082", got.Addr)
	}
	if got.MarkDeleted {
		t.Error("MarkDeleted should be false after Create")
	}

	// ── List ──────────────────────────────────────────────────────────────────
	list, err := r.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("List: want 1 item, got %d", len(list))
	}

	// ── Update ────────────────────────────────────────────────────────────────
	got.Name = "updated-store"
	got.Addr = "remotehost:8082"
	if _, err := r.Update(ctx, got); err != nil {
		t.Fatalf("Update: %v", err)
	}
	after, err := r.Get(ctx, "sc-001")
	if err != nil {
		t.Fatalf("Get after Update: %v", err)
	}
	if after.Name != "updated-store" {
		t.Errorf("Name after Update: want %q, got %q", "updated-store", after.Name)
	}

	// ── Delete (soft) ─────────────────────────────────────────────────────────
	if err := r.Delete(ctx, "sc-001"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	listAfterDelete, err := r.List(ctx)
	if err != nil {
		t.Fatalf("List after Delete: %v", err)
	}
	if len(listAfterDelete) != 0 {
		t.Errorf("List after soft-delete: want 0 items, got %d", len(listAfterDelete))
	}

	// ── Get after soft-delete: record is returned with MarkDeleted=true ────────
	deleted, err := r.Get(ctx, "sc-001")
	if err != nil {
		t.Fatalf("Get soft-deleted: %v", err)
	}
	if deleted == nil || !deleted.MarkDeleted {
		t.Error("Get should return soft-deleted row with MarkDeleted=true")
	}
}

// TestSnapshotsPersistence verifies CRUD + status update + persistence across reopen.
func TestSnapshotsPersistence(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "snap_test.db")

	// ── First open: create snapshot ───────────────────────────────────────────
	{
		sqlDB, err := db.Open(path)
		if err != nil {
			t.Fatalf("open db: %v", err)
		}
		r := repo.NewSnapshotRepo(sqlDB)
		ctx := context.Background()

		snap := &repo.SnapshotMeta{
			ID:          "snap-001",
			Name:        "perf-test-2024",
			Description: "e2e persistence test",
			Tags:        []string{"e2e", "sqlite"},
			AppID:       "game-server",
			TapIDs:      []string{"tap-1", "tap-2"},
			StartTime:   1700000000000,
			EndTime:     1700003600000,
			Status:      repo.SnapshotStatusPending,
		}
		if _, err := r.Create(ctx, snap); err != nil {
			t.Fatalf("Create snapshot: %v", err)
		}

		// Verify Get
		got, err := r.Get(ctx, "snap-001")
		if err != nil {
			t.Fatalf("Get snapshot: %v", err)
		}
		if got == nil {
			t.Fatal("Get returned nil")
		}
		if got.Name != "perf-test-2024" {
			t.Errorf("Name: want %q, got %q", "perf-test-2024", got.Name)
		}
		if len(got.Tags) != 2 {
			t.Errorf("Tags: want 2, got %d", len(got.Tags))
		}
		if len(got.TapIDs) != 2 {
			t.Errorf("TapIDs: want 2, got %d", len(got.TapIDs))
		}

		// Update status to building
		if err := r.UpdateStatus(ctx, "snap-001", repo.SnapshotStatusBuilding, ""); err != nil {
			t.Fatalf("UpdateStatus: %v", err)
		}
		// Update chunk info
		if err := r.UpdateChunkInfo(ctx, "snap-001", 3, 1024*1024); err != nil {
			t.Fatalf("UpdateChunkInfo: %v", err)
		}

		sqlDB.Close()
	}

	// ── Second open: verify data persisted ────────────────────────────────────
	{
		sqlDB, err := db.Open(path)
		if err != nil {
			t.Fatalf("reopen db: %v", err)
		}
		defer sqlDB.Close()

		r := repo.NewSnapshotRepo(sqlDB)
		ctx := context.Background()

		got, err := r.Get(ctx, "snap-001")
		if err != nil {
			t.Fatalf("Get after reopen: %v", err)
		}
		if got == nil {
			t.Fatal("snapshot not found after reopen")
		}
		if got.Status != repo.SnapshotStatusBuilding {
			t.Errorf("Status after reopen: want %q, got %q", repo.SnapshotStatusBuilding, got.Status)
		}
		if got.ChunkCount != 3 {
			t.Errorf("ChunkCount: want 3, got %d", got.ChunkCount)
		}
		if got.TotalBytes != 1024*1024 {
			t.Errorf("TotalBytes: want %d, got %d", 1024*1024, got.TotalBytes)
		}

		// List should show 1 item
		list, err := r.List(ctx)
		if err != nil {
			t.Fatalf("List: %v", err)
		}
		if len(list) != 1 {
			t.Fatalf("List after reopen: want 1, got %d", len(list))
		}

		// Soft-delete
		if err := r.Delete(ctx, "snap-001"); err != nil {
			t.Fatalf("Delete: %v", err)
		}
		listAfter, err := r.List(ctx)
		if err != nil {
			t.Fatalf("List after delete: %v", err)
		}
		if len(listAfter) != 0 {
			t.Errorf("List after soft-delete: want 0, got %d", len(listAfter))
		}
	}
}

// TestChunkStorePersistence verifies gzip chunk save/load round-trip.
func TestChunkStorePersistence(t *testing.T) {
	sqlDB, cleanup := openTempDB(t)
	defer cleanup()

	snapRepo := repo.NewSnapshotRepo(sqlDB)
	chunkRepo := repo.NewChunkRepo(sqlDB)
	ctx := context.Background()

	// Create parent snapshot first (FK constraint)
	snap := &repo.SnapshotMeta{
		ID:     "snap-chunk-001",
		Name:   "chunk-test",
		Tags:   []string{},
		TapIDs: []string{},
		Status: repo.SnapshotStatusPending,
	}
	if _, err := snapRepo.Create(ctx, snap); err != nil {
		t.Fatalf("Create snapshot for chunk test: %v", err)
	}

	// Save chunk
	rawJSON := []byte(`{"metrics":[{"name":"cpu","value":42.5},{"name":"mem","value":1024}]}`)
	if err := chunkRepo.Save(ctx, "snap-chunk-001", rawJSON); err != nil {
		t.Fatalf("Save chunk: %v", err)
	}

	// Load and verify round-trip
	loaded, err := chunkRepo.Load(ctx, "snap-chunk-001")
	if err != nil {
		t.Fatalf("Load chunk: %v", err)
	}
	if string(loaded) != string(rawJSON) {
		t.Errorf("chunk round-trip mismatch:\n  want: %s\n  got:  %s", rawJSON, loaded)
	}

	// Delete chunk
	if err := chunkRepo.Delete(ctx, "snap-chunk-001"); err != nil {
		t.Fatalf("Delete chunk: %v", err)
	}
	empty, err := chunkRepo.Load(ctx, "snap-chunk-001")
	if err != nil {
		t.Fatalf("Load after delete: %v", err)
	}
	if empty != nil {
		t.Error("Load after delete should return nil")
	}
}
