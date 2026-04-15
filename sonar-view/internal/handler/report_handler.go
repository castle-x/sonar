package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"sonar-view/internal/service"
)

// ReportHandler implements the report generation API endpoints
type ReportHandler struct {
	reportService *service.ReportService
}

// NewReportHandler creates a new report handler
func NewReportHandler(reportService *service.ReportService) *ReportHandler {
	return &ReportHandler{reportService: reportService}
}

// GenerateReport handles POST /api/v1/reports/generate
// Request body:
//   {
//     "name": "Test Report",
//     "description": "Performance test results",
//     "app_id": "my-app",
//     "start_time": 1234567890000,
//     "end_time": 1234567950000,
//     "metric_names": ["cpu_usage", "memory_usage"],
//     "level": "1m",
//     "tags": ["production"]
//   }
//
// Response:
//   {"code":0,"data":{"report_id":"uuid"}}
func (h *ReportHandler) GenerateReport(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to read body: "+err.Error())
		return
	}

	var req service.GenerateReportReq
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json: "+err.Error())
		return
	}

	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.StartTime <= 0 || req.EndTime <= 0 {
		writeError(w, http.StatusBadRequest, "start_time and end_time are required")
		return
	}
	if req.StartTime >= req.EndTime {
		writeError(w, http.StatusBadRequest, "start_time must be less than end_time")
		return
	}

	reportID, err := h.reportService.GenerateReport(r.Context(), &req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "generate report failed: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"report_id": reportID,
	})
}

// GetReport handles GET /api/v1/reports/{id}
// Returns the full report data with compressed points and summary tables
func (h *ReportHandler) GetReport(w http.ResponseWriter, r *http.Request) {
	reportID := r.PathValue("id")
	if reportID == "" {
		writeError(w, http.StatusBadRequest, "report id is required")
		return
	}

	reportData, err := h.reportService.GetReport(r.Context(), reportID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "get report failed: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, reportData)
}

// ListReports handles GET /api/v1/reports
// Query parameters:
//   - app_id (optional): filter by app_id
func (h *ReportHandler) ListReports(w http.ResponseWriter, r *http.Request) {
	appID := r.URL.Query().Get("app_id")

	reports, err := h.reportService.ListReports(r.Context(), appID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list reports failed: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, reports)
}

// DeleteReport handles DELETE /api/v1/reports/{id}
func (h *ReportHandler) DeleteReport(w http.ResponseWriter, r *http.Request) {
	reportID := r.PathValue("id")
	if reportID == "" {
		writeError(w, http.StatusBadRequest, "report id is required")
		return
	}

	if err := h.reportService.DeleteReport(r.Context(), reportID); err != nil {
		writeError(w, http.StatusInternalServerError, "delete report failed: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ExportReportAsCSV handles GET /api/v1/reports/{id}/export/csv
// Returns the report as CSV format with summary tables
func (h *ReportHandler) ExportReportAsCSV(w http.ResponseWriter, r *http.Request) {
	reportID := r.PathValue("id")
	if reportID == "" {
		writeError(w, http.StatusBadRequest, "report id is required")
		return
	}

	csvData, err := h.reportService.ExportReportAsCSV(r.Context(), reportID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "export report failed: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=report.csv")
	w.Header().Set("Content-Length", strconv.Itoa(len(csvData)))
	w.WriteHeader(http.StatusOK)
	w.Write(csvData)
}
