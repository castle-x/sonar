#!/usr/bin/env python3
"""
Mark 批量请求压测脚本

功能：
- 模拟向 datasource 发送批量 mark 请求
- 10个不同的请求名称
- 1个固定的 stress_id
- 每秒发送10次批量请求（每次包含10个mark）
- 支持配置总发送时长

使用方法：
    python3 test_mark_batch.py --host localhost --port 8080 --duration 60

参数：
    --host: 服务器地址 (默认: localhost)
    --port: 服务器端口 (默认: 8080)
    --duration: 运行时长(秒) (默认: 60)
    --stress-id: 压测ID (默认: test_stress_001)
    --qps: 每秒请求数 (默认: 10)
"""

import argparse
import json
import random
import sys
import time
from datetime import datetime
from typing import List, Dict

try:
    import requests
except ImportError:
    print("错误: 需要安装 requests 库")
    print("请运行: pip3 install requests")
    sys.exit(1)


class MarkBatchTester:
    """Mark 批量请求测试器"""
    
    # 10个不同的请求名称
    REQUEST_NAMES = [
        "api_login",
        "api_get_user_info",
        "api_create_order",
        "api_query_order",
        "api_update_profile",
        "api_upload_file",
        "api_get_product_list",
        "api_add_to_cart",
        "api_payment",
        "api_logout",
    ]
    
    def __init__(self, host: str, port: int, stress_id: str):
        """初始化测试器
        
        Args:
            host: 服务器地址
            port: 服务器端口
            stress_id: 压测ID
        """
        self.base_url = f"http://{host}:{port}"
        self.batch_url = f"{self.base_url}/apis/v1/mark/batch"
        self.list_url = f"{self.base_url}/apis/v1/mark/list"
        self.stress_id = stress_id
        
        # 统计信息
        self.total_requests = 0
        self.success_requests = 0
        self.failed_requests = 0
        self.total_marks = 0
        self.start_time = None
        
    def create_mark(self, request_name: str, is_success: bool = True) -> Dict:
        """创建一个 mark 数据
        
        Args:
            request_name: 请求名称
            is_success: 是否成功
            
        Returns:
            mark 字典
        """
        # 模拟响应时间: 10-500ms
        response_time_ms = random.randint(10, 500)
        
        end_time = int(time.time() * 1000)  # 毫秒时间戳
        start_time = end_time - response_time_ms
        
        mark = {
            "stress_id": self.stress_id,
            "start_time": start_time,
            "end_time": end_time,
            "request_name": request_name
        }
        
        # 10% 概率失败
        if not is_success or random.random() < 0.1:
            mark["error_msg"] = random.choice([
                "timeout",
                "connection_error", 
                "internal_error",
                "bad_request",
            ])
        
        return mark
    
    def send_batch(self) -> bool:
        """发送一批 mark 请求
        
        Returns:
            是否成功
        """
        # 创建10个不同请求名称的 mark
        marks = [self.create_mark(name) for name in self.REQUEST_NAMES]
        
        payload = {
            "mark_list": marks
        }
        
        try:
            response = requests.post(
                self.batch_url,
                json=payload,
                timeout=5
            )
            
            self.total_requests += 1
            self.total_marks += len(marks)
            
            if response.status_code == 200:
                result = response.json()
                if result.get("code") == 0:
                    self.success_requests += 1
                    return True
                else:
                    self.failed_requests += 1
                    print(f"❌ 批量请求失败: {result.get('message', 'unknown error')}")
                    return False
            else:
                self.failed_requests += 1
                print(f"❌ HTTP 错误: {response.status_code}")
                return False
                
        except Exception as e:
            self.failed_requests += 1
            print(f"❌ 请求异常: {e}")
            return False
    
    def query_metrics(self) -> Dict:
        """查询当前的 metrics 数据
        
        Returns:
            metrics 数据
        """
        try:
            payload = {
                "query": json.dumps({"stress_id": self.stress_id})
            }
            response = requests.post(
                self.list_url,
                json=payload,
                timeout=5
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                print(f"❌ 查询失败: HTTP {response.status_code}")
                return {}
        except Exception as e:
            print(f"❌ 查询异常: {e}")
            return {}
    
    def print_stats(self, current_qps: float = 0):
        """打印统计信息
        
        Args:
            current_qps: 当前QPS
        """
        elapsed = time.time() - self.start_time if self.start_time else 0
        avg_qps = self.total_requests / elapsed if elapsed > 0 else 0
        success_rate = (self.success_requests / self.total_requests * 100) if self.total_requests > 0 else 0
        
        print(f"\n{'='*60}")
        print(f"📊 实时统计 [{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}]")
        print(f"{'='*60}")
        print(f"⏱️  运行时长: {elapsed:.1f}秒")
        print(f"📤 总请求数: {self.total_requests}")
        print(f"📝 总Mark数: {self.total_marks}")
        print(f"✅ 成功: {self.success_requests}")
        print(f"❌ 失败: {self.failed_requests}")
        print(f"📈 成功率: {success_rate:.2f}%")
        print(f"⚡ 当前QPS: {current_qps:.2f}")
        print(f"⚡ 平均QPS: {avg_qps:.2f}")
        print(f"{'='*60}\n")
    
    def print_recorder_summary(self):
        """查询并打印 Recorder 缓存数据摘要"""
        print(f"\n{'='*80}")
        print(f"💾 Recorder 实时缓存数据 [{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}]")
        print(f"{'='*80}")
        
        metrics = self.query_metrics()
        
        if metrics.get("code") != 0 or not metrics.get("data"):
            print("⚠️  暂无 Recorder 数据")
            print(f"{'='*80}\n")
            return
        
        data = metrics["data"]
        
        # data 是一个列表，第一个元素是字典 {request_name: metrics}
        if isinstance(data, list) and len(data) > 0:
            recorder_data = data[0]
        else:
            print("⚠️  Recorder 数据格式异常")
            print(f"{'='*80}\n")
            return
        
        if not isinstance(recorder_data, dict) or len(recorder_data) == 0:
            print("⚠️  Recorder 中暂无数据")
            print(f"{'='*80}\n")
            return
        
        # 打印表头
        print(f"\n{'请求名称':<25} {'总数':>8} {'失败':>8} {'成功率':>8} {'平均RT':>10} {'P50':>8} {'P90':>8} {'P99':>8} {'QPS':>8}")
        print(f"{'-'*25} {'-'*8} {'-'*8} {'-'*8} {'-'*10} {'-'*8} {'-'*8} {'-'*8} {'-'*8}")
        
        # 打印每个请求的数据
        total_requests = 0
        total_failed = 0
        
        for request_name in sorted(recorder_data.keys()):
            m = recorder_data[request_name]
            
            total_num = m.get("total_num", 0)
            failed_num = m.get("failed_num", 0)
            success_rate = ((total_num - failed_num) / total_num * 100) if total_num > 0 else 0
            rtt_avg = m.get("rtt_avg_ms", 0)
            rtt_p50 = m.get("rtt_p50_ms", 0)
            rtt_p90 = m.get("rtt_p90_ms", 0)
            rtt_p99 = m.get("rtt_p99_ms", 0)
            qps_avg = m.get("qps_avg", 0.0)
            
            total_requests += total_num
            total_failed += failed_num
            
            print(f"{request_name:<25} {total_num:>8} {failed_num:>8} {success_rate:>7.2f}% "
                  f"{rtt_avg:>9}ms {rtt_p50:>7}ms {rtt_p90:>7}ms {rtt_p99:>7}ms {qps_avg:>8.2f}")
        
        # 打印汇总
        print(f"{'-'*25} {'-'*8} {'-'*8} {'-'*8} {'-'*10} {'-'*8} {'-'*8} {'-'*8} {'-'*8}")
        overall_success_rate = ((total_requests - total_failed) / total_requests * 100) if total_requests > 0 else 0
        print(f"{'汇总':<25} {total_requests:>8} {total_failed:>8} {overall_success_rate:>7.2f}%")
        
        print(f"{'='*80}\n")
    
    def query_tsdb_all_metrics(self):
        """使用 PromQL 一次性查询所有指标的最新数据"""
        try:
            # 使用 PromQL 查询所有指标
            response = requests.post(
                f"{self.base_url}/apis/v1/metrics/query",
                json={
                    "promql": f'{{stress_id="{self.stress_id}"}}',  # 查询该 stress_id 的所有指标
                    "start_time": 0,
                    "end_time": 0
                },
                timeout=5
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get("code") == 0 and result.get("data"):
                    data_list = result["data"]
                    if isinstance(data_list, list) and len(data_list) > 0:
                        points = data_list[0].get("points", [])
                        if points:
                            # 构建 {request_name: {metric_name: value}} 的结构
                            all_metrics = {}
                            for point in points:
                                labels = point.get("label_list", [])
                                metric_name = point.get("name", "")
                                value = point.get("value", 0)
                                
                                # 提取 request_name
                                request_name = None
                                for i in range(0, len(labels), 2):
                                    if labels[i] == "request_name":
                                        request_name = labels[i+1]
                                        break
                                
                                if request_name and metric_name:
                                    if request_name not in all_metrics:
                                        all_metrics[request_name] = {}
                                    # 保留最新的值（后面的覆盖前面的）
                                    all_metrics[request_name][metric_name] = value
                            
                            return all_metrics
            return {}
        except Exception as e:
            return {}
    
    def print_metrics_summary(self):
        """查询并打印指标数据摘要（从 TSDB 查询）"""
        print(f"\n{'='*80}")
        print(f"📈 TSDB 聚合数据 [{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}]")
        print(f"{'='*80}")
        
        # 使用 PromQL 一次性查询所有指标
        all_metrics = self.query_tsdb_all_metrics()
        
        if not all_metrics:
            print("⚠️  暂无 TSDB 数据（可能还未聚合或等待时间不够）")
            print(f"{'='*80}\n")
            return
        
        # 打印表头
        print(f"\n{'请求名称':<25} {'总数':>8} {'失败':>8} {'成功率':>8} {'平均RT':>10} {'P50':>8} {'P90':>8} {'P99':>8} {'QPS':>8}")
        print(f"{'-'*25} {'-'*8} {'-'*8} {'-'*8} {'-'*10} {'-'*8} {'-'*8} {'-'*8} {'-'*8}")
        
        # 打印每个请求的数据
        total_requests = 0
        total_failed = 0
        
        for request_name in sorted(all_metrics.keys()):
            m = all_metrics[request_name]
            
            total_num = int(m.get("total_num", 0))
            failed_num = int(m.get("failed_num", 0))
            success_rate = ((total_num - failed_num) / total_num * 100) if total_num > 0 else 0
            rtt_avg = int(m.get("rtt_avg_ms", 0))
            rtt_p50 = int(m.get("rtt_p50_ms", 0))
            rtt_p90 = int(m.get("rtt_p90_ms", 0))
            rtt_p99 = int(m.get("rtt_p99_ms", 0))
            qps_avg = m.get("qps_avg", 0.0)
            
            total_requests += total_num
            total_failed += failed_num
            
            print(f"{request_name:<25} {total_num:>8} {failed_num:>8} {success_rate:>7.2f}% "
                  f"{rtt_avg:>9}ms {rtt_p50:>7}ms {rtt_p90:>7}ms {rtt_p99:>7}ms {qps_avg:>8.2f}")
        
        # 打印汇总
        print(f"{'-'*25} {'-'*8} {'-'*8} {'-'*8} {'-'*10} {'-'*8} {'-'*8} {'-'*8} {'-'*8}")
        overall_success_rate = ((total_requests - total_failed) / total_requests * 100) if total_requests > 0 else 0
        print(f"{'汇总':<25} {total_requests:>8} {total_failed:>8} {overall_success_rate:>7.2f}%")
        
        print(f"{'='*80}\n")
    
    def run(self, duration: int, target_qps: int = 10):
        """运行压测
        
        Args:
            duration: 运行时长(秒)
            target_qps: 目标QPS
        """
        print(f"\n🚀 开始压测...")
        print(f"📌 服务地址: {self.base_url}")
        print(f"📌 压测ID: {self.stress_id}")
        print(f"📌 目标QPS: {target_qps}")
        print(f"📌 运行时长: {duration}秒")
        print(f"📌 请求名称数量: {len(self.REQUEST_NAMES)}")
        print(f"📌 统计输出: 每5秒")
        print(f"📌 指标查询: 每10秒")
        print(f"   - 💾 Recorder 缓存数据（实时）")
        print(f"   - 📊 TSDB 聚合数据（持久化）")
        print(f"{'='*60}\n")
        
        self.start_time = time.time()
        interval = 1.0 / target_qps  # 每次请求间隔
        
        end_time = self.start_time + duration
        last_print_time = self.start_time
        last_metrics_time = self.start_time
        request_count_in_second = 0
        second_start_time = self.start_time
        
        try:
            while time.time() < end_time:
                loop_start = time.time()
                
                # 发送批量请求
                self.send_batch()
                request_count_in_second += 1
                
                # 每秒统计一次
                if time.time() - second_start_time >= 1.0:
                    current_qps = request_count_in_second / (time.time() - second_start_time)
                    request_count_in_second = 0
                    second_start_time = time.time()
                else:
                    current_qps = request_count_in_second / (time.time() - second_start_time) if (time.time() - second_start_time) > 0 else 0
                
                # 每5秒打印一次统计
                if time.time() - last_print_time >= 5.0:
                    self.print_stats(current_qps)
                    last_print_time = time.time()
                
                # 每10秒查询并打印指标数据
                if time.time() - last_metrics_time >= 10.0:
                    self.print_recorder_summary()  # 打印 Recorder 缓存数据
                    self.print_metrics_summary()   # 打印 TSDB 聚合数据
                    last_metrics_time = time.time()
                
                # 控制QPS
                elapsed = time.time() - loop_start
                sleep_time = interval - elapsed
                if sleep_time > 0:
                    time.sleep(sleep_time)
                    
        except KeyboardInterrupt:
            print("\n\n⚠️  用户中断测试...")
        
        # 最终统计
        print("\n" + "="*60)
        print("🏁 压测完成！")
        print("="*60)
        self.print_stats()
        
        # 查询最终的 metrics（使用列表形式）
        print("📊 查询最终数据...")
        self.print_recorder_summary()  # 打印 Recorder 缓存数据
        self.print_metrics_summary()   # 打印 TSDB 聚合数据
        
        print(f"✨ 测试结束！\n")


def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description='Mark 批量请求压测脚本',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument(
        '--host',
        default='localhost',
        help='服务器地址 (默认: localhost)'
    )
    
    parser.add_argument(
        '--port',
        type=int,
        default=8080,
        help='服务器端口 (默认: 8080)'
    )
    
    parser.add_argument(
        '--duration',
        type=int,
        default=60,
        help='运行时长(秒) (默认: 60)'
    )
    
    parser.add_argument(
        '--stress-id',
        default='test_stress_001',
        help='压测ID (默认: test_stress_001)'
    )
    
    parser.add_argument(
        '--qps',
        type=int,
        default=10,
        help='每秒请求数 (默认: 10)'
    )
    
    args = parser.parse_args()
    
    # 创建测试器并运行
    tester = MarkBatchTester(args.host, args.port, args.stress_id)
    tester.run(args.duration, args.qps)


if __name__ == '__main__':
    main()

