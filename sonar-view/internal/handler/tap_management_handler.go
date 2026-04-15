package handler

import (
	"encoding/json"
	"net/http"

	"sonar-view/internal/service"
)

// TapManagementHandler manages remote tap instances
type TapManagementHandler struct {
	tapManagementService *service.TapManagementService
}

// NewTapManagementHandler creates a new tap management handler
func NewTapManagementHandler(tapManagementService *service.TapManagementService) *TapManagementHandler {
	return &TapManagementHandler{tapManagementService: tapManagementService}
}

// GetTapConfig retrieves the current configuration of a tap instance
func (h *TapManagementHandler) GetTapConfig(w http.ResponseWriter, r *http.Request) {
	tapAddr := r.URL.Query().Get("tap_addr")
	if tapAddr == "" {
		writeError(w, http.StatusBadRequest, "tap_addr is required")
		return
	}

	config, err := h.tapManagementService.GetTapConfig(r.Context(), tapAddr)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, config)
}

// UpdateTapConfig updates the configuration of a tap instance
func (h *TapManagementHandler) UpdateTapConfig(w http.ResponseWriter, r *http.Request) {
	tapAddr := r.URL.Query().Get("tap_addr")
	if tapAddr == "" {
		writeError(w, http.StatusBadRequest, "tap_addr is required")
		return
	}

	var config map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	if err := h.tapManagementService.UpdateTapConfig(r.Context(), tapAddr, config); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// GetTapStatus retrieves the current status of a tap instance
func (h *TapManagementHandler) GetTapStatus(w http.ResponseWriter, r *http.Request) {
	tapAddr := r.URL.Query().Get("tap_addr")
	if tapAddr == "" {
		writeError(w, http.StatusBadRequest, "tap_addr is required")
		return
	}

	status, err := h.tapManagementService.GetTapStatus(r.Context(), tapAddr)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, status)
}

// GetAllTapStatus retrieves status for all registered taps
func (h *TapManagementHandler) GetAllTapStatus(w http.ResponseWriter, r *http.Request) {
	statuses, err := h.tapManagementService.GetAllTapStatus(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"list":  statuses,
		"total": len(statuses),
	})
}

// ReloadTapConfig sends a reload signal to a tap instance
func (h *TapManagementHandler) ReloadTapConfig(w http.ResponseWriter, r *http.Request) {
	tapAddr := r.URL.Query().Get("tap_addr")
	if tapAddr == "" {
		writeError(w, http.StatusBadRequest, "tap_addr is required")
		return
	}

	if err := h.tapManagementService.ReloadTapConfig(r.Context(), tapAddr); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// DebugTapRegex tests a regex pattern on a tap instance
func (h *TapManagementHandler) DebugTapRegex(w http.ResponseWriter, r *http.Request) {
	tapAddr := r.URL.Query().Get("tap_addr")
	if tapAddr == "" {
		writeError(w, http.StatusBadRequest, "tap_addr is required")
		return
	}

	var req struct {
		Pattern string `json:"pattern"`
		Input   string `json:"input"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	result, err := h.tapManagementService.DebugTapRegex(r.Context(), tapAddr, req.Pattern, req.Input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

// ListProcesses retrieves the list of processes on a tap instance
func (h *TapManagementHandler) ListProcesses(w http.ResponseWriter, r *http.Request) {
	tapAddr := r.URL.Query().Get("tap_addr")
	if tapAddr == "" {
		writeError(w, http.StatusBadRequest, "tap_addr is required")
		return
	}

	processes, err := h.tapManagementService.ListProcesses(r.Context(), tapAddr)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"list":  processes,
		"total": len(processes),
	})
}
