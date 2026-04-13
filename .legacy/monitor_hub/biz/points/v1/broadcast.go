package v1

import (
	v1 "monitor_hub/apis/monitor_hub/points/v1"
	configV1 "monitor_hub/config/v1"
	websocket "monitor_hub/internal/websocket"
	"monitor_hub/pkg/aggregator"
	"slices"

	"git.woa.com/castlexu/goutils/ablog"
)

var logger = ablog.NewLogger("points-broadcaster")

type PointsBroadcaster struct {
	cfg     *configV1.Config
	options []websocket.BroadcastOption
}

func NewPointsBroadcaster(cfg *configV1.Config) *PointsBroadcaster {
	broadcaster := &PointsBroadcaster{
		cfg: cfg,
	}
	broadcaster.initOptions(cfg)
	return broadcaster
}

func (b *PointsBroadcaster) initOptions(cfg *configV1.Config) {
	for _, option := range cfg.Websocket.BroadcastTriggers.Points.Options {
		b.options = append(b.options, *websocket.NewBroadcastOption(
			websocket.WithOptionTopic(option.Topic),
			websocket.WithOptionMethod(option.Method),
			websocket.WithOptionTriggerType(option.TriggerType),
			websocket.WithOptionEventName(option.EventName),
			websocket.WithOptionEventBufferSize(option.EventBufferSize),
		))
	}
	if b.options == nil {
		b.options = websocket.NewBroadcastOptions(v1.Default_WsPointsOptions)
	}
}

func (b *PointsBroadcaster) Name() string {
	return "points"
}

func (b *PointsBroadcaster) Options() []websocket.BroadcastOption {
	return b.options
}

// BroadcastOne 广播给单个订阅者, 可以根据topic确定不同广播逻辑
func (b *PointsBroadcaster) BroadcastOne(ctx *websocket.BroadcastContext) *websocket.BroadcasterMessage {
	topic := ctx.Topic()
	if topic == "points" {
		subscription := ctx.Subscription().Metadata.(*v1.SubscribePointsRequest)
		points := ctx.Event().(*aggregator.AggregationEvent)

		// 过滤 points
		respPoints := make([]aggregator.AggregatedPoint, 0)
		for _, point := range points.Points {
			// 数据源过滤
			if point.DatasourceId != subscription.DatasourceId {
				continue
			}

			// 聚合等级过滤
			if !slices.Contains(subscription.AggregationLevels, point.Level) {
				continue
			}

			// 指标名称过滤（可选）
			if len(subscription.MetricFilters) > 0 {
				if !slices.Contains(subscription.MetricFilters, point.Name) {
					continue
				}
			}

			// 标签过滤（可选，精确匹配）
			if subscription.Labels != nil && len(subscription.Labels)%2 == 0 {
				match := true
				for i := 0; i < len(subscription.Labels); i += 2 {
					name := subscription.Labels[i]
					value := subscription.Labels[i+1]
					if point.Labels.Get(name) != value {
						match = false
						break
					}
				}
				if !match {
					continue
				}
			}

			respPoints = append(respPoints, point)
		}

		// 构造响应（只包含 points 和 count）
		// 注意：直接返回 map 结构，避免类型转换问题
		broadcastResp := map[string]interface{}{
			"points": respPoints,
			"count":  len(respPoints),
		}

		logger.Info("(PointsBroadcaster) broadcast points datasource_id: %s, aggregation_levels: %v, count: %v",
			subscription.DatasourceId, subscription.AggregationLevels, len(respPoints))

		return &websocket.BroadcasterMessage{
			BroadcasterType: websocket.Topic,
			Topic:           topic,
			Data:            broadcastResp,
		}
	}
	return nil
}

// 广播所有订阅者, 也可以根据topic确定不同广播逻辑, 返回值可以做筛选推送(推送给特定)
func (b *PointsBroadcaster) BroadcastRange(ctx *websocket.BroadcastContext) *websocket.BroadcasterMessage {
	// 如果不需要，可以返回空
	return nil
}
