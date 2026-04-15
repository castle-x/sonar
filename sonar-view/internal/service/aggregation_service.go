package service

import (
	"context"
	"fmt"
	"log"
	"time"

	"sonar-view/config"
	"sonar-view/pkg/aggregator"
	"sonar-view/pkg/storage"
	"sonar-view/pkg/trigger"
)

// AggregationService 聚合服务
type AggregationService struct {
	manager              *aggregator.Manager
	tsdb                 storage.Storage[aggregator.AggregatedPoint]
	triggerManager       *trigger.TriggerManager
	cfg                  *config.Config
	storeConfigService   *StoreConfigService
	startedAt            time.Time
}

func NewAggregationService(cfg *config.Config, eventPublisher aggregator.EventPublisher, storeConfigService *StoreConfigService) (*AggregationService, error) {
	ctx := context.Background()

	// Create trigger manager
	tm := trigger.NewTriggerManager(ctx)

	// Create TSDB storage
	storageCfg := &storage.Config{
		DataDir:               cfg.TSDB.DataDir,
		RetentionDays:         cfg.TSDB.RetentionDays,
		WriteBufferSize:       cfg.TSDB.WriteBufferSize,
		MaxChunkSize:          cfg.TSDB.MaxChunkSize,
		MixBlockDuration:      cfg.TSDB.BlockDuration,
		MaxBlockDuration:      cfg.TSDB.MaxBlockDuration,
		CompactionInterval:    cfg.TSDB.CompactionInterval,
		MemoryCleanupInterval: cfg.TSDB.CleanupInterval,
	}
	serializer := aggregator.NewAggregatedPointSerializer()
	tsdb, err := storage.NewPrometheusStorage(storageCfg, serializer, tm)
	if err != nil {
		return nil, fmt.Errorf("create TSDB failed: %w", err)
	}

	// Build aggregation config
	aggCfg := aggregator.DefaultConfig()
	aggCfg.Enabled = cfg.Aggregation.Enabled
	if cfg.Aggregation.CollectTimeout > 0 {
		aggCfg.CollectTimeout = cfg.Aggregation.CollectTimeout
	}
	if cfg.Aggregation.QueryDelay > 0 {
		aggCfg.QueryDelay = cfg.Aggregation.QueryDelay
	}

	// Create collector
	collector := aggregator.NewStoreCollector(cfg.Store.Addr, cfg.Store.AppID)

	// Create manager
	opts := []aggregator.ManagerOption{}
	if eventPublisher != nil {
		opts = append(opts, aggregator.WithEventPublisher(eventPublisher))
	}
	manager, err := aggregator.NewManager(aggCfg, tsdb, collector, opts...)
	if err != nil {
		return nil, fmt.Errorf("create aggregation manager failed: %w", err)
	}

	return &AggregationService{
		manager:            manager,
		tsdb:               tsdb,
		triggerManager:     tm,
		cfg:                cfg,
		storeConfigService: storeConfigService,
		startedAt:          time.Now(),
	}, nil
}

// Start 启动聚合服务
func (s *AggregationService) Start() error {
	ctx := context.Background()

	// Register collectors from store configurations if service is available
	if s.storeConfigService != nil {
		configs, err := s.storeConfigService.List(ctx)
		if err != nil {
			log.Printf("[WARN] failed to load store configs: %v", err)
		} else {
			for _, cfg := range configs {
				if cfg == nil || cfg.Addr == "" {
					continue
				}
				collectorName := cfg.Name
				if collectorName == "" {
					collectorName = cfg.ID
				}
				collector := aggregator.NewStoreCollector(cfg.Addr, s.cfg.Store.AppID)
				if err := s.manager.RegisterCollector(collectorName, collector); err != nil {
					log.Printf("[WARN] failed to register collector %s: %v", collectorName, err)
				} else {
					log.Printf("[INFO] registered collector: %s (%s)", collectorName, cfg.Addr)
				}
			}
		}
	}

	// Register triggers
	aggTrigger := aggregator.NewAggregationTrigger(s.manager)
	cleanupTrigger := aggregator.NewCleanupTrigger(s.manager)

	if err := s.triggerManager.RegisterTriggers(aggTrigger, cleanupTrigger); err != nil {
		return fmt.Errorf("register triggers failed: %w", err)
	}

	s.triggerManager.StartAll()
	log.Printf("[INFO] aggregation service started")
	return nil
}

// Stop 停止聚合服务
func (s *AggregationService) Stop() {
	s.triggerManager.Shutdown()
	if err := s.tsdb.Close(); err != nil {
		log.Printf("[ERROR] aggregation: close TSDB failed: %v", err)
	}
	log.Printf("[INFO] aggregation service stopped")
}

// GetManager 获取聚合管理器
func (s *AggregationService) GetManager() *aggregator.Manager {
	return s.manager
}

// GetTSDB 获取 TSDB 存储
func (s *AggregationService) GetTSDB() storage.Storage[aggregator.AggregatedPoint] {
	return s.tsdb
}

// GetStatus 获取服务状态
func (s *AggregationService) GetStatus(ctx context.Context) map[string]interface{} {
	stats, err := s.tsdb.GetStats(ctx)
	status := map[string]interface{}{
		"enabled":    s.cfg.Aggregation.Enabled,
		"uptime_sec": int64(time.Since(s.startedAt).Seconds()),
		"store_addr": s.cfg.Store.Addr,
	}
	if err == nil && stats != nil {
		status["tsdb"] = stats
	}
	cfg := s.manager.GetConfig()
	levels := make([]map[string]interface{}, 0, len(cfg.Levels))
	for _, level := range cfg.Levels {
		lastTime, ok := s.manager.GetLastAggregationTime(level.Name)
		levelInfo := map[string]interface{}{
			"name":     level.Name,
			"interval": level.Interval.String(),
		}
		if ok {
			levelInfo["last_aggregation"] = lastTime.Unix()
		}
		levels = append(levels, levelInfo)
	}
	status["levels"] = levels
	return status
}
