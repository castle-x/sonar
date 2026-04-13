namespace go metrics

// ========== 数据模型 ==========

// MetricPoint 单个指标数据点
struct MetricPoint {
  1: required i64 timestamp,                    // Unix 毫秒时间戳
  2: required string name,                      // 指标名称（如 cpu_usage, avg_fps）
  3: required double value,                     // 指标值
  4: optional map<string, string> labels,       // 标签（pid, host, filename 等）
}

// ========== 上报接口（tap → store） ==========

struct ReportMetricsRequest {
  1: required string app_id,                    // 应用标识
  2: required list<MetricPoint> metrics,        // 批量指标数据
  3: optional map<string, string> labels,       // 全局标签（store 侧合并到每个点）
}

struct ReportMetricsResponse {
  1: required i32 code,                         // 0 成功，非 0 失败
  2: optional string message,                   // 描述信息
}

// ========== 查询接口（view → store，预留） ==========

struct QueryMetricsRequest {
  1: required string name,                      // 查询的指标名称
  2: optional map<string, string> labels,       // 标签过滤条件
  3: required i64 start_time,                   // 查询起始时间（Unix 毫秒）
  4: required i64 end_time,                     // 查询结束时间（Unix 毫秒）
}

struct QueryMetricsResponse {
  1: required i32 code,                         // 0 成功，非 0 失败
  2: optional string message,                   // 描述信息
  3: required list<MetricPoint> metrics,        // 查询结果
}

// ========== 服务接口 ==========

service MetricsService {
  ReportMetricsResponse ReportMetrics(1: ReportMetricsRequest req),
  QueryMetricsResponse QueryMetrics(1: QueryMetricsRequest req),
}
