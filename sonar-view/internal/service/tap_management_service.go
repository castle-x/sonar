package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"github.com/castle-x/goutils/ablog"
	"net/http"
	"time"
)

var tapLogger = ablog.NewLogger("tap_mgmt")

// TapManagementService handles remote management of tap instances
type TapManagementService struct {
	storeClient *StoreClient
}

// NewTapManagementService creates a new tap management service
func NewTapManagementService(storeClient *StoreClient) *TapManagementService {
	return &TapManagementService{storeClient: storeClient}
}

// TapConfig represents a tap's configuration
type TapConfig struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Addr      string            `json:"addr"`
	AppID     string            `json:"app_id"`
	Enabled   bool              `json:"enabled"`
	Config    map[string]interface{} `json:"config"`
	LastSeen  int64             `json:"last_seen"`
	Status    string            `json:"status"`
}

// TapStatus represents the current status of a tap
type TapStatus struct {
	ID           string                 `json:"id"`
	Name         string                 `json:"name"`
	Addr         string                 `json:"addr"`
	Uptime       int64                  `json:"uptime_sec"`
	Status       string                 `json:"status"`
	Metrics      map[string]interface{} `json:"metrics"`
	Config       map[string]interface{} `json:"config"`
	LastUpdated  int64                  `json:"last_updated"`
	ErrorMessage string                 `json:"error_message,omitempty"`
}

// GetTapConfig retrieves the current configuration of a tap instance
func (s *TapManagementService) GetTapConfig(ctx context.Context, tapAddr string) (*TapConfig, error) {
	client := &http.Client{Timeout: 10 * time.Second}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("http://%s/api/v1/config", tapAddr), nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("get config failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tap returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var tapConfig TapConfig
	if err := json.Unmarshal(body, &tapConfig); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

	return &tapConfig, nil
}

// UpdateTapConfig updates the configuration of a tap instance
func (s *TapManagementService) UpdateTapConfig(ctx context.Context, tapAddr string, config map[string]interface{}) error {
	client := &http.Client{Timeout: 10 * time.Second}

	configJSON, err := json.Marshal(config)
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, fmt.Sprintf("http://%s/api/v1/config", tapAddr), nil)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	req.Body = io.NopCloser(bytes.NewReader(configJSON))
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("update config failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("tap returned status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// GetTapStatus retrieves the current status of a tap instance
func (s *TapManagementService) GetTapStatus(ctx context.Context, tapAddr string) (*TapStatus, error) {
	client := &http.Client{Timeout: 10 * time.Second}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("http://%s/api/v1/status", tapAddr), nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	resp, err := client.Do(req)
	if err != nil {
		return &TapStatus{
			Addr:         tapAddr,
			Status:       "down",
			ErrorMessage: err.Error(),
			LastUpdated:  time.Now().UnixMilli(),
		}, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return &TapStatus{
			Addr:         tapAddr,
			Status:       "error",
			ErrorMessage: fmt.Sprintf("status %d: %s", resp.StatusCode, string(body)),
			LastUpdated:  time.Now().UnixMilli(),
		}, nil
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var status TapStatus
	if err := json.Unmarshal(body, &status); err != nil {
		return nil, fmt.Errorf("parse status: %w", err)
	}

	status.Addr = tapAddr
	status.LastUpdated = time.Now().UnixMilli()
	return &status, nil
}

// GetAllTapStatus retrieves status for all registered taps
func (s *TapManagementService) GetAllTapStatus(ctx context.Context) ([]*TapStatus, error) {
	taps, err := s.storeClient.GetTaps(ctx)
	if err != nil {
		tapLogger.Warn("tap management: get taps from store failed: %v", err)
		return make([]*TapStatus, 0), nil
	}

	results := make([]*TapStatus, 0, len(taps))
	for _, tap := range taps {
		status, err := s.GetTapStatus(ctx, tap.Addr)
		if err != nil {
			tapLogger.Warn("tap management: get status from %s failed: %v", tap.Addr, err)
			status = &TapStatus{
				ID:           tap.ID,
				Name:         tap.AppID,
				Addr:         tap.Addr,
				Status:       "error",
				ErrorMessage: err.Error(),
				LastUpdated:  time.Now().UnixMilli(),
			}
		} else {
			status.ID = tap.ID
			status.Name = tap.AppID
		}
		results = append(results, status)
	}

	return results, nil
}

// ReloadTapConfig sends a reload signal to a tap instance
func (s *TapManagementService) ReloadTapConfig(ctx context.Context, tapAddr string) error {
	client := &http.Client{Timeout: 10 * time.Second}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("http://%s/api/v1/config/reload", tapAddr), nil)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("reload config failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("tap returned status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// DebugTapRegex tests a regex pattern on a tap instance
func (s *TapManagementService) DebugTapRegex(ctx context.Context, tapAddr string, pattern string, input string) (map[string]interface{}, error) {
	client := &http.Client{Timeout: 10 * time.Second}

	reqBody := map[string]string{
		"pattern": pattern,
		"input":   input,
	}
	reqJSON, _ := json.Marshal(reqBody)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("http://%s/api/v1/debug/regex", tapAddr), io.NopCloser(bytes.NewReader(reqJSON)))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("debug regex failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}

	return result, nil
}

// ListProcesses retrieves the list of processes on a tap instance
func (s *TapManagementService) ListProcesses(ctx context.Context, tapAddr string) ([]map[string]interface{}, error) {
	client := &http.Client{Timeout: 10 * time.Second}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("http://%s/api/v1/processes", tapAddr), nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("list processes failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var result struct {
		Data []map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}

	return result.Data, nil
}
