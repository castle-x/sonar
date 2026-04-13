#!/bin/bash
# Mark 数据流调试脚本

echo "🔍 开始排查 Mark 数据流问题..."
echo "================================"
echo ""

BASE_URL="http://localhost:8080"
STRESS_ID="test_stress_001"

# 1. 检查服务健康状态
echo "1️⃣  检查服务健康状态..."
if curl -s ${BASE_URL}/health > /dev/null 2>&1; then
    echo "✅ 服务运行正常"
else
    echo "❌ 服务未运行或无法访问"
    exit 1
fi
echo ""

# 2. 发送单个 Mark 请求测试
echo "2️⃣  发送单个 Mark 请求测试..."
CURRENT_TIME=$(date +%s)000  # 毫秒时间戳
START_TIME=$((CURRENT_TIME - 100))
END_TIME=$CURRENT_TIME

MARK_RESPONSE=$(curl -s -X POST ${BASE_URL}/apis/v1/mark \
  -H "Content-Type: application/json" \
  -d "{
    \"stress_id\": \"${STRESS_ID}\",
    \"start_time\": ${START_TIME},
    \"end_time\": ${END_TIME},
    \"request_name\": \"test_api\"
  }")

echo "Mark 响应: ${MARK_RESPONSE}"
CODE=$(echo ${MARK_RESPONSE} | grep -o '"code":[0-9]*' | cut -d: -f2)

if [ "$CODE" = "0" ]; then
    echo "✅ Mark 请求成功"
else
    echo "❌ Mark 请求失败"
    echo "响应详情: ${MARK_RESPONSE}"
fi
echo ""

# 3. 立即查询 Recorder 中的数据
echo "3️⃣  查询 Recorder 中的实时数据..."
RECORDER_RESPONSE=$(curl -s -X POST ${BASE_URL}/apis/v1/mark/list \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"{\\\"stress_id\\\": \\\"${STRESS_ID}\\\"}\"}")

echo "Recorder 响应:"
echo "${RECORDER_RESPONSE}" | python3 -m json.tool 2>/dev/null || echo "${RECORDER_RESPONSE}"
echo ""

# 4. 等待聚合器运行
echo "4️⃣  等待聚合器运行（配置间隔：5秒）..."
echo "等待 6 秒..."
sleep 6
echo ""

# 5. 再次查询看数据是否变化
echo "5️⃣  6秒后再次查询 Recorder 数据..."
RECORDER_RESPONSE2=$(curl -s -X POST ${BASE_URL}/apis/v1/mark/list \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"{\\\"stress_id\\\": \\\"${STRESS_ID}\\\"}\"}")

echo "Recorder 响应:"
echo "${RECORDER_RESPONSE2}" | python3 -m json.tool 2>/dev/null || echo "${RECORDER_RESPONSE2}"
echo ""

# 6. 查询 TSDB 中的数据
echo "6️⃣  查询 TSDB 中的聚合数据..."
TSDB_RESPONSE=$(curl -s -X POST ${BASE_URL}/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{
    \"metric_name\": \"total_num\",
    \"labels\": [\"stress_id\", \"${STRESS_ID}\"],
    \"start_time\": 0,
    \"end_time\": 0,
    \"limit\": 10
  }")

echo "TSDB 响应:"
echo "${TSDB_RESPONSE}" | python3 -m json.tool 2>/dev/null || echo "${TSDB_RESPONSE}"
echo ""

# 7. 使用 PromQL 查询
echo "7️⃣  使用 PromQL 查询所有指标..."
PROMQL_RESPONSE=$(curl -s -X POST ${BASE_URL}/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{
    \"promql\": \"total_num{stress_id=\\\"${STRESS_ID}\\\"}\",
    \"start_time\": 0,
    \"end_time\": 0
  }")

echo "PromQL 响应:"
echo "${PROMQL_RESPONSE}" | python3 -m json.tool 2>/dev/null || echo "${PROMQL_RESPONSE}"
echo ""

# 8. 获取聚合器统计信息
echo "8️⃣  获取聚合器统计信息..."
echo "（此功能需要添加 API 端点）"
echo ""

echo "================================"
echo "🎯 排查完成！"
echo ""
echo "💡 分析提示："
echo "1. 如果步骤3查询到数据，说明 Mark 已进入 Recorder"
echo "2. 如果步骤5数据有变化，说明 Recorder 在正常工作"
echo "3. 如果步骤6或7查询到数据，说明聚合器和 TSDB 都正常"
echo "4. 如果都查不到，可能是："
echo "   - 聚合器未启动"
echo "   - 聚合间隔配置问题"
echo "   - 数据转换问题"
echo ""
echo "📝 配置信息："
echo "   - 聚合间隔: 5s (config.yaml)"
echo "   - TTL: 5m"
echo "   - 清理间隔: 15s"
echo ""

