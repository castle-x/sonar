#!/bin/bash

# Debug Bug#6: StorageStats field serialization issue
set -e

export SONAR_HOME="/Users/castlexu/github/sonar"
export E2E_HOME="${SONAR_HOME}/test/e2e"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Bug#6 Debug: StorageStats Serialization"
echo "=========================================="

# 1. Kill existing processes
echo -e "${YELLOW}[1] Killing existing processes...${NC}"
pkill -f sonar-store || true
pkill -f sonar-tap || true
pkill -f mock_gameserver || true
sleep 2

# 2. Clean data
echo -e "${YELLOW}[2] Cleaning old data...${NC}"
rm -rf /tmp/sonar-store-data
rm -rf /tmp/gameserver-*.log

# 3. Start sonar-store
echo -e "${YELLOW}[3] Starting sonar-store...${NC}"
cd "${SONAR_HOME}/sonar-store"
./sonar-store > "${E2E_HOME}/sonar-store.log" 2>&1 &
STORE_PID=$!
sleep 3

# 4. Health check
echo -e "${YELLOW}[4] Health check...${NC}"
if curl -s http://localhost:8082/apis/v1/health | grep -q "ok"; then
  echo -e "${GREEN}✓ sonar-store is healthy${NC}"
else
  echo -e "${RED}✗ sonar-store health check failed${NC}"
  cat "${E2E_HOME}/sonar-store.log"
  exit 1
fi

# 5. Get initial stats
echo ""
echo -e "${YELLOW}[5] Querying initial StorageStats...${NC}"
STATS=$(curl -s -X POST http://localhost:8082/apis/v1/metrics/query_stats \
  -H "Content-Type: application/json" \
  -d '{}')

echo "Raw response:"
echo "${STATS}" | jq .

echo ""
echo "Extracting stats.retention_days:"
RETENTION_DAYS=$(echo "${STATS}" | jq '.data.stats.retention_days')
echo "retention_days = ${RETENTION_DAYS}"

echo ""
echo "Extracting stats.min_time_date:"
MIN_TIME_DATE=$(echo "${STATS}" | jq '.data.stats.min_time_date')
echo "min_time_date = ${MIN_TIME_DATE}"

echo ""
echo "Extracting stats.max_time_date:"
MAX_TIME_DATE=$(echo "${STATS}" | jq '.data.stats.max_time_date')
echo "max_time_date = ${MAX_TIME_DATE}"

echo ""
echo "All fields in stats:"
echo "${STATS}" | jq '.data.stats'

# 6. Verification
echo ""
echo "=========================================="
echo "Bug#6 Verification Results"
echo "=========================================="

if [ "$RETENTION_DAYS" = "7" ]; then
  echo -e "${GREEN}✓ retention_days is 7${NC}"
else
  echo -e "${RED}✗ retention_days is ${RETENTION_DAYS}, expected 7${NC}"
fi

if [ "$MIN_TIME_DATE" != '""' ] && [ "$MIN_TIME_DATE" != "null" ]; then
  echo -e "${GREEN}✓ min_time_date is populated${NC}"
else
  echo -e "${RED}✗ min_time_date is empty or null${NC}"
fi

if [ "$MAX_TIME_DATE" != '""' ] && [ "$MAX_TIME_DATE" != "null" ]; then
  echo -e "${GREEN}✓ max_time_date is populated${NC}"
else
  echo -e "${RED}✗ max_time_date is empty or null${NC}"
fi

# 7. Debug: Check handler code
echo ""
echo "=========================================="
echo "Handler Code Review"
echo "=========================================="
echo "Expected in handler.go line 148:"
grep -A 2 "RetentionDays:" "${SONAR_HOME}/sonar-store/internal/handler/metrics/handler.go"

# 8. Cleanup
echo ""
echo -e "${YELLOW}[6] Cleaning up...${NC}"
pkill -f sonar-store || true
sleep 1

echo -e "${GREEN}Debug complete${NC}"
