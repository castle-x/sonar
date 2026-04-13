BINARY := sonar-view

.PHONY: dev build build-web build-backend clean

dev:
	gve dev -p 8282 --vite-port 5176

build: build-web build-backend

build-web:
	cd site && pnpm install && pnpm build

build-backend:
	go build -o dist/$(BINARY) ./cmd/server

clean:
	rm -rf dist/ site/dist/
