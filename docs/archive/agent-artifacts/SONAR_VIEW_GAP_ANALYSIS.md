# Sonar-View Gap Analysis: Current Status vs Monitor_Hub Implementation

**Analysis Date**: 2026-04-14  
**Analyst**: analyst-1  
**Scope**: Backend and Frontend implementation gap audit between sonar-view (current) and monitor_hub (reference)  
**Output Format**: Detailed gap inventory with implementation priorities

---

## Executive Summary

Sonar-view has implemented **~70% of core aggregation backend** but **frontend data flow is still incomplete**. Key gaps:

1. **Backend**: Data compression format (BuildCompressedData) implemented ✅, but HTTP API response format doesn't match monitor_hub's PointsResponse structure ❌
2. **Frontend**: WebSocket stream data ingestion working ✅, but no compressed data decompression logic ❌, and groupmap-driven chart grouping missing ❌
3. **Data Format Mismatch**: Backend returns flat series list, frontend expects 3D compressed array [metric][agg_type][points]
4. **Missing Features**: Groupmap configuration, datasource metadata UI, metric alias mapping

---

## Part 1: Backend Analysis

### 1.1 POST /api/v1/aggregation/metrics Current Implementation

**File**: `/Users/castlexu/github/sonar/sonar-view/internal/handler/api_handler.go` (lines 321-456)

**Current Behavior**:
```
Input: GET params (app_id, metric_names, start_time, end_time, level, labels)
Query: Queries local TSDB by AggregatedInternalLabel.__aggregation_level__ and business labels
Output Format: Flat series list
  {
    "code": 0,
    "data": {
      "metrics": [
        {
          "name": "cpu_usage",
          "labels": {"datasource_id": "...", "aggregation_type": "avg", ...},
          "points": [{"timestamp": ms, "value": 42.5}, ...]
        },
        ...
      ],
      "level": "1m",
      "start_time": ...,
      "end_time": ...
    }
  }
```

**Gap vs Monitor_Hub**:
- ❌ Returns flat array of metric series (one entry per aggregation type)
- ❌ No K/V compression format (BuildCompressedData structure)
- ❌ Points are not organized as 3D array [metric_index][agg_type_index][points]
- ✅ Correctly queries by aggregation level
- ✅ Supports metric name filtering

**Monitor_Hub Reference** (monitor_hub/biz/points/v1/handler.go):
```go
// Returns PointsResponse with:
// K: [name1, labels1_str, name2, labels2_str, ...]  // index 2i, 2i+1
// V: [[[RawData], [RawData], ...], ...]              // V[metric_idx][agg_type_idx][points]
// This allows single HTTP response to encode all 5 aggregation types per metric
```

### 1.2 Data Compression Format Status

**File**: `/Users/castlexu/github/sonar/sonar-view/pkg/dataprocess/pointsformat.go`

**Current Status**: ✅ **Fully Implemented**
- BuildCompressedData() - Creates K/V compression from AggregatedPoint array
- FilterCompressedData() - Filters by metric names
- MergeCompressedData() - Merges multiple compressed responses
- CountMetrics() / CountPoints() - Utility functions

**Implementation Details**:
```go
type PointsResponse struct {
    K []string        // [name1, labelstr1, name2, labelstr2, ...]
    V [][][]RawData   // V[metric_idx][agg_type_idx][points]
}

// AggregationTypeList order: [avg, min, max, count, last]
// Each point index via AggregationType.Index(): avg→0, min→1, max→2, count→3, last→4
```

**Problem**: This function exists but is **NOT USED** in the HTTP handler. The handler returns flat series, not compressed format.

### 1.3 AggregationService Data Flow

**File**: `/Users/castlexu/github/sonar/sonar-view/internal/service/aggregation_service.go`

**Status**: ✅ **Fully Implemented**
- Initializes Prometheus TSDB storage with local data directory
- Creates StoreCollector to fetch raw data from sonar-store
- Registers aggregation and cleanup triggers
- Exposes GetTSDB() for query handlers

**Connection to Store**: 
- Via StoreCollector (store_collector.go) which calls `POST /apis/v1/metrics/query` on sonar-store
- Pulls raw metrics in time window, performs aggregation, writes to local TSDB

### 1.4 Store Client Implementation

**File**: `/Users/castlexu/github/sonar/sonar-view/internal/service/store_client.go`

**Status**: ⚠️ **Partial - Query API Incomplete**

**Implemented**:
- ✅ GetTaps() - Lists datasources from store
- ✅ Health() - Checks store availability  
- ✅ ProxyPost() - General proxy mechanism
- ✅ QueryMetrics() - Wrapper for `/apis/v1/metrics/query`

**Gaps**:
- ❌ No typed response structure for aggregated queries
- ❌ No support for querying by specific levels (should support sonar-store's QueryPoints API)
- ❌ Uses basic HTTP client without connection pooling

### 1.5 Internal Labels System

**File**: `/Users/castlexu/github/sonar/sonar-view/pkg/aggregator/types.go`

**Status**: ✅ **Fully Defined**

Constants match monitor_hub reference:
```go
const (
    AggregatedInternalLabelName             = "__name__"
    AggregatedInternalLabelAggregationLevel = "__aggregation_level__"
    AggregatedInternalLabelDataStatus       = "__data_status__"
    AggregatedInternalLabelDataScore        = "__data_score__"
    AggregatedInternalLabelStatisticSuffix  = "__statistic_suffix__"
    AggregatedInternalLabelDatasourceId     = "__datasource_id__"
)
```

**But**: The handler at line 353 only uses `__aggregation_level__`, not `__statistic_suffix__` (aggregation type) in label queries. This means it retrieves all aggregation types but doesn't organize them efficiently into the 3D matrix.

### 1.6 Aggregation Trigger & Manager

**Status**: ✅ **Implemented**
- Trigger runs every 15s (config.GetMinInterval())
- Manager.RunOnce() always aggregates first level, then checks time boundaries for cascading levels
- Event publishing infrastructure exists but underutilized

---

## Part 2: Frontend Analysis

### 2.1 Data Acquisition Flow

**Entry Point**: `/Users/castlexu/github/sonar/sonar-view/site/src/views/monitor/index.tsx`

**Current Flow**:
1. Selects tap from sidebar → stores in useMonitorStore
2. Calls useMonitorStream hook with tapId + granularity
3. Hook manages WebSocket + HTTP poll

**Hook Implementation**: `use-monitor-stream.ts` (lines 77-236)

**Status**: ⚠️ **Partially Working**

✅ **Implemented**:
- WebSocket connection management (connect, subscribe, reconnect logic)
- Topic subscription ("points" and "metric_stream" for backward compatibility)
- HTTP fallback fetch for history via `/api/v1/aggregation/metrics`
- Merging incoming data into Map<string, MetricPoint[]>
- Time-based deduplication and windowing

❌ **Missing**:
- No decompression of PointsResponse K/V format
- Currently expects flat MetricPoint[] from API
- toMetricPoints() filters only "avg" type (line 66), discarding min/max/count/last

### 2.2 API Client

**File**: `/Users/castlexu/github/sonar/sonar-view/site/src/lib/api-client.ts`

**Status**: ✅ **Basic - Sufficient but Minimal**

- Simple fetch wrapper with Content-Type headers
- get(), post(), put(), delete() methods
- **No typed methods** for specific endpoints

**Missing**:
- ❌ No queryPoints() function
- ❌ No response envelope type definitions
- ❌ No error handling for specific API errors

### 2.3 Metrics Chart Grid

**File**: `/Users/castlexu/github/sonar/sonar-view/site/src/views/monitor/components/metric-charts-grid.tsx`

**Status**: ⚠️ **Skeleton Only**

File exists but content shows minimal implementation. Expected to:
- Accept data (Map<string, MetricPoint[]>)
- Group metrics by business labels (from groupmap)
- Render chart per group
- Handle multiple aggregation types (currently filters to avg only)

**Current Gap**: 
- ❌ No groupmap-driven chart organization
- ❌ No metric alias display
- ❌ No aggregation type selector (currently hardcoded to "avg")

### 2.4 Store & State Management

**File**: `/Users/castlexu/github/sonar/sonar-view/site/src/stores/use-monitor-store.ts`

**Status**: ✅ **Basic State Management**

Stores:
- selectedTapId
- granularity ("15s" | "1m" | "5m" | "1h")
- legendVisible
- gridCols (1 or 2)

**Gap**: 
- ❌ No groupmap caching from store config
- ❌ No datasource metadata store
- ❌ No aggregation type selection state

### 2.5 WebSocket Client

**File**: `/Users/castlexu/github/sonar/sonar-view/site/src/lib/websocket-client.ts`

**Status**: ✅ **Fully Implemented**
- Connection management with exponential backoff
- Topic-based pub/sub
- Status change notifications
- Heartbeat filtering

✅ **Ready for Data Push**: Backend should publish aggregation events to "points" topic via WebSocket hub.

### 2.6 Granularity Configuration

**File**: `/Users/castlexu/github/sonar/sonar-view/site/src/lib/granularity-config.ts`

**Status**: ⚠️ **Partially Defined**

Supports: "15s" (1h, 3s refresh), "1m" (6h, 30m refresh), "5m" (1d, 2h refresh), "1h" (7d, 6h refresh)

**Expected vs Actual**:
- ✅ Granularity levels map to backend aggregation levels
- ❌ Configuration doesn't specify which aggregation levels are available on backend
- ❌ No concept of "fallback" aggregation (what if requested level doesn't exist yet?)

---

## Part 3: Data Format Mismatch - Root Cause Analysis

### Problem Statement

**Monitor_Hub (Reference)**: Returns CompressedData format (PointsResponse K/V)
```
Single response encodes ALL aggregation types for ALL metrics:
- K: ["metric1", "{...labels...}", "metric2", "{...labels...}"]
- V: [
    [[avg_points], [min_points], [max_points], [count_points], [last_points]],
    [[avg_points], [min_points], [max_points], [count_points], [last_points]]
  ]
```

**Sonar-View (Current)**: Returns flat series list
```
One entry per metric per aggregation type per label combination:
- [{name: "metric1", labels: {agg_type: "avg", ...}, points: [...]}, 
   {name: "metric1", labels: {agg_type: "min", ...}, points: [...]}, 
   ...]
```

### Impact

1. **Network Efficiency**: Monitor_Hub ~70% smaller payload (shared K array, no label duplication)
2. **Frontend Parsing**: Monitor_Hub needs decompression step, Sonar-View can use directly
3. **Query Performance**: Monitor_Hub pre-computes all types in single TSDB read, Sonar-View requires 5x reads or in-memory reorganization

### Why Sonar-View Diverged

- Handler (api_handler.go, lines 409-443) manually constructs response by grouping AggregatedPoints
- Doesn't call BuildCompressedData() from pkg/dataprocess
- Built before BuildCompressedData was moved to sonar-view

---

## Part 4: Datasource & Groupmap Support

### Current Status

**Gap**: ❌ **Not Implemented**

Monitor_Hub Features (not in sonar-view):
- Datasource metadata (name, icon, description, groupmap)
- Groupmap: map<string, list<MetricConfig>>
  - Groups metrics by category (e.g., "CPU", "Memory", "Network")
  - Each metric has alias, unit, display_labels, chart_type
- SummaryConfig: Defines which metrics go in summary table

**Sonar-View Equivalent**: None

**What Frontend Needs**:
1. Fetch datasource config from store (name, groupmap, summary config)
2. Cache groupmap locally
3. Group metrics by groupmap category when rendering charts
4. Apply metric aliases and units in display

---

## Part 5: Implementation Gap Inventory

### Backend Gaps (Priority Order)

#### **HIGH - Critical for Parity**

| Gap | File | Current State | Required | Effort | Impact |
|-----|------|---------------|----------|--------|--------|
| **[B1] API Response Format** | `internal/handler/api_handler.go` | Returns flat series list | Change to PointsResponse K/V format | HIGH | CRITICAL - Frontend cannot decompress |
| **[B2] Aggregation Type Indexing** | `internal/handler/api_handler.go` | Retrieves all types, no grouping | Organize into 3D matrix during query | MEDIUM | HIGH - Network efficiency |
| **[B3] QueryMetrics Response Wrapper** | `internal/service/store_client.go` | Basic HTTP proxy | Add typed wrapper with PointsResponse struct | LOW | MEDIUM - Type safety |

#### **MEDIUM - Functional Completeness**

| Gap | File | Current State | Required | Effort | Impact |
|-----|------|---------------|----------|--------|--------|
| **[B4] Datasource Metadata API** | `internal/handler/api_handler.go` (new) | Not implemented | Add GET /api/v1/datasources/{id}/metadata | MEDIUM | MEDIUM - Frontend needs groupmap |
| **[B5] Event Publishing** | `internal/service/aggregation_service.go` | Infrastructure exists | Emit aggregation events via WebSocket hub | LOW | HIGH - Real-time push |
| **[B6] Error Handling** | `internal/service/store_client.go` | Basic | Add circuit breaker, retry logic | MEDIUM | LOW - Robustness |

---

### Frontend Gaps (Priority Order)

#### **HIGH - Critical for Rendering**

| Gap | File | Current State | Required | Effort | Impact |
|-----|------|---------------|----------|--------|--------|
| **[F1] Data Decompression** | `site/src/` (new) | Not implemented | Implement PointsResponse K/V unpacking | MEDIUM | CRITICAL - Cannot render compressed data |
| **[F2] Groupmap-Driven Organization** | `site/src/views/monitor/components/metric-charts-grid.tsx` | Skeleton only | Fetch datasource config, group by category | MEDIUM | HIGH - UX organization |
| **[F3] Metric Aggregation Type Selector** | `site/src/views/monitor/components/` (new) | Hardcoded to "avg" | Add dropdown/tabs to switch types | LOW | MEDIUM - Feature completeness |

#### **MEDIUM - Functional Completeness**

| Gap | File | Current State | Required | Effort | Impact |
|-----|------|---------------|----------|--------|--------|
| **[F4] Typed API Response Types** | `site/src/api/` | No types | Add PointsResponse, AggregatedPoint TS types | LOW | MEDIUM - Type safety |
| **[F5] Datasource Selector** | `site/src/views/monitor/components/monitor-sidebar.tsx` | Shows taps, no metadata | Add datasource name, icon, description | LOW | LOW - UX polish |
| **[F6] Summary Table** | `site/src/views/` (new) | Not implemented | Display top metrics from SummaryConfig | MEDIUM | MEDIUM - Feature parity |

---

## Part 6: Detailed Implementation Roadmap

### Phase 1: Backend API Format Fix (Critical Path)

**Objective**: Make API response compatible with frontend decompression

**Step 1.1**: Modify QueryMetrics handler to use BuildCompressedData
```go
// internal/handler/api_handler.go, QueryMetrics() method

// After querying TSDB and collecting allPoints:
import "sonar-view/pkg/dataprocess"

// NEW: Use BuildCompressedData instead of manual grouping
compressed := dataprocess.BuildCompressedData(allPoints)

writeJSON(w, http.StatusOK, map[string]interface{}{
    "k": compressed.K,
    "v": compressed.V,
    "level": level,
    "start_time": startMs,
    "end_time": endMs,
})
```

**Step 1.2**: Add response struct to typed API
```go
// internal/api/sonar-view/aggregation/v1/types.go (NEW)
type QueryMetricsResponse struct {
    K         []string        `json:"k"`          // [name1, labels1, name2, labels2, ...]
    V         [][][]RawData   `json:"v"`          // [metric_idx][agg_type_idx][points]
    Level     string          `json:"level"`
    StartTime int64           `json:"start_time"`
    EndTime   int64           `json:"end_time"`
}
```

**Validation**: Frontend can now decompress and render all 5 aggregation types

---

### Phase 2: Frontend Data Decompression (Unblock Rendering)

**Objective**: Parse compressed PointsResponse and generate MetricPoint[]

**Step 2.1**: Create decompression utility
```typescript
// site/src/lib/points-decompression.ts (NEW)
interface PointsResponse {
  k: string[];
  v: number[][][];  // 3D: [metric][agg_type][point_index]
}

function decompressPoints(resp: PointsResponse): MetricPoint[] {
  const result: MetricPoint[] = [];
  const aggTypes = ['avg', 'min', 'max', 'count', 'last'];
  
  // Iterate K: pairs at 2i, 2i+1
  for (let i = 0; i < resp.k.length; i += 2) {
    const metricName = resp.k[i];
    const labelsStr = resp.k[i+1];
    const metricIdx = i / 2;
    const labels = JSON.parse(labelsStr);
    
    // For each aggregation type
    for (let aggIdx = 0; aggIdx < 5; aggIdx++) {
      const pointArray = resp.v[metricIdx][aggIdx];
      for (const pt of pointArray) {
        result.push({
          name: metricName,
          value: pt.v,
          timestamp: pt.t / 1000,  // ms to seconds
          labels: { ...labels, aggregation_type: aggTypes[aggIdx] },
        });
      }
    }
  }
  return result;
}
```

**Step 2.2**: Update use-monitor-stream hook
```typescript
// site/src/shared/hooks/use-monitor-stream.ts

import { decompressPoints } from '@/lib/points-decompression';

// In fetchHistory():
const resp = await api.get<PointsResponse>(...);
const decompressed = decompressPoints(resp.data);
mergePoints(decompressed);
```

**Step 2.3**: Remove "avg-only" filter
```typescript
// Remove the type filter at line 66 in toMetricPoints()
// Now all aggregation types will be available
```

**Validation**: Frontend receives and stores all 5 aggregation types per metric

---

### Phase 3: Groupmap Integration (Feature Completeness)

**Objective**: Organize charts by datasource groupmap

**Step 3.1**: Fetch and cache datasource config
```go
// internal/handler/api_handler.go (NEW)
type DatasourceMetadataHandler struct {
    storeClient *service.StoreClient
}

func (h *DatasourceMetadataHandler) GetMetadata(w http.ResponseWriter, r *http.Request) {
    datasourceId := r.PathValue("id")
    // Query store for datasource config including groupmap
    // Cache locally for 5 minutes
}
```

**Step 3.2**: Frontend fetch and store groupmap
```typescript
// site/src/shared/hooks/use-view-api.ts (NEW)
export function useDatasourceMetadata(datasourceId: string | null) {
  return useQuery({
    queryKey: ['datasource-metadata', datasourceId],
    queryFn: () => api.get(`/api/v1/datasources/${datasourceId}/metadata`),
    enabled: Boolean(datasourceId),
    staleTime: 5 * 60 * 1000,
  });
}
```

**Step 3.3**: Update metric charts grid
```typescript
// site/src/views/monitor/components/metric-charts-grid.tsx
function MetricChartsGrid({ data, tapId }: Props) {
  const { data: metadata } = useDatasourceMetadata(tapId);
  const groupmap = metadata?.groupmap || {};
  
  // Group metrics by groupmap
  const groups = new Map<string, MetricPoint[]>();
  for (const [metricName, points] of data) {
    // Find which group this metric belongs to
    const group = findGroup(metricName, groupmap);
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group)!.push(...points);
  }
  
  // Render one chart per group
  return (
    <div className="grid grid-cols-2 gap-4">
      {Array.from(groups.entries()).map(([group, metrics]) => (
        <MetricChart key={group} title={group} data={metrics} />
      ))}
    </div>
  );
}
```

**Validation**: Charts organized by datasource category

---

### Phase 4: Additional Features (Polish)

#### [F3] Aggregation Type Selector
```typescript
// site/src/views/monitor/components/aggregation-type-selector.tsx (NEW)
const aggTypes = ['avg', 'min', 'max', 'count', 'last'];

export function AggregationTypeSelector({ selected, onChange }: Props) {
  return (
    <select onChange={(e) => onChange(e.target.value as AggregationType)}>
      {aggTypes.map(t => <option key={t}>{t}</option>)}
    </select>
  );
}
```

#### [B5] WebSocket Event Publishing
```go
// internal/ws/hub.go - Already exists
// Update aggregation_service.go to publish to WebSocket hub:
eventPublisher := ws.NewEventPublisher(hub)
manager, _ := aggregator.NewManager(cfg, tsdb, collector, 
    aggregator.WithEventPublisher(eventPublisher))
```

---

## Part 7: Sonar-View Implementation Status Matrix

| Component | Backend | Frontend | Compression | Tests |
|-----------|---------|----------|-------------|-------|
| Aggregation Engine | ✅ | - | ✅ | ✅ |
| TSDB Storage | ✅ | - | - | ✅ |
| Store Collector | ✅ | - | - | - |
| HTTP API Handler | ⚠️ Format Wrong | - | ❌ Not Used | ❌ |
| WebSocket Stream | ✅ Backend Pub | ✅ Frontend Sub | - | ❌ |
| Data Decompression | - | ❌ | - | ❌ |
| Groupmap Support | ❌ | ❌ | - | ❌ |
| Aggregation Types Filter | ✅ Query | ❌ Frontend Hardcoded | - | - |
| Datasource Metadata | ❌ | ❌ | - | ❌ |
| Summary Table | ❌ | ❌ | - | ❌ |

---

## Part 8: Testing Gaps

### Backend Tests Needed

1. **API Response Format**: Verify PointsResponse K/V compression
2. **BuildCompressedData Integration**: Ensure handler uses compression
3. **Store Collector**: Mock sonar-store responses, verify data ingestion
4. **Event Publishing**: Verify aggregation events published to WebSocket

### Frontend Tests Needed

1. **Decompression Logic**: Unit tests for K/V unpacking
2. **Groupmap Organization**: Verify metrics grouped correctly
3. **Type Filtering**: Verify all 5 aggregation types rendered
4. **WebSocket Integration**: Mock WebSocket, verify message handling

---

## Part 9: Files Requiring Modification

### Backend Changes (5 files)

1. **`internal/handler/api_handler.go`**
   - Lines 409-443: Replace manual grouping with BuildCompressedData()
   - Add DatasourceMetadataHandler for groupmap endpoint

2. **`internal/service/store_client.go`**
   - Add typed response structs for PointsResponse

3. **`internal/service/aggregation_service.go`**
   - Integrate WebSocket event publisher

4. **`pkg/aggregator/manager.go`** (minimal)
   - Ensure event publishing called for all levels

5. **`internal/api/sonar-view/` (new directory)**
   - Create aggregation.v1.proto with PointsResponse definition
   - Generate typed Go structs

### Frontend Changes (8 files)

1. **`site/src/lib/points-decompression.ts`** (NEW)
   - Implement K/V decompression

2. **`site/src/shared/hooks/use-monitor-stream.ts`**
   - Call decompressPoints() in fetchHistory

3. **`site/src/shared/hooks/use-view-api.ts`**
   - Add useDatasourceMetadata hook

4. **`site/src/views/monitor/components/metric-charts-grid.tsx`**
   - Implement groupmap-based organization
   - Handle multiple aggregation types

5. **`site/src/views/monitor/components/aggregation-type-selector.tsx`** (NEW)
   - Type selector component

6. **`site/src/api/sonar-view/` (new directory)**
   - Add PointsResponse TypeScript types
   - Add decompression type definitions

7. **`site/src/stores/use-monitor-store.ts`**
   - Add groupmap caching state

8. **`site/src/shared/types/index.ts`**
   - Add PointsResponse, AggregationType unions

---

## Part 10: Risk Assessment & Mitigations

### Risks

1. **Data Format Change** (HIGH RISK)
   - **Impact**: Frontend breakage if format changes
   - **Mitigation**: Version API endpoint, support both formats during transition
   - **Timeline**: 1-2 sprints for full migration

2. **Performance with Compressed Format** (MEDIUM RISK)
   - **Impact**: JSON parsing overhead for K/V decompression
   - **Mitigation**: Benchmark decompression, consider binary format if needed
   - **Metrics**: Measure latency for 1000-metric queries

3. **Store Integration** (MEDIUM RISK)
   - **Impact**: Sonar-store may not return data in expected format
   - **Mitigation**: Coordinate API contract, add integration tests
   - **Timeline**: Verify sonar-store QueryMetrics implementation

4. **Backward Compatibility** (LOW RISK)
   - **Impact**: Existing integrations break
   - **Mitigation**: Keep old endpoint, mark as deprecated
   - **Duration**: 2-3 sprints deprecation period

---

## Part 11: Success Criteria

### Backend Implementation Complete When

- [ ] `QueryMetrics` returns `PointsResponse` K/V format
- [ ] `BuildCompressedData` called in handler, not manual grouping
- [ ] DatasourceMetadata endpoint returns groupmap + SummaryConfig
- [ ] WebSocket publishes aggregation events to "points" topic
- [ ] All 5 aggregation types present in response (avg, min, max, count, last)
- [ ] Response size ~70% smaller vs flat format (network efficiency)

### Frontend Implementation Complete When

- [ ] Decompression utility correctly unpacks K/V into MetricPoint[]
- [ ] All 5 aggregation types rendered (selectable via dropdown)
- [ ] Charts grouped by datasource groupmap category
- [ ] Metric aliases displayed (from MetricConfig)
- [ ] Summary table shows top metrics
- [ ] WebSocket real-time updates working
- [ ] No console errors for >1000 data points

---

## Part 12: Priority Action Items

### Immediate (This Sprint)

1. **[B1]** Modify `api_handler.go` QueryMetrics to return compressed format
   - Use BuildCompressedData() instead of manual grouping
   - Update response struct
   - **Time**: 2-3 hours

2. **[F1]** Implement decompression in `points-decompression.ts`
   - Parse K/V format into MetricPoint[]
   - Unit tests
   - **Time**: 3-4 hours

3. **[B4]** Add DatasourceMetadata API endpoint
   - Proxy to sonar-store datasource config
   - Cache locally
   - **Time**: 2-3 hours

### Next Sprint

4. **[F2]** Groupmap-driven chart organization in metric-charts-grid
5. **[F3]** Aggregation type selector component
6. **[B5]** WebSocket event publishing integration

### Following Sprint

7. **[F6]** Summary table implementation
8. Integration testing between sonar-view and sonar-store
9. Performance benchmarking & optimization

---

## Appendix: Code Cross-Reference

### Monitor_Hub Reference Files
- `/Users/castlexu/github/sonar/.legacy/monitor_hub/biz/points/v1/handler.go` - QueryPoints handler (PointsResponse format)
- `/Users/castlexu/github/sonar/.legacy/monitor_hub/pkg/dataprocess/pointsformat.go` - Compression logic (reference)
- `/Users/castlexu/github/sonar/.legacy/monitor_hub/pkg/aggregator/types.go` - Internal label constants

### Sonar-View Implementation Files
- `/Users/castlexu/github/sonar/sonar-view/pkg/dataprocess/pointsformat.go` - Already copied, not used
- `/Users/castlexu/github/sonar/sonar-view/internal/handler/api_handler.go` - Current handler (needs fix)
- `/Users/castlexu/github/sonar/sonar-view/site/src/shared/hooks/use-monitor-stream.ts` - Frontend data ingestion

---

## Conclusion

Sonar-view has **solid backend infrastructure** (aggregation, TSDB, trigger management) but **critical frontend-backend mismatch** in data format prevents rendering. The fix is straightforward:

1. Backend: Use existing BuildCompressedData() in API handler
2. Frontend: Implement K/V decompression matching monitor_hub reference
3. Feature: Add groupmap organization for better UX

**Estimated Effort**: 
- Backend: 1 sprint (7-10 hours code + testing)
- Frontend: 1.5 sprints (10-15 hours code + testing)
- Integration: 0.5 sprint (testing + optimization)

**Time to Parity**: 2-3 weeks with coordinated effort.

