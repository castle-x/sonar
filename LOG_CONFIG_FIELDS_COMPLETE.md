# Complete Log Config Fields Reference

## Overview

This document maps **ALL** log configuration-related fields across the sonar-tap project stack:

1. **Go Config Structs** (`config/config.go`)
2. **TypeScript Frontend Types** (`site/src/shared/hooks/use-tap-api.ts`)
3. **Thrift IDL** (`api/sonar-store/metrics/v1/metrics.thrift`)
4. **Real YAML Examples** (`config/config.yaml`)
5. **Legacy Exporter Reference** (`.legacy/exporter/config/config.go`)

---

## 1. Go Config Structs (`sonar-tap/config/config.go`)

### LogConfig (Top-level Log Configuration)

**Type:** `struct`

| Field | Type | JSON/YAML Tag | Purpose |
|-------|------|---------------|---------|
| `Name` | `string` | `name` | Configuration name/identifier (e.g., "DummyServerLog") |
| `FilePath` | `string` | `file_path` | Direct log file path or glob pattern (e.g., `/var/log/*.log`) |
| `Rules` | `[]Rule` | `rules` | Process matching rules for dynamic log path discovery |
| `DynamicInterval` | `int` | `dynamic_interval` | Interval in seconds to refresh process list (0 = disabled) |
| `Encoding` | `string` | `encoding` | File encoding (e.g., "utf-8") |
| `Enabled` | `bool` | `enabled` | Whether this log config is active |
| `ReadMode` | `string` | `read_mode` | How to start reading: `"tail"` (end) or `"head"` (start) |
| `MaxFileSizeMB` | `int64` | `max_file_size_mb` | Maximum file size limit in MB (0 = unlimited) |
| `TimeZone` | `string` | `time_zone` | Timezone for timestamp parsing (e.g., "Asia/Shanghai") |
| `WatchConfig` | `WatchConfig` | `watch` | File watching behavior configuration |
| `Metrics` | `[]MetricConfig` | `metrics` | List of metrics to extract from log lines |

**Helper Method:**
- `IsPattern() bool` - Returns true if `FilePath` contains `*` or `?` wildcards

---

### WatchConfig (File Watching Configuration)

**Type:** `struct`

| Field | Type | JSON/YAML Tag | Purpose |
|-------|------|---------------|---------|
| `PollInterval` | `string` | `poll_interval` | How often to poll for file changes (e.g., "1s") |
| `UseInotify` | `bool` | `use_inotify` | Use inotify for file system events (Linux only) |
| `RotateCheckInterval` | `string` | `rotate_check_interval` | Interval to check for log file rotation (e.g., "10s") |
| `MaxRetries` | `int` | `max_retries` | Maximum retry attempts for file operations |

---

### MetricConfig (Log Metric Extraction)

**Type:** `struct`

| Field | Type | JSON/YAML Tag | Purpose |
|-------|------|---------------|---------|
| `Name` | `string` | `name` | Metric name (e.g., "avg_fps", "error_log") |
| `Help` | `string` | `help` | Human-readable metric description |
| `Pattern` | `string` | `pattern` | Regex pattern to match lines and extract values (e.g., `"AverageFps:(\\d+)"`) |
| `Enabled` | `bool` | `enabled` | Whether this metric extraction is active |
| `Density` | `int` | `density` | Sampling density in seconds (0 = no sampling/report every match) |
| `Timestamp` | `string` | `timestamp` | Regex capture group index for timestamp (e.g., `"$1"` = first group) |
| `TimestampFormat` | `string` | `timestamp_format` | Format string for parsing timestamp (e.g., `"2006-01-02 15:04:05"`) |
| `TimeZone` | `string` | `time_zone` | Timezone for timestamp parsing (e.g., "Asia/Shanghai") |
| `Value` | `string` | `value` | Regex capture group index for metric value (e.g., `"$1"`) |
| `Labels` | `map[string]string` | `labels` | Additional labels extracted from regex groups (values can be `"$1"`, `"$2"`, etc.) |
| `IsRecordMinuteCount` | `bool` | `is_record_minute_count` | If true, generate `{name}_count_per_minute` metric counting occurrences per minute |

---

### Rule (Process Matching Rule)

**Type:** `struct` (used in both `ProcessExporter.Rules` and `LogConfig.Rules`)

| Field | Type | JSON/YAML Tag | Purpose |
|-------|------|---------------|---------|
| `Pid` | `int` | `pid` | Directly specify a PID (optional, 0 = not set) |
| `Name` | `string` | `name` | Process name identifier |
| `Cmdlines` | `[]string` | `cmdlines` | Command line filters (prefix with `!` for negation/exclusion) |
| `LogPathPattern` | `string` | `log_path_pattern` | Regex to extract log file path from process cmdline (e.g., `-LOG=(.+\.log)`) |
| `Extracts` | `[]Extract` | `extracts` | Label extraction rules from process cmdline |

---

### Extract (Label Extraction)

**Type:** `struct`

| Field | Type | JSON/YAML Tag | Purpose |
|-------|------|---------------|---------|
| `Type` | `ExtractType` | `type` | Extraction method: `"default"` / `"split"` / `"regex"` |
| `Sep` | `string` | `sep` | Separator character for `split` mode |
| `Pattern` | `string` | `pattern` | Regex pattern for `regex` mode |
| `Labels` | `map[string]string` | `labels` | Label mappings (values reference capture groups like `$1`, `$2`) |

---

### Related Config Structs

#### Config (Top-level)

| Field | Type | Purpose |
|-------|------|---------|
| `Step` | `int` | Collection interval in seconds |
| `SonarStore` | `SonarStore` | Reporting to sonar-store |
| `ProcessExporter` | `ProcessExporter` | Process monitoring config |
| `NodeExporter` | `NodeExporter` | Node/system metrics config |
| `LogConfig` | `[]LogConfig` | Array of log monitoring configs |

#### ProcessExporter

| Field | Type | Purpose |
|-------|------|---------|
| `Enabled` | `bool` | Enable process monitoring |
| `DynamicInterval` | `int` | Refresh interval for process list |
| `Rules` | `[]Rule` | Process matching rules |

---

## 2. TypeScript Frontend Types (`site/src/shared/hooks/use-tap-api.ts`)

```typescript
export interface LogConfigItem {
  name: string;                           // Configuration identifier
  file_path?: string;                     // Direct log file path or pattern
  rules: ProcessRule[];                   // Process matching rules
  dynamic_interval: number;               // Process refresh interval (seconds)
  encoding?: string;                      // File encoding
  enabled: boolean;                       // Active/inactive
  read_mode?: string;                     // "tail" or "head"
  max_file_size_mb?: number;              // Max file size in MB
  time_zone?: string;                     // Timezone for timestamp parsing
  metrics: MetricConfigItem[];            // Metrics to extract
}

export interface MetricConfigItem {
  name: string;                           // Metric name
  help?: string;                          // Description
  pattern: string;                        // Regex pattern to match
  enabled: boolean;                       // Active/inactive
  density: number;                        // Sampling interval (seconds)
  timestamp?: string;                     // Capture group index for timestamp
  timestamp_format?: string;              // Timestamp format string
  time_zone?: string;                     // Timezone for parsing
  value: string;                          // Capture group index for value
  labels?: Record<string, string>;        // Additional labels
  is_record_minute_count: boolean;        // Generate per-minute count metric
}

export interface ProcessRule {
  pid?: number;                           // Direct PID
  name: string;                           // Rule name
  cmdlines: string[];                     // Command line filters
  log_path_pattern?: string;              // Regex to extract log path
  extracts: Extract[];                    // Label extraction rules
}

export interface Extract {
  type?: "default" | "split" | "regex";  // Extraction method
  sep?: string;                           // Separator (for split mode)
  pattern?: string;                       // Regex pattern (for regex mode)
  labels: Record<string, string>;         // Label mappings
}
```

---

## 3. Thrift IDL Types (`api/sonar-store/metrics/v1/metrics.thrift`)

### MetricPoint

```thrift
struct MetricPoint {
  1: required i64 timestamp,               // Unix millisecond timestamp
  2: required string name,                 // Metric name (e.g., "avg_fps")
  3: required double value,                // Metric value
  4: optional map<string, string> labels,  // Labels (pid, filename, etc.)
}
```

### ReportMetricsRequest

```thrift
struct ReportMetricsRequest {
  1: required string app_id,               // Application identifier
  2: required list<MetricPoint> metrics,   // Batch of metric points
  3: optional map<string, string> labels,  // Global labels (merged by store)
}
```

### ReportMetricsResponse

```thrift
struct ReportMetricsResponse {
  1: required i32 code,                    // 0 = success, non-zero = error
  2: optional string message,              // Error description
}
```

---

## 4. Real YAML Example (`config/config.yaml`)

```yaml
log_config:
  - name: DummyServerLog
    file_path: ""                          # Empty = use rules to find dynamically
    rules:
      - pid: 0
        name: ""
        cmdlines:
          - dummy_server
          - --id=server001
        log_path_pattern: -LOG=(.+\.log)   # Extract log path from cmdline
        extracts: []
    dynamic_interval: 5                    # Refresh process list every 5s
    encoding: ""                           # Empty = default
    enabled: true
    read_mode: ""                          # Empty = default (tail)
    max_file_size_mb: 0                    # 0 = no limit
    time_zone: ""                          # Empty = default (Asia/Shanghai)
    watch:
      poll_interval: ""                    # Empty = default
      use_inotify: false
      rotate_check_interval: ""            # Empty = default
      max_retries: 0
    metrics:
      - name: avg_fps
        help: ""
        pattern: AverageFps:(\d+)          # Extract number after "AverageFps:"
        enabled: true
        density: 5                         # Report at most every 5 seconds
        timestamp: ""                      # Empty = use current time
        timestamp_format: ""               # Not used if timestamp empty
        time_zone: ""
        value: $1                          # Use first capture group as value
        labels: {}
        is_record_minute_count: false

      - name: error_log
        help: ""
        pattern: ERROR (.+)
        enabled: true
        density: 0                         # 0 = report every match
        timestamp: ""
        timestamp_format: ""
        time_zone: ""
        value: ""                          # No numeric value
        labels: {}
        is_record_minute_count: true       # Generate error_log_count_per_minute
```

---

## 5. Legacy Exporter Reference (`.legacy/exporter/config/config.go`)

The legacy exporter has **identical** struct definitions:

- `LogConfig` - Same as current
- `WatchConfig` - Same as current
- `MetricConfig` - Same as current
- `Rule` - Same as current
- `Extract` - Same as current

The only difference in legacy config was:
- Used `PushGateway` instead of `SonarStore` (different reporting endpoint)
- All log config fields remain unchanged

**Legacy YAML Example:**
```yaml
log_config:
  - name: "app_log"
    enabled: false
    file_path: "/var/log/app.log"
    read_mode: "tail"
    encoding: "utf-8"
    watch:
      poll_interval: "1s"
      use_inotify: true
      rotate_check_interval: "10s"
      max_retries: 3
    metrics:
      - name: "error_count"
        pattern: "\\[ERROR\\] (.+)"
        enabled: true
        is_record_minute_count: true

  - name: "process_log"
    enabled: false
    dynamic_interval: 15
    rules:
      - name: "MyServer"
        cmdlines: ["--config"]
        log_path_pattern: "--log=(.+\\.log)"
        extracts:
          - type: "regex"
            pattern: "--id=(\\w+)"
            labels:
              server_id: $1
    metrics:
      - name: "slow_request"
        pattern: "\\[WARN\\] slow request (.+)"
        enabled: true
        density: 1
```

---

## 6. Constants and Enums

### ExtractType
```go
const (
  ExtractTypeDefault ExtractType = "default"   // Default extraction
  ExtractTypeSplit   ExtractType = "split"     // Split by separator
  ExtractTypeRegex   ExtractType = "regex"     // Regex extraction
)
```

### ReadMode
```go
const (
  ReadModeTail ReadMode = "tail"   // Start from end of file
  ReadModeHead ReadMode = "head"   // Start from beginning of file
)
```

---

## 7. API Handler Endpoints (`internal/handler/tap_handler.go`)

### Related Log Config Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/config` | GET | Get entire config including all log configs |
| `/api/v1/config` | PUT | Replace entire config |
| `/api/v1/config/log` | PATCH | Patch only log config (`[]LogConfig`) |
| `/api/v1/config/reload` | POST | Reload config from disk file |
| `/api/v1/debug/regex` | POST | Test regex patterns against input |

---

## 8. Data Flow through Metrics Handler (`pkg/metrics/handler.go`)

### MetricHandler Lifecycle

1. **Initialization**: `NewHandlerWithContext()` creates handler with compiled regex pattern
2. **Line Processing**: `Handle(line, filename)` processes each log line
3. **Regex Matching**: Applies `MetricConfig.Pattern` to extract values/timestamps/labels
4. **Sampling**: Applies `MetricConfig.Density` to throttle reporting
5. **Per-Minute Count**: If `IsRecordMinuteCount=true`, generates `{name}_count_per_minute` metric every minute
6. **Output**: Sends `*metricsapi.MetricPoint` to channel

### Key Fields Used During Processing

From `MetricConfig`:
- `Pattern` - Compiled into regex for line matching
- `Enabled` - Skip processing if false
- `Density` - Control sampling (seconds)
- `Timestamp` - Capture group index for custom timestamps
- `TimestampFormat` - Format for parsing extracted timestamp
- `TimeZone` - Timezone for timestamp parsing (default: "Asia/Shanghai")
- `Value` - Capture group index for numeric value
- `Labels` - Map of additional label indices
- `IsRecordMinuteCount` - Track occurrence count per minute

From `LogConfig`:
- `TimeZone` - Default timezone for all metrics (can override per-metric)
- `Encoding` - File encoding for text processing
- `MaxFileSizeMB` - Skip files larger than this
- `ReadMode` - Determine starting position (tail = end, head = start)

---

## 9. Complete Field Dependencies Chart

```
LogConfig (container)
├── name: string                    [UI display]
├── file_path: string               [direct mode] OR
├── rules: Rule[]
│   ├── pid: int
│   ├── name: string
│   ├── cmdlines: []string
│   ├── log_path_pattern: string    [dynamic mode - extract path from process]
│   └── extracts: Extract[]
│       ├── type: enum (default/split/regex)
│       ├── sep: string             [if type=split]
│       ├── pattern: string         [if type=regex]
│       └── labels: map             [extract process labels]
├── dynamic_interval: int           [process discovery refresh, 0=disabled]
├── encoding: string                [text processing]
├── enabled: bool                   [gate]
├── read_mode: string               [enum: tail/head]
├── max_file_size_mb: int64         [filter]
├── time_zone: string               [default for all metrics]
├── watch: WatchConfig
│   ├── poll_interval: string
│   ├── use_inotify: bool
│   ├── rotate_check_interval: string
│   └── max_retries: int
└── metrics: MetricConfig[]
    ├── name: string                [output metric name]
    ├── help: string                [description]
    ├── pattern: string             [regex for extraction] ⭐ REQUIRED
    ├── enabled: bool               [gate]
    ├── density: int                [sampling, 0=no sampling]
    ├── timestamp: string           [capture group index "$1", "$2"]
    ├── timestamp_format: string    [parse format, e.g. "2006-01-02 15:04:05"]
    ├── time_zone: string           [override LogConfig.time_zone]
    ├── value: string               [capture group index "$1", "$2"] ⭐ USUALLY SET
    ├── labels: map<string,string>  [extra labels with indices like "$1", "$2"]
    └── is_record_minute_count: bool [auto-generate {name}_count_per_minute]
```

---

## 10. Special Behaviors & Gotchas

### Minute Count Metrics
If `MetricConfig.IsRecordMinuteCount = true`:
- A background goroutine runs `minuteCountReporter()`
- Every minute (at the start), it sends a metric named `{original_name}_count_per_minute`
- Value = count of matches in that minute
- This happens **in addition to** regular metric reporting

### Density Sampling
- `Density = 0` → Report every match (no sampling)
- `Density = 5` → Report at most once every 5 seconds per file
- Sampling is tracked **per filename** to handle log rotation/multiple files

### Timestamp Processing
- If `Timestamp` field is empty → Use current time (`time.Now().UnixMilli()`)
- If `Timestamp` field set (e.g., `"$1"`) and `TimestampFormat` provided:
  - Extract capture group `$1` from regex match
  - Parse as `TimestampFormat` string in specified timezone
  - Default timezone: "Asia/Shanghai" if not specified

### Log Path Discovery (Dynamic Mode)
1. `LogConfig.FilePath` is empty
2. `LogConfig.Rules` contains process matching criteria
3. For each matched process, extract log path using `Rule.LogPathPattern` (regex on cmdline)
4. Monitor extracted log files
5. Refresh process list every `DynamicInterval` seconds

### Process Rule Matching
- `cmdlines` is a list of strings to match/exclude
- Prefix with `!` to negate (exclude)
- Example: `["--config", "!seed"]` means "contains --config AND does NOT contain seed"

---

## 11. Migration from Legacy

The struct definitions are **completely identical** between legacy and current.
Migration is straightforward:
1. Replace `PushGateway` config section with `SonarStore`
2. All `LogConfig`, `WatchConfig`, `MetricConfig` structures remain unchanged
3. YAML format compatible

---

## Summary Table: All LogConfig-Related Fields

| Level | Name | Type | Required | Notes |
|-------|------|------|----------|-------|
| **LogConfig** | name | string | ✓ | Container identifier |
| | file_path | string | | Direct path or pattern (empty if using rules) |
| | rules | Rule[] | | Process discovery rules |
| | dynamic_interval | int | | Process refresh interval (0=disabled) |
| | encoding | string | | Text file encoding |
| | enabled | bool | ✓ | Active flag |
| | read_mode | string | | "tail" or "head" |
| | max_file_size_mb | int64 | | Size limit (0=unlimited) |
| | time_zone | string | | Default for metrics (Asia/Shanghai) |
| | watch | WatchConfig | ✓ | File watching config |
| | metrics | MetricConfig[] | ✓ | Extraction rules |
| **WatchConfig** | poll_interval | string | | Polling frequency |
| | use_inotify | bool | ✓ | Use inotify (Linux) |
| | rotate_check_interval | string | | Log rotation detection |
| | max_retries | int | | Retry count |
| **MetricConfig** | name | string | ✓ | Output metric name |
| | help | string | | Human description |
| | pattern | string | ✓ | Regex for extraction |
| | enabled | bool | ✓ | Active flag |
| | density | int | | Sampling interval (0=none) |
| | timestamp | string | | Capture group for timestamp |
| | timestamp_format | string | | Parse format string |
| | time_zone | string | | Timezone for parsing |
| | value | string | ✓ | Capture group for value |
| | labels | map | | Additional label indices |
| | is_record_minute_count | bool | ✓ | Generate count metric |
| **Rule** | pid | int | | Direct PID (0=not set) |
| | name | string | ✓ | Rule name |
| | cmdlines | string[] | ✓ | Command line filters |
| | log_path_pattern | string | | Regex to extract path |
| | extracts | Extract[] | | Label extractions |
| **Extract** | type | enum | | Extraction method |
| | sep | string | | Split separator |
| | pattern | string | | Regex pattern |
| | labels | map | ✓ | Label mappings |

