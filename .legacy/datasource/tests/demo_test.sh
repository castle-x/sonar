#!/bin/bash
# 演示完整测试流程

echo "🎯 开始演示测试流程..."
echo ""

# 运行一个短时间的压测
echo "1️⃣  运行20秒压测，每10秒会显示两种数据源："
echo "   - 💾 Recorder 实时缓存数据"
echo "   - 📊 TSDB 聚合数据"
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

python3 test_mark_batch.py --duration 20 --qps 10

