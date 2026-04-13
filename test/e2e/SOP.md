# Sonar E2E 测试标准操作流程 (SOP)

> 本文档提供可复用的 E2E 测试执行流程，适用于 AI 或人类自动化执行。
> 最后更新：2026-04-13 | 基于 sonar-tap/sonar-store 集成测试

---

## 1. 测试环境准备

### 1.1 依赖工具和版本要求

| 工具 | 版本 | 用途 | 获取方式 |
|------|------|------|---------|
| Go | >= 1.21 | 编译 sonar-tap、sonar-store、mock_gameserver | https://golang.org/dl |
| curl | >= 7.0 | HTTP 接口测试 | `brew install curl` (macOS) |
| ps/pgrep | 系统自带 | 进程查询 | 系统自带 |
| jq | 可选 | JSON 处理 | `brew install jq` (macOS) |

### 1.2 目录结构和文件清单

```
sonar/
├── test/e2e/
│   ├── SOP.md                      # 本文件：标准操作流程
│   ├── TEST_CASES.md               # 测试用例集
│   ├── E2E_TEST_REPORT.md          # 上一轮测试结果（参考）
│   ├── tap-config-e2e.yaml         # sonar-tap E2E 配置模板
│   ├── mock_gameserver.go          # 模拟游戏服务器（日志生成）
│   ├── sonar-tap.log               # 运行时生成
│   ├── sonar-store.log             # 运行时生成
│   └── mock_gameserver.log         # 运行时生成
├── sonar-tap/
│   ├── cmd/server/main.go
│   ├── config/config.go
│   └── internal/
├── sonar-store/
│   ├── cmd/server/main.go
│   └── internal/
└── legacy/
    └── exporter/                   # 参考代码（仅供参考）
```

### 1.3 环境变量设置

```bash
# 设置工作目录
export SONAR_HOME="/Users/castlexu/github/sonar"
export E2E_HOME="${SONAR_HOME}/test/e2e"

# Go module 配置（如需）
export GO111MODULE=on

# 日志级别（可选）
export LOG_LEVEL=info
```

---

## 2. 构建步骤

所有命令都可直接粘贴执行。建议在 shell 脚本中封装以支持错误检查。

### 2.1 构建 mock_gameserver

模拟游戏服务器，持续输出日志用于 sonar-tap 采集。

```bash
cd ${E2E_HOME}

# 编译
go build -o mock_gameserver ./mock_gameserver.go
if [ $? -ne 0 ]; then
  echo "[ERROR] Failed to build mock_gameserver"
  exit 1
fi

echo "[OK] mock_gameserver built successfully"
```

### 2.2 构建 sonar-tap

数据采集器。

```bash
cd ${SONAR_HOME}/sonar-tap

# 清理旧构建产物
rm -f sonar-tap

# 使用 GVE 构建（推荐）
gve build
if [ $? -ne 0 ]; then
  echo "[ERROR] Failed to build sonar-tap with gve"
  exit 1
fi

# 或使用 go build（备选）
# go build -o sonar-tap ./cmd/server
# if [ $? -ne 0 ]; then
#   echo "[ERROR] Failed to build sonar-tap"
#   exit 1
# fi

echo "[OK] sonar-tap built successfully at $(pwd)/sonar-tap"
```

### 2.3 构建 sonar-store

数据存储服务。

```bash
cd ${SONAR_HOME}/sonar-store

# 清理旧构建产物
rm -f sonar-store

# 编译
go build -o sonar-store ./cmd/server
if [ $? -ne 0 ]; then
  echo "[ERROR] Failed to build sonar-store"
  exit 1
fi

echo "[OK] sonar-store built successfully at $(pwd)/sonar-store"
```

---

## 3. 服务启动顺序

**关键原则：** 必须按顺序启动，每个服务都要通过健康检查才能启动下一个。

### 3.1 启动 sonar-store（端口 8082）

```bash
cd ${SONAR_HOME}/sonar-store

# 启动服务，输出日志到文件
./sonar-store > ${E2E_HOME}/sonar-store.log 2>&1 &
STORE_PID=$!
echo "sonar-store started with PID: ${STORE_PID}"

# 健康检查（最多等待 10 次，每次 1 秒）
for i in {1..10}; do
  sleep 1
  RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:8082/apis/v1/health 2>/dev/null)
  HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
  if [ "$HTTP_CODE" = "200" ]; then
    echo "[OK] sonar-store health check passed"
    break
  fi
  if [ $i -eq 10 ]; then
    echo "[ERROR] sonar-store health check failed after 10s"
    kill $STORE_PID 2>/dev/null
    exit 1
  fi
done
```

**验证命令：**
```bash
curl -s http://localhost:8082/apis/v1/health | jq .
```

预期输出：
```json
{
  "status": "ok"
}
```

### 3.2 启动 mock_gameserver（日志生成）

```bash
cd ${E2E_HOME}

# 清理旧日志文件
rm -f gameserver.log

# 启动 mock_gameserver，定期输出日志
./mock_gameserver > ${E2E_HOME}/mock_gameserver.log 2>&1 &
GAMESERVER_PID=$!
echo "mock_gameserver started with PID: ${GAMESERVER_PID}"

# 等待日志文件生成
sleep 2
if [ ! -f gameserver.log ]; then
  echo "[ERROR] gameserver.log not created"
  kill $GAMESERVER_PID 2>/dev/null
  exit 1
fi

# 验证日志内容
LOG_LINES=$(wc -l < gameserver.log)
if [ $LOG_LINES -gt 0 ]; then
  echo "[OK] mock_gameserver is writing logs (${LOG_LINES} lines)"
  head -5 gameserver.log
else
  echo "[ERROR] gameserver.log is empty"
  kill $GAMESERVER_PID 2>/dev/null
  exit 1
fi
```

**预期日志输出示例：**
```
[2026-04-13 10:20:15] AverageFps:120 ActiveUsers:150 LatencyMs:45
[2026-04-13 10:20:16] AverageFps:119 ActiveUsers:151 LatencyMs:46
[2026-04-13 10:20:17] AverageFps:121 ActiveUsers:149 LatencyMs:44
```

### 3.3 启动 sonar-tap（端口 9090）

sonar-tap 读取配置并开始采集。

```bash
cd ${SONAR_HOME}/sonar-tap

# 复制 E2E 配置到可访问的位置
cp ${E2E_HOME}/tap-config-e2e.yaml ./config-e2e.yaml
if [ $? -ne 0 ]; then
  echo "[ERROR] Failed to copy tap config"
  exit 1
fi

# 启动 sonar-tap，指定配置文件
./sonar-tap -c ./config-e2e.yaml > ${E2E_HOME}/sonar-tap.log 2>&1 &
TAP_PID=$!
echo "sonar-tap started with PID: ${TAP_PID}"

# 健康检查（sonar-tap 启动较快）
for i in {1..5}; do
  sleep 1
  RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:9090/api/v1/health 2>/dev/null)
  HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
  if [ "$HTTP_CODE" = "200" ]; then
    echo "[OK] sonar-tap health check passed"
    break
  fi
  if [ $i -eq 5 ]; then
    echo "[ERROR] sonar-tap health check failed"
    kill $TAP_PID 2>/dev/null
    exit 1
  fi
done

# 验证上报成功
sleep 3
LOGS=$(tail -20 ${E2E_HOME}/sonar-tap.log)
if echo "$LOGS" | grep -q "report success"; then
  echo "[OK] sonar-tap is reporting metrics to sonar-store"
else
  echo "[WARN] No report success log found, checking if metrics are being pushed..."
fi
```

**验证命令：**
```bash
curl -s http://localhost:9090/api/v1/health | jq .
curl -s http://localhost:9090/api/v1/status | jq .
```

---

## 4. 进程名匹配注意事项

### 4.1 关键概念

在 `tap-config-e2e.yaml` 中的 `process_exporter.rules[].name` 字段**必须**与进程的实际可执行文件名精确匹配。

```bash
# 查看 mock_gameserver 进程的实际名称
ps aux | grep mock_gameserver

# 输出示例
# castlexu 12345 0.5 0.1 123456 8192 s001 S 10:20:15 00:00:01 ./mock_gameserver
#                                                              ^^^^^^^^^^^ 实际名称
```

配置文件中应写：
```yaml
process_exporter:
  rules:
    - name: "mock_gameserver"  # 必须精确匹配
      cmdlines: []
      extracts: []
```

### 4.2 调试命令

**查询系统所有进程及其可执行文件名：**

```bash
# macOS/Linux 通用
ps aux | awk '{print $NF}' | grep mock_gameserver

# 仅显示进程名（basename）
ps -p $(pgrep mock_gameserver) -o comm=

# 详细进程信息
ps -p $(pgrep mock_gameserver) -o pid,ppid,comm,cmd
```

**验证 sonar-tap 是否正确发现进程：**

```bash
# 调用 sonar-tap 的进程调试接口
curl -s -X POST http://localhost:9090/api/v1/debug/match_process \
  -H "Content-Type: application/json" \
  -d '{
    "cmdlines": [],
    "rule_name": "GameServer"
  }' | jq .

# 预期输出：found processes 列表中包含 mock_gameserver
```

### 4.3 常见匹配失败原因

| 原因 | 诊断 | 解决方案 |
|------|------|---------|
| 进程名不匹配 | `ps aux \| grep mock_gameserver` 显示不同的名称 | 更新配置中的 `name` 字段 |
| 进程不存在 | `pgrep mock_gameserver` 返回空 | 检查 mock_gameserver 是否真的运行 |
| 权限不足 | `/proc/PID/cmdline` 无法读取（非 root 用户） | 改用 `ps aux` 查询，或提升权限 |
| 命令行过滤不当 | `cmdlines` 条件过严格 | 调整 `cmdlines` 数组或移除条件 |

---

## 5. 数据验证查询模板

### 5.1 查询 node CPU 比率指标

```bash
NOW=$(date +%s)
START=$((NOW - 300))  # 查询最近 5 分钟

curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{
    \"metric_name\": \"node_cpu_ratio\",
    \"start_timestamp\": ${START},
    \"end_timestamp\": ${NOW}
  }" | jq .

# 预期结果：
# {
#   "status": "success",
#   "data": {
#     "points": [
#       {
#         "timestamp": 1681234567,
#         "value": 25.5,
#         "labels": {
#           "exporter": "mock_app_1"
#         }
#       },
#       ...
#     ]
#   }
# }
```

### 5.2 查询 node 内存指标

```bash
NOW=$(date +%s)
START=$((NOW - 300))

curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{
    \"metric_name\": \"node_mem_used_mb\",
    \"start_timestamp\": ${START},
    \"end_timestamp\": ${NOW}
  }" | jq .
```

### 5.3 查询 node 网络流量指标

```bash
NOW=$(date +%s)
START=$((NOW - 300))

curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{
    \"metric_name\": \"node_net_traffic_kbs\",
    \"start_timestamp\": ${START},
    \"end_timestamp\": ${NOW}
  }" | jq .
```

### 5.4 查询 process CPU 指标

```bash
NOW=$(date +%s)
START=$((NOW - 300))

curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{
    \"metric_name\": \"process_cpu_ratio\",
    \"start_timestamp\": ${START},
    \"end_timestamp\": ${NOW},
    \"labels\": {
      \"process_name\": \"mock_gameserver\"
    }
  }" | jq .
```

### 5.5 查询日志提取的指标（avg_fps）

```bash
NOW=$(date +%s)
START=$((NOW - 300))

curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{
    \"metric_name\": \"avg_fps\",
    \"start_timestamp\": ${START},
    \"end_timestamp\": ${NOW}
  }" | jq .

# 预期返回多个数据点，value 为提取的 FPS 值（如 120, 119, 121 等）
```

### 5.6 查询 Exporter 注册状态

```bash
curl -s -X POST http://localhost:8082/apis/v1/exporters/list \
  -H "Content-Type: application/json" \
  -d '{}' | jq .

# 预期结果包含 mock_app_1 及其状态
```

### 5.7 查询存储统计信息

```bash
curl -s http://localhost:8082/apis/v1/storage/stats | jq .

# 预期输出：
# {
#   "status": "success",
#   "data": {
#     "total_metrics": 1500,
#     "total_points": 45000,
#     "exporter_count": 1,
#     "metric_names": ["node_cpu_ratio", "node_mem_used_mb", ...]
#   }
# }
```

---

## 6. 常见问题排查 (Troubleshooting)

### 6.1 sonar-store 404 错误

**症状：** `curl http://localhost:8082/apis/v1/health` 返回 404

**排查步骤：**

```bash
# 1. 检查 sonar-store 是否正常运行
ps aux | grep sonar-store
# 应显示进程存在

# 2. 检查端口是否被占用
lsof -i :8082
# 应显示 sonar-store 监听在该端口

# 3. 查看错误日志
tail -50 ${E2E_HOME}/sonar-store.log | grep -i error

# 4. 检查 sonar-store 代码中的路由定义
grep -r "apis/v1/health" ${SONAR_HOME}/sonar-store/

# 5. 测试其他已知路由
curl -s http://localhost:8082/ 
curl -s http://localhost:8082/api/v1/health
```

**可能原因：**
- 路由前缀不正确（期望 `/apis/v1/` 而非 `/api/v1/`）
- sonar-store 未正确启动（端口绑定失败）
- HTTP 处理器未正确注册

### 6.2 Process 未被发现

**症状：** `curl http://localhost:9090/api/v1/debug/match_process` 返回空列表

**排查步骤：**

```bash
# 1. 验证 mock_gameserver 进程确实存在
pgrep mock_gameserver
# 应返回 PID

# 2. 检查进程名配置
grep -A 5 "process_exporter:" ${SONAR_HOME}/sonar-tap/config-e2e.yaml

# 3. 使用 ps 命令查看实际进程名
ps -p $(pgrep mock_gameserver) -o comm=

# 4. 验证配置中的 name 与上述输出是否一致
# 如不一致，更新配置并重启 sonar-tap

# 5. 检查 cmdlines 过滤是否太严格
# 如果 cmdlines 中有条件，确保 mock_gameserver 的命令行符合条件

# 6. 查看 sonar-tap 日志
tail -20 ${E2E_HOME}/sonar-tap.log | grep -i process
```

**可能原因：**
- 进程名配置不匹配（最常见）
- 进程已退出
- `cmdlines` 过滤条件过严
- 权限不足，无法读取 `/proc/PID/cmdline`

### 6.3 日志文件未被监听

**症状：** `curl -s http://localhost:9090/api/v1/status | jq .` 中的 log watchers 数为 0

**排查步骤：**

```bash
# 1. 检查日志文件是否存在
ls -la ${E2E_HOME}/gameserver.log
# 应该存在且有内容

# 2. 验证 log_config 配置
grep -A 20 "log_config:" ${SONAR_HOME}/sonar-tap/config-e2e.yaml

# 3. 检查日志文件路径配置
# 确保 file_path 与实际路径一致

# 4. 查看 sonar-tap 日志中的 watcher 启动消息
tail -50 ${E2E_HOME}/sonar-tap.log | grep -i "watcher\|log"

# 5. 检查 process matching 是否成功
# 如果 log_config 依赖进程匹配，先确保进程被正确识别

# 6. 手动触发日志生成并查看是否被采集
echo "[2026-04-13 10:21:00] AverageFps:125 ActiveUsers:160 LatencyMs:42" >> ${E2E_HOME}/gameserver.log
sleep 2
curl -s http://localhost:9090/api/v1/metrics/preview?limit=5 | jq '.data.points[] | select(.metric_name == "avg_fps")'
```

**可能原因：**
- 日志文件路径配置错误
- 进程未被发现，导致日志路径提取失败
- 文件监听未启动
- 日志格式与正则表达式不匹配

### 6.4 指标数据为空

**症状：** `/metrics/query` 返回 `points: []`

**排查步骤：**

```bash
# 1. 确认 sonar-tap 正在运行且上报数据
tail -30 ${E2E_HOME}/sonar-tap.log | grep -i "report\|push"

# 2. 查看 preview 接口（实时指标）
curl -s http://localhost:9090/api/v1/metrics/preview?limit=20 | jq '.data.points | length'

# 3. 确认时间戳范围正确
NOW=$(date +%s)
echo "Current timestamp: $NOW"
echo "Query range: $((NOW - 300)) to $NOW"

# 4. 使用更宽的时间范围重试
START=$((NOW - 3600))  # 查询最近 1 小时
curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{\"metric_name\": \"node_cpu_ratio\", \"start_timestamp\": ${START}, \"end_timestamp\": ${NOW}}" | jq .

# 5. 检查是否有任何指标数据
curl -s http://localhost:8082/apis/v1/storage/stats | jq .data.total_points
```

**可能原因：**
- sonar-tap 未能成功上报（网络问题）
- 采集器未启用
- 时间范围不对（查询的数据在时间范围外）
- sonar-store 未正确存储数据

### 6.5 sonar-tap 启动失败

**症状：** `sonar-tap` 启动后立即退出

**排查步骤：**

```bash
# 1. 检查配置文件语法
go run ${SONAR_HOME}/sonar-tap/cmd/server/main.go -c ./config-e2e.yaml

# 2. 查看详细错误日志
cat ${E2E_HOME}/sonar-tap.log

# 3. 确认配置文件路径正确
ls -la ./config-e2e.yaml

# 4. 验证 sonar-store 是否可达
curl -s http://localhost:8082/apis/v1/health

# 5. 尝试用最小化配置启动
# 创建最小配置并重试
```

**可能原因：**
- 配置文件缺失或格式错误
- sonar-store 不可达
- 端口 9090 被占用
- 权限不足（特别是日志文件权限）

---

## 7. 清理步骤

完成测试后，清理运行进程和临时文件。

```bash
# 7.1 停止所有相关进程

# 停止 sonar-tap
pkill -f "sonar-tap.*config-e2e.yaml" || true
sleep 1

# 停止 mock_gameserver
pkill -f "mock_gameserver" || true
sleep 1

# 停止 sonar-store
pkill -f "sonar-store" || true
sleep 1

# 验证进程已停止
echo "Checking if processes are stopped..."
pgrep sonar-tap && echo "[WARN] sonar-tap still running" || echo "[OK] sonar-tap stopped"
pgrep sonar-store && echo "[WARN] sonar-store still running" || echo "[OK] sonar-store stopped"
pgrep mock_gameserver && echo "[WARN] mock_gameserver still running" || echo "[OK] mock_gameserver stopped"

# 7.2 清理临时文件（可选，保留日志用于调查）

# 保留日志，删除其他临时文件
rm -f ${SONAR_HOME}/sonar-tap/config-e2e.yaml
rm -f ${E2E_HOME}/gameserver.log

echo "[OK] E2E test cleanup completed"
```

---

## 8. 完整测试脚本示例

将以下内容保存为 `run_e2e.sh`，可一键执行完整测试：

```bash
#!/bin/bash
set -e

SONAR_HOME="/Users/castlexu/github/sonar"
E2E_HOME="${SONAR_HOME}/test/e2e"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 清理旧进程
log_info "Cleaning up old processes..."
pkill -f "sonar-tap" || true
pkill -f "sonar-store" || true
pkill -f "mock_gameserver" || true
sleep 2

# 构建
log_info "Building sonar-tap, sonar-store, mock_gameserver..."
cd ${E2E_HOME}
go build -o mock_gameserver ./mock_gameserver.go || exit 1

cd ${SONAR_HOME}/sonar-store
go build -o sonar-store ./cmd/server || exit 1

cd ${SONAR_HOME}/sonar-tap
go build -o sonar-tap ./cmd/server || exit 1

# 启动服务
log_info "Starting sonar-store..."
./sonar-store > ${E2E_HOME}/sonar-store.log 2>&1 &
STORE_PID=$!
for i in {1..10}; do
  sleep 1
  curl -s http://localhost:8082/apis/v1/health >/dev/null 2>&1 && break
done
log_info "sonar-store started (PID: $STORE_PID)"

log_info "Starting mock_gameserver..."
cd ${E2E_HOME}
./mock_gameserver > ${E2E_HOME}/mock_gameserver.log 2>&1 &
GAMESERVER_PID=$!
sleep 2
log_info "mock_gameserver started (PID: $GAMESERVER_PID)"

log_info "Starting sonar-tap..."
cd ${SONAR_HOME}/sonar-tap
cp ${E2E_HOME}/tap-config-e2e.yaml ./config-e2e.yaml
./sonar-tap -c ./config-e2e.yaml > ${E2E_HOME}/sonar-tap.log 2>&1 &
TAP_PID=$!
for i in {1..5}; do
  sleep 1
  curl -s http://localhost:9090/api/v1/health >/dev/null 2>&1 && break
done
log_info "sonar-tap started (PID: $TAP_PID)"

# 运行测试（参考 TEST_CASES.md）
log_info "Running test cases..."
sleep 5

# 清理
log_info "Cleaning up..."
pkill -f "sonar-tap" || true
pkill -f "sonar-store" || true
pkill -f "mock_gameserver" || true

log_info "E2E test completed"
```

**使用方式：**
```bash
chmod +x ${E2E_HOME}/run_e2e.sh
${E2E_HOME}/run_e2e.sh
```

---

## 9. 参考资源

- **配置文档**：`sonar-tap/config/config.go` - Config 结构体定义
- **API 文档**：`sonar-store/api/` - Thrift IDL 规范
- **上一轮测试报告**：`test/e2e/E2E_TEST_REPORT.md` - 已知问题和修复进展
- **mock_gameserver 源码**：`test/e2e/mock_gameserver.go` - 日志格式参考

---

**最后更新时间：** 2026-04-13
**SOP 版本：** 1.0
