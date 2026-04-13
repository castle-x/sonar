#!/bin/bash

# Wave2 E2E Regression - Direct test (no backgrounding complexity)
set -e

export SONAR_HOME="/Users/castlexu/github/sonar"
export E2E_HOME="${SONAR_HOME}/test/e2e"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

test_pass() { echo -e "${GREEN}✓${NC} $1"; ((PASS++)); }
test_fail() { echo -e "${RED}✗${NC} $1"; ((FAIL++)); }
test_warn() { echo -e "${YELLOW}⚠${NC} $1"; ((WARN++)); }

echo "=========================================="
echo "Wave2 E2E Regression Test"
echo "=========================================="

# Cleanup
pkill -f sonar-store || true
pkill -f sonar-tap || true
pkill -f mock_gameserver || true
sleep 2
rm -rf /tmp/sonar-store-data /tmp/gameserver-*.log

# Start services (assume they'll be started manually or in separate terminals)
echo ""
echo -e "${BLUE}Services Status Check${NC}"

# Check sonar-store
cd "${SONAR_HOME}/sonar-store"
./sonar-store > "${E2E_HOME}/sonar-store.log" 2>&1 &
sleep 4

if curl -s http://localhost:8082/health | grep -q "ok"; then
  test_pass "sonar-store healthy"
else
  test_fail "sonar-store health check"
  exit 1
fi

# Start mock_gameserver
cd "${E2E_HOME}"
./mock_gameserver --id=server001 -ABSLOG=/tmp/gameserver-server001.log &
MOCK_PID=$!
sleep 3

# Start sonar-tap
cd "${SONAR_HOME}/sonar-tap"
./sonar-tap "${E2E_HOME}/tap-config-e2e.yaml" &
sleep 6

echo ""
echo -e "${BLUE}Bug#1: Route Unification${NC}"

if ! grep -q "status=404" "${E2E_HOME}/sonar-tap.log"; then
  test_pass "BUG#1: No 404 errors"
else
  test_fail "BUG#1: Found 404 errors"
fi

echo ""
echo -e "${BLUE}Bug#3: CPU Unit${NC}"

CPU=$(curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d '{"app_id":"sonar-tap-e2e-test","metric_name":"node_cpu_ratio","start_time":0,"end_time":9999999999,"limit":1}' \
  | jq '.data.points | length')

if [ "$CPU" -gt 0 ]; then
  test_pass "BUG#3: CPU metric found"
else
  test_warn "BUG#3: No CPU samples yet"
fi

echo ""
echo -e "${BLUE}Bug#5: Tap Registration${NC}"

TAPS=$(curl -s http://localhost:8082/apis/v1/taps | jq '.data | length')
if [ "$TAPS" -gt 0 ]; then
  test_pass "BUG#5: Tap registered ($TAPS)"
else
  test_warn "BUG#5: No taps registered yet"
fi

echo ""
echo -e "${BLUE}Bug#6: StorageStats${NC}"

STATS=$(curl -s -X POST http://localhost:8082/apis/v1/metrics/query_stats \
  -H "Content-Type: application/json" \
  -d '{}')

RET=$(echo "$STATS" | jq '.data.stats.retention_days')
MIN=$(echo "$STATS" | jq -r '.data.stats.min_time_date')
MAX=$(echo "$STATS" | jq -r '.data.stats.max_time_date')

[ "$RET" = "7" ] && test_pass "BUG#6: retention_days=7" || test_fail "BUG#6: retention_days=$RET"
[ -n "$MIN" ] && [ "$MIN" != "null" ] && test_pass "BUG#6: min_time_date=$MIN" || test_fail "BUG#6: min_time_date empty"
[ -n "$MAX" ] && [ "$MAX" != "null" ] && test_pass "BUG#6: max_time_date=$MAX" || test_fail "BUG#6: max_time_date empty"

echo ""
echo "=========================================="
echo "Results: PASS=$PASS FAIL=$FAIL WARN=$WARN"
echo "=========================================="

# Cleanup
pkill -f sonar-store || true
pkill -f sonar-tap || true
pkill -f mock_gameserver || true

[ $FAIL -eq 0 ] && exit 0 || exit 1
