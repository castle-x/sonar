namespace go datasource.mark.v1

include "../../../datasource/base/v1/base.thrift"

// 设置Mark过期请求
struct SetMarkExpiredRequest {
    1: string stress_id (
        go.tag = "json:\"stress_id\" bson:\"stress_id\"",
        vt.min_size = "1"
    ), // 压测ID
}

// Mark列表
struct MarkList {
    1: list<Mark> mark_list (
        go.tag = "json:\"mark_list\""
    ),
}

// Mark资源
struct Mark {
    1: string app_id (
        go.tag = "json:\"app_id\" bson:\"app_id\"",
        vt.min_size = "1"
    ), // 应用ID
    2: i64 start_time (
        go.tag = "json:\"start_time\" bson:\"start_time\""
    ), // 开始时间
    3: i64 end_time (
        go.tag = "json:\"end_time\" bson:\"end_time\""
    ), // 结束时间
    4: optional string error_msg (
        go.tag = "json:\"error_msg,omitempty\" bson:\"error_msg\""
    ), // 错误信息
    5: optional string request_name (
        go.tag = "json:\"request_name,omitempty\" bson:\"request_name\""
    ), // 请求名称
    6: string stress_id (
        go.tag = "json:\"stress_id\" bson:\"stress_id\"",
        vt.min_size = "1"
    ), // 压测ID
}

// 请求指标数据
struct RequestMetrics {
    1: i64 total_num (go.tag = "json:\"total_num\""),
    2: i64 failed_num (go.tag = "json:\"failed_num\""),
    3: i64 rtt_avg_ms (go.tag = "json:\"rtt_avg_ms\""),
    4: i64 rtt_max_ms (go.tag = "json:\"rtt_max_ms\""),
    5: i64 rtt_min_ms (go.tag = "json:\"rtt_min_ms\""),
    6: i64 rtt_p50_ms (go.tag = "json:\"rtt_p50_ms\""),
    7: i64 rtt_p70_ms (go.tag = "json:\"rtt_p70_ms\""),
    8: i64 rtt_p90_ms (go.tag = "json:\"rtt_p90_ms\""),
    9: i64 rtt_p99_ms (go.tag = "json:\"rtt_p99_ms\""),
    10: double qps_avg (go.tag = "json:\"qps_avg\""),
    11: double success_rate (go.tag = "json:\"success_rate\""),
}

// 压测指标项（按 request_name 分组）
struct StressMetricsItem {
    1: string stress_id (go.tag = "json:\"stress_id\""),
    2: string app_id (go.tag = "json:\"app_id\""),
    3: map<string, RequestMetrics> metrics (go.tag = "json:\"metrics\""), // key: request_name
}

// ListMark 响应
struct ListMarkResponse {
    1: list<StressMetricsItem> items (go.tag = "json:\"items\""),
    2: i64 total (go.tag = "json:\"total\""),
}

// Mark服务接口
service MarkService {
    // 创建Mark
    base.Response CreateMark(1: Mark req) (api.post="/apis/v1/mark");

    // 批量创建Mark
    base.Response BatchCreateMark(1: MarkList req) (api.post="/apis/v1/mark/batch");

    // 查询Mark列表
    base.Response ListMark(1: base.QueryRequest req) (api.post="/apis/v1/mark/list");

    // 设置Mark过期（提前结束压测，不再定时上报Metrics数据）
    base.Response SetMarkExpired(1: SetMarkExpiredRequest req) (api.post="/apis/v1/mark/set_expired");
}

