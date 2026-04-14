# Document Inventory Quick Summary

**Location:** `/Users/castlexu/github/sonar/DOCUMENT_INVENTORY.md` (full detailed version)

## At a Glance

### 📊 Stats
- **73 total documents** (.md + .txt files)
- **Root level:** 17 docs
- **Service docs:** 10 docs (tap, store, view)
- **Test artifacts:** 21 docs
- **Design/research:** 13 docs
- **OpenSpec archive:** 10 docs
- **Agent configs:** 2 files

### 🌟 Must-Read Documents

| Document | Location | Purpose | Size |
|----------|----------|---------|------|
| **CLAUDE.md** | Root | Core project instructions | 13K |
| **SONAR_PROJECT_STATUS.md** | Root | Current project status | 12K |
| **AGENTS.md** | Root | Team/agent definitions | 7.9K |
| **frontend_design.md** | sonar-view/docs/design/ | Complete UI design (LARGEST) | 50K |
| **TEST_CASES.md** | test/e2e/ | All test cases | 26K |
| **MASTER_DESIGN.md** | sonar-view/docs/ | Overall design | 20K |
| **SOP.md** | test/e2e/ | Testing procedures | 18K |
| **SONAR_TAP_WEB_UI_ANALYSIS.md** | Root | TAP UI detailed docs | 20K |

### 📚 Documentation Suites by Topic

#### Metrics System (111K total)
- METRICS_PREVIEW_README.md (entry point)
- METRICS_PREVIEW_ARCHITECTURE.md (design)
- METRICS_PREVIEW_LIFECYCLE.md (26K - most detailed)
- METRICS_PREVIEW_ANALYSIS.md, EXAMPLES.md, QUICK_REFERENCE.md, INDEX.md

#### TAP (Data Collector) UI (48K total)
- SONAR_TAP_WEB_UI_QUICK_REFERENCE.md
- SONAR_TAP_WEB_UI_ANALYSIS.md (20K)
- SONAR_TAP_WEB_UI_SUMMARY.txt (19K)
- sonar-tap/MIGRATION_STATUS.md (14K)

#### sonar-view (Visualization) (200K+ total)
- **Design:** frontend_design.md (50K), backend_design.md (32K), MASTER_DESIGN.md (20K)
- **Research:** frontend_research.md (20K), backend_research.md (22K)
- **Tests:** 4 test docs covering frontend & backend
- **Final Report:** 7.7K

#### Testing & QA (93K+ total in test/e2e/)
- TEST_CASES.md (26K - comprehensive)
- SOP.md (18K - procedures)
- E2E_TEST_REPORT.md (12K)
- WAVE2 suite: 6 documents covering recent cycles
- BUG4 investigation: 2 documents

#### Log Configuration (29K total)
- LOG_CONFIG_QUICK_REFERENCE.md (9.9K)
- LOG_CONFIG_FIELDS_COMPLETE.md (19K)

### 🏗️ Project History (OpenSpec Archive)

**Three major initiatives tracked:**
1. **sonar-project-init** (2026-03-31) - Initial project setup & scaffolding
2. **sonar-tap-pkg-migration** (2026-03-31) - Package reorganization
3. **sonar-tap-thrift-idl** (2026-03-31) - API contract definition

Each contains: proposal.md, design.md, tasks.md, + detailed specs

### 🤖 Agent/Tool Artifacts

Located in `.omc/` and `.claude/`:
- **project-memory.json** (10K) - Persistent knowledge base
- **CLAUDE.md** (local) - Project-specific instructions
- **settings.json** - Configuration
- State directories for session management

### 📍 Where to Find What

**I want to understand the project:**
→ CLAUDE.md → SONAR_PROJECT_STATUS.md → AGENTS.md → COMPREHENSIVE_EXPLORATION_REPORT.md

**I'm working on sonar-view (UI/backend):**
→ sonar-view/docs/MASTER_DESIGN.md → design/{frontend,backend}_design.md → research docs

**I'm working on sonar-tap (data collector):**
→ SONAR_TAP_WEB_UI_ANALYSIS.md → sonar-tap/MIGRATION_STATUS.md → SONAR_TAP_WEB_UI_QUICK_REFERENCE.md

**I'm working on testing:**
→ test/e2e/SOP.md → test/e2e/TEST_CASES.md → sonar-view/docs/test/* for specific service tests

**I need metrics system details:**
→ METRICS_PREVIEW_README.md → METRICS_PREVIEW_ARCHITECTURE.md → METRICS_PREVIEW_LIFECYCLE.md

**I need log config info:**
→ LOG_CONFIG_QUICK_REFERENCE.md → LOG_CONFIG_FIELDS_COMPLETE.md

**I'm reviewing historical decisions:**
→ monitor/openspec/changes/archive/ (three initiatives with proposals, designs, specs)

---

## Top 10 Largest Documents

1. **frontend_design.md** (50K) - sonar-view UI design
2. **COMPREHENSIVE_EXPLORATION_REPORT.md** (29K) - Major exploration
3. **METRICS_PREVIEW_LIFECYCLE.md** (26K) - Metrics lifecycle
4. **TEST_CASES.md** (26K) - Test suite
5. **SONAR_TAP_WEB_UI_ANALYSIS.md** (20K) - TAP UI analysis
6. **MASTER_DESIGN.md** (20K) - sonar-view master design
7. **METRICS_PREVIEW_ARCHITECTURE.md** (19K) - Metrics architecture
8. **METRICS_PREVIEW_ANALYSIS.md** (19K) - Metrics analysis
9. **LOG_CONFIG_FIELDS_COMPLETE.md** (19K) - Log config reference
10. **SONAR_TAP_WEB_UI_SUMMARY.txt** (19K) - TAP UI summary

---

**See DOCUMENT_INVENTORY.md for complete detailed breakdown with all 73 files listed.**
