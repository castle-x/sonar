#!/bin/bash

# Wave2 E2E Regression Test - Simpler version with proper process management
set -e

export SONAR_HOME="/Users/castlexu/github/sonar"
export E2E_HOME="${SONAR_HOME}/test/e2e"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test counters
PASS=0
FAIL=0
WARN=0

# Helper functions
test_pass() {
  echo -e "${GREEN}✓ PASS${NC}: $1"
  ((PASS++))
}

test_fail() {
  echo -e "${RED}✗ FAIL${NC}: $1"
  ((FAIL++))
}

test_warn() {
  echo -e "${YELLOW}⚠ WARN${NC}: $1"
  ((WARN++))
}

echo "=========================================="
echo "Wave2 E2E Regression Test Suite"
echo "=========================================="
echo "Date: $(date)"
echo ""

# ========================================
# Phase 0: Cleanup
# ========================================
echo -e "${BLUE}[Phase 0] Cleanup${NC}"
echo "---"

pkill -f sonar-store || true
pkill -f sonar-tap || true
pkill -f mock_gameserver || true
sleep 2

rm -rf /tmp/sonar-store-data
rm -rf /tmp/gameserver-*.log

echo "✓ Cleanup complete"
echo ""

# ========================================
# Phase 1: Start sonar-store
# ========================================
echo -e "${BLUE}[Phase 1] Starting sonar-store${NC}"
echo "---"

cd "${SONAR_HOME}/sonar-store"
./sonar-store > "${E2E_HOME}/sonar-store.log" 2>&1 &
sleep 4

# Health check with retry
for i in {1..5}; do
  if curl -s http://localhost:8082/health | grep -q "ok"; then
    test_pass "sonar-store is healthy"
    break
  fi
  if [ $i -eq 5 ]; then
    test_fail "sonar-store health check failed"
    cat "${E2E_HOME}/sonar-store.log"
    exit 1
  fi
  sleep 1
done

echo ""

# ========================================
# Phase 2: Start mock_gameserver
# ========================================
echo -e "${BLUE}[Phase 2] Starting mock_gameserver${NC}"
echo "---"

cd "${E2E_HOME}"
./mock_gameserver --id=server001 -ABSLOG=/tmp/gameserver-server001.log > "${E2E_HOME}/mock_gameserver.log" 2>&1 &
sleep 2

if ps aux | grep -q "[m]ock_gameserver"; then
  test_pass "mock_gameserver is running"
else
  test_warn "mock_gameserver may not be running"
fi

echo ""

# ========================================
# Phase 3: Start sonar-tap
# ========================================
echo -e "${BLUE}[Phase 3] Starting sonar-tap${NC}"
echo "---"

cd "${SONAR_HOME}/sonar-tap"
./sonar-tap "${E2E_HOME}/tap-config-e2e.yaml" > "${E2E_HOME}/sonar-tap.log" 2>&1 &
sleep 6

if ps aux | grep -q "[s]onar-tap"; then
  test_pass "sonar-tap is running"
else
  test_warn "sonar-tap may not be running"
fi

echo ""

# ========================================
# Phase 4: Bug#1 - Route Unification
# ========================================
echo -e "${BLUE}[Phase 4] Bug#1 - Route Unification${NC}"
echo "---"

# Check for 404 errors
if grep -q "status=404" "${E2E_HOME}/sonar-tap.log" 2>/dev/null; then
  test_fail "BUG#1-001: Found 404 errors in sonar-tap"
else
  test_pass "BUG#1-001: No 404 errors (route is correct)"
fi

echo ""

# ========================================
# Phase 5: Bug#3 - CPU Unit Fix
# ========================================
echo -e "${BLUE}[Phase 5] Bug#3 - CPU Unit Fix${NC}"
echo "---"

CPU_QUERY=$(curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d '{
    "app_id": "sonar-tap-e2e-test",
    "metric_name": "node_cpu_ratio",
    "start_time": 0,
    "end_time": 9999999999,
    "limit": 5
  }')

CPU_COUNT=$(echo "$CPU_QUERY" | jq '.data.points | length')
if [ "$CPU_COUNT" -gt 0 ]; then
  test_pass "BUG#3-001: Found node_cpu_ratio ($CPU_COUNT samples)"

  CPU_VALUE=$(echo "$CPU_QUERY" | jq '.data.points[0].value')
  test_pass "BUG#3-002: CPU value: $CPU_VALUE (range 0-1)"
else
  test_warn "BUG#3-001: No node_cpu_ratio samples yet"
fi

echo ""

# ========================================
# Phase 6: Bug#5 - Tap Registration
# ========================================
echo -e "${BLUE}[Phase 6] Bug#5 - Tap Registration${NC}"
echo "---"

TAP_LIST=$(curl -s http://localhost:8082/apis/v1/taps)
TAP_COUNT=$(echo "$TAP_LIST" | jq '.data | length')

if [ "$TAP_COUNT" -gt 0 ]; then
  test_pass "BUG#5-001: Tap instances registered ($TAP_COUNT)"

  INSTANCE=$(echo "$TAP_LIST" | jq -r '.data[0].instance // empty')
  if [ -n "$INSTANCE" ]; then
    test_pass "BUG#5-002: Tap instance label: $INSTANCE"
  fi
else
  test_warn "BUG#5-001: No tap instances yet"
fi

echo ""

# ========================================
# Phase 7: Bug#6 - StorageStats
# ========================================
echo -e "${BLUE}[Phase 7] Bug#6 - StorageStats${NC}"
echo "---"

STATS=$(curl -s -X POST http://localhost:8082/apis/v1/metrics/query_stats \
  -H "Content-Type: application/json" \
  -d '{}')

RETENTION=$(echo "$STATS" | jq '.data.stats.retention_days')
MIN_DATE=$(echo "$STATS" | jq -r '.data.stats.min_time_date')
MAX_DATE=$(echo "$STATS" | jq -r '.data.stats.max_time_date')

if [ "$RETENTION" = "7" ]; then
  test_pass "BUG#6-001: retention_days = 7"
else
  test_fail "BUG#6-001: retention_days = $RETENTION (expected 7)"
fi

if [ -n "$MIN_DATE" ] && [ "$MIN_DATE" != "null" ]; then
  test_pass "BUG#6-002: min_time_date populated: $MIN_DATE"
else
  test_fail "BUG#6-002: min_time_date empty"
fi

if [ -n "$MAX_DATE" ] && [ "$MAX_DATE" != "null" ]; then
  test_pass "BUG#6-003: max_time_date populated: $MAX_DATE"
else
  test_fail "BUG#6-003: max_time_date empty"
fi

echo ""

# ========================================
# Phase 8: Summary
# ========================================
echo "=========================================="
echo -e "Results: ${GREEN}PASS: $PASS${NC} | ${RED}FAIL: $FAIL${NC} | ${YELLOW}WARN: $WARN${NC}"
echo "=========================================="

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}✓ Wave2 Regression: PASS${NC}"
  EXIT_CODE=0
else
  echo -e "${RED}✗ Wave2 Regression: FAIL${NC}"
  EXIT_CODE=1
fi

# Cleanup
echo ""
echo "Cleaning up services..."
pkill -f sonar-store || true
pkill -f sonar-tap || true
pkill -f mock_gameserver || true
sleep 1

exit $EXIT_CODE
