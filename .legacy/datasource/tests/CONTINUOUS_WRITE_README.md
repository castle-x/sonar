# 持续数据写入脚本

## 📝 脚本说明

`continuous_write.py` - 持续写入正常数据的脚本，模拟真实的成功请求。

### 特点

✅ **100% 成功率** - 所有请求都成功，无失败  
✅ **真实响应时间** - 正态分布，平均 50ms，范围 20-100ms  
✅ **持续运行** - 可长时间运行（小时级别）  
✅ **可配置** - 支持多种参数配置  
✅ **实时统计** - 显示运行状态和统计信息  

## 🚀 快速开始

### 基本用法

```bash
cd tests

# 运行 1 小时（默认）
python3 continuous_write.py

# 运行 10 分钟
python3 continuous_write.py --duration 600

# 运行 24 小时
python3 continuous_write.py --duration 86400
```

### 常用场景

#### 1. 测试环境 - 快速验证（5分钟）

```bash
python3 continuous_write.py --duration 300
```

#### 2. 压力测试 - 高QPS（每秒20个Mark）

```bash
python3 continuous_write.py --batch-size 20 --interval 1.0
```

#### 3. 稳定性测试 - 长时间运行（12小时）

```bash
python3 continuous_write.py --duration 43200
```

#### 4. 低频测试 - 每10秒一批

```bash
python3 continuous_write.py --batch-size 10 --interval 10.0
```

#### 5. 生产环境模拟 - 自定义stress_id

```bash
python3 continuous_write.py --stress-id prod_api_001 --duration 3600
```

## 📊 参数说明

| 参数 | 说明 | 默认值 | 示例 |
|------|------|--------|------|
| `--duration` | 运行时长（秒） | 3600（1小时） | `--duration 600` |
| `--batch-size` | 每批次Mark数量 | 10 | `--batch-size 20` |
| `--interval` | 批次间隔（秒） | 1.0 | `--interval 0.5` |
| `--stress-id` | 压测ID | production_001 | `--stress-id test_001` |
| `--url` | 服务地址 | http://localhost:8080 | `--url http://api:8080` |

### QPS 计算

```
预估 QPS = batch-size / interval
```

例如：
- `--batch-size 10 --interval 1.0` → QPS ≈ 10
- `--batch-size 20 --interval 1.0` → QPS ≈ 20
- `--batch-size 10 --interval 0.5` → QPS ≈ 20
- `--batch-size 50 --interval 5.0` → QPS ≈ 10

## 📈 输出说明

### 运行中输出

```
⏱️  运行:  123.5s | 请求:   124 | Mark:   1240 | QPS:   1.00 | Mark/s:   10.04 | ✅ 全部成功
```

- **运行**: 已运行时长
- **请求**: 发送的批次数
- **Mark**: 发送的Mark总数
- **QPS**: 平均每秒批次数
- **Mark/s**: 平均每秒Mark数
- **✅ 全部成功**: 所有请求都成功

### 完成输出

```
================================================================================
✅ 写入完成
================================================================================
⏱️  总运行时长: 3600.15秒 (1.00小时)
📤 总批次数: 3601
📝 总Mark数: 36010
⚡ 平均QPS: 1.00
📊 平均Mark/秒: 10.00
✅ 成功率: 100% (全部成功)
================================================================================
```

## 🔍 数据特征

### 请求名称

脚本使用 10 个真实的 API 名称：

- `api_user_login` - 用户登录
- `api_user_info` - 用户信息
- `api_product_list` - 商品列表
- `api_product_detail` - 商品详情
- `api_order_create` - 创建订单
- `api_order_query` - 查询订单
- `api_payment_submit` - 提交支付
- `api_cart_add` - 添加购物车
- `api_search` - 搜索
- `api_recommend` - 推荐

### 响应时间分布

- **分布类型**: 正态分布（高斯分布）
- **平均值**: 50ms
- **标准差**: 10ms
- **范围**: 20-100ms
- **典型值**:
  - P50: ~50ms
  - P90: ~65ms
  - P99: ~75ms

### 成功率

- **100%** 成功
- 所有 Mark 都没有 `error_msg` 字段
- 模拟生产环境的正常请求

## 💡 使用建议

### 1. 短期测试（< 1小时）

适合功能验证、调试：

```bash
# 5 分钟快速测试
python3 continuous_write.py --duration 300

# 10 分钟验证测试
python3 continuous_write.py --duration 600
```

### 2. 长期测试（> 1小时）

适合稳定性测试、性能基准：

```bash
# 后台运行 24 小时
nohup python3 continuous_write.py --duration 86400 > write.log 2>&1 &

# 查看日志
tail -f write.log
```

### 3. 不同 QPS 场景

```bash
# 低频（QPS=1）
python3 continuous_write.py --batch-size 10 --interval 10.0

# 中频（QPS=10）
python3 continuous_write.py --batch-size 10 --interval 1.0

# 高频（QPS=50）
python3 continuous_write.py --batch-size 50 --interval 1.0

# 极高频（QPS=100）
python3 continuous_write.py --batch-size 100 --interval 1.0
```

### 4. 配合监控使用

在另一个终端监控数据：

```bash
# 终端 1: 持续写入
cd tests
python3 continuous_write.py --duration 3600

# 终端 2: 每5秒查看 Recorder 数据
watch -n 5 "python3 test_recorder.py"

# 终端 3: 每5秒对比数据源
watch -n 5 "python3 compare_data_sources.py"
```

## ⚙️ 高级用法

### 多实例并发

在不同终端运行多个实例，使用不同的 stress_id：

```bash
# 终端 1
python3 continuous_write.py --stress-id service_a --duration 3600

# 终端 2
python3 continuous_write.py --stress-id service_b --duration 3600

# 终端 3
python3 continuous_write.py --stress-id service_c --duration 3600
```

### 自定义参数组合

```bash
# 模拟真实生产流量（低频稳定）
python3 continuous_write.py \
  --stress-id production_api \
  --batch-size 5 \
  --interval 1.0 \
  --duration 86400

# 模拟峰值流量（高频短时）
python3 continuous_write.py \
  --stress-id peak_load \
  --batch-size 100 \
  --interval 1.0 \
  --duration 300
```

## 🛑 停止脚本

### 前台运行

```bash
# 按 Ctrl+C 停止
# 脚本会优雅退出并显示最终统计
```

### 后台运行

```bash
# 查找进程
ps aux | grep continuous_write.py

# 停止进程
kill <PID>

# 或者强制停止
pkill -f continuous_write.py
```

## 📊 验证数据

脚本运行后，使用其他测试工具验证数据：

```bash
# 查看 Recorder 缓存
python3 test_recorder.py

# 查看 TSDB 数据
python3 test_query.py

# 对比数据源
python3 compare_data_sources.py
```

## ⚠️ 注意事项

1. **服务状态**: 确保 datasource 服务正常运行
2. **磁盘空间**: 长时间运行会产生大量数据，注意磁盘空间
3. **内存使用**: 高 QPS 时注意监控内存使用
4. **数据清理**: 测试完成后记得清理测试数据
5. **资源消耗**: 极高 QPS（>100）时注意 CPU 使用率

## 🔧 故障排查

### 问题 1: 连接失败

```
⚠️  警告: 无法连接到服务
```

**解决方案**:
- 检查服务是否启动
- 检查端口是否正确（默认8080）
- 检查防火墙设置

### 问题 2: 请求失败

```
⚠️  API返回错误: xxx
```

**解决方案**:
- 查看服务日志
- 检查 stress_id 是否合法
- 检查服务资源是否充足

### 问题 3: QPS 不达预期

**解决方案**:
- 调整 `--batch-size` 和 `--interval`
- 检查网络延迟
- 检查服务处理能力

## 📝 示例日志

```bash
$ python3 continuous_write.py --duration 60 --batch-size 20 --interval 1.0

================================================================================
🚀 持续数据写入 - 正常模式
================================================================================
📌 服务地址: http://localhost:8080
📌 压测ID: production_001
📌 运行时长: 60秒 (0.0小时)
📌 批次大小: 20 个Mark
📌 批次间隔: 1.0秒
📌 预估QPS: 20.00
📌 响应时间: ~50ms (正态分布 20-100ms)
📌 成功率: 100% (全部成功)
================================================================================

开始写入数据...

⏱️  运行:   60.2s | 请求:    61 | Mark:   1220 | QPS:  1.01 | Mark/s:   20.26 | ✅ 全部成功

================================================================================
✅ 写入完成
================================================================================
⏱️  总运行时长: 60.15秒 (0.02小时)
📤 总批次数: 61
📝 总Mark数: 1220
⚡ 平均QPS: 1.01
📊 平均Mark/秒: 20.28
✅ 成功率: 100% (全部成功)
================================================================================
```

---

**Happy Testing!** 🎉

