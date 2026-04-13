package handler

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"

	"sonar-tap/config"
	"sonar-tap/pkg/configstore"
	"sonar-tap/pkg/metricsbuf"
	"sonar-tap/pkg/process"
	"sonar-tap/pkg/watcher"
)

// TapHandler sonar-tap 管理 API handler
type TapHandler struct {
	store          *configstore.Store
	preview        *metricsbuf.RingBuffer
	watcherManager *watcher.WatcherManager
	processManager *process.ProcessManager
}

// NewTapHandler 创建管理 API handler
func NewTapHandler(store *configstore.Store, preview *metricsbuf.RingBuffer, wm *watcher.WatcherManager, pm *process.ProcessManager) *TapHandler {
	return &TapHandler{
		store:          store,
		preview:        preview,
		watcherManager: wm,
		processManager: pm,
	}
}

// ---- Health ----

func (h *TapHandler) Health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// ---- Config ----

func (h *TapHandler) GetConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(h.store.Get())
}

func (h *TapHandler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	var newCfg config.Config
	if err := json.NewDecoder(r.Body).Decode(&newCfg); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if err := h.store.UpdateAndSave(&newCfg); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (h *TapHandler) PatchNodeConfig(w http.ResponseWriter, r *http.Request) {
	var patch config.NodeExporter
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	cfg := *h.store.Get()
	cfg.NodeExporter = patch
	if err := h.store.UpdateAndSave(&cfg); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (h *TapHandler) PatchProcessConfig(w http.ResponseWriter, r *http.Request) {
	var patch config.ProcessExporter
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	cfg := *h.store.Get()
	cfg.ProcessExporter = patch
	if err := h.store.UpdateAndSave(&cfg); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (h *TapHandler) PatchLogConfig(w http.ResponseWriter, r *http.Request) {
	var patch []config.LogConfig
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	cfg := *h.store.Get()
	cfg.LogConfig = patch
	if err := h.store.UpdateAndSave(&cfg); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (h *TapHandler) ReloadConfig(w http.ResponseWriter, r *http.Request) {
	if err := h.store.Reload(); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// ---- Status ----

func (h *TapHandler) GetStatus(w http.ResponseWriter, r *http.Request) {
	status := map[string]any{
		"watcher_count": h.watcherManager.GetWatcherCount(),
		"watcher_stats": h.watcherManager.GetAllStats(),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

// ---- Preview ----

func (h *TapHandler) GetMetricsPreview(w http.ResponseWriter, r *http.Request) {
	limitStr := r.URL.Query().Get("limit")
	limit := 20
	if limitStr != "" {
		if n, err := strconv.Atoi(limitStr); err == nil && n > 0 {
			if n > 200 {
				n = 200
			}
			limit = n
		}
	}
	entries := h.preview.Latest(limit)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entries)
}

// ---- Processes ----

type processInfo struct {
	PID     int32             `json:"pid"`
	Name    string            `json:"name"`
	Labels  map[string]string `json:"labels"`
	LogPath string            `json:"log_path"`
}

func (h *TapHandler) GetProcesses(w http.ResponseWriter, r *http.Request) {
	var result []processInfo
	if h.processManager != nil {
		for _, p := range h.processManager.GetProcesses() {
			result = append(result, processInfo{
				PID:     p.GetPID(),
				Name:    p.GetName(),
				Labels:  p.GetLabels(),
				LogPath: p.GetLogPath(),
			})
		}
	}
	if result == nil {
		result = []processInfo{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// ---- Debug ----

type regexDebugReq struct {
	Pattern string `json:"pattern"`
	Input   string `json:"input"`
}

type regexDebugResp struct {
	Matched     bool              `json:"matched"`
	Groups      []string          `json:"groups,omitempty"`
	NamedGroups map[string]string `json:"named_groups,omitempty"`
}

func (h *TapHandler) DebugRegex(w http.ResponseWriter, r *http.Request) {
	var req regexDebugReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	re, err := regexp.Compile(req.Pattern)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"matched": false,
			"error":   err.Error(),
		})
		return
	}

	matches := re.FindStringSubmatch(req.Input)
	resp := regexDebugResp{
		Matched: len(matches) > 0,
		Groups:  matches,
	}

	// 提取命名捕获组
	if len(matches) > 0 {
		namedGroups := make(map[string]string)
		for i, name := range re.SubexpNames() {
			if i != 0 && name != "" && i < len(matches) {
				namedGroups[name] = matches[i]
			}
		}
		if len(namedGroups) > 0 {
			resp.NamedGroups = namedGroups
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
