## 1. 创建 Thrift IDL 文件

- [x] 1.1 创建目录 `sonar/api/sonar-store/metrics/v1/`
- [x] 1.2 编写 `metrics.thrift`：定义 `MetricPoint`、`ReportMetricsRequest/Response`、`QueryMetricsRequest/Response`、`MetricsService`
- [x] 1.3 验证 thrift 语法正确（namespace go、required/optional、字段编号）

## 2. 在 sonar-tap 中生成代码

- [x] 2.1 在 sonar-tap 中配置 API 契约路径（`gve api add sonar-store/metrics` 或手动创建 `api/` 软链/目录）
- [x] 2.2 运行 `gve api generate`，生成 Go struct 到 `internal/api/sonar-store/metrics/v1/`
- [x] 2.3 运行 `gve api generate`，生成 TS client 到 `site/src/api/sonar-store/metrics/v1/`
- [x] 2.4 验证生成的 Go 代码编译通过（`go build ./...`）

## 3. 在 sonar-store 中生成代码

- [x] 3.1 在 sonar-store 中配置 API 契约路径
- [x] 3.2 运行 `gve api generate`，生成 Go struct 到 `internal/api/sonar-store/metrics/v1/`
- [x] 3.3 验证生成的 Go 代码编译通过（`go build ./...`）

## 4. 验证

- [x] 4.1 确认 `MetricPoint.Timestamp` 生成为 `int64`（对应 i64）
- [x] 4.2 确认 `MetricPoint.Name` 生成为 `string`（非指针，对应 required string）
- [x] 4.3 确认 `MetricPoint.Labels` 生成为 `map[string]string`（对应 optional map，带 omitempty）
- [x] 4.4 确认 Go HTTP client 有 `ReportMetrics` 和 `QueryMetrics` 方法
- [x] 4.5 确认 TS client 有 `ReportMetrics` 和 `QueryMetrics` 方法
