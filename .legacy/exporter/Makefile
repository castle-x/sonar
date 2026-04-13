.PHONY: build clean run

BINARY=bin/exporter

build:
	go build -o $(BINARY) ./cmd/exporter/

clean:
	rm -f $(BINARY)

run: build
	./$(BINARY) -c config/config.yaml

tidy:
	go mod tidy

vet:
	go vet ./...
