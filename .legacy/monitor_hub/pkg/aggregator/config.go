package aggregator

import (
	"fmt"
	"time"
)

// ============================================
// 聚合配置
// ============================================

// Config 级联聚合配置
type Config struct {
	// Enabled 是否启用级联聚合
	Enabled bool `yaml:"enabled" json:"enabled"`

	// Levels 聚合级别配置列表
	Levels []LevelConfig `yaml:"levels" json:"levels"`

	// CollectTimeout 采集超时时间
	//
	// 说明：
	//   - 用于从 Pushgateway 采集原始数据的超时时间
	//   - 应该小于最小聚合间隔，避免触发器阻塞
	//   - 建议设置为最小间隔的 80%（如 15s 间隔，超时设置为 12s）
	//   - 默认值：10s
	CollectTimeout time.Duration `yaml:"collect_timeout" json:"collect_timeout"`

	// QueryDelay 查询延迟（全局配置）
	//
	// 说明：
	//   - 将当前时间向前移动指定时长后再查询，用于等待迟到的数据
	//   - 适用于日志采集等场景，数据推送存在固定延迟
	//   - 例如：日志 30s flush 一次，设置 40s 延迟（30s + 10s 缓冲）
	//   - 会导致图表延迟相应时间，但能避免数据断档
	//   - 默认值：40s
	QueryDelay time.Duration `yaml:"query_delay" json:"query_delay"`
}

// LevelConfig 单个聚合级别配置
type LevelConfig struct {
	// Name 级别名称：15s, 30s, 1m, 5m, 1h, 6h, 1d
	Name string `yaml:"name" json:"name"`

	// Interval 聚合间隔
	Interval time.Duration `yaml:"interval" json:"interval"`

	// Retention 数据保留时间
	Retention time.Duration `yaml:"retention" json:"retention"`

	// Source 数据来源（"raw" 表示从原始源采集，其他值表示从指定级别聚合）
	Source string `yaml:"source" json:"source"`

	// MinPoints 最少需要的数据点数
	MinPoints int `yaml:"min_points" json:"min_points"`

	// FallbackMode 降级模式
	FallbackMode FallbackMode `yaml:"fallback_mode" json:"fallback_mode"`

	// Description 描述
	Description string `yaml:"description" json:"description"`
}

// FallbackMode 降级模式
type FallbackMode string

const (
	// FallbackSkip 跳过聚合（保证质量）
	FallbackSkip FallbackMode = "skip"

	// FallbackSingle 允许单点聚合（保证连续性）
	FallbackSingle FallbackMode = "single"

	// FallbackPartial 允许部分聚合（>=50%点数）
	FallbackPartial FallbackMode = "partial"
)

// ============================================
// 配置方法
// ============================================

// GetLevel 获取指定级别配置
func (c *Config) GetLevel(name string) *LevelConfig {
	for i := range c.Levels {
		if c.Levels[i].Name == name {
			return &c.Levels[i]
		}
	}
	return nil
}

// GetSourceLevel 获取源级别配置
func (c *Config) GetSourceLevel(targetLevel string) *LevelConfig {
	target := c.GetLevel(targetLevel)
	if target == nil || target.Source == "raw" {
		return nil
	}
	return c.GetLevel(target.Source)
}

// Validate 验证配置
func (c *Config) Validate() error {
	if !c.Enabled {
		return nil
	}

	if len(c.Levels) == 0 {
		return fmt.Errorf("no aggregation levels configured")
	}

	// 验证第一个级别必须是 raw 源
	if c.Levels[0].Source != "raw" {
		return fmt.Errorf("first level must have source='raw', got '%s'", c.Levels[0].Source)
	}

	// 验证采集超时时间
	minInterval := c.GetMinInterval()
	if c.CollectTimeout <= 0 {
		// 如果未设置，使用默认值（最小间隔的 80%）
		c.CollectTimeout = time.Duration(float64(minInterval) * 0.8)
	}
	if c.CollectTimeout >= minInterval {
		return fmt.Errorf("collect_timeout (%v) must be less than min interval (%v) to avoid trigger blocking",
			c.CollectTimeout, minInterval)
	}

	// 验证级联关系
	for i := 1; i < len(c.Levels); i++ {
		level := &c.Levels[i]

		// 检查源级别是否存在
		if level.Source == "raw" {
			return fmt.Errorf("level '%s' cannot have source='raw' (only first level can)", level.Name)
		}

		sourceLevel := c.GetLevel(level.Source)
		if sourceLevel == nil {
			return fmt.Errorf("level '%s' references unknown source '%s'", level.Name, level.Source)
		}

		// 检查间隔必须大于源级别
		if level.Interval <= sourceLevel.Interval {
			return fmt.Errorf("level '%s' interval (%v) must be greater than source '%s' interval (%v)",
				level.Name, level.Interval, sourceLevel.Name, sourceLevel.Interval)
		}
	}

	return nil
}

// GetMinInterval 获取最小聚合间隔
func (c *Config) GetMinInterval() time.Duration {
	if len(c.Levels) == 0 {
		return 0
	}
	return c.Levels[0].Interval
}

// GetMinRetention 获取最小保留时长（用于清理触发器的间隔）
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

// ============================================
// 默认配置
// ============================================

// DefaultConfig 返回默认配置
func DefaultConfig() *Config {
	return &Config{
		Enabled:        true,
		CollectTimeout: 12 * time.Second, // 15s 间隔的 80%
		Levels: []LevelConfig{
			{
				Name:         "15s",
				Interval:     15 * time.Second,
				Retention:    15 * time.Minute,
				Source:       "raw",
				MinPoints:    1,
				FallbackMode: FallbackSkip,
				Description:  "原始采集数据",
			},
			{
				Name:         "30s",
				Interval:     30 * time.Second,
				Retention:    30 * time.Minute,
				Source:       "15s",
				MinPoints:    2,
				FallbackMode: FallbackSingle,
				Description:  "30秒聚合",
			},
			{
				Name:         "1m",
				Interval:     1 * time.Minute,
				Retention:    1 * time.Hour,
				Source:       "30s",
				MinPoints:    2,
				FallbackMode: FallbackPartial,
				Description:  "1分钟聚合",
			},
			{
				Name:         "5m",
				Interval:     5 * time.Minute,
				Retention:    6 * time.Hour,
				Source:       "1m",
				MinPoints:    5,
				FallbackMode: FallbackPartial,
				Description:  "5分钟聚合",
			},
			{
				Name:         "1h",
				Interval:     1 * time.Hour,
				Retention:    7 * 24 * time.Hour,
				Source:       "5m",
				MinPoints:    12,
				FallbackMode: FallbackSkip,
				Description:  "1小时聚合",
			},
			{
				Name:         "6h",
				Interval:     6 * time.Hour,
				Retention:    30 * 24 * time.Hour,
				Source:       "1h",
				MinPoints:    6,
				FallbackMode: FallbackSkip,
				Description:  "6小时聚合",
			},
			{
				Name:         "1d",
				Interval:     24 * time.Hour,
				Retention:    90 * 24 * time.Hour,
				Source:       "6h",
				MinPoints:    4,
				FallbackMode: FallbackSkip,
				Description:  "1天聚合",
			},
		},
	}
}
