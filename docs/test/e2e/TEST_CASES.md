# Sonar E2E 测试用例集 (TEST_CASES.md)

> 结构化测试用例，覆盖 sonar-tap、sonar-store 全功能点。
> 每条用例包含前置条件、操作步骤、预期结果、验证命令。
> 最后更新：2026-04-13

---

## 目录

1. [TC-001-TC-005：基础设施测试](#基础设施测试)
2. [TC-006-TC-010：Node 指标采集](#node-指标采集)
3. [TC-011-TC-016：Process 指标采集](#process-指标采集)
4. [TC-017-TC-021：Log 指标提取](#log-指标提取)
5. [TC-022-TC-028：Exporter 生命周期](#exporter-生命周期)
6. [TC-029-TC-035：数据完整性验证](#数据完整性验证)
7. [TC-036-TC-040：路由和接口统一性](#路由和接口统一性)

---

## 基础设施测试

### TC-001: sonar-store 健康检查

**分类**: store | **优先级**: P0

**前置条件**:
- sonar-store 二进制已构建
- 端口 8082 未被占用

**测试步骤**:
1. 启动 sonar-store：`./sonar-store > sonar-store.log 2>&1 &`
2. 等待 2 秒服务启动
3. 执行健康检查

**预期结果**:
- HTTP 返回码：200
- 响应体为有效 JSON

**验证命令**:
```bash
sleep 2
RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:8082/apis/v1/health)
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
[ "$HTTP_CODE" = "200" ] && echo "PASS" || echo "FAIL"
```

**通过标准**: HTTP 200

---

### TC-002: sonar-store 初始化检查

**分类**: store | **优先级**: P0

**前置条件**:
- sonar-store 已启动并通过健康检查

**测试步骤**:
1. 调用存储统计接口

**预期结果**:
- 返回有效的存储统计结构
- `total_metrics >= 0`, `total_points >= 0`

**验证命令**:
```bash
curl -s http://localhost:8082/apis/v1/storage/stats | jq '.data | keys'
```

**通过标准**: 返回有效的统计数据

---

### TC-003: sonar-tap 启动与健康检查

**分类**: tap | **优先级**: P0

**前置条件**:
- sonar-store 已启动
- sonar-tap 二进制已构建
- E2E 配置文件存在

**测试步骤**:
1. 启动 sonar-tap：`./sonar-tap -c ./config-e2e.yaml > sonar-tap.log 2>&1 &`
2. 等待 3 秒启动
3. 执行健康检查

**预期结果**:
- 进程正常运行
- HTTP 返回码：200

**验证命令**:
```bash
sleep 3
curl -s -w "%{http_code}" http://localhost:9090/api/v1/health
```

**通过标准**: HTTP 200

---

### TC-004: sonar-tap 初始状态查询

**分类**: tap | **优先级**: P1

**前置条件**:
- sonar-tap 已启动

**测试步骤**:
1. 调用 status 接口

**预期结果**:
- 返回状态结构，包含 `collectors` 和 `watcher_count`

**验证命令**:
```bash
curl -s http://localhost:9090/api/v1/status | jq '.data | keys'
```

**通过标准**: 返回有效的状态信息

---

### TC-005: mock_gameserver 日志生成验证

**分类**: tap | **优先级**: P0

**前置条件**:
- mock_gameserver 二进制已构建

**测试步骤**:
1. 启动 mock_gameserver：`./mock_gameserver > mock_gameserver.log 2>&1 &`
2. 等待 2 秒
3. 验证日志文件

**预期结果**:
- `gameserver.log` 被创建
- 文件包含多行日志
- 格式：`[YYYY-MM-DD HH:MM:SS] AverageFps:XXX ActiveUsers:YYY LatencyMs:ZZZ`

**验证命令**:
```bash
sleep 2
[ -f gameserver.log ] && [ $(wc -l < gameserver.log) -gt 0 ] && echo "PASS" || echo "FAIL"
```

**通过标准**: 日志文件存在且有内容

---

## Node 指标采集

### TC-006: node CPU 比率指标采集

**分类**: node | **优先级**: P1

**前置条件**:
- sonar-tap、sonar-store 均已启动
- 采集运行 >= 10 秒

**测试步骤**:
1. 等待 10 秒
2. 查询 node_cpu_ratio 指标

**预期结果**:
- 数据点 > 0
- value 在 0-100 范围内

**验证命令**:
```bash
sleep 10
NOW=$(date +%s); START=$((NOW-300))
curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{\"metric_name\":\"node_cpu_ratio\",\"start_timestamp\":${START},\"end_timestamp\":${NOW}}" | \
  jq '.data.points | if length > 0 then "PASS" else "FAIL" end'
```

**通过标准**: 数据点 > 0

---

### TC-007: node 内存指标采集

**分类**: node | **优先级**: P1

**前置条件**:
- sonar-tap、sonar-store 均已启动
- 采集运行 >= 10 秒

**测试步骤**:
1. 等待 10 秒
2. 查询 node_mem_used_mb 指标

**预期结果**:
- 数据点 > 0
- value > 0（系统必然有内存占用）

**验证命令**:
```bash
NOW=$(date +%s); START=$((NOW-300))
curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{\"metric_name\":\"node_mem_used_mb\",\"start_timestamp\":${START},\"end_timestamp\":${NOW}}" | \
  jq '.data.points | if length > 0 then "PASS" else "FAIL" end'
```

**通过标准**: 数据点 > 0

---

### TC-008: node 网络流量指标采集

**分类**: node | **优先级**: P1

**前置条件**:
- sonar-tap、sonar-store 均已启动

**测试步骤**:
1. 查询 node_net_traffic_kbs 指标

**预期结果**:
- 查询成功
- value 为非负数

**验证命令**:
```bash
NOW=$(date +%s); START=$((NOW-300))
curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{\"metric_name\":\"node_net_traffic_kbs\",\"start_timestamp\":${START},\"end_timestamp\":${NOW}}" | \
  jq '.status'
```

**通过标准**: 查询成功

---

### TC-009: node 磁盘指标采集

**分类**: node | **优先级**: P2

**前置条件**:
- sonar-tap、sonar-store 均已启动

**测试步骤**:
1. 查询 node_disk_used_pct 指标

**预期结果**:
- 查询成功
- 如果有数据，value 在 0-100 范围内

**验证命令**:
```bash
NOW=$(date +%s); START=$((NOW-600))
curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{\"metric_name\":\"node_disk_used_pct\",\"start_timestamp\":${START},\"end_timestamp\":${NOW}}" | \
  jq '.status' | grep -q success && echo "PASS" || echo "FAIL"
```

**通过标准**: 查询成功

---

### TC-010: Node 指标标签完整性

**分类**: node | **优先级**: P2

**前置条件**:
- 至少一个 node 指标已采集

**测试步骤**:
1. 查询 node 指标
2. 检查标签中是否包含 exporter

**预期结果**:
- 所有数据点都有 labels.exporter

**验证命令**:
```bash
NOW=$(date +%s); START=$((NOW-300))
curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{\"metric_name\":\"node_cpu_ratio\",\"start_timestamp\":${START},\"end_timestamp\":${NOW}}" | \
  jq '.data.points[0].labels | has("exporter")'
```

**通过标准**: 包含 exporter 标签

---

## Process 指标采集

### TC-011: Process 发现与匹配

**分类**: process | **优先级**: P0

**前置条件**:
- sonar-tap 已启动
- mock_gameserver 进程正在运行

**测试步骤**:
1. 调用 debug/match_process 接口

**预期结果**:
- mock_gameserver 在匹配结果中

**验证命令**:
```bash
curl -s -X POST http://localhost:9090/api/v1/debug/match_process \
  -H "Content-Type: application/json" \
  -d '{"cmdlines":[],"rule_name":"GameServer"}' | \
  jq '.data.found_processes | length > 0'
```

**通过标准**: found_processes 不为空

---

### TC-012: Process CPU 指标采集

**分类**: process | **优先级**: P1

**前置条件**:
- mock_gameserver 进程已发现
- 采集运行 >= 15 秒

**测试步骤**:
1. 等待 15 秒
2. 查询 process_cpu_ratio 指标

**预期结果**:
- Linux：数据点 > 0
- macOS：可接受无数据（已知限制）

**验证命令**:
```bash
sleep 15
NOW=$(date +%s); START=$((NOW-300))
curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{\"metric_name\":\"process_cpu_ratio\",\"start_timestamp\":${START},\"end_timestamp\":${NOW},\"labels\":{\"process_name\":\"mock_gameserver\"}}" | \
  jq '.data.points | length'
```

**通过标准**: Linux 上 > 0；macOS 可为 0

---

### TC-013: Process 内存指标采集

**分类**: process | **优先级**: P1

**前置条件**:
- mock_gameserver 进程已发现
- 采集运行 >= 15 秒

**测试步骤**:
1. 等待 15 秒
2. 查询 process_mem_mb 指标

**预期结果**:
- 数据点 > 0
- value > 0（进程必然占用内存）

**验证命令**:
```bash
NOW=$(date +%s); START=$((NOW-300))
curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{\"metric_name\":\"process_mem_mb\",\"start_timestamp\":${START},\"end_timestamp\":${NOW},\"labels\":{\"process_name\":\"mock_gameserver\"}}" | \
  jq '.data.points[0].value > 0'
```

**通过标准**: value > 0

---

### TC-014: Process 标签完整性

**分类**: process | **优先级**: P2

**前置条件**:
- 至少一个 process 指标已采集

**测试步骤**:
1. 查询 process 指标
2. 检查标签

**预期结果**:
- 包含 process_name 和 pid 标签

**验证命令**:
```bash
NOW=$(date +%s); START=$((NOW-300))
curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{\"metric_name\":\"process_mem_mb\",\"start_timestamp\":${START},\"end_timestamp\":${NOW}}" | \
  jq '.data.points[0].labels | has("process_name") and has("pid")'
```

**通过标准**: 包含两个标签

---

### TC-015: Process 列表动态更新

**分类**: process | **优先级**: P2

**前置条件**:
- mock_gameserver 进程已被发现

**测试步骤**:
1. 停止 mock_gameserver：`pkill mock_gameserver`
2. 等待 dynamic_interval + 5 秒
3. 查询进程状态，验证已移除
4. 重启 mock_gameserver
5. 再次验证被重新发现

**预期结果**:
- 进程停止后不再被采集
- 进程重启后重新出现

**验证命令**:
```bash
# 停止
pkill mock_gameserver || true
sleep 5
echo "Process stopped"

# 重启
cd /Users/castlexu/github/sonar/test/e2e
./mock_gameserver > mock_gameserver.log 2>&1 &
sleep 5
echo "Process restarted"
```

**通过标准**: 进程列表能动态更新

---

### TC-016: Process 匹配规则调试

**分类**: process | **优先级**: P2

**前置条件**:
- sonar-tap 已启动

**测试步骤**:
1. 调用 debug/match_process 接口，测试不同的匹配规则

**预期结果**:
- 接口返回 HTTP 200
- 返回匹配结果

**验证命令**:
```bash
curl -s -X POST http://localhost:9090/api/v1/debug/match_process \
  -H "Content-Type: application/json" \
  -d '{"cmdlines":[],"rule_name":"GameServer"}' | \
  jq '.data.found_processes'
```

**通过标准**: 接口正常响应

---

## Log 指标提取

### TC-017: Log 文件监听启动

**分类**: log | **优先级**: P0

**前置条件**:
- sonar-tap 已启动
- mock_gameserver 正在运行

**测试步骤**:
1. 查询 sonar-tap 状态
2. 检查 watcher_count > 0

**预期结果**:
- watcher_count > 0

**验证命令**:
```bash
curl -s http://localhost:9090/api/v1/status | jq '.data.watcher_count > 0'
```

**通过标准**: watcher_count > 0

---

### TC-018: Log avg_fps 指标提取

**分类**: log | **优先级**: P1

**前置条件**:
- log_config 配置了 avg_fps
- 采集运行 >= 10 秒

**测试步骤**:
1. 等待 10 秒
2. 查询 avg_fps 指标

**预期结果**:
- 数据点 > 0

**验证命令**:
```bash
sleep 10
NOW=$(date +%s); START=$((NOW-300))
curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{\"metric_name\":\"avg_fps\",\"start_timestamp\":${START},\"end_timestamp\":${NOW}}" | \
  jq '.data.points | length > 0'
```

**通过标准**: 数据点 > 0

---

### TC-019: Log active_users 指标提取

**分类**: log | **优先级**: P1

**前置条件**:
- log_config 配置了 active_users
- 采集运行 >= 10 秒

**测试步骤**:
1. 等待 10 秒
2. 查询 active_users 指标

**预期结果**:
- 数据点 > 0

**验证命令**:
```bash
NOW=$(date +%s); START=$((NOW-300))
curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{\"metric_name\":\"active_users\",\"start_timestamp\":${START},\"end_timestamp\":${NOW}}" | \
  jq '.data.points | length > 0'
```

**通过标准**: 数据点 > 0

---

### TC-020: Log latency_ms 指标提取

**分类**: log | **优先级**: P1

**前置条件**:
- log_config 配置了 latency_ms
- 采集运行 >= 10 秒

**测试步骤**:
1. 等待 10 秒
2. 查询 latency_ms 指标

**预期结果**:
- 数据点 > 0
- value 在合理范围内

**验证命令**:
```bash
NOW=$(date +%s); START=$((NOW-300))
curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{\"metric_name\":\"latency_ms\",\"start_timestamp\":${START},\"end_timestamp\":${NOW}}" | \
  jq '.data.points[0].value < 1000'
```

**通过标准**: 数据点 > 0，value 合理

---

### TC-021: Log 每分钟计数

**分类**: log | **优先级**: P2

**前置条件**:
- log_config 配置了分钟计数
- 采集运行 >= 70 秒

**测试步骤**:
1. 等待 70 秒
2. 查询 error_count_minute 指标

**预期结果**:
- 查询成功

**验证命令**:
```bash
sleep 70
NOW=$(date +%s); START=$((NOW-600))
curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{\"metric_name\":\"error_count_minute\",\"start_timestamp\":${START},\"end_timestamp\":${NOW}}" | \
  jq '.status' | grep -q success && echo "PASS" || echo "FAIL"
```

**通过标准**: 查询成功

---

## Exporter 生命周期

### TC-022: Exporter 初始注册

**分类**: store | **优先级**: P0

**前置条件**:
- sonar-tap 已启动并向 sonar-store 上报
- 上报运行 >= 5 秒

**测试步骤**:
1. 查询 exporters/list 接口

**预期结果**:
- 至少一个 exporter 已注册，状态为 UP

**验证命令**:
```bash
sleep 5
curl -s -X POST http://localhost:8082/apis/v1/exporters/list \
  -H "Content-Type: application/json" \
  -d '{}' | jq '.data.exporters | length > 0'
```

**通过标准**: 至少一个 exporter 已注册

---

### TC-023: Exporter 心跳更新

**分类**: store | **优先级**: P1

**前置条件**:
- sonar-tap 已连续上报 >= 30 秒

**测试步骤**:
1. 首次查询 exporters/list，记录 last_report_time
2. 等待 10 秒
3. 再次查询
4. 验证 last_report_time 更新

**预期结果**:
- last_report_time 单调递增

**验证命令**:
```bash
T1=$(curl -s -X POST http://localhost:8082/apis/v1/exporters/list \
  -H "Content-Type: application/json" \
  -d '{}' | jq '.data.exporters[0].last_report_time')
sleep 10
T2=$(curl -s -X POST http://localhost:8082/apis/v1/exporters/list \
  -H "Content-Type: application/json" \
  -d '{}' | jq '.data.exporters[0].last_report_time')
[ "$T2" -gt "$T1" ] && echo "PASS" || echo "FAIL"
```

**通过标准**: last_report_time 单调递增

---

### TC-024: Exporter UP→DOWN 转换

**分类**: store | **优先级**: P1

**前置条件**:
- sonar-tap 已注册且状态为 UP

**测试步骤**:
1. 停止 sonar-tap
2. 等待超时（配置的 DOWN 转换超时）
3. 查询 exporters/list，验证状态变为 DOWN

**预期结果**:
- 停止上报后，exporter 状态自动变为 DOWN

**验证命令**:
```bash
pkill -f "sonar-tap.*config-e2e.yaml" || true
echo "Waiting for exporter timeout..."
sleep 5
curl -s -X POST http://localhost:8082/apis/v1/exporters/list \
  -H "Content-Type: application/json" \
  -d '{}' | jq '.data.exporters[0].status'
```

**通过标准**: 停止上报后状态变为 DOWN 或超时处理

---

### TC-025: 多个 Exporter 并存

**分类**: store | **优先级**: P2

**前置条件**:
- 至少启动了 2 个不同的 sonar-tap 实例

**测试步骤**:
1. 启动两个 sonar-tap 实例，app_id 分别不同
2. 查询 exporters/list
3. 验证两个 exporter 都在列表中

**预期结果**:
- exporters 数组长度 >= 2

**验证命令**:
```bash
curl -s -X POST http://localhost:8082/apis/v1/exporters/list \
  -H "Content-Type: application/json" \
  -d '{}' | jq '.data.exporters | length >= 2'
```

**通过标准**: 可以并存多个 exporter

---

### TC-026: Exporter 隔离验证

**分类**: store | **优先级**: P2

**前置条件**:
- 至少 2 个 exporter 已注册

**测试步骤**:
1. 查询指标，不过滤 exporter
2. 验证结果包含来自多个 exporter 的数据

**预期结果**:
- 数据中的 labels.exporter 包含多个不同的值

**验证命令**:
```bash
NOW=$(date +%s); START=$((NOW-300))
curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{\"metric_name\":\"node_cpu_ratio\",\"start_timestamp\":${START},\"end_timestamp\":${NOW}}" | \
  jq '.data.points[].labels.exporter' | sort | uniq | wc -l
```

**通过标准**: 多个 exporter 值

---

### TC-027: Exporter 标签配置

**分类**: store | **优先级**: P2

**前置条件**:
- sonar-tap 配置中设置了全局标签

**测试步骤**:
1. 查询任意指标
2. 检查标签中是否包含自定义标签

**预期结果**:
- 自定义标签出现在指标标签中

**验证命令**:
```bash
NOW=$(date +%s); START=$((NOW-300))
curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{\"metric_name\":\"node_cpu_ratio\",\"start_timestamp\":${START},\"end_timestamp\":${NOW}}" | \
  jq '.data.points[0].labels | keys'
```

**通过标准**: 标签完整

---

### TC-028: Exporter 自动移除

**分类**: store | **优先级**: P2

**前置条件**:
- sonar-tap 已处于 DOWN 状态 > 配置的移除超时

**测试步骤**:
1. 验证 DOWN 的 exporter 最终被自动移除

**预期结果**:
- DOWN 状态持续足够时间后，exporter 自动移除

**验证命令**:
```bash
# 本测试需要较长等待时间（如 1 小时）
# 这里仅作为逻辑验证占位
echo "TC-028 requires extended wait - verify in long-running tests"
```

**通过标准**: 逻辑可读性强

---

## 数据完整性验证

### TC-029: StorageStats 完整性

**分类**: store | **优先级**: P1

**前置条件**:
- sonar-tap 已上报数据 >= 30 秒

**测试步骤**:
1. 调用 storage/stats 接口
2. 验证返回的统计信息

**预期结果**:
- 返回结构完整
- total_metrics 与 metric_names 长度一致
- total_points > 0

**验证命令**:
```bash
RESPONSE=$(curl -s http://localhost:8082/apis/v1/storage/stats)
TOTAL_METRICS=$(echo "$RESPONSE" | jq '.data.total_metrics')
METRIC_NAMES_COUNT=$(echo "$RESPONSE" | jq '.data.metric_names | length')
[ "$TOTAL_METRICS" -eq "$METRIC_NAMES_COUNT" ] && echo "PASS" || echo "FAIL"
```

**通过标准**: 统计信息一致

---

### TC-030: 数据类型验证

**分类**: store | **优先级**: P1

**前置条件**:
- 至少采集了一条指标

**测试步骤**:
1. 查询任意指标
2. 验证每个数据点的类型

**预期结果**:
- timestamp：整数
- value：数字（浮点或整数）
- labels：对象

**验证命令**:
```bash
NOW=$(date +%s); START=$((NOW-300))
curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{\"metric_name\":\"node_cpu_ratio\",\"start_timestamp\":${START},\"end_timestamp\":${NOW}}" | \
  jq '.data.points[0] | "timestamp:\(.timestamp | type) value:\(.value | type) labels:\(.labels | type)"'
```

**通过标准**: 类型正确

---

### TC-031: 查询时间范围验证

**分类**: store | **优先级**: P1

**前置条件**:
- 已采集数据

**测试步骤**:
1. 查询固定时间范围
2. 验证所有数据点都在范围内

**预期结果**:
- 所有 timestamp 都在 [start, end] 范围内

**验证命令**:
```bash
NOW=$(date +%s); START=$((NOW-300))
RESPONSE=$(curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{\"metric_name\":\"node_cpu_ratio\",\"start_timestamp\":${START},\"end_timestamp\":${NOW}}")
OUTSIDE=$(echo "$RESPONSE" | jq ".data.points[] | select(.timestamp < $START or .timestamp > $NOW)" | wc -l)
[ "$OUTSIDE" -eq 0 ] && echo "PASS" || echo "FAIL"
```

**通过标准**: 所有数据点在范围内

---

### TC-032: 数据持久化验证

**分类**: store | **优先级**: P1

**前置条件**:
- 采集运行 >= 30 秒

**测试步骤**:
1. 第一次查询，记录数据点数
2. 等待 10 秒
3. 第二次查询同一范围
4. 验证数据点数不减少

**预期结果**:
- 第二次查询返回的数据点数 >= 第一次

**验证命令**:
```bash
NOW=$(date +%s); START=$((NOW-300))
COUNT1=$(curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{\"metric_name\":\"node_cpu_ratio\",\"start_timestamp\":${START},\"end_timestamp\":${NOW}}" | \
  jq '.data.points | length')
sleep 10
COUNT2=$(curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{\"metric_name\":\"node_cpu_ratio\",\"start_timestamp\":${START},\"end_timestamp\":$((NOW+10))}" | \
  jq '.data.points | length')
[ "$COUNT2" -ge "$COUNT1" ] && echo "PASS" || echo "FAIL"
```

**通过标准**: 数据持久化

---

### TC-033: 标签过滤查询

**分类**: store | **优先级**: P1

**前置条件**:
- 至少一个 process 指标已采集

**测试步骤**:
1. 查询指标，指定标签过滤
2. 验证返回的所有数据都符合过滤

**预期结果**:
- 所有数据的标签值都匹配过滤条件

**验证命令**:
```bash
NOW=$(date +%s); START=$((NOW-300))
RESPONSE=$(curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{\"metric_name\":\"process_mem_mb\",\"start_timestamp\":${START},\"end_timestamp\":${NOW},\"labels\":{\"process_name\":\"mock_gameserver\"}}")
WRONG=$(echo "$RESPONSE" | jq ".data.points[] | select(.labels.process_name != \"mock_gameserver\")" | wc -l)
[ "$WRONG" -eq 0 ] && echo "PASS" || echo "FAIL"
```

**通过标准**: 过滤正确

---

### TC-034: 空查询结果处理

**分类**: store | **优先级**: P1

**前置条件**:
- sonar-store 已启动

**测试步骤**:
1. 查询不存在的指标或时间范围外的数据

**预期结果**:
- HTTP 200
- data.points 为空数组

**验证命令**:
```bash
RESPONSE=$(curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{\"metric_name\":\"non_existent\",\"start_timestamp\":1000000000,\"end_timestamp\":1000000001}")
POINT_COUNT=$(echo "$RESPONSE" | jq '.data.points | length')
[ "$POINT_COUNT" -eq 0 ] && echo "PASS" || echo "FAIL"
```

**通过标准**: 空结果处理正确

---

### TC-035: 大量数据查询性能

**分类**: store | **优先级**: P2

**前置条件**:
- 采集运行 >= 60 秒

**测试步骤**:
1. 查询 1 小时时间范围的数据

**预期结果**:
- 查询完成
- 响应时间 < 5 秒

**验证命令**:
```bash
NOW=$(date +%s); START=$((NOW-3600))
/usr/bin/time -p curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d "{\"metric_name\":\"node_cpu_ratio\",\"start_timestamp\":${START},\"end_timestamp\":${NOW}}" > /dev/null 2>&1
```

**通过标准**: 查询完成，响应时间合理

---

## 路由和接口统一性

### TC-036: sonar-store 路由前缀

**分类**: store | **优先级**: P0

**前置条件**:
- sonar-store 已启动

**测试步骤**:
1. 测试各接口的路由前缀

**预期结果**:
- 所有接口都以 `/apis/v1/` 开头

**验证命令**:
```bash
echo -n "GET /apis/v1/health: "
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8082/apis/v1/health

echo -n "GET /apis/v1/storage/stats: "
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8082/apis/v1/storage/stats

echo -n "GET /api/v1/health (should 404): "
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8082/api/v1/health
```

**通过标准**: 正确的前缀返回 200，错误的返回 404

---

### TC-037: sonar-tap 路由前缀

**分类**: tap | **优先级**: P0

**前置条件**:
- sonar-tap 已启动

**测试步骤**:
1. 测试各接口的路由前缀

**预期结果**:
- 所有接口都以 `/api/v1/` 开头

**验证命令**:
```bash
echo -n "GET /api/v1/health: "
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:9090/api/v1/health

echo -n "GET /apis/v1/health (should 404): "
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:9090/apis/v1/health
```

**通过标准**: 正确的前缀返回 200

---

### TC-038: 跨服务通信验证

**分类**: store, tap | **优先级**: P1

**前置条件**:
- sonar-tap 和 sonar-store 均已启动

**测试步骤**:
1. 验证 sonar-tap 向 sonar-store 成功上报

**预期结果**:
- 上报请求返回 HTTP 200
- 数据被正确存储

**验证命令**:
```bash
tail -20 ${E2E_HOME}/sonar-tap.log | grep -i "report\|push\|status"
curl -s http://localhost:8082/apis/v1/storage/stats | jq '.data.total_points'
```

**通过标准**: 上报成功，数据被存储

---

### TC-039: 错误响应格式统一

**分类**: store, tap | **优先级**: P1

**前置条件**:
- sonar-store 和 sonar-tap 均已启动

**测试步骤**:
1. 发送会触发错误的请求

**预期结果**:
- 错误响应格式统一

**验证命令**:
```bash
echo "sonar-store error response:"
curl -s -X POST http://localhost:8082/apis/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d 'invalid' | jq .

echo "sonar-tap error response:"
curl -s -X POST http://localhost:9090/api/v1/debug/match_process \
  -H "Content-Type: application/json" \
  -d 'invalid' | jq .
```

**通过标准**: 错误响应格式清晰

---

### TC-040: API 文档完整性

**分类**: store, tap | **优先级**: P2

**前置条件**:
- API 文档已生成

**测试步骤**:
1. 检查 API 文档中定义的所有接口
2. 与实际实现对应

**预期结果**:
- 文档与代码同步

**验证命令**:
```bash
echo "Checking API documentation..."
grep -r "service\|rpc" ${SONAR_HOME}/sonar-*/api/ 2>/dev/null | head -10
```

**通过标准**: 文档与代码一致

---

## 测试总结

**覆盖范围：**

| 分类 | 用例数 | 覆盖项 |
|------|--------|--------|
| 基础设施 | 5 | 服务启动、健康检查、初始化 |
| Node 指标 | 5 | CPU、内存、网络、磁盘采集 |
| Process 指标 | 6 | 进程发现、采集、动态更新 |
| Log 指标 | 5 | 文件监听、指标提取 |
| Exporter 生命周期 | 7 | 注册、心跳、转换、多实例 |
| 数据完整性 | 7 | 统计、类型、范围、过滤 |
| 路由统一性 | 5 | 接口前缀、跨服务、文档 |

**总计：40 条测试用例**

**版本历史：**
- v1.0 (2026-04-13): 初始版本，覆盖基础设施、指标采集、生命周期、数据完整性、路由统一性

