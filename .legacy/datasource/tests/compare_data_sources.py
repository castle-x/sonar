#!/usr/bin/env python3
"""对比 Recorder 和 TSDB 两种数据源"""

import requests
import json
from datetime import datetime

BASE_URL = "http://localhost:8080"
STRESS_ID = "test_stress_001"

def query_recorder():
    """查询 Recorder 缓存数据"""
    try:
        response = requests.post(
            f"{BASE_URL}/apis/v1/mark/list",
            json={"query": json.dumps({"stress_id": STRESS_ID})},
            timeout=5
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get("code") == 0 and result.get("data"):
                data = result["data"]
                if isinstance(data, list) and len(data) > 0:
                    return data[0] if isinstance(data[0], dict) else {}
        return {}
    except:
        return {}

def query_tsdb():
    """查询 TSDB 聚合数据"""
    try:
        response = requests.post(
            f"{BASE_URL}/apis/v1/metrics/query",
            json={
                "promql": f'{{stress_id="{STRESS_ID}"}}',
                "start_time": 0,
                "end_time": 0
            },
            timeout=5
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get("code") == 0 and result.get("data"):
                data = result["data"]
                if isinstance(data, list) and len(data) > 0:
                    points = data[0].get("points", [])
                    
                    # 构建 {request_name: {metric_name: value}}
                    metrics = {}
                    for point in points:
                        labels = point.get("label_list", [])
                        metric_name = point.get("name", "")
                        value = point.get("value", 0)
                        
                        request_name = None
                        for i in range(0, len(labels), 2):
                            if labels[i] == "request_name":
                                request_name = labels[i+1]
                                break
                        
                        if request_name and metric_name:
                            if request_name not in metrics:
                                metrics[request_name] = {}
                            metrics[request_name][metric_name] = value
                    
                    return metrics
        return {}
    except:
        return {}

def compare_sources():
    """对比两种数据源"""
    print("\n" + "="*80)
    print(f"📊 数据源对比测试 [{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}]")
    print("="*80)
    print(f"Stress ID: {STRESS_ID}\n")
    
    # 查询两种数据源
    recorder_data = query_recorder()
    tsdb_data = query_tsdb()
    
    # 统计
    recorder_count = len(recorder_data)
    tsdb_count = len(tsdb_data)
    
    print(f"💾 Recorder 缓存: {recorder_count} 个请求")
    print(f"📊 TSDB 聚合数据: {tsdb_count} 个请求\n")
    
    if recorder_count == 0 and tsdb_count == 0:
        print("⚠️  两种数据源都没有数据")
        return
    
    # 对比数据
    all_requests = set(recorder_data.keys()) | set(tsdb_data.keys())
    
    print("="*80)
    print(f"{'请求名称':<25} {'Recorder总数':>15} {'TSDB总数':>15} {'差异':>10}")
    print("="*80)
    
    for req_name in sorted(all_requests):
        recorder_total = recorder_data.get(req_name, {}).get("total_num", 0)
        tsdb_total = int(tsdb_data.get(req_name, {}).get("total_num", 0))
        diff = recorder_total - tsdb_total
        
        status = "✅" if diff >= 0 else "⚠️"
        print(f"{req_name:<25} {recorder_total:>15} {tsdb_total:>15} {diff:>9} {status}")
    
    print("="*80)
    print("\n💡 说明:")
    print("   - Recorder: 实时内存缓存，数据累积中")
    print("   - TSDB: 持久化存储，每5秒从 Recorder 聚合一次")
    print("   - 差异: Recorder 总数应 >= TSDB（因为有5秒延迟）")
    print("   - 正常情况: 差异应该很小（约5秒内的请求数）")
    print("="*80 + "\n")

if __name__ == '__main__':
    compare_sources()

