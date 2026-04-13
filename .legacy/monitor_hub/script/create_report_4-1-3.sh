#!/bin/bash
# 从 docs/4-1-3-生成测试报告.log 中提取的创建报告请求
# 原始日志时间: 2026-03-21 06:47:00
# 报告名: Load - 20260321_064659
# 报告ID(已创建): 69bdce6478d14dbc4a4c600c

# ========== 配置区 ==========
# MonitorHub 服务地址，根据实际部署修改
MONITOR_HUB_HOST="${MONITOR_HUB_HOST:-http://localhost:8081}"
API_PATH="/apis/v1/report/create"
# ============================

echo "=== 创建测试报告 ==="
echo "目标地址: ${MONITOR_HUB_HOST}${API_PATH}"
echo ""

curl -s -X POST "${MONITOR_HUB_HOST}${API_PATH}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Load - 20260321_064659",
    "cases": [
        {
            "stress_id": "69bc784bbf8f047498f46d0a",
            "name": "newyork_24p-all",
            "query_config": {
                "start_time": 1773959243000,
                "end_time": 1774046819813,
                "aggregation_interval": "15s",
                "filters": [
                    {
                        "labels": ["ip", "10.0.1.16", "node", "node"]
                    },
                    {
                        "labels": ["ip", "10.0.1.16", "pid", "26186"]
                    },
                    {
                        "labels": ["ip", "10.0.1.16", "pid", "26204"]
                    },
                    {
                        "labels": ["ip", "10.0.1.16", "pid", "26222"]
                    },
                    {
                        "labels": ["ip", "10.0.1.16", "pid", "26287"]
                    },
                    {
                        "labels": ["ip", "10.0.1.16", "pid", "26313"]
                    },
                    {
                        "labels": ["ip", "10.0.1.16", "pid", "26349"]
                    },
                    {
                        "labels": ["ip", "10.0.1.16", "pid", "26368"]
                    },
                    {
                        "labels": ["ip", "10.0.1.16", "pid", "26387"]
                    },
                    {
                        "labels": ["ip", "10.0.1.16", "pid", "26463"]
                    },
                    {
                        "labels": ["ip", "10.0.1.16", "pid", "26515"]
                    },
                    {
                        "labels": ["ip", "10.0.1.16", "pid", "26541"]
                    },
                    {
                        "labels": ["ip", "10.0.1.16", "pid", "26644"]
                    }
                ],
                "rate_metrics": ["slow_fps"]
            },
            "desc": "newyork_24p-all: 机器人总数(288) 每个DS分配人数(24)"
        }
    ],
    "datasource_id": "691c3cb57dc28e9a2ae3cf60",
    "create_type": "api_call",
    "description": "Load流水线一次手动测试记录，由AI智能分析生成文本结论.",
    "extra_info": [
        "测试集群",
        "stresstest2",
        "测试包名",
        "exe_VS0.pre_release.338787_ship_jw_1_sub.260319-1245_304084429.zip",
        "测试版本",
        "pro_git6c869fcb_engine_gitd55ae33f_pro_svn338787",
        "测试版本",
        "pro_git6c869fcb_engine_gitd55ae33f_pro_svn338787"
    ],
    "operator": "devops",
    "tags": [
        "手动测试",
        "G6启服",
        "Shipping包"
    ],
    "file_list": [
        "/2026-03-21/20260321_064622_69bc784bbf8f047498f46d0a_newyork_24p-all/ds_24bot_newyork_24p-all_26186pid.log",
        "/2026-03-21/20260321_064622_69bc784bbf8f047498f46d0a_newyork_24p-all/ds_24bot_newyork_24p-all_26204pid.log",
        "/2026-03-21/20260321_064622_69bc784bbf8f047498f46d0a_newyork_24p-all/ds_24bot_newyork_24p-all_26222pid.log",
        "/2026-03-21/20260321_064622_69bc784bbf8f047498f46d0a_newyork_24p-all/ds_24bot_newyork_24p-all_26287pid.log",
        "/2026-03-21/20260321_064622_69bc784bbf8f047498f46d0a_newyork_24p-all/ds_24bot_newyork_24p-all_26313pid.log",
        "/2026-03-21/20260321_064622_69bc784bbf8f047498f46d0a_newyork_24p-all/ds_24bot_newyork_24p-all_26349pid.log",
        "/2026-03-21/20260321_064622_69bc784bbf8f047498f46d0a_newyork_24p-all/ds_24bot_newyork_24p-all_26368pid.log",
        "/2026-03-21/20260321_064622_69bc784bbf8f047498f46d0a_newyork_24p-all/ds_24bot_newyork_24p-all_26387pid.log",
        "/2026-03-21/20260321_064622_69bc784bbf8f047498f46d0a_newyork_24p-all/ds_24bot_newyork_24p-all_26463pid.log",
        "/2026-03-21/20260321_064622_69bc784bbf8f047498f46d0a_newyork_24p-all/ds_24bot_newyork_24p-all_26515pid.log",
        "/2026-03-21/20260321_064622_69bc784bbf8f047498f46d0a_newyork_24p-all/ds_24bot_newyork_24p-all_26541pid.log",
        "/2026-03-21/20260321_064622_69bc784bbf8f047498f46d0a_newyork_24p-all/ds_24bot_newyork_24p-all_26644pid.log"
    ]
}' | python3 -m json.tool

echo ""
echo "=== 请求完成 ==="
