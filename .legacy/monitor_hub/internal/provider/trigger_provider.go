package provider

import (
	"github.com/google/wire"

	// 导入用户自定义触发器
	pkgTrigger "monitor_hub/pkg/trigger"

	// 导入聚合触发器
	pkgAggregator "monitor_hub/pkg/aggregator"
	// 导入触发器
	trigger "monitor_hub/internal/trigger"
)

var TriggerProviderSet = wire.NewSet(
	// ...这里添加
	pkgTrigger.NewDatasourceStatusTrigger,
	pkgAggregator.NewAggregationTrigger,
	pkgAggregator.NewCleanupTrigger,
	// ...
	ProvideTriggerDeps,
)

type TriggerDeps struct {
	Triggers []trigger.Trigger
}

func ProvideTriggerDeps(
	datasourceTrigger *pkgTrigger.DatasourceStatusTrigger,
	aggregationTrigger *pkgAggregator.AggregationTrigger,
	cleanupTrigger *pkgAggregator.CleanupTrigger,
) *TriggerDeps {
	return &TriggerDeps{
		Triggers: []trigger.Trigger{
			datasourceTrigger,
			aggregationTrigger,
			cleanupTrigger,
		},
	}
}
