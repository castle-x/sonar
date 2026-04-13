# MonitorHub 集成指南

> 本文档面向需要通过 MonitorHub API 实现自动化报告管理的 AI Agent 和脚本开发者。  
> 最后更新：2026-02-27  
> 状态：**可用** ✅

---

## 一、平台简介

MonitorHub 是一个实时监控与持久化报告平台，核心能力：

- **数据采集**：从 Pushgateway 采集 Prometheus 格式指标
- **级联聚合**：raw → 15s → 30s → 1m → 5m → 1h → 6h 多级聚合
- **报告归档**：异步从 TSDB 重新聚合数据，生成独立报告（不依赖实时聚合）
- **评分系统**：对指标配置区间/阈值评分规则，自动计算加权分数
- **AI 分析**：基于 Table 数据 + 评分结果进行智能分析

### 核心约定

| 约定 | 说明 |
|------|------|
| **请求方法** | 所有 API 均为 `POST`，`Content-Type: application/json` |
| **禁止 GET** | 不存在 GET 端点，不支持 RESTful 路径参数（如 `/report/{id}`） |
| **ID 传递** | 通过 POST body `{"id": "xxx"}` 传递 |
| **认证** | 报告相关接口已加入脚本白名单，无需认证头，操作者自动标记为 `script` |
| **默认端口** | 8081 |

---

## 二、API 速查

| # | 接口 | 路径 | 请求体 | 说明 |
|---|------|------|--------|------|
| 1 | CreateReport | `POST /apis/v1/report/create` | Report JSON | 创建报告（异步） |
| 2 | GetReportTask | `POST /apis/v1/report/task/get` | `{"id":"..."}` | 查询生成进度 |
| 3 | GetReport | `POST /apis/v1/report/get` | `{"id":"..."}` | 获取报告元信息+评分 |
| 4 | ListReport | `POST /apis/v1/report/list` | QueryRequest | 分页查询列表 |
| 5 | UpdateReport | `POST /apis/v1/report/update` | UpdateReportRequest | 更新报告（含评分配置） |
| 6 | CalculateScore | `POST /apis/v1/report/score/calculate` | `{"id":"..."}` | 计算评分 |
| 7 | GetChunk | `POST /apis/v1/chunk/get` | `{"id":"..."}` | 获取单个用例数据 |
| 8 | GetReportChunkList | `POST /apis/v1/report/chunk/list` | `{"id":"..."}` | 获取所有用例数据 |
| 9 | DeleteReport | `POST /apis/v1/report/del` | `{"id":"..."}` | 删除报告 |
| 10 | ReloadReport | `POST /apis/v1/report/reload` | `{"id":"..."}` | 重载报告数据 |

**常见错误**：
- ❌ `GET /apis/v1/report/task/{taskID}` → ✅ `POST /apis/v1/report/task/get` + body `{"id": "taskID"}`
- ❌ `GET /apis/v1/report/{reportID}` → ✅ `POST /apis/v1/report/get` + body `{"id": "reportID"}`

---

## 三、完整工作流

### Step 1: 创建报告

```json
POST /apis/v1/report/create

{
  "name": "压测报告-v2.1.0",
  "datasource_id": "ds_abc123",
  "create_type": "api_call",
  "tags": ["v2.1.0", "stress-test"],
  "extra_info": ["版本", "v2.1.0", "测试人", "AI-Agent"],
  "cases": [{
    "stress_id": "stress_001",
    "name": "基准测试",
    "query_config": {
      "start_time": 1700000000000,
      "end_time": 1700003600000,
      "aggregation_interval": "1m",
      "filters": [{"name": "cpu_usage"}, {"name": "memory_usage"}],
      "rate_metrics": ["error_count"]
    }
  }]
}
```

**关键参数说明**：

| 参数 | 说明 |
|------|------|
| `datasource_id` | 必填，MonitorHub 中已存在的数据源 ID |
| `create_type` | 固定 `"api_call"`（脚本/API 创建） |
| `start_time/end_time` | 毫秒级 Unix 时间戳 |
| `aggregation_interval` | `"15s"` / `"30s"` / `"1m"` / `"5m"` / `"1h"` / `"6h"` |
| `filters` | 指标名过滤；空 = 查询全部指标 |
| `filters.labels` | 标签过滤，偶数个元素（key,value,key,value...） |
| `rate_metrics` | 需计算每分钟频率的指标名列表 |
| `extra_info` | 偶数个元素的 key-value 对 |

### Step 2: 等待报告生成完成

轮询 `POST /apis/v1/report/task/get`：

```json
// 请求
{"id": "<report_id>"}

// 响应
{
  "code": 0,
  "data": {
    "report_status": {"status": "running", "task_id": "..."},
    "task_info": {"progress": 45, "status": "running"}
  }
}
```

状态流：`running`（progress 0-100）→ `completed` | `failed`（检查 `error_msg`）

### Step 3: 获取 Table 数据

```json
POST /apis/v1/report/chunk/list
{"id": "<report_id>"}
```

返回 `ChunkData` 数组，**AI 分析仅需 `t`（Tables）字段**，忽略 `p`（Points）。

```json
{
  "t": [{
    "name": "系统资源",
    "table": [
      ["name", "CPU使用率(avg)", "CPU使用率(max)", "内存(avg)"],
      ["server-1", "35.2%", "78.5%", "4.2GB"]
    ]
  }],
  "p": { "..." }
}
```

**表头命名规则**：`{alias或metric_name}({aggregation_type})`

### Step 4: 配置评分标准

通过 UpdateReport 设置 `scoring_config`，**必须在计算评分前完成**。

```json
POST /apis/v1/report/update

{
  "id": "<report_id>",
  "report": {
    "scoring_config": {
      "name": "评分标准名称",
      "default_config": {
        "metric_configs": [
          {
            "name": "cpu_usage",
            "alias": "CPU使用率",
            "unit": "%",
            "weight": 3,
            "aggregation_types": ["avg", "max"],
            "scoring_type": "range",
            "ranges": [
              {"min": 0, "max": 30, "score": 100, "label": "优秀", "level": "excellent"},
              {"min": 30, "max": 60, "score": 80, "label": "良好", "level": "good"},
              {"min": 60, "max": 80, "score": 60, "label": "正常", "level": "normal"},
              {"min": 80, "max": 95, "score": 40, "label": "繁忙", "level": "warning"},
              {"min": 95, "max": 100, "score": 20, "label": "危险", "level": "danger"}
            ]
          },
          {
            "name": "error_count",
            "weight": 3,
            "aggregation_types": ["rate"],
            "scoring_type": "threshold",
            "source": "rate",
            "na_handling": "as_zero",
            "thresholds": [
              {"operator": "=", "value": 0, "score": 100, "label": "无错误", "level": "excellent"},
              {"operator": "<", "value": 1, "score": 80, "label": "偶发", "level": "good"},
              {"operator": ">=", "value": 1, "score": 40, "label": "频繁", "level": "danger"}
            ]
          }
        ]
      }
    }
  }
}
```

#### 评分类型

| 指标特征 | 类型 | 适用场景 |
|---------|------|---------|
| 连续值 | `range`（区间） | CPU 使用率、内存占用、延迟 |
| 离散值 | `threshold`（阈值） | 错误数、失败数 |
| 频率类 | `threshold` + `source:"rate"` | 每分钟错误次数 |

#### 权重规则

- `weight` 为任意正数，系统自动归一化（总和=1）
- 每个 `aggregation_type` 均分该指标权重
- 多行数据：行权重 = 基础权重 / 行数
- 未命中评分规则的指标不参与评分，剩余指标重新归一化

#### N/A 处理

| 策略 | 适用场景 |
|------|---------|
| `skip`（默认） | Summary 表格数据 |
| `as_zero` | Rate 指标（没出现=好事） |
| `as_value` | 需自定义替代值（需设 `na_value`） |

### Step 5: 计算评分

```json
POST /apis/v1/report/score/calculate
{"id": "<report_id>"}
```

返回：

```json
{
  "total_score": 85.5,
  "level": "good",
  "case_scores": [{
    "case_name": "基准测试",
    "score": 85.5,
    "level": "good",
    "metric_scores": [{
      "metric_name": "cpu_usage_avg",
      "display_name": "CPU使用率(avg)",
      "value": 42.3,
      "score": 80,
      "level": "good",
      "weight": 0.25
    }]
  }]
}
```

**等级划分**：

| 分数 | 等级 | 含义 |
|------|------|------|
| ≥ 90 | excellent | 优秀 |
| ≥ 75 | good | 良好 |
| ≥ 60 | normal | 正常 |
| ≥ 40 | warning | 警告 |
| < 40 | danger | 危险 |

### Step 6: AI 结论分析

获取 Table 数据 + 评分结果后，按以下框架进行 AI 分析：

1. **总体评价** — 总分、等级、一句话结论
2. **关键发现** — 最重要的 3-5 个发现
3. **风险告警** — warning/danger 等级的指标
4. **优化建议** — 具体可操作的建议

**Table 数据解读要点**：
- `avg` 反映常态负载，`max` 反映峰值压力
- 跨服务器对比可识别负载不均衡
- Rate 指标值为 0 表示无事件发生（理想状态）

---

## 四、Rate 指标说明

Rate 用于计算指标的「每分钟出现频率」：

**Rate = 指标 count 值总和 ÷ 时间范围（分钟）**

### 配置方式

在 `query_config.rate_metrics` 中指定需要计算 Rate 的指标名：

```json
{
  "query_config": {
    "rate_metrics": ["error_count", "slow_fps", "high_cpu_event"]
  }
}
```

### 评分配置

Rate 指标评分使用 `threshold` 类型 + `source: "rate"` + `na_handling: "as_zero"`：

```json
{
  "name": "error_count",
  "weight": 3,
  "aggregation_types": ["rate"],
  "scoring_type": "threshold",
  "source": "rate",
  "na_handling": "as_zero",
  "thresholds": [
    {"operator": "=", "value": 0, "score": 100, "label": "无错误"},
    {"operator": "<", "value": 0.5, "score": 80, "label": "偶发"},
    {"operator": ">=", "value": 2, "score": 30, "label": "频繁"}
  ]
}
```

### 表格展示

Rate 计算结果存储在 `case.rate_statistics` 中，同时会追加到 Summary Table 表尾：

```
| name     | error_count(rate) |
|----------|-------------------|
| server-1 | 0.5               |
```

---

## 五、错误处理

### 错误码

| 错误码 | 含义 | 处理建议 |
|--------|------|---------|
| 1001 | 参数无效 | 检查必填字段、ExtraInfo 偶数个 |
| 1002 | 缺少参数 | 检查 ID 是否传递 |
| 1006 | 资源不存在 | 检查 report_id / datasource_id |
| 1007 | 内部错误 | 查看 msg 详细信息 |

### 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 401 Unauthorized | 使用了 GET 方法 | 改为 POST，MonitorHub 无 GET 端点 |
| "报告未配置评分标准" | 未设置 scoring_config | 先调用 UpdateReport 配置评分 |
| "报告正在处理中" | 报告还未生成完成 | 等待 status=completed |
| "在汇总表格中未找到指标" | name/alias 不匹配 | 检查配置的指标名是否与表格列名一致 |

---

## 六、脚本白名单路径

以下接口无需认证，可直接通过脚本调用：

```
/apis/v1/report/create
/apis/v1/report/get
/apis/v1/report/list
/apis/v1/report/update
/apis/v1/report/del
/apis/v1/report/reload
/apis/v1/report/chunk/list
/apis/v1/report/task/get
/apis/v1/report/score/calculate
/apis/v1/chunk/get
```

---

## 七、相关资源

| 资源 | 位置 | 说明 |
|------|------|------|
| **CodeBuddy Rule** | `.codebuddy/rules/monitorhub-report-analysis.mdc` | 中文规则，紧凑版 API+工作流+评分指南 |
| **CodeBuddy Skill** | `.codebuddy/skills/monitorhub-report-analysis/SKILL.md` | 英文工作流概览 |
| **Go Client 参考** | `.codebuddy/skills/monitorhub-report-analysis/references/api_reference.md` | 完整 Go 客户端代码+数据结构定义 |
| **Thrift 定义** | `apis/monitor_hub/report/v1/report.thrift` | API 源文件（修改需 `hzx update apis`） |
