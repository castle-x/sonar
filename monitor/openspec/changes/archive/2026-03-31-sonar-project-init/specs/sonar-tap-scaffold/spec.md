## ADDED Requirements

### Requirement: GVE project initialized with dashboard-02 scaffold
The sonar-tap project SHALL be initialized using `gve init sonar-tap --scaffold dashboard-02` inside the `sonar/` directory, producing a standard GVE project structure with Go backend + React frontend.

#### Scenario: GVE initialization succeeds
- **WHEN** `gve init sonar-tap --scaffold dashboard-02` is executed in `sonar/`
- **THEN** `sonar/sonar-tap/` contains `cmd/server/main.go`, `internal/`, `site/`, `go.mod`, `gve.lock`, `Makefile`

### Requirement: Frontend scaffold includes dashboard layout
The sonar-tap frontend SHALL use the dashboard-02 scaffold, providing sidebar navigation and layout components.

#### Scenario: Frontend dev server starts
- **WHEN** `gve dev` is run in `sonar/sonar-tap/`
- **THEN** the Go backend and Vite frontend both start without errors
