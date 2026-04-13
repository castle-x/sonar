#!/bin/bash
# 快速测试脚本

echo "🚀 Mark 批量请求快速测试"
echo "================================"
echo ""

# 检查 Python3 是否安装
if ! command -v python3 &> /dev/null; then
    echo "❌ 错误: 未找到 python3，请先安装 Python3"
    exit 1
fi

# 检查 requests 库是否安装
python3 -c "import requests" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  警告: requests 库未安装"
    echo "📦 正在安装 requests..."
    pip3 install requests
    if [ $? -ne 0 ]; then
        echo "❌ 安装失败，请手动运行: pip3 install requests"
        exit 1
    fi
    echo "✅ requests 库安装完成"
    echo ""
fi

# 检查服务是否运行
echo "🔍 检查服务状态..."
if curl -s http://localhost:8080/health > /dev/null 2>&1; then
    echo "✅ 服务正常运行"
else
    echo "⚠️  警告: 无法连接到服务 (http://localhost:8080)"
    echo "请确保 datasource 服务已启动"
    echo ""
    read -p "是否继续测试？(y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
echo "================================"
echo "开始测试..."
echo "================================"
echo ""

# 运行测试脚本
python3 test_mark_batch.py "$@"

