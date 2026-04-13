namespace go monitor_hub.report.v1

include "../../../monitor_hub/base/v1/base.thrift"

// 查询过滤器（参考 points 的过滤逻辑）
struct QueryFilter {
    1: optional string name( go.tag = "json:\"name,omitempty\" bson:\"name,omitempty\"");                    // 指标名称过滤
    2: optional list<string> labels( go.tag = "json:\"labels,omitempty\" bson:\"labels,omitempty\"");            // 标签过滤（偶数个元素，key-value对）
}

// 数据查询配置（用于重新聚合）
struct QueryConfig {
    1: required i64 start_time( go.tag = "json:\"start_time\" bson:\"start_time\"");                 // 测试开始时间（毫秒时间戳）
    2: required i64 end_time( go.tag = "json:\"end_time\" bson:\"end_time\"");                   // 测试结束时间（毫秒时间戳）
    3: required string aggregation_interval( go.tag = "json:\"aggregation_interval\" bson:\"aggregation_interval\"");    // 聚合间隔，如 "15s", "1m", "1h"
    4: optional list<QueryFilter> filters( go.tag = "json:\"filters,omitempty\" bson:\"filters,omitempty\"");      // 查询过滤器列表（参考 QueryPointsRequest）
    5: optional list<string> rate_metrics( go.tag = "json:\"rate_metrics,omitempty\" bson:\"rate_metrics,omitempty\"");  // [报告专用] 需要计算 rate（每分钟频率）的指标名列表
}

// 单个指标的 rate 统计结果
struct RateStatistic {
    1: required string metric_name( go.tag = "json:\"metric_name\" bson:\"metric_name\"");           // 指标名称
    2: required double rate( go.tag = "json:\"rate\" bson:\"rate\"");                               // 每分钟出现次数
    3: required i64 total_count( go.tag = "json:\"total_count\" bson:\"total_count\"");             // 总数据点数
    4: required double duration_minutes( go.tag = "json:\"duration_minutes\" bson:\"duration_minutes\"");  // 统计时长（分钟）
    5: optional map<string, double> by_label( go.tag = "json:\"by_label,omitempty\" bson:\"by_label,omitempty\"");  // 按标签分组的 rate（可选扩展）
}

// 用例的 rate 统计列表
struct CaseRateStatistics {
    1: required string case_name( go.tag = "json:\"case_name\" bson:\"case_name\"");                // 用例名称
    2: required list<RateStatistic> statistics( go.tag = "json:\"statistics\" bson:\"statistics\"");  // rate 统计列表
}

// 单个测试用例（每个用例对应一个或多个chunk数据块）
struct SingleCase {
    1: required string stress_id( go.tag = "json:\"stress_id\" bson:\"stress_id\"");               // 压测ID（标识本次压测）
    2: required string name( go.tag = "json:\"name\" bson:\"name\"");                    // 用例名称
    3: optional string desc( go.tag = "json:\"desc,omitempty\" bson:\"desc,omitempty\"");                    // 文本描述
    4: required QueryConfig query_config( go.tag = "json:\"query_config\" bson:\"query_config\"");       // 查询和聚合配置

    // 响应返回给前端，用于查询该用例的最终数据
    5: optional string chunk_id( go.tag = "json:\"chunk_id,omitempty\" bson:\"chunk_id,omitempty\"");                // [废弃，向后兼容] 单个数据块ID
    6: optional CaseRateStatistics rate_statistics( go.tag = "json:\"rate_statistics,omitempty\" bson:\"rate_statistics,omitempty\"");  // [报告专用] rate 统计结果
    7: optional list<string> chunk_ids( go.tag = "json:\"chunk_ids,omitempty\" bson:\"chunk_ids,omitempty\"");   // 数据块ID列表（支持大数据分片存储）
}

struct Chunk {
    1: required string report_id( go.tag = "json:\"report_id\" bson:\"report_id\"");                // 关联的报告ID
    2: required string stress_id( go.tag = "json:\"stress_id\" bson:\"stress_id\"");                // 压测ID
    3: required binary compressed_data( go.tag = "json:\"compressed_data\" bson:\"compressed_data\"");          // gzip压缩的PointsResponse JSON（分片时为压缩数据的一部分）
    4: required i64 original_size( go.tag = "json:\"original_size\" bson:\"original_size\"");               // 压缩前大小（字节）
    5: required i32 point_count( go.tag = "json:\"point_count\" bson:\"point_count\"");                 // 数据点数量
    6: required i32 metric_count( go.tag = "json:\"metric_count\" bson:\"metric_count\"");                // 指标数量
    7: optional i32 part_index( go.tag = "json:\"part_index,omitempty\" bson:\"part_index,omitempty\"");   // 分片索引（从0开始），nil表示未分片（兼容旧数据）
    8: optional i32 total_parts( go.tag = "json:\"total_parts,omitempty\" bson:\"total_parts,omitempty\""); // 总分片数，nil表示未分片（兼容旧数据）
}

// 用于在生成报告时备份一些可选项
struct MetricInfo {
    1: optional list<string> metric_name_list; // 当前报告中存在的指标列表，用于评分标准配置时可选
}

// 报告（总的归档记录）
struct Report {
    1: required string name( go.tag = "json:\"name\" bson:\"name\"");                    // 报告名称
    2: optional string description( go.tag = "json:\"description,omitempty\" bson:\"description,omitempty\"");             // 报告描述
    3: required list<SingleCase> cases( go.tag = "json:\"cases\" bson:\"cases\"");         // 一或多个测试用例
    4: optional list<string> extra_info( go.tag = "json:\"extra_info,omitempty\" bson:\"extra_info,omitempty\"");  // 扩展信息（项目、版本、测试人员等）
    5: required string create_type( go.tag = "json:\"create_type\" bson:\"create_type\"");             // 归档方式："api_call" | "web_manual" | "scheduled"
    6: optional string operator( go.tag = "json:\"operator,omitempty\" bson:\"operator,omitempty\"");                // 操作人
    7: optional list<string> tags( go.tag = "json:\"tags,omitempty\" bson:\"tags,omitempty\"");              // 标签，用于分类和检索
    8: required string datasource_id( go.tag = "json:\"datasource_id\" bson:\"datasource_id\"");           // 数据源ID<一份报告的数据只能来源于1个>
    // 响应时返回，同时也会存储到数据库
    9: optional ReportStatus report_status( go.tag = "json:\"report_status,omitempty\" bson:\"report_status,omitempty\"");     // 报告状态信息
    10: optional string app_id (go.tag = "json:\"app_id,omitempty\" bson:\"app_id,omitempty\"");
    11: optional string datasource_name(go.tag = "json:\"datasource_name,omitempty\" bson:\"datasource_name,omitempty\"");
    12: optional string duration(go.tag = "json:\"duration,omitempty\" bson:\"duration,omitempty\"");
    13: optional string icon_name(go.tag = "json:\"icon_name,omitempty\" bson:\"icon_name,omitempty\"");
    14: optional string test_timeline(go.tag = "json:\"test_timeline,omitempty\" bson:\"test_timeline,omitempty\"");
    15: optional string report_icon_name(go.tag = "json:\"report_icon_name,omitempty\" bson:\"report_icon_name,omitempty\"");
    16: optional ReportScoringConfig scoring_config(go.tag = "json:\"scoring_config,omitempty\" bson:\"scoring_config,omitempty\"");  // 评分配置
    17: optional ReportScore report_score(go.tag = "json:\"report_score,omitempty\" bson:\"report_score,omitempty\"");  // 评分结果（计算后存储）
    18: optional MetricInfo metric_info (go.tag = "json:\"metric_info,omitempty\" bson:\"metric_info,omitempty\"" ) // 可选项
    19: optional bool release(go.tag = "json:\"release,omitempty\" bson:\"release,omitempty\"");  // 发布标记：true=已发布(正式报告)，false/nil=未发布(测试报告)
    20: optional list<string> file_list(go.tag = "json:\"file_list\" bson:\"file_list,omitempty\"");  // 关联文件列表（文件管理中的文件路径）
}

// 报告处理进度
struct ReportStatus {
    1: required string status( go.tag = "json:\"status,omitempty\" bson:\"status\"");                  // 状态："running" | "completed" | "failed"
    2: required string error_msg( go.tag = "json:\"error_msg,omitempty\" bson:\"error_msg\"");         // 错误信息
    3: required string task_id( go.tag = "json:\"task_id,omitempty\" bson:\"task_id\"");               // 任务ID
}

// ============================================
// 报告评分相关结构
// ============================================

// 评分区间配置（用于区间评分类型）
struct ScoringRange {
    1: required double min( go.tag = "json:\"min\" bson:\"min\"");                                    // 区间最小值
    2: required double max( go.tag = "json:\"max\" bson:\"max\"");                                    // 区间最大值
    3: required i32 score( go.tag = "json:\"score\" bson:\"score\"");                                 // 该区间得分（0-100）
    4: required string label( go.tag = "json:\"label\" bson:\"label\"");                              // 描述（优秀/良好/正常/繁忙/危险）
    5: required string color( go.tag = "json:\"color\" bson:\"color\"");                              // 颜色（用于UI展示，如 "#10b981"）
    6: required string level( go.tag = "json:\"level\" bson:\"level\"");                              // 健康等级（excellent/good/normal/warning/danger）
}

// 阈值条件配置（用于阈值评分类型）
// 例如：失败数=0得100分，失败数<10得80分，失败数>=10得40分
struct ThresholdCondition {
    1: required string operator( go.tag = "json:\"operator\" bson:\"operator\"");                     // 比较运算符: "<", "<=", "=", ">=", ">"
    2: required double value( go.tag = "json:\"value\" bson:\"value\"");                              // 阈值
    3: required i32 score( go.tag = "json:\"score\" bson:\"score\"");                                 // 该条件对应的分数（0-100）
    4: required string label( go.tag = "json:\"label\" bson:\"label\"");                              // 描述（优秀/良好/正常/警告/危险）
    5: required string color( go.tag = "json:\"color\" bson:\"color\"");                              // 颜色（用于UI展示）
    6: required string level( go.tag = "json:\"level\" bson:\"level\"");                              // 健康等级（excellent/good/normal/warning/danger）
}

// 指标评分配置（与数据源指标配置结构保持一致）
struct MetricScoringConfig {
    1: required string name( go.tag = "json:\"name\" bson:\"name\"");                                 // 指标名称（如 "cpu_usage"）
    2: optional string alias( go.tag = "json:\"alias,omitempty\" bson:\"alias,omitempty\"");          // 别名/显示名称（如 "CPU使用率"），用于匹配表格列名
    3: optional string unit( go.tag = "json:\"unit,omitempty\" bson:\"unit,omitempty\"");             // 单位（如 "%", "ms"）
    4: optional string transform( go.tag = "json:\"transform,omitempty\" bson:\"transform,omitempty\"");  // 转换表达式（仅作为说明，继承自groupmap，评分时不应用）
    5: required double weight( go.tag = "json:\"weight\" bson:\"weight\"");                           // 权重系数（任意正数，系统自动归一化）
    6: required list<string> aggregation_types( go.tag = "json:\"aggregation_types\" bson:\"aggregation_types\"");  // 聚合类型列表（avg/max/min/count/last，source=rate时为rate）
    7: required string scoring_type( go.tag = "json:\"scoring_type\" bson:\"scoring_type\"");         // 评分类型: "range"（区间）或 "threshold"（阈值）
    8: optional list<ScoringRange> ranges( go.tag = "json:\"ranges,omitempty\" bson:\"ranges,omitempty\"");  // 评分区间列表（scoring_type="range" 时使用）
    9: optional list<ThresholdCondition> thresholds( go.tag = "json:\"thresholds,omitempty\" bson:\"thresholds,omitempty\"");  // 阈值条件列表（scoring_type="threshold" 时使用）
    10: optional string source( go.tag = "json:\"source,omitempty\" bson:\"source,omitempty\"");      // 数据来源: "summary"（汇总表格，默认）或 "rate"（Rate统计）
    11: optional string na_handling( go.tag = "json:\"na_handling,omitempty\" bson:\"na_handling,omitempty\"");  // N/A处理策略: "skip"（跳过，默认）, "as_zero"（视为0）, "as_value"（视为指定值）
    12: optional double na_value( go.tag = "json:\"na_value,omitempty\" bson:\"na_value,omitempty\"");  // 当 na_handling="as_value" 时使用的值
}

// 用例评分配置（可选，为空则使用数据源的默认配置）
struct CaseScoringConfig {
    1: optional string case_name( go.tag = "json:\"case_name,omitempty\" bson:\"case_name,omitempty\"");  // 用例名称（为空表示默认配置）
    2: required list<MetricScoringConfig> metric_configs( go.tag = "json:\"metric_configs\" bson:\"metric_configs\"");  // 该用例的指标评分配置
}

// 报告评分配置（整体配置）
struct ReportScoringConfig {
    1: required CaseScoringConfig default_config( go.tag = "json:\"default_config\" bson:\"default_config\"");  // 默认配置（新用例使用）
    2: optional list<CaseScoringConfig> case_configs( go.tag = "json:\"case_configs,omitempty\" bson:\"case_configs,omitempty\"");  // 特定用例配置（可选）
    3: optional string name( go.tag = "json:\"name,omitempty\" bson:\"name,omitempty\"");  // 评分标准名称/别名（如 "Web服务标准"），用于复用时识别
}

// 指标得分结果
struct MetricScore {
    1: required string metric_name( go.tag = "json:\"metric_name\" bson:\"metric_name\"");            // 指标名称
    2: required string display_name( go.tag = "json:\"display_name\" bson:\"display_name\"");         // 显示名称
    3: required double value( go.tag = "json:\"value\" bson:\"value\"");                              // 转换后的值（用于评分区间判断）
    4: required i32 score( go.tag = "json:\"score\" bson:\"score\"");                                 // 得分（0-100）
    5: required double weighted_score( go.tag = "json:\"weighted_score\" bson:\"weighted_score\"");   // 加权得分
    6: required string level( go.tag = "json:\"level\" bson:\"level\"");                              // 健康等级
    7: required double weight( go.tag = "json:\"weight\" bson:\"weight\"");                           // 真实权重占比（归一化后）
    8: required string unit( go.tag = "json:\"unit\" bson:\"unit\"");                                 // 单位
    9: optional double original_value( go.tag = "json:\"original_value\" bson:\"original_value\"");   // 原始值（转换前）
    10: optional map<string, string> row_data( go.tag = "json:\"row_data,omitempty\" bson:\"row_data,omitempty\"");  // 原始表格行数据（列名->值）
    11: optional bool matched( go.tag = "json:\"matched,omitempty\" bson:\"matched,omitempty\"");     // 是否命中评分规则（未命中则不参与评分）
}

// 用例得分结果
struct CaseScore {
    1: required string case_name( go.tag = "json:\"case_name\" bson:\"case_name\"");                  // 用例名称
    2: required double score( go.tag = "json:\"score\" bson:\"score\"");                              // 用例得分（0-100）
    3: required double weighted_score( go.tag = "json:\"weighted_score\" bson:\"weighted_score\"");   // 加权得分（贡献到报告总分）
    4: required string level( go.tag = "json:\"level\" bson:\"level\"");                              // 健康等级
    5: required double weight( go.tag = "json:\"weight\" bson:\"weight\"");                           // 用例权重（自动平均分配）
    6: required list<MetricScore> metric_scores( go.tag = "json:\"metric_scores\" bson:\"metric_scores\"");  // 各指标得分
}

// 报告总评分结果
struct ReportScore {
    1: required double total_score( go.tag = "json:\"total_score\" bson:\"total_score\"");            // 报告总分（0-100）
    2: required string level( go.tag = "json:\"level\" bson:\"level\"");                              // 总体健康等级
    3: required list<CaseScore> case_scores( go.tag = "json:\"case_scores\" bson:\"case_scores\"");   // 各用例得分
    4: required i64 evaluated_at( go.tag = "json:\"evaluated_at\" bson:\"evaluated_at\"");            // 评估时间戳（毫秒）
}

struct UpdateReportRequest {
    1: string id (
        go.tag = "json:\"id\"",
        vt.min_size = "1"
    ),
    2: Report report (
        go.tag = "json:\"report\"",
        api.body = "report",
        vt.not_nil = "true"
    )
}

// 上传图标请求
struct UploadIconRequest {
    1: string report_id (
        go.tag = "json:\"report_id\"",
        api.form = "report_id",
        vt.min_size = "1"
    ),                                             // 数据源ID（必填）
    2: binary icon_data (
        go.tag = "json:\"icon_data\"",
        api.form = "icon_data",
        vt.min_size = "1"
    ),                                             // 图标文件数据
    3: string file_name (
        go.tag = "json:\"file_name\"",
        api.form = "file_name",
        vt.min_size = "1",
        vt.max_size = "100"
    ),                                             // 原始文件名（用于获取扩展名）
}

// 转发报告请求
struct ForwardReportRequest {
    1: string target_url (
        go.tag = "json:\"target_url\"",
        api.body = "target_url",
        vt.min_size = "1"
    ),                                             // 目标 MonitorHub 地址（如 http://192.168.1.100:8081）
    2: string report_id (
        go.tag = "json:\"report_id\"",
        api.body = "report_id",
        vt.min_size = "1"
    )                                              // 本地报告ID
}

// 导入报告请求（从其他 MonitorHub 转发过来）
struct ImportReportRequest {
    1: string source_id (
        go.tag = "json:\"source_id\"",
        api.body = "source_id",
        vt.min_size = "1"
    ),                                             // 源报告ID（保持不变）
    2: Report report (
        go.tag = "json:\"report\"",
        api.body = "report",
        vt.not_nil = "true"
    ),                                             // 报告数据
    3: optional list<Chunk> chunks (
        go.tag = "json:\"chunks,omitempty\"",
        api.body = "chunks"
    ),                                             // Chunk 数据列表（可选）
    4: optional list<string> chunk_ids (
        go.tag = "json:\"chunk_ids,omitempty\"",
        api.body = "chunk_ids"
    )                                              // Chunk ID 列表（与 chunks 一一对应，保持原始ID）
}
// ============================================
// 服务定义
// ============================================

service ReportService {
    // 创建报告（异步处理）
    // 立即返回 report_id，后台异步查询和聚合数据
    // 会自动对所有聚合类型（avg, min, max, count）进行聚合
    base.Response CreateReport(1: Report req) (api.post="/apis/v1/report/create");
    
    // 查询报告处理进度（异步模式下使用）
    base.Response GetReportTask(1: base.IdRequest req) (api.post="/apis/v1/report/task/get");
    
    // 查询报告基础信息（不包含chunk数据）
    base.Response GetReport(1: base.IdRequest req) (api.post="/apis/v1/report/get");
    
    // 查询单个chunk数据，基于ChunkID（按需加载）
    base.Response GetChunk(1: base.IdRequest req) (api.post="/apis/v1/chunk/get");
    
    // 某个用例的所有数据,基于报告ID（按需加载）
    base.Response GetReportChunkList(1: base.IdRequest req) (api.post="/apis/v1/report/chunk/list");

    // 查询报告列表
    base.Response ListReport(1: base.QueryRequest req) (api.post="/apis/v1/report/list");
    
    // 删除报告
    base.Response DeleteReport(1: base.IdRequest req) (api.post="/apis/v1/report/del");

    // 更新报告
    base.Response UpdateReport(1: Report req) (api.post="/apis/v1/report/update");

     // 上传报告图标
    base.Response UploadIcon(1: UploadIconRequest req) (api.post="/apis/v1/report/icon/upload");

    // 计算报告评分（基于报告配置和用例数据）
    base.Response CalculateReportScore(1: base.IdRequest req) (api.post="/apis/v1/report/score/calculate");

    // 重载报告数据（异步处理）
    // 从 Pushgateway 重新查询原始数据并重新聚合
    // 删除旧的 Chunk 数据并生成新的 Chunk
    // 如果配置了评分，会自动重新计算评分
    // 返回任务ID，可通过 GetReportTask 查询进度
    base.Response ReloadReport(1: base.IdRequest req) (api.post="/apis/v1/report/reload");
    
    // 转发报告到其他 MonitorHub（包含完整的 Chunk 数据）
    base.Response ForwardReport(1: ForwardReportRequest req) (api.post="/apis/v1/report/forward");
    
    // 导入报告（从其他 MonitorHub 转发过来，保持原始ID）
    base.Response ImportReport(1: ImportReportRequest req) (api.post="/apis/v1/report/import");
}
