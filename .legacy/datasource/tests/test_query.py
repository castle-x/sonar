#!/usr/bin/env python3
"""快速查询测试 - 验证 TSDB 数据显示"""

import requests
import json

BASE_URL = "http://localhost:8080"
STRESS_ID = "test_stress_001"

def query_tsdb_metric(metric_name):
    """查询 TSDB 中的指标"""
    print(f"\n📊 查询指标: {metric_name}")
    print("="*60)
    
    response = requests.post(
        f"{BASE_URL}/apis/v1/metrics/query",
        json={
            "metric_name": metric_name,
            "labels": ["stress_id", STRESS_ID],
            "start_time": 0,
            "end_time": 0,
            "limit": 3  # 获取最新3个数据点
        },
        timeout=5
    )
    
    if response.status_code == 200:
        result = response.json()
        if result.get("code") == 0:
            data = result.get("data", [])
            if isinstance(data, list) and len(data) > 0:
                points = data[0].get("points", [])
                total_count = data[0].get("total_count", 0)
                
                print(f"✅ 找到 {total_count} 个数据点")
                print(f"\n显示最新 {len(points)} 个:")
                
                for i, point in enumerate(points, 1):
                    labels = point.get("label_list", [])
                    # 提取 request_name
                    request_name = "N/A"
                    for j in range(0, len(labels), 2):
                        if labels[j] == "request_name":
                            request_name = labels[j+1]
                            break
                    
                    print(f"  {i}. request_name={request_name}, "
                          f"value={point.get('value')}, "
                          f"timestamp={point.get('timestamp')}")
                return True
            else:
                print("⚠️  无数据")
                return False
        else:
            print(f"❌ 查询失败: {result.get('message')}")
            return False
    else:
        print(f"❌ HTTP 错误: {response.status_code}")
        return False

def main():
    print("🔍 TSDB 数据查询测试")
    print("="*60)
    print(f"Stress ID: {STRESS_ID}")
    print("="*60)
    
    # 测试查询各种指标
    metrics = [
        "total_num",
        "failed_num", 
        "rtt_avg_ms",
        "qps_avg"
    ]
    
    found_any = False
    for metric in metrics:
        if query_tsdb_metric(metric):
            found_any = True
    
    print("\n" + "="*60)
    if found_any:
        print("✅ 测试完成！TSDB 中有数据")
        print("\n💡 现在可以运行完整测试脚本:")
        print("   python3 test_mark_batch.py --duration 30 --qps 10")
    else:
        print("⚠️  TSDB 中暂无数据")
        print("\n💡 建议:")
        print("   1. 确认服务正在运行")
        print("   2. 发送一些 Mark 数据")
        print("   3. 等待 5-10 秒让聚合器运行")
    print("="*60)

if __name__ == '__main__':
    main()

