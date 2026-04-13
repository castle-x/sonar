#!/usr/bin/env python3
"""持续写入正常数据脚本 - 模拟真实成功请求"""

import requests
import time
import random
import argparse
from datetime import datetime

class ContinuousWriter:
    """持续数据写入器"""
    
    # 真实的请求名称列表（常见API）
    REQUEST_NAMES = [
        "api_user_login",
        "api_user_info",
        "api_product_list",
        "api_product_detail",
        "api_order_create",
        "api_order_query",
        "api_payment_submit",
        "api_cart_add",
        "api_search",
        "api_recommend"
    ]
    
    def __init__(self, base_url="http://localhost:8080", stress_id="production_001"):
        self.base_url = base_url
        self.stress_id = stress_id
        self.mark_url = f"{base_url}/apis/v1/mark/batch"
        
        # 统计信息
        self.total_requests = 0
        self.total_marks = 0
        self.start_time = None
        self.last_print_time = None
    
    def generate_realistic_rtt(self):
        """生成真实的响应时间（ms）
        
        模拟正态分布，平均50ms，大部分在30-70ms之间
        """
        # 使用正态分布，mean=50, std=10
        rtt = random.gauss(50, 10)
        # 限制在合理范围 [20, 100]
        return max(20, min(100, int(rtt)))
    
    def generate_marks(self, count=10):
        """生成一批成功的Mark数据
        
        Args:
            count: 生成的Mark数量
            
        Returns:
            list: Mark数据列表
        """
        marks = []
        current_time = int(time.time() * 1000)
        
        for _ in range(count):
            # 随机选择一个请求名称
            request_name = random.choice(self.REQUEST_NAMES)
            
            # 生成真实的响应时间
            rtt_ms = self.generate_realistic_rtt()
            
            # 计算开始和结束时间
            end_time = current_time
            start_time = end_time - rtt_ms
            
            mark = {
                "stress_id": self.stress_id,
                "start_time": start_time,
                "end_time": end_time,
                "request_name": request_name
                # 注意：没有 error_msg 字段，表示请求成功
            }
            
            marks.append(mark)
            
            # 时间向前推进（模拟并发请求）
            current_time += 5  # 每个请求间隔5ms
        
        return marks
    
    def send_marks(self, marks):
        """发送Mark数据
        
        Args:
            marks: Mark数据列表
            
        Returns:
            bool: 是否成功
        """
        try:
            payload = {"mark_list": marks}
            response = requests.post(
                self.mark_url,
                json=payload,
                timeout=5
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get("code") == 0:
                    self.total_marks += len(marks)
                    return True
                else:
                    print(f"⚠️  API返回错误: {result.get('message')}")
                    return False
            else:
                print(f"⚠️  HTTP错误: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ 发送异常: {e}")
            return False
    
    def print_stats(self):
        """打印统计信息"""
        if not self.start_time:
            return
            
        elapsed = time.time() - self.start_time
        avg_qps = self.total_requests / elapsed if elapsed > 0 else 0
        marks_per_sec = self.total_marks / elapsed if elapsed > 0 else 0
        
        print(f"\r⏱️  运行: {elapsed:>6.1f}s | "
              f"请求: {self.total_requests:>6} | "
              f"Mark: {self.total_marks:>7} | "
              f"QPS: {avg_qps:>6.2f} | "
              f"Mark/s: {marks_per_sec:>7.2f} | "
              f"✅ 全部成功", end='', flush=True)
    
    def run(self, duration=3600, marks_per_batch=10, interval=1.0):
        """持续运行
        
        Args:
            duration: 运行时长（秒），默认1小时
            marks_per_batch: 每批次的Mark数量
            interval: 批次间隔（秒）
        """
        print(f"\n{'='*80}")
        print(f"🚀 持续数据写入 - 正常模式")
        print(f"{'='*80}")
        print(f"📌 服务地址: {self.base_url}")
        print(f"📌 压测ID: {self.stress_id}")
        print(f"📌 运行时长: {duration}秒 ({duration/3600:.1f}小时)")
        print(f"📌 批次大小: {marks_per_batch} 个Mark")
        print(f"📌 批次间隔: {interval}秒")
        print(f"📌 预估QPS: {marks_per_batch/interval:.2f}")
        print(f"📌 响应时间: ~50ms (正态分布 20-100ms)")
        print(f"📌 成功率: 100% (全部成功)")
        print(f"{'='*80}\n")
        
        # 检查服务状态
        try:
            response = requests.get(f"{self.base_url}/health", timeout=2)
            if response.status_code != 200:
                print("⚠️  警告: 服务健康检查失败")
        except:
            print("⚠️  警告: 无法连接到服务")
        
        print("开始写入数据...\n")
        
        self.start_time = time.time()
        self.last_print_time = self.start_time
        end_time = self.start_time + duration
        
        try:
            while time.time() < end_time:
                batch_start = time.time()
                
                # 生成并发送一批Mark
                marks = self.generate_marks(marks_per_batch)
                success = self.send_marks(marks)
                
                if success:
                    self.total_requests += 1
                
                # 每0.5秒更新一次统计
                now = time.time()
                if now - self.last_print_time >= 0.5:
                    self.print_stats()
                    self.last_print_time = now
                
                # 控制批次间隔
                elapsed = time.time() - batch_start
                sleep_time = max(0, interval - elapsed)
                if sleep_time > 0:
                    time.sleep(sleep_time)
                    
        except KeyboardInterrupt:
            print("\n\n⚠️  收到中断信号，正在停止...")
        
        # 打印最终统计
        print("\n")
        print(f"\n{'='*80}")
        print(f"✅ 写入完成")
        print(f"{'='*80}")
        
        elapsed = time.time() - self.start_time
        print(f"⏱️  总运行时长: {elapsed:.2f}秒 ({elapsed/3600:.2f}小时)")
        print(f"📤 总批次数: {self.total_requests}")
        print(f"📝 总Mark数: {self.total_marks}")
        print(f"⚡ 平均QPS: {self.total_requests/elapsed:.2f}")
        print(f"📊 平均Mark/秒: {self.total_marks/elapsed:.2f}")
        print(f"✅ 成功率: 100% (全部成功)")
        print(f"{'='*80}\n")


def main():
    parser = argparse.ArgumentParser(description='持续写入正常数据')
    parser.add_argument('--duration', type=int, default=3600,
                        help='运行时长（秒），默认3600（1小时）')
    parser.add_argument('--batch-size', type=int, default=10,
                        help='每批次Mark数量，默认10')
    parser.add_argument('--interval', type=float, default=1.0,
                        help='批次间隔（秒），默认1.0')
    parser.add_argument('--stress-id', type=str, default='production_001',
                        help='压测ID，默认production_001')
    parser.add_argument('--url', type=str, default='http://localhost:8080',
                        help='服务地址，默认http://localhost:8080')
    
    args = parser.parse_args()
    
    writer = ContinuousWriter(
        base_url=args.url,
        stress_id=args.stress_id
    )
    
    writer.run(
        duration=args.duration,
        marks_per_batch=args.batch_size,
        interval=args.interval
    )


if __name__ == '__main__':
    main()

