# Sonar-View Implementation Gap Analysis

**Date:** 2026-04-15  
**Status:** Current State Assessment  
**Scope:** Comparing current sonar-view monitor page vs. monitor_hub patterns for feature completeness

---

## Executive Summary

✅ **Good News:** Sonar-view already has a functional monitoring page structure in place (`views/monitor/`).

⚠️ **Gaps Identified:** The current implementation is ~40% feature-complete compared to monitor_hub. Key missing pieces:
1. Advanced chart components (LineChart, ScatterChart)
2. Label-based filtering and selector UI
3. Chart customization utilities (hooks, formatting)
4. Virtual scrolling for large datasets
5. Performance optimizations (memoization, data truncation)

✅ **Alignment:** Current architecture matches target multi-datasource routing at view level (datasource selected in sidebar).

---

## Part 1: Current sonar-view Implementation Status

### Existing Files (As of 2026-04-15)

| File | Status | Completeness | Key Exports |
|------|--------|--------------|------------|
| `views/monitor/index.tsx` | ✅ Exists | 70% | MonitorPage (main view) |
| `views/monitor/components/metric-charts-grid.tsx` | ✅ Exists | 60% | MetricChartsGrid, SingleMetricChart |
| `views/monitor/components/granularity-selector.tsx` | ✅ Exists | 100% | GranularitySelector |
| `views/monitor/components/monitor-sidebar.tsx` | ✅ Exists | Unknown | MonitorSidebar |
| `views/monitor/components/ws-status-badge.tsx` | ✅ Exists | Unknown | WSStatusBadge |
| `shared/shadcn/` | ✅ Exists | 90% | UI components (button, dialog, dropdown, etc.) |

### Existing Architecture Patterns

**✅ Implemented:**
- HTTP polling (React Query) with granularity-based refresh intervals
- Multi-level granularity selector (15s, 1m, 5m, 1h)
- Datasource selection via sidebar + active store management
- Grid layout with 1-col / 2-col toggle
- Area chart rendering with Recharts
- Basic chart formatting (time, values)
- Responsive container structure
- Error state handling (isError, isFetching)

**⚠️ Partial:**
- Chart grid: Uses simple AreaChart, lacks LineChart/ScatterChart variants
- Label rendering: Basic key-value pairs, no interactive selector
- Legend: Uses Recharts built-in legend, no custom interaction (toggle, solo mode)
- Color system: Deterministic HSL based on hash (not CSS variables)

**❌ Missing:**
- Virtual scrolling for legends
- Advanced label filtering UI (LabelSelector component)
- Label selector button with dialog
- Custom chart hooks (useYAxisWidth, useChartColors)
- Chart base components (custom ChartContainer, ChartTooltip, ChartLegend)
- Label utilities (extractAvailableLabels, filterPointsByLabels, etc.)
- Formatting utilities module
- Performance memoization (areChartPropsEqual)
- Data truncation to 30-series max
- Custom Y-axis width calculation
- Chart type variants (LineChart, ScatterChart)
- Floating toolbar for chart interactions

---

## Part 2: Feature Gap Comparison Matrix

### Chart Components

| Feature | monitor_hub | sonar-view | Gap | Priority |
|---------|-------------|-----------|-----|----------|
| **AreaChart** | ✅ Full featured | ⚠️ Basic | Custom Y-axis width, stacking, config | Med |
| **LineChart** | ✅ Implemented | ❌ Missing | Need to add | Low |
| **ScatterChart** | ✅ Implemented | ❌ Missing | Need to add | Low |
| **Chart Container** | ✅ Styled wrapper | ⚠️ Inline | No reusable base component | Med |
| **Custom Tooltip** | ✅ Formatted | ⚠️ Default Recharts | Item sorting, label formatting | Low |
| **Legend** | ✅ Interactive | ⚠️ Static | No toggle/solo mode, no virtual scroll | High |

### Data Processing & Utilities

| Feature | monitor_hub | sonar-view | Gap | Priority |
|---------|-------------|-----------|-----|----------|
| **Format functions** | ✅ Comprehensive | ⚠️ Basic | Missing formatBytes, formatPercentage, etc. | Low |
| **Label extraction** | ✅ extractAvailableLabels | ❌ Missing | No label discovery utility | Med |
| **Label filtering** | ✅ filterPointsByLabels | ❌ Missing | No label-based series filtering | High |
| **Series key generation** | ✅ generateSeriesKey | ⚠️ labelsToSeriesKey (hardcoded) | Utility exists inline | Low |
| **Time tick generation** | ✅ calculateTimeTicks | ❌ Missing | X-axis ticks calculated in component | Low |
| **Data downsampling** | ✅ downsampleData | ❌ Missing | No data reduction for large datasets | Low |

### UI Components & Interaction

| Feature | monitor_hub | sonar-view | Gap | Priority |
|---------|-------------|-----------|-----|----------|
| **Label Selector** | ✅ Full UI | ❌ Missing | Dialog-based selector not implemented | High |
| **Label Selector Button** | ✅ Badge + dialog | ❌ Missing | No button UI | High |
| **Granularity Selector** | ✅ Full UI | ✅ Full UI | Complete parity | — |
| **Store/Datasource Selector** | ✅ Sidebar | ✅ Sidebar | Equivalent implementation | — |
| **Floating Toolbar** | ✅ Implemented | ❌ Missing | Export, annotations, etc. | Low |
| **Legend Interaction** | ✅ Toggle + solo | ⚠️ Static | Built-in Recharts legend, not interactive | High |

### Performance Features

| Feature | monitor_hub | sonar-view | Gap | Priority |
|---------|-------------|-----------|-----|----------|
| **Virtual scrolling** | ✅ Legend items | ❌ Missing | Large legend performance issue | Med |
| **Data truncation** | ✅ Max 30 series | ❌ Missing | No limit → potential canvas perf degradation | Med |
| **Memoization** | ✅ areChartPropsEqual | ❌ Missing | Re-renders may cascade | Med |
| **Placeholder data** | ⚠️ Manual | ✅ Built-in | React Query placeholderData used | — |

### Theming & Styling

| Feature | monitor_hub | sonar-view | Gap | Priority |
|---------|-------------|-----------|-----|----------|
| **CSS variables** | ✅ --chart-1 to --chart-5 | ⚠️ Inline colors | No unified color system | Low |
| **Dark/light theme** | ✅ Full support | ⚠️ Inherited from app | Working but not explicit | — |
| **Recharts styling** | ✅ Custom overrides | ⚠️ Default | Some recharts elements unstyled | Low |

---

## Part 3: Priority-Based Migration Roadmap

### 🔴 Critical (Week 1)

These gaps directly impact production functionality and user experience:

#### 1.1 Label Filtering UI
**Current State:** No label selector UI  
**Impact:** Users cannot filter metrics by labels (e.g., show only metrics from instance X)  
**Gap:** Missing `LabelSelector` + `LabelSelectorButton` components  
**Effort:** 3-4 hours  
**Acceptance:**
- [ ] Dialog opens when button clicked
- [ ] Shows available label keys and values
- [ ] Multi-select of label filters
- [ ] Applies filters to visible metrics
- [ ] Button shows badge with selected count

#### 1.2 Legend Interaction (Toggle + Solo Mode)
**Current State:** Static legend from Recharts  
**Impact:** Users cannot toggle series on/off or isolate specific series  
**Gap:** Missing event handlers for legend click (toggle) and double-click (solo)  
**Effort:** 2-3 hours  
**Acceptance:**
- [ ] Single-click legend item hides/shows series
- [ ] Double-click shows only that series
- [ ] Visual feedback (opacity change)
- [ ] State persists during chart update

#### 1.3 Data Truncation & Large Dataset Handling
**Current State:** No limit on series displayed  
**Impact:** Charts with 30+ series cause frame drops and poor UX  
**Gap:** Need to implement max 30-series limit + "more data" indicator  
**Effort:** 1-2 hours  
**Acceptance:**
- [ ] Only first 30 series rendered
- [ ] UI shows "X more series not displayed"
- [ ] Frame rate >50fps with 30 series

### 🟡 High Priority (Week 1-2)

These gaps improve functionality but don't block core features:

#### 2.1 Custom Chart Hooks & Utilities
**Current State:** Utilities hardcoded in components  
**Gap:** Extract to reusable hooks/utils (useYAxisWidth, useChartColors, formatters)  
**Effort:** 3-4 hours  
**Files:** `shared/hooks/use-chart*.ts`, `shared/lib/chart-utils.ts`  
**Acceptance:**
- [ ] useYAxisWidth calculates axis width based on max value
- [ ] useChartColors generates N distinct colors
- [ ] useChartTheme provides CSS variables
- [ ] formatValue, formatTime, formatBytes work correctly

#### 2.2 Label Utilities Module
**Current State:** No label processing utilities  
**Gap:** Extract label logic to `shared/lib/label-utils.ts`  
**Effort:** 2-3 hours  
**Acceptance:**
- [ ] extractAvailableLabels from data points
- [ ] filterPointsByLabels filters data
- [ ] generateSeriesKey produces stable keys
- [ ] groupByTimeSeries groups correctly

#### 2.3 Chart Base Components
**Current State:** No reusable base components  
**Gap:** Create `ChartContainer`, `ChartTooltip`, `ChartLegend`, `createXAxis`  
**Effort:** 2-3 hours  
**Acceptance:**
- [ ] ChartContainer provides consistent styling
- [ ] ChartTooltip formats values + sorts items
- [ ] ChartLegend renders with indicators
- [ ] createXAxis generates X-axis config

#### 2.4 Performance Memoization
**Current State:** No custom comparison for memoization  
**Gap:** Implement areChartPropsEqual for memo optimization  
**Effort:** 1-2 hours  
**Acceptance:**
- [ ] Charts don't re-render on shallow data changes
- [ ] Memory usage stable with 30+ series
- [ ] Scroll performance smooth

### 🟢 Medium Priority (Week 2-3)

These enhance features but don't block MVP:

#### 3.1 Additional Chart Types
**Current State:** Only AreaChart implemented  
**Gap:** Add LineChart, ScatterChart components  
**Effort:** 2-3 hours each  
**Acceptance:**
- [ ] LineChart renders lines instead of areas
- [ ] ScatterChart renders points for sparse data
- [ ] Both support same data format as AreaChart

#### 3.2 Virtual Scrolling for Large Legends
**Current State:** All legend items rendered  
**Impact:** Performance degrades with 30+ series  
**Gap:** Implement `@tanstack/react-virtual` in legend  
**Effort:** 2-3 hours  
**Acceptance:**
- [ ] Only visible legend items in DOM
- [ ] Smooth scrolling
- [ ] Performance >60fps with 50+ series

#### 3.3 Advanced Formatting Utilities
**Current State:** Basic formatValue  
**Gap:** Add formatBytes, formatPercentage, formatSmartNumber, etc.  
**Effort:** 1-2 hours  
**Acceptance:**
- [ ] formatBytes: 1024 → "1.0 KB"
- [ ] formatPercentage: 0.45 → "45%"
- [ ] formatSmartNumber handles M, K, etc.

#### 3.4 Data Processing Pipeline
**Current State:** Basic time-sorting  
**Gap:** Add downsampleData, fillMissingTimePoints, filterDataByTime  
**Effort:** 2-3 hours  
**Acceptance:**
- [ ] downsampleData reduces point count
- [ ] fillMissingTimePoints adds zero values
- [ ] filterDataByTime window correctly

### 🔵 Low Priority (Post-MVP)

Nice-to-have enhancements:

#### 4.1 Floating Toolbar
**Current State:** No toolbar  
**Gap:** Add export (CSV/clipboard), annotations, zoom controls  
**Effort:** 4-5 hours  

#### 4.2 CSS Variable Theme System
**Current State:** Inline colors  
**Gap:** Migrate to CSS variables like monitor_hub  
**Effort:** 1-2 hours  

#### 4.3 X-Axis Tick Generation
**Current State:** Recharts auto-ticks  
**Gap:** Implement calculateTimeTicks for custom intervals  
**Effort:** 1-2 hours  

---

## Part 4: Detailed Gap-Filling Tasks

### Task 1: Implement Label Selector UI

**Files to Create:**
```
shared/hooks/
  ├── use-available-labels.ts          # Extract available label keys/values from data
  └── use-label-filter.ts              # Manage selected label filters

shared/lib/
  └── label-utils.ts                   # Label processing utilities

views/monitor/components/
  ├── label-selector.tsx               # Dialog content (table of label values)
  └── label-selector-button.tsx        # Button trigger + badge
```

**Dependencies:**
- `Dialog` from `shared/shadcn/dialog`
- Label utilities from `shared/lib/label-utils.ts` (to implement)

**Implementation Sketch:**

```typescript
// shared/lib/label-utils.ts
export function extractAvailableLabels(points: AggregatedPoint[]): Record<string, Set<string>> {
  const labels: Record<string, Set<string>> = {};
  for (const p of points) {
    for (const [k, v] of Object.entries(p.labels)) {
      if (!labels[k]) labels[k] = new Set();
      labels[k].add(v);
    }
  }
  return labels;
}

export function filterPointsByLabels(
  points: AggregatedPoint[],
  selectedLabels: Record<string, string[]>
): AggregatedPoint[] {
  return points.filter((p) => {
    for (const [k, values] of Object.entries(selectedLabels)) {
      if (!values.includes(p.labels[k])) return false;
    }
    return true;
  });
}

// views/monitor/components/label-selector.tsx
export function LabelSelector({ data, onFilter }: LabelSelectorProps) {
  const availableLabels = useMemo(() => extractAvailableLabels(data), [data]);
  const [selectedLabels, setSelectedLabels] = useState<Record<string, string[]>>({});
  
  const handleToggleLabel = (key: string, value: string) => {
    setSelectedLabels(prev => {
      const updated = { ...prev };
      if (!updated[key]) updated[key] = [];
      const idx = updated[key].indexOf(value);
      if (idx >= 0) {
        updated[key].splice(idx, 1);
        if (updated[key].length === 0) delete updated[key];
      } else {
        updated[key].push(value);
      }
      return updated;
    });
  };
  
  useEffect(() => {
    onFilter(selectedLabels);
  }, [selectedLabels]);
  
  return (
    <div className="space-y-4">
      {/* Render label keys and values as table */}
    </div>
  );
}
```

**Estimated Time:** 3-4 hours

---

### Task 2: Add Legend Interaction

**File to Modify:**
```
views/monitor/components/metric-charts-grid.tsx
```

**Changes:**
1. Add state to track visible series (by series key)
2. Add onClick handler to toggle visibility
3. Add onDoubleClick handler for solo mode
4. Apply visibility as strokeOpacity/fill opacity

**Implementation Sketch:**

```typescript
const [visibleSeries, setVisibleSeries] = useState<Set<string> | null>(null); // null = all visible

const handleLegendClick = (e: any) => {
  const key = e.dataKey;
  setVisibleSeries(prev => {
    if (prev === null) {
      // First toggle: hide this series
      const all = new Set(seriesKeys);
      all.delete(key);
      return all;
    } else if (prev.has(key)) {
      // Already hidden, show it
      prev.add(key);
      return prev.size === seriesKeys.length ? null : new Set(prev);
    } else {
      // Hidden, show it
      const updated = new Set(prev);
      updated.add(key);
      return updated.size === seriesKeys.length ? null : updated;
    }
  });
};

const handleLegendDoubleClick = (e: any) => {
  const key = e.dataKey;
  setVisibleSeries(new Set([key])); // Solo mode
};

// In AreaChart component:
<Area
  onClick={handleLegendClick}
  onDoubleClick={handleLegendDoubleClick}
  strokeOpacity={visibleSeries === null || visibleSeries.has(key) ? 1 : 0.1}
  fillOpacity={visibleSeries === null || visibleSeries.has(key) ? 0.3 : 0.01}
/>
```

**Estimated Time:** 2-3 hours

---

### Task 3: Data Truncation & UI Indicator

**File to Modify:**
```
views/monitor/components/metric-charts-grid.tsx
```

**Changes:**
1. Truncate seriesKeys to max 30
2. Show "X more series" badge
3. Add warning in chart header

**Implementation Sketch:**

```typescript
const MAX_SERIES = 30;
const truncatedSeriesKeys = seriesKeys.slice(0, MAX_SERIES);
const hiddenSeriesCount = seriesKeys.length - MAX_SERIES;

return (
  <div className="rounded-xl border bg-card p-4">
    <div className="mb-3 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{metricName}</p>
        {hiddenSeriesCount > 0 && (
          <p className="text-xs text-amber-600">
            ⚠️ {hiddenSeriesCount} series hidden (truncated to 30 max)
          </p>
        )}
      </div>
    </div>
    {/* Chart uses truncatedSeriesKeys instead of seriesKeys */}
  </div>
);
```

**Estimated Time:** 1-2 hours

---

### Task 4: Custom Chart Hooks

**Files to Create:**
```
shared/hooks/
  ├── use-y-axis-width.ts              # Calculate Y-axis width from max value
  ├── use-chart-colors.ts              # Generate N distinct HSL colors
  └── use-chart-theme.ts               # Access theme CSS variables
```

**Implementation Sketch:**

```typescript
// shared/hooks/use-y-axis-width.ts
export function useYAxisWidth(maxValue: number, unit?: string): number {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(50); // default
  
  useEffect(() => {
    const estimate = maxValue.toString().length * 8 + (unit?.length ?? 0) * 4;
    setWidth(Math.max(50, Math.min(estimate, 80)));
  }, [maxValue, unit]);
  
  return width;
}

// shared/hooks/use-chart-colors.ts
export function useChartColors(count: number): string[] {
  return useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const hue = (i * 360) / count;
      return `hsl(${hue}, 45%, 60%)`;
    });
  }, [count]);
}

// shared/hooks/use-chart-theme.ts
export function useChartTheme() {
  return {
    backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--background'),
    borderColor: getComputedStyle(document.documentElement).getPropertyValue('--border'),
    cardColor: getComputedStyle(document.documentElement).getPropertyValue('--card'),
  };
}
```

**Estimated Time:** 2-3 hours

---

### Task 5: Chart Base Components

**Files to Create:**
```
shared/components/
  └── charts/
      └── chart-base.tsx               # Reusable Recharts components
```

**Exports:**
- `ChartContainer(props, children)` - Responsive wrapper with styling
- `ChartTooltip(props)` - Custom tooltip with formatting
- `ChartLegend(props)` - Legend with indicators
- `createXAxis(config)` - Factory for X-axis configuration

**Estimated Time:** 2-3 hours

---

## Part 5: Implementation Checklist

### Week 1 (Critical)

- [ ] **Monday:** Task 1 - Label Selector UI
  - [ ] Create label-utils.ts
  - [ ] Create label-selector.tsx
  - [ ] Create label-selector-button.tsx
  - [ ] Test with sample data

- [ ] **Tuesday:** Task 2 - Legend Interaction
  - [ ] Add toggle/solo mode to MetricChartsGrid
  - [ ] Test visibility state
  - [ ] Verify performance

- [ ] **Wednesday:** Task 3 - Data Truncation
  - [ ] Add 30-series limit
  - [ ] Add warning badge
  - [ ] Test with large datasets

- [ ] **Thursday:** Task 4 - Chart Hooks
  - [ ] Create useYAxisWidth.ts
  - [ ] Create useChartColors.ts
  - [ ] Create useChartTheme.ts
  - [ ] Integrate into MetricChartsGrid

### Week 2 (High Priority)

- [ ] **Monday:** Task 5 - Chart Base Components
  - [ ] Create ChartContainer.tsx
  - [ ] Create ChartTooltip.tsx
  - [ ] Create ChartLegend.tsx
  - [ ] Create createXAxis utility

- [ ] **Tuesday:** Task 6 - Label Utilities (if not done in Task 1)
  - [ ] Create comprehensive label-utils.ts
  - [ ] Test all functions
  - [ ] Document API

- [ ] **Wednesday:** Performance Memoization
  - [ ] Implement areChartPropsEqual
  - [ ] Add React.memo to chart components
  - [ ] Benchmark before/after

- [ ] **Thursday:** Integration & Testing
  - [ ] Run E2E tests
  - [ ] Performance profiling
  - [ ] Fix any regressions

### Week 3 (Medium Priority)

- [ ] LineChart & ScatterChart components
- [ ] Virtual scrolling for legends
- [ ] Advanced formatting utilities
- [ ] Data processing pipeline (downsample, fillMissing, etc.)

---

## Part 6: Verification Criteria

### Feature Verification

| Feature | Criteria | Status |
|---------|----------|--------|
| **Label Selector** | Opens dialog, multi-select works, filters applied | ❌ Pending |
| **Legend Toggle** | Single-click hides/shows, double-click isolates | ❌ Pending |
| **Data Truncation** | Max 30 series, warning shown | ❌ Pending |
| **Custom Hooks** | Y-axis width, colors generated, theme accessed | ❌ Pending |
| **Chart Base** | Components export correctly, styling applied | ❌ Pending |

### Performance Verification

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Frame rate (30 series) | >50fps | Unknown | ❌ Pending |
| Legend scroll (50+ items) | >60fps | Unknown | ❌ Pending |
| Memory (5 min chart data) | <50MB | Unknown | ❌ Pending |
| Re-render prevention | <10% extra renders | Unknown | ❌ Pending |

### Test Coverage

| Test Type | Count | Status |
|-----------|-------|--------|
| Unit tests (hooks, utils) | 8-10 | ❌ Pending |
| Integration tests (components) | 4-6 | ❌ Pending |
| E2E tests (full flow) | 2-3 | ❌ Pending |

---

## Part 7: Risk Mitigation

### Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Legend click conflict with Recharts | High | Test native Recharts legend interaction first |
| Performance degradation with 30+ series | High | Implement virtual scrolling early, profile often |
| Label filter complexity | Medium | Start with simple single-label filter, expand later |
| Type safety in label utilities | Medium | Use strict TypeScript, create test fixtures |
| CSS variable not available | Low | Fallback to hardcoded colors if needed |

### Rollback Plan

**After each task completion:**
1. Tag current commit: `git tag sonar-view-gap-fix-taskN`
2. If issues found, revert: `git revert <commit>`
3. No breaking changes to existing APIs

---

## Summary

### Current State (2026-04-15)
- ✅ Core monitoring page functional (70% complete)
- ✅ HTTP polling + React Query integration
- ✅ Datasource selection + granularity levels
- ⚠️ Missing label filtering (HIGH priority)
- ⚠️ Missing legend interaction (HIGH priority)
- ⚠️ Performance not optimized (MEDIUM priority)

### After Gap Fixes (Target)
- ✅ All monitor_hub features available
- ✅ Label-based filtering working
- ✅ Interactive legend (toggle, solo mode)
- ✅ Performance optimized (30+ series, virtual scroll)
- ✅ Extensible for future chart types

### Estimated Total Effort
- **Week 1 (Critical):** ~8-10 hours
- **Week 2 (High):** ~8-10 hours
- **Week 3 (Medium):** ~6-8 hours
- **Total:** ~22-28 hours

**Next Action:** Start Week 1 tasks immediately; verify label-utils implementation with QA by EOD Monday.

---

**Document Status:** Ready for task assignment  
**Last Updated:** 2026-04-15  
**Owner:** sonar-view frontend team  
**Contact:** Refer to CLAUDE.md for development standards
