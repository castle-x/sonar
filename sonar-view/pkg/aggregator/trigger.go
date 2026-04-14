package aggregator

import (
	"context"
	"sonar-view/pkg/trigger"
	"time"
)

type AggregationTrigger struct {
	manager  *Manager
	interval time.Duration
}

func NewAggregationTrigger(manager *Manager) *AggregationTrigger {
	return &AggregationTrigger{
		manager:  manager,
		interval: manager.config.GetMinInterval(),
	}
}

func (t *AggregationTrigger) Name() string                   { return "aggregation-collector" }
func (t *AggregationTrigger) Type() trigger.TriggerType      { return trigger.TriggerTypeInterval }
func (t *AggregationTrigger) Interval() time.Duration        { return t.interval }
func (t *AggregationTrigger) Execute(ctx context.Context) error {
	return t.manager.RunOnce(ctx, time.Now())
}

type CleanupTrigger struct {
	manager  *Manager
	interval time.Duration
}

func NewCleanupTrigger(manager *Manager) *CleanupTrigger {
	interval := manager.config.GetMinRetention() / 2
	if interval < time.Minute {
		interval = time.Minute
	}
	return &CleanupTrigger{manager: manager, interval: interval}
}

func (t *CleanupTrigger) Name() string                   { return "aggregation-cleanup" }
func (t *CleanupTrigger) Type() trigger.TriggerType      { return trigger.TriggerTypeInterval }
func (t *CleanupTrigger) Interval() time.Duration        { return t.interval }
func (t *CleanupTrigger) Execute(ctx context.Context) error {
	return t.manager.CleanupExpiredData(ctx, time.Now())
}
