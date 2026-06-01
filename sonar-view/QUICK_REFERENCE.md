# Developer Quick Reference Guide

**Purpose:** Fast lookup for integrating the 7 production-ready files  
**Created:** 2026-04-15  
**For:** sonar-view development team

---

## 📍 File Locations

```
sonar-view/
├── DELIVERY_MANIFEST.md ← Start here for overview
├── site/src/
│   ├── INTEGRATION_SUMMARY.md ← Detailed integration guide
│   ├── shared/
│   │   ├── lib/
│   │   │   ├── label-utils.ts (155 lines)
│   │   │   └── chart-utils.ts (180 lines)
│   │   └── hooks/
│   │       ├── use-chart-colors.ts (42 lines)
│   │       └── use-y-axis-width.ts (30 lines)
│   └── views/monitor/components/
│       ├── label-selector.tsx (175 lines)
│       ├── label-selector-button.tsx (103 lines)
│       └── metric-charts-grid-enhanced.tsx (398 lines)
└── docs/archive/sonar-view-process/
    ├── README.md
    ├── IMPLEMENTATION_STARTER_KIT.md
    ├── IMPLEMENTATION_GAP_ANALYSIS.md
    ├── MIGRATION_GUIDE_MONITOR_HUB_TO_SONAR_VIEW.md
```

---

## 🔧 Import Examples

### Utilities - Label Processing
```typescript
import {
  extractAvailableLabels,
  filterPointsByLabels,
  generateSeriesKey,
  groupByTimeSeries,
  formatSeriesLabel,
  getLabelDistribution,
  getSuggestedLabelOrder,
  matchesLabelPattern,
} from "@/shared/lib/label-utils";

// Example usage
const available = extractAvailableLabels(data);
const filtered = filterPointsByLabels(data, { instance: ["192.168.1.1"] });
const key = generateSeriesKey("cpu_usage", { instance: "192.168.1.1" });
```

### Utilities - Chart Formatting
```typescript
import {
  formatShortTime,
  formatShortDateTime,
  formatFullDateTime,
  formatValue,
  formatBytes,
  formatPercentage,
  formatSmartNumber,
  calculateTimeTicks,
  filterDataByTime,
  downsampleData,
  fillMissingTimePoints,
  applyTransform,
} from "@/shared/lib/chart-utils";

// Example usage
const time = formatShortTime(Date.now()); // "14:30:45"
const bytes = formatBytes(1024000); // "1000.0 KB"
const ticks = calculateTimeTicks(start, end, 6); // [ts, ts, ts, ...]
```

### Hooks - Chart Colors
```typescript
import { useChartColors, getSeriesColorFromKey } from "@/shared/hooks/use-chart-colors";

// Example usage
const colors = useChartColors(5); // 5 distinct colors
const color = getSeriesColorFromKey("cpu_usage{instance=192.168.1.1}");
```

### Hooks - Y-Axis Width
```typescript
import { useYAxisWidth } from "@/shared/hooks/use-y-axis-width";

// Example usage
const width = useYAxisWidth(12345, "ms"); // 60px
```

### Components - Label Filtering
```typescript
import { LabelSelector } from "./components/label-selector";
import { LabelSelectorButton } from "./components/label-selector-button";

// Example: Use button trigger
<LabelSelectorButton
  data={data}
  selectedLabels={selected}
  onSelectionChange={setSelected}
/>

// Example: Use component directly in dialog
<LabelSelector
  data={data}
  selectedLabels={selected}
  onSelectionChange={setSelected}
/>
```

### Components - Enhanced Charts Grid
```typescript
import { MetricChartsGrid } from "./components/metric-charts-grid-enhanced";

// Example usage
<MetricChartsGrid
  data={metricsMap} // Map<string, AggregatedPoint[]>
  legendVisible={true}
  gridCols={2}
  selectedLabels={{ instance: ["192.168.1.1"] }}
/>
```

---

## 🎯 Common Tasks

### Task 1: Add Label Filtering to Monitor Page
```typescript
import { useState } from "react";
import { LabelSelectorButton } from "./components/label-selector-button";
import { MetricChartsGrid } from "./components/metric-charts-grid-enhanced";

export default function MonitorPage() {
  const [selectedLabels, setSelectedLabels] = useState({});
  const [allData, setAllData] = useState([]);
  const [metricsMap, setMetricsMap] = useState(new Map());

  return (
    <div className="space-y-4">
      {/* Add label selector button to toolbar */}
      <div className="flex gap-2">
        <LabelSelectorButton
          data={allData}
          selectedLabels={selectedLabels}
          onSelectionChange={setSelectedLabels}
        />
      </div>

      {/* Use enhanced grid with label filtering */}
      <MetricChartsGrid
        data={metricsMap}
        legendVisible={true}
        gridCols={2}
        selectedLabels={selectedLabels}
      />
    </div>
  );
}
```

### Task 2: Format a Metric Value
```typescript
import { formatValue, formatSmartNumber } from "@/shared/lib/chart-utils";

// Large numbers
const formatted1 = formatValue(1500000); // "1.5M"
const formatted2 = formatValue(45000); // "45.0K"

// Smart formatting (auto-detects magnitude)
const smart = formatSmartNumber(0.0001); // "1.00e-4"
const smart2 = formatSmartNumber(123.456); // "123.5"
```

### Task 3: Generate Chart Colors
```typescript
import { useChartColors, getSeriesColorFromKey } from "@/shared/hooks/use-chart-colors";

// Generate N distinct colors
const colors = useChartColors(5);
// Result: ["hsl(0, 45%, 60%)", "hsl(72, 45%, 60%)", ...]

// Get consistent color for a series
const color = getSeriesColorFromKey("cpu{host=server1}");
// Same key always produces same color
```

### Task 4: Filter Data by Labels
```typescript
import { filterPointsByLabels } from "@/shared/lib/label-utils";

const filtered = filterPointsByLabels(allData, {
  instance: ["192.168.1.1", "192.168.1.2"], // OR within a key
  job: ["node"] // AND between keys
});
// Returns only points matching ALL conditions
```

### Task 5: Calculate Y-Axis Width
```typescript
import { useYAxisWidth } from "@/shared/hooks/use-y-axis-width";

// In a React component
const yAxisWidth = useYAxisWidth(12345, "ms");
// Use this as YAxis width prop in recharts:
// <YAxis width={yAxisWidth} />
```

---

## 🐛 Troubleshooting

### "Module not found: @/shared/lib/chart-utils"
**Solution:** Check that `@/` alias is configured in:
- `vite.config.ts`: `alias: { "@": "/src" }`
- `tsconfig.json`: `"@/*": ["./src/*"]`

### "Checkbox component not found"
**Solution:** Ensure shadcn/ui is installed:
```bash
cd site && npm list @radix-ui/react-checkbox
# If missing: npx shadcn-ui@latest add checkbox
```

### "Legend click not working"
**Solution:** The enhanced grid uses recharts Legend onClick handlers.
- Check recharts version: `npm list recharts`
- Ensure metric-charts-grid-enhanced.tsx line 304 has onClick handler

### "Charts not displaying with label filter"
**Solution:** Check label filter logic:
```typescript
// This will show NO series (empty AND condition)
filterPointsByLabels(data, { instance: [], job: ["node"] })

// This is correct
filterPointsByLabels(data, { instance: ["192.168.1.1"], job: ["node"] })

// This shows all series
filterPointsByLabels(data, {}) // Empty object = no filter
```

### "Y-axis labels truncated"
**Solution:** The useYAxisWidth hook should handle this.
- Verify hook is imported and used
- Check max value calculation: `useYAxisWidth(maxValue)`
- Adjust max value if calculation is off

### "Performance issues with 40+ series"
**Solution:** The enhanced grid truncates to 30 series.
- Check for warning badge in chart header
- Verify metric-charts-grid-enhanced.tsx line 27: `const MAX_SERIES = 30`
- Hidden series count displayed in warning message

---

## ✅ Verification Checklist

Before submitting a PR:

- [ ] All 7 files are in correct locations (see File Locations above)
- [ ] Build passes: `npm run build` (no TS errors)
- [ ] Label selector button appears in toolbar
- [ ] Can open label filter dialog and select/deselect options
- [ ] Charts update when labels are filtered
- [ ] Legend interaction works (click to hide/show, double-click for solo)
- [ ] Warning badge appears when >30 series
- [ ] Y-axis labels don't truncate with large numbers
- [ ] Performance acceptable with 50+ series (no lag)

---

## 📚 Documentation Map

| Need | Document |
|------|----------|
| **Overview** | DELIVERY_MANIFEST.md (this directory) |
| **Step-by-step integration** | INTEGRATION_SUMMARY.md (site/src/) |
| **Detailed implementation guide** | IMPLEMENTATION_STARTER_KIT.md (docs/archive/) |
| **Gap analysis & roadmap** | IMPLEMENTATION_GAP_ANALYSIS.md (docs/archive/) |
| **Historical context** | MIGRATION_GUIDE_MONITOR_HUB_TO_SONAR_VIEW.md (docs/archive/) |
| **Quick reference** | This file (QUICK_REFERENCE.md) |

---

## 🔗 Key Props Reference

### LabelSelector
```typescript
interface LabelSelectorProps {
  data: AggregatedPoint[];
  selectedLabels: Record<string, string[]>;
  onSelectionChange: (selectedLabels: Record<string, string[]>) => void;
}
```

### LabelSelectorButton
```typescript
interface LabelSelectorButtonProps {
  data: AggregatedPoint[];
  selectedLabels: Record<string, string[]>;
  onSelectionChange: (selectedLabels: Record<string, string[]>) => void;
}
```

### MetricChartsGrid
```typescript
interface MetricChartsGridProps {
  data: Map<string, AggregatedPoint[]>;
  legendVisible: boolean;
  gridCols: 1 | 2;
  selectedLabels?: Record<string, string[]>;
}
```

---

## 💡 Best Practices

### Do:
✅ Memoize selectedLabels state to prevent unnecessary re-renders  
✅ Use LabelSelectorButton for UI consistency  
✅ Apply label filtering before creating metrics map  
✅ Test with real data that has 3+ label keys  
✅ Verify Y-axis width calculation with your specific value ranges  

### Don't:
❌ Create label filter UI from scratch (use provided components)  
❌ Manually build color arrays (use useChartColors hook)  
❌ Override MAX_SERIES without careful performance testing  
❌ Modify chart legend behavior (use provided click handlers)  
❌ Rely on exact Y-axis width (it's dynamic)  

---

## 🚀 Ready to Integrate?

1. **Read:** DELIVERY_MANIFEST.md (overview)
2. **Understand:** INTEGRATION_SUMMARY.md (integration steps)
3. **Check:** File locations above (all 7 files present)
4. **Verify:** Build passes (`npm run build`)
5. **Test:** Label filtering and legend interaction
6. **Integrate:** Follow Phase 3-4 in INTEGRATION_SUMMARY.md

**Support?** → See Troubleshooting section above
