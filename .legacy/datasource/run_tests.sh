#!/bin/bash
# 测试入口脚本 - 从项目根目录运行

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

cat << EOF

╔══════════════════════════════════════════════════════════════════════════════╗
║                           🧪 测试工具菜单                                      ║
╚══════════════════════════════════════════════════════════════════════════════╝

EOF

echo "请选择要运行的测试："
echo ""
echo "  1) test_recorder.py        - 测试 Recorder 缓存数据 (/apis/v1/mark/list)"
echo "  2) compare_data_sources.py - 对比 Recorder 和 TSDB 两种数据源"
echo "  3) test_query.py           - 测试 TSDB 查询功能"
echo "  4) test_mark_batch.py      - 完整压测（包含两种数据源）"
echo "  5) quick_mark_test.py      - 快速 Mark 数据流测试"
echo "  6) test_all.sh             - 运行所有测试"
echo "  7) demo_test.sh            - 演示测试（20秒压测）"
echo ""
echo "  d) 查看文档"
echo "  q) 退出"
echo ""

read -p "请输入选项 [1-7/d/q]: " choice

cd "$PROJECT_ROOT/tests"

case $choice in
    1)
        echo ""
        echo "▶️  运行 test_recorder.py..."
        echo ""
        python3 test_recorder.py
        ;;
    2)
        echo ""
        echo "▶️  运行 compare_data_sources.py..."
        echo ""
        python3 compare_data_sources.py
        ;;
    3)
        echo ""
        echo "▶️  运行 test_query.py..."
        echo ""
        python3 test_query.py
        ;;
    4)
        echo ""
        read -p "运行时长（秒，默认60）: " duration
        read -p "目标QPS（默认10）: " qps
        duration=${duration:-60}
        qps=${qps:-10}
        echo ""
        echo "▶️  运行 test_mark_batch.py --duration $duration --qps $qps..."
        echo ""
        python3 test_mark_batch.py --duration $duration --qps $qps
        ;;
    5)
        echo ""
        echo "▶️  运行 quick_mark_test.py..."
        echo ""
        python3 quick_mark_test.py
        ;;
    6)
        echo ""
        echo "▶️  运行所有测试..."
        echo ""
        ./test_all.sh
        ;;
    7)
        echo ""
        echo "▶️  运行演示测试..."
        echo ""
        ./demo_test.sh
        ;;
    d|D)
        echo ""
        echo "📚 可用文档："
        echo ""
        echo "  - docs/TEST_TOOLS_README.md    - 测试工具使用说明"
        echo "  - docs/TEST_MARK_README.md     - Mark 测试文档"
        echo ""
        read -p "查看哪个文档？[1/2]: " doc_choice
        case $doc_choice in
            1)
                cat "$PROJECT_ROOT/docs/TEST_TOOLS_README.md" | less
                ;;
            2)
                cat "$PROJECT_ROOT/docs/TEST_MARK_README.md" | less
                ;;
            *)
                echo "无效选择"
                ;;
        esac
        ;;
    q|Q)
        echo "👋 再见！"
        exit 0
        ;;
    *)
        echo "❌ 无效选项"
        exit 1
        ;;
esac

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 提示："
echo "  - 查看文档: cat docs/TEST_TOOLS_README.md"
echo "  - 直接运行: cd tests && python3 <script_name>.py"
echo "  - 再次运行: ./run_tests.sh"
echo ""

