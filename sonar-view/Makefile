BINARY := sonar-view

.PHONY: dev dev-backend dev-frontend build build-web build-backend clean

# 同时启动前后端（需要 tmux 或两个终端）
dev-backend:
	go run ./cmd/server/

dev-frontend:
	cd site && pnpm dev

# gve 方式（如果安装了 gve）
dev:
	gve dev -p 8283 --vite-port 5173

build: build-web build-backend

build-web:
	cd site && pnpm install && pnpm build

build-backend:
	go build -o dist/$(BINARY) ./cmd/server

clean:
	rm -rf dist/ site/dist/
