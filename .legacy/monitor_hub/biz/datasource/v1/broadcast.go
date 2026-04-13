package v1

import (
	"context"

	datasourceV1 "monitor_hub/apis/monitor_hub/datasource/v1"
	ws "monitor_hub/internal/websocket"
	"monitor_hub/pkg/repo"

	configv1 "monitor_hub/config/v1"
	pkgtrigger "monitor_hub/pkg/trigger"

	"git.woa.com/castlexu/goutils/ablog"
)

// 自动生成
var logger = ablog.NewLogger("datasource_broadcaster")

// 自动生成
type DatasourceBroadcaster struct {
	datasourceRepo          repo.DatasourceRepo
	cfg                     *configv1.Config
	options                 []ws.BroadcastOption
	datasourceStatusChecker *pkgtrigger.DatasourceStatusChecker
}

// 自动生成
func NewDatasourceBroadcaster(cfg *configv1.Config, datasourceRepo repo.DatasourceRepo, datasourceStatusChecker *pkgtrigger.DatasourceStatusChecker) *DatasourceBroadcaster {
	broadcaster := &DatasourceBroadcaster{
		cfg:                     cfg,
		datasourceRepo:          datasourceRepo,
		datasourceStatusChecker: datasourceStatusChecker,
	}
	broadcaster.initOptions(cfg)
	return broadcaster
}

func (b *DatasourceBroadcaster) initOptions(cfg *configv1.Config) {
	for _, option := range cfg.Websocket.BroadcastTriggers.Datasource.Options {
		b.options = append(b.options, *ws.NewBroadcastOption(
			ws.WithOptionTopic(option.Topic),
			ws.WithOptionMethod(option.Method),
			ws.WithOptionTriggerType(option.TriggerType),
			ws.WithOptionInterval(option.Interval),
		))
	}
	if b.options == nil {
		b.options = ws.NewBroadcastOptions(datasourceV1.Default_WsDatasourceOptions)
	}
}

func (b *DatasourceBroadcaster) Name() string {
	return "datasource"
}

func (b *DatasourceBroadcaster) Options() []ws.BroadcastOption {
	return b.options
}

// 自动生成
func (b *DatasourceBroadcaster) BroadcastOne(bctx *ws.BroadcastContext) *ws.BroadcasterMessage {
	// 这里实现用户自己的代码
	topic := bctx.Subscription().Topic

	// 可以根据触发类型做不同处理
	// if bctx.IsEventTrigger() {
	//     // 处理事件数据
	//     event := bctx.Event()
	// }

	if topic == "datasource.status" {
		return b.broadcastDatasourceStatusBySubscription(bctx, bctx.Subscription())
	}
	return nil
}

// 自动生成 空函数，然后由用户自己实现
func (b *DatasourceBroadcaster) BroadcastRange(bctx *ws.BroadcastContext) *ws.BroadcasterMessage {
	// 如果不需要，可以返回空
	// 可以通过 bctx.Event() 获取事件数据（如果是事件触发）
	return nil
}

func (b *DatasourceBroadcaster) broadcastDatasourceStatusBySubscription(ctx context.Context, subscription *ws.Subscription) *ws.BroadcasterMessage {
	topic := subscription.Topic
	req, ok := subscription.Metadata.(*datasourceV1.SubscribeDatasourceStatusRequest)
	if !ok {
		logger.Warn("(%s) Failed to get subscribe request: (%v)", topic, subscription.Metadata)
		return nil
	}
	if req.DatasourceIds == nil {
		return nil
	}
	datasourceIds := req.DatasourceIds
	datasources, err := b.datasourceRepo.GetDatasourceByIds(ctx, datasourceIds)
	if err != nil {
		logger.Warn("(%s) Failed to get datasources: (%v)", topic, err)
		return nil
	}
	nowDatasourceItemList := b.datasourceStatusChecker.GetDatasourceItemList(ctx, datasources)
	if len(nowDatasourceItemList) == 0 {
		return nil
	}
	statuses := make([]datasourceV1.DatasourceStatus, len(nowDatasourceItemList))
	for i, item := range nowDatasourceItemList {
		statuses[i] = *item.Status
	}
	logger.Info("(%s) Broadcasting status for (%d) datasources", topic, len(nowDatasourceItemList))
	// 广播
	resp := &datasourceV1.DatasourceStatusBroadcast{
		Updates: statuses,
	}
	return &ws.BroadcasterMessage{
		BroadcasterType: ws.Topic,
		Topic:           topic,
		Data:            resp,
	}
}
