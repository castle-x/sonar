# AGENTS.md This file provides guidance to CodeBuddy when working with code in this repository.

## Project Overview

Sonar is a Grafana+Prometheus-like monitoring system for server load testing. Three independent services in a monorepo, each with its own `go.mod` and independent build/deploy:

| Service | Status | Port | Description |
|---------|--------|------|-------------|
| `sonar-tap/` | Production Ready | 9090 | Data collector (node + process + log metrics) |
| `sonar-store/` | Skeleton | 8281 | Metrics storage service (Prometheus TSDB) |
| `sonar-view/` | Skeleton | 8080 | Visualization platform + remote management |

Legacy reference code lives in `.legacy/` (exporter, datasource, monitor_hub, log_exporter, node_process_exporter). Never modify `.legacy/` — copy code from it into new projects if needed.

## Build & Run Commands

### sonar-tap (GVE project with frontend)

```bash
cd sonar-tap
gve dev                          # Dev mode (Air hot-reload backend + Vite frontend)
gve build                        # Build single binary with embedded frontend
make clean                       # rm -rf dist/ site/dist/
```

### sonar-store (pure Go, no frontend)

```bash
cd sonar-store
make dev                         # go run ./cmd/server/
make build                       # go build -o dist/sonar-store ./cmd/server
make clean
```

### sonar-view (GVE project with frontend)

```bash
cd sonar-view
gve dev                          # Dev mode (Air + Vite)
gve build                        # Build single binary with embedded frontend
make clean
```

### Frontend (inside site/ of tap or view)

```bash
cd sonar-tap/site                # or sonar-view/site
pnpm install
pnpm dev                         # Vite dev server only
pnpm build                       # Production build
pnpm lint                        # Biome check
pnpm lint:fix                    # Biome check --write
pnpm typecheck                   # TypeScript check
```

### Go

```bash
go vet ./...
go build ./...
go test -race ./...              # All tests with race detector
go test -v -run TestFuncName ./pkg/metrics/...  # Single test
```

## Architecture

### Data Flow

```
Data path:   tap ──push──→ store ←──pull── view
Management:  view ──HTTP proxy──→ tap:9090/api/v1/*
```

- Multiple tap instances push `MetricPoint` batches to store via `POST /api/metrics/v1/ReportMetrics`
- View pulls from store for visualization, never connects directly to tap for data
- View proxies management requests to individual tap instances (config, debug endpoints)

### API Contracts (Thrift IDL)

Thrift IDL files in `api/` define inter-service contracts. The core contract is `api/sonar-store/metrics/v1/metrics.thrift` defining `MetricPoint`, `ReportMetricsRequest/Response`, and `QueryMetricsRequest/Response`.

Each service also has IDL copies in its own `api/` directory (e.g., `sonar-tap/api/sonar-store/metrics/v1/metrics.thrift`).

**Workflow**: Edit `.thrift` → run `gve api generate` → auto-generates Go structs + HTTP clients into `internal/api/` and TS clients into `site/src/api/`.

### sonar-tap Internals (Production Ready)

**Goroutine model**:
- `collectLoop`: Single goroutine with ticker, calls `nodeExp.Record()` + `procExp.Record()` each tick
- `WatcherManager`: Each FileWatcher runs 8 `lineWorker` goroutines, log lines pass through 4096-buffer channel
- Dual channel: `rawCh` (collectors/watchers write) → `TeeToPreview` → `mainCh` (datasource client consumes), preview ring buffer receives copy

**Hot reload**: `configstore.Subscribe()` broadcasts config changes to a channel. `handleConfigReload` goroutine receives changes, calls `StopAll()` + `runWatchers()` to rebuild log watchers. Node/process exporter rules require restart (not yet hot-reloadable).

**Key packages**:
- `pkg/collector/` — CPU, memory, network, disk collectors (interface-based)
- `pkg/nodeexporter/` — NodeExporter + ProcessExporter wrappers
- `pkg/process/` — Process discovery via `/proc/*/cmdline`, rule-based filtering with `!` prefix for negation
- `pkg/watcher/` — Log file monitoring (fsnotify + worker pool)
- `pkg/metrics/` — Log line regex extraction, density sampling, minuteCount
- `pkg/datasource/` — HTTP batch client, posts MetricPoint batches to store
- `pkg/configstore/` — In-memory config store with change broadcasting
- `pkg/metricsbuf/` — 200-entry ring buffer for `/metrics/preview`
- `pkg/chanutil/` — `TeeToPreview`: splits one channel into main + preview

**Management API** (12 endpoints on `:9090`):
```
GET/PUT  /api/v1/config           GET  /api/v1/processes
PATCH   /api/v1/config/node       POST /api/v1/debug/regex
PATCH   /api/v1/config/process    POST /api/v1/debug/match_process
PATCH   /api/v1/config/log        POST /api/v1/debug/match_log
POST    /api/v1/config/reload     GET  /api/v1/status
GET     /api/v1/metrics/preview   GET  /api/v1/health
```

### sonar-store & sonar-view (Skeleton Stage)

Both are scaffolded with `cmd/server/main.go` + empty `internal/{handler,service,repo}/` + generated API types. No business logic yet. Store will use Prometheus TSDB; View will have multi-level aggregation, reports, scoring, and remote tap management.

## GVE Project Structure Convention

```
{project}/
├── cmd/server/main.go         # Entry point, register routes only
├── internal/
│   ├── handler/               # HTTP layer
│   ├── service/               # Business logic
│   ├── repo/                  # Data access (store only)
│   └── api/                   # Generated Go types + HTTP clients
├── api/                       # Thrift IDL contracts (input for gve api generate)
├── pkg/                       # Shared packages (tap only)
├── site/                      # Frontend (React 18 + TypeScript + Vite + Tailwind)
│   ├── src/views/             # Pages
│   ├── src/shared/            # Shared components, hooks, lib
│   ├── src/api/               # Generated TS clients
│   └── embed.go               # go:embed dist/ into binary
├── config/                    # YAML config files (tap only)
├── Makefile
├── gve.lock                   # GVE dev mode lock file
└── go.mod
```

## Code Style

### Go

- **Imports**: Group as stdlib → external → internal
- **Naming**: `camelCase` vars/funcs, `PascalCase` exported, `snake_case` files. Prefer short: `cfg` not `config`, `ch` not `channel`
- **Errors**: Return early, wrap with `fmt.Errorf("%v", err)`, never ignore with `_`
- **Types**: Prefer concrete types over interfaces. `map[string]any` for dynamic JSON
- **Comments**: DO NOT add comments unless explicitly requested
- **HTTP**: Standard library `net/http` only (no frameworks)

### Frontend

- **Formatting**: Biome (`biome.json`) — 2-space indent, 100 char width, double quotes, semicolons, trailing commas
- **Styling**: Tailwind CSS only, NO separate CSS files. Use `cn()` from `@/shared/lib/cn` for merging, `cva()` for variants
- **Types**: Explicit return types on exported functions. `interface` for objects, `type` for unions/aliases
- **UI components**: Managed via `gve ui add`, stored in `src/shared/shadcn/`

## Key Conventions

1. Always run lint/typecheck before claiming completion
2. Use GVE commands for adding UI components (`gve ui add`) and API contracts (`gve api generate`)
3. Follow directory structure — don't mix handler/service/repo layers
4. API contracts: edit `.thrift` → `gve api generate` → code auto-generated, never edit `internal/api/` or `site/src/api/` manually
5. Configuration is YAML-based; hot reload supported for log_config only (node/process need restart)
6. Process rule filtering: `!` prefix means negation (e.g., `"!seed"` excludes processes matching "seed")

## Dependencies

- Go 1.25.6 (tap), Go 1.23.0 (store), Go 1.22 (view)
- Node 18+, pnpm preferred
- Biome for linting/formatting
- GVE CLI (`gve`) for project management, dev mode, API generation
- Key Go deps (tap): `gopsutil/v4`, `fsnotify`, `github.com/castle-x/goutils`
