package handler

import (
	"net/http"

	"sonar-view/internal/service"
)

// AggLevelHandler exposes aggregation level configuration via HTTP.
type AggLevelHandler struct {
	svc *service.AggLevelService
}

func NewAggLevelHandler(svc *service.AggLevelService) *AggLevelHandler {
	return &AggLevelHandler{svc: svc}
}

// ListLevels GET /api/v1/aggregation/levels
// Returns all cascade-aggregation levels ordered by sort_order.
func (h *AggLevelHandler) ListLevels(w http.ResponseWriter, r *http.Request) {
	levels, err := h.svc.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"list":  levels,
		"total": len(levels),
	})
}
