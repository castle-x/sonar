# Wave2 E2E 回归验证计划

**测试日期**: 2026-04-13  
**测试阶段**: Wave2（Bug 修复后验证）  
**测试负责人**: Claude QA Tester  
**基线报告**: E2E_TEST_REPORT.md  

---

## 测试目标

验证 Coder-A 和 Coder-B 的 Bug 修复是否解决了原始问题，确保 sonar-tap/sonar-store 端到端链路完整可用。

### 修复范围

| Bug ID | 修复状态 | 修复者 | 验证要点 |
|--------|---------|--------|---------|
| Bug#1 | ✅ 已修复 | Coder-A | 路由 `/api/metrics/v1/ReportMetrics` 与 `/apis/v1/metrics/batch` 统一 |
| Bug#3 | ✅ 已修复 | Coder-A | `node_cpu_percent` 改为 `node_cpu_ratio`（值×100倍差） |
| Bug#4 | 🔍 待修复 | Coder-B | Process CPU/内存采集在 macOS 上仍为 0（根因：/proc 不存在） |
| Bug#5 | ✅ 已修复 | Coder-A | Tap 注册/心跳机制实现，`GET /apis/v1/taps` 返回实例列表 |
| Bug#6 | ✅ 已修复 | Coder-A | StorageStats 补充 `retention_days`/`min_time_date`/`max_time_date` |

---

## Wave2 测试清单

### Phase 1: 基础验证（P0 - 必须通过）

- [ ] **TC-001**: sonar-store 健康检查 → HTTP 200
- [ ] **TC-002**: sonar-store 初始化检查 → 返回有效统计数据
- [ ] **TC-003**: sonar-tap 启动与健康检查 → HTTP 200
- [ ] **TC-004**: mock_gameserver 启动与日志生成 → 3秒/条日志
- [ ] **TC-005**: 服务链启动无错误 → 所有进程正常运行

### Phase 2: Bug 修复验证（P0 - Critical Bugs）

#### Bug#1: 路由统一性
- [ ] **TC-036**: 验证 `/api/metrics/v1/ReportMetrics` 兼容路由已删除
- [ ] **TC-037**: 验证 sonar-tap 使用 `/apis/v1/metrics/batch` 正确上报
- [ ] **TC-038**: 验证上报不再返回 404 错误

**验证命令**:
```bash
# 检查 sonar-tap 日志中是否有 404 错误
grep -c "status=404" ${E2E_HOME}/sonar-tap.log || echo "0"
# Expected: 0（无 404 错误）
```

#### Bug#3: CPU 单位修复
- [ ] **TC-006**: 验证指标名已改为 `node_cpu_ratio`
- [ ] **TC-007**: 验证 CPU 值为小数比率（0~1 范围）
- [ ] **TC-008**: 验证 CPU 值与系统实测相符（×100 后约等于百分比）

**验证命令**:
```bash
# 查询 node_cpu_ratio（新名称）
curl -s http://localhost:8082/apis/v1/metrics/query \
  -d '{"metric_name":"node_cpu_ratio","limit":1}' | jq '.data[0]'
# Expected: value 在 0.2~0.4 范围内（对应 20~40%）
```

#### Bug#5: Tap 注册机制
- [ ] **TC-039**: 验证 tap 实例已注册
- [ ] **TC-040**: 验证 tap 状态为 UP
- [ ] **TC-041**: 验证 tap 心跳正常更新

**验证命令**:
```bash
# 查询已注册的 tap 实例
curl -s http://localhost:8082/apis/v1/taps | jq '.data'
# Expected: [{"app_id": "sonar-tap-e2e-test", "status": "UP", ...}]

# 查询 tap 统计
curl -s http://localhost:8082/apis/v1/taps/stats | jq '.data'
# Expected: {"total": 1, "up": 1, "down": 0}
```

#### Bug#6: StorageStats 补充字段
- [ ] **TC-042**: 验证 `retention_days` 有值
- [ ] **TC-043**: 验证 `min_time_date` / `max_time_date` 有值
- [ ] **TC-044**: 验证 `disk_size` 正确计算

**验证命令**:
```bash
# 查询存储统计（完整字段）
curl -s http://localhost:8082/apis/v1/storage/stats | jq '.data'
# Expected: retention_days > 0, min_time_date 非空, max_time_date 非空
```

### Phase 3: 数据维度验证（P1 - 功能性）

#### Node 维度（应已正常）
- [ ] **TC-009**: `node_mem_used_mb` 数据正确（与系统 vm_stat 对比）
- [ ] **TC-010**: `node_cpu_ratio` 数据正确（转换为百分比后对比 top）

#### Process 维度（macOS 上仍预期失败，Linux 上应通过）
- [ ] **TC-011**: `process_cpu_percent` 数据采集（仅 Linux）
- [ ] **TC-012**: `process_mem_rss_mb` 数据采集（仅 Linux）

**注意**: Bug#4 尚未修复，macOS 上这两个指标仍为 0。预期 Linux 环境正常。

#### Log 维度（应已正常）
- [ ] **TC-013**: `avg_fps` 数据范围 30~60
- [ ] **TC-014**: `active_users` 数据范围 100~500
- [ ] **TC-015**: `latency_ms` 数据范围 10~100

### Phase 4: 完整性验证（P2 - 可靠性）

- [ ] **TC-016**: 数据流完整性（tap → store 无丢失）
- [ ] **TC-017**: TSDB 存储一致性（查询结果与内部数据一致）
- [ ] **TC-018**: 指标标签正确性（包含 app_id、env、server_id 等）

---

## 执行步骤

### 准备阶段

```bash
# 1. 环境变量
export SONAR_HOME="/Users/castlexu/github/sonar"
export E2E_HOME="${SONAR_HOME}/test/e2e"

# 2. 清理旧进程和数据
pkill -f sonar-store
pkill -f sonar-tap
pkill -f mock_gameserver
sleep 2

# 3. 清理旧数据目录
rm -rf /tmp/sonar-store-data
rm -rf /tmp/gameserver-*.log

# 4. 检查构建产物
ls -la ${SONAR_HOME}/sonar-store/sonar-store
ls -la ${SONAR_HOME}/sonar-tap/sonar-tap
ls -la ${E2E_HOME}/mock_gameserver
```

### 执行阶段

```bash
# 1. 启动服务链（按顺序）
cd ${SONAR_HOME}/sonar-store
./sonar-store > ${E2E_HOME}/sonar-store.log 2>&1 &
sleep 3

cd ${E2E_HOME}
./mock_gameserver --id=server001 -ABSLOG=/tmp/gameserver-server001.log > ${E2E_HOME}/mock_gameserver.log 2>&1 &
sleep 2

cd ${SONAR_HOME}/sonar-tap
./sonar-tap -c ${E2E_HOME}/tap-config-e2e.yaml > ${E2E_HOME}/sonar-tap.log 2>&1 &
sleep 5

# 2. 验证服务健康
curl -s http://localhost:8082/apis/v1/health | jq .
curl -s http://localhost:9090/api/v1/health | jq .
```

### 验证阶段

参考上述各 Phase 的验证命令，逐一检查。

### 清理阶段

```bash
pkill -f sonar-store
pkill -f sonar-tap
pkill -f mock_gameserver
sleep 2
echo "All processes cleaned up"
```

---

## 预期结果矩阵

| 测试类别 | Bug 修复前 | Bug 修复后（预期） | 当前平台（macOS） |
|---------|----------|------------------|----------------|
| 路由匹配 | ❌ 404错误 | ✅ 正常上报 | ✅ PASS |
| CPU 单位 | ❌ ×100倍差 | ✅ 单位一致 | ✅ PASS |
| Tap 注册 | ❌ 空列表 | ✅ 1个实例 | ✅ PASS |
| StorageStats | ❌ 字段缺失 | ✅ 完整字段 | ✅ PASS |
| Process 指标 | ❌ 0条数据 | 🟡 Linux 通过，macOS 仍为 0 | 🟡 PARTIAL |

---

## 成功标准

### 必须通过（GO/NO-GO）
1. ✅ Bug#1 修复验证 PASS（路由一致）
2. ✅ Bug#3 修复验证 PASS（CPU 单位）
3. ✅ Bug#5 修复验证 PASS（Tap 注册）
4. ✅ Bug#6 修复验证 PASS（StorageStats 字段）
5. ✅ Log 维度完全正常（fps/users/latency）

### 允许失败
- 🟡 Bug#4（Process 指标 macOS）- 预期失败，待 Coder-B 后续修复

---

## 问题处理

### 如果测试失败

1. **收集日志**
   ```bash
   # 收集诊断信息
   cp ${E2E_HOME}/sonar-store.log ${E2E_HOME}/diagnostics/
   cp ${E2E_HOME}/sonar-tap.log ${E2E_HOME}/diagnostics/
   
   # 导出 TSDB 数据
   curl -s http://localhost:8082/apis/v1/storage/stats > ${E2E_HOME}/diagnostics/storage-stats.json
   ```

2. **对比基线报告**
   - 与 E2E_TEST_REPORT.md 对比
   - 确认是新增问题还是已知问题

3. **创建修复任务**
   - 更新 BUG 列表
   - 分配给相应 Coder 修复

---

## 报告生成

所有测试完成后，在 `WAVE2_E2E_REGRESSION_REPORT.md` 中记录：
- 各项测试的 PASS/FAIL 状态
- 对比 Wave1 的改进
- 新发现的 Bug
- 后续建议

---

*计划创建时间: 2026-04-13 | Claude QA Tester*
