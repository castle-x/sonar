#!/bin/bash
# 快速启动持续写入脚本

echo ""
echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                      🚀 持续数据写入 - 快速启动                               ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 显示菜单
echo "请选择运行模式："
echo ""
echo "  1) 快速测试（5分钟，QPS=10）"
echo "  2) 短期测试（30分钟，QPS=10）"
echo "  3) 中期测试（1小时，QPS=10）"
echo "  4) 长期测试（3小时，QPS=10）"
echo "  5) 稳定性测试（24小时，QPS=5）"
echo "  6) 高频测试（10分钟，QPS=50）"
echo "  7) 自定义参数"
echo "  8) 查看帮助"
echo ""

read -p "请输入选项 [1-8]: " choice

case $choice in
    1)
        echo ""
        echo "▶️  运行快速测试（5分钟）..."
        python3 continuous_write.py --duration 300 --batch-size 10 --interval 1.0
        ;;
    2)
        echo ""
        echo "▶️  运行短期测试（30分钟）..."
        python3 continuous_write.py --duration 1800 --batch-size 10 --interval 1.0
        ;;
    3)
        echo ""
        echo "▶️  运行中期测试（1小时）..."
        python3 continuous_write.py --duration 3600 --batch-size 10 --interval 1.0
        ;;
    4)
        echo ""
        echo "▶️  运行长期测试（3小时）..."
        python3 continuous_write.py --duration 10800 --batch-size 10 --interval 1.0
        ;;
    5)
        echo ""
        echo "▶️  运行稳定性测试（24小时，低频）..."
        read -p "确认后台运行？(y/n) " confirm
        if [[ $confirm =~ ^[Yy]$ ]]; then
            nohup python3 continuous_write.py --duration 86400 --batch-size 5 --interval 1.0 > continuous_write.log 2>&1 &
            echo "✅ 已在后台启动，PID: $!"
            echo "📝 查看日志: tail -f continuous_write.log"
        fi
        ;;
    6)
        echo ""
        echo "▶️  运行高频测试（10分钟，QPS=50）..."
        python3 continuous_write.py --duration 600 --batch-size 50 --interval 1.0
        ;;
    7)
        echo ""
        read -p "运行时长（秒）: " duration
        read -p "批次大小: " batch_size
        read -p "批次间隔（秒）: " interval
        read -p "stress_id [production_001]: " stress_id
        
        duration=${duration:-3600}
        batch_size=${batch_size:-10}
        interval=${interval:-1.0}
        stress_id=${stress_id:-production_001}
        
        echo ""
        echo "▶️  运行自定义测试..."
        echo "   时长: ${duration}秒"
        echo "   批次大小: ${batch_size}"
        echo "   间隔: ${interval}秒"
        echo "   QPS: $(awk "BEGIN {print $batch_size/$interval}")"
        echo ""
        
        python3 continuous_write.py \
            --duration $duration \
            --batch-size $batch_size \
            --interval $interval \
            --stress-id $stress_id
        ;;
    8)
        echo ""
        python3 continuous_write.py --help
        echo ""
        echo "📚 查看详细文档："
        echo "   cat CONTINUOUS_WRITE_README.md"
        ;;
    *)
        echo "❌ 无效选项"
        exit 1
        ;;
esac

echo ""

