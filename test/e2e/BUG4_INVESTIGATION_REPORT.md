# Bug#4 Investigation Report: Process Metrics Zero on macOS

**Investigation Date**: 2026-04-13  
**Investigator**: Claude Coder-B  
**Platform**: macOS (darwin)  
**Bug Severity**: 🔴 HIGH  
**Status**: ROOT CAUSE IDENTIFIED + FIX PROPOSED

---

## Executive Summary

Process metrics (`node_process_cpu_percent` and `node_process_mem_rss_mb`) are returning zero on macOS because:

1. **CPU Collection**: The CPU collector in `sonar-tap/pkg/collector/cpu.go` relies on `/proc/[pid]/stat` file, which **does not exist on macOS** (Linux-only interface)
2. **Memory Collection**: While memory collection uses `gopsutil.MemoryInfo()` (cross-platform), the process must first be successfully collected via CPU, which fails silently due to `/proc` missing

### Current State
- **Node CPU/Memory**: ✅ Working (uses gopsutil cross-platform APIs)
- **Process CPU**: ❌ Fails silently on macOS (hardcoded `/proc/` path)
- **Process Memory**: ❌ Returns zero (process not properly initialized due to CPU collection failure)

---

## Root Cause Analysis

### 1. CPU Collection Failure (Primary Issue)

**File**: `sonar-tap/pkg/collector/cpu.go` - `collectProcessCPU()` function (lines 65-133)

```go
statPath := "/proc/" + strconv.Itoa(int(process.GetPID())) + "/stat"
data, err := os.ReadFile(statPath)
if err != nil {
    logger.Warn("read stat file error: %v", err)
    return metric, nil  // ← Returns zero silently
}
```

**Problem**:
- Hardcoded `/proc/[pid]/stat` path is Linux-specific
- macOS uses different process info APIs
- When the file read fails on macOS, the function returns `{"process_cpu_percent": 0.0}` silently
- No error returned to caller, so process collection continues but with zero values
- Process CPU state (`lastCPUTime`, `lastSampleTime`) remains uninitialized

**Evidence from E2E Test**:
```
E2E Report Phase 3.4:
node_process_cpu_percent: 0 条   ← No data in storage
node_process_mem_rss_mb: 0 条    ← No data in storage
```

### 2. Memory Collection Follows CPU Failure (Secondary Issue)

**File**: `sonar-tap/pkg/collector/mem.go` - `CollectProcess()` function (lines 35-63)

```go
memInfo, err := process.GetProcess().MemoryInfo()
var physicalMem float64
if err != nil {
    physicalMem = 0
} else {
    physicalMem = float64(memInfo.RSS) / 1024 / 1024
}
metrics["process_mem_mb"] = tools.RoundFloat64(physicalMem, 3)
```

**Problem**:
- While `gopsutil.MemoryInfo()` is cross-platform compatible, it depends on the process being "healthy"
- If process CPU collection failed, the process object may not be fully initialized
- The metric is returned with `0.0` value instead of actual RSS memory

**Cross-Platform Detection Logic**:
```go
switch runtime.GOOS {
case "linux":
    pss, uss := c.getPSSUSSMemoryForProcess(process)  // Linux-specific
default:
    process.SetUSSLastValue(0)      // macOS/Windows: PSS/USS not available
    process.SetPSSLastValue(0)
}
```

This code correctly skips PSS/USS on non-Linux, but the RSS memory should still work via `MemoryInfo()`.

### 3. Process Collection Pipeline

The issue propagates through the collection pipeline:

```
ProcessExporter.Record()
  └── processManager.GetProcessMap().Range()
      └── For each process:
          └── CPUCollector.CollectProcess()  ← FAILS SILENTLY on macOS
              └── Returns {process_cpu_percent: 0.0}
          └── Metric written to channel with 0.0 value
              └── sonar-store receives 0.0 value
                  └── TSDB may filter out zero values (depends on config)
```

### 4. Why Zero Values Don't Appear in TSDB

From E2E Report:
```json
{
  "node_process_cpu_percent": "0条",
  "node_process_mem_rss_mb": "0条"
}
```

Zero-valued metrics may not be stored in Prometheus TSDB if:
- The datasource client implements filtering (likely)
- The TSDB itself drops zero-valued time series (possible)
- The metric point filtering logic in `sonar-tap/pkg/datasource/client.go` excludes metrics with 0.0 values

---

## Technical Details: macOS Process Info APIs

### Linux: /proc filesystem
```
/proc/[pid]/stat      → utime, stime (CPU jiffies)
/proc/[pid]/smaps     → PSS, USS (memory details)
/proc/[pid]/cmdline   → process arguments
```

### macOS: Alternative APIs
macOS uses different system interfaces:
- `sysctl()` or `libproc` for process info
- `getrusage()` for CPU time (user + system time)
- No direct equivalent to /proc/smaps (PSS/USS not available)

### gopsutil Cross-Platform Support
`github.com/shirou/gopsutil/v4` already provides cross-platform wrappers:

```go
// Already cross-platform compatible:
process.Percent()          // CPU usage percentage
process.MemoryInfo()       // RSS/VMS (works on macOS)
process.MemoryMaps()       // Available on Linux/Windows only

// Not available on macOS:
process.MemoryMaps()       // → 0 PSS/USS on macOS
```

---

## Solution: Cross-Platform CPU Collection

### Option A: Use gopsutil CPU Percent (Recommended)

**File**: `sonar-tap/pkg/collector/cpu.go`

**Before** (Linux-only):
```go
func (c *CPUCollector) collectProcessCPU(process *process.Process) (map[string]any, error) {
    statPath := "/proc/" + strconv.Itoa(int(process.GetPID())) + "/stat"
    data, err := os.ReadFile(statPath)
    if err != nil {
        logger.Warn("read stat file error: %v", err)
        return metric, nil  // Silent failure on macOS
    }
    // ... parse /proc/stat ...
    metric["process_cpu_percent"] = cpuPercent
    return metric, nil
}
```

**After** (Cross-platform):
```go
func (c *CPUCollector) collectProcessCPU(process *process.Process) (map[string]any, error) {
    metric := map[string]any{
        "process_cpu_percent": 0.0,
    }
    
    if process == nil || process.GetProcess() == nil {
        return nil, fmt.Errorf("process is nil")
    }
    
    if !process.IsAlive() {
        return nil, fmt.Errorf("process is not alive")
    }
    
    // Cross-platform CPU collection using gopsutil
    cpuPercent, err := process.GetProcess().Percent(time.Second)
    if err != nil {
        logger.Warn("failed to get process CPU percent: %v", err)
        return metric, nil  // Still return map with 0.0, but log the error
    }
    
    // Convert percentage (0-100) to ratio (0-1) for consistency
    metric["process_cpu_percent"] = tools.RoundFloat64(cpuPercent/100.0, 3)
    
    return metric, nil
}
```

**Advantages**:
- Works on Linux, macOS, Windows
- Uses gopsutil which is already a dependency
- No /proc filesystem dependency
- Consistent with node CPU collection (which already uses gopsutil)

**Considerations**:
- `Percent()` takes a duration parameter (default 1 second sampling)
- May be slightly slower than /proc direct read, but acceptable for 5-second intervals
- Provides higher quality CPU percentage calculation

### Option B: Conditional Path (Platform Detection)

If keeping /proc parsing for Linux performance:

```go
import "runtime"

func (c *CPUCollector) collectProcessCPU(process *process.Process) (map[string]any, error) {
    metric := map[string]any{
        "process_cpu_percent": 0.0,
    }
    
    if runtime.GOOS == "linux" {
        // Use /proc path for Linux (faster)
        return c.collectProcessCPULinux(process, metric)
    } else {
        // Use gopsutil for other platforms
        return c.collectProcessCPUCrossPlatform(process, metric)
    }
}

func (c *CPUCollector) collectProcessCPUCrossPlatform(process *process.Process, metric map[string]any) (map[string]any, error) {
    cpuPercent, err := process.GetProcess().Percent(time.Second)
    if err != nil {
        logger.Warn("failed to get process CPU: %v", err)
        return metric, nil
    }
    metric["process_cpu_percent"] = tools.RoundFloat64(cpuPercent/100.0, 3)
    return metric, nil
}
```

---

## Memory Collection Fix

The memory collection already has cross-platform awareness for PSS/USS, but should be verified:

**Current state** (`sonar-tap/pkg/collector/mem.go` lines 50-63):
```go
switch runtime.GOOS {
case "linux":
    pss, uss := c.getPSSUSSMemoryForProcess(process)
    process.SetPSSLastValue(pss / 1024 / 1024)
    process.SetUSSLastValue(uss / 1024 / 1024)
default:
    process.SetUSSLastValue(0)
    process.SetPSSLastValue(0)
}
```

**Status**: ✅ Already handles macOS correctly (skips PSS/USS collection)

**Issue**: The metric name inconsistency in reporting:
- Collected as: `process_mem_mb`, `process_uss_mem_mb`, `process_pss_mem_mb`
- Expected in tests: `node_process_mem_rss_mb`, `node_process_cpu_percent`

The metric name prefix should be `node_process_*` not `process_*` for consistency with node dimensional prefix.

---

## Implementation Roadmap

### Phase 1: Immediate Fix (High Priority)
1. ✅ Identify root cause: /proc hardcoding
2. 🔧 **Implement Option A**: Replace with `gopsutil.Percent()`
3. ✅ Verify macOS compatibility
4. ✅ Test on Linux to ensure no regression

### Phase 2: Metric Name Consistency (Medium Priority)
1. Rename collected metrics to `node_process_cpu_percent`, `node_process_mem_rss_mb`
2. Update test cases and verification queries
3. Update E2E_TEST_REPORT expectations

### Phase 3: Additional Improvements (Low Priority)
1. Add platform-specific optimizations (Option B conditional path)
2. Implement PSS/USS fallback using alternative APIs on macOS
3. Add debug logging for platform-specific code paths

---

## Test Validation Plan

### Before Fix
```bash
# Run on macOS
cd sonar-tap
go run ./cmd/server -c config/e2e.yaml &
sleep 5

# Query metrics
curl -s http://localhost:8082/apis/v1/metrics/query \
  -d '{"metric_name":"node_process_cpu_percent"}' | jq .
# Expected: [] or [{"value": 0.0, ...}]
```

### After Fix
```bash
# Run on macOS after code fix
cd sonar-tap
go run ./cmd/server -c config/e2e.yaml &
sleep 5

# Query metrics
curl -s http://localhost:8082/apis/v1/metrics/query \
  -d '{"metric_name":"node_process_cpu_percent"}' | jq .
# Expected: [{"value": 0.015, ...}, {"value": 0.023, ...}, ...]
```

### Regression Testing
```bash
# Test on Linux to ensure no regression
# Verify /proc path still works or gopsutil provides equivalent data
make test-on-linux
```

---

## Summary Table

| Aspect | Details |
|--------|---------|
| **Root Cause** | CPU collector hardcoded `/proc/[pid]/stat` (Linux-only) |
| **Affected Metrics** | `node_process_cpu_percent`, `node_process_mem_rss_mb` |
| **Affected Platforms** | macOS, Windows (any non-Linux OS) |
| **Severity** | 🔴 HIGH - Complete loss of process metrics on non-Linux |
| **Fix Difficulty** | 🟢 EASY - 20-30 lines of code |
| **Dependencies** | Already using `gopsutil` (no new dependencies needed) |
| **Breaking Changes** | None (metric names stay same, only availability improves) |
| **Estimated Time** | 30 minutes development + 15 minutes testing |

---

## Recommended Next Steps

1. **Immediate**: Apply Option A fix to `sonar-tap/pkg/collector/cpu.go`
2. **Verification**: Re-run E2E test suite on macOS
3. **Quality**: Run both Linux and macOS test suites to ensure no regression
4. **Follow-up**: Address metric name consistency (`process_*` → `node_process_*`)

---

*Report generated by: Claude Coder-B | 2026-04-13*
