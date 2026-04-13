#!/bin/bash
# 一键测试所有功能

echo ""
echo "🎯 开始全功能测试"
echo "================================================================================"
echo ""

# 获取脚本所在目录的父目录（项目根目录）
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT/tests"

# 1. 测试 Recorder 缓存
echo "1️⃣  测试 Recorder 缓存数据 (/apis/v1/mark/list)"
echo "--------------------------------------------------------------------------------"
python3 test_recorder.py
echo ""
echo "按回车继续..."
read

# 2. 测试 TSDB 数据
echo ""
echo "2️⃣  测试 TSDB 聚合数据 (/apis/v1/metrics/query)"
echo "--------------------------------------------------------------------------------"
python3 test_query.py
echo ""
echo "按回车继续..."
read

# 3. 对比两种数据源
echo ""
echo "3️⃣  对比 Recorder 和 TSDB 两种数据源"
echo "--------------------------------------------------------------------------------"
python3 compare_data_sources.py
echo ""
echo "按回车继续..."
read

# 4. 运行短时间压测
echo ""
echo "4️⃣  运行 15 秒压测，演示实时数据更新"
echo "--------------------------------------------------------------------------------"
echo "⏰ 将在 15 秒后自动结束，期间会显示两种数据源的实时数据"
echo ""
python3 test_mark_batch.py --duration 15 --qps 10

echo ""
echo "================================================================================"
echo "✅ 所有测试完成！"
echo ""
echo "📚 查看详细文档："
echo "   cat ../docs/TEST_TOOLS_README.md"
echo ""
echo "🔧 单独运行某个测试（在 tests/ 目录下）："
echo "   cd tests"
echo "   python3 test_recorder.py          # Recorder 缓存测试"
echo "   python3 test_query.py             # TSDB 数据测试"
echo "   python3 compare_data_sources.py   # 数据源对比"
echo "   python3 test_mark_batch.py        # 完整压测"
echo ""
echo "================================================================================"
echo ""

