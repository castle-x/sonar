// mock_gameserver.go - 模拟游戏服务器进程，持续输出结构化日志
// 使用: go run mock_gameserver.go --id=server001 -ABSLOG=/tmp/gameserver-server001.log
package main

import (
	"flag"
	"fmt"
	"log"
	"math/rand"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	// 命令行参数，与 sonar-tap 配置中的 cmdlines 和 log_path_pattern 匹配
	serverID := flag.String("id", "server001", "server id")
	absLog := flag.String("ABSLOG", "", "log file path (e.g. -ABSLOG=/tmp/gameserver.log)")
	flag.Parse()

	logPath := *absLog
	if logPath == "" {
		logPath = fmt.Sprintf("/tmp/gameserver-%s.log", *serverID)
	}

	// 打开日志文件
	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		log.Fatalf("failed to open log file %s: %v", logPath, err)
	}
	defer f.Close()

	logger := log.New(f, "", 0)
	stdLogger := log.New(os.Stdout, "[gameserver] ", log.LstdFlags)

	stdLogger.Printf("GameServer starting: id=%s, log=%s", *serverID, logPath)
	logger.Printf("[INFO] GameServer started: id=%s", *serverID)

	// 优雅关闭
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	for {
		select {
		case <-quit:
			stdLogger.Printf("GameServer shutting down: id=%s", *serverID)
			logger.Printf("[INFO] GameServer shutdown: id=%s", *serverID)
			return
		case t := <-ticker.C:
			// 模拟游戏指标
			fps := 30 + rng.Intn(31)          // 30~60 FPS
			users := 100 + rng.Intn(400)       // 100~500 在线人数
			latency := 10 + rng.Intn(90)       // 10~100ms 延迟
			cpu := 20.0 + rng.Float64()*40.0   // 20~60% CPU

			// 输出指标日志（与 sonar-tap log_config 中的 pattern 匹配）
			logger.Printf("[METRICS] %s AverageFps:%d ActiveUsers:%d Latency:%dms CpuUsage:%.1f",
				t.Format("2006-01-02 15:04:05"), fps, users, latency, cpu)

			// 每 10 次偶尔输出一条错误日志
			if rng.Intn(10) == 0 {
				logger.Printf("[ERROR] simulated error: connection timeout for player %d", rng.Intn(1000))
			}

			stdLogger.Printf("tick: fps=%d users=%d latency=%dms", fps, users, latency)
		}
	}
}
