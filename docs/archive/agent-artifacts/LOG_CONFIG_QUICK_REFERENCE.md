# Quick Reference: Log Config Fields

## LogConfig Hierarchy

```
LogConfig (main container)
├─ name: string                           [Config name/ID]
├─ file_path: string                      [Direct path OR empty for dynamic]
├─ rules: Rule[]                          [Process matching (for dynamic mode)]
│  ├─ pid: int
│  ├─ name: string
│  ├─ cmdlines: string[]                  [Match with ! prefix for negation]
│  ├─ log_path_pattern: string            [Regex to extract path from cmdline]
│  └─ extracts: Extract[]                 [Labels from process cmdline]
│     ├─ type: "default"|"split"|"regex"
│     ├─ sep: string                      [For split mode]
│     ├─ pattern: string                  [For regex mode]
│     └─ labels: {name: "$1", ...}        [Label name → capture group index]
├─ dynamic_interval: int                  [Seconds to refresh process list]
├─ encoding: string                       [File encoding (e.g. "utf-8")]
├─ enabled: bool                          [Is this config active?]
├─ read_mode: string                      ["tail" = end, "head" = beginning]
├─ max_file_size_mb: int64                [Max file size (0 = unlimited)]
├─ time_zone: string                      [Default TZ for metrics (e.g. "Asia/Shanghai")]
├─ watch: WatchConfig                     [File monitoring behavior]
│  ├─ poll_interval: string               [Check frequency]
│  ├─ use_inotify: bool                   [Use inotify on Linux]
│  ├─ rotate_check_interval: string       [Check for rotation]
│  └─ max_retries: int                    [Retry attempts]
└─ metrics: MetricConfig[]                [What to extract from logs]
   ├─ name: string                        [Metric name (e.g. "avg_fps")]
   ├─ help: string                        [Description]
   ├─ pattern: string                     [⭐ REGEX to match and extract]
   ├─ enabled: bool                       [Is this metric active?]
   ├─ density: int                        [Report interval in seconds (0=all)]
   ├─ timestamp: string                   [Capture group for time (e.g. "$1")]
   ├─ timestamp_format: string            [Parse format (e.g. "2006-01-02 15:04:05")]
   ├─ time_zone: string                   [TZ override for this metric]
   ├─ value: string                       [⭐ Capture group for value (e.g. "$1")]
   ├─ labels: {key: "$1", ...}            [Extract additional labels]
   └─ is_record_minute_count: bool        [Generate {name}_count_per_minute]
```

---

## Field Cheat Sheet

### Direct Path Mode (Static Files)
```yaml
log_config:
  - name: MyApp
    file_path: /var/log/app.log           # ← Direct path
    rules: []                              # ← Empty
    metrics:
      - name: error_count
        pattern: "ERROR (.*)"              # Match ERROR lines
        value: $1                          # Capture group 1
```

### Dynamic Path Mode (From Process)
```yaml
log_config:
  - name: GameServer
    file_path: ""                          # ← Empty (use rules)
    rules:
      - cmdlines: ["--config", "!seed"]    # Match process with --config, not seed
        log_path_pattern: "-LOG=(.+\.log)" # Extract log path from cmdline
    dynamic_interval: 5                    # Refresh process list every 5s
    metrics:
      - name: avg_fps
        pattern: "AverageFps:(\\d+)"       # Regex with capture group
        value: $1                          # Use group 1 as numeric value
        density: 5                         # Report max once per 5 seconds
```

### With Timestamps
```yaml
metrics:
  - name: request_latency
    pattern: "(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}) latency:(\\d+)ms"
    timestamp: $1                          # Group 1 = timestamp string
    timestamp_format: "2006-01-02 15:04:05"
    time_zone: "Asia/Shanghai"
    value: $2                              # Group 2 = numeric value
```

### Minute Count Metric
```yaml
metrics:
  - name: error_log
    pattern: "ERROR"                       # Just count ERROR occurrences
    value: ""                              # No numeric value
    enabled: true
    is_record_minute_count: true           # ← Generates error_log_count_per_minute
    density: 0                             # Report every match for counting
```

---

## Common Patterns

| Pattern | Captures | Usage |
|---------|----------|-------|
| `Error:(\d+)` | Group 1 = number | Extract error count |
| `(\d{4}-\d{2}-\d{2}.*?)` | Group 1 = timestamp | Timestamp parsing |
| `(\d+)ms` | Group 1 = milliseconds | Response time |
| `level=(\w+)` | Group 1 = level | Log level |
| `ERROR\|WARN` | Full match | Count occurrences |
| `(?P<pid>\d+)` | Named group pid | Named extraction |

---

## TypeScript Types (Frontend)

```typescript
// Main log config type
interface LogConfigItem {
  name: string;
  file_path?: string;
  rules: ProcessRule[];
  dynamic_interval: number;
  encoding?: string;
  enabled: boolean;
  read_mode?: string;
  max_file_size_mb?: number;
  time_zone?: string;
  metrics: MetricConfigItem[];
}

// Individual metric within a log config
interface MetricConfigItem {
  name: string;
  help?: string;
  pattern: string;
  enabled: boolean;
  density: number;
  timestamp?: string;
  timestamp_format?: string;
  time_zone?: string;
  value: string;
  labels?: Record<string, string>;
  is_record_minute_count: boolean;
}

// Process discovery rule
interface ProcessRule {
  pid?: number;
  name: string;
  cmdlines: string[];
  log_path_pattern?: string;
  extracts: Extract[];
}

// Label extraction from process
interface Extract {
  type?: "default" | "split" | "regex";
  sep?: string;
  pattern?: string;
  labels: Record<string, string>;
}
```

---

## REST API Endpoints

| Endpoint | Method | Payload | Purpose |
|----------|--------|---------|---------|
| `/api/v1/config` | GET | - | Fetch entire config including log_config array |
| `/api/v1/config` | PUT | Full Config | Replace entire config |
| `/api/v1/config/log` | PATCH | `LogConfigItem[]` | Update only log configs |
| `/api/v1/config/reload` | POST | `{}` | Reload config from disk file |
| `/api/v1/debug/regex` | POST | `{pattern, input}` | Test regex pattern |

---

## Processing Pipeline

```
Log File
   ↓
[FileWatcher reads lines]
   ↓
For each line:
  ├─ For each MetricConfig:
  │  ├─ If enabled=false: skip
  │  ├─ Apply regex pattern
  │  ├─ If no match: skip
  │  ├─ Extract timestamp (if specified)
  │  ├─ Extract value (capture group in "value" field)
  │  ├─ Extract labels (map of capture groups)
  │  ├─ Apply density sampling (skip if too recent)
  │  ├─ Increment minute count (if is_record_minute_count=true)
  │  └─ Send MetricPoint to channel
   ↓
[Every 1 minute if is_record_minute_count=true]
  └─ Send {name}_count_per_minute metric
   ↓
[Datasource uploads to sonar-store]
```

---

## Key Behaviors

### Sampling (Density Field)
- `density: 0` → Report every match
- `density: 5` → Report max once per 5 seconds (per file)
- Sampling is **per filename** to handle log rotation

### Minute Count
- When `is_record_minute_count: true`:
  - Background goroutine counts matches per minute
  - Every minute sends `{name}_count_per_minute` metric
  - Works with `density: 0` to count everything

### Timestamp Parsing
- If `timestamp` empty → Use current time
- If `timestamp: "$1"` and `timestamp_format` set:
  - Parse captured string using format in specified timezone
  - Default timezone: "Asia/Shanghai"

### Dynamic Path Discovery
1. Process matching via `rules` → `cmdlines` filter
2. Extract log path using `log_path_pattern` regex
3. Watch extracted path
4. Refresh process list every `dynamic_interval` seconds

---

## Thrift Data Model

```thrift
struct MetricPoint {
  1: required i64 timestamp,        // Unix milliseconds
  2: required string name,          // e.g., "avg_fps"
  3: required double value,         // Numeric value
  4: optional map<string, string> labels,  // Tags
}

struct ReportMetricsRequest {
  1: required string app_id,        // Sonar App ID
  2: required list<MetricPoint> metrics,
  3: optional map<string, string> labels,
}
```

---

## Example: Full Config

```yaml
log_config:
  - name: "GameServerLog"
    file_path: ""                          # Dynamic mode
    enabled: true
    encoding: "utf-8"
    read_mode: "tail"
    max_file_size_mb: 100
    time_zone: "Asia/Shanghai"
    dynamic_interval: 5
    rules:
      - name: "GameServer"
        cmdlines:
          - "game_server"
          - "--config=/etc/game.conf"
        log_path_pattern: "-ABSLOG=(.+\\.log)"
    watch:
      poll_interval: "1s"
      use_inotify: true
      rotate_check_interval: "30s"
      max_retries: 3
    metrics:
      # Numeric metric with sampling
      - name: "avg_fps"
        pattern: "AverageFps:(\\d+)"
        enabled: true
        value: $1
        density: 5                    # Report max once per 5 seconds
        is_record_minute_count: false

      # Counter metric (with per-minute count)
      - name: "error_event"
        pattern: "\\[ERROR\\]"
        enabled: true
        value: ""                     # No value, just count
        density: 0                    # Count every match
        is_record_minute_count: true  # Auto-generate error_event_count_per_minute

      # Metric with custom timestamp
      - name: "latency_ms"
        pattern: "(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}) latency:(\\d+)ms"
        enabled: true
        timestamp: $1
        timestamp_format: "2006-01-02 15:04:05"
        time_zone: "UTC"
        value: $2
        density: 1
        is_record_minute_count: false

      # Metric with label extraction
      - name: "request_status"
        pattern: "status=(\\w+)\\s+user_id=(\\d+)"
        enabled: true
        value: ""
        labels:
          status: $1
          user_id: $2
        density: 0
        is_record_minute_count: true
```

