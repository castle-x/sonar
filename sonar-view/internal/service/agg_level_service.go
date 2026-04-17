package service

import (
	"context"
	"fmt"
	"github.com/castle-x/goutils/ablog"
	"time"

	"sonar-view/internal/repo"
	"sonar-view/pkg/aggregator"
)

var aggLevelLogger = ablog.NewLogger("agg_level")

// AggLevelService manages aggregation level configuration stored in SQLite.
type AggLevelService struct {
	repo *repo.AggLevelRepo
}

func NewAggLevelService(r *repo.AggLevelRepo) *AggLevelService {
	return &AggLevelService{repo: r}
}

// EnsureDefaults seeds the aggregation_levels table with the canonical default
// levels when the table is empty. This matches legacy monitor_hub defaults.
func (s *AggLevelService) EnsureDefaults(ctx context.Context) error {
	n, err := s.repo.Count(ctx)
	if err != nil {
		return fmt.Errorf("count agg levels: %w", err)
	}
	if n > 0 {
		return nil // already seeded
	}

	defaults := defaultAggLevels()
	if err := s.repo.BulkInsert(ctx, defaults); err != nil {
		return fmt.Errorf("seed agg levels: %w", err)
	}
	aggLevelLogger.Info("aggregation levels seeded with %d default levels", len(defaults))
	return nil
}

// EnsureDefaultsFromConfig seeds the aggregation_levels table from config.yaml levels
// when the table is empty. If the table already has data, it's a no-op (DB wins).
func (s *AggLevelService) EnsureDefaultsFromConfig(ctx context.Context, cfgLevels []aggregator.LevelConfig) error {
	n, err := s.repo.Count(ctx)
	if err != nil {
		return fmt.Errorf("count agg levels: %w", err)
	}
	if n > 0 {
		return nil // already seeded, DB wins
	}

	now := time.Now().UnixMilli()
	levels := make([]*repo.AggLevel, 0, len(cfgLevels))
	for i, l := range cfgLevels {
		levels = append(levels, &repo.AggLevel{
			Name:         l.Name,
			IntervalMs:   l.Interval.Milliseconds(),
			RetentionMs:  l.Retention.Milliseconds(),
			Source:       l.Source,
			MinPoints:    l.MinPoints,
			FallbackMode: string(l.FallbackMode),
			Description:  l.Description,
			SortOrder:    i,
			CreatedAt:    now,
			UpdatedAt:    now,
		})
	}
	if err := s.repo.BulkInsert(ctx, levels); err != nil {
		return fmt.Errorf("seed agg levels from config: %w", err)
	}
	aggLevelLogger.Info("aggregation levels seeded from config.yaml: %d levels", len(levels))
	return nil
}

// List returns all aggregation levels ordered by sort_order.
func (s *AggLevelService) List(ctx context.Context) ([]*repo.AggLevel, error) {
	return s.repo.ListOrdered(ctx)
}

// BuildAggConfig loads levels from SQLite and builds an aggregator.Config.
// Falls back to DefaultConfig() if DB is unavailable or empty.
func (s *AggLevelService) BuildAggConfig(ctx context.Context) (*aggregator.Config, error) {
	levels, err := s.repo.ListOrdered(ctx)
	if err != nil {
		aggLevelLogger.Warn("failed to load agg levels from DB, using defaults: %v", err)
		return aggregator.DefaultConfig(), nil
	}
	if len(levels) == 0 {
		aggLevelLogger.Warn("no agg levels in DB, using defaults")
		return aggregator.DefaultConfig(), nil
	}

	cfg := &aggregator.Config{
		Enabled:        true,
		CollectTimeout: 12 * time.Second,
	}
	for _, l := range levels {
		cfg.Levels = append(cfg.Levels, aggregator.LevelConfig{
			Name:         l.Name,
			Interval:     time.Duration(l.IntervalMs) * time.Millisecond,
			Retention:    time.Duration(l.RetentionMs) * time.Millisecond,
			Source:       l.Source,
			MinPoints:    l.MinPoints,
			FallbackMode: aggregator.FallbackMode(l.FallbackMode),
			Description:  l.Description,
		})
	}
	return cfg, nil
}

// ─── canonical default levels (mirrors DefaultConfig) ────────────────────────

func defaultAggLevels() []*repo.AggLevel {
	type lvl struct {
		name         string
		intervalMs   int64
		retentionMs  int64
		source       string
		minPoints    int
		fallbackMode string
		description  string
		sortOrder    int
	}
	defs := []lvl{
		{"15s", ms(15 * time.Second), ms(15 * time.Minute), "raw", 1, "skip", "raw 15-second rollup", 0},
		{"30s", ms(30 * time.Second), ms(30 * time.Minute), "15s", 2, "single", "30-second cascade", 1},
		{"1m", ms(1 * time.Minute), ms(1 * time.Hour), "30s", 2, "partial", "1-minute cascade", 2},
		{"5m", ms(5 * time.Minute), ms(6 * time.Hour), "1m", 5, "partial", "5-minute cascade", 3},
		{"1h", ms(1 * time.Hour), ms(7 * 24 * time.Hour), "5m", 12, "skip", "1-hour cascade", 4},
		{"6h", ms(6 * time.Hour), ms(30 * 24 * time.Hour), "1h", 6, "skip", "6-hour cascade", 5},
		{"1d", ms(24 * time.Hour), ms(90 * 24 * time.Hour), "6h", 4, "skip", "1-day cascade", 6},
	}
	now := time.Now().UnixMilli()
	result := make([]*repo.AggLevel, 0, len(defs))
	for _, d := range defs {
		result = append(result, &repo.AggLevel{
			Name:         d.name,
			IntervalMs:   d.intervalMs,
			RetentionMs:  d.retentionMs,
			Source:       d.source,
			MinPoints:    d.minPoints,
			FallbackMode: d.fallbackMode,
			Description:  d.description,
			SortOrder:    d.sortOrder,
			CreatedAt:    now,
			UpdatedAt:    now,
		})
	}
	return result
}

func ms(d time.Duration) int64 {
	return d.Milliseconds()
}
