#!/bin/bash
# sonar-tap 端到端测试脚本
# 1. 启动一个 dummy 进程
# 2. 编译并启动 sonar-tap
# 3. 等待若干采集周期
# 4. 调用 /api/v1/metrics/preview 获取指标
# 5. 验证 node 和 process 指标是否正确
# 6. 清理退出

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

DUMMY_PID=""
TAP_PID=""
PASS=0
FAIL=0

cleanup() {
    echo ""
    echo "=== Cleaning up ==="
    if [ -n "$TAP_PID" ] && kill -0 "$TAP_PID" 2>/dev/null; then
        kill "$TAP_PID" 2>/dev/null || true
        wait "$TAP_PID" 2>/dev/null || true
        echo "Stopped sonar-tap (PID=$TAP_PID)"
    fi
    if [ -n "$DUMMY_PID" ] && kill -0 "$DUMMY_PID" 2>/dev/null; then
        kill "$DUMMY_PID" 2>/dev/null || true
        wait "$DUMMY_PID" 2>/dev/null || true
        echo "Stopped dummy process (PID=$DUMMY_PID)"
    fi
    rm -f /tmp/sonar_tap_e2e.log /tmp/sonar_tap_binary
    echo ""
    echo "=== Results ==="
    echo -e "  ${GREEN}PASS: $PASS${NC}"
    echo -e "  ${RED}FAIL: $FAIL${NC}"
    if [ $FAIL -gt 0 ]; then
        echo -e "  ${RED}OVERALL: FAILED${NC}"
        exit 1
    else
        echo -e "  ${GREEN}OVERALL: PASSED${NC}"
        exit 0
    fi
}
trap cleanup EXIT

assert_contains() {
    local desc="$1"
    local haystack="$2"
    local needle="$3"
    if echo "$haystack" | grep -q "$needle"; then
        echo -e "  ${GREEN}✓${NC} $desc"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}✗${NC} $desc (expected to find: $needle)"
        FAIL=$((FAIL + 1))
    fi
}

assert_not_empty() {
    local desc="$1"
    local value="$2"
    if [ -n "$value" ] && [ "$value" != "null" ] && [ "$value" != "[]" ]; then
        echo -e "  ${GREEN}✓${NC} $desc"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}✗${NC} $desc (value is empty or null)"
        FAIL=$((FAIL + 1))
    fi
}

assert_gt_zero() {
    local desc="$1"
    local value="$2"
    # 去掉可能的引号
    value=$(echo "$value" | tr -d '"')
    if [ -n "$value" ] && [ "$value" != "null" ] && [ "$(echo "$value > 0" | bc -l 2>/dev/null)" = "1" ]; then
        echo -e "  ${GREEN}✓${NC} $desc (value=$value)"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}✗${NC} $desc (value=$value, expected > 0)"
        FAIL=$((FAIL + 1))
    fi
}

assert_gte_zero() {
    local desc="$1"
    local value="$2"
    value=$(echo "$value" | tr -d '"')
    if [ -n "$value" ] && [ "$value" != "null" ] && [ "$(echo "$value >= 0" | bc -l 2>/dev/null)" = "1" ]; then
        echo -e "  ${GREEN}✓${NC} $desc (value=$value)"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}✗${NC} $desc (value=$value, expected >= 0)"
        FAIL=$((FAIL + 1))
    fi
}

echo "=== sonar-tap End-to-End Test ==="
echo ""

# Step 1: 启动 dummy 进程
echo "--- Step 1: Starting dummy process ---"
bash -c 'while true; do sleep 1; done' --config test --id=server001 &
DUMMY_PID=$!
echo "Dummy process started (PID=$DUMMY_PID)"
echo "Cmdline: bash -c 'while true; do sleep 1; done' --config test --id=server001"

# Step 2: 编译 sonar-tap
echo ""
echo "--- Step 2: Building sonar-tap ---"
go build -o /tmp/sonar_tap_binary ./cmd/server/
echo "Build successful"

# Step 3: 启动 sonar-tap
echo ""
echo "--- Step 3: Starting sonar-tap ---"
LISTEN_ADDR=":19090" /tmp/sonar_tap_binary test/config_e2e.yaml > /tmp/sonar_tap_e2e.log 2>&1 &
TAP_PID=$!
echo "sonar-tap started (PID=$TAP_PID, port=19090)"

# 等待服务就绪
echo "Waiting for sonar-tap to be ready..."
for i in $(seq 1 10); do
    if curl -s http://localhost:19090/api/v1/health > /dev/null 2>&1; then
        echo "sonar-tap is ready!"
        break
    fi
    if [ $i -eq 10 ]; then
        echo "ERROR: sonar-tap failed to start within 10 seconds"
        echo "=== sonar-tap log ==="
        cat /tmp/sonar_tap_e2e.log
        exit 1
    fi
    sleep 1
done

# Step 4: 等待采集周期（config step=3s，等两个周期 + 缓冲）
echo ""
echo "--- Step 4: Waiting for collection cycles (10s) ---"
sleep 10

# Step 5: 验证 health 接口
echo ""
echo "--- Step 5: Testing /api/v1/health ---"
HEALTH=$(curl -s http://localhost:19090/api/v1/health)
assert_contains "health returns ok" "$HEALTH" '"status":"ok"'

# Step 6: 验证 config 接口
echo ""
echo "--- Step 6: Testing /api/v1/config ---"
CONFIG=$(curl -s http://localhost:19090/api/v1/config)
assert_contains "config returns step=3" "$CONFIG" '"step":3'
assert_contains "config has node_exporter enabled" "$CONFIG" '"enabled":true'
assert_contains "config has e2e_test label" "$CONFIG" '"env":"e2e_test"'

# Step 7: 验证 status 接口
echo ""
echo "--- Step 7: Testing /api/v1/status ---"
STATUS=$(curl -s http://localhost:19090/api/v1/status)
assert_contains "status returns watcher_count" "$STATUS" 'watcher_count'

# Step 8: 验证 metrics/preview - Node 指标
echo ""
echo "--- Step 8: Testing /api/v1/metrics/preview (Node Metrics) ---"
PREVIEW=$(curl -s "http://localhost:19090/api/v1/metrics/preview?limit=200")

# 检查有数据返回
PREVIEW_LEN=$(echo "$PREVIEW" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null || echo "0")
echo "  Total preview entries: $PREVIEW_LEN"
assert_gt_zero "preview has entries" "$PREVIEW_LEN"

# 提取各指标名称列表
METRIC_NAMES=$(echo "$PREVIEW" | python3 -c "
import sys, json
data = json.load(sys.stdin)
names = set(m['name'] for m in data)
for n in sorted(names):
    print(n)
" 2>/dev/null)
echo "  Collected metric names:"
echo "$METRIC_NAMES" | while read name; do echo "    - $name"; done

# Node 指标检查
assert_contains "node_cpu_ratio collected" "$METRIC_NAMES" "node_cpu_ratio"
assert_contains "node_mem_percent collected" "$METRIC_NAMES" "node_mem_percent"
assert_contains "node_mem_used_mb collected" "$METRIC_NAMES" "node_mem_used_mb"

# Core CPU 指标
assert_contains "node_core_cpu collected" "$METRIC_NAMES" "node_core_cpu"

# 网络指标（第一次采集可能为空，第二次应该有）
# 磁盘指标同理
echo ""
echo "--- Step 9: Checking Node metric values ---"

# 验证 node_cpu_ratio 的值
CPU_VALUE=$(echo "$PREVIEW" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for m in data:
    if m['name'] == 'node_cpu_ratio':
        print(m['value'])
        break
" 2>/dev/null)
assert_gte_zero "node_cpu_ratio value >= 0" "$CPU_VALUE"

# 验证 node_mem_percent 的值
MEM_PERCENT=$(echo "$PREVIEW" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for m in data:
    if m['name'] == 'node_mem_percent':
        print(m['value'])
        break
" 2>/dev/null)
assert_gt_zero "node_mem_percent value > 0" "$MEM_PERCENT"

# 验证 node_mem_used_mb 的值
MEM_USED=$(echo "$PREVIEW" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for m in data:
    if m['name'] == 'node_mem_used_mb':
        print(m['value'])
        break
" 2>/dev/null)
assert_gt_zero "node_mem_used_mb value > 0" "$MEM_USED"

# 验证 node 指标带有 env label
NODE_LABELS=$(echo "$PREVIEW" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for m in data:
    if m['name'] == 'node_cpu_ratio' and m.get('labels'):
        print(json.dumps(m['labels']))
        break
" 2>/dev/null)
assert_contains "node metrics have env=e2e_test label" "$NODE_LABELS" '"env"'

# 验证 timestamp 是毫秒级（>1e12）
TS=$(echo "$PREVIEW" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data:
    print(data[0]['timestamp'])
" 2>/dev/null)
TS_CHECK=$(echo "$TS" | python3 -c "
import sys
ts = int(sys.stdin.read().strip())
print('ms' if ts > 1000000000000 else 'sec')
" 2>/dev/null)
assert_contains "timestamp is in milliseconds" "$TS_CHECK" "ms"

# Step 10: 验证 Process 指标
echo ""
echo "--- Step 10: Checking Process Metrics ---"

# Process 指标检查
HAS_PROCESS_CPU=$(echo "$PREVIEW" | python3 -c "
import sys, json
data = json.load(sys.stdin)
found = any(m['name'] == 'process_cpu_percent' for m in data)
print('yes' if found else 'no')
" 2>/dev/null)
assert_contains "process_cpu_percent collected" "$HAS_PROCESS_CPU" "yes"

HAS_PROCESS_MEM=$(echo "$PREVIEW" | python3 -c "
import sys, json
data = json.load(sys.stdin)
found = any(m['name'] == 'process_mem_mb' for m in data)
print('yes' if found else 'no')
" 2>/dev/null)
assert_contains "process_mem_mb collected" "$HAS_PROCESS_MEM" "yes"

# 验证 process 指标的 labels 包含 pid 和 server_id
PROC_LABELS=$(echo "$PREVIEW" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for m in data:
    if m['name'] == 'process_mem_mb' and m.get('labels'):
        print(json.dumps(m['labels']))
        break
" 2>/dev/null)
echo "  Process metric labels: $PROC_LABELS"
assert_contains "process labels contain pid" "$PROC_LABELS" '"pid"'
assert_contains "process labels contain name" "$PROC_LABELS" '"name"'
assert_contains "process labels contain server_id=server001" "$PROC_LABELS" 'server001'
assert_contains "process labels contain create_date" "$PROC_LABELS" '"create_date"'

# 验证 process_mem_mb > 0
PROC_MEM=$(echo "$PREVIEW" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for m in data:
    if m['name'] == 'process_mem_mb' and m.get('labels',{}).get('server_id') == 'server001':
        print(m['value'])
        break
" 2>/dev/null)
assert_gt_zero "process_mem_mb value > 0 for dummy process" "$PROC_MEM"

# Step 11: 验证 debug/regex 接口
echo ""
echo "--- Step 11: Testing /api/v1/debug/regex ---"
REGEX_RESP=$(curl -s -X POST http://localhost:19090/api/v1/debug/regex \
    -H "Content-Type: application/json" \
    -d '{"pattern":"--id=(\\w+)","input":"bash --config test --id=server001"}')
assert_contains "regex debug matched" "$REGEX_RESP" '"matched":true'
assert_contains "regex captured server001" "$REGEX_RESP" 'server001'

# Step 12: 验证 print_metrics 日志输出（push_gateway.print_metrics=true）
echo ""
echo "--- Step 12: Checking printed metrics in log ---"
LOG_CONTENT=$(cat /tmp/sonar_tap_e2e.log)
assert_contains "log contains node_cpu_ratio print" "$LOG_CONTENT" "node_cpu_ratio"
assert_contains "log contains process_mem_mb print" "$LOG_CONTENT" "process_mem_mb"

echo ""
echo "=== All tests completed ==="
