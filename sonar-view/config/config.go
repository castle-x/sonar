package config

import (
	"fmt"
	"time"

	"github.com/spf13/viper"
)

// Config sonar-view 配置
type Config struct {
	Addr        string        `yaml:"addr" json:"addr"`
	Store       StoreConfig   `yaml:"store" json:"store"`
	Aggregation AggConfig     `yaml:"aggregation" json:"aggregation"`
	TSDB        TSDBConfig    `yaml:"tsdb" json:"tsdb"`
	// MongoDB 已被 SQLite 替代，保留结构体供历史参考，enable 默认 false
	MongoDB MongoDBConfig `yaml:"mongodb" json:"mongodb"`
	SQLite  SQLiteConfig  `yaml:"sqlite" json:"sqlite"`
}

type StoreConfig struct {
	Addr  string `yaml:"addr" json:"addr"`
	AppID string `yaml:"app_id" json:"app_id"`
}

type AggConfig struct {
	Enabled        bool          `yaml:"enabled" json:"enabled"`
	CollectTimeout time.Duration `yaml:"collect_timeout" json:"collect_timeout"`
	QueryDelay     time.Duration `yaml:"query_delay" json:"query_delay"`
}

type TSDBConfig struct {
	DataDir            string        `yaml:"data_dir" json:"data_dir"`
	RetentionDays      int           `yaml:"retention_days" json:"retention_days"`
	WriteBufferSize    int           `yaml:"write_buffer_size" json:"write_buffer_size"`
	MaxChunkSize       int64         `yaml:"max_chunk_size" json:"max_chunk_size"`
	BlockDuration      time.Duration `yaml:"block_duration" json:"block_duration"`
	MaxBlockDuration   time.Duration `yaml:"max_block_duration" json:"max_block_duration"`
	CompactionInterval time.Duration `yaml:"compaction_interval" json:"compaction_interval"`
	CleanupInterval    time.Duration `yaml:"cleanup_interval" json:"cleanup_interval"`
}

type MongoDBConfig struct {
	URI    string `yaml:"uri" json:"uri"`
	DBName string `yaml:"db_name" json:"db_name"`
	Enable bool   `yaml:"enable" json:"enable"`
}

// SQLiteConfig SQLite 存储配置（替代 MongoDB 用于快照持久化）
type SQLiteConfig struct {
	Path   string `yaml:"path"`
	Enable bool   `yaml:"enable"`
}

// Load 从文件加载配置
func Load(path string) (*Config, error) {
	v := viper.New()
	v.SetConfigFile(path)
	v.SetConfigType("yaml")
	// defaults
	v.SetDefault("addr", ":8283")
	v.SetDefault("store.addr", "localhost:8082")
	v.SetDefault("store.app_id", "")
	v.SetDefault("aggregation.enabled", true)
	v.SetDefault("aggregation.collect_timeout", "12s")
	v.SetDefault("aggregation.query_delay", "40s")
	v.SetDefault("tsdb.data_dir", "data/tsdb")
	v.SetDefault("tsdb.retention_days", 7)
	v.SetDefault("tsdb.write_buffer_size", 512)
	v.SetDefault("tsdb.max_chunk_size", 536870912)
	v.SetDefault("tsdb.block_duration", "2h")
	v.SetDefault("tsdb.max_block_duration", "36h")
	v.SetDefault("tsdb.compaction_interval", "1h")
	v.SetDefault("tsdb.cleanup_interval", "10m")
	v.SetDefault("mongodb.uri", "mongodb://localhost:27017")
	v.SetDefault("mongodb.db_name", "sonar_view")
	v.SetDefault("mongodb.enable", false)
	v.SetDefault("sqlite.path", "./data/sonar-view.db")
	v.SetDefault("sqlite.enable", true)
	if err := v.ReadInConfig(); err != nil {
		// config file optional
		fmt.Printf("[WARN] config: read config file failed: %v, using defaults\n", err)
	}
	cfg := &Config{}
	if err := v.Unmarshal(cfg); err != nil {
		return nil, fmt.Errorf("unmarshal config failed: %w", err)
	}
	return cfg, nil
}

// DefaultConfig 返回默认配置
func DefaultConfig() *Config {
	return &Config{
		Addr: ":8283",
		Store: StoreConfig{
			Addr:  "localhost:8082",
			AppID: "",
		},
		Aggregation: AggConfig{
			Enabled:        true,
			CollectTimeout: 12 * time.Second,
			QueryDelay:     40 * time.Second,
		},
		TSDB: TSDBConfig{
			DataDir:            "data/tsdb",
			RetentionDays:      7,
			WriteBufferSize:    512,
			MaxChunkSize:       512 * 1024 * 1024,
			BlockDuration:      2 * time.Hour,
			MaxBlockDuration:   36 * time.Hour,
			CompactionInterval: 1 * time.Hour,
			CleanupInterval:    10 * time.Minute,
		},
		MongoDB: MongoDBConfig{
			URI:    "mongodb://localhost:27017",
			DBName: "sonar_view",
			Enable: false,
		},
		SQLite: SQLiteConfig{
			Path:   "./data/sonar-view.db",
			Enable: true,
		},
	}
}
