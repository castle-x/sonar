# 测试脚本目录

本目录包含所有测试脚本。

## 📋 脚本列表

### Python 测试脚本

| 脚本 | 说明 | 接口 |
|------|------|------|
| `test_recorder.py` | 测试 Recorder 缓存数据 | `/apis/v1/mark/list` |
| `test_query.py` | 测试 TSDB 查询功能 | `/apis/v1/metrics/query` |
| `compare_data_sources.py` | 对比两种数据源 | 两个接口 |
| `test_mark_batch.py` | 完整压测（包含两种数据） | `/apis/v1/mark/batch` + 两个查询接口 |
| `quick_mark_test.py` | 快速数据流测试 | 完整数据流 |
| `continuous_write.py` | 持续写入正常数据 ⭐ | `/apis/v1/mark/batch` |

### Shell 测试脚本

| 脚本 | 说明 |
|------|------|
| `test_all.sh` | 依次运行所有测试（交互式） |
| `demo_test.sh` | 快速演示（20秒压测） |
| `quick_test.sh` | 快速启动测试脚本 |
| `debug_mark.sh` | 调试脚本（排查数据流问题） |

## 🚀 快速开始

### 从项目根目录运行（推荐）

```bash
# 使用交互式菜单
./run_tests.sh
```

### 从 tests/ 目录运行

```bash
# 进入测试目录
cd tests

# 运行单个测试
python3 test_recorder.py              # Recorder 缓存测试
python3 test_query.py                 # TSDB 查询测试
python3 compare_data_sources.py       # 数据源对比
python3 test_mark_batch.py            # 完整压测

# 运行所有测试
./test_all.sh

# 快速演示
./demo_test.sh
```

## 📊 测试数据源

### 1. Recorder 缓存（内存）

- **接口**: `/apis/v1/mark/list`
- **特点**: 实时数据，毫秒级更新
- **测试脚本**: `test_recorder.py`

### 2. TSDB 聚合数据（持久化）

- **接口**: `/apis/v1/metrics/query`
- **特点**: 持久化存储，每5秒聚合
- **测试脚本**: `test_query.py`

### 3. 数据源对比

- **测试脚本**: `compare_data_sources.py`
- **用途**: 验证数据一致性

## 💡 使用建议

1. **快速验证**: 先运行 `quick_mark_test.py`
2. **实时监控**: 使用 `test_recorder.py`
3. **持久化数据**: 使用 `test_query.py`
4. **完整测试**: 使用 `test_mark_batch.py`
5. **数据验证**: 使用 `compare_data_sources.py`

## 📚 更多文档

详细文档位于 `../docs/` 目录：

- [TEST_TOOLS_README.md](../docs/TEST_TOOLS_README.md) - 测试工具详细文档
- [TEST_MARK_README.md](../docs/TEST_MARK_README.md) - Mark 测试文档
- [TESTING.md](../TESTING.md) - 测试指南

## 🔧 依赖

```bash
pip3 install requests
```

## 📝 注意事项

1. 确保服务运行在 `localhost:8080`
2. 默认使用 `stress_id=test_stress_001`
3. 可以根据需要修改脚本中的配置

