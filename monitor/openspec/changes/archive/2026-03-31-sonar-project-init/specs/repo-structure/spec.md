## ADDED Requirements

### Requirement: Legacy projects archived to legacy directory
The system SHALL move all historical projects (`datasource/`, `monitor_hub/`, `node_process_exporter/`, `log_exporter/`, `exporter/`) into a `legacy/` directory at the repository root.

#### Scenario: All historical projects moved
- **WHEN** the restructuring is complete
- **THEN** `legacy/` contains `datasource/`, `monitor_hub/`, `node_process_exporter/`, `log_exporter/`, `exporter/` with all original files intact

### Requirement: Sonar product directory created
The system SHALL create a `sonar/` directory at the repository root containing the three sub-project directories and shared directories.

#### Scenario: Product directory structure exists
- **WHEN** the restructuring is complete
- **THEN** the following directories exist: `sonar/sonar-tap/`, `sonar/sonar-store/`, `sonar/sonar-view/`, `sonar/api/`, `sonar/pkg/shared/`

### Requirement: Repository root is clean
The repository root SHALL contain only `legacy/`, `sonar/`, `CLAUDE.md`, `openspec/`, and Git-related files (`.git/`, `.gitignore`, `.claude/`).

#### Scenario: No stale project directories at root
- **WHEN** the restructuring is complete
- **THEN** `datasource/`, `monitor_hub/`, `node_process_exporter/`, `log_exporter/`, `exporter/` no longer exist at the repository root
