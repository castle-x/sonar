// api/sonar-store/metrics/v1/metrics.thrift
namespace go sonar_store.metrics.v1

include "../../../sonar-store/base/v1/base.thrift"

// =============================================================================
// 基础数据结构
// =============================================================================

// 上报用的指标数据点
struct MetricPoint {
    1: required i64 timestamp;                      // 时间戳(秒)
    2: required double value;                       // 指标值

    // 三种模式选择（优先级递减）
    3: optional string name;                        // 指标名称（创建新Series时必需）
    4: optional map<string, string> labels;         // 额外标签（创建新Series时使用），兼容老的上报结构
    5: optional list<string> label_list;            // 新的接收结构
}

// 存储统计信息
struct StorageStats {
    1: required i64 total_series;         // 总序列数
    2: required i64 disk_size;            // 磁盘占用大小(字节)
    3: required i32 retention_days;       // 数据保留天数
    4: required i64 total_samples;        // 采样点总数
    5: required i64 total_blocks;         // 块总数
    6: required string min_time_date;     // 最小时间日期字符串
    7: required string max_time_date;     // 最大时间日期字符串
    8: required i64 min_time;             // 最小时间戳
    9: required i64 max_time;             // 最大时间戳
}

// =============================================================================
// 请求结构
// =============================================================================

// 灵活的批量指标上报请求
struct ReportMetricsRequest {
    1: required string app_id;                             // 强制上传的标签，标识项目
    2: optional map<string, string> labels;                // 基础标签(与list二选1)
    3: optional list<string> label_list;                   // 新的基础标签(与字典二选1)
    4: required list<MetricPoint> metrics;                 // 指标列表
}

// 查询条件
struct MetricQuery {
    1: required string app_id (go.tag = "json:\"app_id\""),               // 标识项目
    2: optional string metric_name (go.tag = "json:\"metric_name\""),       // 指标名称 (可选)
    3: required i64 start_time (go.tag = "json:\"start_time\""),           // 开始时间戳(秒)
    4: required i64 end_time (go.tag = "json:\"end_time\""),              // 结束时间戳(秒)
    5: optional list<string> labels (go.tag = "json:\"labels\""),        // 标签过滤条件
    6: optional string promql (go.tag = "json:\"promql\""),               // PromQL查询语句 (可选，优先级高于其他条件)
    7: optional i64 limit (go.tag = "json:\"limit\""),                   // 限制返回数量(可选)
}

// 获取统计信息请求
struct GetStatsRequest {
    1: optional string app_id;           // 应用ID (可选，用于获取特定应用的统计)
}

// =============================================================================
// 响应结构
// =============================================================================

// 灵活的指标上报响应
struct ReportMetricResponse {
    1: required i32 code;                                // 响应码，0表示成功
    2: required string message;                          // 响应消息
    3: optional string request_id;                       // 请求ID
    4: optional i64 timestamp;                           // 响应时间戳
}

// 查询结果
struct QueryMetricsResponse {
    3: optional list<MetricPoint> points;   // 查询结果数据点
    4: required i64 total_count;                 // 总数据点数量
    5: optional i64 start_time;                  // 实际查询开始时间
    6: optional i64 end_time;                    // 实际查询结束时间
    7: optional string request_id;               // 请求ID
}

// 获取统计信息响应
struct GetStatsResponse {
    3: optional StorageStats stats;      // 统计信息
    4: optional string request_id;       // 请求ID
}

// =============================================================================
// 异常定义
// =============================================================================

// 业务异常
exception BusinessException {
    1: required i32 code;                // 错误码
    2: required string message;          // 错误消息
    3: optional string detail;           // 详细错误信息
}

// 系统异常
exception SystemException {
    1: required i32 code;                // 错误码
    2: required string message;          // 错误消息
    3: optional string stack_trace;      // 堆栈跟踪
}

// =============================================================================
// 服务接口定义
// =============================================================================

// 指标服务
service MetricsService {
    // 批量上报指标
    ReportMetricResponse ReportMetrics(1: ReportMetricsRequest request)
        throws (1: BusinessException be, 2: SystemException se)
        (api.post="/apis/v1/metrics/batch");

    // 查询指标数据
    base.Response QueryMetrics(1: MetricQuery request)
        throws (1: BusinessException be, 2: SystemException se)
        (api.post="/apis/v1/metrics/query");

    // 获取存储统计信息
    base.Response GetStats(1: GetStatsRequest request)
        throws (1: BusinessException be, 2: SystemException se)
        (api.post="/apis/v1/metrics/query_stats");
}
