# 测试工具使用说明

## 📋 工具清单

### 1️⃣ `test_recorder.py` - Recorder 缓存专项测试

**功能**：测试 `/apis/v1/mark/list` 接口，查看实时缓存数据

**使用**：
```bash
python3 test_recorder.py
```

**输出示例**：
```
💾 Recorder 缓存数据查询测试
============================================================
✅ 找到 10 个请求的数据

请求名称                      总数     失败   成功率      QPS
api_login                      789       82   89.61%     5.45
api_logout                     789       85   89.23%     5.41
...
```

**特点**：
- ✅ 实时数据，立即更新
- ✅ 内存存储，速度快
- ⚠️ 服务重启后数据丢失
- ⚠️ TTL 过期后自动清理

---

### 2️⃣ `compare_data_sources.py` - 数据源对比

**功能**：对比 Recorder（缓存）和 TSDB（持久化）两种数据源

**使用**：
```bash
python3 compare_data_sources.py
```

**输出示例**：
```
📊 数据源对比测试
============================================================
💾 Recorder 缓存: 10 个请求
📊 TSDB 聚合数据: 10 个请求

请求名称                   Recorder总数    TSDB总数    差异
api_login                        789         789       0 ✅
api_logout                       789         789       0 ✅
...
```

**用途**：
- 验证数据一致性
- 检查聚合器是否正常工作
- 查看聚合延迟（正常应该 <= 5秒的数据量差异）

---

### 3️⃣ `test_mark_batch.py` - 完整压测（包含两种数据）

**功能**：发送批量 Mark 请求，并每 10 秒查询两种数据源

**使用**：
```bash
# 基本用法
python3 test_mark_batch.py

# 自定义参数
python3 test_mark_batch.py --duration 30 --qps 10

# 参数说明
--duration  运行时长（秒），默认 60
--qps       目标QPS，默认 10
```

**输出示例**：
```
🚀 开始压测...
📌 压测ID: test_stress_001
📌 目标QPS: 10
📌 运行时长: 30秒
📌 指标查询: 每10秒
   - 💾 Recorder 缓存数据（实时）
   - 📊 TSDB 聚合数据（持久化）
============================================================

... 每 5 秒输出统计信息 ...

================================================================================
💾 Recorder 实时缓存数据 [2025-12-18 18:57:00]
================================================================================

请求名称                      总数     失败   成功率   平均RT   P50   P90   P99    QPS
api_login                      120       12   90.00%   255ms  251ms 450ms 495ms  10.25
...
================================================================================

================================================================================
📈 TSDB 聚合数据 [2025-12-18 18:57:00]
================================================================================

请求名称                      总数     失败   成功率   平均RT   P50   P90   P99    QPS
api_login                      120       12   90.00%   255ms  251ms 450ms 495ms  10.25
...
================================================================================
```

**特点**：
- ✅ 同时显示两种数据源
- ✅ 实时统计信息
- ✅ 自动对比数据差异
- ✅ 详细的性能指标

---

### 4️⃣ `test_query.py` - TSDB 快速查询测试

**功能**：快速测试 TSDB 中的数据

**使用**：
```bash
python3 test_query.py
```

**输出示例**：
```
📊 查询指标: total_num
✅ 找到 3 个数据点

显示最新 3 个:
  1. request_name=api_logout, value=101, timestamp=1766054338867
  2. request_name=api_login, value=98, timestamp=1766054333867
  ...
```

---

### 5️⃣ `quick_mark_test.py` - 快速 Mark 测试

**功能**：发送少量测试数据，验证完整数据流

**使用**：
```bash
python3 quick_mark_test.py
```

**流程**：
1. 发送 10 个 Mark 请求
2. 立即查询 Recorder
3. 等待 6 秒
4. 再次查询 Recorder
5. 查询 TSDB 数据

---

## 🎯 推荐测试流程

### 场景 1：快速验证功能
```bash
# 1. 快速测试
python3 quick_mark_test.py

# 2. 查看 Recorder 缓存
python3 test_recorder.py

# 3. 对比两种数据源
python3 compare_data_sources.py
```

### 场景 2：完整压测
```bash
# 运行完整压测（30秒，QPS=10）
python3 test_mark_batch.py --duration 30 --qps 10
```

### 场景 3：持续监控
```bash
# 一边压测，一边在另一个终端观察数据变化
# 终端 1：
python3 test_mark_batch.py --duration 300 --qps 10

# 终端 2（每隔几秒运行一次）：
watch -n 5 "python3 compare_data_sources.py"
```

---

## 📊 两种数据源对比

| 特性 | Recorder 缓存 | TSDB 聚合数据 |
|------|--------------|--------------|
| **接口** | `/apis/v1/mark/list` | `/apis/v1/metrics/query` |
| **存储** | 内存 | 磁盘（持久化） |
| **更新频率** | 实时（毫秒级） | 每 5 秒聚合一次 |
| **数据保留** | TTL 过期清理（默认 5 分钟） | 长期保留（默认 7 天） |
| **重启后** | ❌ 数据丢失 | ✅ 数据保留 |
| **查询速度** | ⚡ 极快 | 📊 较快 |
| **历史数据** | ❌ 仅当前累积 | ✅ 可查询历史 |
| **用途** | 实时监控 | 历史分析、报表 |

---

## 🔧 故障排查

### 问题 1：Recorder 中无数据
```bash
# 检查服务是否运行
curl http://localhost:8080/health

# 手动发送一个 Mark 请求
curl -X POST http://localhost:8080/apis/v1/mark \
  -H "Content-Type: application/json" \
  -d '{"stress_id": "test", "start_time": 0, "end_time": 100, "request_name": "test_api"}'

# 再次查询
python3 test_recorder.py
```

### 问题 2：TSDB 中无数据但 Recorder 有数据
```bash
# 查看服务日志，检查聚合器是否正常运行
# 应该看到类似的日志：
# [INFO] [MarkAggregator] [Processing stress_id=xxx with 10 requests]
# [INFO] [MarkAggregator] [Aggregated 100 metric points from 1 stress IDs]

# 等待 5-10 秒后重试
sleep 10
python3 compare_data_sources.py
```

### 问题 3：两种数据源差异很大
```bash
# 检查聚合器配置（应该是 5 秒）
cat bin/config.yaml | grep aggregate_interval

# 查看服务日志中的聚合频率
# 正常情况下每 5 秒会有一次聚合日志
```

---

## 💡 最佳实践

1. **开发测试**：使用 `quick_mark_test.py` 快速验证
2. **功能验证**：使用 `test_recorder.py` 检查实时数据
3. **性能测试**：使用 `test_mark_batch.py` 进行压测
4. **监控对比**：使用 `compare_data_sources.py` 验证一致性
5. **问题排查**：使用 `test_query.py` 检查 TSDB 存储

---

## 📝 注意事项

1. **stress_id**：所有测试脚本默认使用 `test_stress_001`，可以根据需要修改
2. **端口**：默认服务端口为 `8080`，确保服务正常运行
3. **聚合延迟**：Recorder 和 TSDB 之间正常会有 0-5 秒的延迟
4. **TTL 清理**：Recorder 数据会在 5 分钟后自动清理，TSDB 数据保留 7 天

---

## 🚀 快速开始

```bash
# 1. 确保服务运行
cd /data/home/castlexu/datasource/bin
./datasource

# 2. 新开终端，运行测试
cd /data/home/castlexu/datasource
python3 test_mark_batch.py --duration 30 --qps 10

# 3. 查看实时数据（在另一个终端）
python3 test_recorder.py

# 4. 对比数据源
python3 compare_data_sources.py
```

---

## ✅ 验收标准

测试通过的标志：

- ✅ `test_recorder.py` 能查询到所有 10 个请求的数据
- ✅ `test_query.py` 能查询到 TSDB 中的数据
- ✅ `compare_data_sources.py` 显示两种数据源差异很小（<= 5秒数据量）
- ✅ `test_mark_batch.py` 能正常运行并显示两种数据
- ✅ 服务日志显示聚合器每 5 秒运行一次

---

祝测试顺利！🎉

