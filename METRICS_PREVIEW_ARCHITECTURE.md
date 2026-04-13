# Sonar-Tap Metrics Preview Architecture

## Overview

The metrics preview system provides a real-time window into recently collected metrics through the `/api/v1/metrics/preview` endpoint. It uses a **ring buffer mechanism** to efficiently store and retrieve the last N metric points without modifying the main data pipeline.

---

## 1. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA FLOW PIPELINE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  NodeExporter/        Watcher/         Handlers                 │
│  ProcessExporter      LogParsers       (rawCh writers)         │
│         │                  │                  │                 │
│         └──────────────────┴──────────────────┘                 │
│                       │                                          │
│                    rawCh                                         │
│         (buffered channel, size 4096)                           │
│                       │                                          │
│         ┌─────────────▼──────────────┐                          │
│         │   TeeToPreview()           │                          │
│         │  (chanutil/tee.go)         │                          │
│         └──┬──────────────┬──────────┘                          │
│            │              │                                      │
│         Preview       mainCh (to datasource)                    │
│       RingBuffer                                                │
│            │                                                     │
│    ┌───────▼────────┐                                            │
│    │  metricsbuf    │                                            │
│    │  RingBuffer    │                                            │
│    │  (200 slots)   │                                            │
│    └────────────────┘                                            │
│            │                                                     │
│         HTTP API                                                │
│   /api/v1/metrics/preview                                       │
│            │                                                     │
│         Frontend                                                │
│      (React + TypeScript)                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Metrics Preview Endpoint

### HTTP API Handler

**Location:** `sonar-tap/internal/handler/tap_handler.go`

```go
func (h *TapHandler) GetMetricsPreview(w http.ResponseWriter, r *http.Request) {
    limitStr := r.URL.Query().Get("limit")
    limit := 20
    if limitStr != "" {
        if n, err := strconv.Atoi(limitStr); err == nil && n > 0 {
            if n > 200 {
                n = 200  // Cap at 200
            }
            limit = n
        }
    }
    entries := h.preview.Latest(limit)
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(entries)
}
```

### Endpoint Specification

| Property | Value |
|----------|-------|
| **URL** | `GET /api/v1/metrics/preview` |
| **Query Parameter** | `limit` (optional, default: 20, max: 200) |
| **Response Format** | JSON array of `Entry` objects |
| **Content-Type** | `application/json` |

### Response Structure

```typescript
interface MetricPoint {
  received_at: string;        // RFC3339 timestamp when received
  timestamp: number;          // Unix milliseconds (metric collection time)
  name: string;               // Metric name (e.g., "cpu_usage")
  value: number;              // Metric value
  labels?: Record<string, string>;  // Optional labels (key-value pairs)
}
```

### Query Example

```bash
# Get last 50 metrics
curl "http://localhost:9090/api/v1/metrics/preview?limit=50"

# Get default 20 metrics
curl "http://localhost:9090/api/v1/metrics/preview"
```

---

## 3. Ring Buffer (metricsbuf) Mechanism

### Location
`sonar-tap/pkg/metricsbuf/buffer.go`

### Core Data Structure

```go
type RingBuffer struct {
    mu   sync.Mutex
    buf  []Entry        // Fixed-size circular array
    head int            // Next write position
    size int            // Current number of entries
    cap  int            // Buffer capacity (200 by default)
}

type Entry struct {
    ReceivedAt time.Time         `json:"received_at"`
    Name       string            `json:"name"`
    Value      float64           `json:"value"`
    Timestamp  int64             `json:"timestamp"`
    Labels     map[string]string `json:"labels,omitempty"`
}
```

### Key Operations

#### 1. **Push** - Write a Metric Point

```go
func (r *RingBuffer) Push(pt *metrics.MetricPoint) {
    if pt == nil {
        return
    }
    r.mu.Lock()
    defer r.mu.Unlock()
    
    // Overwrite at head position
    r.buf[r.head] = Entry{
        ReceivedAt: time.Now(),
        Name:       pt.Name,
        Value:      pt.Value,
        Timestamp:  pt.Timestamp,
        Labels:     pt.Labels,
    }
    
    // Move head pointer circularly
    r.head = (r.head + 1) % r.cap
    
    // Track size (0 to cap)
    if r.size < r.cap {
        r.size++
    }
}
```

**Operation:** O(1) - constant time, just overwrites one position

#### 2. **Latest** - Read Last N Entries

```go
func (r *RingBuffer) Latest(n int) []Entry {
    r.mu.Lock()
    defer r.mu.Unlock()
    
    if n <= 0 || r.size == 0 {
        return nil
    }
    if n > r.size {
        n = r.size
    }
    
    result := make([]Entry, n)
    // Start from head-1 (most recent) and go backwards
    for i := 0; i < n; i++ {
        idx := (r.head - 1 - i + r.cap) % r.cap
        result[i] = r.buf[idx]
    }
    return result
}
```

**Operation:** O(n) - linear scan, returns newest entries first

#### 3. **Len** - Get Current Size

```go
func (r *RingBuffer) Len() int {
    r.mu.Lock()
    defer r.mu.Unlock()
    return r.size
}
```

### Thread Safety

- **Mutex Protection:** All operations protected by `sync.Mutex`
- **Lock Duration:** Minimal, only covers the buffer operation
- **Non-blocking:** Push is non-blocking for readers (separate goroutine)

### Circular Buffer Behavior

```
Example with capacity=5:

Initial state: [][][][] (size=0, head=0)

After 3 writes:
head=3
Entry[0], Entry[1], Entry[2] | [] []
^entry1      ^entry2   ^entry3      ^head points here

After 7 writes (wraps around):
head=2
Entry[6], Entry[5] | Entry[4], Entry[3], Entry[2]
^entry5   ^entry6     ^entry4   ^entry3   ^head points here

Latest(3) returns: [Entry[6], Entry[5], Entry[4]]  (newest first)
```

---

## 4. TeeToPreview - Channel Splitting

### Location
`sonar-tap/pkg/chanutil/tee.go`

### Function Signature

```go
func TeeToPreview(ctx context.Context, 
                  src <-chan *metrics.MetricPoint, 
                  dst chan<- *metrics.MetricPoint, 
                  preview *metricsbuf.RingBuffer)
```

### Implementation

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
                // 1. Push to preview buffer (non-blocking, in-place)
                preview.Push(pt)
                
                // 2. Forward to downstream (datasource)
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

### Data Flow Pattern

```
rawCh (input)
  │
  ├─→ TeeToPreview goroutine
  │   │
  │   ├─→ preview.Push(pt)     [Non-blocking]
  │   └─→ mainCh (output)      [May block if channel full]
  │
  └─→ Watchers/Collectors continue writing
```

### Key Characteristics

1. **Non-blocking for upstream:** Push to preview is O(1) and never blocks
2. **Single goroutine:** Runs in a dedicated goroutine spawned at startup
3. **Separation of concerns:** Preview doesn't interfere with datasource pipeline
4. **Graceful shutdown:** Exits when context is cancelled

---

## 5. Data Flow - Complete Pipeline

### Initialization (in `cmd/server/main.go`)

```go
// 1. Create channels
channelSize := cfg.PushGateway.ChannelSize  // 4096 default
if channelSize <= 0 {
    channelSize = 4096
}
rawCh := make(chan *metrics.MetricPoint, channelSize)
mainCh := make(chan *metrics.MetricPoint, channelSize)

// 2. Create preview buffer (200 slots)
preview := metricsbuf.New(200)

// 3. Wire up TeeToPreview
chanutil.TeeToPreview(ctx, rawCh, mainCh, preview)

// 4. Start datasource consumer (reads from mainCh)
datasource.Run(ctx, cfg.PushGateway.Host, cfg.PushGateway.AppId, mainCh,
    datasource.WithPushEnabled(cfg.PushGateway.Enabled),
    datasource.WithReportInterval(cfg.PushGateway.ReportInterval),
    // ... other options
)

// 5. Create HTTP handler with preview reference
tapHandler := handler.NewTapHandler(store, preview, watcherManager, procMgr)

// 6. Register endpoint
mux.HandleFunc("GET /api/v1/metrics/preview", tapHandler.GetMetricsPreview)
```

### Data Sources

1. **NodeExporter** (`pkg/nodeexporter/exporter.go`)
   - CPU, Memory, Disk, Network metrics
   - Triggered by `collectLoop` ticker every N seconds

2. **ProcessExporter**
   - Process-specific metrics
   - Also triggered by ticker

3. **Watchers** (`pkg/watcher/`)
   - Real-time log file monitoring
   - Asynchronously writes to rawCh

4. **Metrics Handler** (`pkg/metrics/handler.go`)
   - Parses log lines using regex
   - Extracts metric name, value, timestamp, labels
   - Applies sampling density rules

---

## 6. Time Range of Data Available

### Buffer Capacity: 200 entries

The ring buffer stores **the last 200 metric points**, regardless of collection interval.

### Time Range Calculation

| Scenario | Collection Interval | Time Range |
|----------|-------------------|-----------|
| **Node Exporter Only** | 3 seconds (default) | ~10 minutes |
| | 15 seconds (legacy default) | ~50 minutes |
| **With Log Watchers** | Variable (real-time) | Depends on log volume |
| **Max entries** | N/A | 200 data points |

### Formula

```
Time Range ≈ 200 entries × Collection Interval
```

For example:
- If collecting every 3 seconds: 200 × 3 = 600 seconds ≈ **10 minutes**
- If collecting every 15 seconds: 200 × 15 = 3000 seconds ≈ **50 minutes**

### Buffer Behavior

1. **Before full:** Stores entries as they arrive (size < 200)
2. **After full:** Continuously overwrites oldest entry with newest
3. **No time-based eviction:** Only capacity-based eviction

---

## 7. Frontend Integration

### Location
`sonar-tap/site/src/`

### React Hook

**File:** `shared/hooks/use-tap-api.ts`

```typescript
export function useMetricsPreview(limit = 200) {
  return useQuery({
    queryKey: ["metrics-preview", limit],
    queryFn: () => apiFetch<MetricPoint[]>(`/api/v1/metrics/preview?limit=${limit}`),
    staleTime: 0,                    // Always treat as stale
    refetchInterval: 5000,           // Poll every 5 seconds
  });
}

export interface MetricPoint {
  received_at: string;
  timestamp: number;
  name: string;
  value: number;
  labels?: Record<string, string>;
}
```

### Usage in Metrics Table

**File:** `views/metrics/metrics-table.tsx`

```typescript
function MetricsTable({ filterPid }: MetricsTableProps) {
  const { t } = useTranslation("dashboard");
  const [search, setSearch] = useState("");
  const { data, isLoading } = useMetricsPreview(200);  // Get 200 entries

  const filteredData = useMemo(() => {
    if (!data) return [];
    let result = data;

    // Filter by PID or node
    if (filterPid === null) {
      // show all
    } else if (filterPid === "node") {
      result = data.filter((m) => !m.labels?.pid);
    } else {
      result = data.filter((m) => m.labels?.pid === String(filterPid));
    }

    // Filter by search query
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((m) => m.name.toLowerCase().includes(q));
    }

    return result;
  }, [data, filterPid, search]);

  return (
    <div className="flex flex-col gap-3">
      {/* Search input */}
      <Input
        placeholder={t("pages.metrics.table.search")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Loading state */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : filteredData.length === 0 ? (
        <div className="flex h-40 items-center justify-center">
          {search ? "No match" : "No metrics"}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Timestamp</TableHead>
              <TableHead>Labels</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.map((m, idx) => (
              <TableRow key={`${m.name}-${m.timestamp}-${idx}`}>
                <TableCell className="font-medium">{m.name}</TableCell>
                <TableCell>{m.value}</TableCell>
                <TableCell>{new Date(m.timestamp).toLocaleTimeString()}</TableCell>
                <TableCell>
                  {/* Display labels as badges */}
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(m.labels || {})
                      .slice(0, 3)
                      .map(([k, v]) => (
                        <Badge key={k}>{k}={v}</Badge>
                      ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

### Polling Strategy

- **Refetch Interval:** 5 seconds
- **Stale Time:** 0 (always treat as stale, don't use cache)
- **Request Timeout:** HTTP timeout

---

## 8. Comparison: Legacy Exporter vs Sonar-Tap

### Differences

| Aspect | Legacy Exporter | Sonar-Tap |
|--------|-----------------|-----------|
| **Ring Buffer Capacity** | 200 (same) | 200 (same) |
| **Default Collection Interval** | 15 seconds | 3 seconds |
| **Time Range** | ~50 minutes | ~10 minutes |
| **Channel Size** | 10,000 | 4,096 |
| **API Framework** | Custom (`api/server.go`) | Go 1.22+ (`http.ServeMux`) |
| **Frontend** | React + Hertz client | React + TypeScript + TanStack Query |
| **Timestamp Unit** | Unix seconds | Unix milliseconds |

### Similarities

- Same ring buffer algorithm
- Same TeeToPreview mechanism
- Same `/api/v1/metrics/preview` endpoint
- Same non-blocking push semantics

---

## 9. Performance Characteristics

### Memory Usage

```
Ring Buffer Memory = 200 entries × Entry size
Entry size ≈ 8 (time) + 16 (string) + 8 (float) + 8 (int) + variable (labels map)
           ≈ ~2-3 KB per entry (with labels)
Total ≈ 200 × 2-3 KB = 400-600 KB
```

### CPU Usage

- **Push:** O(1) - ~1 microsecond
- **Latest:** O(n) - ~10-100 microseconds for n=200
- **Lock contention:** Minimal (millisecond-level locks)

### Latency

- **Push latency:** <1 millisecond (non-blocking)
- **Query latency:** 1-5 milliseconds (depends on network)
- **Frontend update:** 5-second polling = ~50ms average age

---

## 10. Configuration Options

### in `config/config.yaml`

```yaml
# Collection interval (seconds)
step: 3

push_gateway:
  app_id: "sonar-tap"
  enabled: true
  host: "localhost:9091"
  req_timeout: 5000
  report_interval: 10000
  buf_size: 1000
  channel_size: 4096
  labels:
    cluster: "default"

node_exporter:
  enabled: true
  labels:
    job: "node"

process_exporter:
  enabled: true
  dynamic_interval: 5

log_config:
  - name: "app_logs"
    enabled: true
    file_path: "/var/log/app.log"
    metrics:
      - name: "requests"
        pattern: "requests=(\d+)"
        enabled: true
```

### Preview Buffer Size

Currently hardcoded to 200 in `metricsbuf/buffer.go`:

```go
const defaultCap = 200  // Can be changed or made configurable
```

To make it configurable, would need to:
1. Add to `Config` struct
2. Pass to `metricsbuf.New(capacity)`
3. Update `cmd/server/main.go`

---

## 11. Error Handling & Edge Cases

### What Happens When

| Scenario | Behavior |
|----------|----------|
| **Buffer full** | Overwrites oldest entry (circular) |
| **Push to nil** | Ignored (silent no-op) |
| **Query with limit > 200** | Capped to 200 |
| **Query with negative limit** | Treated as invalid, default to 20 |
| **Context cancelled** | TeeToPreview goroutine exits |
| **mainCh blocked** | TeeToPreview waits (may cause upstream slowdown) |
| **rawCh blocked** | Collectors/Watchers wait to send |

### Potential Issues

1. **Backpressure:** If `mainCh` is full, TeeToPreview blocks, slowing upstream
2. **No persistence:** Data lost on restart
3. **No filtering:** All metrics stored, no topic-based partitioning
4. **Fixed size:** Can't dynamically adjust buffer size at runtime

---

## 12. Debug & Monitoring

### Check Buffer Status

```bash
# Get current metrics count
curl "http://localhost:9090/api/v1/status"

# Sample preview with default limit
curl "http://localhost:9090/api/v1/metrics/preview"

# Get exactly 50 entries
curl "http://localhost:9090/api/v1/metrics/preview?limit=50"
```

### Logs

Enable debug logging in `config.yaml`:

```yaml
log_level: "debug"  # or "info", "warn", "error"
```

Then filter logs:

```bash
grep "TeeToPreview\|metricsbuf\|GetMetricsPreview" logs/sonar-tap.log
```

---

## Summary

| Component | Role | Time Range |
|-----------|------|-----------|
| **Ring Buffer** | Stores last 200 metrics | ~10 minutes (at 3s interval) |
| **TeeToPreview** | Splits raw metrics to preview | Real-time (non-blocking) |
| **HTTP Endpoint** | Queries latest N entries | Instant query response |
| **Frontend Hook** | Polls every 5 seconds | ~5-second data freshness |

**Key Takeaway:** The preview system provides a **lightweight, real-time window** into recent metrics without impacting the main collection/export pipeline.
