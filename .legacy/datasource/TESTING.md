# 测试指南

## 📁 目录结构

```
datasource/
├── tests/                          # 测试脚本目录
│   ├── test_recorder.py           # Recorder 缓存测试
│   ├── test_query.py              # TSDB 查询测试
│   ├── compare_data_sources.py    # 数据源对比
│   ├── test_mark_batch.py         # 完整压测脚本
│   ├── quick_mark_test.py         # 快速测试
│   ├── debug_mark.sh              # 调试脚本（排查数据流问题）
│   ├── test_all.sh                # 运行所有测试
│   ├── demo_test.sh               # 演示测试
│   └── quick_test.sh              # 快速启动脚本
│
├── docs/                           # 文档目录
│   ├── TEST_TOOLS_README.md       # 测试工具详细文档
│   ├── TEST_MARK_README.md        # Mark 测试文档
│   └── TEST_SCRIPT_UPDATE.md      # 脚本更新日志
│
└── run_tests.sh                   # 测试入口脚本（推荐）
```

## 🚀 快速开始

### 方式 1：使用交互式菜单（推荐）

```bash
./run_tests.sh
```

会显示交互式菜单，选择要运行的测试。

### 方式 2：直接运行测试脚本

```bash
# 进入测试目录
cd tests

# 运行测试
python3 test_recorder.py              # Recorder 缓存测试
python3 compare_data_sources.py       # 数据源对比
python3 test_mark_batch.py            # 完整压测
```

### 方式 3：一键运行所有测试

```bash
cd tests
./test_all.sh
```

## 📊 主要测试脚本

### 1. `test_recorder.py` - Recorder 缓存测试

测试 `/apis/v1/mark/list` 接口，查看实时缓存数据。

```bash
cd tests
python3 test_recorder.py
```

### 2. `compare_data_sources.py` - 数据源对比

对比 Recorder（内存缓存）和 TSDB（持久化存储）两种数据源。

```bash
cd tests
python3 compare_data_sources.py
```

### 3. `test_mark_batch.py` - 完整压测

发送批量 Mark 请求，每 10 秒同时显示两种数据源的数据。

```bash
cd tests
python3 test_mark_batch.py --duration 60 --qps 10
```

参数：
- `--duration`: 运行时长（秒），默认 60
- `--qps`: 目标 QPS，默认 10

### 4. `test_query.py` - TSDB 查询测试

快速测试 TSDB 中的数据查询。

```bash
cd tests
python3 test_query.py
```

### 5. `quick_mark_test.py` - 快速数据流测试

发送少量测试数据，验证完整数据流。

```bash
cd tests
python3 quick_mark_test.py
```

## 📚 文档

所有文档位于 `docs/` 目录：

```bash
# 查看测试工具详细文档
cat docs/TEST_TOOLS_README.md

# 查看 Mark 测试文档
cat docs/TEST_MARK_README.md
```

## 💡 常见用法

### 快速验证功能

```bash
cd tests
python3 quick_mark_test.py
python3 test_recorder.py
python3 compare_data_sources.py
```

### 完整压测

```bash
cd tests
python3 test_mark_batch.py --duration 300 --qps 10
```

### 持续监控

在两个终端窗口中：

```bash
# 终端 1：运行压测
cd tests
python3 test_mark_batch.py --duration 300 --qps 10

# 终端 2：每 5 秒查看数据对比
watch -n 5 "cd tests && python3 compare_data_sources.py"
```

## 🔧 依赖安装

测试脚本需要 Python 3 和 `requests` 库：

```bash
pip3 install requests
```

## 📝 注意事项

1. **运行路径**：测试脚本应该从 `tests/` 目录运行
2. **服务状态**：确保 datasource 服务在 `localhost:8080` 运行
3. **stress_id**：默认使用 `test_stress_001`，可以根据需要修改脚本
4. **文档位置**：所有文档都在 `docs/` 目录下

## 🎯 测试目标

- ✅ 验证 Recorder 缓存功能（`/apis/v1/mark/list`）
- ✅ 验证 TSDB 持久化存储（`/apis/v1/metrics/query`）
- ✅ 验证数据聚合器（每 5 秒运行）
- ✅ 验证数据一致性（Recorder vs TSDB）
- ✅ 性能测试（QPS、响应时间、成功率等）

---

更多详细信息请查看：
- 📖 [测试工具详细文档](docs/TEST_TOOLS_README.md)
- 📖 [Mark 测试文档](docs/TEST_MARK_README.md)

