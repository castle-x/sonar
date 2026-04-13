namespace go monitor_hub.task.v1

include "../../../monitor_hub/base/v1/base.thrift"

// 测试任务
struct TestTask {
    1: required string name( go.tag = "json:\"name\" bson:\"name\"");                    // 任务名称
    2: optional string description( go.tag = "json:\"description,omitempty\" bson:\"description,omitempty\"");  // 任务正文（富文本）
    3: optional list<string> extra_info( go.tag = "json:\"extra_info,omitempty\" bson:\"extra_info,omitempty\"");  // 自定义 KV 信息
    4: optional list<string> tags( go.tag = "json:\"tags,omitempty\" bson:\"tags,omitempty\"");  // 标签
    5: optional list<string> report_ids( go.tag = "json:\"report_ids,omitempty\" bson:\"report_ids,omitempty\"");  // 关联报告 ID 列表（有序，可重复）
    6: optional string app_id( go.tag = "json:\"app_id,omitempty\" bson:\"app_id,omitempty\"");  // 关联项目 ID
    7: optional string operator( go.tag = "json:\"operator,omitempty\" bson:\"operator,omitempty\"");  // 操作人
    8: optional string create_type( go.tag = "json:\"create_type,omitempty\" bson:\"create_type,omitempty\"");  // 创建方式: "web_manual" | "api_call"
    9: optional string icon_name( go.tag = "json:\"icon_name,omitempty\" bson:\"icon_name,omitempty\"");  // 任务图标名称
}

// 创建任务请求
struct CreateTaskRequest {
    1: TestTask task (
        go.tag = "json:\"task\"",
        api.body = "task",
        vt.not_nil = "true"
    )
}

// 更新任务请求
struct UpdateTaskRequest {
    1: string id (
        go.tag = "json:\"id\"",
        vt.min_size = "1"
    ),
    2: TestTask task (
        go.tag = "json:\"task\"",
        api.body = "task",
        vt.not_nil = "true"
    )
}

// 上传图标请求
struct UploadIconRequest {
    1: string task_id (
        go.tag = "json:\"task_id\"",
        api.form = "task_id",
        vt.min_size = "1"
    ),                                             // 任务ID（必填）
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
    )                                              // 文件名
}

// 转发任务请求
struct ForwardTaskRequest {
    1: string target_url (
        go.tag = "json:\"target_url\"",
        api.body = "target_url",
        vt.min_size = "1"
    ),                                             // 目标 MonitorHub 地址（如 http://192.168.1.100:8081）
    2: string task_id (
        go.tag = "json:\"task_id\"",
        api.body = "task_id",
        vt.min_size = "1"
    )                                              // 本地任务ID
}

// ============================================
// 服务定义
// ============================================

service TaskService {
    // 创建任务
    base.Response CreateTask(1: CreateTaskRequest req) (api.post="/apis/v1/task/create");
    
    // 获取单个任务详情
    base.Response GetTask(1: base.IdRequest req) (api.post="/apis/v1/task/get");
    
    // 获取任务列表
    base.Response ListTask(1: base.QueryRequest req) (api.post="/apis/v1/task/list");
    
    // 更新任务（增量更新）
    base.Response UpdateTask(1: UpdateTaskRequest req) (api.post="/apis/v1/task/update");
    
    // 删除任务
    base.Response DeleteTask(1: base.IdRequest req) (api.post="/apis/v1/task/del");
    
    // 上传任务图标
    base.Response UploadIcon(1: UploadIconRequest req) (api.post="/apis/v1/task/icon/upload");
    
    // 转发任务到其他 MonitorHub
    base.Response ForwardTask(1: ForwardTaskRequest req) (api.post="/apis/v1/task/forward");
}
