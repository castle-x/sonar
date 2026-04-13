## ADDED Requirements

### Requirement: MetricPoint struct definition
The `metrics.thrift` SHALL define a `MetricPoint` struct with the following fields:
- `timestamp` (required i64): Unix milliseconds
- `name` (required string): metric name
- `value` (required double): metric value
- `labels` (optional map<string,string>): key-value tags

#### Scenario: MetricPoint represents a single data point
- **WHEN** a collector produces a metric (e.g., cpu_usage=45.2 at 1711843200000)
- **THEN** it is represented as `MetricPoint{timestamp: 1711843200000, name: "cpu_usage", value: 45.2, labels: {"host": "srv-01"}}`

### Requirement: ReportMetricsRequest for batch upload
The `metrics.thrift` SHALL define a `ReportMetricsRequest` struct with:
- `app_id` (required string): application identifier
- `metrics` (required list<MetricPoint>): batch of metric points
- `labels` (optional map<string,string>): global labels merged into every point by store

#### Scenario: Tap reports a batch of metrics to store
- **WHEN** tap flushes its buffer (by interval or buffer full)
- **THEN** it sends a `ReportMetricsRequest` containing `app_id`, a list of `MetricPoint`, and global labels

### Requirement: ReportMetricsResponse
The `metrics.thrift` SHALL define a `ReportMetricsResponse` struct with:
- `code` (required i32): 0 for success, non-zero for error
- `message` (optional string): human-readable message

#### Scenario: Store acknowledges successful report
- **WHEN** store receives and persists a valid `ReportMetricsRequest`
- **THEN** it returns `ReportMetricsResponse{code: 0, message: "ok"}`

### Requirement: QueryMetricsRequest for data retrieval (placeholder)
The `metrics.thrift` SHALL define a `QueryMetricsRequest` struct with:
- `name` (required string): metric name to query
- `labels` (optional map<string,string>): label filters
- `start_time` (required i64): query range start (Unix milliseconds)
- `end_time` (required i64): query range end (Unix milliseconds)

#### Scenario: View queries metrics from store
- **WHEN** view requests cpu_usage data for the last hour
- **THEN** it sends `QueryMetricsRequest{name: "cpu_usage", start_time: <1h ago ms>, end_time: <now ms>}`

### Requirement: QueryMetricsResponse
The `metrics.thrift` SHALL define a `QueryMetricsResponse` struct with:
- `code` (required i32): 0 for success
- `message` (optional string): error message
- `metrics` (required list<MetricPoint>): result data points

#### Scenario: Store returns queried metrics
- **WHEN** store receives a valid `QueryMetricsRequest`
- **THEN** it returns `QueryMetricsResponse` with matching `MetricPoint` list

### Requirement: MetricsService definition
The `metrics.thrift` SHALL define a `MetricsService` with:
- `ReportMetrics(ReportMetricsRequest)` → `ReportMetricsResponse`
- `QueryMetrics(QueryMetricsRequest)` → `QueryMetricsResponse`

#### Scenario: Service methods generate HTTP client code
- **WHEN** `gve api generate` is executed
- **THEN** Go HTTP client and TypeScript fetch client are generated with `ReportMetrics` and `QueryMetrics` methods

### Requirement: Thrift file location
The `metrics.thrift` file SHALL be located at `sonar/api/sonar-store/metrics/v1/metrics.thrift` following GVE convention `api/{project}/{resource}/v{N}/`.

#### Scenario: File path follows GVE convention
- **WHEN** `gve api generate` is run from sonar-tap or sonar-store
- **THEN** it finds and processes `api/sonar-store/metrics/v1/metrics.thrift`
