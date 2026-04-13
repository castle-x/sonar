# sonar-tap pkg 迁移设计

## 类型映射

| 旧类型（legacy） | 新类型（sonar-tap） |
|---|---|
| `v1.RequestMetricPoint` | `metrics.MetricPoint` |
| `*string Name`（指针） | `string Name`（值） |
| `Timestamp` 混用秒/毫秒 | `Timestamp` 统一毫秒 |
| `import v1 "exporter/pkg/datasource/apis/metrics/v1"` | `import metrics "sonar-tap/internal/api/sonar-store/metrics/v1"` |

## 迁移顺序（按依赖层级）

### Phase 1: 基础层
1. `config/` — module 路径 `exporter/config` → `sonar-tap/config`
2. `pkg/metricsbuf/` — `*v1.RequestMetricPoint` → `*metrics.MetricPoint`，去掉指针解引用
3. `pkg/chanutil/` — channel 类型切换

### Phase 2: 采集层
4. `pkg/process/` — 保留完整 getter/setter 用于 collector 状态管理
5. `pkg/collector/` — cpu/mem/network/disk，import 路径更新

### Phase 3: 组合层
6. `pkg/nodeexporter/` — `&name` → 直接赋值 `Name: metric.MetricName`
7. `pkg/configstore/` — import 路径更新
8. `pkg/metrics/` — `Name: &h.metricConfig.Name` → `Name: h.metricConfig.Name`；density 比较改为毫秒
9. `pkg/watcher/` — import 路径全改，manager 引用新 metrics handler

### Phase 4: 上报客户端（重写）
10. `pkg/datasource/` — 标准 `net/http` POST，`ReportMetricsRequest` JSON 序列化

### Phase 5: API + 入口（重写）
11. `internal/handler/` — 标准 `net/http.ServeMux` 实现管理 API
12. `cmd/server/main.go` — 组装所有 subsystem

## 依赖变更

| 依赖 | 处理 |
|------|------|
| `github.com/cloudwego/hertz` | **移除** |
| `github.com/apache/thrift` | **移除** |
| `github.com/spf13/cobra` | **移除** |
| `git.woa.com/castlexu/goutils` | 保留 |
| `github.com/shirou/gopsutil/v4` | 保留 |
| `github.com/fsnotify/fsnotify` | 保留 |
| `gopkg.in/yaml.v3` | 保留 |
