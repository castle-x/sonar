package repo_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"sonar-view/internal/db"
	"sonar-view/internal/repo"
)

// openTestDB opens a real SQLite DB in a temp dir and returns a cleanup func.
func openTestDB(t *testing.T) (*repo.SnapshotRepo, *repo.ChunkRepo, *repo.StoreConfigRepo, func()) {
	t.Helper()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.db")
	sqlDB, err := db.Open(dbPath)
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	cleanup := func() {
		sqlDB.Close()
		os.RemoveAll(dir)
	}
	return repo.NewSnapshotRepo(sqlDB),
		repo.NewChunkRepo(sqlDB),
		repo.NewStoreConfigRepo(sqlDB),
		cleanup
}

// ────────────────────────────────────────────────────────────
// StoreConfig E2E
// ────────────────────────────────────────────────────────────

func TestStoreConfig_CreateAndGet(t *testing.T) {
	_, _, cfgRepo, cleanup := openTestDB(t)
	defer cleanup()
	ctx := context.Background()

	cfg := &repo.StoreConfig{
		ID:          "sc-001",
		Name:        "test-store",
		Addr:        "localhost:8082",
		Description: "e2e test store",
	}
	created, err := cfgRepo.Create(ctx, cfg)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if created.ID != "sc-001" {
		t.Errorf("ID = %q, want sc-001", created.ID)
	}
	if created.CreatedAt <= 0 {
		t.Error("expected CreatedAt to be set")
	}

	got, err := cfgRepo.Get(ctx, "sc-001")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got == nil {
		t.Fatal("Get returned nil")
	}
	if got.Name != "test-store" {
		t.Errorf("Name = %q, want test-store", got.Name)
	}
	if got.Addr != "localhost:8082" {
		t.Errorf("Addr = %q, want localhost:8082", got.Addr)
	}
}

func TestStoreConfig_List(t *testing.T) {
	_, _, cfgRepo, cleanup := openTestDB(t)
	defer cleanup()
	ctx := context.Background()

	for i, id := range []string{"a", "b", "c"} {
		_, err := cfgRepo.Create(ctx, &repo.StoreConfig{
			ID:   id,
			Name: "store-" + id,
			Addr: "localhost:" + string(rune('8'+i)),
		})
		if err != nil {
			t.Fatalf("Create %s: %v", id, err)
		}
	}

	list, err := cfgRepo.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 3 {
		t.Errorf("len(list) = %d, want 3", len(list))
	}
}

func TestStoreConfig_Update(t *testing.T) {
	_, _, cfgRepo, cleanup := openTestDB(t)
	defer cleanup()
	ctx := context.Background()

	_, err := cfgRepo.Create(ctx, &repo.StoreConfig{
		ID: "upd-1", Name: "old-name", Addr: "old-addr",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	got, _ := cfgRepo.Get(ctx, "upd-1")
	got.Name = "new-name"
	got.Addr = "new-addr"
	if _, err := cfgRepo.Update(ctx, got); err != nil {
		t.Fatalf("Update: %v", err)
	}

	updated, err := cfgRepo.Get(ctx, "upd-1")
	if err != nil {
		t.Fatalf("Get after update: %v", err)
	}
	if updated.Name != "new-name" {
		t.Errorf("Name = %q, want new-name", updated.Name)
	}
	if updated.Addr != "new-addr" {
		t.Errorf("Addr = %q, want new-addr", updated.Addr)
	}
}

func TestStoreConfig_SoftDelete(t *testing.T) {
	_, _, cfgRepo, cleanup := openTestDB(t)
	defer cleanup()
	ctx := context.Background()

	_, err := cfgRepo.Create(ctx, &repo.StoreConfig{
		ID: "del-1", Name: "to-delete", Addr: "addr",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := cfgRepo.Delete(ctx, "del-1"); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	// Should not appear in List
	list, _ := cfgRepo.List(ctx)
	for _, c := range list {
		if c.ID == "del-1" {
			t.Error("soft-deleted config should not appear in List")
		}
	}

	// Should still be readable via Get (mark_deleted=1)
	got, err := cfgRepo.Get(ctx, "del-1")
	if err != nil {
		t.Fatalf("Get after delete: %v", err)
	}
	if got == nil {
		t.Fatal("Get after soft delete returned nil, expected record with mark_deleted=1")
	}
	if !got.MarkDeleted {
		t.Error("expected MarkDeleted=true after soft delete")
	}
}

func TestStoreConfig_GetMissing(t *testing.T) {
	_, _, cfgRepo, cleanup := openTestDB(t)
	defer cleanup()

	got, err := cfgRepo.Get(context.Background(), "nonexistent")
	if err != nil {
		t.Fatalf("Get missing: %v", err)
	}
	if got != nil {
		t.Errorf("expected nil for missing record, got %+v", got)
	}
}

// ────────────────────────────────────────────────────────────
// Snapshot E2E
// ────────────────────────────────────────────────────────────

func TestSnapshot_CreateAndGet(t *testing.T) {
	snapRepo, _, _, cleanup := openTestDB(t)
	defer cleanup()
	ctx := context.Background()

	meta := &repo.SnapshotMeta{
		ID:     "snap-001",
		Name:   "test-snap",
		AppID:  "app-1",
		Tags:   []string{"prod", "v1"},
		TapIDs: []string{"tap-a", "tap-b"},
		Status: repo.SnapshotStatusPending,
	}
	created, err := snapRepo.Create(ctx, meta)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if created.CreatedAt <= 0 {
		t.Error("expected CreatedAt to be set")
	}

	got, err := snapRepo.Get(ctx, "snap-001")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got == nil {
		t.Fatal("Get returned nil")
	}
	if got.Name != "test-snap" {
		t.Errorf("Name = %q, want test-snap", got.Name)
	}
	if len(got.Tags) != 2 || got.Tags[0] != "prod" {
		t.Errorf("Tags = %v, want [prod v1]", got.Tags)
	}
	if len(got.TapIDs) != 2 || got.TapIDs[0] != "tap-a" {
		t.Errorf("TapIDs = %v, want [tap-a tap-b]", got.TapIDs)
	}
	if got.Status != repo.SnapshotStatusPending {
		t.Errorf("Status = %q, want pending", got.Status)
	}
}

func TestSnapshot_List(t *testing.T) {
	snapRepo, _, _, cleanup := openTestDB(t)
	defer cleanup()
	ctx := context.Background()

	for _, id := range []string{"s1", "s2", "s3"} {
		_, err := snapRepo.Create(ctx, &repo.SnapshotMeta{
			ID: id, Name: "snap-" + id, Status: repo.SnapshotStatusPending,
		})
		if err != nil {
			t.Fatalf("Create %s: %v", id, err)
		}
	}

	list, err := snapRepo.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 3 {
		t.Errorf("len(list) = %d, want 3", len(list))
	}
}

func TestSnapshot_UpdateStatus(t *testing.T) {
	snapRepo, _, _, cleanup := openTestDB(t)
	defer cleanup()
	ctx := context.Background()

	_, err := snapRepo.Create(ctx, &repo.SnapshotMeta{
		ID: "st-1", Name: "snap", Status: repo.SnapshotStatusPending,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := snapRepo.UpdateStatus(ctx, "st-1", repo.SnapshotStatusDone, ""); err != nil {
		t.Fatalf("UpdateStatus: %v", err)
	}

	got, _ := snapRepo.Get(ctx, "st-1")
	if got.Status != repo.SnapshotStatusDone {
		t.Errorf("Status = %q, want done", got.Status)
	}
}

func TestSnapshot_UpdateStatusWithError(t *testing.T) {
	snapRepo, _, _, cleanup := openTestDB(t)
	defer cleanup()
	ctx := context.Background()

	_, err := snapRepo.Create(ctx, &repo.SnapshotMeta{
		ID: "st-err", Name: "snap", Status: repo.SnapshotStatusBuilding,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := snapRepo.UpdateStatus(ctx, "st-err", repo.SnapshotStatusFailed, "timeout"); err != nil {
		t.Fatalf("UpdateStatus: %v", err)
	}

	got, _ := snapRepo.Get(ctx, "st-err")
	if got.Status != repo.SnapshotStatusFailed {
		t.Errorf("Status = %q, want failed", got.Status)
	}
	if got.ErrorMsg != "timeout" {
		t.Errorf("ErrorMsg = %q, want timeout", got.ErrorMsg)
	}
}

func TestSnapshot_UpdateChunkInfo(t *testing.T) {
	snapRepo, _, _, cleanup := openTestDB(t)
	defer cleanup()
	ctx := context.Background()

	_, err := snapRepo.Create(ctx, &repo.SnapshotMeta{
		ID: "ci-1", Name: "snap", Status: repo.SnapshotStatusBuilding,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := snapRepo.UpdateChunkInfo(ctx, "ci-1", 3, 102400); err != nil {
		t.Fatalf("UpdateChunkInfo: %v", err)
	}

	got, _ := snapRepo.Get(ctx, "ci-1")
	if got.ChunkCount != 3 {
		t.Errorf("ChunkCount = %d, want 3", got.ChunkCount)
	}
	if got.TotalBytes != 102400 {
		t.Errorf("TotalBytes = %d, want 102400", got.TotalBytes)
	}
}

func TestSnapshot_SoftDelete(t *testing.T) {
	snapRepo, _, _, cleanup := openTestDB(t)
	defer cleanup()
	ctx := context.Background()

	_, err := snapRepo.Create(ctx, &repo.SnapshotMeta{
		ID: "del-snap", Name: "snap", Status: repo.SnapshotStatusDone,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := snapRepo.Delete(ctx, "del-snap"); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	// Should not appear in List
	list, _ := snapRepo.List(ctx)
	for _, s := range list {
		if s.ID == "del-snap" {
			t.Error("soft-deleted snapshot should not appear in List")
		}
	}

	// Raw Get should reflect mark_deleted
	got, err := snapRepo.Get(ctx, "del-snap")
	if err != nil {
		t.Fatalf("Get after delete: %v", err)
	}
	if got == nil {
		t.Fatal("Get returned nil after soft delete")
	}
	if !got.MarkDeleted {
		t.Error("expected MarkDeleted=true after soft delete")
	}
}

// ────────────────────────────────────────────────────────────
// Chunk E2E
// ────────────────────────────────────────────────────────────

func TestChunk_SaveAndLoad(t *testing.T) {
	snapRepo, chunkRepo, _, cleanup := openTestDB(t)
	defer cleanup()
	ctx := context.Background()

	// Snapshot must exist for FK constraint
	_, err := snapRepo.Create(ctx, &repo.SnapshotMeta{
		ID: "snap-chunk", Name: "snap", Status: repo.SnapshotStatusBuilding,
	})
	if err != nil {
		t.Fatalf("Create snapshot: %v", err)
	}

	payload := []byte(`{"metrics":[{"name":"cpu","value":0.75},{"name":"mem","value":0.4}]}`)
	if err := chunkRepo.Save(ctx, "snap-chunk", payload); err != nil {
		t.Fatalf("Save: %v", err)
	}

	loaded, err := chunkRepo.Load(ctx, "snap-chunk")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if string(loaded) != string(payload) {
		t.Errorf("loaded = %q, want %q", loaded, payload)
	}
}

func TestChunk_LoadMissing(t *testing.T) {
	_, chunkRepo, _, cleanup := openTestDB(t)
	defer cleanup()

	data, err := chunkRepo.Load(context.Background(), "nonexistent")
	if err != nil {
		t.Fatalf("Load missing: %v", err)
	}
	if data != nil {
		t.Errorf("expected nil for missing chunk, got %d bytes", len(data))
	}
}

func TestChunk_Delete(t *testing.T) {
	snapRepo, chunkRepo, _, cleanup := openTestDB(t)
	defer cleanup()
	ctx := context.Background()

	_, err := snapRepo.Create(ctx, &repo.SnapshotMeta{
		ID: "snap-del-chunk", Name: "snap", Status: repo.SnapshotStatusDone,
	})
	if err != nil {
		t.Fatalf("Create snapshot: %v", err)
	}

	payload := []byte(`{"foo":"bar"}`)
	if err := chunkRepo.Save(ctx, "snap-del-chunk", payload); err != nil {
		t.Fatalf("Save: %v", err)
	}

	if err := chunkRepo.Delete(ctx, "snap-del-chunk"); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	data, err := chunkRepo.Load(ctx, "snap-del-chunk")
	if err != nil {
		t.Fatalf("Load after delete: %v", err)
	}
	if data != nil {
		t.Errorf("expected nil after delete, got %d bytes", len(data))
	}
}

func TestChunk_LargePayloadRoundtrip(t *testing.T) {
	snapRepo, chunkRepo, _, cleanup := openTestDB(t)
	defer cleanup()
	ctx := context.Background()

	_, err := snapRepo.Create(ctx, &repo.SnapshotMeta{
		ID: "snap-large", Name: "snap", Status: repo.SnapshotStatusBuilding,
	})
	if err != nil {
		t.Fatalf("Create snapshot: %v", err)
	}

	// ~100KB payload
	large := make([]byte, 100*1024)
	for i := range large {
		large[i] = byte('a' + (i % 26))
	}

	if err := chunkRepo.Save(ctx, "snap-large", large); err != nil {
		t.Fatalf("Save large: %v", err)
	}

	loaded, err := chunkRepo.Load(ctx, "snap-large")
	if err != nil {
		t.Fatalf("Load large: %v", err)
	}
	if len(loaded) != len(large) {
		t.Errorf("loaded len = %d, want %d", len(loaded), len(large))
	}
	for i := range large {
		if loaded[i] != large[i] {
			t.Errorf("mismatch at byte %d: got %d, want %d", i, loaded[i], large[i])
			break
		}
	}
}

// ────────────────────────────────────────────────────────────
// Persistence across DB open/close
// ────────────────────────────────────────────────────────────

func TestPersistence_StoreConfigSurvivesReopen(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "persist.db")

	// Write
	{
		sqlDB, err := db.Open(dbPath)
		if err != nil {
			t.Fatalf("open db (write): %v", err)
		}
		cfgRepo := repo.NewStoreConfigRepo(sqlDB)
		_, err = cfgRepo.Create(context.Background(), &repo.StoreConfig{
			ID: "persist-1", Name: "persist-store", Addr: "1.2.3.4:8082",
		})
		sqlDB.Close()
		if err != nil {
			t.Fatalf("Create: %v", err)
		}
	}

	// Re-read from new connection
	{
		sqlDB, err := db.Open(dbPath)
		if err != nil {
			t.Fatalf("open db (read): %v", err)
		}
		defer sqlDB.Close()
		cfgRepo := repo.NewStoreConfigRepo(sqlDB)
		got, err := cfgRepo.Get(context.Background(), "persist-1")
		if err != nil {
			t.Fatalf("Get after reopen: %v", err)
		}
		if got == nil {
			t.Fatal("record not found after reopen")
		}
		if got.Name != "persist-store" {
			t.Errorf("Name = %q, want persist-store", got.Name)
		}
	}
}

func TestPersistence_SnapshotSurvivesReopen(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "snap-persist.db")

	// Write
	{
		sqlDB, err := db.Open(dbPath)
		if err != nil {
			t.Fatalf("open db (write): %v", err)
		}
		snapRepo := repo.NewSnapshotRepo(sqlDB)
		chunkRepo := repo.NewChunkRepo(sqlDB)
		_, err = snapRepo.Create(context.Background(), &repo.SnapshotMeta{
			ID: "psnap-1", Name: "persist-snap", Status: repo.SnapshotStatusDone,
			Tags: []string{"release"}, TapIDs: []string{"tap-x"},
		})
		if err != nil {
			sqlDB.Close()
			t.Fatalf("Create snapshot: %v", err)
		}
		err = chunkRepo.Save(context.Background(), "psnap-1", []byte(`{"data":"hello"}`))
		sqlDB.Close()
		if err != nil {
			t.Fatalf("Save chunk: %v", err)
		}
	}

	// Re-read
	{
		sqlDB, err := db.Open(dbPath)
		if err != nil {
			t.Fatalf("open db (read): %v", err)
		}
		defer sqlDB.Close()
		snapRepo := repo.NewSnapshotRepo(sqlDB)
		chunkRepo := repo.NewChunkRepo(sqlDB)
		ctx := context.Background()

		got, err := snapRepo.Get(ctx, "psnap-1")
		if err != nil {
			t.Fatalf("Get after reopen: %v", err)
		}
		if got == nil {
			t.Fatal("snapshot not found after reopen")
		}
		if got.Name != "persist-snap" {
			t.Errorf("Name = %q, want persist-snap", got.Name)
		}
		if len(got.Tags) != 1 || got.Tags[0] != "release" {
			t.Errorf("Tags = %v, want [release]", got.Tags)
		}

		data, err := chunkRepo.Load(ctx, "psnap-1")
		if err != nil {
			t.Fatalf("Load chunk after reopen: %v", err)
		}
		if string(data) != `{"data":"hello"}` {
			t.Errorf("chunk data = %q, want {\"data\":\"hello\"}", data)
		}
	}
}
