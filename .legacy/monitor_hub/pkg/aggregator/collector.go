package aggregator

import (
	"context"
	"fmt"
	baseV1 "monitor_hub/apis/monitor_hub/base/v1"
	pushgatewayV1 "monitor_hub/apis/pushgateway/metrics/v1"
	"monitor_hub/pkg/client/pushgateway/metrics"
	"monitor_hub/pkg/repo"
	"sync"
	"time"

	"git.woa.com/castlexu/goutils/coder"
	/* "github.com/bytedance/sonic" */
	"github.com/prometheus/prometheus/model/labels"
)

// ============================================
// 数据采集器接口
// ============================================

// Collector 数据采集器接口
//
// 用于从原始数据源（如 Pushgateway）采集数据
type Collector interface {
	Collect(ctx context.Context, startTime, endTime time.Time) ([]RawMetricPoint, error)
	QueryRangeMetricsByPushgateway(ctx context.Context, pushgatewayAddr string, datasourceId string, query *pushgatewayV1.MetricQuery) ([]RawMetricPoint, error)
}

// ============================================
// 数据源采集器实现
// ============================================

// DatasourceCollector 数据源采集器
//
// 从所有活动数据源的 Pushgateway 并发采集数据
type DatasourceCollector struct {
	metricsClientMap map[string]metrics.Client
	datasourceRepo   repo.DatasourceRepo
	mu               sync.RWMutex // 保护 metricsClientMap
}

// NewDatasourceCollector 创建数据源采集器
func NewDatasourceCollector(datasourceRepo repo.DatasourceRepo) *DatasourceCollector {
	return &DatasourceCollector{
		metricsClientMap: make(map[string]metrics.Client),
		datasourceRepo:   datasourceRepo,
	}
}

// Collect 实现 Collector 接口
func (c *DatasourceCollector) Collect(ctx context.Context, startTime, endTime time.Time) ([]RawMetricPoint, error) {
	// 1. 获取当前所有活动的数据源
	datasources, err := c.getActiveDatasources(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get active datasources: %w", err)
	}

	if len(datasources) == 0 {
		logger.Warn("No active datasources found")
		return nil, nil
	}

	// 2. 构建 Pushgateway -> datasourceId 的映射（去重 Pushgateway 地址）（这里数据源的唯一性有待考量）（app_id作为唯一性比较合理？）
	// key: pushgateway_addr, value: datasourceId
	pushgatewayDatasourceIdMap := make(map[string][]string)
	for _, ds := range datasources {
		for _, pgAddr := range ds.Resource.PushgatewayAddrList {
			// 优先使用第一个遇到的 datasourceId（如果同一个 Pushgateway 有多个数据源）
			if _, exists := pushgatewayDatasourceIdMap[pgAddr]; !exists {
				pushgatewayDatasourceIdMap[pgAddr] = []string{ds.Id, ds.Resource.AppID}
			}
		}
	}

	/* logger.Debug("Collecting from %d unique pushgateway addresses, time range: [%s, %s)",
		len(pushgatewayDatasourceIdMap),
		startTime.Format(time.DateTime),
		endTime.Format(time.DateTime)) */

	// 3. 并发采集所有 Pushgateway
	var (
		wg     sync.WaitGroup
		mu     sync.Mutex
		points []RawMetricPoint
	)

	for pgAddr, datasourceIdAndAppId := range pushgatewayDatasourceIdMap {
		datasourceId := datasourceIdAndAppId[0]
		appID := datasourceIdAndAppId[1]
		wg.Add(1)
		go func(pushgatewayAddr, datasourceId, appID string) {
			defer wg.Done()

			// 检查 context 是否已取消（超时或其他原因）
			if ctx.Err() != nil {
				logger.Warn("Context cancelled before querying pushgateway (%s): %v", pushgatewayAddr, ctx.Err())
				return
			}

			rawPoints, err := c.QueryRangeMetricsByPushgateway(ctx, pushgatewayAddr, datasourceId, &pushgatewayV1.MetricQuery{
				AppID:     appID,
				StartTime: startTime.Unix(),
				EndTime:   endTime.Unix(),
			})
			if err != nil {
				// 区分超时错误和其他错误
				if ctx.Err() == context.DeadlineExceeded {
					logger.Error("Timeout querying metrics from pushgateway (%s): %v", pushgatewayAddr, err)
				} else {
					logger.Error("Failed to query metrics from pushgateway (%s): %v", pushgatewayAddr, err)
				}
				return
			}

			if len(rawPoints) == 0 {
				// 模拟一下请求参数
				/* queryStr, _ := sonic.MarshalString(map[string]any{
					"app_id": appID,
					"start_time": startTime.Unix(),
					"end_time": endTime.Unix(),
				}) */
				// logger.Debug("No metrics collected from pushgateway (%s) %s", pushgatewayAddr , queryStr)
				return
			}
			
			// 并发安全地追加数据
			mu.Lock()
			// 调试代码，找一下ip为10.1.0.3的数据，看下他是在哪个pushgateway采集的
			/* for _, point := range rawPoints {
				if point.Labels["ip"] == "10.1.0.3" {
					logger.Debug("Found data from pushgateway (%s) for ip 10.1.0.3", pushgatewayAddr)
				}
			} */
			points = append(points, rawPoints...)
			mu.Unlock()

			// logger.Debug("Collected %d metrics from pushgateway (%s)", len(rawPoints), pushgatewayAddr)
		}(pgAddr, datasourceId, appID)
	}

	wg.Wait()
	/* logger.Info("Total collected %d metric points from %d pushgateway addresses",
		len(points), len(pushgatewayDatasourceIdMap)) */

	return points, nil
}

// getActiveDatasources 从数据库中获取当前所有活动的数据源
func (c *DatasourceCollector) getActiveDatasources(ctx context.Context) ([]*repo.DatasourceDocument, error) {
	datasources, _, err := c.datasourceRepo.ListDatasource(ctx, &baseV1.QueryRequest{
		Page:     0,
		PageSize: 0,
		Query:    `{"status": "healthy"}`,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list datasources: %w", err)
	}
	return datasources, nil
}

// queryRangeMetricsByPushgateway 从单个 Pushgateway 查询指定时间范围的数据
func (c *DatasourceCollector) QueryRangeMetricsByPushgateway(
	ctx context.Context,
	pushgatewayAddr string,
	datasourceId string,
	query *pushgatewayV1.MetricQuery,
) ([]RawMetricPoint, error) {
	// 获取或创建 metrics client（带锁保护）
	c.mu.RLock()
	metricsClient, exists := c.metricsClientMap[pushgatewayAddr]
	c.mu.RUnlock()

	if !exists {
		// 创建新的 client
		newClient, err := metrics.NewMetricsServiceClient(fmt.Sprintf("http://%s", pushgatewayAddr))
		if err != nil {
			return nil, fmt.Errorf("failed to create metrics client for %s: %w", pushgatewayAddr, err)
		}

		// 加写锁存储
		c.mu.Lock()
		// 双重检查，避免重复创建
		if existingClient, ok := c.metricsClientMap[pushgatewayAddr]; ok {
			metricsClient = existingClient
		} else {
			c.metricsClientMap[pushgatewayAddr] = newClient
			metricsClient = newClient
		}
		c.mu.Unlock()
	}

	// 查询指标数据
	resp, _, err := metricsClient.QueryMetrics(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query metrics from %s: %w", pushgatewayAddr, err)
	}

	return c.convertData(resp, datasourceId)
}

// convertData 转换数据格式
//
// 将 Pushgateway API 响应转换为 RawMetricPoint
func (c *DatasourceCollector) convertData(data *baseV1.Response, datasourceId string) ([]RawMetricPoint, error) {
	if data == nil || len(data.Data) == 0 {
		return nil, nil
	}

	// 解码响应数据
	queryMetricsResponse, err := coder.Decode[pushgatewayV1.QueryMetricsResponse](coder.CodeOptSonic, data.Data[0])
	if err != nil {
		return nil, fmt.Errorf("failed to decode query metrics response: %w", err)
	}

	if len(queryMetricsResponse.Points) == 0 {
		return nil, nil
	}

	// 转换为 RawMetricPoint
	rawMetricPointList := make([]RawMetricPoint, 0, len(queryMetricsResponse.Points))
	// 新的查询数据点，只会返回label_list，不会返回labels
	for _, item := range queryMetricsResponse.Points {
		if len(item.GetLabelList())%2 != 0 {
			// 坏的标签数据，跳过
			logger.Warn("ds_id %v, metric %v has invalid labels: %v, skip convert to RawMetricPoint", 
			datasourceId, item.GetName(), item.GetLabelList())
			continue
		}
		rawMetricPointList = append(rawMetricPointList, RawMetricPoint{
			DatasourceId: datasourceId,
			Name:      item.GetName(),
			Labels:    labels.FromStrings(item.GetLabelList()...),
			Timestamp: item.Timestamp,
			Value:     item.Value,
		})
	}

	return rawMetricPointList, nil
}

// ============================================
// 模拟采集器（用于测试）
// ============================================

// MockCollector 模拟采集器
type MockCollector struct {
	data []RawMetricPoint
}

// NewMockCollector 创建模拟采集器
func NewMockCollector(data []RawMetricPoint) *MockCollector {
	return &MockCollector{data: data}
}

// Collect 实现 Collector 接口
func (c *MockCollector) Collect(ctx context.Context, startTime, endTime time.Time) ([]RawMetricPoint, error) {
	return c.data, nil
}
