#!/usr/bin/env python3
"""快速 Mark 测试脚本 - 用于排查数据流问题"""

import requests
import time
import json

BASE_URL = "http://localhost:8080"
STRESS_ID = "debug_test_001"

def send_marks(count=10):
    """发送测试 Mark 数据"""
    print(f"📤 发送 {count} 个 Mark 请求...")
    
    marks = []
    current_time = int(time.time() * 1000)
    
    for i in range(count):
        marks.append({
            "stress_id": STRESS_ID,
            "start_time": current_time - 100,
            "end_time": current_time,
            "request_name": "test_api"
        })
        current_time += 100
    
    payload = {"mark_list": marks}
    
    try:
        response = requests.post(
            f"{BASE_URL}/apis/v1/mark/batch",
            json=payload,
            timeout=5
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get("code") == 0:
                print(f"✅ 成功发送 {count} 个 Mark")
                return True
            else:
                print(f"❌ 发送失败: {result.get('message')}")
                return False
        else:
            print(f"❌ HTTP 错误: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ 请求异常: {e}")
        return False

def query_recorder():
    """查询 Recorder 中的数据"""
    print(f"\n📊 查询 Recorder 数据...")
    
    try:
        response = requests.post(
            f"{BASE_URL}/apis/v1/mark/list",
            json={"query": json.dumps({"stress_id": STRESS_ID})},
            timeout=5
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get("code") == 0:
                data = result.get("data", {})
                if isinstance(data, dict) and data:
                    print("✅ Recorder 有数据:")
                    for req_name, metrics in data.items():
                        print(f"   {req_name}: total={metrics.get('total_num', 0)}, "
                              f"failed={metrics.get('failed_num', 0)}, "
                              f"qps={metrics.get('qps_avg', 0)}")
                    return True
                else:
                    print("⚠️  Recorder 暂无数据")
                    return False
            else:
                print(f"❌ 查询失败: {result.get('message')}")
                return False
        else:
            print(f"❌ HTTP 错误: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ 查询异常: {e}")
        return False

def query_tsdb():
    """查询 TSDB 中的数据"""
    print(f"\n📊 查询 TSDB 数据...")
    
    try:
        response = requests.post(
            f"{BASE_URL}/apis/v1/metrics/query",
            json={
                "metric_name": "total_num",
                "labels": ["stress_id", STRESS_ID],
                "start_time": 0,
                "end_time": 0,
                "limit": 10
            },
            timeout=5
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get("code") == 0:
                data = result.get("data", {})
                points = data.get("points", []) if isinstance(data, dict) else []
                if points:
                    print(f"✅ TSDB 有 {len(points)} 个数据点")
                    for point in points[:3]:  # 只显示前3个
                        print(f"   timestamp={point.get('timestamp')}, value={point.get('value')}")
                    return True
                else:
                    print("⚠️  TSDB 暂无数据")
                    return False
            else:
                print(f"❌ 查询失败: {result.get('message')}")
                return False
        else:
            print(f"❌ HTTP 错误: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ 查询异常: {e}")
        return False

def main():
    print("🔍 Mark 数据流快速测试")
    print("="*60)
    print(f"测试 stress_id: {STRESS_ID}")
    print("="*60)
    
    # 1. 发送 Mark
    if not send_marks(10):
        print("\n❌ 发送 Mark 失败，停止测试")
        return
    
    # 2. 立即查询 Recorder
    print("\n" + "="*60)
    query_recorder()
    
    # 3. 等待聚合器运行
    print("\n" + "="*60)
    print("⏳ 等待聚合器运行（6秒）...")
    time.sleep(6)
    
    # 4. 再次查询 Recorder
    print("\n" + "="*60)
    print("🔄 6秒后再次查询...")
    query_recorder()
    
    # 5. 查询 TSDB
    print("\n" + "="*60)
    query_tsdb()
    
    # 总结
    print("\n" + "="*60)
    print("🎯 测试完成！")
    print("\n💡 如果:")
    print("   - Recorder 有数据 → Mark 接收正常")
    print("   - TSDB 有数据 → 聚合器工作正常")
    print("   - TSDB 无数据 → 检查聚合器配置和日志")
    print("="*60)

if __name__ == '__main__':
    main()

