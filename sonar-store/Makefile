BINARY := sonar-store

.PHONY: dev build clean

dev:
	go run ./cmd/server/

build:
	go build -o dist/$(BINARY) ./cmd/server

clean:
	rm -rf dist/
