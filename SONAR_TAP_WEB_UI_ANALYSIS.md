# Sonar-Tap Web UI - Complete Analysis

## Overview
The sonar-tap web UI is a **React + TypeScript + Vite** application that provides real-time monitoring and configuration management for the sonar-tap metrics collector. It's built with modern tech stack including shadcn/ui components, TanStack React Query, Recharts for visualizations, and i18n for multi-language support.

**Tech Stack:**
- React 19.2 + TypeScript 5.9
- Vite 7 (build tool)
- TailwindCSS 4 with shadcn/ui components
- TanStack React Query 5 (data fetching & caching)
- Recharts 3.8 (charts & graphs)
- React Router 7 (routing)
- React i18next 16 (internationalization)
- Zod (schema validation)
- Sonner (toast notifications)

---

## Directory Structure

```
site/src/
├── api/                              # Auto-generated TypeScript RPC clients
│   ├── sonar-store/metrics/v1/       # Metrics data client
│   └── sonar-tap/hello/v1/           # Hello/status client
│
├── app/                              # Application shell & layout
│   ├── App.tsx                       # Main router & routes definition
│   ├── main.tsx                      # Entry point
│   ├── providers.tsx                 # Global providers (Query, Theme, i18n, etc.)
│   ├── layout/
│   │   ├── index.tsx                 # DashboardLayout wrapper
│   │   ├── nav-config.ts             # Navigation structure & configuration
│   │   ├── components/
│   │   │   ├── app-sidebar.tsx       # Sidebar component
│   │   │   ├── nav.tsx               # Navigation items
│   │   │   ├── nav-user.tsx          # User profile dropdown
│   │   │   └── site-header.tsx       # Top header bar
│   │   └── ...
│   └── styles/
│       └── globals.css               # Global Tailwind & CSS
│
├── views/                            # Page-level components (routes)
│   ├── dashboard/                    # 📊 Dashboard Page
│   │   ├── index.tsx                 # Main dashboard page (4 stat cards + 3 charts)
│   │   ├── stat-card.tsx             # Reusable stat card component
│   │   ├── cpu-chart.tsx             # CPU usage area chart (Recharts)
│   │   └── capacity-gauge.tsx        # Memory/Disk radial gauge chart
│   │
│   ├── metrics/                      # 📈 Metrics Page
│   │   ├── index.tsx                 # Main metrics page (sidebar + table)
│   │   ├── process-list.tsx          # Left sidebar with process filter
│   │   └── metrics-table.tsx         # Data table with search/filter
│   │
│   ├── config/                       # ⚙️ Configuration Page
│   │   ├── index.tsx                 # Config page with 4 tabs
│   │   ├── push-gateway-form.tsx     # Push gateway settings form
│   │   ├── node-exporter-form.tsx    # Node exporter settings
│   │   ├── process-exporter-form.tsx # Process exporter settings
│   │   └── log-config-form.tsx       # Log monitoring config
│   │
│   ├── debug/                        # 🐛 Debug Page
│   │   └── index.tsx                 # Regex debugger & testing tools
│   │
│   ├── home/                         # (EMPTY - not used)
│   └── settings/                     # (EMPTY - not used)
│
├── shared/                           # Shared utilities & components
│   ├── hooks/
│   │   ├── use-tap-api.ts            # 🔌 ALL API HOOKS (data fetching)
│   │   ├── use-locale.ts             # Language/locale management
│   │   ├── use-theme.ts              # Dark/light theme toggle
│   │   ├── use-mobile.ts             # Mobile responsive detection
│   │   └── use-api-error.ts          # Error handling hook
│   │
│   ├── lib/
│   │   └── utils.ts                  # Utility functions (cn for classnames)
│   │
│   ├── shadcn/                       # Pre-built UI component library
│   │   ├── button.tsx                # Button component
│   │   ├── card.tsx                  # Card component
│   │   ├── input.tsx                 # Input field
│   │   ├── label.tsx                 # Form label
│   │   ├── table.tsx                 # Table component
│   │   ├── tabs.tsx                  # Tab navigation
│   │   ├── chart.tsx                 # Chart wrapper (for Recharts)
│   │   ├── select.tsx                # Dropdown select
│   │   ├── switch.tsx                # Toggle switch
│   │   ├── dialog.tsx                # Modal dialog
│   │   ├── sheet.tsx                 # Side sheet panel
│   │   ├── badge.tsx                 # Badge/tag component
│   │   ├── skeleton.tsx              # Loading skeleton
│   │   ├── tooltip.tsx               # Tooltip component
│   │   ├── sonner.tsx                # Toast notification wrapper
│   │   ├── separator.tsx             # Visual divider
│   │   ├── sidebar.tsx               # Sidebar layout component
│   │   ├── accordion.tsx             # Expandable accordion
│   │   ├── avatar.tsx                # User avatar
│   │   ├── dropdown-menu.tsx         # Dropdown menu
│   │   └── textarea.tsx              # Multi-line text input
│   │
│   ├── wk/                           # Custom widgets/utilities
│   │   ├── components/
│   │   │   ├── theme-provider.tsx    # Theme context provider
│   │   │   ├── mode-toggle.tsx       # Dark mode toggle button
│   │   │   ├── locale-switcher.tsx   # Language selector
│   │   │   └── api-error-dialog.tsx  # Global error dialog
│   │   ├── hooks/
│   │   └── ui/
│   │
│   └── types/
│       └── (empty - for future type definitions)
│
└── i18n/                             # Internationalization (i18next)
    ├── index.ts                      # i18n configuration
    ├── types.ts                      # Type definitions
    └── locales/
        ├── en/
        │   ├── common.json           # Common UI strings
        │   ├── dashboard.json        # All dashboard-related strings
        │   └── theme.json            # Theme-related strings
        └── zh-CN/
            ├── common.json
            ├── dashboard.json
            └── theme.json
```

---

## Pages / Views Overview

### 1. 🏠 Dashboard (`/dashboard`)
**Purpose:** Real-time system overview with health status and metrics visualization

**Components:**
- **4 Stat Cards (Top Row)**
  - Health Status (color indicator: ✓ ok / ✗ error)
  - Process Count
  - Log Watcher Count
  - Recent Metrics Count

- **Charts (Grid Layout)**
  - **CPU Usage Chart** (Area Chart)
    - Renders historical CPU % over time (latest 200 metrics)
    - Shows percentage as header number
    - Displays up to 200 data points with timestamp labels
  
  - **Memory Usage Gauge** (Radial Gauge)
    - Circular progress indicator for memory % usage
    - Shows subtitle with actual used GB
  
  - **Disk IO Gauge** (Radial Gauge)
    - Circular progress indicator for disk I/O utilization
    - Displays IO util status

**API Calls:**
- `GET /api/v1/health` - Health status (refetch: 5s)
- `GET /api/v1/processes` - Process list (refetch: 10s)
- `GET /api/v1/status` - Watcher count (refetch: 10s)
- `GET /api/v1/metrics/preview?limit=200` - Recent metrics (refetch: 5s)

**Status:** ✅ COMPLETE - Full functionality with charts and real-time updates

---

### 2. 📈 Metrics (`/metrics`)
**Purpose:** Browse, search, and filter collected metrics by process

**Layout:**
- **Desktop:** Left sidebar (process filter) + Main table area
- **Mobile:** Collapsible filter sheet + Table area

**Components:**
- **Process Sidebar/Filter**
  - "All" button - show all metrics
  - "Node Metrics" button - show system-level metrics only
  - Process list (from /api/v1/processes)
    - Shows process name and PID
    - Click to filter metrics for that PID
  
- **Metrics Data Table**
  - Searchable by metric name
  - Columns: Name, Value, Timestamp, Labels
  - Labels displayed as badges (up to 3 visible, with "+X more" expandable)
  - Shows loading skeletons while fetching
  - Empty state messages

**API Calls:**
- `GET /api/v1/processes` - Get process list
- `GET /api/v1/metrics/preview?limit=200` - Get metrics to display

**Filtering Logic:**
- If selected PID is null → Show all metrics
- If selected PID is "node" → Filter to metrics without `pid` label
- If selected PID is a number → Filter to metrics with `pid=<PID>` label

**Status:** ✅ COMPLETE - Full table with filtering, search, and responsive layout

---

### 3. ⚙️ Configuration (`/config`)
**Purpose:** Manage collector configuration with 4 configuration tabs

**Tabs:**

#### Tab 1: Push Gateway Configuration
- **Fields:**
  - Host URL
  - App ID
  - Collect Interval (seconds)
  - Report Interval (seconds)
  - Request Timeout (seconds)
  - Buffer Size
  - Channel Size
  - Toggle: Enable Push
  - Toggle: Print Metrics Log

- **API:** `PUT /api/v1/config` - Update entire config

#### Tab 2: Node Exporter Configuration
- **Fields:**
  - Toggle: Enable Node Exporter
  - Dynamic Label Management (key=value pairs)
    - Add/remove labels via UI
    - Display as badges with delete option

- **API:** `PATCH /api/v1/config/node` - Update node config

#### Tab 3: Process Exporter Configuration
- **Fields:**
  - Toggle: Enable Process Exporter
  - Dynamic Interval (seconds)
  - Process Matching Rules (not fully visible in current implementation)

- **API:** `PATCH /api/v1/config/process` - Update process config

#### Tab 4: Log Configuration
- **Fields:**
  - Log group management
  - Dynamic refresh interval
  - Per-group metric rules (pattern, value extraction)
  - Density sampling

- **API:** `PATCH /api/v1/config/log` - Update log config

**Header Action:**
- Reload Button - `POST /api/v1/config/reload` - Reload config from disk

**Status:** ⚠️ PARTIALLY COMPLETE
- ✅ Push Gateway form - fully implemented
- ✅ Node Exporter form - fully implemented
- ⚠️ Process Exporter form - structure exists but not fully implemented
- ⚠️ Log Config form - structure exists but not fully implemented

---

### 4. 🐛 Debug (`/debug`)
**Purpose:** Developer tools for testing and debugging (currently: regex debugger)

**Current Tools:**
- **Regex Debugger**
  - Input: Regex pattern
  - Input: Test string
  - Output: Matched (yes/no)
  - Output: Capture groups ($0, $1, $2, ...)
  - Output: Named capture groups
  - Output: Raw JSON response

**API Calls:**
- `POST /api/v1/debug/regex` - Test regex pattern with input

**Status:** ✅ COMPLETE - Regex debugger fully functional

---

### 5. 🏠 Home & Settings (NOT IMPLEMENTED)
- `/home` - Empty directory, no component
- `/settings` - Empty directory, no component
- These routes exist but have no implementation

---

## API Data Fetching Architecture

### Hook-Based API Layer (`use-tap-api.ts`)
All data fetching is centralized in a single hooks file with unified patterns:

**Query Hooks (GET requests):**
```typescript
useHealth()              // GET /api/v1/health
useProcesses()           // GET /api/v1/processes
useStatus()              // GET /api/v1/status
useMetricsPreview(limit) // GET /api/v1/metrics/preview?limit=N
useConfig()              // GET /api/v1/config
```

**Mutation Hooks (POST/PATCH/PUT requests):**
```typescript
usePatchNodeConfig()     // PATCH /api/v1/config/node
usePatchProcessConfig()  // PATCH /api/v1/config/process
usePatchLogConfig()      // PATCH /api/v1/config/log
usePatchPushGateway()    // PUT /api/v1/config
useReloadConfig()        // POST /api/v1/config/reload
useDebugRegex()          // POST /api/v1/debug/regex
```

**Infrastructure:**
- **Client:** TanStack React Query (v5) for data fetching, caching, refetching
- **Base:** Fetch API (no Axios)
- **Error Handling:** Try-catch with error toast notifications (Sonner)
- **Caching:** 5-minute stale time by default
- **Auto-refresh:** Intervals configured per-hook (5s, 10s, etc.)

### Data Types
All response types defined in `use-tap-api.ts`:
```typescript
HealthResponse       { status: string }
StatusResponse       { watcher_count, watcher_stats }
ProcessInfo          { pid, name, labels, log_path }
MetricPoint          { received_at, timestamp, name, value, labels }
TapConfig            { step, push_gateway, node_exporter, process_exporter, log_config }
```

---

## Chart & Visualization Components

### 1. CPU Usage Chart (Recharts AreaChart)
**File:** `views/dashboard/cpu-chart.tsx`
- **Chart Type:** Area Chart with gradient fill
- **Data:** Filtered metrics with name="node_cpu_percent"
- **Transform:** Converts timestamp to readable time format, multiplies value by 100 for %
- **Features:**
  - Gradient fill from chart color
  - Y-axis: 0-100% domain
  - X-axis: Timestamp labels
  - Tooltip on hover
  - Displays latest CPU % in header

### 2. Memory/Disk Gauges (Recharts RadialBarChart)
**File:** `views/dashboard/capacity-gauge.tsx`
- **Chart Type:** Radial Bar Chart (circular gauge)
- **Data:** Single metric (e.g., "node_mem_percent")
- **Features:**
  - Circular progress ring
  - Percentage display in center (e.g., "75%")
  - Customizable color via CSS variable
  - Optional subtitle (e.g., "1.2 GB used")
  - Dynamic arc based on percentage

### 3. Data Table (Shadcn Table)
**File:** `views/metrics/metrics-table.tsx`
- **Features:**
  - Search by metric name
  - Filter by process (PID)
  - Display: Name, Value, Timestamp, Labels
  - Labels as expandable badges
  - Loading skeletons
  - Empty states

---

## Internationalization (i18n)

**Framework:** react-i18next with i18next

**Namespaces:**
- `common` - Generic UI strings
- `dashboard` - All page-specific strings
- `theme` - Theme-related strings

**Languages:**
- English (`en`)
- Chinese Simplified (`zh-CN`)

**Key Structure (dashboard.json):**
```json
{
  "nav": { "dashboard", "metrics", "config", "debug" },
  "pages": {
    "dashboard": { "cards", "charts" },
    "metrics": { "processList", "table" },
    "config": { "tabs", "pushGateway", ... },
    "debug": { "inputPanel", "resultPanel", "tools" }
  }
}
```

**Usage in Components:**
```typescript
const { t } = useTranslation("dashboard");
<button>{t("pages.dashboard.cards.health")}</button>
```

---

## Theme & Styling

**Framework:** TailwindCSS 4 + Next Themes

**Features:**
- Dark/Light mode toggle (in header)
- CSS custom properties for chart colors
- Color palette defined in CSS variables
- Responsive breakpoints (mobile-first)
- Animation via tailwindcss with motion library

**Available shadcn/ui Components:**
- Buttons, cards, inputs, selects, tables, tabs
- Forms, dialogs, sheets, tooltips
- Badges, avatars, separators, skeletons
- All customizable via Tailwind classes

---

## What's Implemented vs What's Missing

### ✅ Fully Implemented
1. **Dashboard page** - Stats + 3 charts (CPU, Memory, Disk)
2. **Metrics page** - Process filter + data table with search
3. **Config page - Push Gateway tab** - Full configuration form
4. **Config page - Node Exporter tab** - Full configuration form
5. **Debug page** - Regex debugger with match/groups output
6. **Navigation** - Sidebar + top header with user menu
7. **i18n** - English & Chinese translations
8. **Theme** - Dark/light mode with persistence
9. **API integration** - All hooks for data fetching
10. **Error handling** - Toast notifications for API errors
11. **Responsive design** - Mobile-friendly layouts

### ⚠️ Partially Implemented
1. **Config page - Process Exporter tab** - Structure exists, form fields partially done
2. **Config page - Log Config tab** - Structure exists, form fields not completed

### ❌ Not Implemented
1. **Home page** - Empty directory, no component
2. **Settings page** - Empty directory, no component
3. **Process Exporter rules** - Complex nested form not fully built out
4. **Log monitoring rules** - Complex nested form with metric patterns not built
5. **Advanced filtering** - Log config filtering/editing UI
6. **Real-time metric streaming** - Currently polling-based
7. **Historical data export** - No export functionality
8. **Alerting UI** - No alert/threshold configuration UI
9. **API auto-documentation** - No Swagger/OpenAPI UI

---

## Development Stack Details

### Package.json Dependencies
- **React Ecosystem:** react 19.2, react-dom, react-router 7.13, react-i18next 16.5
- **State Management:** zustand 5.0 (unused currently), @tanstack/react-query 5.90
- **UI Components:** radix-ui, @radix-ui/*, shadcn-ui (via components)
- **Styling:** tailwindcss 4.1, @tailwindcss/vite, class-variance-authority
- **Charts:** recharts 3.8
- **Validation:** zod 4.3, react-hook-form 7.71, @hookform/resolvers
- **Notifications:** sonner 2.0
- **Icons:** @hugeicons/react (400+ free icons)
- **i18n:** i18next 25.8, react-i18next 16.5
- **Theme:** next-themes 0.4
- **Utilities:** clsx, tailwind-merge, motion (animation library)

### Build & Dev Tools
- **Vite 7** - Lightning-fast dev server & build tool
- **TypeScript ~5.9** - Strict type checking
- **Biome 2.3** - Fast linting & formatting (replaces ESLint)

---

## API Endpoint Summary

All endpoints are relative to the root (e.g., `http://localhost:3001/api/v1/...`):

| Method | Endpoint | Purpose | Status |
|--------|----------|---------|--------|
| GET | `/api/v1/health` | Check collector health | Used |
| GET | `/api/v1/processes` | List monitored processes | Used |
| GET | `/api/v1/status` | Get watcher count/stats | Used |
| GET | `/api/v1/metrics/preview?limit=N` | Get recent metrics | Used |
| GET | `/api/v1/config` | Get current configuration | Used |
| PUT | `/api/v1/config` | Update full config | Used |
| PATCH | `/api/v1/config/node` | Update node exporter config | Used |
| PATCH | `/api/v1/config/process` | Update process exporter config | Partially used |
| PATCH | `/api/v1/config/log` | Update log monitoring config | Partially used |
| POST | `/api/v1/config/reload` | Reload config from disk | Used |
| POST | `/api/v1/debug/regex` | Test regex pattern | Used |

---

## Code Quality & Standards

**Type Safety:**
- Full TypeScript with strict mode enabled
- All components properly typed
- API response types defined

**Code Organization:**
- Feature-based folder structure (views, shared, app)
- Clear separation of concerns (components, hooks, utilities)
- Single responsibility principle followed

**Styling:**
- Consistent use of Tailwind classes
- Reusable shadcn/ui components
- CSS-in-JS for dynamic styles avoided (Tailwind only)

**Performance:**
- Lazy component loading possible via React Router
- Query caching via React Query (5-minute stale time)
- Memoization used in components (useMemo, memo)
- No unnecessary re-renders

**Accessibility:**
- Semantic HTML (button, form elements)
- ARIA labels where needed
- Keyboard navigation support via Radix-UI components

---

## Next Steps / Recommendations

### High Priority (Core Feature Gaps)
1. **Complete Process Exporter Form** - Add dynamic rule management (add/edit/delete rules)
2. **Complete Log Config Form** - Add metric pattern management UI
3. **Settings Page** - For user preferences (if needed)

### Medium Priority (Enhancement)
1. **Real-time WebSocket support** - Replace polling for faster updates
2. **Metric History/Charts** - More historical data visualization
3. **Alerting UI** - Threshold configuration and alert display
4. **Data Export** - CSV/JSON export of metrics

### Low Priority (Nice-to-have)
1. **API Documentation UI** - Swagger/OpenAPI integration
2. **Advanced Filtering** - Complex query builder for metrics
3. **Dashboard Customization** - Drag-drop widget arrangement
4. **Performance Analytics** - Metrics collection timeline

---

## Summary Statistics

- **Total Views:** 6 (4 implemented, 2 empty placeholders)
- **Charts/Graphs:** 3 (CPU area chart, 2 radial gauges)
- **Shadcn Components Used:** 18+
- **API Hooks:** 11 (6 queries, 5 mutations)
- **Languages Supported:** 2 (EN, ZH-CN)
- **Total TypeScript Files:** ~40
- **Lines of Source Code:** ~3,000+
- **Build Tool:** Vite (sub-second hot reload)

