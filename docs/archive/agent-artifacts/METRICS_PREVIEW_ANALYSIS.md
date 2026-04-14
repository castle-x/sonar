# Sonar-Tap Metrics Preview System - Comprehensive Analysis

## Executive Summary

The metrics preview system in sonar-tap provides **real-time visibility** into the most recent metrics collected by the system. It uses a **ring buffer (circular buffer)** mechanism to maintain a fixed-size window of recent metric points, which are then exposed via the `/api/v1/metrics/preview` REST endpoint for frontend consumption.

---

## 1. Metrics Preview Architecture

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ METRIC SOURCES                                                      │
│ ├─ NodeExporter (CPU, Mem, Disk, Network)                          │
│ ├─ ProcessExporter                                                  │
│ └─ Watcher (Log file metrics via regex)                             │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │   rawCh Channel     │  (buffered channel, capacity: configurable)
        │  (MetricPoint[])    │
        └─────────┬───────────┘
                  │
                  ▼
        ┌──────────────────────────────────────────────────────┐
        │  TeeToPreview (pkg/chanutil/tee.go)                  │
        │  ├─ Receives from rawCh                              │
        │  ├─ Pushes to preview RingBuffer                     │
        │  └─ Forwards to mainCh (datasource)                  │
        └──────────────────────────────────────────────────────┘
                  │                          │
        ┌─────────┘                          └──────────┐
        │                                               │
        ▼                                               ▼
┌──────────────────────────────┐         ┌─────────────────────────┐
│  Preview RingBuffer          │         │  mainCh Channel         │
│  (metricsbuf.RingBuffer)     │         │  (To Datasource/        │
│  ├─ Capacity: 200 entries    │         │   PushGateway)          │
│  ├─ Thread-safe (sync.Mutex) │         │                         │
│  └─ FIFO circular storage    │         └─────────────────────────┘
└──────────────┬───────────────┘
               │
               ▼
    ┌────────────────────────────┐
    │  GET /api/v1/metrics/preview│  (HTTP Handler)
    │  ├─ Query param: limit     │  (default: 20, max: 200)
    │  └─ Returns: JSON array    │
    └────────────────────────────┘
               │
               ▼
    ┌────────────────────────────────────┐
    │  Frontend (React)                  │
    │  ├─ Hook: useMetricsPreview(200)   │
    │  ├─ Polling: every 5 seconds       │
    │  └─ Display: MetricsTable component│
    └────────────────────────────────────┘
```

---

## 2. Ring Buffer Mechanism (metricsbuf Package)

### File: `pkg/metricsbuf/buffer.go`

#### Key Components

**RingBuffer Structure:**
```go
type RingBuffer struct {
    mu   sync.Mutex        // Protects concurrent access
    buf  []Entry           // Fixed-size circular array
    head int               // Next write position
    size int               // Current number of entries (≤ cap)
    cap  int               // Capacity of the buffer
}

type Entry struct {
    ReceivedAt time.Time         // When this metric was received
    Name       string            // Metric name
    Value      float64           // Metric value
    Timestamp  int64             // Original timestamp (milliseconds)
    Labels     map[string]string // Key-value labels
}
```

#### Key Operations

1. **New(capacity int)** - Constructor
   - Default capacity: 200 entries
   - If capacity ≤ 0, uses defaultCap (200)
   - Allocates fixed-size buffer

2. **Push(pt *metrics.MetricPoint)** - Non-blocking write
   - Takes metric point as input
   - Wraps it in Entry (adds ReceivedAt timestamp)
   - Writes to `buf[head]` position
   - Advances head pointer: `head = (head + 1) % cap`
   - Increments size until full, then overwrites oldest entries
   - **Thread-safe**: Uses mutex lock

   ```go
   Push Operation Example (buffer size=5, initially empty):
   
   Initial:  buf=[_, _, _, _, _]  head=0, size=0
   
   After Push(A): buf=[A, _, _, _, _]  head=1, size=1
   After Push(B): buf=[A, B, _, _, _]  head=2, size=2
   After Push(C): buf=[A, B, C, _, _]  head=3, size=3
   After Push(D): buf=[A, B, C, D, _]  head=4, size=4
   After Push(E): buf=[A, B, C, D, E]  head=0, size=5  (FULL!)
   After Push(F): buf=[F, B, C, D, E]  head=1, size=5  (oldest A overwritten)
   After Push(G): buf=[F, G, C, D, E]  head=2, size=5  (oldest B overwritten)
   ```

3. **Latest(n int)** - Non-blocking read
   - Returns last n entries in **reverse chronological order** (newest first)
   - Walks backward from head position
   - **Thread-safe**: Uses mutex lock
   - Returns nil if n ≤ 0 or buffer is empty
   - Clamps n to actual size

   ```go
   Latest(3) Example (from F, G, C, D, E, head=2):
   
   Latest entries (newest → oldest):
   - idx = (2-1-0+5) % 5 = 1 → E (most recent)
   - idx = (2-1-1+5) % 5 = 0 → F (2nd most recent)
   - idx = (2-1-2+5) % 5 = 4 → D (3rd most recent)
   
   Returns: [E, F, D]
   ```

4. **Len() -> int** - Get current size
   - Returns number of entries currently in buffer
   - Thread-safe

#### Characteristics
- **Fixed capacity**: No unbounded growth
- **Circular/FIFO**: Oldest entries are overwritten when full
- **Non-blocking**: Immediate writes (no channel blocking)
- **Thread-safe**: Mutex protects all access
- **No memory allocation**: Pre-allocated on creation

---

## 3. Channel Utility - TeeToPreview (pkg/chanutil)

### File: `pkg/chanutil/tee.go`

#### Purpose
Acts as a **T-splitter** for metric streams:
- Reads from upstream source channel
- Pushes a copy to the preview buffer
- Forwards to downstream consumer channel
- Does not modify the data flow

#### Function Signature
```go
func TeeToPreview(
    ctx context.Context,
    src <-chan *metrics.MetricPoint,    // From collectors/watchers
    dst chan<- *metrics.MetricPoint,    // To datasource
    preview *metricsbuf.RingBuffer,     // Store for preview
)
```

#### Implementation Details
```go
func TeeToPreview(ctx context.Context, src <-chan *metrics.MetricPoint, 
                  dst chan<- *metrics.MetricPoint, preview *metricsbuf.RingBuffer) {
    go func() {
        for {
            select {
            case <-ctx.Done():
                return
            case pt, ok := <-src:
                if !ok {
                    return
                }
                // Push to preview buffer (non-blocking)
                preview.Push(pt)
                
                // Forward to downstream (blocking, respects backpressure)
                select {
                case dst <- pt:
                case <-ctx.Done():
                    return
                }
            }
        }
    }()
}
```

#### Key Characteristics
1. **Runs in goroutine**: Non-blocking to caller
2. **Preview push is non-blocking**: preview.Push() never blocks
3. **Downstream forward can block**: Respects backpressure on dst channel
4. **Context-aware**: Respects cancellation signals
5. **Copy transparency**: No modification of MetricPoint

---

## 4. Metrics Preview API Handler

### File: `internal/handler/tap_handler.go`

#### Handler Setup
```go
type TapHandler struct {
    store          *configstore.Store
    preview        *metricsbuf.RingBuffer      // The ring buffer
    watcherManager *watcher.WatcherManager
    processManager *process.ProcessManager
}

func NewTapHandler(store *configstore.Store, preview *metricsbuf.RingBuffer, 
                   wm *watcher.WatcherManager, pm *process.ProcessManager) *TapHandler {
    return &TapHandler{
        store:          store,
        preview:        preview,
        watcherManager: wm,
        processManager: pm,
    }
}
```

#### GetMetricsPreview Handler
```go
func (h *TapHandler) GetMetricsPreview(w http.ResponseWriter, r *http.Request) {
    // Parse query parameter: ?limit=50
    limitStr := r.URL.Query().Get("limit")
    limit := 20  // Default limit
    
    if limitStr != "" {
        if n, err := strconv.Atoi(limitStr); err == nil && n > 0 {
            if n > 200 {
                n = 200  // Cap at 200 (buffer capacity)
            }
            limit = n
        }
    }
    
    // Get entries from buffer (thread-safe)
    entries := h.preview.Latest(limit)
    
    // Return as JSON
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(entries)
}
```

#### Response Format (Entry)
```json
[
  {
    "received_at": "2025-04-09T14:35:20.123456Z",
    "name": "node_cpu_usage",
    "value": 42.5,
    "timestamp": 1712678120123,
    "labels": {
      "cpu": "0",
      "instance": "localhost"
    }
  }
]
```

#### API Parameters
- **Endpoint**: `GET /api/v1/metrics/preview`
- **Query Parameter**: `limit` (optional)
  - Default: 20 entries
  - Maximum: 200 entries
  - Validation: Must be > 0, capped at 200

#### HTTP Routes (from main.go)
```go
mux.HandleFunc("GET /api/v1/metrics/preview", tapHandler.GetMetricsPreview)
```

---

## 5. Time Range and Data Availability

### Time Range Window

The preview buffer maintains **the last N metric points** (where N is buffer capacity, default 200).

**However, there is NO time-based windowing** - the buffer is purely count-based:
- Capacity: 200 entries (fixed)
- When full: oldest entry is discarded when new one arrives
- Time range depends on: **collection interval × buffer capacity**

#### Example Calculation

Assuming:
- NodeExporter collection: every 3 seconds (configurable as `step`)
- ProcessExporter collection: varies based on `dynamic_interval`
- Log watcher collection: varies based on log frequency

**Scenario A: Baseline system metrics only**
```
Collection rate: 1 metric per 3 seconds
Buffer capacity: 200 entries
Time window: 200 × 3 seconds = 600 seconds = 10 minutes
```

**Scenario B: Heavy logging (high-frequency log extraction)**
```
Collection rate: 20 metrics per second (from log extraction)
Buffer capacity: 200 entries
Time window: 200 ÷ 20 = 10 seconds
```

**Scenario C: Mixed sources (system + process + logs)**
```
System metrics: 1 per 3 seconds
Process metrics: 1 per dynamic_interval
Log metrics: variable (depends on log volume)
Expected time window: 30 seconds to 5 minutes
```

### Important Characteristics

1. **Not guaranteed to be continuous**: If metrics arrive slowly, gaps exist
2. **Not guaranteed to span fixed time range**: Only contains "most recent N"
3. **FIFO ordering**: Latest metrics replace oldest
4. **ReceivedAt vs Timestamp**: 
   - `ReceivedAt`: When metrics arrived at sonar-tap
   - `Timestamp`: Original timestamp from metric source
   - These may differ slightly due to processing delays

---

## 6. Initialization in Main Server

### File: `cmd/server/main.go`

#### Buffer Creation
```go
// Create channel and preview buffer
channelSize := cfg.PushGateway.ChannelSize
if channelSize <= 0 {
    channelSize = 4096
}
rawCh := make(chan *metrics.MetricPoint, channelSize)
mainCh := make(chan *metrics.MetricPoint, channelSize)
preview := metricsbuf.New(200)  // 200-entry ring buffer

// Wire up the tee splitter
chanutil.TeeToPreview(ctx, rawCh, mainCh, preview)

// Start datasource (PushGateway reporter)
datasource.Run(ctx, cfg.PushGateway.Host, cfg.PushGateway.AppId, mainCh, ...)

// Start HTTP server with handler
tapHandler := handler.NewTapHandler(store, preview, watcherManager, procMgr)
mux.HandleFunc("GET /api/v1/metrics/preview", tapHandler.GetMetricsPreview)
```

#### Order of Initialization
1. Create raw and main channels (buffered)
2. Create preview ring buffer (capacity: 200)
3. Start TeeToPreview goroutine (wires raw→preview→main)
4. Start datasource client (consumes from main)
5. Start collectors (write to raw)
6. Create HTTP handler with preview reference
7. Register HTTP routes
8. Start HTTP server

---

## 7. Frontend Integration

### File: `site/src/shared/hooks/use-tap-api.ts`

#### Hook Implementation
```typescript
export function useMetricsPreview(limit = 200) {
  return useQuery({
    queryKey: ["metrics-preview", limit],
    queryFn: () => apiFetch<MetricPoint[]>(
      `/api/v1/metrics/preview?limit=${limit}`
    ),
    staleTime: 0,
    refetchInterval: 5000,  // Poll every 5 seconds
  });
}
```

#### MetricPoint Interface
```typescript
export interface MetricPoint {
  received_at: string;      // ISO timestamp string
  timestamp: number;        // milliseconds
  name: string;
  value: number;
  labels?: Record<string, string>;
}
```

#### UI Display Component
- **File**: `site/src/views/metrics/metrics-table.tsx`
- **Features**:
  - Displays metrics in table format
  - Filterable by PID (node vs process metrics)
  - Search by metric name
  - Displays labels with tooltip for overflow
  - Auto-refreshes every 5 seconds via React Query
  - Shows loading skeleton while fetching

#### Polling Strategy
```
Frontend requests every 5 seconds:
  GET /api/v1/metrics/preview?limit=200
  
Response:
  JSON array of up to 200 Entry objects
  
Display:
  Rendered as table rows with search/filter
```

---

## 8. Thread Safety & Concurrency

### Synchronization Mechanisms

1. **RingBuffer Mutex Protection**
   - Every Push() and Latest() call acquires lock
   - Lock held for entire operation (minimal duration)
   - No nested locks or deadlock risk

2. **Channel Non-blocking Semantics**
   - Push() to preview: never blocks (non-blocking on buffer)
   - Forward to mainCh: respects backpressure
   - Separates fast path (preview) from slow path (datasource)

3. **Handler Concurrency**
   - TapHandler is safely shared across HTTP requests
   - Preview reference is read-only (shared pointer)
   - Each HTTP request gets independent Latest() call

4. **No Data Races**
   - All mutations in RingBuffer guarded by mutex
   - MetricPoint objects are immutable after creation
   - No shared mutable state between goroutines

---

## 9. Configuration

### Ring Buffer Capacity
```go
// Hard-coded in metricsbuf/buffer.go
const defaultCap = 200

// Used in main.go
preview := metricsbuf.New(200)  // Fixed 200-entry capacity
```

### Channel Sizes
```go
// From config.yaml (PushGateway section)
channelSize: 4096  // Default if not specified

// If not in config:
if channelSize <= 0 {
    channelSize = 4096  // Hard-coded default
}
rawCh := make(chan *metrics.MetricPoint, channelSize)
mainCh := make(chan *metrics.MetricPoint, channelSize)
```

### Collection Intervals
```yaml
# Global collection step (nodeexporter)
step: 3  # seconds

# Per-collector intervals (from LogConfig or ProcessExporter)
dynamic_interval: 30  # seconds for process-based metrics

# Metric-specific density control
metrics:
  - name: my_metric
    density: 5  # Only emit if timestamp > 5s from last
```

### API Query Parameters
```
GET /api/v1/metrics/preview?limit=50

limit:
  - Default: 20
  - Maximum: 200 (hard cap)
  - Must be > 0 (validated in handler)
```

---

## 10. Complete Data Flow Example

### Step-by-Step Trace

**Time: T=0.0s**
- NodeExporter ticker fires
- Records CPU metric: `cpu_usage=42.5` → rawCh

**Time: T=0.001s**
- TeeToPreview goroutine reads from rawCh
- preview.Push(cpu_usage_42.5)
  - buf[0] = Entry{ReceivedAt: "T=0.001s", Name: "cpu_usage", Value: 42.5, ...}
  - head = 1, size = 1
- Sends to mainCh → datasource
- datasource buffers or sends to PushGateway

**Time: T=0.002s**
- User requests: GET /api/v1/metrics/preview?limit=10
- TapHandler.GetMetricsPreview() called
- preview.Latest(10) acquires lock
- Returns [Entry{ReceivedAt: "T=0.001s", ...}]
- JSON encoded and sent to frontend

**Time: T=3.0s**
- Second NodeExporter tick
- MemCollector records: `mem_usage=60.2` → rawCh
- TeeToPreview processes: preview.Push(mem_usage_60.2)
  - buf[1] = Entry{ReceivedAt: "T=3.0s", Name: "mem_usage", Value: 60.2, ...}
  - head = 2, size = 2

**Time: T=3.002s - T=600.0s (continues...)**
- Metrics accumulate until buffer fills (200 entries)
- After 200 entries: oldest entry overwritten on each new entry
- Frontend continues polling every 5s

**Time: T=600.0s + buffer fills**
- Buffer contains last 200 entries
- Latest(200) returns all 200 entries (newest first)
- Approximate time window: 10 minutes (if 1 metric per 3 seconds)

---

## 11. Key Code Locations

| Component | File Path |
|-----------|-----------|
| Ring Buffer | `pkg/metricsbuf/buffer.go` |
| TeeToPreview | `pkg/chanutil/tee.go` |
| API Handler | `internal/handler/tap_handler.go` (GetMetricsPreview) |
| Main Server | `cmd/server/main.go` (initialization) |
| Frontend Hook | `site/src/shared/hooks/use-tap-api.ts` |
| UI Component | `site/src/views/metrics/metrics-table.tsx` |

---

## 12. Performance Characteristics

### Time Complexity
- **Push()**: O(1) - constant time write
- **Latest(n)**: O(n) - linear in returned entries
- **Lock overhead**: Minimal, quick operations

### Space Complexity
- **RingBuffer**: O(200) - fixed 200 Entry structs
- **Per Entry**: ~200 bytes (estimate)
- **Total**: ~40KB ring buffer + channel buffers (4MB typical)

### Throughput
- **No bottleneck on preview side**: Push() is non-blocking
- **Bottleneck on datasource side**: mainCh can slow down rawCh
- **Frontend polling**: 5-second intervals (20 requests/minute)

---

## 13. Best Practices & Observations

1. **Buffer Capacity**: Fixed at 200 - good balance between memory and recent history
2. **Default Limit**: 20 entries is conservative; 200 returns full buffer
3. **Polling Interval**: 5 seconds provides near-real-time updates
4. **TeeToPreview Design**: Excellent separation of concerns
5. **Thread Safety**: Simple mutex-based approach suitable for this use case
6. **No Time Windowing**: Consider adding time-based filtering if time range becomes important

---

## Conclusion

The sonar-tap metrics preview system is a well-designed, thread-safe mechanism for exposing recent collected metrics through a simple HTTP API. The ring buffer provides fixed-memory overhead while the TeeToPreview utility elegantly separates the preview pipeline from the main datasource pipeline. The system is optimized for low-latency access to recent metrics without impacting the primary metric reporting flow.
