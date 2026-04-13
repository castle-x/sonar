.PHONY: help build build-web build-backend dev-web dev-backend clean install-web \
        build-linux build-linux-arm64 build-macos build-macos-arm64 build-windows build-all

# 默认目标
.DEFAULT_GOAL := help

# 颜色输出
GREEN  := \033[0;32m
YELLOW := \033[1;33m
BLUE   := \033[0;34m
RED    := \033[0;31m
NC     := \033[0m # No Color

# 项目配置
BINARY_NAME := datasource
CMD_PATH    := ./cmd/$(BINARY_NAME)/$(BINARY_NAME).go
OUTPUT_DIR  := bin
LDFLAGS     := -s -w

help: ## 显示帮助信息
	@printf "$(BLUE)Datasource - 可用命令:$(NC)\n"
	@printf "\n$(YELLOW)基础命令:$(NC)\n"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | grep -v "build-linux\|build-macos\|build-windows\|build-all" | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@printf "\n$(YELLOW)跨平台编译:$(NC)\n"
	@grep -E '^build-(linux|macos|windows|all).*:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'

install-web: ## 安装前端依赖
	@printf "$(BLUE)[安装前端依赖]$(NC)\n"
	@if command -v bun >/dev/null 2>&1; then \
		cd site && bun install; \
	else \
		source ~/.nvm/nvm.sh 2>/dev/null && cd site && npm install; \
	fi

build-web: ## 编译前端
	@printf "$(BLUE)[编译前端]$(NC)\n"
	@if command -v bun >/dev/null 2>&1; then \
		cd site && bun run build; \
	else \
		source ~/.nvm/nvm.sh 2>/dev/null && cd site && npm run build; \
	fi
	@printf "$(GREEN)[成功] 前端编译完成$(NC)\n"

build-backend: ## 编译后端
	@printf "$(BLUE)[编译后端]$(NC)\n"
	@bash build.sh
	@printf "$(GREEN)[成功] 后端编译完成$(NC)\n"

build: build-web build-backend ## 编译前端和后端

dev-web: ## 启动前端开发服务器 (http://localhost:5173)
	@printf "$(BLUE)[启动前端开发服务器]$(NC)\n"
	@printf "$(YELLOW)访问地址: http://localhost:5173$(NC)\n"
	@printf "$(YELLOW)API 代理: http://localhost:8080$(NC)\n"
	@if command -v bun >/dev/null 2>&1; then \
		cd site && bun run dev; \
	else \
		source ~/.nvm/nvm.sh 2>/dev/null && cd site && npm run dev; \
	fi

dev-backend: ## 启动后端服务 (http://localhost:8080)
	@printf "$(BLUE)[启动后端服务]$(NC)\n"
	@printf "$(YELLOW)访问地址: http://localhost:8080$(NC)\n"
	@bash bin/bootstrap.sh
	@printf "$(GREEN)[成功] 后端服务启动完成$(NC)\n"
	@tail -f bin/logs/*.log

dev: ## 同时启动前后端（需要两个终端）
	@printf "$(YELLOW)请在两个终端分别运行:$(NC)\n"
	@printf "  终端1: $(GREEN)make dev-backend$(NC)\n"
	@printf "  终端2: $(GREEN)make dev-web$(NC)\n"

run: ## 运行编译后的程序
	@printf "$(BLUE)[运行服务]$(NC)\n"
	@cd bin && ./datasource -c config.yaml

clean: ## 清理编译文件
	@printf "$(BLUE)[清理编译文件]$(NC)\n"
	@rm -rf site/dist bin/datasource bin/datasource-* bin/*.exe
	@printf "$(GREEN)[成功] 清理完成$(NC)\n"

stop: ## 停止后端服务
	@printf "$(BLUE)[停止后端服务]$(NC)\n"
	@bash bin/terminate.sh 2>/dev/null || true
	@printf "$(GREEN)[成功] 后端服务已停止$(NC)\n"

restart: stop dev-backend ## 重启后端服务

# ============================================================================
# 跨平台编译目标
# ============================================================================

build-linux: build-web ## 编译 Linux amd64 版本
	@printf "$(BLUE)[编译 Linux amd64]$(NC)\n"
	@mkdir -p $(OUTPUT_DIR)
	@CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="$(LDFLAGS)" -o $(OUTPUT_DIR)/$(BINARY_NAME)-linux-amd64 $(CMD_PATH)
	@printf "$(GREEN)[成功] $(OUTPUT_DIR)/$(BINARY_NAME)-linux-amd64$(NC)\n"

build-linux-arm64: build-web ## 编译 Linux arm64 版本
	@printf "$(BLUE)[编译 Linux arm64]$(NC)\n"
	@mkdir -p $(OUTPUT_DIR)
	@CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="$(LDFLAGS)" -o $(OUTPUT_DIR)/$(BINARY_NAME)-linux-arm64 $(CMD_PATH)
	@printf "$(GREEN)[成功] $(OUTPUT_DIR)/$(BINARY_NAME)-linux-arm64$(NC)\n"

build-macos: build-web ## 编译 macOS amd64 版本 (Intel)
	@printf "$(BLUE)[编译 macOS amd64]$(NC)\n"
	@mkdir -p $(OUTPUT_DIR)
	@CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build -ldflags="$(LDFLAGS)" -o $(OUTPUT_DIR)/$(BINARY_NAME)-darwin-amd64 $(CMD_PATH)
	@printf "$(GREEN)[成功] $(OUTPUT_DIR)/$(BINARY_NAME)-darwin-amd64$(NC)\n"

build-macos-arm64: build-web ## 编译 macOS arm64 版本 (Apple Silicon)
	@printf "$(BLUE)[编译 macOS arm64]$(NC)\n"
	@mkdir -p $(OUTPUT_DIR)
	@CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -ldflags="$(LDFLAGS)" -o $(OUTPUT_DIR)/$(BINARY_NAME)-darwin-arm64 $(CMD_PATH)
	@printf "$(GREEN)[成功] $(OUTPUT_DIR)/$(BINARY_NAME)-darwin-arm64$(NC)\n"

build-windows: build-web ## 编译 Windows amd64 版本
	@printf "$(BLUE)[编译 Windows amd64]$(NC)\n"
	@mkdir -p $(OUTPUT_DIR)
	@CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags="$(LDFLAGS)" -o $(OUTPUT_DIR)/$(BINARY_NAME)-windows-amd64.exe $(CMD_PATH)
	@printf "$(GREEN)[成功] $(OUTPUT_DIR)/$(BINARY_NAME)-windows-amd64.exe$(NC)\n"

build-all: build-web ## 编译所有平台版本
	@printf "$(BLUE)[编译所有平台]$(NC)\n"
	@mkdir -p $(OUTPUT_DIR)
	@printf "  $(YELLOW)→ Linux amd64$(NC)\n"
	@CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="$(LDFLAGS)" -o $(OUTPUT_DIR)/$(BINARY_NAME)-linux-amd64 $(CMD_PATH)
	@printf "  $(YELLOW)→ Linux arm64$(NC)\n"
	@CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="$(LDFLAGS)" -o $(OUTPUT_DIR)/$(BINARY_NAME)-linux-arm64 $(CMD_PATH)
	@printf "  $(YELLOW)→ macOS amd64 (Intel)$(NC)\n"
	@CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build -ldflags="$(LDFLAGS)" -o $(OUTPUT_DIR)/$(BINARY_NAME)-darwin-amd64 $(CMD_PATH)
	@printf "  $(YELLOW)→ macOS arm64 (Apple Silicon)$(NC)\n"
	@CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -ldflags="$(LDFLAGS)" -o $(OUTPUT_DIR)/$(BINARY_NAME)-darwin-arm64 $(CMD_PATH)
	@printf "  $(YELLOW)→ Windows amd64$(NC)\n"
	@CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags="$(LDFLAGS)" -o $(OUTPUT_DIR)/$(BINARY_NAME)-windows-amd64.exe $(CMD_PATH)
	@printf "$(GREEN)[成功] 所有平台编译完成$(NC)\n"
	@printf "\n$(BLUE)生成的文件:$(NC)\n"
	@ls -lh $(OUTPUT_DIR)/$(BINARY_NAME)-* 2>/dev/null | awk '{printf "  %s  %s\n", $$5, $$9}'
