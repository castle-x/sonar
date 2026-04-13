## ADDED Requirements

### Requirement: Manual Go project structure created
The sonar-store project SHALL be manually initialized as a pure Go project without Web UI, following GVE directory conventions for the backend portion.

#### Scenario: Go project structure exists
- **WHEN** the initialization is complete
- **THEN** `sonar/sonar-store/` contains `cmd/server/main.go`, `internal/handler/`, `internal/service/`, `internal/repo/`, `go.mod`

### Requirement: No frontend scaffold
The sonar-store project SHALL NOT contain a `site/` directory or any frontend code, as it is a pure API service.

#### Scenario: No site directory
- **WHEN** the initialization is complete
- **THEN** `sonar/sonar-store/site/` does not exist

### Requirement: Minimal main.go entry point
The `cmd/server/main.go` SHALL contain a minimal HTTP server setup with placeholder routing, ready for handler registration.

#### Scenario: Project compiles
- **WHEN** `go build ./cmd/server/` is run in `sonar/sonar-store/`
- **THEN** the build succeeds with zero errors
