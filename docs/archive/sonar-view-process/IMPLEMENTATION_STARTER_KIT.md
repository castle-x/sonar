# Sonar-View Implementation Starter Kit - Integration Guide

**Date:** 2026-04-15  
**Purpose:** Step-by-step guide to integrate new components into existing sonar-view  
**Scope:** Critical gap-filling tasks (Week 1)

---

## Quick Start Checklist

Files created in this kit:
- ✅ `shared/lib/label-utils.ts` - Label processing utilities
- ✅ `shared/lib/chart-utils.ts` - Chart formatting utilities
- ✅ `shared/hooks/use-chart-colors.ts` - Color generation hook
- ✅ `shared/hooks/use-y-axis-width.ts` - Y-axis width calculation hook
- ✅ `views/monitor/components/label-selector.tsx` - Label selector UI
- ✅ `views/monitor/components/label-selector-button.tsx` - Label selector button + dialog
- ✅ `views/monitor/components/metric-charts-grid-enhanced.tsx` - Enhanced grid with legend interaction

**Integration steps below.**

---

## Step 1: Copy Utility Files (No Changes Needed)

These files are ready to use as-is:

### 1.1 Label Utilities
```bash
# Destination: sonar-view/site/src/shared/lib/label-utils.ts
# Status: READY TO USE ✅
```

**Functions provided:**
- `extractAvailableLabels(points)` - Find all label keys/values in data
- `filterPointsByLabels(points, selectedLabels)` - Filter data by label conditions
- `generateSeriesKey(metricName, labels)` - Create stable series identifiers
- `groupByTimeSeries(points)` - Group points by series
- `formatSeriesLabel(key, maxLength)` - Format for display
- `getLabelDistribution(labels)` - Count label cardinality
- `getSuggestedLabelOrder(labels)` - Prioritize label display order
- `matchesLabelPattern(value, pattern)` - Pattern matching for filters

**Usage example:**
```typescript
import { extractAvailableLabels, filterPointsByLabels } from "@/shared/lib/label-utils";

// In a React component:
const availableLabels = useMemo(
  () => extractAvailableLabels(data),
  [data]
);

const filtered = useMemo(
  () => filterPointsByLabels(data, selectedLabels),
  [data, selectedLabels]
);
```

### 1.2 Chart Utilities
```bash
# Destination: sonar-view/site/src/shared/lib/chart-utils.ts
# Status: READY TO USE ✅
```

**Functions provided:**
- Time formatting: `formatShortTime()`, `formatShortDateTime()`, `formatFullDateTime()`
- Value formatting: `formatValue()`, `formatBytes()`, `formatPercentage()`, `formatSmartNumber()`
- Data processing: `filterDataByTime()`, `downsampleData()`, `fillMissingTimePoints()`
- Math: `applyTransform()`, `calculateTimeTicks()`

**Usage example:**
```typescript
import { formatValue, formatShortTime } from "@/shared/lib/chart-utils";

// In template:
<p className="text-2xl font-bold">
  {formatValue(latestPoint.value)}
</p>
<span className="text-xs text-muted-foreground">
  {formatShortTime(latestPoint.timestamp)}
</span>
```

---

## Step 2: Copy Hook Files (No Changes Needed)

### 2.1 Chart Colors Hook
```bash
# Destination: sonar-view/site/src/shared/hooks/use-chart-colors.ts
# Status: READY TO USE ✅
```

**Exports:**
- `useChartColors(count: number): string[]` - Generate N distinct HSL colors
- `getSeriesColorFromKey(key: string): string` - Deterministic color from string

**Usage example:**
```typescript
import { useChartColors, getSeriesColorFromKey } from "@/shared/hooks/use-chart-colors";

function MyChart() {
  const colors = useChartColors(5); // ["hsl(0, 45%, 60%)", "hsl(72, 45%, 60%)", ...]
  
  const seriesColor = getSeriesColorFromKey("instance=host-1");
  // Always returns same color for same key (deterministic)
}
```

### 2.2 Y-Axis Width Hook
```bash
# Destination: sonar-view/site/src/shared/hooks/use-y-axis-width.ts
# Status: READY TO USE ✅
```

**Exports:**
- `useYAxisWidth(maxValue: number, unit?: string): number`

**Usage example:**
```typescript
import { useYAxisWidth } from "@/shared/hooks/use-y-axis-width";

function MyChart({ maxValue }) {
  const yAxisWidth = useYAxisWidth(maxValue, "ms");
  // Returns 40-80px dynamically
  
  return (
    <YAxis width={yAxisWidth} />
  );
}
```

---

## Step 3: Add Label Selector Components

These components need to be placed in the existing monitor view.

### 3.1 Label Selector Component
```bash
# Destination: sonar-view/site/src/views/monitor/components/label-selector.tsx
# Status: READY TO USE ✅
# Dependencies:
#   - @/shared/shadcn/checkbox (should exist)
#   - label-utils (created above)
```

**Component API:**
```typescript
interface LabelSelectorProps {
  data: AggregatedPoint[];
  selectedLabels: Record<string, string[]>;
  onSelectionChange: (selectedLabels: Record<string, string[]>) => void;
}

<LabelSelector
  data={allMetricPoints}
  selectedLabels={selectedLabels}
  onSelectionChange={setSelectedLabels}
/>
```

### 3.2 Label Selector Button
```bash
# Destination: sonar-view/site/src/views/monitor/components/label-selector-button.tsx
# Status: READY TO USE ✅
# Dependencies:
#   - lucide-react (Filter icon)
#   - @/shared/shadcn/button, dialog
#   - label-selector.tsx (created above)
```

**Component API:**
```typescript
interface LabelSelectorButtonProps {
  data: AggregatedPoint[];
  selectedLabels: Record<string, string[]>;
  onSelectionChange: (selectedLabels: Record<string, string[]>) => void;
}

<LabelSelectorButton
  data={allMetricPoints}
  selectedLabels={selectedLabels}
  onSelectionChange={setSelectedLabels}
/>
```

---

## Step 4: Enhance Metric Charts Grid

Two options:

### Option A: Use Enhanced Version (Recommended)

Replace the existing `metric-charts-grid.tsx` with the enhanced version OR create side-by-side and gradually migrate.

```bash
# Create: sonar-view/site/src/views/monitor/components/metric-charts-grid-enhanced.tsx
# Status: READY TO USE ✅ (with new features)

# Key improvements:
# ✅ Legend interaction (toggle visibility, solo mode)
# ✅ Data truncation to 30 series max
# ✅ Y-axis width calculation
# ✅ Performance memoization (areChartPropsEqual)
# ✅ Label-based filtering integration
```

**Component API (enhanced):**
```typescript
interface MetricChartsGridProps {
  data: Map<string, AggregatedPoint[]>;
  legendVisible: boolean;
  gridCols: 1 | 2;
  selectedLabels?: Record<string, string[]>; // ← NEW
}

<MetricChartsGrid
  data={chartData}
  legendVisible={legendVisible}
  gridCols={gridCols}
  selectedLabels={selectedLabels}  // Pass selected filters
/>
```

### Option B: Gradual Enhancement (Lower Risk)

Keep existing `metric-charts-grid.tsx` and add features incrementally:

```typescript
// 1. Add selectedLabels prop to existing component
// 2. Filter data in useMemo
// 3. Add legend interaction handlers
// 4. Add data truncation logic
// 5. Add memoization
```

**Recommended:** Start with Option A (cleaner), then backport patterns to existing component if needed.

---

## Step 5: Update Monitor Page (`views/monitor/index.tsx`)

Current page structure needs enhancement to support label filtering.

### Changes to Make:

```typescript
// BEFORE: views/monitor/index.tsx
export function MonitorPage() {
  // ... existing code ...
  
  return (
    <MetricChartsGrid
      data={chartData}
      legendVisible={legendVisible}
      gridCols={gridCols}
      // ← Missing: label filtering
    />
  );
}

// AFTER: Add label filtering state
export function MonitorPage() {
  const [selectedLabels, setSelectedLabels] = useState<Record<string, string[]>>({});
  
  // ... existing code ...
  
  return (
    <div className="flex flex-col gap-4 ...">
      {/* Toolbar: add label selector button */}
      <div className="flex flex-wrap items-center gap-3">
        <GranularitySelector ... />
        
        {/* NEW: Label selector button */}
        <LabelSelectorButton
          data={Array.from(chartData.values()).flat()}
          selectedLabels={selectedLabels}
          onSelectionChange={setSelectedLabels}
        />
        
        {/* ... existing controls ... */}
      </div>
      
      {/* Charts grid: pass selected labels */}
      <MetricChartsGrid
        data={chartData}
        legendVisible={legendVisible}
        gridCols={gridCols}
        selectedLabels={selectedLabels}  // ← NEW
      />
    </div>
  );
}
```

### Full Updated Monitor Page Template:

```typescript
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, Columns2, RefreshCw } from "lucide-react";
import { useStoreConfigs, useActivateStoreConfig } from "@/shared/hooks/use-view-api";
import { useMonitorStore } from "@/stores/use-monitor-store";
import { MonitorSidebar } from "./components/monitor-sidebar";
import { GranularitySelector } from "./components/granularity-selector";
import { MetricChartsGrid } from "./components/metric-charts-grid-enhanced"; // ← Use enhanced version
import { LabelSelectorButton } from "./components/label-selector-button"; // ← NEW
import { Button } from "@/shared/shadcn/button";
import { queryPoints } from "@/lib/points-api";
import {
  createCompressedDataIndex,
  getPointsFromIndex,
} from "@/lib/points-compressed";
import type { AggregatedPoint } from "@/lib/points-compressed";
import { GRANULARITY_CONFIG } from "@/lib/granularity-config";

export function MonitorPage() {
  const { data: storeConfigs = [], isLoading } = useStoreConfigs();
  const { mutate: activateStore, isPending: isActivating } = useActivateStoreConfig();

  const activeStore = storeConfigs.find((s) => s.is_active) ?? storeConfigs[0];

  const { granularity, setGranularity, legendVisible, gridCols, toggleGridCols } =
    useMonitorStore();

  // ← NEW: Label filtering state
  const [selectedLabels, setSelectedLabels] = useState<Record<string, string[]>>({});

  const levelCfg = GRANULARITY_CONFIG[granularity];

  const {
    data: compressedIndex,
    dataUpdatedAt,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["points", activeStore?.id, granularity] as const,
    queryFn: async () => {
      const endTime = Date.now() - 40_000;
      const startTime = endTime - levelCfg.queryWindowMs;
      const resp = await queryPoints({
        datasource_id: activeStore!.id,
        levels: [granularity],
        start_time: startTime,
        end_time: endTime,
      });
      return createCompressedDataIndex(resp.p, activeStore!.id, granularity);
    },
    refetchInterval: levelCfg.refreshIntervalMs,
    enabled: Boolean(activeStore?.id),
    placeholderData: (prev) => prev,
  });

  const chartData = useMemo<Map<string, AggregatedPoint[]>>(() => {
    if (!compressedIndex) return new Map();

    const result = new Map<string, AggregatedPoint[]>();
    for (const metricName of compressedIndex.metricToIndices.keys()) {
      const allPoints = getPointsFromIndex(compressedIndex, metricName);
      const avgPoints = allPoints
        .filter((p) => p.aggregation_type === "avg")
        .sort((a, b) => a.timestamp - b.timestamp);

      if (avgPoints.length > 0) {
        result.set(metricName, avgPoints);
      }
    }
    return result;
  }, [compressedIndex]);

  // ← NEW: Collect all points for label selector
  const allChartPoints = useMemo(
    () => Array.from(chartData.values()).flat(),
    [chartData]
  );

  return (
    <div className="flex h-full min-h-0">
      <MonitorSidebar
        stores={storeConfigs}
        isLoading={isLoading}
        activeStoreId={activeStore?.id ?? null}
        onActivate={(id) => activateStore(id)}
        isActivating={isActivating}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {!activeStore ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
              <span className="text-3xl">🖥</span>
            </div>
            <p className="font-semibold">暂无数据存储配置</p>
            <p className="text-sm text-muted-foreground">
              请先在设置页面添加 Store 配置
            </p>
          </div>
        ) : (
          <motion.div
            key={activeStore.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col gap-4 px-4 py-4 lg:px-6"
          >
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              <GranularitySelector
                value={granularity}
                onChange={setGranularity}
              />

              {/* ← NEW: Label selector button */}
              {allChartPoints.length > 0 && (
                <LabelSelectorButton
                  data={allChartPoints}
                  selectedLabels={selectedLabels}
                  onSelectionChange={setSelectedLabels}
                />
              )}

              <span className="text-sm text-muted-foreground">
                当前数据源:{" "}
                <span className="font-medium text-foreground">
                  {activeStore.name}
                </span>
                {activeStore.is_active && (
                  <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    Active
                  </span>
                )}
              </span>

              <div className="ml-auto flex items-center gap-2">
                {dataUpdatedAt > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {isError ? (
                      <span className="text-destructive">获取失败</span>
                    ) : (
                      <>上次更新: {new Date(dataUpdatedAt).toLocaleTimeString()}</>
                    )}
                  </span>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => void refetch()}
                  disabled={isFetching}
                  title="手动刷新"
                >
                  <RefreshCw
                    className={isFetching ? "animate-spin" : ""}
                    size={14}
                  />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={toggleGridCols}
                  title={gridCols === 2 ? "切换为单列" : "切换为双列"}
                >
                  {gridCols === 2 ? <Columns2 size={14} /> : <LayoutGrid size={14} />}
                </Button>
              </div>
            </div>

            {/* Charts grid with enhanced features */}
            <MetricChartsGrid
              data={chartData}
              legendVisible={legendVisible}
              gridCols={gridCols}
              selectedLabels={selectedLabels}  {/* ← NEW: Pass selected filters */}
            />
          </motion.div>
        )}
      </div>
    </div>
  );
}
```

---

## Step 6: Verify Dependencies

Check that all required imports exist in your project:

```typescript
// Check these exist in sonar-view/site/src/shared/shadcn/:
import { Checkbox } from "@/shared/shadcn/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/shadcn/dialog";
import { Button } from "@/shared/shadcn/button";

// Check these packages in package.json:
// - recharts (for AreaChart, Area, XAxis, YAxis, etc.)
// - @tanstack/react-query (for useQuery)
// - @tanstack/react-virtual (if using virtual scrolling)
// - lucide-react (for icons: Filter, RefreshCw, etc.)
// - motion/react (for animations)
```

If any are missing, install:
```bash
cd sonar-view && npm install <package>
```

---

## Step 7: Testing Checklist

After integration, test these scenarios:

### 7.1 Label Selector
- [ ] Button appears in toolbar
- [ ] Badge shows count of selected filters
- [ ] Dialog opens on button click
- [ ] All label keys visible in dialog
- [ ] Can multi-select label values
- [ ] Selected tags appear in summary
- [ ] Clearing filters works
- [ ] Charts re-render with filtered data

### 7.2 Legend Interaction
- [ ] Single-click legend item hides/shows series
- [ ] Double-click shows only that series
- [ ] Visual feedback (opacity change)
- [ ] State persists during chart update

### 7.3 Data Truncation
- [ ] Only first 30 series displayed
- [ ] Warning badge shows if series hidden
- [ ] Charts remain performant (>50fps)

### 7.4 Performance
- [ ] 30+ series render without frame drops
- [ ] Scroll smooth in legend
- [ ] No unnecessary re-renders (check DevTools Profiler)

### 7.5 Integration
- [ ] Label filtering + legend interaction work together
- [ ] Granularity selector still works
- [ ] Store switching doesn't break state
- [ ] Data updates still work in real-time

---

## Troubleshooting

### Issue: "Cannot find module '@/shared/lib/label-utils'"
**Solution:** Ensure file was created at `sonar-view/site/src/shared/lib/label-utils.ts` with correct path alias setup in `vite.config.ts` or `tsconfig.json`.

### Issue: Legend click not working
**Solution:** Check that Recharts Legend has `onClick` and `onDoubleClick` event handlers passed correctly.

### Issue: Charts lag with 30+ series
**Solution:** Ensure `areChartPropsEqual` memo comparison is working. Check React DevTools Profiler for re-renders.

### Issue: Label selector shows no labels
**Solution:** Verify `extractAvailableLabels()` is receiving correct data structure (AggregatedPoint[] with labels field).

---

## Performance Notes

**Optimization strategies already built-in:**

1. **Memoization:** `SingleMetricChartMemo` uses custom comparison to avoid re-renders
2. **Data truncation:** Limited to 30 series per chart (recharts performance limit)
3. **Virtual scrolling:** Legend is static but future enhancement can add `@tanstack/react-virtual`
4. **Formatting:** All format functions cached in useMemo
5. **Y-axis sizing:** Dynamically calculated, cached in hook

**Monitor these in production:**

```typescript
// Add to chart component for profiling:
const startTime = performance.now();
// ... render ...
const endTime = performance.now();
console.log(`Chart render: ${endTime - startTime}ms`);
```

---

## Next Steps

After completing Week 1 tasks:

1. ✅ **Week 1:** Label selector, legend interaction, data truncation
2. 🔄 **Week 2:** Custom chart base components, additional chart types
3. 🔄 **Week 3:** Virtual scrolling, advanced utilities, documentation

---

**Status:** Kit complete and ready for implementation  
**Last Updated:** 2026-04-15  
**Questions?** Refer to CLAUDE.md project standards or MIGRATION_GUIDE_MONITOR_HUB_TO_SONAR_VIEW.md

