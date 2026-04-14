# Metrics Preview - Implementation Guide & Examples

## Getting Started

### 1. Understanding the Ring Buffer

The ring buffer is a **fixed-size circular array** that overwrites old data when full.

```go
// Create a buffer for 200 entries
preview := metricsbuf.New(200)

// Push a metric (O(1) operation)
metric := &metrics.MetricPoint{
    Name:      "cpu_usage",
    Value:     45.5,
    Timestamp: time.Now().UnixMilli(),
    Labels:    map[string]string{"pid": "1234"},
}
preview.Push(metric)

// Get last 50 entries (O(50) operation)
entries := preview.Latest(50)
// Returns: [newest, newer, ..., older]
```

### 2. Setting Up the Data Pipeline

In `cmd/server/main.go`:

```go
// 1. Create channels
rawCh := make(chan *metrics.MetricPoint, 4096)      // From collectors
mainCh := make(chan *metrics.MetricPoint, 4096)     // To datasource

// 2. Create preview buffer
preview := metricsbuf.New(200)

// 3. Wire up TeeToPreview (spawns a goroutine)
chanutil.TeeToPreview(ctx, rawCh, mainCh, preview)

// 4. Collectors/Watchers write to rawCh
go func() {
    for metric := range someMetricSource {
        rawCh <- metric  // Flows through TeeToPreview
    }
}()

// 5. Datasource consumes from mainCh
datasource.Run(ctx, host, appId, mainCh, ...)

// 6. HTTP handler can query preview
tapHandler := handler.NewTapHandler(store, preview, wm, pm)
mux.HandleFunc("GET /api/v1/metrics/preview", tapHandler.GetMetricsPreview)
```

### 3. Querying the Preview

```bash
# Terminal: Get default 20 entries
curl "http://localhost:9090/api/v1/metrics/preview"

# Get specific number
curl "http://localhost:9090/api/v1/metrics/preview?limit=100"

# Max is 200
curl "http://localhost:9090/api/v1/metrics/preview?limit=500" # Returns 200
```

### 4. Frontend Usage

```typescript
// React component using the hook
import { useMetricsPreview } from '@/shared/hooks/use-tap-api'

function Dashboard() {
  // Hook handles polling every 5 seconds
  const { data: metrics, isLoading, error } = useMetricsPreview(200)
  
  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  
  return (
    <table>
      <thead>
        <tr>
          <th>Metric Name</th>
          <th>Value</th>
          <th>Timestamp</th>
          <th>Labels</th>
        </tr>
      </thead>
      <tbody>
        {metrics?.map(metric => (
          <tr key={`${metric.name}-${metric.timestamp}`}>
            <td>{metric.name}</td>
            <td>{metric.value}</td>
            <td>{new Date(metric.timestamp).toLocaleTimeString()}</td>
            <td>
              {Object.entries(metric.labels || {}).map(([k, v]) => (
                <span key={k}>{k}={v}</span>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

---

## Code Examples

### Example 1: Manual Ring Buffer Usage

```go
package main

import (
    "fmt"
    "sonar-tap/pkg/metricsbuf"
    "sonar-tap/internal/api/sonar-store/metrics/v1"
    "time"
)

func main() {
    // Create buffer for 5 entries
    rb := metricsbuf.New(5)
    
    // Add 10 metrics
    for i := 1; i <= 10; i++ {
        pt := &v1.MetricPoint{
            Name:      fmt.Sprintf("metric_%d", i),
            Value:     float64(i * 10),
            Timestamp: int64(i * 1000),
            Labels:    map[string]string{"id": fmt.Sprintf("%d", i)},
        }
        rb.Push(pt)
        
        fmt.Printf("Added metric_%d, buffer size: %d\n", i, rb.Len())
    }
    
    // Get last 3 entries
    entries := rb.Latest(3)
    fmt.Println("\nLast 3 entries (newest first):")
    for idx, entry := range entries {
        fmt.Printf("%d. %s = %.0f (ts: %d)\n", 
            idx+1, entry.Name, entry.Value, entry.Timestamp)
    }
    
    // Output:
    // Added metric_1, buffer size: 1
    // Added metric_2, buffer size: 2
    // ...
    // Added metric_10, buffer size: 5
    //
    // Last 3 entries (newest first):
    // 1. metric_10 = 100 (ts: 10000)
    // 2. metric_9 = 90 (ts: 9000)
    // 3. metric_8 = 80 (ts: 8000)
}
```

### Example 2: Concurrent Access

```go
package main

import (
    "fmt"
    "sync"
    "sonar-tap/pkg/metricsbuf"
    "sonar-tap/internal/api/sonar-store/metrics/v1"
)

func main() {
    rb := metricsbuf.New(100)
    var wg sync.WaitGroup
    
    // 10 concurrent writers
    for i := 0; i < 10; i++ {
        wg.Add(1)
        go func(id int) {
            defer wg.Done()
            for j := 0; j < 100; j++ {
                pt := &v1.MetricPoint{
                    Name:      fmt.Sprintf("goroutine_%d_metric_%d", id, j),
                    Value:     float64(id*100 + j),
                    Timestamp: int64((id*100 + j) * 1000),
                }
                rb.Push(pt)
            }
        }(i)
    }
    
    // 5 concurrent readers
    resultsCh := make(chan int, 5)
    for i := 0; i < 5; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            entries := rb.Latest(rb.Len())
            resultsCh <- len(entries)
        }()
    }
    
    wg.Wait()
    close(resultsCh)
    
    // Check results
    for count := range resultsCh {
        fmt.Printf("Read %d entries\n", count)
    }
    
    fmt.Printf("Final buffer size: %d\n", rb.Len())
}
```

### Example 3: TeeToPreview Pattern

```go
package main

import (
    "context"
    "fmt"
    "sonar-tap/pkg/chanutil"
    "sonar-tap/pkg/metricsbuf"
    "sonar-tap/internal/api/sonar-store/metrics/v1"
    "time"
)

func main() {
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    
    // Create channels
    sourceCh := make(chan *v1.MetricPoint, 100)
    destCh := make(chan *v1.MetricPoint, 100)
    preview := metricsbuf.New(10)
    
    // Start TeeToPreview
    chanutil.TeeToPreview(ctx, sourceCh, destCh, preview)
    
    // Simulate metrics from source
    go func() {
        for i := 0; i < 20; i++ {
            sourceCh <- &v1.MetricPoint{
                Name:      fmt.Sprintf("metric_%d", i),
                Value:     float64(i),
                Timestamp: int64(time.Now().UnixMilli()),
            }
            time.Sleep(100 * time.Millisecond)
        }
        close(sourceCh)
    }()
    
    // Consume from dest
    consumed := 0
    go func() {
        for range destCh {
            consumed++
        }
    }()
    
    // Wait for context timeout
    <-ctx.Done()
    
    fmt.Printf("Consumed: %d, Preview buffered: %d\n", consumed, preview.Len())
    // Both channels received all metrics, preview keeps last 10
}
```

### Example 4: HTTP Handler

```go
package handler

import (
    "encoding/json"
    "net/http"
    "strconv"
    "sonar-tap/pkg/metricsbuf"
)

type MetricsHandler struct {
    preview *metricsbuf.RingBuffer
}

func NewMetricsHandler(preview *metricsbuf.RingBuffer) *MetricsHandler {
    return &MetricsHandler{preview: preview}
}

// GET /metrics/preview?limit=50
func (h *MetricsHandler) GetPreview(w http.ResponseWriter, r *http.Request) {
    // Parse limit
    limitStr := r.URL.Query().Get("limit")
    limit := 20  // default
    
    if limitStr != "" {
        if n, err := strconv.Atoi(limitStr); err == nil && n > 0 {
            if n > 200 {
                n = 200  // max cap
            }
            limit = n
        }
    }
    
    // Get entries (newest first)
    entries := h.preview.Latest(limit)
    
    // Return JSON
    w.Header().Set("Content-Type", "application/json")
    w.Header().Set("Cache-Control", "no-cache")
    json.NewEncoder(w).Encode(entries)
}

// Example usage
func ExampleServer() {
    preview := metricsbuf.New(200)
    handler := NewMetricsHandler(preview)
    
    mux := http.NewServeMux()
    mux.HandleFunc("GET /metrics/preview", handler.GetPreview)
    
    http.ListenAndServe(":8080", mux)
}
```

### Example 5: Frontend React Component

```typescript
// hooks/use-metrics-preview.ts
import { useQuery } from '@tanstack/react-query'

export interface MetricEntry {
  received_at: string
  name: string
  value: number
  timestamp: number
  labels?: Record<string, string>
}

export function useMetricsPreview(limit: number = 200) {
  return useQuery({
    queryKey: ['metrics-preview', limit],
    queryFn: async () => {
      const res = await fetch(`/api/v1/metrics/preview?limit=${limit}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<MetricEntry[]>
    },
    staleTime: 0,           // Always consider data stale
    refetchInterval: 5000,  // Poll every 5 seconds
    gcTime: 10000,          // Keep in cache for 10s
  })
}

// components/metrics-dashboard.tsx
import React, { useMemo, useState } from 'react'
import { useMetricsPreview } from '@/hooks/use-metrics-preview'

export function MetricsDashboard() {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterPid, setFilterPid] = useState<string | null>(null)
  
  const { data: metrics, isLoading, error } = useMetricsPreview(200)
  
  const filteredMetrics = useMemo(() => {
    if (!metrics) return []
    
    let result = metrics
    
    // Filter by PID
    if (filterPid) {
      result = result.filter(m => m.labels?.pid === filterPid)
    } else {
      result = result.filter(m => !m.labels?.pid)  // node metrics
    }
    
    // Filter by search term
    if (searchTerm) {
      const lower = searchTerm.toLowerCase()
      result = result.filter(m => 
        m.name.toLowerCase().includes(lower) ||
        Object.values(m.labels || {}).some(v => 
          v.toLowerCase().includes(lower)
        )
      )
    }
    
    return result
  }, [metrics, filterPid, searchTerm])
  
  if (isLoading) return <div>Loading metrics...</div>
  if (error) return <div>Error: {(error as Error).message}</div>
  if (!metrics) return <div>No metrics</div>
  
  return (
    <div className="p-4">
      <h2>Metrics Preview (Last 200)</h2>
      
      {/* Search input */}
      <input
        type="text"
        placeholder="Search metrics..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="mb-4 p-2 border rounded"
      />
      
      {/* PID filter */}
      <select 
        value={filterPid || ''}
        onChange={(e) => setFilterPid(e.target.value || null)}
        className="mb-4 p-2 border rounded"
      >
        <option value="">Node Metrics</option>
        {Array.from(
          new Set(metrics.map(m => m.labels?.pid).filter(Boolean))
        ).map(pid => (
          <option key={pid} value={pid}>{`PID: ${pid}`}</option>
        ))}
      </select>
      
      {/* Metrics table */}
      <table className="w-full border">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2">Metric Name</th>
            <th className="border p-2">Value</th>
            <th className="border p-2">Timestamp</th>
            <th className="border p-2">Labels</th>
          </tr>
        </thead>
        <tbody>
          {filteredMetrics.map((metric, idx) => (
            <tr key={`${metric.name}-${metric.timestamp}-${idx}`}>
              <td className="border p-2">{metric.name}</td>
              <td className="border p-2">{metric.value.toFixed(2)}</td>
              <td className="border p-2 text-sm text-gray-600">
                {new Date(metric.timestamp).toLocaleTimeString()}
              </td>
              <td className="border p-2 text-sm">
                <div className="flex gap-1 flex-wrap">
                  {Object.entries(metric.labels || {}).map(([k, v]) => (
                    <span 
                      key={k} 
                      className="bg-blue-100 text-blue-800 px-2 py-1 rounded"
                    >
                      {k}={v}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      <p className="mt-4 text-gray-600">
        Showing {filteredMetrics.length} of {metrics.length} metrics
        (Auto-refreshes every 5 seconds)
      </p>
    </div>
  )
}
```

---

## Testing Scenarios

### Scenario 1: Buffer Overflow

```go
func TestBufferOverflow(t *testing.T) {
    rb := metricsbuf.New(5)
    
    // Add 10 metrics to a buffer with capacity 5
    for i := 1; i <= 10; i++ {
        rb.Push(&v1.MetricPoint{
            Name: fmt.Sprintf("metric_%d", i),
            Value: float64(i),
            Timestamp: int64(i * 1000),
        })
    }
    
    // Should only have last 5
    if rb.Len() != 5 {
        t.Fatalf("Expected size 5, got %d", rb.Len())
    }
    
    entries := rb.Latest(5)
    // Should be [metric_10, metric_9, metric_8, metric_7, metric_6]
    if entries[0].Name != "metric_10" {
        t.Fatalf("Expected newest to be metric_10, got %s", entries[0].Name)
    }
}
```

### Scenario 2: Concurrent Stress Test

```go
func TestConcurrentAccess(t *testing.T) {
    rb := metricsbuf.New(100)
    var wg sync.WaitGroup
    done := make(chan bool)
    
    // 50 concurrent writers for 10 seconds
    for i := 0; i < 50; i++ {
        wg.Add(1)
        go func(id int) {
            defer wg.Done()
            for {
                select {
                case <-done:
                    return
                default:
                    rb.Push(&v1.MetricPoint{
                        Name: fmt.Sprintf("writer_%d", id),
                        Value: float64(id),
                        Timestamp: time.Now().UnixMilli(),
                    })
                }
            }
        }(i)
    }
    
    // 10 concurrent readers
    for i := 0; i < 10; i++ {
        wg.Add(1)
        go func(id int) {
            defer wg.Done()
            for {
                select {
                case <-done:
                    return
                default:
                    _ = rb.Latest(50)
                    time.Sleep(10 * time.Millisecond)
                }
            }
        }(i)
    }
    
    time.Sleep(10 * time.Second)
    close(done)
    wg.Wait()
    
    // Should have metrics and no panic
    if rb.Len() == 0 {
        t.Fatal("Buffer should have entries")
    }
}
```

### Scenario 3: HTTP Endpoint Test

```go
func TestMetricsPreviewEndpoint(t *testing.T) {
    preview := metricsbuf.New(10)
    
    // Add some metrics
    for i := 0; i < 15; i++ {
        preview.Push(&v1.MetricPoint{
            Name: fmt.Sprintf("test_metric_%d", i),
            Value: float64(i),
            Timestamp: int64(time.Now().UnixMilli()),
        })
    }
    
    handler := &TapHandler{preview: preview}
    
    // Test 1: Default limit
    req := httptest.NewRequest("GET", "/api/v1/metrics/preview", nil)
    w := httptest.NewRecorder()
    handler.GetMetricsPreview(w, req)
    
    if w.Code != http.StatusOK {
        t.Fatalf("Expected 200, got %d", w.Code)
    }
    
    var entries []interface{}
    json.NewDecoder(w.Body).Decode(&entries)
    if len(entries) != 10 {  // default 20 or max buffer
        t.Fatalf("Expected 10 entries, got %d", len(entries))
    }
    
    // Test 2: Custom limit
    req = httptest.NewRequest("GET", "/api/v1/metrics/preview?limit=5", nil)
    w = httptest.NewRecorder()
    handler.GetMetricsPreview(w, req)
    
    json.NewDecoder(w.Body).Decode(&entries)
    if len(entries) != 5 {
        t.Fatalf("Expected 5 entries, got %d", len(entries))
    }
    
    // Test 3: Limit > capacity
    req = httptest.NewRequest("GET", "/api/v1/metrics/preview?limit=500", nil)
    w = httptest.NewRecorder()
    handler.GetMetricsPreview(w, req)
    
    json.NewDecoder(w.Body).Decode(&entries)
    if len(entries) != 10 {  // capped at buffer size
        t.Fatalf("Expected 10 entries, got %d", len(entries))
    }
}
```

---

## Troubleshooting

### Issue: Metrics not appearing in preview

**Checklist:**
1. Check if collectors are enabled in config
2. Verify TeeToPreview is wired up in main.go
3. Check if rawCh is being written to
4. Verify preview buffer isn't nil

```bash
# Check health
curl http://localhost:9090/api/v1/health

# Check status
curl http://localhost:9090/api/v1/status

# Check config
curl http://localhost:9090/api/v1/config | jq '.node_exporter'
```

### Issue: Slow response times

**Possible causes:**
1. Large limit parameter (>200)
2. Heavy concurrent queries
3. Slow network

**Solution:**
```bash
# Monitor with time
time curl "http://localhost:9090/api/v1/metrics/preview?limit=50"

# Reduce limit if needed
curl "http://localhost:9090/api/v1/metrics/preview?limit=20"
```

### Issue: Frontend not updating

**Check:**
1. Browser console for errors
2. Network tab for failed requests
3. Polling interval (default 5 seconds)

```typescript
// Manually check API
const metrics = await fetch('/api/v1/metrics/preview').then(r => r.json())
console.log('Got', metrics.length, 'metrics')
```

---

## Performance Tuning

### For High Throughput

```go
// Increase channel sizes
channelSize := 10000  // Instead of 4096
rawCh := make(chan *metrics.MetricPoint, channelSize)
mainCh := make(chan *metrics.MetricPoint, channelSize)
```

### For Low Latency

```go
// Reduce refetch interval in frontend
const refetchInterval = 1000  // 1 second instead of 5
```

### For Memory Optimization

```go
// Reduce buffer capacity (if 200 is overkill)
preview := metricsbuf.New(50)  // 50 entries ≈ 200-300 KB

// Reduces memory by ~2.5x
```

---

**Last Updated:** 2026-04-09
