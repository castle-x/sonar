## ADDED Requirements

### Requirement: GVE project initialized with dashboard-02 scaffold
The sonar-view project SHALL be initialized using `gve init sonar-view --scaffold dashboard-02` inside the `sonar/` directory, producing a standard GVE project structure with Go backend + React frontend.

#### Scenario: GVE initialization succeeds
- **WHEN** `gve init sonar-view --scaffold dashboard-02` is executed in `sonar/`
- **THEN** `sonar/sonar-view/` contains `cmd/server/main.go`, `internal/`, `site/`, `go.mod`, `gve.lock`, `Makefile`

### Requirement: Frontend scaffold includes dashboard layout
The sonar-view frontend SHALL use the dashboard-02 scaffold, providing sidebar navigation and layout components suitable for the visualization platform.

#### Scenario: Frontend dev server starts
- **WHEN** `gve dev` is run in `sonar/sonar-view/`
- **THEN** the Go backend and Vite frontend both start without errors
