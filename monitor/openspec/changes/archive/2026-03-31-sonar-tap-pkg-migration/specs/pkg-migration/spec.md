# pkg 迁移 spec

## 状态: ✅ 完成

## 目标
将 legacy/exporter/ 的全部 pkg 迁移到 sonar/sonar-tap/，使用新的 `metrics.MetricPoint` 类型。

## 迁移文件清单

| 源文件 | 目标文件 | 改动类型 |
|--------|---------|---------|
| `legacy/exporter/config/config.go` | `sonar/sonar-tap/config/config.go` | 复制+改路径 |
| `legacy/exporter/pkg/metricsbuf/buffer.go` | `sonar/sonar-tap/pkg/metricsbuf/buffer.go` | 复制+改类型 |
| `legacy/exporter/pkg/chanutil/tee.go` | `sonar/sonar-tap/pkg/chanutil/tee.go` | 复制+改类型 |
| `legacy/exporter/pkg/process/process.go` | `sonar/sonar-tap/pkg/process/process.go` | 复制+改路径 |
| `legacy/exporter/pkg/process/processManager.go` | `sonar/sonar-tap/pkg/process/processManager.go` | 复制+改路径 |
| `legacy/exporter/pkg/collector/*.go` | `sonar/sonar-tap/pkg/collector/*.go` | 复制+改路径 |
| `legacy/exporter/pkg/nodeexporter/exporter.go` | `sonar/sonar-tap/pkg/nodeexporter/exporter.go` | 复制+改类型 |
| `legacy/exporter/pkg/configstore/store.go` | `sonar/sonar-tap/pkg/configstore/store.go` | 复制+改路径 |
| `legacy/exporter/pkg/metrics/handler.go` | `sonar/sonar-tap/pkg/metrics/handler.go` | 复制+改类型+ms |
| `legacy/exporter/pkg/watcher/*.go` | `sonar/sonar-tap/pkg/watcher/*.go` | 复制+改路径 |
| `legacy/exporter/pkg/datasource/datasource.go` | `sonar/sonar-tap/pkg/datasource/client.go` | **重写** |
| `legacy/exporter/pkg/api/server.go` | `sonar/sonar-tap/internal/handler/tap_handler.go` | **重写** |
| `legacy/exporter/cmd/exporter/main.go` | `sonar/sonar-tap/cmd/server/main.go` | **重写** |

## 验证结果

- `go build ./...` ✅
- `go vet ./...` ✅
- E2E 测试 26/26 通过 ✅
  - Node 指标: cpu_percent, mem_percent, mem_used_mb, core_cpu, net_traffic, disk_*
  - Process 指标: cpu_percent, mem_mb, uss_mem_mb, pss_mem_mb, disk_*
  - 标签正确: env=e2e_test, pid, server_id=server001, create_date
  - Timestamp 毫秒级 ✅
  - API 接口: health, config, status, preview, debug/regex ✅
