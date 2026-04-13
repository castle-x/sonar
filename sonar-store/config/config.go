package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Addr    string        `yaml:"addr"`
	Storage StorageConfig `yaml:"storage"`
	Tap     TapConfig     `yaml:"tap"`
}

type StorageConfig struct {
	DataDir               string `yaml:"data_dir"`
	RetentionDays         int    `yaml:"retention_days"`
	WriteBufferSize       int    `yaml:"write_buffer_size"`
	CompactionIntervalSec int    `yaml:"compaction_interval_sec"`
	CleanupIntervalSec    int    `yaml:"cleanup_interval_sec"`
	MinBlockDurationSec   int    `yaml:"min_block_duration_sec"`
	MaxBlockDurationSec   int    `yaml:"max_block_duration_sec"`
	MaxChunkSizeMB        int64  `yaml:"max_chunk_size_mb"`
}

type TapConfig struct {
	StaleTimeoutSec    int `yaml:"stale_timeout_sec"`
	CleanupIntervalSec int `yaml:"cleanup_interval_sec"`
	CleanupAfterSec    int `yaml:"cleanup_after_sec"`
}

func Load(path string) (*Config, error) {
	cfg := &Config{}
	setDefaults(cfg)

	if path != "" {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("read config file: %w", err)
		}
		if err := yaml.Unmarshal(data, cfg); err != nil {
			return nil, fmt.Errorf("parse config file: %w", err)
		}
	}

	return cfg, nil
}

func setDefaults(cfg *Config) {
	cfg.Addr = ":8082"
	cfg.Storage.DataDir = "./data"
	cfg.Storage.RetentionDays = 7
	cfg.Storage.WriteBufferSize = 4096
	cfg.Storage.CompactionIntervalSec = 3600
	cfg.Storage.CleanupIntervalSec = 3600
	cfg.Storage.MinBlockDurationSec = 7200
	cfg.Storage.MaxBlockDurationSec = 86400
	cfg.Storage.MaxChunkSizeMB = 512
	cfg.Tap.StaleTimeoutSec = 300
	cfg.Tap.CleanupIntervalSec = 60
	cfg.Tap.CleanupAfterSec = 3600
}
