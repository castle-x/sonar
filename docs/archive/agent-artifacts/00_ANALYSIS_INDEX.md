# Sonar View Analysis Documents Index
## Quick Reference Guide for Frontend + Backend + Integration

**Created**: 2026-04-14
**Team**: analyst-1 (backend), analyst-2 (frontend)
**Status**: Coordination complete, ready for implementation

---

## Document Index

### 1. MONITOR_HUB_FRONTEND_ANALYSIS.md
**Author**: analyst-2
**Size**: 44KB | **Sections**: 11
**Key Purpose**: Complete frontend architecture patterns for direct copy to sonar-view

**Quick Navigation**:
- **Section 1.2**: DecompressPoints complete implementation (O(1) index lookup)
- **Section 2**: Aggregation levels config (6 levels: 15s, 1m, 5m, 30m, 1h, 6h)
- **Section 3**: Dashboard HTTP polling pipeline
- **Section 4**: WebSocketClient with auto-reconnect (5 attempts, 30s heartbeat)
- **Section 5**: MetricChartsGrid with column_span layout
- **Section 6**: Performance optimizations (memoization, virtual scrolling)
- **Section 7**: sonar-view implementation checklist (10 subsystems)
- **Appendix A**: Complete TypeScript type definitions

**Use When**:
- Implementing frontend data decompression
- Setting up WebSocket real-time updates
- Building chart components
- Need complete code implementations

**Files to Copy From**:
```
.legacy/monitor_hub/site/src/
├── apis/points-compressed.ts       → sonar-view/site/src/apis/points-compressed.ts
├── apis/websocket.ts               → sonar-view/site/src/apis/websocket.ts
├── config/aggregation.ts           → sonar-view/site/src/config/aggregation.ts
├── apis/datasource.ts              → sonar-view/site/src/apis/datasource.ts
├── components/routes/dashboard.tsx → sonar-view/site/src/components/routes/dashboard.tsx
└── components/charts/metric-charts-grid.tsx → sonar-view/site/src/components/charts/metric-charts-grid.tsx
```

---

### 2. MONITOR_HUB_BACKEND_ANALYSIS.md
**Author**: analyst-1
**Size**: ~100KB | **Sections**: 6+
**Key Purpose**: Backend aggregation engine, TSDB queries, data compression format

**Quick Navigation**:
- **Section 1**: Aggregation labels structure (__name__, __aggregation_level__, __datasource_id__)
- **Section 2**: QueryPoints API implementation
- **Section 3**: PointsResponse compression format (3D array structure)
- **Section 4**: MongoDB datasource schema
- **Section 5**: Aggregation trigger timing (every 5s) and cascading (15s → 1m → 5m → ...)
- **Section 6**: sonar-view backend mapping

**Use When**:
- Understanding how backend compresses data
- Verifying sonar-store API contract
- Debugging data format issues
- Understanding aggregation levels and retention windows

**Key Constants to Match**:
```go
// Aggregation types (backend) must map to frontend indices
AggregationTypeAvg   = 0
AggregationTypeMin   = 1
AggregationTypeMax   = 2
AggregationTypeCount = 3
AggregationTypeLast  = 4

// OR in frontend (8 types):
AggregationType: last=0, avg=1, min=2, max=3, p50=4, p70=5, p90=6, p99=7
```

---

### 3. SONAR_VIEW_IMPLEMENTATION_ROADMAP.md
**Author**: analyst-2
**Size**: ~60KB | **Sections**: 10
**Key Purpose**: Unified blueprint combining frontend + backend + integration

**Quick Navigation**:
- **Section 1-2**: Backend/frontend architecture overview
- **Section 3**: Integration points and HTTP API contract
- **Section 4**: 4-phase implementation strategy
- **Section 5**: Multi-datasource adaptation (main sonar-view difference)
- **Section 6**: Complete implementation checklist
  - Backend prerequisites (5 items to verify)
  - Frontend Phase 1 (5 files, data layer)
  - Frontend Phase 2 (3 files, core UI)
  - Frontend Phase 3 (7 optimizations)
  - Frontend Phase 4 (5 test types)
- **Section 7**: Key learnings and best practices
- **Section 8**: Risk assessment with mitigations
- **Section 9**: Exact file structure and imports
- **Section 10**: Success criteria per phase

**Use When**:
- Planning implementation schedule (4-10 weeks total)
- Coordinating between frontend and backend teams
- Creating sprint tasks from phases
- Validating backend API readiness

**Phase Timeline**:
- Phase 1 (Data Layer): 2-3 days
- Phase 2 (Core UI): 3-4 days
- Phase 3 (Polish): 2-3 days
- Phase 4 (Testing): 1-2 days
- **Total: 9-14 days (2-3 weeks)**

---

## Quick Reference: What to Read First

### I'm implementing frontend...
**Start here**: SONAR_VIEW_IMPLEMENTATION_ROADMAP.md (Section 4: Implementation Strategy)
**Then read**: MONITOR_HUB_FRONTEND_ANALYSIS.md (relevant sections per phase)
**Reference**: Appendix A for TypeScript types

### I'm verifying backend API...
**Start here**: SONAR_VIEW_IMPLEMENTATION_ROADMAP.md (Section 3: Integration Points)
**Then read**: MONITOR_HUB_BACKEND_ANALYSIS.md (Section 2-3: QueryPoints & Compression)
**Checklist**: SONAR_VIEW_IMPLEMENTATION_ROADMAP.md (Section 6: Backend Prerequisites)

### I'm doing code review...
**Start here**: SONAR_VIEW_IMPLEMENTATION_ROADMAP.md (Section 10: Success Criteria)
**Reference**: MONITOR_HUB_FRONTEND_ANALYSIS.md (complete implementations)
**Check**: Performance targets in Section 6: Key Learnings

### I'm debugging data issues...
**Start here**: MONITOR_HUB_FRONTEND_ANALYSIS.md (Section 1: Data Decompression)
**Reference**: MONITOR_HUB_BACKEND_ANALYSIS.md (Section 3: Compression Format)
**Validate**: Appendix A types match actual API responses

---

## Critical Integration Points

### Backend Must Provide (to Frontend)

**1. HTTP API Endpoints**
```bash
GET /metrics/query?agg_level=1m&start_time=...&end_time=...
  → Returns: CompressedPointsResponse {k: [], v: [[[...]]]}

GET /datasources/{id}
  → Returns: DatasourceRecord {groups, metrics, ...}
```
See: SONAR_VIEW_IMPLEMENTATION_ROADMAP.md Section 3

**2. Aggregation Levels** (must match exactly)
```typescript
// Frontend expects these 6 levels with these intervals:
15s (1h retention), 1m (6h retention), 5m (1d retention),
30m (7d retention), 1h (30d retention), 6h (365d retention)
```
See: MONITOR_HUB_FRONTEND_ANALYSIS.md Section 2

**3. Compression Format**
```typescript
// 3D array: [aggType][metricIndex][pointIndex]
// Each point: {t: timestamp, v: value}
```
See: MONITOR_HUB_FRONTEND_ANALYSIS.md Section 1

**4. WebSocket Topics**
```
datasources:{datasourceId}:status
→ Emits: DatasourceStatus with address_status updates
```
See: MONITOR_HUB_FRONTEND_ANALYSIS.md Section 4

---

## Implementation Checklist Template

Copy this to track progress on sonar-view implementation:

```markdown
## Phase 1: Data Layer (2-3 days)
- [ ] apis/points-compressed.ts (decompression)
- [ ] apis/websocket.ts (real-time)
- [ ] config/aggregation.ts (levels config)
- [ ] apis/datasource.ts (interfaces)
- [ ] Unit tests (decompression logic)

## Phase 2: Core UI (3-4 days)
- [ ] routes/dashboard.tsx (main container)
- [ ] charts/metric-charts-grid.tsx (grid layout)
- [ ] charts/metric-chart.tsx (single metric)
- [ ] HTTP polling integration
- [ ] WebSocket subscription integration

## Phase 3: Optimization (2-3 days)
- [ ] Virtual scrolling legend
- [ ] Series interaction handlers
- [ ] Color caching
- [ ] React.memo optimizations
- [ ] Error handling

## Phase 4: Testing (1-2 days)
- [ ] Unit tests (data layer)
- [ ] Integration tests (dashboard)
- [ ] Performance tests
- [ ] Deployment documentation
```

---

## Performance Targets (to Validate)

| Metric | Target | How | Reference |
|--------|--------|-----|-----------|
| Dashboard load | <2s | Index-based decompression | Frontend Analysis §1 |
| Type switch | <100ms | Pre-compute all aggTypes | Frontend Analysis §6 |
| Legend scroll | 60fps | Virtual scrolling | Frontend Analysis §5 |
| WS reconnect | <5s | Exponential backoff | Frontend Analysis §4 |
| Memory (100 metrics) | <50MB | Compression + truncation | Frontend Analysis §6 |

See: SONAR_VIEW_IMPLEMENTATION_ROADMAP.md Section 7

---

## Communication & Coordination

### Between Teams

**Frontend → Backend**:
- Verify HTTP API endpoints match expected contract
- Confirm aggregation levels match configuration
- Validate compression format in test fixtures

**Backend → Frontend**:
- Provide API documentation with examples
- Share test data in CompressedPointsResponse format
- Notify of any level/retention changes

**Both Teams**:
- Use Section 3 (Integration Points) as single source of truth
- Weekly sync on schedule progress
- Early validation of API contract (mock implementation)

---

## Troubleshooting Guide

### "Data not decompressing correctly"
1. Check Section 1 of Frontend Analysis (parseLabels implementation)
2. Verify CompressedPointsResponse format matches Section 3 of Roadmap
3. Test with sample data from Backend Analysis

### "Aggregation types don't match"
1. Compare agg type indices in Frontend Analysis Appendix
2. Verify backend using Section 1 of Backend Analysis
3. Align on index mapping (avg=0, min=1, max=2, count=3, last=4)

### "WebSocket not connecting"
1. Check WebSocketClient implementation (Frontend Analysis Section 4)
2. Verify URL configuration (should include /ws endpoint)
3. Test manual connection with curl/wscat

### "Charts not rendering"
1. Verify decompression working (Frontend Analysis Section 1.2)
2. Check MetricConfig format (Frontend Analysis Appendix A)
3. Validate series count <30 (Frontend Analysis Section 5)

---

## Document Versions

| Document | Version | Date | Status |
|----------|---------|------|--------|
| MONITOR_HUB_FRONTEND_ANALYSIS.md | 1.0 | 2026-04-14 | ✅ Final |
| MONITOR_HUB_BACKEND_ANALYSIS.md | 1.0 | 2026-04-14 | ✅ Final |
| SONAR_VIEW_IMPLEMENTATION_ROADMAP.md | 1.0 | 2026-04-14 | ✅ Final |

---

## Related Tasks

- Task #1: ✅ COMPLETED - Monitor Hub Frontend Analysis
- Task #3: ✅ COMPLETED - Monitor Hub Backend Analysis
- Task #4: 🔄 IN_PROGRESS - Sonar View Gap Audit (analyst-1)
- Task #5: ⏳ PENDING - Gap Analysis Audit Completion
- Task #6: ⏳ PENDING - Frontend Implementation (Phase 1)
- Task #7: ⏳ PENDING - Frontend Implementation (Phase 2-4)

---

**How to Use This Index**

1. **First Time**: Read this document top to bottom
2. **During Implementation**: Use "Quick Reference" sections
3. **During Review**: Jump to relevant sections in linked documents
4. **For Debugging**: Use "Troubleshooting Guide"
5. **To Track Progress**: Use "Implementation Checklist Template"

All three analysis documents are in:
`/Users/castlexu/github/sonar/docs/archive/agent-artifacts/`

**Total Documentation**: ~200KB of reference material
**Coverage**: Frontend, backend, integration, implementation, testing
**Ready For**: Immediate implementation or code review
