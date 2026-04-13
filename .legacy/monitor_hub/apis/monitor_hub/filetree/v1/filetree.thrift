namespace go monitor_hub.filetree.v1

include "../../../monitor_hub/base/v1/base.thrift"

// ============================================
// 数据结构定义
// ============================================

// 文件/目录节点
struct FileNode {
    1: required string name (go.tag = "json:\"name\" bson:\"name\"");                        // 文件/目录名称
    2: required string path (go.tag = "json:\"path\" bson:\"path\"");                        // 相对路径（相对于 filetree 根目录）
    3: required bool is_dir (go.tag = "json:\"is_dir\" bson:\"is_dir\"");                    // 是否是目录
    4: required i64 size (go.tag = "json:\"size\" bson:\"size\"");                           // 文件大小（字节），目录为 0
    5: required i64 modified_time (go.tag = "json:\"modified_time\" bson:\"modified_time\""); // 修改时间（毫秒时间戳）
    6: optional i32 file_count (go.tag = "json:\"file_count,omitempty\" bson:\"file_count,omitempty\"");  // 目录下文件数量（仅目录有效）
    7: optional list<FileNode> children (go.tag = "json:\"children,omitempty\" bson:\"children,omitempty\""); // 子节点（仅在展开时返回）
}

// 获取文件树请求
struct GetFileTreeRequest {
    1: optional string path (
        go.tag = "json:\"path\" query:\"path\"",
        api.query = "path"
    );                                                                                        // 路径（默认为根目录 "/"）
    2: optional i32 depth (
        go.tag = "json:\"depth\" query:\"depth\"",
        api.query = "depth"
    );                                                                                        // 展开深度（0=仅当前层，1=展开一层，-1=全部展开，默认为0）
    3: optional bool include_hidden (
        go.tag = "json:\"include_hidden\" query:\"include_hidden\"",
        api.query = "include_hidden"
    );                                                                                        // 是否包含隐藏文件（以.开头），默认false
}

// 下载文件请求
struct DownloadFileRequest {
    1: required string path (
        go.tag = "json:\"path\" query:\"path\"",
        api.query = "path",
        vt.min_size = "1"
    );                                                                                        // 文件相对路径（必填）
}

// 上传文件请求（二期功能）
struct UploadFileRequest {
    1: required string path (
        go.tag = "json:\"path\"",
        api.form = "path",
        vt.min_size = "1"
    );                                                                                        // 目标路径（目录路径或完整文件路径）
    2: required binary file_data (
        go.tag = "json:\"file_data\"",
        api.form = "file_data",
        vt.min_size = "1"
    );                                                                                        // 文件数据
    3: required string file_name (
        go.tag = "json:\"file_name\"",
        api.form = "file_name",
        vt.min_size = "1",
        vt.max_size = "255"
    );                                                                                        // 文件名
    4: optional bool overwrite (
        go.tag = "json:\"overwrite\"",
        api.form = "overwrite"
    );                                                                                        // 是否覆盖已存在的文件（默认false）
}

// 删除文件/目录请求（二期功能）
struct DeleteFileRequest {
    1: required string path (
        go.tag = "json:\"path\"",
        vt.min_size = "1"
    );                                                                                        // 文件/目录相对路径（必填）
    2: optional bool recursive (
        go.tag = "json:\"recursive,omitempty\""
    );                                                                                        // 递归删除目录（默认false，仅删除空目录）
}

// 创建目录请求（二期功能）
struct CreateDirRequest {
    1: required string path (
        go.tag = "json:\"path\"",
        vt.min_size = "1"
    );                                                                                        // 目录相对路径（必填）
    2: optional bool recursive (
        go.tag = "json:\"recursive,omitempty\""
    );                                                                                        // 递归创建父目录（默认false）
}

// 批量获取文件信息请求
struct GetFilesByPathsRequest {
    1: required list<string> paths (
        go.tag = "json:\"paths\"",
        api.body = "paths",
        vt.min_size = "1"
    );                                                                                        // 文件路径列表（必填）
}

// 文件统计信息
struct FileStats {
    1: required i64 total_files (go.tag = "json:\"total_files\" bson:\"total_files\"");      // 总文件数
    2: required i64 total_dirs (go.tag = "json:\"total_dirs\" bson:\"total_dirs\"");         // 总目录数
    3: required i64 total_size (go.tag = "json:\"total_size\" bson:\"total_size\"");         // 总大小（字节）
    4: optional string size_human (go.tag = "json:\"size_human,omitempty\" bson:\"size_human,omitempty\""); // 人类可读的大小（如 "1.2 GB"）
}

// ============================================
// 服务定义
// ============================================

service FileTreeService {
    // 获取文件树（一期功能）
    // 返回指定路径的文件和目录列表
    base.Response GetFileTree(1: GetFileTreeRequest req) (api.get="/apis/v1/filetree/get");
    
    // 下载文件（一期功能）
    // 返回文件内容（二进制流）
    // 注意：这个接口返回的不是标准的 base.Response，而是直接返回文件流
    base.Response DownloadFile(1: DownloadFileRequest req) (api.get="/apis/v1/filetree/download");
    
    // 获取文件统计信息（一期功能）
    // 返回文件树的统计数据
    base.Response GetFileStats(1: GetFileTreeRequest req) (api.get="/apis/v1/filetree/stats");
    
    // 批量获取文件信息
    // 根据路径列表返回对应的文件信息（用于报告关联文件查询）
    base.Response GetFilesByPaths(1: GetFilesByPathsRequest req) (api.post="/apis/v1/filetree/batch");
    
    // 上传文件（二期功能 - 仅管理员）
    base.Response UploadFile(1: UploadFileRequest req) (api.post="/apis/v1/filetree/upload");
    
    // 删除文件/目录（二期功能 - 仅管理员）
    base.Response DeleteFile(1: DeleteFileRequest req) (api.post="/apis/v1/filetree/delete");
    
    // 创建目录（二期功能 - 仅管理员）
    base.Response CreateDir(1: CreateDirRequest req) (api.post="/apis/v1/filetree/mkdir");
}

