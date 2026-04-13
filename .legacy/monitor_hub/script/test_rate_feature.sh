#!/bin/bash
# =============================================================================
# Rate 指标功能测试脚本
# 用途：测试新开发的 rate_metrics 计算功能
# 日期：2026-02-03
# =============================================================================

# 配置
API_URL="${API_URL:-http://localhost:8081}"
DATASOURCE_ID="691c3cb57dc28e9a2ae3cf60"  # GSTM-堡垒机-10.0.1.16-DS

echo "🔧 Rate 指标功能测试"
echo "================================"
echo "API 地址: $API_URL"
echo "数据源 ID: $DATASOURCE_ID"
echo ""

# 创建带有 rate_metrics 的测试报告
echo "📝 创建测试报告（带 rate_metrics 配置）..."
echo ""

RESPONSE=$(curl -s -X POST "${API_URL}/apis/v1/report/create" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "【调试报告】Rate指标功能测试",
    "description": "<p>测试 rate_metrics 新功能</p><p>验证：slow_fps 和 process_cpu_percent 的每分钟出现频率计算</p>",
    "datasource_id": "'"${DATASOURCE_ID}"'",
    "tags": ["调试", "Rate功能测试"],
    "cases": [
      {
        "stress_id": "6980e0febf8f047498f46aa6",
        "name": "newyork_24p-all（Rate测试）",
        "desc": "测试大世界综合场景的 rate 计算",
        "query_config": {
          "start_time": 1770053886306,
          "end_time": 1770055719390,
          "aggregation_interval": "15s",
          "filters": [
            {
              "labels": ["ip", "10.0.1.16", "node", "node"]
            },
            {
              "labels": ["ip", "10.0.1.16", "pid", "23924"]
            }
          ],
          "rate_metrics": ["slow_fps", "process_cpu_percent"]
        }
      },
      {
        "stress_id": "6980ef5cbf8f047498f46aaa",
        "name": "newyork_24p-drive（Rate测试）",
        "desc": "测试开车跑图场景的 rate 计算",
        "query_config": {
          "start_time": 1770057564188,
          "end_time": 1770059396375,
          "aggregation_interval": "15s",
          "filters": [
            {
              "labels": ["ip", "10.0.1.16", "node", "node"]
            },
            {
              "labels": ["ip", "10.0.1.16", "pid", "9993"]
            }
          ],
          "rate_metrics": ["slow_fps", "process_cpu_percent", "avg_fps"]
        }
      }
    ],
    "extra_info": [
      "测试类型", "Rate功能验证",
      "测试时间", "2026-02-03"
    ]
  }')

echo "响应:"
echo "$RESPONSE" | jq '.'
echo ""

# 提取报告 ID（注意：data 是数组）
REPORT_ID=$(echo "$RESPONSE" | jq -r '.data[0].id // empty')

if [ -z "$REPORT_ID" ]; then
  echo "❌ 创建报告失败，无法获取报告 ID"
  echo "错误信息: $(echo "$RESPONSE" | jq -r '.msg // .message // "未知错误"')"
  exit 1
fi

echo "✅ 报告创建成功！"
echo "📋 报告 ID: $REPORT_ID"
echo ""

# 等待报告处理完成
echo "⏳ 等待报告处理完成..."
for i in {1..30}; do
  sleep 2
  
  TASK_RESPONSE=$(curl -s -X POST "${API_URL}/apis/v1/report/task/get" \
    -H "Content-Type: application/json" \
    -d '{"id": "'"${REPORT_ID}"'"}')
  
  STATUS=$(echo "$TASK_RESPONSE" | jq -r '.data.status // "unknown"')
  PROGRESS=$(echo "$TASK_RESPONSE" | jq -r '.data.progress // 0')
  
  echo "  进度: ${PROGRESS}% - 状态: ${STATUS}"
  
  if [ "$STATUS" = "completed" ]; then
    echo ""
    echo "✅ 报告处理完成！"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo ""
    echo "❌ 报告处理失败"
    echo "$TASK_RESPONSE" | jq '.'
    exit 1
  fi
done

echo ""

# 获取报告详情，检查 rate_statistics
echo "📊 获取报告详情，验证 rate_statistics..."
echo ""

REPORT_RESPONSE=$(curl -s -X POST "${API_URL}/apis/v1/report/get" \
  -H "Content-Type: application/json" \
  -d '{"id": "'"${REPORT_ID}"'"}')

# 检查每个 case 的 rate_statistics
echo "=== Rate 统计结果 ==="
echo ""

CASE_COUNT=$(echo "$REPORT_RESPONSE" | jq '.data.resource.cases | length')

for i in $(seq 0 $((CASE_COUNT - 1))); do
  CASE_NAME=$(echo "$REPORT_RESPONSE" | jq -r ".data.resource.cases[$i].name")
  RATE_STATS=$(echo "$REPORT_RESPONSE" | jq ".data.resource.cases[$i].rate_statistics")
  
  echo "📌 用例: $CASE_NAME"
  
  if [ "$RATE_STATS" = "null" ] || [ -z "$RATE_STATS" ]; then
    echo "   ⚠️  rate_statistics 为空（可能指标不存在或无数据）"
  else
    echo "   ✅ rate_statistics 已计算:"
    echo "$RATE_STATS" | jq '.'
  fi
  echo ""
done

echo "================================"
echo "🎉 测试完成！"
echo ""
echo "你可以访问前端查看报告详情："
echo "  http://localhost:5173/report/${REPORT_ID}"
echo "  或"
echo "  http://localhost:8081/report/${REPORT_ID}"
