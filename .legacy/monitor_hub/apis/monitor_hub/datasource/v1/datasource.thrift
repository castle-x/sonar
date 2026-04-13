namespace go monitor_hub.datasource.v1

include "../../../monitor_hub/base/v1/base.thrift"

// 指标聚合配置
struct MetricAggregation {
    1: string metric_name (
        go.tag = "json:\"metric_name\" bson:\"metric_name\"",
        vt.min_size = "1",
        vt.max_size = "100"
    ), // 指标名称
    2: list<string> agg_types (
        go.tag = "json:\"agg_types\" bson:\"agg_types\"",
        vt.min_size = "1"
    ), // 聚合类型列表（如: ["avg", "max", "min"]）
}

// 汇总数据表格配置
struct SummaryConfig {
    1: string name (
        go.tag = "json:\"name\" bson:\"name\"",
        vt.min_size = "1",
        vt.max_size = "100"
    ),

    2: list<string> labels (
        go.tag =  "json:\"labels,omitempty\" bson:\"labels\"",
    ), // 表格左侧几列要展示的标签, 表头为标签名, 单元格为标签值, 每行展示的值一样

    3: list<MetricAggregation> metrics(
        go.tag =  "json:\"metrics\" bson:\"metrics\"",
    ), // 表格右侧要展示的指标名称和他们的聚合类型，聚合类型可以是多个，每个类型为一列, 其他计算逻辑配置给予MetricConfig中的配置
}

// 指标配置
struct MetricConfig {
    1: string name (
        go.tag = "json:\"name\" bson:\"name\"",
        vt.min_size = "1",
        vt.max_size = "100"
    ),                                          // 指标名称（必填）
    2: optional string alias (
        go.tag = "json:\"alias,omitempty\" bson:\"alias\"",
        vt.max_size = "100"
    ),                                          // 别名
    3: optional string description (
        go.tag = "json:\"description,omitempty\" bson:\"description\"",
        vt.max_size = "500"
    ),                                          // 描述信息
    4: optional string unit (
        go.tag = "json:\"unit,omitempty\" bson:\"unit\"",
        vt.max_size = "20"
    ),                                          // 单位（例如: %, MB, ms）
    5: optional string transform (
        go.tag = "json:\"transform,omitempty\" bson:\"transform\"",
        vt.max_size = "200"
    ),                                          // 单位转换表达式（例如: value/1024, value*100）
    6: optional list<string> display_labels (
        go.tag = "json:\"display_labels,omitempty\" bson:\"display_labels\""
    ),                                          // 图例显示的标签键列表（仅影响图例显示，不影响数据唯一性）
    7: optional string column_span (
        go.tag = "json:\"column_span,omitempty\" bson:\"column_span\"",
        vt.in = "full,half"
    ),                                          // 图表列跨度: full(占满整行), half(占半行), 不设置则跟随全局布局
    8: optional string chart_type (
        go.tag = "json:\"chart_type,omitempty\" bson:\"chart_type\"",
        vt.in = "area,scatter"
    ),                                          // 图表类型: area(面积图，默认), scatter(散点图，适合随机触发的稀疏数据)
}

struct Datasource {
    1: list<string> pushgateway_addr_list (
        go.tag = "json:\"pushgateway_addr_list\" bson:\"pushgateway_addr_list\"",
        vt.min_size = "1"
    ),                                          // 数据源列表（必填）
    2: optional string description (
        go.tag = "json:\"description,omitempty\" bson:\"description\"",
        vt.max_size = "500"
    ),                                          // 描述信息
    3: string app_id (
        go.tag = "json:\"app_id\" bson:\"app_id\"",
        vt.min_size = "1",
        vt.max_size = "50"
    ),                                          // 项目标识（必填）
    4: string name (
        go.tag = "json:\"name\" bson:\"name\"",
        vt.min_size = "1",
        vt.max_size = "100"
    ),                                          // 名称（必填）
    5: optional string status (
        go.tag = "json:\"status,omitempty\" bson:\"status\"",
        vt.in = "healthy", vt.in = "degraded", vt.in = "down"
    ),                                           // 状态：healthy(全部在线)/degraded(部分在线)/down(全部离线)
    6: optional map<string, list<MetricConfig>> groupmap (    
        go.tag = "json:\"groupmap,omitempty\" bson:\"groupmap\"",
    ),                                            // 分组字典，组名对应一组指标配置
    7: optional list<SummaryConfig> summary_config (
        go.tag = "json:\"summary_config,omitempty\" bson:\"summary_config\"",
    ),                                             // 汇总数据表格配置, 每个元素代表一张表
    8: optional string icon_name(
        go.tag = "json:\"icon_name\" bson:\"icon_name\"",
    ),                                              //项目图标名称（文件名）
    9: optional list<string> groupmap_sort_keys (
        go.tag = "json:\"groupmap_sort_keys,omitempty\" bson:\"groupmap_sort_keys\"",
    )                                              // groupmap 的排序键列表，用于控制分组显示顺序（因为map是无序的）
}

// 上传图标请求
struct UploadIconRequest {
    1: string datasource_id (
        go.tag = "json:\"datasource_id\"",
        api.form = "datasource_id",
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

struct CreateDatasourceRequest {
    1: Datasource datasource (
        go.tag = "json:\"datasource\"",
        api.body = "datasource",
        vt.not_nil = "true"
    )
}

struct UpdateDatasourceRequest {
    1: string id (
        go.tag = "json:\"id\"",
        vt.min_size = "1"
    ),
    2: Datasource datasource (
        go.tag = "json:\"datasource\"",
        api.body = "datasource",
        vt.not_nil = "true"
    )
}

// 数据服务接口
service DatasourceService {
    // 创建Datasource
    base.Response CreateDatasource(1: CreateDatasourceRequest req) (api.post="/apis/v1/datasource/create");

    // 更新Datasource
    base.Response UpdateDatasource(1: UpdateDatasourceRequest req) (api.post="/apis/v1/datasource/update");

    // 查询Datasource 
    base.Response GetDatasource(1: base.IdRequest req) (api.post="/apis/v1/datasource/get");
    
    // 查询Datasource列表
    base.Response ListDatasource(1: base.QueryRequest req) (api.post="/apis/v1/datasource/list");

    // 删除Datasource
    base.Response DeleteDatasource(1: base.IdRequest req) (api.post="/apis/v1/datasource/del");

    // 上传数据源图标
    base.Response UploadIcon(1: UploadIconRequest req) (api.post="/apis/v1/datasource/icon/upload");
}
