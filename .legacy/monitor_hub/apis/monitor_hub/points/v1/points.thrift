namespace go monitor_hub.points.v1

include "../../../monitor_hub/base/v1/base.thrift"

struct QueryPointFilter {
    1: optional string name;
    2: optional list<string> labels;
}

// ============================================
// 查询请求
// ============================================
struct QueryPointsRequest {
    // ============================================
    // 必填字段
    // ============================================
    
    1: string datasource_id (
        go.tag = "json:\"datasource_id\" query:\"datasource_id\"",
        vt.min_size = "1",
        vt.max_size = "100"
    ),                                          // 数据源ID（必填）
    
    2: list<string> levels (
        go.tag = "json:\"levels\" query:\"levels\"",
        vt.min_size = "1",
        vt.max_size = "10"
    ),                                          // 聚合级别列表（必填）：["15s", "1m", "5m"] 等
    
    // ============================================
    // 可选字段
    // ============================================
    
    3: optional i64 start_time (
        go.tag = "json:\"start_time,omitempty\" query:\"start_time\"",
        vt.ge = "0"
    ),                                          // 开始时间（Unix 毫秒时间戳，可选）
    
    4: optional i64 end_time (
        go.tag = "json:\"end_time,omitempty\" query:\"end_time\"",
        vt.ge = "0"
    ),                                          // 结束时间（Unix 毫秒时间戳，可选）
    
   
    5: optional list<QueryPointFilter> filters (
        go.tag = "json:\"filters,omitempty\""
    ),                                          // 指标、标签过滤器，每个元素产生1个查询请求
    
    6: optional i32 limit (
        go.tag = "json:\"limit,omitempty\" query:\"limit\"",
        vt.ge = "1",
        vt.le = "100000"
    ),                                          // 返回数量限制（可选，默认10000，最多100000）
    
    7: optional string data_status (
        go.tag = "json:\"data_status,omitempty\" query:\"data_status\"",
        vt.in = "complete", vt.in = "partial", vt.in = "degraded", vt.in = "missing"
    ),                                          // 数据质量过滤（可选）：complete/partial/degraded/missing
    
    8: optional list<string> aggregation_types (
        go.tag = "json:\"aggregation_types,omitempty\" query:\"aggregation_types\"",
        vt.max_size = "5"
    ),                                          // 聚合类型列表（可选）：["avg", "min", "max", "count", "last"]
}

struct SummaryTable {
    1: string name( go.tag = "json:\"name,omitempty\" query:\"name\"" ),
    2: list<list<string>> table( go.tag = "json:\"table,omitempty\" query:\"table\"" )
}

// ============================================
// 服务定义
// ============================================

service PointsService {
    // 查询聚合数据点（用于调试）
    // 
    // 功能：查询最新的聚合数据点，支持按级别、指标名称、标签、数据质量过滤
    // 
    // 示例：
    //   - 查询所有最新的 100 条数据：{}
    //   - 查询特定级别：{"level": "1m"}
    //   - 查询特定指标：{"metric_name": "cpu_usage"}
    //   - 查询特定标签：{"labels":[["app_id""my_app"] , ["host", "server1"]]
    //   - 组合查询：{"level": "5m", "metric_name": "memory_usage", "limit": 50}
    base.Response QueryPoints(1: QueryPointsRequest req) (api.post="/apis/v1/points/query");
}
