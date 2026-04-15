# Sonar View Implementation Roadmap
## Comprehensive Coordination Document: Frontend + Backend Analysis

**Document Status**: Coordination Summary
**Analysis Date**: 2026-04-14
**Team**: analyst-1 (backend), analyst-2 (frontend)
**Deliverables**: 
- MONITOR_HUB_BACKEND_ANALYSIS.md (analyst-1)
- MONITOR_HUB_FRONTEND_ANALYSIS.md (analyst-2)

---

## Executive Summary

This document synthesizes the frontend and backend analyses of monitor_hub to provide a unified implementation roadmap for sonar-view. The analysis reveals that:

1. **Frontend and Backend are Tightly Integrated**: The compressed data format, aggregation levels, and WebSocket patterns must align between backend and frontend
2. **High Code Reusability**: ~90% of monitor_hub patterns can be directly copied to sonar-view with minimal adaptation
3. **Main Difference**: Multi-datasource support (routing/page level, not component level)
4. **Clear Implementation Path**: 4 phases, starting with foundational data layer, progressing to UI components

---

## Part 1: Backend Architecture Overview

### 1.1 Backend Data Flow (From MONITOR_HUB_BACKEND_ANALYSIS.md)

```
Raw Metrics (from exporter via POST /mark/batch)
    ↓
Recorder (5-minute TTL cache, in-memory aggregation)
    ↓
Aggregation Engine (every 5 seconds)
    ├── Primary aggregation (15s level)
    ├── Cascading aggregation (1m → 5m → 30m → 1h → 6h)
    └── TSDB write (Prometheus)
    ↓
QueryPoints API (GET /metrics/query?metrics=cpu_usage&agg_level=1m&start=...&end=...)
    ├── TSDB lookup by labels (__aggregation_level__, __datasource_id__)
    └── Compression (BuildCompressedData format)
    ↓
CompressedPointsResponse to Frontend
```

### 1.2 Key Backend Components

| Component | Purpose | File(s) | Notes |
|-----------|---------|---------|-------|
| **AggregatedInternalLabel** | Internal label constants | pkg/aggregator/types.go | 6 internal labels: __name__, __aggregation_level__, __data_status__, __data_score__, __statistic_suffix__, __datasource_id__ |
| **AggregationType** | Aggregation types (avg/min/max/count/last) | pkg/aggregator/types.go | Index mapping: avg=0, min=1, max=2, count=3, last=4 |
| **Aggregator** | Main aggregation engine | pkg/aggregator/aggregator.go | Runs every 5s, performs cascading aggregations |
| **Storage[T]** | Generic TSDB interface | pkg/storage/ | Prometheus TSDB backend |
| **QueryPoints Handler** | HTTP query endpoint | biz/*/handler/api_handler.go | Returns CompressedPointsResponse |
| **PointsResponse** | Compression format | pkg/aggregator/types.go | 3D array: [aggType][metricIndex][point] |

### 1.3 Aggregation Level Configuration (Backend)

```go
// Backend must provide same levels as frontend expects
// 6 aggregation levels with retention windows:
// 15s → 1h, 1m → 6h, 5m → 1d, 30m → 7d, 1h → 30d, 6h → 365d

// Query flow:
// 1. User selects aggregation level (e.g., "1m")
// 2. Frontend sends: GET /metrics/query?agg_level=1m&start=...&end=...
// 3. Backend queries TSDB: QueryByLabels(__aggregation_level__="1m", __datasource_id__="...")
// 4. Backend returns: CompressedPointsResponse (compressed data)
```

### 1.4 Data Compression Format (Backend Implementation)

```go
// Backend structures (from types.go):
type PointsResponse struct {
    // Metric names with labels: ["cpu_usage{host=server1}", ...]
    K []string
    // 3D data array: [aggType][metricIndex][dataPointIndex]
    // Each point: {Timestamp int64, Value float64}
    V [][][]RawDataPoint
    // Optional: metadata about the response
}

type RawDataPoint struct {
    Timestamp int64
    Value     float64
}

// Compression happens in QueryPoints handler:
// 1. Query TSDB for metrics in time range
// 2. Group by metric name + labels
// 3. Organize into 3D array by aggregation type
// 4. Return compact JSON (CompressedPointsResponse)
```

### 1.5 TSDB Labels Strategy

```go
// Every point written to TSDB has these labels:
Labels: map[string]string{
    "__name__": "cpu_usage",                    // Metric name
    "__aggregation_level__": "1m",              // Level for filtering
    "__statistic_suffix__": "avg",              // Aggregation type (avg/min/max/count/last)
    "__datasource_id__": "abc123",              // Datasource for multi-tenant queries
    "__data_status__": "complete",              // Quality indicator
    "host": "server1",                          // User-defined labels
    "region": "us-east",
}

// Query example:
// SELECT * WHERE __aggregation_level__="1m" AND __datasource_id__="abc123"
//   AND __name__ IN ("cpu_usage", "memory_usage")
//   AND timestamp >= start_time AND timestamp <= end_time
```

---

## Part 2: Frontend Architecture Overview

### 2.1 Frontend Data Flow (From MONITOR_HUB_FRONTEND_ANALYSIS.md)

```
User selects aggregation level (UI: Toolbar)
    ↓
calculateQueryTimeWindow(level) → {startTime, endTime}
    ↓
HTTP GET /metrics/query?agg_level=1m&start=...&end=...
    ↓
CompressedPointsResponse received (compact JSON)
    ↓
decompressPoints(data) → Map<metricName, AggregatedPoint[]>
    │   - createCompressedDataIndex: O(1) metric lookup
    │   - getPointsFromIndex: Filter by aggType
    │   - parseLabels: Extract labels from metric string
    ↓
State update: pointsByMetric
    ↓
MetricCharts component
    ├── Grouping: Expand groupmap, sort by groupName
    ├── Memoization: Pre-compute all aggTypes (O(1) switching)
    └── Rendering: MetricChartsGrid
        ├── Column span layout (1-3 cols)
        ├── MetricChartWithLegend (per metric)
        │   ├── Chart (Recharts)
        │   └── Virtual legend (@tanstack/react-virtual)
        └── Series interactions: toggle/solo
    ↓
WebSocket: Real-time status updates (parallel to HTTP polling)
    └── subscribeDatasourceStatus() → UI update
```

### 2.2 Key Frontend Components

| Component | Purpose | File(s) | Input | Output |
|-----------|---------|---------|-------|--------|
| **decompressPoints** | Decompress backend data | apis/points-compressed.ts | CompressedPointsResponse | Map<metricName, AggregatedPoint[]> |
| **createCompressedDataIndex** | Index for O(1) lookup | apis/points-compressed.ts | CompressedPointsResponse | CompressedDataIndex |
| **calculateQueryTimeWindow** | Time range calculator | config/aggregation.ts | AggregationLevel | {startTime, endTime} |
| **WebSocketClient** | Real-time connection | apis/websocket.ts | URL | Subscription callbacks |
| **Dashboard** | Main container | routes/dashboard.tsx | DatasourceRecord | Renders MetricCharts |
| **MetricChartsGrid** | Responsive grid layout | charts/metric-charts-grid.tsx | MetricConfig[], AggregatedPoint[] | Rendered grid |
| **MetricChartWithLegend** | Single metric chart | charts/metric-chart.tsx | AggregatedPoint[], MetricConfig | Chart + legend |

### 2.3 Frontend Aggregation Configuration

```typescript
// Frontend expects these 6 levels (must match backend):
AGGREGATION_LEVELS = [
  {
    name: '15s',
    interval: 15000,
    retention: 1 * 60 * 60 * 1000,        // 1 hour
    displayLabel: '15s aggregation',
    refreshInterval: 3000,                 // Poll every 3 seconds
  },
  {
    name: '1m',
    interval: 60000,
    retention: 6 * 60 * 60 * 1000,        // 6 hours
    displayLabel: '1 minute aggregation',
    refreshInterval: 10000,                // Poll every 10 seconds
  },
  // ... 4 more levels (5m, 30m, 1h, 6h)
];

// CRITICAL: QUERY_DELAY_MS = 60000 (60 seconds)
// Reason: Backend needs 60s to complete aggregation
// If frontend queries too soon, data will be incomplete
```

### 2.4 Performance Optimization Patterns

```typescript
// Pattern 1: Index-based decompression
const index = createCompressedDataIndex(data);
const points = getPointsFromIndex(data, index, metricName);  // O(1)

// Pattern 2: Pre-compute all aggregation types at once
const allMetricsDataByAggType = useMemo(() => {
  const byAggType = new Map<AggType, Map<string, AggPoint[]>>();
  for (let agg = 0; agg < 8; agg++) {
    // Pre-compute each aggregation type
    byAggType.set(agg, filterPointsByAggType(pointsByMetric, agg));
  }
  return byAggType;
}, [pointsByMetric]);

// Pattern 3: O(1) aggregation type switching
const metricsData = useMemo(() => {
  return allMetricsDataByAggType.get(selectedLevel.aggType) || new Map();
}, [allMetricsDataByAggType, selectedLevel.aggType]);

// Pattern 4: Virtual scrolling legend
const rowVirtualizer = useVirtualizer({
  count: displaySeries.length,
  estimateSize: () => 32,
  overscan: 5,
});

// Pattern 5: Custom React.memo comparison
const areChartPropsEqual = (prev, next) => {
  // Deep comparison of data without shallow comparison overhead
};
export const MemoChart = React.memo(MetricChart, areChartPropsEqual);
```

---

## Part 3: Integration Points

### 3.1 Backend → Frontend Contract

**HTTP API Endpoints** (Backend provides):

```bash
# Query compressed points
GET /metrics/query?metrics=cpu_usage,memory_usage&agg_level=1m&start_time=...&end_time=...

Response: CompressedPointsResponse {
  k: ["cpu_usage{host=server1}", "memory_usage{host=server1}"],
  v: [[[timestamp, value], ...], ...]  // 3D array
}

# Get datasource config
GET /datasources/{datasourceId}

Response: DatasourceRecord {
  id: string,
  name: string,
  groups: [
    {
      name: "System",
      metrics: [
        {
          name: "cpu_usage",
          alias: "CPU Usage",
          unit: "%",
          column_span: 1,
          display_labels: ["host", "cpu"]
        }
      ]
    }
  ]
}

# WebSocket: Real-time status
WS /ws

Subscribe to: datasources:{datasourceId}:status
Broadcast: {
  datasource_id: "abc123",
  status: "UP" | "DOWN",
  address_status: { "host:port": { status, error } }
}
```

### 3.2 Frontend → Backend Expectations

**Frontend sends queries expecting:**

1. **Aggregation levels must match** (6 levels: 15s, 1m, 5m, 30m, 1h, 6h)
2. **Time windows based on retention** (e.g., 1h for 15s level, 6h for 1m level)
3. **CompressedPointsResponse format** (3D array with indices for aggTypes)
4. **Labels in Prometheus format** (e.g., `{host=server1,region=us-east}`)
5. **Query delay** (60 seconds buffer for aggregation completion)

---

## Part 4: Sonar View Implementation Strategy

### 4.1 Implementation Phases

#### Phase 1: Foundational Data Layer (High Priority)
**Goal**: Establish data decompression and backend communication
**Effort**: 2-3 days
**Deliverables**: Can fetch and decompress raw data from backend

- [ ] `apis/points-compressed.ts`: decompressPoints, createCompressedDataIndex, getPointsFromIndex
- [ ] `apis/websocket.ts`: WebSocketClient with auto-reconnect and heartbeat
- [ ] `config/aggregation.ts`: AGGREGATION_LEVELS, calculateQueryTimeWindow
- [ ] `apis/datasource.ts`: DatasourceRecord, MetricConfig interfaces
- [ ] Unit tests for decompression logic

**Dependencies**: sonar-store backend must provide `/metrics/query` endpoint

#### Phase 2: Core UI Components (Medium Priority)
**Goal**: Render charts and implement user interactions
**Effort**: 3-4 days
**Deliverables**: Dashboard with functional chart grid and legend

- [ ] `routes/dashboard.tsx`: Main dashboard container
  - State management (selectedLevel, datasourceStatus, pointsByMetric)
  - HTTP polling at level-specific intervals
  - WebSocket subscription for status updates
  - Toolbar for level/legend/grid controls
- [ ] `charts/metric-charts-grid.tsx`: Responsive grid layout
  - Column span logic (1-3 cols)
  - shouldSpanFullRow calculation
  - MetricChartWithLegend integration
- [ ] `charts/metric-chart.tsx`: Individual metric rendering
  - Chart component (Recharts or similar)
  - Series grouping by labels
  - Basic legend

**Dependencies**: Phase 1 completed

#### Phase 3: Performance & Polish (Medium Priority)
**Goal**: Optimize rendering and add advanced features
**Effort**: 2-3 days
**Deliverables**: Production-ready performance, smooth interactions

- [ ] Virtual scrolling legend (@tanstack/react-virtual)
- [ ] Series interactions: single-click toggle, double-click solo
- [ ] Color caching per series
- [ ] Custom React.memo comparisons
- [ ] useTransition for non-blocking updates
- [ ] Loading states and error handling

**Dependencies**: Phase 2 completed

#### Phase 4: Testing & Documentation (Low Priority)
**Goal**: Ensure reliability and maintainability
**Effort**: 1-2 days
**Deliverables**: Test coverage, deployment docs

- [ ] Unit tests (decompression, time window calculation)
- [ ] Integration tests (dashboard data flow)
- [ ] Mock WebSocket for testing
- [ ] Performance tests (100+ metrics)
- [ ] Deployment guide

**Dependencies**: Phase 3 completed

### 4.2 Multi-Datasource Adaptation (Main Sonar-View Difference)

**Monitor Hub**: Single datasource per dashboard
**Sonar View**: Multiple datasources per dashboard (scaling + federation)

**Implementation approach**:
```typescript
// Add datasource selection at routing level
interface DashboardPageProps {
  datasourceIds: string[];  // Array instead of single
}

// Dashboard component remains mostly same, but:
// 1. Wrap MetricChartsGrid in tabs (one per datasource)
// 2. WebSocket subscriptions: Loop over all datasourceIds
// 3. HTTP queries: Parallel fetch for all datasources

function DashboardPage({ datasourceIds }: DashboardPageProps) {
  return (
    <div>
      {datasourceIds.map(id => (
        <Tab key={id} label={id}>
          <Dashboard datasourceId={id} />  // Single-datasource component
        </Tab>
      ))}
    </div>
  );
}
```

**No changes needed in chart components** (they remain single-datasource focused)

---

## Part 5: Implementation Checklist

### Backend Prerequisites (Verify with sonar-store)

- [ ] `/metrics/query` endpoint returns CompressedPointsResponse
  - [ ] Format: `{k: [...], v: [[[...], ...], ...]}`
  - [ ] Supports `?agg_level=15s|1m|5m|30m|1h|6h`
  - [ ] Time window: `?start_time=...&end_time=...`
  - [ ] Optional filter: `?metrics=cpu_usage,memory_usage`

- [ ] Aggregation levels configured correctly
  - [ ] 15s: 1h retention, 3s refresh interval
  - [ ] 1m: 6h retention, 10s refresh interval
  - [ ] 5m: 1d retention, 30s refresh interval
  - [ ] 30m: 7d retention, 60s refresh interval
  - [ ] 1h: 30d retention, 5m refresh interval
  - [ ] 6h: 1yr retention, 30m refresh interval

- [ ] `/datasources/{id}` endpoint returns DatasourceRecord with groups/metrics config

- [ ] WebSocket endpoint at `/ws` supports topic-based subscription
  - [ ] Topic format: `datasources:{datasourceId}:status`
  - [ ] Broadcast on datasource/address UP/DOWN events

### Frontend Implementation (sonar-view)

#### Phase 1: Data Layer
- [ ] Implement `apis/points-compressed.ts`
  - [ ] decompressPoints function
  - [ ] createCompressedDataIndex function
  - [ ] getPointsFromIndex function
  - [ ] parseLabels utility
  - [ ] Unit tests

- [ ] Implement `apis/websocket.ts`
  - [ ] WebSocketClient class
  - [ ] Auto-reconnect (5 attempts, exponential backoff)
  - [ ] Heartbeat (ping/pong every 30s)
  - [ ] Subscription management
  - [ ] State machine (CONNECTING, CONNECTED, DISCONNECTED, RECONNECTING, CLOSED)

- [ ] Implement `config/aggregation.ts`
  - [ ] AGGREGATION_LEVELS array
  - [ ] calculateQueryTimeWindow function
  - [ ] QUERY_DELAY_MS = 60000
  - [ ] Utility functions (parseTimeToMs, formatRetentionLabel)

- [ ] Implement `apis/datasource.ts`
  - [ ] Interface definitions (DatasourceRecord, MetricConfig, DatasourceStatus)
  - [ ] setWebSocketClient function
  - [ ] subscribeDatasourceStatus function

#### Phase 2: UI Components
- [ ] Implement `routes/dashboard.tsx`
  - [ ] State management (selectedLevel, legendVisible, gridCols, etc.)
  - [ ] HTTP polling with level-specific intervals
  - [ ] WebSocket initialization and subscription
  - [ ] Toolbar for controls

- [ ] Implement `charts/metric-charts-grid.tsx`
  - [ ] shouldSpanFullRow layout algorithm
  - [ ] CSS grid implementation
  - [ ] MetricChartWithLegend integration
  - [ ] Series truncation (max 30) with warning

- [ ] Implement `charts/metric-chart.tsx`
  - [ ] Chart rendering (Recharts recommended)
  - [ ] Series grouping by labels
  - [ ] Legend interactions

#### Phase 3: Optimization
- [ ] Virtual scrolling legend (@tanstack/react-virtual)
- [ ] Color caching per series
- [ ] useMemo for memoization layers
- [ ] Custom React.memo comparisons
- [ ] useTransition for non-blocking updates
- [ ] Error handling and retry logic

#### Phase 4: Testing
- [ ] Unit tests for decompression
- [ ] Integration tests for dashboard
- [ ] Mock WebSocket tests
- [ ] Performance tests (100+ metrics)

---

## Part 6: Key Learnings & Best Practices

### 6.1 What Works Well (Copy These Patterns)

1. **3D Array Compression**: Very efficient, enables O(1) aggregation type switching
2. **Index-Based Decompression**: Avoid linear iteration over metrics
3. **Pre-compute All Aggregation Types**: One pass at data layer, O(1) switches in UI
4. **Virtual Scrolling Legend**: Handles 30+ series without performance issues
5. **Level-Specific Refresh Intervals**: Adjusts poll frequency based on data freshness needs
6. **WebSocket for Status**: Separate channel for real-time updates, doesn't block HTTP polling

### 6.2 What to Improve (Sonar View Opportunities)

1. **Multi-Datasource Support**: Original limitation, now core requirement
2. **Configurable Series Limit**: Current max 30, make it configurable per metric
3. **Advanced Filtering**: Add metric name/label regex filters
4. **Offline Mode**: Cache recent data for offline viewing
5. **Export Functionality**: CSV/JSON/PNG export of charts
6. **Alert Integration**: WebSocket alerts for anomalies

### 6.3 Performance Targets

| Metric | Target | How Achieved |
|--------|--------|--------------|
| Dashboard load time | <2s | Index-based decompression |
| Aggregation type switch | <100ms | Pre-compute at data layer |
| Legend scroll (1000 items) | 60fps | Virtual scrolling |
| WebSocket reconnect | <5s | Exponential backoff |
| Memory usage (100 metrics) | <50MB | Data compression + truncation |

---

## Part 7: Risk Assessment & Mitigation

### 7.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Backend compression format differs | Medium | High | Validate format early, create test fixtures |
| QUERY_DELAY_MS value wrong | Medium | Medium | Test with live data, adjust based on metrics |
| WebSocket reconnect race condition | Low | High | Comprehensive testing with network interruptions |
| Legend scroll performance (1000+ series) | Low | Medium | Virtual scrolling, series truncation |
| Memory leak in WebSocket | Low | High | Proper cleanup in useEffect, testing with DevTools |

### 7.2 Schedule Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Backend API not ready | Medium | High | Coordinate with backend team, create mock API |
| Design changes mid-implementation | Low | Medium | Finalize designs before Phase 2 |
| Performance issues discovered late | Medium | High | Performance testing in Phase 3, not Phase 4 |

---

## Part 8: File Structure & Imports

```typescript
// sonar-view/site/src/
├── apis/
│   ├── points-compressed.ts       // Decompression logic
│   │   export: decompressPoints, createCompressedDataIndex, getPointsFromIndex
│   ├── websocket.ts               // Real-time connection
│   │   export: WebSocketClient, ConnectionState, WSMessage
│   └── datasource.ts              // Configuration and status
│       export: DatasourceRecord, MetricConfig, subscribeDatasourceStatus
│
├── config/
│   └── aggregation.ts             // Level configuration
│       export: AGGREGATION_LEVELS, calculateQueryTimeWindow, QUERY_DELAY_MS
│
├── components/
│   ├── routes/
│   │   └── dashboard.tsx          // Main container
│   │       export: Dashboard component
│   │
│   └── charts/
│       ├── metric-charts-grid.tsx // Grid layout
│       │   export: MetricChartsGrid, shouldSpanFullRow
│       │
│       └── metric-chart.tsx       // Single metric
│           export: MetricChartWithLegend, MemoizedMetricChart
│
└── __tests__/
    ├── apis/
    │   ├── points-compressed.test.ts
    │   ├── websocket.test.ts
    │   └── datasource.test.ts
    ├── config/
    │   └── aggregation.test.ts
    └── components/
        ├── dashboard.test.tsx
        └── metric-charts-grid.test.tsx
```

---

## Part 9: Success Criteria

### Phase 1 Complete When:
- [ ] Data decompression works with sample CompressedPointsResponse
- [ ] WebSocket auto-reconnect verified with network interruptions
- [ ] Unit tests pass with >90% coverage
- [ ] All type definitions match backend format

### Phase 2 Complete When:
- [ ] Dashboard displays charts for single datasource
- [ ] Level switching and HTTP polling works
- [ ] WebSocket status updates reflected in UI
- [ ] Visual layout matches design spec

### Phase 3 Complete When:
- [ ] Virtual legend scrolls smoothly with 100+ series
- [ ] Legend interactions (toggle/solo) work correctly
- [ ] No memory leaks (DevTools heap snapshot)
- [ ] Dashboard responds within 100ms to user interactions

### Phase 4 Complete When:
- [ ] Integration tests pass
- [ ] Performance tests meet targets
- [ ] Documentation complete
- [ ] Deployment guide written

---

## Part 10: References

**Backend Analysis**: `/Users/castlexu/github/sonar/docs/archive/agent-artifacts/MONITOR_HUB_BACKEND_ANALYSIS.md`
- Sections: 1. Aggregation labels, 2. QueryPoints, 3. Compression format, 4. Datasource, 5. Aggregation timing, 6. Sonar-view mapping

**Frontend Analysis**: `/Users/castlexu/github/sonar/docs/archive/agent-artifacts/MONITOR_HUB_FRONTEND_ANALYSIS.md`
- Sections: 1. Decompression, 2. Aggregation config, 3. Dashboard flow, 4. WebSocket, 5. MetricChartsGrid, 6. Optimizations, 7. Implementation checklist

**Source Code References**:
- Backend: `/Users/castlexu/github/sonar/.legacy/monitor_hub/biz/*/handler/`
- Frontend: `/Users/castlexu/github/sonar/.legacy/monitor_hub/site/src/`

---

**Document Complete**

This roadmap provides a comprehensive guide for implementing sonar-view frontend based on proven monitor_hub patterns. Success depends on:
1. Aligning backend/frontend on aggregation levels and compression format
2. Following the 4-phase implementation plan
3. Prioritizing performance optimizations in Phase 3
4. Comprehensive testing throughout all phases
