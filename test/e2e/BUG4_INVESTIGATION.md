# Bug #4 排查报告：macOS 下 Process 指标为 0

**排查时间**: 2026-04-10  
**排查人**: Coder-B  
**平台**: macOS (darwin)  
**涉及模块**: `sonar-tap/pkg/collector/cpu.go`, `sonar-tap/pkg/collector/mem.go`

---

## 1. 根本原因（一句话结论）

**CPU 采集器硬编码读取 Linux 专属的 `/proc/[pid]/stat` 文件**，在 macOS 上无该文件系统，读取失败后静默返回 0 值；同时，tap 内部存储指标名（`process_cpu_percent`、`process_mem_mb`）与 store 侧查询名（`node_process_cpu_percent`、`node_process_mem_rss_mb`）**完全不匹配**，导致查询返回 0 条记录。

实际上存在**两个独立 Bug**，叠加导致现象：
- Bug A：CPU 采集器不跨平台（macOS 无 `/proc`）→ 值永远为 0
- Bug B：指标命名不一致 → 查询时名称匹配不上，返回 0 条记录

---

## 2. 代码路径（文件:行号 → 触发链路）

### Bug A：CPU 采集硬编码 `/proc`

```
sonar-tap/pkg/nodeexporter/exporter.go:121  ProcessExporter.Record()
  └─ c.CollectProcess(proc)                  # 遍历每个进程，调用所有 Collector
       └─ sonar-tap/pkg/collector/cpu.go:50  CPUCollector.CollectProcess()
            └─ cpu.go:87  collectProcessCPU()
                 └─ cpu.go:99  statPath := "/proc/" + strconv.Itoa(int(process.GetPID())) + "/stat"
                      └─ cpu.go:100 os.ReadFile(statPath)
                           ├─ macOS: 返回 error "open /proc/76961/stat: no such file or directory"
                           └─ cpu.go:101-104: err != nil → logger.Warn() 后 return metric（值为 0.0）
```

关键代码段（`cpu.go:87-104`）：

```go
func (c *CPUCollector) collectProcessCPU(process *process.Process) (map[string]any, error) {
    metric := map[string]any{
        "process_cpu_percent": 0.0,   // 初始化为 0
    }
    // ...
    statPath := "/proc/" + strconv.Itoa(int(process.GetPID())) + "/stat"  // L99: Linux only!
    data, err := os.ReadFile(statPath)
    if err != nil {
        logger.Warn("read stat file error: %v", err)
        return metric, nil  // L103-104: 返回 0 值，不返回 error
    }
    // ...
}
```

**核心问题**：
- macOS 没有 `/proc` 虚拟文件系统
- 失败时返回 `metric`（含 `"process_cpu_percent": 0.0`），**不返回 error**
- 调用方 `ProcessExporter.Record()` 无法区分"正常采到 0"和"采集失败"
- 结果：CPU 指标以 value=0 写入 TSDB，每次采集均如此

---

### Bug B：指标命名不一致

**tap 侧写入的指标名**（来自 collector 返回的 map key）：

| 文件 | 行号 | tap 内指标名 |
|------|------|------------|
| `cpu.go:88` | L88 | `process_cpu_percent` |
| `mem.go:57` | L57 | `process_mem_mb` |
| `mem.go:58` | L58 | `process_uss_mem_mb` |
| `mem.go:59` | L59 | `process_pss_mem_mb` |

**store 侧查询使用的名称（外部已知）**：

| 查询名 | 实际存储名 | 是否匹配 |
|--------|-----------|---------|
| `node_process_cpu_percent` | `process_cpu_percent` | ❌ 不匹配 |
| `node_process_cpu_ratio` | `process_cpu_percent` | ❌ 不匹配 |
| `node_process_mem_rss_mb` | `process_mem_mb` | ❌ 不匹配 |

写入链路（`exporter.go:128-134`）：

```go
for k, v := range procMetrics {
    ch <- &metrics.MetricPoint{
        Timestamp: timestamp,
        Name:      k,          // map key 直接作为 metric name 写入
        Value:     val,
        Labels:    proc.GetLabels(),
    }
}
```

---

## 3. 为何 0 值未写入 TSDB / 查询返回 0 条

### 结论：0 值实际上 IS 写入了 TSDB，但查询用了错误的名称

**存储层不过滤 0 值**（`sonar-store/pkg/storage/prometheus.go:169-209`）：

```go
func (s *PrometheusStorage[T]) Write(ctx context.Context, points []T, labels ...string) error {
    for _, point := range points {
        value := s.serializer.ToValue(point)   // 直接取值，无 0 值过滤
        if timestamp <= 0 {                     // 只过滤无效时间戳
            continue
        }
        s.dataChan <- &pendingDataPoint{...value: value}  // 0.0 被正常写入
    }
}
```

**实际情况分析**：

| 指标 | 是否写入 TSDB | 查询 `node_process_cpu_percent` | 查询 `process_cpu_percent` |
|------|------------|--------------------------------|---------------------------|
| CPU (macOS) | ✅ 写入，但值永远 = 0.0 | ❌ 0 条（名称不匹配） | ✅ 有记录，但值全为 0 |
| Mem RSS (macOS) | ✅ 写入，值为真实 RSS | ❌ 0 条（名称不匹配） | ✅ 有记录，值正常非零 |

**重要发现**：内存 RSS（`process_mem_mb`）在 macOS 上**实际采集正常**，因为 `mem.go:67` 使用的是 gopsutil 的 `MemoryInfo()` API（跨平台）：

```go
memInfo, err := process.GetProcess().MemoryInfo()  // gopsutil - macOS 支持 ✅
physicalMem = float64(memInfo.RSS) / 1024 / 1024
```

只是因为命名不一致，查询 `node_process_mem_rss_mb` 找不到记录。

---

## 4. gopsutil v4 是否可以替代 /proc 读取

**结论：完全可以，且应当替代。**

项目已引入 `github.com/shirou/gopsutil/v4 v4.25.7`（`go.mod:8`），该版本对 macOS 有完整支持：

| API | macOS 支持 | Linux 支持 | 说明 |
|-----|-----------|-----------|------|
| `proc.CPUPercent(interval)` | ✅ | ✅ | 直接返回 CPU 使用率百分比 |
| `proc.Times()` | ✅ | ✅ | 返回 `TimesStat{User, System, ...}` |
| `proc.MemoryInfo()` | ✅ | ✅ | 返回 RSS/VMS（已在 mem.go 中使用） |
| `proc.MemoryInfoEx()` | ✅ macOS | ✅ Linux | 扩展内存（USS/PSS 等） |

当前 `cpu.go` 已经为节点级 CPU 正确使用了 gopsutil（`cpu.Percent()`），但进程级 CPU 却绕过了 gopsutil 去手动读 `/proc`，这是明显的实现不一致。

**gopsutil `CPUPercent()` 工作原理**（macOS）：
- 通过 `proc_pidinfo` syscall 获取进程 CPU ticks
- 两次采样差值除以时间差，自动处理跨平台差异
- interval=0 时需要连续调用两次获取差值（类似当前手动实现的逻辑）

---

## 5. 修复方案建议

### Fix A：替换 CPU 采集为 gopsutil（跨平台）

**文件**: `sonar-tap/pkg/collector/cpu.go`

**改动方向**：删除 L99-118（手动读 `/proc/stat` 的全部逻辑），改用 gopsutil：

```go
func (c *CPUCollector) collectProcessCPU(p *process.Process) (map[string]any, error) {
    metric := map[string]any{
        "node_process_cpu_ratio": 0.0,  // 同步修正命名
    }
    if p == nil || p.GetProcess() == nil {
        return nil, fmt.Errorf("process is nil")
    }
    if !p.IsAlive() {
        return nil, fmt.Errorf("process is not alive")
    }

    // 使用 gopsutil Times() 实现两次采样差值计算（跨平台）
    times, err := p.GetProcess().Times()
    if err != nil {
        logger.Warn("get process cpu times error: %v", err)
        return metric, nil
    }
    totalTime := times.User + times.System

    now := time.Now().UnixNano()
    if p.GetLastCPUTime() == 0 || p.GetLastSampleTime() == 0 {
        p.SetLastCPUTime(totalTime)
        p.SetLastSampleTime(now)
        return metric, nil  // 第一次采集，无差值
    }

    cpuDelta := totalTime - p.GetLastCPUTime()
    timeDelta := float64(now-p.GetLastSampleTime()) / 1e9
    if timeDelta < 0.01 {
        return metric, nil
    }
    cpuRatio := cpuDelta / timeDelta  // ratio，非百分比
    if cpuRatio > 10.0 {
        p.SetLastCPUTime(0)
        p.SetLastSampleTime(0)
        return metric, nil
    }
    p.SetLastCPUTime(totalTime)
    p.SetLastSampleTime(now)
    metric["node_process_cpu_ratio"] = tools.RoundFloat64(math.Max(0, cpuRatio), 3)
    return metric, nil
}
```

**优点**：
- 彻底移除 `/proc` 依赖
- macOS/Linux/Windows 均可工作
- 逻辑与原有差值计算方式一致（仅数据来源从 `/proc/stat` 改为 gopsutil `Times()`）

---

### Fix B：统一指标命名（加 `node_process_` 前缀）

**文件**: `sonar-tap/pkg/collector/cpu.go` 和 `mem.go`

修改 map key，统一使用 `node_process_` 前缀：

| 当前名称 | 修改为 |
|---------|--------|
| `process_cpu_percent` | `node_process_cpu_ratio` |
| `process_mem_mb` | `node_process_mem_rss_mb` |
| `process_uss_mem_mb` | `node_process_mem_uss_mb` |
| `process_pss_mem_mb` | `node_process_mem_pss_mb` |

---

### Fix C（可选）：增加 macOS 下 USS 内存支持

**文件**: `sonar-tap/pkg/collector/mem.go:78-88`

当前 `default` 分支（macOS）直接设 0：
```go
default:
    process.SetUSSLastValue(0)
    process.SetPSSLastValue(0)
```

可改为使用 gopsutil `MemoryInfoEx()` 获取更多内存字段（macOS 提供 `Shared` 等字段），或保持当前行为（只上报 RSS，USS/PSS 用 0 表示不支持）——后者更清晰。

---

## 6. 预计修复工作量

| 任务 | 工作量 | 说明 |
|------|--------|------|
| Fix A：cpu.go 替换 gopsutil Times() | 1h | 逻辑清晰，主要是删除旧代码、替换数据源 |
| Fix B：统一 4 个指标命名 | 0.5h | 简单字符串改动，但需同步更新 store 查询侧 |
| Fix C：验证 macOS 端对端正常 | 0.5h | 本地 macOS 跑 sonar-tap + mock 进程验证 |
| **总计** | **2h** | 包含测试验证 |

---

## 附：完整调用链汇总

```
ProcessExporter.Record()                          [exporter.go:116]
  └─ CPUCollector.CollectProcess(proc)            [exporter.go:125]
       └─ collectProcessCPU(proc)                 [cpu.go:50-51]
            ├─ [macOS] os.ReadFile("/proc/PID/stat") → error
            │    └─ return {"process_cpu_percent": 0.0}, nil
            └─ [Linux] 读取成功 → 计算差值 → 正常值
  └─ MetricPoint{Name: "process_cpu_percent", Value: 0.0}  写入 channel
       └─ datasource/client.go flushMetrics()     → POST /api/metrics/v1/ReportMetrics
            └─ sonar-store Write()                [prometheus.go:169]
                 └─ 0.0 写入 TSDB（无过滤）

查询 "node_process_cpu_percent" → 0条  ← 名称不匹配（实际存 "process_cpu_percent"）
查询 "process_cpu_percent"     → 有记录，但值全为 0.0（macOS）
```
