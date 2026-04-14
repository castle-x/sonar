package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"time"

	"sonar-view/internal/service"
)

// HealthHandler 健康检查
type HealthHandler struct{}

func NewHealthHandler() *HealthHandler { return &HealthHandler{} }

func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "ok",
		"time":   time.Now().UnixMilli(),
	})
}

// StatusHandler 系统状态
type StatusHandler struct {
	hub *hubStats
}

type hubStats struct {
	Count int
}

func NewStatusHandler() *StatusHandler {
	return &StatusHandler{hub: &hubStats{}}
}

func (h *StatusHandler) Status(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
		"time":   time.Now().UnixMilli(),
	})
}

// SnapshotHandler 快照管理
type SnapshotHandler struct {
	snapshotService *service.SnapshotService
}

func NewSnapshotHandler(snapshotService *service.SnapshotService) *SnapshotHandler {
	return &SnapshotHandler{snapshotService: snapshotService}
}

func (h *SnapshotHandler) CreateSnapshot(w http.ResponseWriter, r *http.Request) {
	var req service.CreateSnapshotReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	snap, err := h.snapshotService.Create(r.Context(), &req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, snap)
}

func (h *SnapshotHandler) ListSnapshots(w http.ResponseWriter, r *http.Request) {
	appID := r.URL.Query().Get("app_id")
	list, err := h.snapshotService.List(r.Context(), appID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"list":  list,
		"total": len(list),
	})
}

func (h *SnapshotHandler) GetSnapshot(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "id is required")
		return
	}
	snap, err := h.snapshotService.Get(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, snap)
}

func (h *SnapshotHandler) DeleteSnapshot(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "id is required")
		return
	}
	if err := h.snapshotService.Delete(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// TapHandler tap 管理
type TapHandler struct {
	storeClient *service.StoreClient
}

func NewTapHandler(storeClient *service.StoreClient) *TapHandler {
	return &TapHandler{storeClient: storeClient}
}

func (h *TapHandler) ListTaps(w http.ResponseWriter, r *http.Request) {
	taps, err := h.storeClient.GetTaps(r.Context())
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{"list": []*service.TapInfo{}, "total": 0})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"list": taps, "total": len(taps)})
}

func (h *TapHandler) ProxyTap(w http.ResponseWriter, r *http.Request) {
	tapID := r.PathValue("tap_id")
	subPath := r.PathValue("path")
	if subPath == "" {
		subPath = "api/v1/config"
	}
	targetPath := "/api/v1/" + subPath

	// Get tap address from store
	taps, err := h.storeClient.GetTaps(r.Context())
	if err != nil || len(taps) == 0 {
		writeError(w, http.StatusBadGateway, "tap not found: "+tapID)
		return
	}
	var tapAddr string
	for _, t := range taps {
		if t.ID == tapID || t.AppID == tapID {
			tapAddr = t.Addr
			break
		}
	}
	if tapAddr == "" {
		writeError(w, http.StatusNotFound, "tap not found: "+tapID)
		return
	}

	proxyURL := "http://" + tapAddr + targetPath
	proxyReq, err := http.NewRequestWithContext(r.Context(), r.Method, proxyURL, r.Body)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	proxyReq.Header = r.Header.Clone()

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(proxyReq)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	defer resp.Body.Close()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

// MetricsHandler 指标查询（代理到 sonar-store）
type MetricsHandler struct {
	storeClient *service.StoreClient
}

func NewMetricsHandler(storeClient *service.StoreClient) *MetricsHandler {
	return &MetricsHandler{storeClient: storeClient}
}

func (h *MetricsHandler) QueryMetrics(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	data, err := h.storeClient.ProxyPost(r.Context(), "/apis/v1/metrics/query", body)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

// ScoringHandler 评分模板（简化版，内存存储）
type ScoringHandler struct{}

func NewScoringHandler() *ScoringHandler { return &ScoringHandler{} }

func (h *ScoringHandler) ListTemplates(w http.ResponseWriter, r *http.Request) {
	_ = strconv.Itoa(0) // keep strconv import
	writeJSON(w, http.StatusOK, map[string]interface{}{"list": []interface{}{}, "total": 0})
}

// writeJSON writes JSON response
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"code": 0,
		"data": data,
	})
}

// writeError writes error response
func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    status,
		"message": msg,
	})
}

// parseLimit extracts limit param from query string
func parseLimit(r *http.Request, defaultVal int) int {
	if s := r.URL.Query().Get("limit"); s != "" {
		if v, err := strconv.Atoi(s); err == nil && v > 0 {
			return v
		}
	}
	return defaultVal
}
