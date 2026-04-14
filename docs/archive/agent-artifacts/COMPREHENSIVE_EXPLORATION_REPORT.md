# Comprehensive Sonar Project Exploration Report

**Date:** April 10, 2026  
**Explorer:** Explore Agent  
**Scope:** sonar-store/ + legacy/datasource/ + api/ directories

---

## Executive Summary

This report provides a detailed architectural and code-level analysis of two parallel Go-based metric storage systems:

1. **sonar-store** (New Implementation) - Modern, generic storage interface
2. **legacy/datasource** (Reference Architecture) - Full-featured Prometheus TSDB-based system

Both systems handle metrics aggregation, exporter lifecycle management, and time-series data persistence. The legacy system serves as a comprehensive reference for implementing the newer sonar-store.

---

## Part 1: sonar-store/ Directory Structure

### 1.1 Project Layout

```
sonar-store/
├── api/
│   └── sonar-store/
│       ├── base/v1/
│       │   ├── base.go
│       │   └── base.thrift
│       ├── exporter/v1/
│       │   ├── exporter.go
│       │   └── exporter.thrift
│       ├── metrics/v1/
│       │   ├── metrics.go
│       │   └── metrics.thrift
│       └── storage/v1/
│           └── storage.go
├── cmd/server/
│   └── main.go
├── config/
│   └── config.yaml
├── internal/
│   ├── api/
│   │   └── sonar-store/metrics/v1/
│   │       ├── client.go
│   │       └── metrics.go
│   ├── config/
│   │   └── config.go
│   ├── handler/
│   │   ├── exporter/
│   │   │   └── handler.go
│   │   └── mark/
│   │       └── handler.go
│   ├── provider/
│   │   └── provider.go
│   ├── repo/ (empty)
│   ├── router/
│   │   └── router.go
│   └── service/
│       ├── exporter_service.go
│       └── mark_service.go
├── pkg/
│   ├── aggregator/
│   │   ├── aggregator.go
│   │   └── recorder.go
│   ├── exporter/ (empty)
│   ├── serializer/ (empty)
│   └── storage/
│       ├── interface.go
│       ├── prometheus.go
│       └── serializer.go
├── go.mod
├── go.sum
├── Makefile
└── server (executable)
```

### 1.2 Dependencies (go.mod)

**Module:** `sonar-store` (Go 1.23.0)

**Key Direct Dependencies:**
- `github.com/cloudwego/hertz v0.9.6` - High-performance HTTP framework (ByteDance's)
- `github.com/google/uuid v1.6.0` - UUID generation
- `github.com/google/wire v0.7.0` - Dependency injection framework
- `github.com/prometheus/prometheus v0.53.3` - Prometheus TSDB
- `github.com/spf13/viper v1.18.2` - Configuration management
- `go.uber.org/zap v1.26.0` - Structured logging

**Notable Indirect:** Prometheus client, protocol buffers, etcd, OpenTelemetry

---

## Part 2: Core Architecture - sonar-store

### 2.1 Configuration System

**File:** `internal/config/config.go`

**Struct Hierarchy:**
```go
Config {
  Server     ServerConfig
  Storage    StorageConfig
  Mark       MarkConfig
  Exporter   ExporterConfig
  Logger     LoggerConfig
}
```

**ServerConfig:**
- Host, Port (default: 0.0.0.0:8082)

**StorageConfig:**
- DataDir (TSDB data directory)
- RetentionDays (default: 7)
- WALSegmentSize (default: 128MB)
- MaxChunkSize (default: 4MB)
- WriteBufferSize (default: 30,000)

**MarkConfig:**
- AggregateInterval (default: "5s") - Duration for aggregating marks
- TTL (default: "5m") - Time-to-live for mark data
- ChannelSize (default: 10,000)
- CleanupInterval (default: "1m")

**ExporterConfig:**
- StaleTimeout (default: "5m")
- CleanupInterval (default: "1m")
- CleanupAfter (default: "1h")

**LoggerConfig:**
- Level (debug, info, warn, error)

**Loading Strategy:**
1. Load defaults via `DefaultConfig()`
2. Override with config file (if provided via `-c` flag)
3. All duration fields are strings that parse at runtime

---

### 2.2 Generic Storage Interface

**File:** `pkg/storage/interface.go`

**Core Types:**

```go
// Generic storage interface for any data type T
type Storage[T any] interface {
  Write(ctx context.Context, points []T) error
  QueryByLabels(ctx context.Context, req *LabelQuery) ([]T, error)
  QueryByPromQL(ctx context.Context, req *PromQLQuery) ([]T, error)
  GetStats(ctx context.Context) (*Stats, error)
  Delete(ctx context.Context, startTime, endTime int64, labels map[string]string) error
  Close() error
}

// Serializer converts between domain type T and storage format
type Serializer[T any] interface {
  ToLabels(point T) Labels
  ToTimestamp(point T) int64
  ToValue(point T) float64
  FromDataPoint(dp *DataPoint) T
}
```

**Supporting Types:**
- `Labels` - map[string]string
- `DataPoint` - MetricName, Labels, Timestamp (Unix ms), Value (float64)
- `LabelQuery` - Labels, StartTime, EndTime, optional Limit
- `PromQLQuery` - Query string, time range, Step (duration)
- `Stats` - TotalSeries, TotalSamples, DiskSize, MinTime, MaxTime, TotalBlocks

**Design Philosophy:**
- ✅ Zero business logic coupling - all type conversion delegated to Serializer
- ✅ Both label-based and PromQL queries supported
- ✅ Generic [T] allows MetricPoint, AggregatedPoint, custom types
- ✅ Graceful error handling with validation

---

### 2.3 Entry Point

**File:** `cmd/server/main.go`

**Startup Flow:**
```
1. Parse flags: -c (config), -log-level, -addr
2. Initialize zap logger
3. Load configuration (with defaults)
4. Create Prometheus storage instance
   ├── Validate config
   ├── Ensure data directory exists
   ├── Open TSDB with retention policy
   └── Start background write worker
5. Initialize MarkAggregator (5s cycle)
6. Initialize Hertz engine
7. Inject dependencies via provider functions
8. Setup routes via Router
9. Start HTTP server on specified address
10. Listen for SIGINT/SIGTERM
11. Graceful shutdown:
    ├── Stop exporter service
    ├── Close TSDB
    └── Log completion
```

**Logger Setup:**
- Production JSON format with timestamps
- Configurable level (debug/info/warn/error)
- Hertz compatibility adapter (HertzLogger)

**Key Decisions:**
- Hertz for HTTP (ByteDance stack, high-performance)
- Goroutine-based server with signal handling
- Context-aware resource cleanup

---

### 2.4 Dependency Injection (Wire)

**File:** `internal/provider/provider.go`

**Wire Sets:**
```go
PrometheusStorageSet
  ├── ProvidePrometheusStorage(...) -> Storage[*metricsV1.MetricPoint]

AggregatorSet
  └── ProvideMarkAggregator(...) -> *MarkAggregator

ServiceSet
  ├── ProvideMarkService(...) -> *MarkService
  └── ProvideExporterService(...) -> *ExporterService

HandlerSet
  ├── ProvideMarkHandler(...) -> *mark.Handler
  ├── ProvideExporterHandler(...) -> *exporter.Handler
  └── ProvideRouter(...) -> *Router
```

**Provider Functions:**
1. Storage providers instantiate Prometheus TSDB with MetricPointSerializer
2. Aggregator provider configures 5s tick interval
3. Service providers wrap business logic
4. Handler providers create HTTP endpoint handlers
5. Router provider registers all routes

**Current Status:**
- Wire annotations are prepared but **generator not yet run**
- Wire files structure is in place for future code generation

---

### 2.5 HTTP Routing

**File:** `internal/router/router.go`

**Route Registration:**

| Method | Path | Handler |
|--------|------|---------|
| GET | /health | healthCheck |
| POST | /apis/v1/mark | MarkHandler.CreateMark |
| POST | /apis/v1/mark/batch | MarkHandler.BatchCreateMark |
| POST | /apis/v1/mark/list | MarkHandler.ListMark |
| POST | /apis/v1/mark/set_expired | MarkHandler.SetMarkExpired |
| GET | /apis/v1/metrics/query | MarkHandler.QueryMetrics |
| GET | /apis/v1/metrics/stats | MarkHandler.GetMetricsStats |
| GET | /apis/v1/exporters | ExporterHandler.ListExporters |
| GET | /apis/v1/exporters/stats | ExporterHandler.GetExporterStats |
| GET | /apis/v1/exporters/:id | ExporterHandler.GetExporter |
| POST | /apis/v1/exporters/record_scrape | ExporterHandler.RecordScrape |

**Router Structure:**
- Health check endpoint for readiness probes
- Grouped endpoints under `/apis/v1/`
- Handler methods receive context and request contexts

---

## Part 3: Legacy/Datasource - Reference Implementation

### 3.1 Project Structure

```
.legacy/datasource/
├── cmd/
│   └── datasource/
│       ├── datasource.go
│       └── app/
├── biz/
│   ├── exporter/v1/
│   │   ├── handler.go
│   │   ├── service.go
│   │   ├── router.go
│   │   └── middleware.go
│   ├── mark/v1/
│   │   ├── handler.go
│   │   ├── service.go
│   │   ├── router.go
│   │   └── middleware.go
│   └── metrics/v1/
│       ├── handler.go
│       ├── service.go
│       ├── router.go
│       └── middleware.go
├── internal/
│   ├── provider/
│   │   ├── gen_provider.go (Wire-generated)
│   │   ├── custom_provider.go
│   │   └── trigger_provider.go
│   ├── middleware/
│   ├── hzapp/
│   ├── mongodb/
│   └── websocket/
├── pkg/
│   ├── aggregator/
│   ├── exporter/
│   ├── serializer/
│   └── storage/
│       ├── interface.go
│       ├── prometheus.go
│       ├── errors.go
│       ├── utils.go
│       └── metric_storage.go
├── go.mod (Go 1.25.6)
└── [config, tests, scripts, docs]
```

### 3.2 Dependencies (legacy go.mod)

**Key Differences from sonar-store:**

**Additional Direct Dependencies:**
- `git.woa.com/castlexu/goutils v1.0.27` - Custom utilities
  - `recorder` - For batching/aggregating mark data
  - `trigger` - For scheduled tasks (compaction, cleanup)
  - `tools` - Duration parsing, etc.
- `github.com/hashicorp/consul/api v1.32.0` - Service discovery
- `github.com/hertz-contrib/registry/consul` - Consul registry integration
- `github.com/hertz-contrib/websocket v0.2.0` - WebSocket support
- `go.mongodb.org/mongo-driver v1.17.4` - MongoDB support (for external storage)

**Comparison:**
| Feature | sonar-store | datasource |
|---------|---|---|
| Service Discovery | ❌ | ✅ (Consul) |
| WebSocket | ❌ | ✅ |
| MongoDB | ❌ | ✅ |
| Custom Utils | ❌ | ✅ (goutils) |

---

### 3.3 Storage Layer (Detailed Implementation)

**File:** `pkg/storage/interface.go`

**Generic Interface Definition:**
```go
type Storage[T any] interface {
  Write(ctx context.Context, points []T, labels ...string) error
  QueryByLabels(ctx context.Context, req *LabelQuery) ([]T, error)
  QueryByPromQL(ctx context.Context, req *PromQLQuery) ([]T, error)
  GetStats(ctx context.Context) (*Stats, error)
  Delete(ctx context.Context, startTime, endTime int64, labels map[string]string) error
  Close() error
}

type Serializer[T any] interface {
  ToLabels(point T, labels ...string) Labels
  ToTimestamp(point T) int64
  ToValue(point T) float64
  FromDataPoint(dp *DataPoint) T
}
```

**Key Differences from sonar-store:**
1. **Global Labels Support** - `Write()` accepts optional `labels ...string` for batch-level tags
2. **Serializer Global Labels** - `ToLabels()` accepts optional global labels that can be merged
3. **More Comprehensive Errors** - Defined error constants for validation

**Error Definitions:**
- ErrConfigNil, ErrDataDirEmpty
- ErrInvalidRetentionDays, ErrInvalidBufferSize, ErrInvalidChunkSize
- ErrStorageClosed, ErrSerializerNil, ErrInvalidTimestamp, ErrEmptyPoints

### 3.4 Prometheus Storage Implementation

**File:** `pkg/storage/prometheus.go` (~700 lines)

**PrometheusStorage[T] Struct:**
```go
type PrometheusStorage[T any] struct {
  db                 *tsdb.DB
  config             *Config
  serializer         Serializer[T]
  stats              *Stats
  dataChan           chan *pendingDataPoint  // Async write queue
  stopChan           chan struct{}
  wg                 sync.WaitGroup
  triggerManager     *trigger.TriggerManager
  closed             bool
  mu, statsLock      sync.RWMutex
}
```

**Write Pipeline:**
```
User Code
  ↓ Write(ctx, points, globalLabels...)
  ↓ For each point:
    ├─ Serializer.ToLabels(point, globalLabels) → labels.Labels
    ├─ Serializer.ToTimestamp(point) → int64
    ├─ Serializer.ToValue(point) → float64
    └─ Send to dataChan (or drop if full)
  ↓ Background writeWorker()
    ├─ Batches points (100 max)
    ├─ Flushes every 100ms or on channel close
    └─ Appends to TSDB via appender.Append()
```

**Query Implementation:**

1. **QueryByLabels()**
   - Build matchers from metric name + labels
   - Create querier for time range
   - Iterate series, extract samples
   - Deserialize via Serializer.FromDataPoint()
   - Support result limiting

2. **QueryByPromQL()**
   - Parse PromQL expression
   - Create query engine (EngineOpts: MaxSamples=50M, Timeout=5min)
   - Execute range query
   - Convert result matrix to DataPoints
   - Deserialize back to domain type

**Statistics:**
- `getTotalSamples()` - Full scan for exact count (O(n))
- `estimateTotalSamples()` - Fast estimate from block metadata (O(blocks))
- `calculateDiskSize()` - Walk data directory
- `getMinTime()`, `getMaxTime()` - Check head + all blocks

**Trigger Integration:**
- `compactionTrigger` - Runs periodic TSDB compaction
- `cleanupTrigger` - Runs memory/cache cleanup
- Both registered with external trigger manager

**Key Design Patterns:**
1. ✅ **Async Writes** - Non-blocking append, background worker ensures durability
2. ✅ **Buffering Strategy** - 100-point batches with 100ms timeout
3. ✅ **Serializer Separation** - Business logic never touches Prometheus internals
4. ✅ **Time Normalization** - Auto-converts seconds to milliseconds
5. ✅ **Graceful Shutdown** - Close signals worker, waits for flush

### 3.5 Handler Layer - Three Patterns

#### A. Exporter Handler

**File:** `biz/exporter/v1/handler.go`

**Struct:**
```go
type ExporterHandler struct {
  cfg      *configV1.Config
  wsServer *websocket.Server
  manager  *exporter.Manager
}
```

**Methods:**
1. **ListExporters(ctx, req)** → Response
   - Input: ListExportersRequest (AppID, Page, PageSize, optional State filter)
   - Filter with pagination (default 20 per page)
   - Return list + total count
   - Log detailed metrics: ID, AppID, Instance, State, LastScrape, ScrapeCount

2. **GetExporter(ctx, req)** → Response
   - Input: GetExporterRequest (ID)
   - Lookup by ID
   - Return 404 if not found
   - Log: ID, AppID, Instance, State, LastScrape, ScrapeCount, LastError, Labels

3. **GetExporterStats(ctx, req)** → Response
   - Optional AppID filter
   - Return: Total, UpCount, DownCount, UnknownCount
   - Global or per-app stats

**Service Layer Wrapper:**
```go
type ExporterService struct {
  handler *ExporterHandler
}

// Each method: bind + validate request → call handler → JSON response
```

**Router Pattern:**
```go
func (s *ExporterService) Register(h *Hertz, wsServer) {
  _apis := root.Group("/apis", _apisMw()...)
  _v1 := _apis.Group("/v1", _v1Mw()...)
  _v1.GET("/exporters", append(_listexportersMw(), s.ListExporters)...)
  _v1.GET("/exporters/:id", append(_getexporterMw(), s.GetExporter)...)
  _v1.GET("/exporters/stats", append(_getexporterstatsMw(), s.GetExporterStats)...)
}
```

---

#### B. Mark Handler

**File:** `biz/mark/v1/handler.go`

**Struct:**
```go
type MarkHandler struct {
  cfg             *configV1.Config
  wsServer        *websocket.Server
  markAggregator  *pkgaggregator.MarkAggregator
  exporterManager *exporter.Manager
}
```

**Methods:**

1. **CreateMark(ctx, c *RequestContext, req *v1.Mark)** → Response
   ```
   Input: Mark { AppID, StressID, StartTime, EndTime, RequestName, ErrorMsg }
   Process:
     - Determine success flag from ErrorMsg presence
     - Extract instance from client IP (c.ClientIP())
     - Record to exporter manager (RecordScrape)
     - Write to mark aggregator via recorder.RequestTimeMeta:
       {StartTimeMs, EndTimeMs, RequestName, Success}
     - Return response or error
   ```
   - Instance extraction strategy: Fallback to client IP if not in labels

2. **BatchCreateMark(ctx, c, req *v1.MarkList)** → Response
   - Loop through marks in list
   - Call CreateMark for each
   - Aggregate success/failure counts
   - Return partial error if some marks fail

3. **ListMark(ctx, req *v1.QueryRequest)** → Response
   - Query parameter: `{"app_id": "...", "stress_id": "..."}`
   - Three scenarios:
     a. stressId provided → GetMetricsByStressId() → single item
     b. appId provided → GetMetricsByAppId() → all stressIds under app
     c. Neither → ListMetricsWithAppId() → all data
   - Convert recorder.RequestMetrics to v1.RequestMetrics (percentile stats)

4. **SetMarkExpired(ctx, req)** → Response
   - Mark specified stressId as expired
   - Triggers cleanup in aggregator

**Data Conversion:**
```go
convertToStressMetricsItem(stressId, appId, metricsMap) {
  // metricsMap: map[requestName]recorder.RequestMetrics
  // Output: v1.StressMetricsItem with stats:
  // - TotalNum, FailedNum
  // - RttAvgMs, RttMaxMs, RttMinMs
  // - RttP50Ms, RttP70Ms, RttP90Ms, RttP99Ms
  // - QPSAvg, SuccessRate
}
```

---

#### C. Metrics Handler

**File:** `biz/metrics/v1/handler.go`

**Struct:**
```go
type MetricsHandler struct {
  cfg             *configV1.Config
  wsServer        *websocket.Server
  tsdb            *storage.MetricStorage  // Generic storage wrapper
  exporterManager *exporter.Manager
}
```

**Methods:**

1. **ReportMetrics(ctx, c *RequestContext, req *v1.ReportMetricsRequest)** → ReportMetricResponse
   ```
   Input: ReportMetricsRequest {
     AppID,
     Metrics: []*MetricPoint,
     Labels: map[string]string (optional),
     LabelList: []string (optional, key-value pairs)
   }
   
   Process:
     - Extract instance from labels map, label_list, or client IP
     - Extract labels map from both formats
     - Build global labels: app_id + request labels
     - Store via tsdb.Write(ctx, metrics, globalLabels...)
     - Record with exporter manager (success or error)
     - Return code (0=success, 1=error)
   ```

2. **QueryMetrics(ctx, req *v1.MetricQuery)** → Response
   ```
   Input: MetricQuery {
     AppID,
     MetricName,
     Labels: []string (key-value pairs),
     StartTime, EndTime (Unix ms),
     PromQL: optional query string,
     Limit: optional result limit
   }
   
   Process:
     - If PromQL provided → QueryByPromQL()
     - Else → QueryByLabels() with metric name + labels
     - Prepend app_id to label filter
     - Return: Points, TotalCount, TimeRange
   ```

3. **GetStats(ctx, req)** → Response
   - Fetch from tsdb.GetStats()
   - Convert to v1.StorageStats (format times as strings)
   - Include: TotalSeries, DiskSize, RetentionDays, TotalSamples, TotalBlocks

**Helper Functions:**
```go
extractInstance(c *RequestContext, req) string
  // Try: labels["instance"] → label_list["instance"] → c.ClientIP()

extractLabelsMap(req) map[string]string
  // Merge both labels formats into single map
```

---

### 3.6 Wire Dependency Injection

**File:** `internal/provider/gen_provider.go` (code-generated)

**Wire Sets:**
```go
GeneratedProviderSet = wire.NewSet(
  configV1.New,
  ProvideGeneratedDeps,
)

BizProviderSet = wire.NewSet(
  exporterV1.NewExporterHandler,
  exporterV1.NewExporterService,
  markV1.NewMarkHandler,
  markV1.NewMarkService,
  metricsV1.NewMetricsHandler,
  metricsV1.NewMetricsService,
  ProvideBizDeps,
)
```

**BizDeps Struct:**
```go
type BizDeps struct {
  Services         []Service        // All services implement Register()
  Broadcasters     []websocket.Broadcaster
  exporterHandler  *exporterV1.ExporterHandler
  markHandler      *markV1.MarkHandler
  metricsHandler   *metricsV1.MetricsHandler
}

func ProvideBizDeps(...handlers) *BizDeps {
  return &BizDeps{
    Services: []Service{
      exporterService,
      markService,
      metricsService,
    },
    Broadcasters: [...],
    exporterHandler: ...,
    markHandler: ...,
    metricsHandler: ...,
  }
}
```

**File:** `internal/provider/custom_provider.go`

**Custom Dependencies:**
```go
CustomProviderSet = wire.NewSet(
  pkgserializer.NewRequestMetricPointSerializer,
  ProvideMetricPointStorage,        // Returns *MetricStorage (wrapper)
  ProvideMarkAggregator,            // Returns *MarkAggregator
  ProvideExporterManager,           // Returns *Manager
  ProvideCustomDeps,
)
```

**Key Provider Functions:**

1. **ProvideMetricPointStorage()**
   ```go
   → *MetricStorage wrapping PrometheusStorage[*MetricPoint]
   → Created with RequestMetricPointSerializer
   → Configured from cfg.Storage.*
   ```

2. **ProvideMarkAggregator()**
   ```go
   → *MarkAggregator
   → Tick interval: cfg.Mark.AggregateInterval (default: 5s)
   → TTL: cfg.Mark.Ttl (default: 5m)
   → Injected storage + recorder options
   ```

3. **ProvideExporterManager()**
   ```go
   → *exporter.Manager
   → StaleTimeout: 5m (no active reports)
   → CleanupInterval: 1m (periodic check)
   → CleanupAfter: 1h (remove down exporters)
   ```

---

## Part 4: API/Thrift Definitions

### 4.1 sonar/api Directory

**Location:** `/Users/castlexu/github/sonar/api/sonar-store/`

**Structure:**
```
api/sonar-store/
└── metrics/v1/
    └── metrics.thrift
```

Only Thrift files present in top-level api/; generated Go code lives in sonar-store/api/.

### 4.2 Legacy API Definitions

Located in `.legacy/datasource/apis/datasource/`:
- base/v1/ → base.thrift (response envelope)
- exporter/v1/ → exporter.thrift
- mark/v1/ → mark.thrift
- metrics/v1/ → metrics.thrift

---

## Part 5: Key Design Patterns & Comparison

### 5.1 Serialization Strategy

| Aspect | sonar-store | datasource |
|--------|---|---|
| **Serializer Interface** | `Serializer[T]` | `Serializer[T]` |
| **Global Labels** | Not in interface | Optional in `Write()`, `ToLabels()` |
| **Timestamp Handling** | Direct extraction | With normalization (sec→ms) |
| **Error Handling** | Basic | Comprehensive with validation |

**Datasource Advantage:**
- Automatic time normalization (handles legacy second-based timestamps)
- Global labels reduce duplicated metadata per point

### 5.2 Query Patterns

| Query Type | sonar-store | datasource |
|---|---|---|
| **Label Query** | ✅ | ✅ |
| **PromQL** | ✅ | ✅ |
| **Batching** | via buffer | via recorder |
| **Aggregation** | Upcoming | Implemented |

### 5.3 Write Performance

**sonar-store:**
- Direct to storage (via handler)
- No pre-aggregation layer

**datasource:**
- Write → recorder → aggregator (5s window)
- Aggregator batches and writes to storage
- Reduces write pressure on TSDB

---

## Part 6: Handler Signature Reference

### Mark Handler Signatures

```go
// sonar-store (to be implemented)
func (h *mark.Handler) CreateMark(ctx *app.RequestContext) error
func (h *mark.Handler) BatchCreateMark(ctx *app.RequestContext) error
func (h *mark.Handler) ListMark(ctx *app.RequestContext) error
func (h *mark.Handler) SetMarkExpired(ctx *app.RequestContext) error
func (h *mark.Handler) QueryMetrics(ctx *app.RequestContext) error
func (h *mark.Handler) GetMetricsStats(ctx *app.RequestContext) error

// datasource (reference implementation)
func (s *MarkHandler) CreateMark(ctx context.Context, c *app.RequestContext, req *v1.Mark) *baseV1.Response
func (s *MarkHandler) BatchCreateMark(ctx context.Context, c *app.RequestContext, req *v1.MarkList) *baseV1.Response
func (s *MarkHandler) ListMark(ctx context.Context, req *baseV1.QueryRequest) *baseV1.Response
func (s *MarkHandler) SetMarkExpired(ctx context.Context, req *v1.SetMarkExpiredRequest) *baseV1.Response
```

**Key Differences:**
- **sonar-store**: Single parameter (RequestContext)
- **datasource**: Separate context + RequestContext + typed request
- **sonar-store**: No return type (must write to RequestContext)
- **datasource**: Returns baseV1.Response (serialized by service layer)

### Exporter Handler Signatures

```go
// datasource
func (s *ExporterHandler) ListExporters(ctx context.Context, req *v1.ListExportersRequest) *baseV1.Response
func (s *ExporterHandler) GetExporter(ctx context.Context, req *v1.GetExporterRequest) *baseV1.Response
func (s *ExporterHandler) GetExporterStats(ctx context.Context, req *v1.GetExporterStatsRequest) *baseV1.Response

// Methods expect:
// - Input: Thrift-generated request structs with Get*() accessor methods
// - Output: Response struct wrapped in baseV1.Response
// - Logging: Detailed debug logs for monitoring
```

### Metrics Handler Signatures

```go
// datasource
func (s *MetricsHandler) ReportMetrics(ctx context.Context, c *app.RequestContext, req *v1.ReportMetricsRequest) *v1.ReportMetricResponse
func (s *MetricsHandler) QueryMetrics(ctx context.Context, req *v1.MetricQuery) *baseV1.Response
func (s *MetricsHandler) GetStats(ctx context.Context, req *v1.GetStatsRequest) *baseV1.Response

// ReportMetrics returns custom response (ReportMetricResponse)
// Query/Stats return wrapped baseV1.Response
```

---

## Part 7: Configuration Files

### sonar-store config.yaml (referenced but not shown)

Expected structure based on code:
```yaml
server:
  host: "0.0.0.0"
  port: 8082

storage:
  data_dir: "./data/tsdb"
  retention_days: 7
  wal_segment_size: 134217728        # 128MB
  max_chunk_size: 4194304            # 4MB
  write_buffer_size: 30000

mark:
  aggregate_interval: "5s"
  ttl: "5m"
  channel_size: 10000
  cleanup_interval: "1m"

exporter:
  stale_timeout: "5m"
  cleanup_interval: "1m"
  cleanup_after: "1h"

logger:
  level: "info"
```

---

## Part 8: Critical Implementation Gaps in sonar-store

| Component | Status | Missing |
|---|---|---|
| Storage Interface | ✅ Defined | Implementation needed |
| Serializer | ✅ Interface | MetricPointSerializer missing |
| Handler Layer | Skeleton | Business logic empty |
| Service Layer | Skeleton | Delegation to handlers empty |
| Router | ✅ Defined | Routes wired to empty handlers |
| Config | ✅ Complete | Config loading working |
| DI (Wire) | ✅ Prepared | Generator not run |
| Main Entry | ✅ Partial | Resource initialization working |

**Priority Implementation Order:**
1. Prometheus storage implementation (copy from datasource)
2. MetricPointSerializer
3. MarkAggregator (from datasource)
4. ExporterService + Manager
5. Handler business logic
6. Integration tests

---

## Part 9: Operational Insights

### Logging

**sonar-store:**
- Uses `go.uber.org/zap` (JSON structured logging)
- Log levels: debug, info, warn, error
- Hertz adapter for framework logs

**datasource:**
- Uses `git.woa.com/castlexu/goutils/ablog`
- Per-module loggers (e.g., "exporter", "MarkHandler", "metrics")
- Detailed business-level logging (IDs, counts, states)

### Metrics Exported

**Mark Aggregation:**
- TotalNum (total requests)
- FailedNum (failed requests)
- Percentiles: P50, P70, P90, P99 (RTT milliseconds)
- QPS average
- Success rate

**Exporter Lifecycle:**
- States: up, down, unknown
- LastScrape timestamp
- ScrapeCount (number of successful reports)
- Labels (custom metadata)

**Storage:**
- TotalSeries
- TotalSamples
- DiskSize
- MinTime, MaxTime
- TotalBlocks

---

## Part 10: Recommendations

### For sonar-store Implementation

1. **Copy Storage Implementation**
   - Use datasource's prometheus.go as base
   - Adapt to MetricPoint serialization
   - Add telemetry for write latency

2. **Aggregator Pattern**
   - Implement 5-second aggregation cycle
   - Use channel-based buffering (10,000 capacity)
   - Export percentile metrics (P50, P90, P99)

3. **Handler Development**
   - Follow datasource patterns for consistency
   - Use separate Service layer for validation
   - Add comprehensive debug logging

4. **Testing Strategy**
   - Unit tests for serialization
   - Integration tests for storage CRUD
   - Load tests for aggregation throughput
   - End-to-end tests with actual HTTP clients

5. **Wire Setup**
   - Run `wire gen ./...` to generate dependency code
   - Verify all providers are correctly wired
   - Add provider tests

### For Bridging Legacy→New

1. **API Compatibility**
   - sonar-store should eventually replace datasource
   - Maintain same HTTP endpoint signatures
   - Support same query parameters

2. **Data Migration**
   - Plan for data transfer from legacy TSDB
   - Consider dual-write during transition
   - Validate data integrity

3. **Operational**
   - Parallel run datasource and sonar-store
   - Compare metrics output
   - Gradual traffic shift

---

## Appendix: File Inventory

### sonar-store Key Files
- cmd/server/main.go (233 lines) - Entry point
- internal/config/config.go (174 lines) - Configuration
- internal/provider/provider.go (134 lines) - Dependency injection
- internal/router/router.go (50 lines) - Route registration
- pkg/storage/interface.go (125 lines) - Storage contract

### datasource Key Files
- pkg/storage/interface.go (230 lines) - Complete interface + helpers
- pkg/storage/prometheus.go (700+ lines) - Full implementation
- pkg/storage/errors.go (30 lines) - Error definitions
- biz/exporter/v1/handler.go (90 lines) - Exporter endpoints
- biz/mark/v1/handler.go (180 lines) - Mark endpoints + aggregation
- biz/metrics/v1/handler.go (160 lines) - Metrics endpoints
- internal/provider/custom_provider.go (140 lines) - Custom DI logic
- internal/provider/gen_provider.go (120 lines) - Generated DI

---

**End of Report**

Generated: 2026-04-10  
Total Lines Analyzed: ~2500+  
Key Files Reviewed: 25+
