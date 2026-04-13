#!/usr/bin/env python3
"""快速测试 Recorder 缓存数据查询"""

import requests
import json

BASE_URL = "http://localhost:8080"
STRESS_ID = "test_stress_001"

def query_recorder():
    """查询 Recorder 中的缓存数据"""
    print(f"🔍 查询 Recorder 缓存数据")
    print("="*60)
    
    try:
        response = requests.post(
            f"{BASE_URL}/apis/v1/mark/list",
            json={"query": json.dumps({"stress_id": STRESS_ID})},
            timeout=5
        )
        
        if response.status_code == 200:
            result = response.json()
            
            if result.get("code") == 0:
                data = result.get("data", [])
                
                if isinstance(data, list) and len(data) > 0:
                    recorder_data = data[0]
                    
                    if isinstance(recorder_data, dict) and len(recorder_data) > 0:
                        print(f"✅ 找到 {len(recorder_data)} 个请求的数据\n")
                        
                        # 打印表头
                        print(f"{'请求名称':<25} {'总数':>8} {'失败':>8} {'成功率':>8} {'QPS':>8}")
                        print(f"{'-'*25} {'-'*8} {'-'*8} {'-'*8} {'-'*8}")
                        
                        # 打印每个请求
                        for req_name in sorted(recorder_data.keys()):
                            m = recorder_data[req_name]
                            total = m.get("total_num", 0)
                            failed = m.get("failed_num", 0)
                            success_rate = ((total - failed) / total * 100) if total > 0 else 0
                            qps = m.get("qps_avg", 0.0)
                            
                            print(f"{req_name:<25} {total:>8} {failed:>8} {success_rate:>7.2f}% {qps:>8.2f}")
                        
                        print("\n✅ Recorder 数据查询成功！")
                        return True
                    else:
                        print("⚠️  Recorder 中暂无数据（空字典）")
                        return False
                else:
                    print("⚠️  Recorder 中暂无数据（空列表或异常格式）")
                    return False
            else:
                print(f"❌ API 返回错误: code={result.get('code')}, msg={result.get('msg')}")
                return False
        else:
            print(f"❌ HTTP 错误: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ 请求异常: {e}")
        return False

def main():
    print("\n" + "="*60)
    print("💾 Recorder 缓存数据查询测试")
    print("="*60)
    print(f"Stress ID: {STRESS_ID}")
    print(f"接口: /apis/v1/mark/list")
    print("="*60 + "\n")
    
    success = query_recorder()
    
    print("\n" + "="*60)
    if success:
        print("✅ 测试通过！")
        print("\n💡 说明:")
        print("   - Recorder 存储实时缓存数据")
        print("   - 数据保存在内存中，重启后会丢失")
        print("   - 每次 Mark 请求会立即更新 Recorder")
        print("   - TTL 过期后会自动清理")
    else:
        print("⚠️  暂无数据")
        print("\n💡 建议:")
        print("   1. 先发送一些 Mark 请求")
        print("   2. 确认 stress_id 正确")
        print("   3. 检查服务是否正常运行")
    print("="*60 + "\n")

if __name__ == '__main__':
    main()

