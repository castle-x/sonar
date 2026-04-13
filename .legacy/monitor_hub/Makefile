.PHONY: help build build-web build-backend dev-web dev-backend clean install-web

# 默认目标
.DEFAULT_GOAL := help

# 颜色输出
GREEN  := \033[0;32m
YELLOW := \033[1;33m
BLUE   := \033[0;34m
NC     := \033[0m # No Color

help: ## 显示帮助信息
	@printf "$(BLUE)Monitor Hub - 可用命令:$(NC)\n"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-15s$(NC) %s\n", $$1, $$2}'

install-web: ## 安装前端依赖
	@printf "$(BLUE)[安装前端依赖]$(NC)\n"
	@if command -v bun >/dev/null 2>&1; then \
		cd site && bun install; \
	else \
		cd site && npm install; \
	fi

build-web: ## 编译前端
	@printf "$(BLUE)[编译前端]$(NC)\n"
	@if command -v bun >/dev/null 2>&1; then \
		cd site && bun run build; \
	else \
		cd site && npm run build; \
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
	@if command -v bun >/dev/null 2>&1; then \
		cd site && bun run dev; \
	else \
		cd site && npm run dev; \
	fi

dev-backend: ## 启动后端服务 (http://localhost:8283)
	@printf "$(BLUE)[启动后端服务]$(NC)\n"
	@printf "$(YELLOW)访问地址: http://localhost:8283$(NC)\n"
	@bash bin/bootstrap.sh
	@printf "$(GREEN)[成功] 后端服务启动完成$(NC)\n"
	@tail -f bin/logs/*.log

dev: ## 同时启动前后端（需要两个终端）
	@printf "$(YELLOW)请在两个终端分别运行:$(NC)\n"
	@printf "  终端1: $(GREEN)make dev-backend$(NC)\n"
	@printf "  终端2: $(GREEN)make dev-web$(NC)\n"

run: ## 运行编译后的程序
	@printf "$(BLUE)[运行服务]$(NC)\n"
	@cd bin && ./monitor_hub -c config.yaml

clean: ## 清理编译文件
	@printf "$(BLUE)[清理编译文件]$(NC)\n"
	@rm -rf site/dist site/node_modules bin/monitor_hub
	@printf "$(GREEN)[成功] 清理完成$(NC)\n"

.PHONY: help build build-web build-backend dev-web dev-backend dev run clean install-web


