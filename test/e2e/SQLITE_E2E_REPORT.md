# SQLite E2E Test Report

**Date**: 2026-04-14  
**Project**: sonar-view  
**Test Target**: SQLite 持久化层（store-configs + snapshots）  
**Result**: ✅ ALL PASS

---

## Environment

| Component | Status | Address |
|-----------|--------|---------|
| sonar-store | ✅ Running | :8082 |
| sonar-view  | ✅ Running | :8283 |
| SQLite DB   | `./data/sonar-view.db` (WAL mode) | — |

---

## Test Results

### A. Store Config CRUD

| # | Test | Result |
|---|------|--------|
| A1 | `POST /api/v1/store-configs` — create `{name:"test-store", addr:"localhost:8082"}` | ✅ PASS — 201, returned UUID |
| A2 | `GET /api/v1/store-configs` — verify created item in list | ✅ PASS — item present |
| A3 | `PUT /api/v1/store-configs/:id` — update name to `test-store-updated` | ✅ PASS — `{"status":"ok"}` |
| A4 | `DELETE /api/v1/store-configs/:id` — soft-delete | ✅ PASS — `{"status":"ok"}` |
| A5 | `GET /api/v1/store-configs` — verify deleted item absent | ✅ PASS — empty list |

### B. Snapshot CRUD

| # | Test | Result |
|---|------|--------|
| B1 | `POST /api/v1/snapshots` — create `{name:"test-snap", start_time, end_time}` | ✅ PASS — status=pending, UUID returned |
| B2 | `GET /api/v1/snapshots` — verify created snapshot in list | ✅ PASS — item present |
| B3 | `GET /api/v1/snapshots/:id` — verify detail | ✅ PASS — fields correct |
| B4 | `DELETE /api/v1/snapshots/:id` — soft-delete | ✅ PASS — `{"status":"ok"}` |
| B5 | `GET /api/v1/snapshots` — verify deleted item absent | ✅ PASS — no longer listed |

### C. Persistence Verification (restart)

| # | Test | Result |
|---|------|--------|
| C1 | `GET /api/v1/store-configs` after sonar-view restart | ✅ PASS — `persist-store` still present |
| C2 | `GET /api/v1/snapshots` after sonar-view restart | ✅ PASS — `persist-snap` still present |

### D. Error Handling

| # | Test | Result |
|---|------|--------|
| D1 | `GET /api/v1/snapshots/nonexistent` — expect 404 | ✅ PASS — HTTP 404 |
| D2 | `POST /api/v1/store-configs` with missing `addr` — expect 400 | ✅ PASS — HTTP 400, `"name and addr are required"` |

---

## Summary

All **12 test cases** passed with zero bugs found.

- SQLite WAL mode enables proper concurrent read/write.
- Soft-delete works correctly (mark_deleted=1, filtered from list queries).
- Data survives process restart — SQLite persistence confirmed.
- Error responses return correct HTTP status codes with descriptive messages.

---

## Fix Applied During Testing

**Issue**: `config.go` TSDBConfig struct was missing `mapstructure` tags, causing viper `Unmarshal` to map `tsdb.data_dir` → empty string → `ErrDataDirEmpty` on startup.

**Fix**: Added `mapstructure:"data_dir"` (and other underscore-named fields) to `TSDBConfig`. Also confirmed `AggConfig`, `MongoDBConfig`, `SQLiteConfig` already had correct tags.

**Impact**: sonar-view now starts cleanly from `config/config.yaml`.
