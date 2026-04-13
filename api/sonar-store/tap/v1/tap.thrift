// api/sonar-store/tap/v1/tap.thrift
namespace go sonar_store.tap.v1

include "../../../sonar-store/base/v1/base.thrift"

// =============================================================================
// Tap 状态枚举
// =============================================================================

enum TapState {
    UP = 1,        // 正常运行
    DOWN = 2,      // 已下线/超时
    UNKNOWN = 3,   // 未知状态
}

// =============================================================================
// 数据结构
// =============================================================================

// Tap 信息
struct Tap {
    1: required string id;                          // 唯一标识 (app_id + instance 哈希)
    2: required string app_id;                      // 应用ID
    3: required string instance;                    // 实例标识 (通常为 IP:Port)
    4: optional map<string, string> labels;         // 附加标签
    5: required TapState state;                     // 状态
    6: required i64 last_scrape;                    // 最后上报时间戳(秒)
    7: required i64 first_scrape;                   // 首次上报时间戳(秒)
    8: required i64 scrape_count;                   // 累计上报次数
    9: optional string last_error;                  // 最后错误信息
    10: optional i64 scrape_interval;               // 预期上报间隔(秒)
}

// Tap 汇总统计
struct TapStats {
    1: required i64 total;                          // 总数
    2: required i64 up_count;                       // UP 状态数量
    3: required i64 down_count;                     // DOWN 状态数量
    4: required i64 unknown_count;                  // UNKNOWN 状态数量
}

// =============================================================================
// 请求结构
// =============================================================================

// 查询 Tap 列表请求
struct ListTapsRequest {
    1: optional string app_id (go.tag = "json:\"app_id\" form:\"app_id\"");           // 按 app_id 过滤
    2: optional TapState state (go.tag = "json:\"state\" form:\"state\"");            // 按状态过滤
    3: optional i64 page (go.tag = "json:\"page\" form:\"page\"");                    // 页码 (从1开始)
    4: optional i64 page_size (go.tag = "json:\"page_size\" form:\"page_size\"");     // 每页大小
}

// 获取单个 Tap 请求
struct GetTapRequest {
    1: required string id (go.tag = "json:\"id\" path:\"id\"");                       // Tap ID
}

// 获取 Tap 统计请求
struct GetTapStatsRequest {
    1: optional string app_id (go.tag = "json:\"app_id\" form:\"app_id\"");           // 按 app_id 过滤
}

// =============================================================================
// 响应结构
// =============================================================================

// Tap 列表响应
struct ListTapsResponse {
    1: required list<Tap> taps;                     // Tap 列表
    2: required i64 total;                          // 总数
    3: optional i64 page;                           // 当前页码
    4: optional i64 page_size;                      // 每页大小
}

// 单个 Tap 响应
struct GetTapResponse {
    1: optional Tap tap;                            // Tap 信息
}

// Tap 统计响应
struct GetTapStatsResponse {
    1: required TapStats stats;                     // 统计信息
}

// =============================================================================
// 服务接口定义
// =============================================================================

service TapService {
    // 获取 Tap 列表
    base.Response ListTaps(1: ListTapsRequest request)
        (api.get="/apis/v1/taps");

    // 获取单个 Tap
    base.Response GetTap(1: GetTapRequest request)
        (api.get="/apis/v1/taps/:id");

    // 获取 Tap 统计信息
    base.Response GetTapStats(1: GetTapStatsRequest request)
        (api.get="/apis/v1/taps/stats");
}
