# CODEBUDDY.md This file provides guidance to CodeBuddy when working with code in this repository.

## Common Commands

### Build & Run

| Command | Description |
|---------|-------------|
| `make build` | Build both frontend and backend. Frontend outputs to `site/dist/`, backend binary to `bin/monitor_hub`. |
| `make build-web` | Build frontend only (prefers `bun`, falls back to `npm`). |
| `make build-backend` | Build backend only via `build.sh`: runs `go mod tidy`, Wire generation, then `CGO_ENABLED=0 go build -ldflags="-s -w"`. |
| `make dev-web` | Start frontend dev server at http://localhost:5175 (Vite proxy forwards `/apis` to backend). |
| `make dev-backend` | Start backend service at http://localhost:8081, tails log files. |
| `make run` | Run the compiled binary: `cd bin && ./monitor_hub -c config.yaml`. |
| `make install-web` | Install frontend dependencies (prefers `bun`, falls back to `npm`). |
| `make clean` | Remove `site/dist`, `site/node_modules`, and `bin/monitor_hub`. |

### Code Generation (hzx scaffold)

| Command | Description |
|---------|-------------|
| `hzx update` | Regenerate all: APIs + biz + wire + config. **Preferred after any thrift/config change.** |
| `hzx update apis` | Regenerate Go code from `.thrift` files. Run after modifying any `apis/**/*.thrift`. |
| `hzx update biz` | Generate new handler/service/router skeletons for newly added thrift service methods. |
| `hzx update wire` | Regenerate `wire_gen.go` dependency injection code. |
| `hzx update config` | Regenerate config Go struct from `config/v1/config.yaml.tmpl`. |

### Backend Development

| Command | Description |
|---------|-------------|
| `go build ./...` | Verify all Go code compiles. Run after any backend change. |
| `go test ./pkg/...` | Run all unit tests in the `pkg/` directory. |
| `go test ./pkg/scoring/...` | Run tests for a specific package. |
| `go test -run TestFuncName ./pkg/scoring/...` | Run a single test function. |

### Frontend Development

| Command | Description |
|---------|-------------|
| `cd site && bun run dev` | Start Vite dev server with HMR. |
| `cd site && bun run build` | Production build with TypeScript check. |
| `cd site && bunx tsc --noEmit` | TypeScript type checking without building. |

## Architecture Overview

MonitorHub is a **real-time monitoring and persistent reporting platform** built as a single-binary Go application with an embedded React frontend. It collects Prometheus-format metrics from multiple Pushgateway data sources, provides cascading time-series aggregation, and stores report data in MongoDB.

### Backend (Go 1.23 + Hertz + Wire)

**Entry point**: `cmd/monitor_hub/monitor_hub.go` → Cobra CLI → `app.Run()` → Wire dependency injection → Hertz HTTP server.

**Layered architecture**:

```
cmd/           → Entry point, Cobra commands, Wire initialization
internal/      → Application internals (not importable externally)
  ├── hzapp/       → HertzApp: HTTP server setup, middleware, routing, WebSocket, static files
  ├── middleware/   → TaihuAuth (JWE gateway auth), Recovery, RequestID
  ├── provider/     → Wire ProviderSets (4 layers: Generated, Custom, Trigger, Biz)
  ├── trigger/      → Trigger framework: interval/cron/event/once trigger types
  └── websocket/    → Custom WebSocket server with topic-based routing, Envelope protocol
biz/           → Business modules (Handler + Service + Router per module)
  ├── datasource/v1/  → Data source CRUD, icon upload, status broadcasting
  ├── report/v1/      → Report CRUD, chunk management, scoring, forward/import
  ├── points/v1/      → Aggregated data point queries, real-time broadcasting
  ├── filetree/v1/    → File management
  └── task/v1/        → Task management
pkg/           → Reusable core packages
  ├── aggregator/     → Cascading aggregation engine (Manager→Collector→Aggregator)
  ├── storage/        → Generic TSDB interface based on Prometheus TSDB, Serializer[T] pattern
  ├── mongodb/        → MongoDB wrapper with TypedDocument[T], soft-delete, auto timestamps
  ├── repo/           → Repository interfaces + implementations (Datasource, Report, Task)
  ├── scoring/        → Report scoring system (interval/threshold, weights, N/A handling)
  ├── dataprocess/    → Data processing: aggregation, Points formatting, Rate, Summary tables
  ├── cache/          → Generic in-memory cache with TTL
  ├── taskpool/       → Async task pool with worker concurrency control
  ├── export/         → Report export to PNG via chromedp
  ├── trigger/        → Data source status detection trigger
  ├── siteserver/     → Frontend static file embed and serving
  └── utils/          → Compression, label processing, metric utilities
apis/          → Thrift IDL definitions (source of truth for API contracts)
config/        → Config YAML template → generated Go struct
```

**Key patterns**:
- **Dependency injection**: Google Wire with 4-layer ProviderSets (Generated → Custom → Trigger → Biz). All dependencies wired in `cmd/monitor_hub/app/wire.go`.
- **Business modules** follow Handler-Service-Router separation. Service layer (auto-generated) handles HTTP binding/validation. Handler (hand-written) contains business logic.
- **Trigger system**: Extensible framework supporting interval, cron, event, and one-shot triggers. Built-in triggers: DatasourceStatus, Aggregation, Cleanup.
- **WebSocket**: Custom Envelope protocol with `{topic}/{path}` routing, request/response/broadcast/heartbeat message types, Broadcaster interface for push updates.
- **Cascading aggregation**: raw → 15s → 30s → 1m → 5m → 1h → 6h. Each level aggregates from the previous level. Driven by AggregationTrigger.
- **Generic abstractions**: `Storage[T]`, `TypedDocument[T]`, `Cache[T]` provide type-safe reusable components.

### API Layer (Thrift)

All API definitions live in `apis/monitor_hub/` as `.thrift` files. **Never modify generated `.go` files under `apis/`** — always edit `.thrift` source and run `hzx update apis`.

Thrift modules:
- `base/v1/base.thrift` — Common Response, Page, error codes
- `datasource/v1/datasource.thrift` — Data source CRUD
- `report/v1/report.thrift` — Report system (most complex: reports, chunks, scoring, tasks)
- `points/v1/points.thrift` — Time-series data point queries
- `task/v1/task.thrift` — Task management
- `filetree/v1/filetree.thrift` — File management
- `pushgateway/metrics/v1/metrics.thrift` — Pushgateway metric collection

All REST endpoints use **POST** method, routed under `/apis/v1/`.

### Frontend (React 19 + TypeScript 5 + Vite 7)

**Entry**: `site/src/main.tsx` → Layout with Router, ThemeProvider, Navbar.

**Stack**: React 19, Tailwind CSS 4, Radix UI primitives (shadcn/ui style), Recharts 3 for charts, Tiptap 3 for rich text, nanostores for state management, @nanostores/router for client-side routing, @tanstack/react-table + react-virtual for data tables.

**Structure**:
```
site/src/
├── apis/          → API call functions (fetch-based, mirrors backend endpoints)
├── config/        → API paths, aggregation level configs (must match backend)
├── lib/           → Stores (nanostores), utils, enums, HTTP interceptor
└── components/
    ├── router.tsx     → Route definitions (lazy-loaded pages)
    ├── ui/            → Base UI components (shadcn/ui style)
    ├── charts/        → Recharts wrappers for time-series visualization
    ├── routes/        → Page-level route components
    ├── report-detail/ → Report detail sub-components
    ├── report-table/  → Report list table
    ├── task-detail/   → Task detail sub-components
    └── datasource-table/ → Data source list table
```

**Routes**: `/` (home), `/dashboard/:id` (live monitor), `/report/:id` (report detail), `/report/:id/export` (export view), `/task` (task list), `/task/:id` (task detail), `/files` (file manager), `/scoring-manager` (scoring config).

**Deployment**: In production, `site/dist/` is embedded into the Go binary via `embed.FS` (`pkg/siteserver/`), achieving single-binary deployment. In development, Vite proxies `/apis` requests to the backend.

### Key Files Not to Modify

These are auto-generated and will be overwritten by `hzx update`:
- `apis/**/*.go` — Generated from thrift
- `cmd/monitor_hub/app/wire_gen.go` — Generated by Wire
- `config/v1/config.go` — Generated from config template
- `biz/*/v1/service.go` — Generated HTTP binding layer
- `biz/*/v1/router.go` — Generated route registration

### Authentication

- **TaihuAuth middleware**: JWE token decryption from gateway, signature verification with configurable expiration.
- **Script-allowed paths**: `/apis/v1/report/create`, `/apis/v1/mark/batch`, `/apis/v1/mark`, `/apis/v1/mark/set_expired` — bypass auth, operator set to `script`.
- **Admin-only paths**: `/apis/v1/datasource/{create|update|del}`.
- **Dev mode**: When `Auth.Enable=false`, all users default to `developer`.

### Database

- **MongoDB**: Stores configurations, reports, tasks, data sources. Uses `pkg/mongodb` wrapper with generics.
- **Prometheus TSDB**: Stores time-series metric data via `pkg/storage` generic interface.

### Development Workflow Rules

1. **Discussion before coding**: Propose and confirm a technical plan before writing code. Wait for explicit "start developing" instruction.
2. **Backend-first**: Complete and verify backend before starting frontend work.
3. **Modular development**: Implement and test each module before moving to the next.
4. **Thrift-first API changes**: Always modify `.thrift` files, never edit generated Go code directly.
