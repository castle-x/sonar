# Sonar-Tap Web UI - Quick Reference Guide

## 🎯 Quick Navigation

### Routes & Pages
```
/ (root)
├── /dashboard    - 📊 Real-time stats & charts (Health, Processes, Watchers, Metrics)
├── /metrics      - 📈 Browse all metrics with process filtering
├── /config       - ⚙️ Configuration manager (4 tabs: push gateway, exporters, logs)
├── /debug        - 🐛 Regex testing & debugging tools
├── /home         - (not implemented - empty)
└── /settings     - (not implemented - empty)
```

## 📂 Where to Find Things

| What | Where | File |
|-----|-------|------|
| **Main App Routes** | App definition | `src/app/App.tsx` |
| **Navigation Menu** | Nav config | `src/app/layout/nav-config.ts` |
| **All API Calls** | Hooks file | `src/shared/hooks/use-tap-api.ts` |
| **Dashboard Page** | Page component | `src/views/dashboard/index.tsx` |
| **Metrics Page** | Page component | `src/views/metrics/index.tsx` |
| **Config Page** | Page component | `src/views/config/index.tsx` |
| **Debug Page** | Page component | `src/views/debug/index.tsx` |
| **CPU Chart** | Chart component | `src/views/dashboard/cpu-chart.tsx` |
| **Gauge Charts** | Chart component | `src/views/dashboard/capacity-gauge.tsx` |
| **Process Filter** | Component | `src/views/metrics/process-list.tsx` |
| **Metrics Table** | Component | `src/views/metrics/metrics-table.tsx` |
| **UI Components** | Shadcn library | `src/shared/shadcn/*.tsx` |
| **i18n Strings** | Translation files | `src/i18n/locales/{en,zh-CN}/*.json` |
| **Tailwind Config** | Build config | `tailwind.config.ts` or `vite.config.ts` |

## 🔌 API Integration Pattern

**All data fetching uses TanStack React Query with unified fetch helpers:**

```typescript
// In component:
const { data, isLoading, error } = useHealth();  // Auto-refetch every 5s
const mutation = usePatchNodeConfig();            // For POST/PATCH/PUT

// In use-tap-api.ts:
export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch<HealthResponse>("/api/v1/health"),
    staleTime: 0,
    refetchInterval: 5000,  // ← Configure refetch rate here
    meta: { onError: () => toast.error("Failed...") }
  });
}
```

**Error Handling:** Automatic toast notification on API error
**Caching:** 5-minute default stale time, then re-fetch
**Request Format:** JSON with Content-Type header

## 📊 Chart Components Cheat Sheet

### CPU Area Chart
- **Location:** `src/views/dashboard/cpu-chart.tsx`
- **Data Source:** Metrics with name="node_cpu_percent"
- **Library:** Recharts AreaChart
- **Update Interval:** 5 seconds (from useMetricsPreview)
- **Features:** Gradient fill, time-series display, live %

### Memory Gauge
- **Location:** `src/views/dashboard/capacity-gauge.tsx`
- **Data Source:** Metric with name="node_mem_percent"
- **Library:** Recharts RadialBarChart
- **Display:** Circular gauge (0-100%)
- **Features:** Center percentage, optional subtitle (GB used)

### Disk IO Gauge
- **Location:** Same component as Memory Gauge
- **Data Source:** Metric with name="node_disk_io_util"
- **Display:** Circular gauge
- **Features:** Color-coded (CSS variable)

## 🎨 Styling & Theme

### Adding New Styled Component
```typescript
// Use Tailwind classes directly (no CSS-in-JS needed)
<div className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-accent">
  Content
</div>

// For dynamic colors, use CSS variables:
<div style={{ backgroundColor: 'var(--chart-1)' }}>Chart</div>
```

### Color Variables Available
```css
--chart-1 (blue)
--chart-2 (green)
--chart-3 (orange)
--chart-4, --chart-5, --chart-6... (additional)
--foreground (text color)
--background (bg color)
--muted / --muted-foreground
--accent / --accent-foreground
--destructive (errors/red)
```

### Theme Toggle
- Button location: Header top-right
- Implementation: `src/shared/wk/components/mode-toggle.tsx`
- Uses: next-themes for persistence

## 🌍 Internationalization (i18n)

### Adding New Strings
1. Edit `src/i18n/locales/en/dashboard.json` (English)
2. Edit `src/i18n/locales/zh-CN/dashboard.json` (Chinese)
3. Use in component:

```typescript
const { t } = useTranslation("dashboard");  // namespace
return <div>{t("pages.dashboard.cards.health")}</div>;
```

### JSON Structure
```json
{
  "pages": {
    "dashboard": {
      "cards": {
        "health": "Health Status",
        "healthDesc": "Current health status"
      }
    }
  }
}
```

## 📝 Adding a New Page

### Step 1: Create Component
```typescript
// src/views/mypage/index.tsx
function MyPage() {
  const { t } = useTranslation("dashboard");
  return <div>{t("pages.mypage.title")}</div>;
}
export { MyPage };
```

### Step 2: Add to Navigation
```typescript
// src/app/layout/nav-config.ts
const navSections: NavSection[] = [
  {
    key: "main",
    items: [
      // ... existing items
      {
        type: "link",
        key: "mypage",
        icon: SomeIcon,
        titleKey: "nav.mypage",
        path: "mypage",
      }
    ]
  }
];
```

### Step 3: Add Route
```typescript
// src/app/App.tsx
<Route path="mypage" element={<MyPage />} />
```

### Step 4: Add i18n Strings
```json
// src/i18n/locales/en/dashboard.json
{
  "nav": { "mypage": "My Page" },
  "pages": {
    "mypage": {
      "title": "My Page Title",
      "description": "Page description"
    }
  }
}
```

## 🐛 Debugging Tips

### Check What's Rendering
```typescript
// Add to component
console.log("Rendering with data:", data);

// Use React DevTools to inspect component tree
// Use React Query DevTools (add if needed):
// npm install @tanstack/react-query-devtools
```

### Network Requests
- Open DevTools Network tab
- Filter by `/api/v1/`
- Check response data and error messages

### API Errors
- Errors show as toast notifications (bottom-right)
- Check browser console for stack traces
- Verify backend server is running

### Type Checking
```bash
npm run typecheck  # Find TypeScript errors
```

### Code Quality
```bash
npm run lint       # Check code with Biome
npm run lint:fix   # Auto-fix issues
```

## 📦 Building & Deployment

### Development
```bash
npm run dev    # Start dev server on http://localhost:5173
```

### Production Build
```bash
npm run build  # Creates optimized dist/ folder
npm run preview # Test production build locally
```

### Files Generated
```
dist/
├── index.html          # HTML entry point
├── assets/
│   ├── index-*.js      # Bundled JS
│   ├── index-*.css     # Bundled CSS
│   ├── vendor-*.js     # Vendor chunks (React, React Query, Recharts)
│   └── *.woff2         # Fonts (Inter, Manrope)
```

## 🚀 Common Tasks

### Task: Add a new stat card to dashboard
1. Edit `src/views/dashboard/index.tsx`
2. Add new `<StatCard>` component with `useXXX()` hook
3. Add translation strings to i18n files

### Task: Add filter to metrics table
1. Edit `src/views/metrics/metrics-table.tsx`
2. Modify `filteredData` calculation in `useMemo`
3. Add new filter control UI

### Task: Add new API call
1. Add query/mutation hook to `src/shared/hooks/use-tap-api.ts`
2. Define response type interface
3. Configure refetch interval if needed
4. Use in component via hook

### Task: Fix chart not updating
1. Check refetch interval in hook (might be too high)
2. Verify API endpoint is returning new data
3. Check if query cache is too long (`staleTime`)
4. Use React Query DevTools to inspect cache state

### Task: Update config forms
1. Edit relevant form in `src/views/config/`
2. Add new input fields and state
3. Ensure mutation call includes all fields
4. Add i18n strings for labels

## 🔗 Key Dependencies Quick Links

| Library | Version | Purpose | Docs |
|---------|---------|---------|------|
| React | 19.2 | UI framework | [react.dev](https://react.dev) |
| TanStack React Query | 5.90 | Data fetching | [tanstack.com/query](https://tanstack.com/query) |
| Recharts | 3.8 | Charting | [recharts.org](https://recharts.org) |
| Tailwind CSS | 4.1 | Styling | [tailwindcss.com](https://tailwindcss.com) |
| shadcn/ui | - | UI components | [ui.shadcn.com](https://ui.shadcn.com) |
| React Router | 7.13 | Routing | [reactrouter.com](https://reactrouter.com) |
| Zod | 4.3 | Validation | [zod.dev](https://zod.dev) |

## ✨ Pro Tips

1. **Use React Query DevTools** for debugging data caching
   ```bash
   npm install @tanstack/react-query-devtools
   # Add <ReactQueryDevtools /> to providers
   ```

2. **Performance**: Use Chrome DevTools Profiler to find slow renders

3. **Mobile Testing**: Use `useMediaQuery` hook or Chrome device emulation

4. **Dark Mode**: All components auto-support via CSS variables

5. **Bundle Size**: Check with `npm run build && npx vite-plugin-visualizer`

6. **Linting**: Biome is fast! Run `npm run lint:fix` often

7. **Types**: Hover over imports in VS Code to see full types

---

Last Updated: 2026-04-09
Generated for: sonar-tap web UI analysis
