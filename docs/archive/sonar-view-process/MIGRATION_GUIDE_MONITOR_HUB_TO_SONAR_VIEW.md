# Migration Guide: monitor_hub Frontend → sonar-view Frontend

**Date:** 2026-04-15  
**Status:** Reference Implementation Plan  
**Source:** Legacy project at `.legacy/monitor_hub/site/src/`  
**Target:** New GVE project at `sonar-view/site/src/`

---

## Overview

The monitor_hub frontend contains highly optimized chart visualization, real-time data aggregation, and label-based filtering components that are **~90% directly copyable** to sonar-view. The key architectural difference is:

- **monitor_hub:** Single datasource, multi-metric aggregation at component level
- **sonar-view:** Multi-datasource (tap instances), aggregation at routing level

This guide documents:
1. Component dependency graph and migration order
2. Which files can be copied as-is vs. which need refactoring
3. Integration points for multi-datasource architecture
4. Performance patterns to preserve

---

## Part 1: Component Architecture & Dependencies

### Dependency Tree (Leaf → Root)

```
┌─────────────────────────────────────────────────────────────┐
│ View Layer: DashboardPage (dashboard.tsx)                   │
│   - Coordinates multiple metric charts with real-time data  │
└─────────────────┬───────────────────────────────────────────┘
                  │
        ┌─────────┴──────────┬─────────────────┐
        │                    │                 │
   ┌────▼──────┐      ┌──────▼────┐    ┌──────▼──────┐
   │ Charts    │      │ Selectors │    │ Data Mgmt   │
   │ Components│      │ & Filters │    │ (WebSocket) │
   └────┬──────┘      └──────┬────┘    └──────┬──────┘
        │                    │               │
        │ ┌──────────────────┼───────────────┤
        │ │                  │               │
   ┌────▼─┴────┐      ┌──────▼────────┐    │
   │ Chart Grid │      │ Label Selector│    │
   │ (Recharts) │      │ Components    │    │
   └────┬───────┘      └──────┬────────┘    │
        │                     │             │
        │ ┌───────────────────┴─┐           │
        │ │                     │           │
   ┌────▼─┴────┐      ┌────────▼────┐     │
   │ Chart Base │      │ Label Utils  │     │
   │ (styled)   │      │ (filters)    │     │
   └────┬───────┘      └─────────────┘     │
        │                                  │
   ┌────▼────────────────────────────────┬┘
   │ Utilities & Hooks                   │
   ├─────────────────────────────────────┤
   │ • chart-utils (data transform)      │
   │ • hooks (Y-axis, colors, theme)     │
   │ • index.css (Tailwind + theme)      │
   │ • metric-utils (aggregation types)  │
   └─────────────────────────────────────┘
```

### Import Map (Essential for Migration)

| Layer | File | Exports | Dependencies |
|-------|------|---------|--------------|
| **View** | `routes/dashboard.tsx` | `DashboardPage` | MetricChartsGrid, data hooks |
| **Grid** | `components/charts/metric-charts-grid.tsx` | `MetricChartsGrid`, `MetricChartWithLegend` | AreaChart, LabelSelectorButton, chart-base, label-utils |
| **Chart Base** | `components/charts/chart-base.tsx` | `ChartContainer`, `ChartTooltip`, `ChartLegend`, `createXAxis` | recharts, tailwind |
| **Chart Types** | `components/charts/{area,line,scatter}-chart.tsx` | `AreaChart`, `LineChart`, `ScatterChart` | chart-base, recharts, hooks |
| **Label Selector** | `components/charts/{label-selector,label-selector-button}.tsx` | `LabelSelector`, `LabelSelectorButton` | label-utils, dialog |
| **Utilities** | `components/charts/{utils,hooks,label-utils}.ts` | formatters, custom hooks, label processors | recharts, tailwind, date-fns |
| **Styling** | `index.css` | CSS variables, Tailwind theme | — |

---

## Part 2: Migration Strategy by Component

### Phase 1: Foundation (Copy As-Is)

**Estimated Effort:** 2-3 hours  
**Risk:** Low

#### 1.1 Utility Layer
Copy these files directly with minimal changes:

| File | Action | Changes | Reason |
|------|--------|---------|--------|
| `components/charts/utils.ts` | Copy | Import paths only | No business logic coupling |
| `components/charts/hooks.ts` | Copy | Import paths only | Pure UI utilities |
| `components/charts/label-utils.ts` | Copy | Import paths only | Pure data transformation |
| `lib/metric-utils.ts` | Copy | Import paths only | Format & export utilities |
| `index.css` | Copy | Theme colors (optional adjust) | Global styles, safe to reuse |

**Integration checklist:**
- [ ] Verify Tailwind config matches sonar-view (likely yes, GVE templates consistent)
- [ ] Check recharts version compatibility
- [ ] Confirm CSS variables applied correctly in browser DevTools

#### 1.2 Chart Base Components
Copy with minor structural adjustments:

```typescript
// Copy from: components/charts/chart-base.tsx
// Destination: components/charts/chart-base.tsx

// ✅ Can copy as-is:
export function ChartContainer() { ... }
export function ChartTooltip() { ... }
export function ChartLegend() { ... }
export function createXAxis() { ... }

// Verify imports:
// - recharts (should exist in sonar-view package.json)
// - tailwind (GVE standard)
```

### Phase 2: Chart Components (Copy with Minor Refactor)

**Estimated Effort:** 4-6 hours  
**Risk:** Medium (chart rendering behavior)

#### 2.1 AreaChart Component
```typescript
// Copy from: components/charts/area-chart.tsx
// Destination: components/charts/area-chart.tsx

// ✅ Direct copy, no refactoring needed
// Verify only:
// - Recharts <AreaChart>, <Area>, <ComposedChart> imports
// - useYAxisWidth hook availability
// - TypeScript props interfaces (AreaDataPoint, AreaChartProps)
```

**Behavior validation:** Create test fixture to render with sample data, verify:
- [ ] Area fill rendering (color + opacity)
- [ ] Stacking behavior (stackId)
- [ ] Smooth curve rendering (type="monotoneX")
- [ ] Tooltip appearance

#### 2.2 LineChart & ScatterChart
Same as AreaChart: direct copy, validate rendering.

---

### Phase 3: Label Selector (Direct Copy + Integration)

**Estimated Effort:** 2 hours  
**Risk:** Low

#### 3.1 Components
Copy directly:
- `components/charts/label-selector.tsx`
- `components/charts/label-selector-button.tsx`

No logic changes needed; these are pure UI components.

#### 3.2 Integration Point
In `sonar-view` dashboard page:

```typescript
// Before (monitor_hub): datasource known at component level
<LabelSelector 
  labels={availableLabels}          // derived from single datasource
  onSelectionChange={handleFilter}
/>

// After (sonar-view): datasource selected at routing level
// sonar-view architecture handles multi-datasource routing upstream,
// so label selector receives pre-filtered labels per datasource
<LabelSelector 
  labels={availableLabels}          // same signature!
  onSelectionChange={handleFilter}
/>
// No component-level changes needed!
```

---

### Phase 4: Metric Charts Grid (Direct Copy + Refactor)

**Estimated Effort:** 3-4 hours  
**Risk:** Medium (performance optimization patterns)

#### 4.1 Direct Copy Section
```typescript
// Copy from: components/charts/metric-charts-grid.tsx
// Destination: components/charts/metric-charts-grid.tsx

// ✅ These can stay as-is:
// - MetricChartWithLegend (wrapped component)
// - areChartPropsEqual (memoization logic)
// - legend interaction handlers (toggle visibility, solo mode)
// - column_span layout logic
```

#### 4.2 Refactoring Needed: Multi-Datasource Support

**Current (monitor_hub):**
```typescript
interface MetricChartsGridProps {
  metrics: MetricChart[]     // single-datasource metrics
}

// Internal filtering logic per chart
```

**Target (sonar-view):**
```typescript
interface MetricChartsGridProps {
  metrics: MetricChart[]            // still per-datasource
  datasourceId: string              // NEW: track which datasource
  aggregationLevel: AggregationLevel // NEW: 15s|30s|1m|5m|1h|6h|1d
}

// Optional future: support multi-datasource view
// interface MetricChartsGridProps {
//   metricsByDatasource: Map<string, MetricChart[]>
// }
```

**No function logic changes:** Keep the virtual scrolling, memoization, and legend interaction patterns.

---

### Phase 5: Dashboard Page (Refactor + Integration)

**Estimated Effort:** 6-8 hours  
**Risk:** High (architecture alignment)

#### 5.1 Current Structure (monitor_hub)
```typescript
// routes/dashboard.tsx
export function DashboardPage() {
  const [metrics, setMetrics] = useState<MetricChart[]>([])
  const [selectedLabels, setSelectedLabels] = useState({})
  
  // WebSocket listener (single datasource)
  useEffect(() => {
    ws.addEventListener('message', (evt) => {
      const newMetrics = parseUpdate(evt.data)
      setMetrics(prev => updateMetrics(prev, newMetrics))
    })
  }, [])
  
  return (
    <MetricChartsGrid metrics={metrics} />
  )
}
```

#### 5.2 Target Structure (sonar-view)

For sonar-view, the routing layer pre-selects datasource, so dashboard receives filtered metrics:

```typescript
// routes/monitor/[datasourceId].tsx  (or routing pattern in sonar-view)
export function DashboardPage({ datasourceId }: { datasourceId: string }) {
  const [metrics, setMetrics] = useState<MetricChart[]>([])
  const [aggregationLevel, setAggregationLevel] = useState<AggregationLevel>('1m')
  
  // WebSocket listener (receives pre-filtered metrics from store for this datasource)
  useEffect(() => {
    const ws = new WebSocket(`wss://store/ws/metrics/${datasourceId}?agg_level=${aggregationLevel}`)
    
    ws.addEventListener('message', (evt) => {
      const newMetrics = parseUpdate(evt.data)
      setMetrics(prev => updateMetrics(prev, newMetrics))
    })
    
    return () => ws.close()
  }, [datasourceId, aggregationLevel])
  
  return (
    <MetricChartsGrid 
      metrics={metrics}
      datasourceId={datasourceId}
      aggregationLevel={aggregationLevel}
    />
  )
}
```

**Key insight:** The dashboard page itself becomes simpler (not more complex) because multi-datasource routing is handled upstream by sonar-view's router, not by this component.

---

## Part 3: Performance Patterns to Preserve

### 🔥 Critical Performance Optimizations

#### 1. Legend Virtual Scrolling (MetricChartsGrid)

```typescript
// From metric-charts-grid.tsx
// Handles 30+ series efficiently by virtualization

const virtualizer = useVirtualizer({
  count: series.length,
  getScrollElement: () => containerRef.current,
  estimateSize: () => 32,
  overscan: 10,
})

// Legend items rendered only for visible range
return virtualItems.map(virtualItem => (
  <LegendItem key={series[virtualItem.index].id} {...} />
))
```

**Why preserve:** Without virtual scrolling, 30+ series legend items cause frame drops.

**Migration:** Copy verbatim; test with 30+ metric series.

#### 2. Data Truncation to 30 Series Max

```typescript
// From metric-charts-grid.tsx
const truncatedMetrics = metrics.slice(0, 30)  // Hard limit

// Why: Recharts rendering 30+ series causes canvas performance degradation
// Inform UI: show "3 more series not displayed" badge
```

**Migration:** Keep the 30-series limit; add UI indicator if more available.

#### 3. Memoization with Custom Comparison (areChartPropsEqual)

```typescript
// From metric-charts-grid.tsx
const areChartPropsEqual = (prevProps, nextProps) => {
  // Deep comparison only for data values, not object identity
  // Prevents re-renders when data hasn't actually changed
  return (
    prevProps.dataPoints.length === nextProps.dataPoints.length &&
    prevProps.series.id === nextProps.series.id &&
    // ... other critical fields
  )
}

const MemoizedChart = memo(MetricChartWithLegend, areChartPropsEqual)
```

**Why preserve:** Prevents cascading re-renders in large metric grids.

**Migration:** Copy the custom comparator; adapt if sonar-view data structure differs slightly.

#### 4. CSS Variables for Theme (index.css)

```css
/* From index.css */
:root {
  --chart-1: hsl(223, 97%, 63%);
  --chart-2: hsl(294, 99%, 57%);
  --chart-3: hsl(355, 99%, 59%);
  --chart-4: hsl(45, 95%, 55%);
  --chart-5: hsl(137, 89%, 40%);
}

/* Recharts overrides for consistent styling */
.recharts-tooltip {
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}
```

**Why preserve:** Establishes unified color system; enables dynamic theming.

**Migration:** Copy CSS; adjust HSL values if brand colors differ.

---

## Part 4: File Migration Checklist

### ✅ Copy As-Is (No Changes)

- [ ] `components/charts/utils.ts`
- [ ] `components/charts/hooks.ts`
- [ ] `components/charts/label-utils.ts`
- [ ] `lib/metric-utils.ts`
- [ ] `index.css`
- [ ] `components/charts/chart-base.tsx`
- [ ] `components/charts/area-chart.tsx`
- [ ] `components/charts/line-chart.tsx`
- [ ] `components/charts/scatter-chart.tsx`
- [ ] `components/charts/label-selector.tsx`
- [ ] `components/charts/label-selector-button.tsx`

### ⚙️ Copy + Minor Refactor

- [ ] `components/charts/metric-charts-grid.tsx`
  - Add `datasourceId` and `aggregationLevel` props
  - Update WebSocket message handling if needed
  - Verify memoization logic still applies

### 🔧 Rewrite (Architecture Alignment)

- [ ] `routes/dashboard.tsx` → `routes/monitor/[datasourceId].tsx` (or sonar-view routing pattern)
  - Adapt to receive `datasourceId` from routing layer
  - Connect to sonar-view WebSocket API (check sonar-store contract)
  - Implement aggregation level selector UI
  - No core dashboard logic changes needed; mostly router integration

---

## Part 5: Data Contract & API Integration

### WebSocket Message Format

**From monitor_hub (reference):**
```json
{
  "type": "metric_update",
  "timestamp": 1713191400000,
  "metrics": [
    {
      "id": "cpu_usage_0",
      "datasource_id": "machine-1",
      "metric_name": "node_cpu_usage",
      "labels": { "instance": "192.168.1.1", "job": "node" },
      "value": 45.2,
      "aggregation_level": "1m"
    }
  ]
}
```

**For sonar-view (target):**
- Check sonar-store API contract (Thrift IDL in `/api/sonar-store/metrics/v1/`)
- Likely similar structure; verify field names match
- Update TypeScript interfaces in dashboard component accordingly

### Data Transformation Pipeline

```
WebSocket Message
  ↓ (parseUpdate)
{ id, metric_name, labels, value, timestamp }
  ↓ (groupByTimeSeries via label-utils.ts)
Map<seriesKey, DataPoint[]>
  ↓ (AreaChart component)
Recharts format: { time: ..., [series1]: value, [series2]: value, ... }
  ↓ (Render)
Chart visualization
```

**No changes needed to this pipeline** — it's generic and works with any data source following the same structure.

---

## Part 6: Testing Strategy

### Unit Tests (Per Component)

1. **chart-base.tsx**
   - [ ] ChartContainer responsive styling
   - [ ] ChartTooltip formatting + item sorting
   - [ ] ChartLegend indicator colors
   - [ ] createXAxis tick generation

2. **utils.ts**
   - [ ] formatShortTime, formatShortDateTime, formatFullDateTime
   - [ ] formatValue, formatBytes, formatSmartNumber
   - [ ] filterDataByTime, downsampleData, fillMissingTimePoints

3. **hooks.ts**
   - [ ] useYAxisWidth with varying label text lengths
   - [ ] useChartColors generating distinct colors for N series
   - [ ] useChartTheme color variable application

4. **label-utils.ts**
   - [ ] extractAvailableLabels from mixed data
   - [ ] filterPointsByLabels with multiple conditions
   - [ ] generateSeriesKey uniqueness
   - [ ] groupByTimeSeries correctness

### Integration Tests

1. **MetricChartsGrid**
   - [ ] Render 5 metrics correctly
   - [ ] Render 30+ metrics with virtual scrolling
   - [ ] Legend toggle visibility
   - [ ] Legend solo mode (double-click)
   - [ ] Performance: frame rate >50fps with 30 series

2. **Dashboard Page (sonar-view)**
   - [ ] WebSocket connection to sonar-store
   - [ ] Receive metric updates
   - [ ] Charts re-render with new data
   - [ ] Aggregation level selector changes agg_level param
   - [ ] Datasource switch reconnects to different WebSocket

### E2E Tests

1. **Real data flow:**
   - [ ] sonar-tap → sonar-store → sonar-view WebSocket → charts visible
   - [ ] Multi-level aggregation (15s, 1m, 5m, 1h)
   - [ ] Label-based filtering works correctly
   - [ ] Export to CSV/clipboard from legend

---

## Part 7: Known Gotchas & Fixes

### Gotcha 1: Recharts TypeScript Types

**Issue:** Recharts v2.x has stricter TypeScript types; some monitor_hub code may use older patterns.

**Fix:**
```typescript
// If you see: "Type '{}' is not assignable to type 'T'"
// Solution: explicitly type data array
<AreaChart data={dataPoints as AreaDataPoint[]}>
```

### Gotcha 2: Y-Axis Width Calculation

**Issue:** `useYAxisWidth` reads DOM element dimensions during render.

**Fix:** Ensure the hook runs after first render:
```typescript
const yAxisWidth = useYAxisWidth(maxValue, unit)
// Returns initial estimate (50px) on first render, updates after DOM paint
```

### Gotcha 3: Tailwind Class Overrides

**Issue:** Recharts elements don't respect Tailwind classes; need manual CSS overrides.

**Fix:** Already handled in `index.css` and `chart-base.tsx`:
```css
/* index.css */
.recharts-tooltip {
  @apply bg-background border-border;  /* Tailwind classes as CSS */
}
```

### Gotcha 4: Virtual Scrolling Legend Scroll Position

**Issue:** Scrolling legend while data updates can cause scroll jumping.

**Fix:** Preserve scroll position in state:
```typescript
const [scrollOffset, setScrollOffset] = useState(0)
const virtualizer = useVirtualizer({
  ...options,
  initialOffset: scrollOffset,
  onChange: ({ offset }) => setScrollOffset(offset),
})
```

### Gotcha 5: Color Palette HSL Cycling

**Issue:** `useChartColors` generates colors in HSL space; adjacent colors may have similar hue.

**Fix:** Already handled by using spread hue distribution:
```typescript
const hues = Array.from({ length: count }, (_, i) => (i * 360) / count)
```

---

## Part 8: Implementation Timeline

### Week 1: Foundation & Charts
| Day | Task | Effort | Acceptance |
|-----|------|--------|-----------|
| Mon | Copy utility layer + chart-base | 2h | Imports resolve, TypeScript clean |
| Tue | Copy & test AreaChart, LineChart, ScatterChart | 3h | Charts render with sample data |
| Wed | Copy label selector components | 2h | Selector dialog opens, filters work |
| Thu | Copy metric-charts-grid + adapt for datasourceId | 4h | 30 series render, virtual scrolling smooth |

### Week 2: Dashboard Integration & Testing
| Day | Task | Effort | Acceptance |
|-----|------|--------|-----------|
| Mon | Rewrite dashboard.tsx for sonar-view routing | 4h | Page mounts, connects to store |
| Tue | Implement aggregation level selector UI | 2h | Level switch reconnects WebSocket |
| Wed | Unit tests for utilities & hooks | 4h | 100% test coverage, all pass |
| Thu | E2E test: full data flow tap→store→view | 6h | Charts display real metrics, label filter works |
| Fri | Performance tuning & documentation | 3h | Frame rate stable, README updated |

**Total estimated effort:** ~30 hours  
**Risk level:** Medium (mainly dashboard integration and sonar-store API contract alignment)

---

## Part 9: Sonar-View Architecture Alignment

### Key Differences from monitor_hub

1. **Multi-Datasource Routing**
   - monitor_hub: Single datasource per dashboard instance
   - sonar-view: Route parameter selects datasource (`/monitor/[datasourceId]`)
   - **Impact:** Dashboard receives datasourceId from route; no component changes needed

2. **WebSocket Subscription Model**
   - monitor_hub: Global WebSocket connection
   - sonar-view: Per-datasource connection with aggregation level param
   - **Impact:** Update useEffect in dashboard.tsx to subscribe to `ws://store/metrics/{datasourceId}?agg_level=1m`

3. **Aggregation Levels UI**
   - monitor_hub: Fixed aggregation in sonar-store, no UI selector
   - sonar-view: UI selector for 15s/30s/1m/5m/1h/6h/1d
   - **Impact:** Add <select> or <Tabs> component; re-subscribe on change

4. **Label-Based Filtering**
   - monitor_hub: Frontend filtering of series by labels
   - sonar-view: Can push to backend (sonar-store) or keep frontend filtering
   - **Recommendation:** Keep frontend filtering (already optimized), optional backend filter for large datasets

### Integration Points (To Verify)

1. **sonar-store WebSocket API** (Check `/api/sonar-store/metrics/v1/metrics.thrift`)
   - [ ] Message format matches `{ type, timestamp, metrics[] }`
   - [ ] Field names: `metric_name`, `labels`, `value`, `aggregation_level`
   - [ ] Supports query params: `agg_level`, `datasource_id`

2. **sonar-view Router**
   - [ ] Route pattern for datasource selection (e.g., `/monitor/:datasourceId`)
   - [ ] Route params passed as props to DashboardPage

3. **sonar-view API Context/Config**
   - [ ] Base URL for sonar-store (`REACT_APP_STORE_API_URL` or similar)
   - [ ] WebSocket URL (`wss://store` or configurable)

---

## Part 10: Rollback & Safety

### Incremental Deployment Strategy

1. **Phase 1 (Low Risk):** Deploy utilities + chart components (copy-as-is files)
   - Rollback: Remove files, no data migration needed
   - Validation: Unit tests pass

2. **Phase 2 (Medium Risk):** Deploy MetricChartsGrid with datasourceId prop
   - Rollback: Revert MetricChartsGrid.tsx, no breaking changes downstream
   - Validation: Integration tests pass, 30+ series performance verified

3. **Phase 3 (High Risk):** Deploy new DashboardPage with sonar-store integration
   - Rollback: Revert to old monitor_hub dashboard temporarily
   - Validation: E2E test with real tap data, verify label filter works

### Monitoring Post-Migration

```typescript
// Add observability hooks
useEffect(() => {
  console.log('Dashboard mounted for datasourceId:', datasourceId)
  console.log('WebSocket connected:', ws.readyState)
  
  return () => {
    console.log('Dashboard unmounted')
  }
}, [datasourceId])

// Monitor chart render performance
const startTime = performance.now()
// ... render
const endTime = performance.now()
console.log(`Chart render time: ${endTime - startTime}ms`)
```

---

## Summary & Next Steps

### Completed in This Document
✅ Dependency graph of all monitor_hub dashboard components  
✅ File-by-file migration instructions (copy vs. refactor vs. rewrite)  
✅ Performance patterns to preserve (virtual scrolling, memoization, CSS vars)  
✅ Data contract alignment for sonar-view architecture  
✅ Testing strategy and E2E validation  
✅ Implementation timeline (2 weeks, ~30 hours)  
✅ Known gotchas and fixes  

### Immediate Next Actions
1. **Verify sonar-store API contract** (check Thrift IDL for metrics WebSocket format)
2. **Confirm sonar-view router pattern** (how datasourceId routing works)
3. **Create sonar-view/site/src/components/charts/ directory** structure
4. **Begin Phase 1:** Copy utility layer files (utils.ts, hooks.ts, label-utils.ts)
5. **Run `gve ui add`** if new Tailwind components needed from GVE templates

---

## Appendix: Files Reference

### Source Files (Legacy monitor_hub)
- Root: `/Users/castlexu/github/sonar/.legacy/monitor_hub/site/src/`
- Charts: `components/charts/*.tsx`
- Utilities: `components/charts/utils.ts`, `hooks.ts`, `label-utils.ts`
- View: `routes/dashboard.tsx`
- Metrics: `lib/metric-utils.ts`
- Styling: `index.css`

### Destination Files (Target sonar-view)
- Root: `/Users/castlexu/github/sonar/sonar-view/site/src/`
- Charts: `components/charts/` (same structure)
- Utilities: Same paths
- View: `routes/monitor/[datasourceId].tsx` (adapt for sonar-view routing)
- Styling: Same path

---

**Document Status:** Ready for implementation  
**Last Updated:** 2026-04-15  
**Contact:** Refer to CLAUDE.md for development standards & GVE API conventions
