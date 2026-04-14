package aggregator

import (
	"fmt"
	"time"
)

type Config struct {
	Enabled        bool          `yaml:"enabled" json:"enabled"`
	Levels         []LevelConfig `yaml:"levels" json:"levels"`
	CollectTimeout time.Duration `yaml:"collect_timeout" json:"collect_timeout"`
	QueryDelay     time.Duration `yaml:"query_delay" json:"query_delay"`
}

type LevelConfig struct {
	Name         string        `yaml:"name" json:"name"`
	Interval     time.Duration `yaml:"interval" json:"interval"`
	Retention    time.Duration `yaml:"retention" json:"retention"`
	Source       string        `yaml:"source" json:"source"`
	MinPoints    int           `yaml:"min_points" json:"min_points"`
	FallbackMode FallbackMode  `yaml:"fallback_mode" json:"fallback_mode"`
	Description  string        `yaml:"description" json:"description"`
}

type FallbackMode string

const (
	FallbackSkip    FallbackMode = "skip"
	FallbackSingle  FallbackMode = "single"
	FallbackPartial FallbackMode = "partial"
)

func (c *Config) GetLevel(name string) *LevelConfig {
	for i := range c.Levels {
		if c.Levels[i].Name == name {
			return &c.Levels[i]
		}
	}
	return nil
}

func (c *Config) GetSourceLevel(targetLevel string) *LevelConfig {
	target := c.GetLevel(targetLevel)
	if target == nil || target.Source == "raw" {
		return nil
	}
	return c.GetLevel(target.Source)
}

func (c *Config) Validate() error {
	if !c.Enabled {
		return nil
	}
	if len(c.Levels) == 0 {
		return fmt.Errorf("no aggregation levels configured")
	}
	if c.Levels[0].Source != "raw" {
		return fmt.Errorf("first level must have source='raw', got '%s'", c.Levels[0].Source)
	}
	minInterval := c.GetMinInterval()
	if c.CollectTimeout <= 0 {
		c.CollectTimeout = time.Duration(float64(minInterval) * 0.8)
	}
	if c.CollectTimeout >= minInterval {
		return fmt.Errorf("collect_timeout (%v) must be less than min interval (%v)", c.CollectTimeout, minInterval)
	}
	for i := 1; i < len(c.Levels); i++ {
		level := &c.Levels[i]
		if level.Source == "raw" {
			return fmt.Errorf("level '%s' cannot have source='raw'", level.Name)
		}
		sourceLevel := c.GetLevel(level.Source)
		if sourceLevel == nil {
			return fmt.Errorf("level '%s' references unknown source '%s'", level.Name, level.Source)
		}
		if level.Interval <= sourceLevel.Interval {
			return fmt.Errorf("level '%s' interval (%v) must be greater than source '%s' interval (%v)",
				level.Name, level.Interval, sourceLevel.Name, sourceLevel.Interval)
		}
	}
	return nil
}

func (c *Config) GetMinInterval() time.Duration {
	if len(c.Levels) == 0 {
		return 0
	}
	return c.Levels[0].Interval
}

func (c *Config) GetMinRetention() time.Duration {
	if len(c.Levels) == 0 {
		return 0
	}
	minRetention := c.Levels[0].Retention
	for i := 1; i < len(c.Levels); i++ {
		if c.Levels[i].Retention < minRetention {
			minRetention = c.Levels[i].Retention
		}
	}
	return minRetention
}

func DefaultConfig() *Config {
	return &Config{
		Enabled:        true,
		CollectTimeout: 12 * time.Second,
		Levels: []LevelConfig{
			{Name: "15s", Interval: 15 * time.Second, Retention: 15 * time.Minute, Source: "raw", MinPoints: 1, FallbackMode: FallbackSkip},
			{Name: "30s", Interval: 30 * time.Second, Retention: 30 * time.Minute, Source: "15s", MinPoints: 2, FallbackMode: FallbackSingle},
			{Name: "1m", Interval: 1 * time.Minute, Retention: 1 * time.Hour, Source: "30s", MinPoints: 2, FallbackMode: FallbackPartial},
			{Name: "5m", Interval: 5 * time.Minute, Retention: 6 * time.Hour, Source: "1m", MinPoints: 5, FallbackMode: FallbackPartial},
			{Name: "1h", Interval: 1 * time.Hour, Retention: 7 * 24 * time.Hour, Source: "5m", MinPoints: 12, FallbackMode: FallbackSkip},
			{Name: "6h", Interval: 6 * time.Hour, Retention: 30 * 24 * time.Hour, Source: "1h", MinPoints: 6, FallbackMode: FallbackSkip},
			{Name: "1d", Interval: 24 * time.Hour, Retention: 90 * 24 * time.Hour, Source: "6h", MinPoints: 4, FallbackMode: FallbackSkip},
		},
	}
}
