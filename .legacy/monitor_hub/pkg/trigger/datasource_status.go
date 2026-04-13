package trigger

import (
	"context"
	"fmt"
	"time"

	configV1 "monitor_hub/config/v1"
	trigger "monitor_hub/internal/trigger"
	"monitor_hub/pkg/repo"
	baseV1 "monitor_hub/apis/monitor_hub/base/v1"
	datasourceV1 "monitor_hub/apis/monitor_hub/datasource/v1"
	"monitor_hub/pkg/client/pushgateway/metrics"
	"git.woa.com/castlexu/goutils/coder"
	pushgatewayv1 "monitor_hub/apis/pushgateway/metrics/v1"
	"git.woa.com/castlexu/goutils/ablog"
)

var logger = ablog.NewLogger("datasource-status-trigger")

// DatasourceStatusTrigger 数据源状态检查触发器
type DatasourceStatusTrigger struct {
	interval       time.Duration
	datasourceStatusChecker *DatasourceStatusChecker
}

// 触发器
func NewDatasourceStatusTrigger(
	cfg *configV1.Config,
	datasourceStatusChecker *DatasourceStatusChecker,
) *DatasourceStatusTrigger {
	// 解析触发间隔
	interval, err := time.ParseDuration(cfg.Trigger.DatasourceStatus.Interval)
	if err != nil {
		logger.Warn("Failed to parse datasource status interval, use default 10s: %v", err)
		interval = 10 * time.Second
	}

	t := &DatasourceStatusTrigger{
		interval:       interval,
		datasourceStatusChecker: datasourceStatusChecker,
	}
	return t
}

func (t *DatasourceStatusTrigger) Name() string {
	return "datasource-status-checker"
}

func (t *DatasourceStatusTrigger) Type() trigger.TriggerType {
	return trigger.TriggerTypeInterval
}

func (t *DatasourceStatusTrigger) Execute(ctx context.Context) error {
	return t.datasourceStatusChecker.CheckAndUpdateAllDatasourceStatus(ctx)
}

func (t *DatasourceStatusTrigger) Interval() time.Duration {
	return t.interval
}


// 数据源状态检查器 只负责检查
type DatasourceStatusChecker struct {
	metricsClientMap map[string]metrics.Client
	datasourceRepo repo.DatasourceRepo
}

type DatasourceItem struct{
	Datasource *repo.DatasourceDocument
	Status *datasourceV1.DatasourceStatus
}

func NewDatasourceStatusChecker(
	datasourceRepo repo.DatasourceRepo,
) *DatasourceStatusChecker {
	return &DatasourceStatusChecker{
		metricsClientMap: make(map[string]metrics.Client),
		datasourceRepo: datasourceRepo,
	}
}

func (c *DatasourceStatusChecker) CheckAndUpdateAllDatasourceStatus(ctx context.Context) error {
	datasources,_,err:=c.datasourceRepo.ListDatasource(ctx,&baseV1.QueryRequest{Page:0, PageSize:0})
	if err != nil {
		return fmt.Errorf("failed to get datasources: %w", err)
	}
	if len(datasources) == 0 {
		return nil
	}

	nowDatasourceItemList := c.GetDatasourceItemList(ctx, datasources)
	var changedCount int
	for _, item := range nowDatasourceItemList {
		ds := item.Datasource
		status := item.Status
		// 3. 如果状态有变化，更新数据库
		if hasStatusChanged(ds, status) {
			oldStatus := "unknown"
			if ds.Resource.Status != nil {
				oldStatus = *ds.Resource.Status
			}
			logger.Info("Datasource (%s) (%s) status changed: (%s) -> (%s)",
				ds.Resource.Name, ds.Id, oldStatus, status.OverallStatus)

			// 更新数据库中的状态（使用现有的 UpdateDatasource）
			ds.Resource.Status = &status.OverallStatus
			if _, err := c.datasourceRepo.UpdateDatasource(ctx, ds.Id, ds.Resource); err != nil {
				logger.Warn("Failed to update status for (%s) (%s) , %v", ds.Resource.Name, ds.Id, err)
				continue
			}

			changedCount++
		}
	}
	
	// 4. 记录状态变化数量
	if changedCount > 0 {
		logger.Info("(%d) datasources status changed", changedCount)
	} else {
		// logger.Debug("No datasources status changed")
	}
	return nil
}

func (c *DatasourceStatusChecker) GetDatasourceItemList(ctx context.Context, datasources []*repo.DatasourceDocument) []*DatasourceItem {
	// 检查每个数据源的状态
	var nowDatasourceItemList []*DatasourceItem // 最新的数据源状态详情
	for _, ds := range datasources {
		status := c.checkDatasourceStatus(ctx, ds)
		// 添加到最新的数据源状态详情列表
		nowDatasourceItemList = append(nowDatasourceItemList, &DatasourceItem{
			Datasource: ds,
			Status: status,
		})
	}
	// 返回所有最新的数据源状态( 数据源和状态详情配对 )
	return nowDatasourceItemList
}

// checkDatasourceStatus 检查单个数据源的状态
func (c *DatasourceStatusChecker) checkDatasourceStatus(ctx context.Context, ds *repo.DatasourceDocument) *datasourceV1.DatasourceStatus {
	status := &datasourceV1.DatasourceStatus{
		DatasourceId:  ds.Id,
		Name:          ds.Resource.Name,
		AppId:         ds.Resource.AppID,
		Addresses:     []datasourceV1.AddressStatus{},
		LastCheckTime: time.Now().Unix(),
	}

	healthyCount := 0
	totalCount := len(ds.Resource.PushgatewayAddrList)

	// 检查每个 Pushgateway 地址
	for _, addr := range ds.Resource.PushgatewayAddrList {
		var metricsClient metrics.Client
		var ok bool
		var err error
		if metricsClient, ok = c.metricsClientMap[addr]; !ok {
			// 构造完整的 URL
			metricsClient, err = metrics.NewMetricsServiceClient(fmt.Sprintf("http://%s", addr))
			if err != nil {
				logger.Warn("Failed to create metrics client for (%s): (%v)", addr, err)
				continue
			}
			c.metricsClientMap[addr] = metricsClient
		}
		addrStatus := c.checkPushgatewayStatus(ctx, addr, metricsClient)
		status.Addresses = append(status.Addresses, *addrStatus)

		if addrStatus.Status == "online" {
			healthyCount++
		}
	}

	// 计算整体状态
	status.HealthyCount = int32(healthyCount)
	status.TotalCount = int32(totalCount)

	if healthyCount == totalCount {
		status.OverallStatus = "healthy" // 全部在线
	} else if healthyCount > 0 {
		status.OverallStatus = "degraded" // 部分在线
	} else {
		status.OverallStatus = "down" // 全部离线
	}

	return status
}

// checkPushgatewayStatus 检查单个 Pushgateway 地址的状态（使用 GetStats 方法）
func (c *DatasourceStatusChecker) checkPushgatewayStatus(ctx context.Context, addr string, metricsClient metrics.Client) *datasourceV1.AddressStatus {
	start := time.Now()

	// 调用 Pushgateway 的 GetStats 接口获取状态
	respAny, _, err := metricsClient.GetStats(ctx, &pushgatewayv1.GetStatsRequest{})
	latency := time.Since(start).Milliseconds()
	if err != nil {
		logger.Debug("Failed to get stats for (%s): (%v)", addr, err)
		return &datasourceV1.AddressStatus{
			Address:        addr,
			Status:         "offline",
			LatencyMs:      0,
			ErrorMessage:   err.Error(),
			LastOnlineTime: 0,
		}
	}
	if respAny.Code != 0 {
		logger.Debug("Failed to get stats for (%s): (%v)", addr, err)
		return &datasourceV1.AddressStatus{
			Address:        addr,
			Status:         "offline",
			LatencyMs:      0,
			ErrorMessage:   respAny.Msg,
			LastOnlineTime: 0,
		}
	}
	if len(respAny.Data) == 0 {
		logger.Debug("Failed to get stats for (%s): (%v)", addr, err)
		return &datasourceV1.AddressStatus{
			Address:        addr,
			Status:         "offline",
			LatencyMs:      0,
			ErrorMessage:   "no stats data returned",
			LastOnlineTime: 0,
		}
	}
	statResponse, err := coder.Decode[pushgatewayv1.GetStatsResponse](coder.CodeOptSonic, respAny.Data[0])
	if err != nil {
		logger.Warn("Failed to decode stats response for (%s): (%v)", addr, err)
		return &datasourceV1.AddressStatus{
			Address:        addr,
			Status:         "offline",
			LatencyMs:      0,
			ErrorMessage:   err.Error(),
			LastOnlineTime: 0,
		}
	}

	// 检查是否成功获取到统计信息
	if statResponse.Stats == nil {
		return &datasourceV1.AddressStatus{
			Address:      addr,
			Status:       "offline",
			LatencyMs:    int32(latency),
			ErrorMessage: "no stats data returned",
		}
	}

	// 成功获取统计信息，填充详细数据
	return &datasourceV1.AddressStatus{
		Address:       addr,
		Status:        "online",
		LatencyMs:     int32(latency),
		TotalSeries:   statResponse.Stats.TotalSeries,
		DiskSize:      statResponse.Stats.DiskSize,
		RetentionDays: statResponse.Stats.RetentionDays,
		TotalSamples:  statResponse.Stats.TotalSamples,
	}
}

// hasStatusChanged 检查状态是否发生变化
func hasStatusChanged(ds *repo.DatasourceDocument, newStatus *datasourceV1.DatasourceStatus) bool {
	// 简单比较整体状态
	// 如果数据库中没有 status 字段，可以认为是第一次检查，应该推送
	if ds.Resource.Status == nil || *ds.Resource.Status == "" {
		return true
	}
	return *ds.Resource.Status != newStatus.OverallStatus
}
