package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"sonar-view/internal/repo"
	"sonar-view/internal/service"
	"sonar-view/pkg/aggregator"
	"sonar-view/pkg/storage"

	"github.com/prometheus/prometheus/model/labels"
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
type StatusHandler struct{}

func NewStatusHandler() *StatusHandler {
	return &StatusHandler{}
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

// GetSnapshotMetrics 返回快照时序数据
func (h *SnapshotHandler) GetSnapshotMetrics(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "id is required")
		return
	}
	data, err := h.snapshotService.GetSnapshotMetrics(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(data)
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

// StoreConfigHandler store 配置管理
type StoreConfigHandler struct {
	svc *service.StoreConfigService
}

func NewStoreConfigHandler(svc *service.StoreConfigService) *StoreConfigHandler {
	return &StoreConfigHandler{svc: svc}
}

func (h *StoreConfigHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.svc.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if list == nil {
		list = []*repo.StoreConfig{}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"list": list, "total": len(list)})
}

func (h *StoreConfigHandler) Create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name        string `json:"name"`
		Addr        string `json:"addr"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}
	if body.Name == "" || body.Addr == "" {
		writeError(w, http.StatusBadRequest, "name and addr are required")
		return
	}
	cfg, err := h.svc.Create(r.Context(), body.Name, body.Addr, body.Description)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, cfg)
}

func (h *StoreConfigHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "id is required")
		return
	}
	var body struct {
		Name        string `json:"name"`
		Addr        string `json:"addr"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}
	if err := h.svc.Update(r.Context(), id, body.Name, body.Addr, body.Description); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *StoreConfigHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "id is required")
		return
	}
	if err := h.svc.Delete(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *StoreConfigHandler) Activate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "id is required")
		return
	}
	if err := h.svc.SetActive(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// AggregationHandler 聚合数据查询（查询 view 本地 TSDB）
type AggregationHandler struct {
	tsdb storage.Storage[aggregator.AggregatedPoint]
}

func NewAggregationHandler(tsdb storage.Storage[aggregator.AggregatedPoint]) *AggregationHandler {
	return &AggregationHandler{tsdb: tsdb}
}

// QueryMetrics GET /api/v1/aggregation/metrics
// Params: app_id, metric_names, start_time, end_time, level, labels
func (h *AggregationHandler) QueryMetrics(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	startMs, err := strconv.ParseInt(q.Get("start_time"), 10, 64)
	if err != nil || startMs <= 0 {
		writeError(w, http.StatusBadRequest, "start_time is required (ms timestamp)")
		return
	}
	endMs, err := strconv.ParseInt(q.Get("end_time"), 10, 64)
	if err != nil || endMs <= 0 {
		writeError(w, http.StatusBadRequest, "end_time is required (ms timestamp)")
		return
	}

	level := q.Get("level")
	if level == "" {
		level = "1m"
	}

	// Build label matchers
	builder := labels.NewBuilder(nil)
	builder.Set(string(aggregator.AggregatedInternalLabelAggregationLevel), level)

	if appID := q.Get("app_id"); appID != "" {
		builder.Set("app_id", appID)
	}

	// Parse extra labels: key=value,key2=value2
	if labelsStr := q.Get("labels"); labelsStr != "" {
		for _, pair := range strings.Split(labelsStr, ",") {
			kv := strings.SplitN(strings.TrimSpace(pair), "=", 2)
			if len(kv) == 2 {
				builder.Set(kv[0], kv[1])
			}
		}
	}

	lq := &storage.LabelQuery{
		Labels:    builder.Labels(),
		StartTime: startMs,
		EndTime:   endMs,
	}

	// If specific metric names requested, query each
	metricNamesStr := q.Get("metric_names")
	var metricNames []string
	if metricNamesStr != "" {
		for _, n := range strings.Split(metricNamesStr, ",") {
			n = strings.TrimSpace(n)
			if n != "" {
				metricNames = append(metricNames, n)
			}
		}
	}

	var allPoints []aggregator.AggregatedPoint
	if len(metricNames) > 0 {
		for _, name := range metricNames {
			query := *lq
			query.MetricName = name
			pts, err := h.tsdb.QueryByLabels(r.Context(), &query)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "query failed: "+err.Error())
				return
			}
			allPoints = append(allPoints, pts...)
		}
	} else {
		pts, err := h.tsdb.QueryByLabels(r.Context(), lq)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "query failed: "+err.Error())
			return
		}
		allPoints = pts
	}

	// Group by metric name + labels into response
	type metricSeries struct {
		Name   string                 `json:"name"`
		Labels map[string]string      `json:"labels"`
		Points []map[string]interface{} `json:"points"`
	}

	seriesMap := make(map[string]*metricSeries)
	for _, p := range allPoints {
		// Build a key from name + business labels
		businessLabels := make(map[string]string)
		p.Labels.Range(func(l labels.Label) {
			businessLabels[l.Name] = l.Value
		})
		key := p.Name + "|" + p.DatasourceId + "|" + string(p.AggregationType)
		for _, lbl := range p.Labels {
			key += "|" + lbl.Name + "=" + lbl.Value
		}

		s, ok := seriesMap[key]
		if !ok {
			s = &metricSeries{
				Name:   p.Name,
				Labels: businessLabels,
			}
			if p.DatasourceId != "" {
				s.Labels["datasource_id"] = p.DatasourceId
			}
			s.Labels["aggregation_type"] = string(p.AggregationType)
			seriesMap[key] = s
		}
		s.Points = append(s.Points, map[string]interface{}{
			"timestamp": p.Timestamp.Time().UnixMilli(),
			"value":     p.Value,
		})
	}

	metrics := make([]*metricSeries, 0, len(seriesMap))
	for _, s := range seriesMap {
		metrics = append(metrics, s)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"metrics":    metrics,
		"level":      level,
		"start_time": startMs,
		"end_time":   endMs,
	})
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
