package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"sonar-view/internal/repo"
)

// StoreClient sonar-store HTTP 客户端
type StoreClient struct {
	repo        *repo.StoreConfigRepo
	fallbackAddr string
	httpClient  *http.Client
}

// TapInfo tap 实例信息
type TapInfo struct {
	ID       string            `json:"id"`
	Addr     string            `json:"addr"`
	AppID    string            `json:"app_id"`
	Labels   map[string]string `json:"labels"`
	Status   string            `json:"status"`
	LastSeen int64             `json:"last_seen"`
}

func NewStoreClient(r *repo.StoreConfigRepo, fallbackAddr string) *StoreClient {
	return &StoreClient{
		repo:         r,
		fallbackAddr: fallbackAddr,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// activeAddr resolves the current active store address.
// Falls back to fallbackAddr if no active record exists.
func (c *StoreClient) activeAddr(ctx context.Context) string {
	if c.repo != nil {
		cfg, err := c.repo.GetActive(ctx)
		if err == nil && cfg != nil && cfg.Addr != "" {
			return cfg.Addr
		}
	}
	return c.fallbackAddr
}

func (c *StoreClient) doJSON(ctx context.Context, method, path string, body interface{}) ([]byte, error) {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal request: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}
	url := fmt.Sprintf("http://%s%s", c.activeAddr(ctx), path)
	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("store returned %d: %s", resp.StatusCode, string(data))
	}
	return data, nil
}

// GetTaps 获取 tap 列表
func (c *StoreClient) GetTaps(ctx context.Context) ([]*TapInfo, error) {
	data, err := c.doJSON(ctx, http.MethodGet, "/apis/v1/datasources", nil)
	if err != nil {
		return nil, err
	}
	var resp struct {
		Code    int        `json:"code"`
		Message string     `json:"message"`
		Data    []*TapInfo `json:"data"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("unmarshal taps: %w", err)
	}
	return resp.Data, nil
}

// Health 检查 store 健康状态
func (c *StoreClient) Health(ctx context.Context) error {
	_, err := c.doJSON(ctx, http.MethodGet, "/health", nil)
	return err
}

// ProxyPost 代理 POST 请求到 sonar-store
func (c *StoreClient) ProxyPost(ctx context.Context, path string, body []byte) ([]byte, error) {
	url := fmt.Sprintf("http://%s%s", c.activeAddr(ctx), path)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

// QueryMetrics 查询指标数据
func (c *StoreClient) QueryMetrics(ctx context.Context, appID string, startTime, endTime int64) ([]byte, error) {
	return c.doJSON(ctx, http.MethodPost, "/apis/v1/metrics/query", map[string]interface{}{
		"app_id":     appID,
		"start_time": startTime,
		"end_time":   endTime,
	})
}

// Addr 返回当前 active store 地址（fallback to config）
func (c *StoreClient) Addr() string {
	return c.activeAddr(context.Background())
}
