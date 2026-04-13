#!/bin/bash
# 模拟一个长期运行的测试进程，带日志输出
# 命令行: --config test --id=server001 -LOG=/tmp/sonar-tap-dev.log
# sonar-tap 通过 cmdlines 匹配，通过 log_path_pattern 提取日志路径

LOG_FILE="/tmp/sonar-tap-dev.log"

# 清空旧日志
> "$LOG_FILE"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] DummyServer started, pid=$$" >> "$LOG_FILE"

# 每 2 秒写一行日志，模拟真实服务
while true; do
    TS=$(date '+%Y-%m-%d %H:%M:%S')
    FPS=$((30 + RANDOM % 31))          # 30-60
    LATENCY=$((5 + RANDOM % 50))       # 5-54ms
    USERS=$((100 + RANDOM % 200))       # 100-299

    echo "[$TS] INFO AverageFps:${FPS} Latency:${LATENCY}ms ActiveUsers:${USERS}" >> "$LOG_FILE"

    # 偶尔写 ERROR 行
    if (( RANDOM % 10 == 0 )); then
        echo "[$TS] ERROR Connection timeout to db-server-01" >> "$LOG_FILE"
    fi

    sleep 2
done
