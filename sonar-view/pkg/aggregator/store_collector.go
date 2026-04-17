package aggregator

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/prometheus/prometheus/model/labels"
)

// StoreCollector 从 sonar-store 拉取数据的采集器
type StoreCollector struct {
	storeAddr  string
	appID      string
	httpClient *http.Client
}

type storeMetricQueryRequest struct {
	AppID     string `json:"app_id"`
	StartTime int64  `json:"start_time"`
	EndTime   int64  `json:"end_time"`
}

// storeMetricPoint 对应 sonar-store 返回的单个数据点
// label_list 是 [k1, v1, k2, v2, ...] 格式的平铺数组
type storeMetricPoint struct {
	Name      string   `json:"name"`
	LabelList []string `json:"label_list"`
	Timestamp int64    `json:"timestamp"`
	Value     float64  `json:"value"`
	AppID     string   `json:"app_id"`
}

// storeMetricQueryData 对应 sonar-store 返回的 data 字段
type storeMetricQueryData struct {
	Points []storeMetricPoint `json:"points"`
}

// storeMetricQueryResponse 对应 sonar-store 完整响应
// {"code":0,"message":"success","data":{"points":[...]}}
type storeMetricQueryResponse struct {
	Code    int                  `json:"code"`
	Message string               `json:"message"`
	Data    storeMetricQueryData `json:"data"`
}

func NewStoreCollector(storeAddr, appID string) *StoreCollector {
	return &StoreCollector{
		storeAddr: storeAddr,
		appID:     appID,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (c *StoreCollector) Collect(ctx context.Context, startTime, endTime time.Time) ([]RawMetricPoint, error) {
	reqBody := storeMetricQueryRequest{
		AppID:     c.appID,
		StartTime: startTime.Unix(),
		EndTime:   endTime.Unix(),
	}
	reqBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request failed: %w", err)
	}

	url := fmt.Sprintf("http://%s/apis/v1/metrics/query", c.storeAddr)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(reqBytes))
	if err != nil {
		return nil, fmt.Errorf("create request failed: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response failed: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("store returned status %d: %s", resp.StatusCode, string(body))
	}

	var queryResp storeMetricQueryResponse
	if err := json.Unmarshal(body, &queryResp); err != nil {
		return nil, fmt.Errorf("unmarshal response failed: %w", err)
	}

	if queryResp.Code != 0 {
		return nil, fmt.Errorf("store error: %s", queryResp.Message)
	}

	points := queryResp.Data.Points
	rawPoints := make([]RawMetricPoint, 0, len(points))
	for _, p := range points {
		// label_list 是 [k1, v1, k2, v2, ...] 平铺数组，直接传给 labels.FromStrings
		labelPairs := p.LabelList

		datasourceId := p.AppID
		if datasourceId == "" {
			datasourceId = c.appID
		}
		rawPoints = append(rawPoints, RawMetricPoint{
			DatasourceId: datasourceId,
			Name:         p.Name,
			Labels:       labels.FromStrings(labelPairs...),
			Timestamp:    p.Timestamp,
			Value:        p.Value,
		})
	}

	return rawPoints, nil
}
