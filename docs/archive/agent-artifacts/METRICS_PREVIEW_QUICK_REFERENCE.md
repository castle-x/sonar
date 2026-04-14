# Sonar-Tap Metrics Preview - Quick Reference Guide

## API Endpoint

```
GET /api/v1/metrics/preview?limit=50
```

### Parameters
- `limit` (optional): Number of entries to return (1-200, default: 20)

### Response
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
  },
  {
    "received_at": "2025-04-09T14:35:20.125123Z",
    "name": "process_memory_rss",
    "value": 125.3,
    "timestamp": 1712678120124,
    "labels": {
      "pid": "1234",
      "name": "myprocess"
    }
  }
]
```

---

## Ring Buffer Architecture

```
┌─────────────────────────────────────────────┐
│ Capacity: 200 entries (fixed)               │
│ Type: Circular FIFO queue                   │
│ Thread-safe: Yes (mutex-protected)          │
│ Blocking behavior: Non-blocking writes      │
└─────────────────────────────────────────────┘

Memory Layout:
┌───┬───┬───┬───┬───┬─ ─ ─┬───┬───┐
│ 0 │ 1 │ 2 │ 3 │ 4 │     │198│199│
└───┴───┴───┴───┴───┴─ ─ ─┴───┴───┘
  ▲
  head pointer (next write location)
  wraps around when reaching capacity
```

### Example: Buffer filling up

```
Step 1: Push(A)
buf = [A, _, _, _, ...]  head=1, size=1

Step 2: Push(B)
buf = [A, B, _, _, ...]  head=2, size=2

Step 3-199: Continue pushing...
buf = [A, B, C, ... Y]   head=199, size=199

Step 200: Push(Z)
buf = [A, B, C, ... Y, Z]  head=0, size=200  FULL!

Step 201: Push(A2) - overwrites oldest entry
buf = [A2, B, C, ... Y, Z]  head=1, size=200

Step 202: Push(B2) - continues overwriting
buf = [A2, B2, C, ... Y, Z]  head=2, size=200
```

### Latest() Operation

```
Given: buf = [A2, B2, C, D, E]  head=3

Latest(3) returns entries in REVERSE order (newest first):
┌─────────────┬─────────────┬─────────────┐
│   Entry 1   │   Entry 2   │   Entry 3   │
│ (Newest)    │             │ (Oldest)    │
├─────────────┼─────────────┼─────────────┤
│      E      │      D      │      C      │
│ (idx=1)     │ (idx=0)     │ (idx=4)     │
└─────────────┴─────────────┴─────────────┘

Calculation:
- idx(1) = (head - 1 - 0 + cap) % cap = (3 - 1 - 0 + 5) % 5 = 2 → E
- idx(2) = (head - 1 - 1 + cap) % cap = (3 - 1 - 1 + 5) % 5 = 1 → D
- idx(3) = (head - 1 - 2 + cap) % cap = (3 - 1 - 2 + 5) % 5 = 0 → C
```

---

## Data Flow

### Metric Collection Path

```
┌──────────────┐
│ NodeExporter │  ← Collects system metrics every 3s
│ ProcessExp   │     (CPU, Memory, Disk, Network)
│ Watchers     │     (Log extraction via regex)
└──────────────┘
       │
       ▼ rawCh (channel, buffered)
┌─────────────────────────────┐
│  TeeToPreview goroutine     │
│  (pkg/chanutil/tee.go)      │
└─────────────────────────────┘
       │         │
  ┌────┘         └────┐
  │                   │
  ▼ (non-blocking)   ▼ (can block)
┌────────────────┐  ┌──────────────┐
│ preview buffer │  │ mainCh       │
│ (200 entries)  │  │ (to          │
└────────────────┘  │ datasource)  │
  │                 └──────────────┘
  │                        │
  │                        ▼
  │                 ┌──────────────┐
  │                 │ PushGateway  │
  │                 │ Reporter     │
  │                 └──────────────┘
  │
  ├─→ GET /api/v1/metrics/preview
  │
  └─→ Frontend React UI (polls every 5s)
```

---

## Time Range Examples

### Scenario A: Default system metrics
```
Collection rate: 1 metric per 3 seconds
Buffer size: 200 entries
Time window: 200 × 3s = 600 seconds = 10 minutes
```

### Scenario B: Heavy log extraction
```
Collection rate: 50 metrics per second
Buffer size: 200 entries
Time window: 200 ÷ 50 = 4 seconds
```

### Scenario C: Mixed sources (typical)
```
System metrics: 1 every 3s = 0.33/s
Process metrics: 1 every 30s = 0.03/s
Log metrics: variable (50-200 per minute depending on log volume)

Average rate: ~1-2 metrics per second
Buffer size: 200 entries
Expected time window: 100-200 seconds = 1.5-3 minutes
```

---

## Key Code Snippets

### Ring Buffer Push
```go
func (r *RingBuffer) Push(pt *metrics.MetricPoint) {
    r.mu.Lock()
    defer r.mu.Unlock()
    
    r.buf[r.head] = Entry{
        ReceivedAt: time.Now(),
        Name:       pt.Name,
        Value:      pt.Value,
        Timestamp:  pt.Timestamp,
        Labels:     pt.Labels,
    }
    r.head = (r.head + 1) % r.cap
    if r.size < r.cap {
        r.size++
    }
}
```

### TeeToPreview Goroutine
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
                preview.Push(pt)          // Non-blocking
                select {
                case dst <- pt:           // Can block on backpressure
                case <-ctx.Done():
                    return
                }
            }
        }
    }()
}
```

### API Handler
```go
func (h *TapHandler) GetMetricsPreview(w http.ResponseWriter, r *http.Request) {
    limit := 20  // default
    if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
        if n, err := strconv.Atoi(limitStr); err == nil && n > 0 && n <= 200 {
            limit = n
        }
    }
    
    entries := h.preview.Latest(limit)
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(entries)
}
```

### Frontend Hook
```typescript
export function useMetricsPreview(limit = 200) {
    return useQuery({
        queryKey: ["metrics-preview", limit],
        queryFn: () => fetch(`/api/v1/metrics/preview?limit=${limit}`)
            .then(r => r.json()),
        staleTime: 0,
        refetchInterval: 5000,  // Poll every 5 seconds
    });
}
```

---

## Initialization Sequence

```
main()
  ├─ Load config (config.yaml)
  ├─ Create context with cancel
  ├─ Create rawCh channel (buffered: 4096)
  ├─ Create mainCh channel (buffered: 4096)
  ├─ Create preview RingBuffer (capacity: 200)
  │
  ├─ Wire TeeToPreview(ctx, rawCh, mainCh, preview)
  │   └─ Starts goroutine immediately
  │
  ├─ Start datasource.Run(ctx, ..., mainCh)
  │   └─ Starts background goroutine to push metrics
  │
  ├─ Create collectors (CPU, Memory, Disk, Network)
  ├─ Create NodeExporter (if enabled)
  ├─ Create ProcessExporter (if enabled)
  │
  ├─ Start collectLoop(ctx, cfg, rawCh, ...)
  │   └─ Starts ticker to periodically record metrics to rawCh
  │
  ├─ Start watchers for log files (if configured)
  │
  ├─ Create TapHandler with reference to preview buffer
  ├─ Register HTTP routes (including GET /api/v1/metrics/preview)
  └─ Start HTTP server on configured port
```

---

## Thread Safety Model

### Synchronization Points

1. **RingBuffer.Push()**
   - Lock: Mutex acquired/released
   - Duration: O(1) - very fast
   - Contention: Low (non-blocking operation)

2. **RingBuffer.Latest()**
   - Lock: Mutex acquired/released
   - Duration: O(n) where n = requested entries (max 200)
   - Contention: Low (read-only, quick)

3. **TeeToPreview goroutine**
   - No locks in hot path
   - Context cancellation only synchronization point
   - Multiple concurrent HTTP handlers read preview safely

### No Data Races
- MetricPoint immutable after creation
- RingBuffer only point of contention
- All mutations guarded by mutex
- Frontend gets consistent snapshots

---

## Troubleshooting

### Empty preview buffer?
- Check if collectors are enabled (NodeExporter, ProcessExporter, Watchers)
- Verify config.yaml has collectors configured
- Check /api/v1/status endpoint for watcher count
- Look for log errors about collection failures

### Preview shows very old data?
- Could mean low collection rate
- Request limit=200 to get full buffer
- Check metric configuration and density settings
- Verify watchers are actively extracting from logs

### Frontend not updating?
- Default polling: 5 seconds
- Check browser console for API errors
- Verify /api/v1/metrics/preview endpoint is responding
- Check network tab to see actual response data

### High memory usage?
- Ring buffer uses ~40KB base
- Channels use configured size (default 4096 entries × metric size)
- Each metric ~200 bytes
- Total typical: 1-2 MB

---

## Configuration Reference

### In config.yaml

```yaml
# Global settings
step: 3                    # Collection interval (seconds)

push_gateway:
  enabled: true
  host: "http://localhost:9091"
  channel_size: 4096       # Size of rawCh and mainCh
  report_interval: 30      # How often to push to gateway

node_exporter:
  enabled: true
  labels:
    instance: "myhost"

process_exporter:
  enabled: true
  dynamic_interval: 30     # Check for processes every N seconds
  rules: [...]

log_config:
  - name: "app_logs"
    file_path: "/var/log/app.log"
    enabled: true
    metrics:
      - name: "log_errors"
        pattern: "ERROR: (.*)"
        enabled: true
        density: 5           # Only emit if > 5s from last
```

### In code (hard-coded)

```go
// metricsbuf/buffer.go
const defaultCap = 200              // Ring buffer capacity

// internal/handler/tap_handler.go
limit := 20                          // Default preview limit
if n > 200 { n = 200 }              // Max preview limit (matches buffer cap)

// cmd/server/main.go
if channelSize <= 0 {
    channelSize = 4096              // Default channel size
}
```

---

## Performance Tips

1. **For high-frequency logs**: Request `limit=50` instead of 200 to reduce payload
2. **For real-time UI**: Use 5-second polling (frontend default is good)
3. **For debugging**: Use `limit=200` to see full history
4. **Buffer overflow**: Increase `step` to reduce collection rate if preview lags
5. **Memory**: Ring buffer size is fixed; no memory leak from preview

---

## Related Files

- **Ring Buffer**: `pkg/metricsbuf/buffer.go`
- **Channel Splitter**: `pkg/chanutil/tee.go`
- **API Handler**: `internal/handler/tap_handler.go`
- **Main Init**: `cmd/server/main.go`
- **Frontend Hook**: `site/src/shared/hooks/use-tap-api.ts`
- **UI Component**: `site/src/views/metrics/metrics-table.tsx`
- **Config Struct**: `config/config.go`

---

## API Examples

### Get last 20 metrics (default)
```bash
curl http://localhost:9090/api/v1/metrics/preview
```

### Get last 50 metrics
```bash
curl 'http://localhost:9090/api/v1/metrics/preview?limit=50'
```

### Get all 200 metrics in buffer
```bash
curl 'http://localhost:9090/api/v1/metrics/preview?limit=200'
```

### From frontend (React)
```typescript
const { data, isLoading } = useMetricsPreview(100);
// data is MetricPoint[], auto-refreshes every 5 seconds
```

---

## Summary

- **Purpose**: Real-time visibility into recent metrics
- **Storage**: 200-entry circular buffer (fixed memory)
- **Access**: HTTP GET endpoint with optional limit parameter
- **Thread-safe**: Yes, mutex-protected
- **Non-blocking**: Preview push never blocks metric collection
- **Time range**: Count-based (typically 30s-10min depending on collection rate)
- **Frontend**: React hook polls every 5 seconds
- **Performance**: O(1) writes, O(n) reads (n ≤ 200)
