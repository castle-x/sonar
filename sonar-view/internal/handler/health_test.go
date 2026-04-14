package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// ────────────────────────────────────────────────────────────
// HealthHandler
// ────────────────────────────────────────────────────────────

func TestHealthHandler_Status200(t *testing.T) {
	h := NewHealthHandler()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	h.Health(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

func TestHealthHandler_ContentType(t *testing.T) {
	h := NewHealthHandler()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	h.Health(w, req)

	ct := w.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("expected Content-Type application/json, got %q", ct)
	}
}

func TestHealthHandler_BodyHasStatusOK(t *testing.T) {
	h := NewHealthHandler()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	h.Health(w, req)

	// HealthHandler writes directly: {"status":"ok","time":...}
	var body map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("expected status 'ok', got %v", body["status"])
	}
	if _, ok := body["time"]; !ok {
		t.Error("expected 'time' field in body")
	}
}

func TestHealthHandler_TimeIsPositive(t *testing.T) {
	h := NewHealthHandler()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	h.Health(w, req)

	var body map[string]interface{}
	json.NewDecoder(w.Body).Decode(&body)
	ts, ok := body["time"].(float64)
	if !ok {
		t.Fatal("expected 'time' to be a number")
	}
	if ts <= 0 {
		t.Errorf("expected positive timestamp, got %v", ts)
	}
}

// ────────────────────────────────────────────────────────────
// writeJSON helper
// ────────────────────────────────────────────────────────────

func TestWriteJSON_SetsStatusCode(t *testing.T) {
	w := httptest.NewRecorder()
	writeJSON(w, http.StatusCreated, map[string]string{"key": "val"})
	if w.Code != http.StatusCreated {
		t.Errorf("expected status 201, got %d", w.Code)
	}
}

func TestWriteJSON_WrapsInCodeData(t *testing.T) {
	w := httptest.NewRecorder()
	writeJSON(w, http.StatusOK, map[string]interface{}{"foo": "bar"})

	var body map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if body["code"].(float64) != 0 {
		t.Errorf("expected code=0, got %v", body["code"])
	}
	if body["data"] == nil {
		t.Error("expected 'data' field")
	}
}

// ────────────────────────────────────────────────────────────
// writeError helper
// ────────────────────────────────────────────────────────────

func TestWriteError_SetsStatusCode(t *testing.T) {
	w := httptest.NewRecorder()
	writeError(w, http.StatusBadRequest, "bad input")
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}
}

func TestWriteError_BodyHasMessage(t *testing.T) {
	w := httptest.NewRecorder()
	writeError(w, http.StatusInternalServerError, "server error")

	var body map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if body["message"] != "server error" {
		t.Errorf("expected message 'server error', got %v", body["message"])
	}
	if body["code"].(float64) != float64(http.StatusInternalServerError) {
		t.Errorf("expected code 500, got %v", body["code"])
	}
}

func TestWriteError_ContentTypeJSON(t *testing.T) {
	w := httptest.NewRecorder()
	writeError(w, http.StatusNotFound, "not found")
	ct := w.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("expected Content-Type application/json, got %q", ct)
	}
}

// ────────────────────────────────────────────────────────────
// parseLimit helper (defined in metrics_handler.go)
// ────────────────────────────────────────────────────────────

func TestParseLimit_Default(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api", nil)
	got := parseLimit(req, 50)
	if got != 50 {
		t.Errorf("expected default 50, got %d", got)
	}
}

func TestParseLimit_FromQuery(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api?limit=100", nil)
	got := parseLimit(req, 50)
	if got != 100 {
		t.Errorf("expected 100, got %d", got)
	}
}

func TestParseLimit_InvalidQuery(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api?limit=abc", nil)
	got := parseLimit(req, 50)
	if got != 50 {
		t.Errorf("expected fallback 50 for invalid limit, got %d", got)
	}
}

func TestParseLimit_ZeroQuery(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api?limit=0", nil)
	got := parseLimit(req, 50)
	if got != 50 {
		t.Errorf("expected fallback 50 for limit=0, got %d", got)
	}
}
