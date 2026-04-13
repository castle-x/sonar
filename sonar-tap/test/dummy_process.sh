#!/bin/bash
# 模拟一个长期运行的测试进程，命令行中带有 --config test --id=server001
# sonar-tap 的 process_exporter 会通过 cmdlines 过滤条件匹配到它
exec bash -c 'while true; do sleep 1; done' --config test --id=server001
