# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**datasource** is a time-series metrics collection and storage service built on the [Hertz](https://github.com/cloudwego/hertz) HTTP framework. It collects application metrics, tracks stress-testing marks, manages data exporters, and stores data in Prometheus TSDB with optional MongoDB support.

## Build & Run Commands

```bash
# Build (current platform)
sh build.sh                  # Runs go mod tidy, compiles to bin/datasource

# Build via Makefile
make build                   # Build frontend + backend
make build-backend           # Backend only
make build-linux             # Cross-compile for Linux amd64

# Development
make dev-backend             # Start backend on localhost:8080
make dev-web                 # Start frontend dev server on localhost:5173

# Run
sh bin/bootstrap.sh          # Start service in background (logs in bin/logs/)
sh bin/terminate.sh          # Stop service
./bin/datasource -c config.yaml  # Run directly with config
```

## Testing

Tests are Python-based scripts in `tests/`:

```bash
./run_tests.sh               # Interactive test menu

# Run individual tests
cd tests
python3 test_mark_batch.py --duration 60 --qps 10   # Load test
python3 quick_mark_test.py                           # Quick data flow test
python3 test_recorder.py                             # Test in-memory cache
python3 compare_data_sources.py                      # Compare Recorder vs TSDB
python3 test_query.py                                # TSDB query test
```

## Code Generation

The project uses a custom `hzx` code generator. After modifying Thrift IDL files in `apis/` or config templates:

```bash
hzx update apis     # Regenerate from Thrift IDL → Go handlers/routers
hzx update biz      # Regenerate business code templates in biz/
hzx update wire     # Regenerate Wire DI providers
hzx update config   # Regenerate config structures from config/v1/config.yaml.tmpl
hzx update          # Regenerate everything
```

## Architecture

### Request Flow
```
HTTP Request → Hertz Router → Handler (biz/*/v1/handler.go) → pkg/* infrastructure
```

### Layer Structure
- **`apis/`** — Thrift IDL definitions (source of truth for API contracts)
- **`biz/*/v1/`** — Business logic handlers; each service has `handler.go`, `service.go`, `router.go`
- **`internal/`** — Middleware, WebSocket manager, MongoDB client, Wire providers, Hertz app wrapper
- **`pkg/`** — Reusable infrastructure: aggregator, exporter manager, TSDB storage, serializer
- **`cmd/datasource/`** — Entry point and Wire dependency graph
- **`config/v1/`** — Config template (`config.yaml.tmpl`) and generated Go structs

### Dependency Injection (Wire)

Google Wire is used for compile-time DI. Provider sets in `internal/provider/`:
- `GeneratedProviderSet` — auto-scanned from `biz/`
- `CustomProviderSet` — manual dependencies
- `TriggerProviderSet` — scheduled triggers
- `BizProviderSet` — business layer aggregation

After modifying providers, regenerate with `wire` or `hzx update wire`.

### Mark Aggregation Pipeline

Marks (from stress tests) flow through:
```
POST /apis/v1/mark → Recorder (in-memory, 5min TTL)
                   → Aggregator (every 5s) → MetricPoints → TSDB (persistent)
```

Each request generates 11 MetricPoints. Query via `/apis/v1/mark/list` (Recorder, real-time) or `/apis/v1/metrics/query` (TSDB, historical).

### Storage Interface

`pkg/storage/interface.go` defines a generic `Storage[T]` interface backed by Prometheus TSDB. Type conversion is handled by `Serializer[T]` implementations per domain (marks, metrics).

### Exporter Lifecycle

Exporters (data reporters) tracked in `pkg/exporter/` with states: UP → DOWN (no scrape >5min) → auto-removed (DOWN for >1hr).

## Key Configuration

Default config template at `config/v1/config.yaml.tmpl`. Notable defaults:
- HTTP port: `8082`
- Storage: Prometheus TSDB, `./data`, 7-day retention
- Mark aggregation: every `5s`, TTL `5m`
- MongoDB: disabled by default
- Consul: disabled by default
- WebSocket: enabled
