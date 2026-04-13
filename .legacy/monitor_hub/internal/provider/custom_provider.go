package provider

import (
	"fmt"
	"time"

	configV1 "monitor_hub/config/v1"
	"monitor_hub/internal/trigger"
	"monitor_hub/internal/websocket"
	pkgaggregator "monitor_hub/pkg/aggregator"
	"monitor_hub/pkg/repo"
	pkgstorage "monitor_hub/pkg/storage"
	pkgtrigger "monitor_hub/pkg/trigger"

	"github.com/google/wire"
)

var CustomProviderSet = wire.NewSet(
	pkgtrigger.NewDatasourceStatusChecker,

	// Aggregator 相关 providers
	ProvideAggregatorConfig,                    // 提供聚合配置
	ProvideCollector,                           // 提供 Collector 接口
	pkgaggregator.NewAggregatedPointSerializer, // 提供 Serializer 接口
	ProvideAggregatedPointStorage,              // 提供 Storage 接口（泛型包装）
	ProvideAggregatorManager,                   // 提供 Manager（带事件发布器）

	ProvideCustomDeps,
)

// ============================================
// Aggregator Providers
// ============================================

// ProvideAggregatorConfig 提供聚合配置
func ProvideAggregatorConfig(cfg *configV1.Config) *pkgaggregator.Config {
	// 如果配置中未启用聚合，返回默认配置
	if !cfg.Aggregation.Enabled {
		return pkgaggregator.DefaultConfig()
	}

	// 从配置文件加载聚合配置
	config := &pkgaggregator.Config{
		Enabled:        cfg.Aggregation.Enabled,
		CollectTimeout: parseDuration(cfg.Aggregation.CollectTimeout),
		Levels:         make([]pkgaggregator.LevelConfig, 0, len(cfg.Aggregation.Levels)),
	}

	// 转换级别配置
	for _, level := range cfg.Aggregation.Levels {
		config.Levels = append(config.Levels, pkgaggregator.LevelConfig{
			Name:         level.Name,
			Interval:     parseDuration(level.Interval),
			Retention:    parseDuration(level.Retention),
			Source:       level.Source,
			MinPoints:    level.MinPoints,
			FallbackMode: pkgaggregator.FallbackMode(level.FallbackMode),
			Description:  level.Description,
		})
	}

	// 验证配置
	if err := config.Validate(); err != nil {
		// 如果配置无效，记录错误并返回默认配置
		// TODO: 改进错误处理，可以选择 panic 或返回 error
		return pkgaggregator.DefaultConfig()
	}

	return config
}

// ProvideCollector 提供 Collector 接口
func ProvideCollector(
	datasourceRepo repo.DatasourceRepo,
) pkgaggregator.Collector {
	return pkgaggregator.NewDatasourceCollector(datasourceRepo)
}

// ProvideAggregatedPointStorage 提供 AggregatedPoint 存储
//
// 注意：Wire 不支持泛型，所以需要为每个具体类型创建包装函数
func ProvideAggregatedPointStorage(
	cfg *configV1.Config,
	serializer pkgstorage.Serializer[pkgaggregator.AggregatedPoint],
	triggerManager *trigger.TriggerManager,
) (pkgstorage.Storage[pkgaggregator.AggregatedPoint], error) {
	return pkgstorage.NewPrometheusStorage(
		&pkgstorage.Config{
			DataDir:               cfg.Storage.DataDir,
			RetentionDays:         cfg.Storage.RetentionDays,
			CompactionInterval:    parseDuration(cfg.Storage.CompactionInterval),
			MaxChunkSize:          int64(cfg.Storage.MaxChunkSize),
			WriteBufferSize:       cfg.Storage.WriteBufferSize,
			MixBlockDuration:      parseDuration(cfg.Storage.MixBlockDuration),
			MaxBlockDuration:      parseDuration(cfg.Storage.MaxBlockDuration),
			MemoryCleanupInterval: parseDuration(cfg.Storage.MemoryCleanupInterval),
		},
		serializer,
		triggerManager,
	)
}

// ProvideAggregatorManager 提供聚合管理器（带事件发布器）
func ProvideAggregatorManager(
	config *pkgaggregator.Config,
	storage pkgstorage.Storage[pkgaggregator.AggregatedPoint],
	collector pkgaggregator.Collector,
	wsManager *websocket.Manager,
) (*pkgaggregator.Manager, error) {
	// 创建带事件发布器的聚合管理器
	return pkgaggregator.NewManager(
		config,
		storage,
		collector,
		pkgaggregator.WithEventPublisher(wsManager), // 传入 wsManager 作为事件发布器
	)
}

// parseDuration 解析时间字符串，支持天（d）单位
//
// 参数:
//   - s: 时间字符串，如 "10s", "1h", "30m", "7d" 等
//
// 返回:
//   - time.Duration: 解析后的时间间隔，解析失败返回 0
//
// 说明:
//   - time.ParseDuration 不支持 "d"（天）单位，需要手动处理
//   - 支持的单位: ns, us, ms, s, m, h, d
func parseDuration(s string) time.Duration {
	if s == "" {
		return 0
	}

	// 尝试直接解析
	d, err := time.ParseDuration(s)
	if err == nil {
		return d
	}

	// 如果失败，检查是否包含 "d"（天）单位
	// 例如: "7d" -> 7 * 24h = 168h
	if len(s) > 1 && s[len(s)-1] == 'd' {
		// 提取数字部分
		numStr := s[:len(s)-1]
		var days int
		_, err := fmt.Sscanf(numStr, "%d", &days)
		if err == nil && days > 0 {
			return time.Duration(days) * 24 * time.Hour
		}
	}

	// 解析失败，返回 0
	// TODO: 添加日志记录
	return 0
}

// ============================================
// 自定义依赖
// ============================================

type CustomDeps struct {
	DatasourceStatusChecker   *pkgtrigger.DatasourceStatusChecker
	AggregatorConfig          *pkgaggregator.Config
	Collector                 pkgaggregator.Collector
	AggregatedPointSerializer pkgstorage.Serializer[pkgaggregator.AggregatedPoint]
	AggregatedPointStorage    pkgstorage.Storage[pkgaggregator.AggregatedPoint]
	AggregatedPointManager    *pkgaggregator.Manager
	// 自定义包 , 首字母大写，可以在app.PrepareRun中使用
}

func ProvideCustomDeps(
	datasourceStatusChecker *pkgtrigger.DatasourceStatusChecker,
	aggregatorConfig *pkgaggregator.Config,
	collector pkgaggregator.Collector,
	aggregatedPointSerializer pkgstorage.Serializer[pkgaggregator.AggregatedPoint],
	aggregatedPointStorage pkgstorage.Storage[pkgaggregator.AggregatedPoint],
	aggregatedPointManager *pkgaggregator.Manager,
) *CustomDeps {
	return &CustomDeps{
		DatasourceStatusChecker:   datasourceStatusChecker,
		AggregatorConfig:          aggregatorConfig,
		Collector:                 collector,
		AggregatedPointSerializer: aggregatedPointSerializer,
		AggregatedPointStorage:    aggregatedPointStorage,
		AggregatedPointManager:    aggregatedPointManager,
	}
}