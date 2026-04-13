package config

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/castle-x/goutils/tools"
)

// ExtractType 标签提取方式
type ExtractType string

const (
	ExtractTypeDefault ExtractType = "default"
	ExtractTypeSplit   ExtractType = "split"
	ExtractTypeRegex   ExtractType = "regex"
)

// ReadMode 文件读取模式
type ReadMode string

const (
	ReadModeTail ReadMode = "tail" // 从文件末尾开始读取
	ReadModeHead ReadMode = "head" // 从文件开头开始读取
)

// Config 统一配置
type Config struct {
	// 采集间隔（秒）
	Step int `json:"step" yaml:"step"`
	// Sonar Store 上报配置
	SonarStore SonarStore `json:"sonar_store" yaml:"sonar_store"`
	// 进程监控配置
	ProcessExporter ProcessExporter `json:"process_exporter" yaml:"process_exporter"`
	// 节点监控配置
	NodeExporter NodeExporter `json:"node_exporter" yaml:"node_exporter"`
	// 日志监控配置
	LogConfig []LogConfig `json:"log_config" yaml:"log_config"`
}

// SonarStore sonar-store 上报配置
type SonarStore struct {
	// 应用ID
	AppId string `json:"app_id" yaml:"app_id"`
	// 是否开启上报
	Enabled bool `json:"enabled" yaml:"enabled"`
	// sonar-store 地址
	Host string `json:"host" yaml:"host"`
	// 请求超时时间（秒）
	ReqTimeout int `json:"req_timeout" yaml:"req_timeout"`
	// 上报间隔（秒）
	ReportInterval int `json:"report_interval" yaml:"report_interval"`
	// 缓冲大小
	BufSize int `json:"buf_size" yaml:"buf_size"`
	// 是否打印指标日志
	PrintMetrics bool `json:"print_metrics" yaml:"print_metrics"`
	// 全局标签
	Labels map[string]string `json:"labels" yaml:"labels"`
	// 通道大小
	ChannelSize int `json:"channel_size" yaml:"channel_size"`
}

// ProcessExporter 进程监控配置
type ProcessExporter struct {
	// 是否开启进程监控
	Enabled bool `json:"enabled" yaml:"enabled"`
	// 动态刷新间隔（秒），0 代表不开启
	DynamicInterval int `json:"dynamic_interval" yaml:"dynamic_interval"`
	// 进程匹配规则
	Rules []Rule `json:"rules" yaml:"rules"`
}

// NodeExporter 节点监控配置
type NodeExporter struct {
	// 是否开启节点监控
	Enabled bool `json:"enabled" yaml:"enabled"`
	// 直接固定的额外标签
	Labels map[string]string `json:"labels" yaml:"labels"`
}

// Rule 进程匹配规则
type Rule struct {
	// 直接指定PID（可选）
	Pid int `json:"pid" yaml:"pid"`
	// 进程名称
	Name string `json:"name" yaml:"name"`
	// 命令行过滤条件（!前缀代表反选）
	Cmdlines []string `json:"cmdlines" yaml:"cmdlines"`
	// 从命令行中提取日志路径的正则表达式（log_exporter专用）
	LogPathPattern string `json:"log_path_pattern" yaml:"log_path_pattern"`
	// 标签提取规则
	Extracts []Extract `json:"extracts" yaml:"extracts"`
}

// Extract 标签提取配置
type Extract struct {
	// 提取类型：default/split/regex
	Type ExtractType `json:"type" yaml:"type"`
	// 分隔符（split模式）
	Sep string `json:"sep" yaml:"sep"`
	// 正则表达式（regex模式）
	Pattern string `json:"pattern" yaml:"pattern"`
	// 标签映射
	Labels map[string]string `json:"labels" yaml:"labels"`
}

// LogConfig 日志监控配置
type LogConfig struct {
	// 配置名称
	Name string `json:"name" yaml:"name"`
	// 日志文件路径或模式
	FilePath string `json:"file_path" yaml:"file_path"`
	// 进程匹配规则（通过进程动态获取日志路径）
	Rules []Rule `json:"rules" yaml:"rules"`
	// 动态刷新进程列表间隔（秒）
	DynamicInterval int `json:"dynamic_interval" yaml:"dynamic_interval"`
	// 文件编码
	Encoding string `json:"encoding" yaml:"encoding"`
	// 是否启用
	Enabled bool `json:"enabled" yaml:"enabled"`
	// 读取模式：tail/head
	ReadMode string `json:"read_mode" yaml:"read_mode"`
	// 最大文件大小限制（MB）
	MaxFileSizeMB int64 `json:"max_file_size_mb" yaml:"max_file_size_mb"`
	// 时区
	TimeZone string `json:"time_zone" yaml:"time_zone"`
	// 文件监听配置
	WatchConfig WatchConfig `json:"watch" yaml:"watch"`
	// 指标配置列表
	Metrics []MetricConfig `json:"metrics" yaml:"metrics"`
}

// IsPattern 检测当前配置是否为模式匹配
func (lc *LogConfig) IsPattern() bool {
	return strings.Contains(lc.FilePath, "*") || strings.Contains(lc.FilePath, "?")
}

// WatchConfig 文件监听配置
type WatchConfig struct {
	// 轮询间隔
	PollInterval string `json:"poll_interval" yaml:"poll_interval"`
	// 是否使用 inotify
	UseInotify bool `json:"use_inotify" yaml:"use_inotify"`
	// 文件轮转检测间隔
	RotateCheckInterval string `json:"rotate_check_interval" yaml:"rotate_check_interval"`
	// 最大重试次数
	MaxRetries int `json:"max_retries" yaml:"max_retries"`
}

// MetricConfig 指标配置
type MetricConfig struct {
	// 指标名称
	Name string `json:"name" yaml:"name"`
	// 指标说明
	Help string `json:"help" yaml:"help"`
	// 匹配正则
	Pattern string `json:"pattern" yaml:"pattern"`
	// 是否启用
	Enabled bool `json:"enabled" yaml:"enabled"`
	// 采样密度（秒），0代表不限制
	Density int `json:"density" yaml:"density"`
	// 时间戳字段索引，如 "$1"
	Timestamp string `json:"timestamp" yaml:"timestamp"`
	// 时间戳格式
	TimestampFormat string `json:"timestamp_format" yaml:"timestamp_format"`
	// 时区
	TimeZone string `json:"time_zone" yaml:"time_zone"`
	// 值字段索引，如 "$2"
	Value string `json:"value" yaml:"value"`
	// 额外标签映射
	Labels map[string]string `json:"labels" yaml:"labels"`
	// 是否记录每分钟出现次数
	IsRecordMinuteCount bool `json:"is_record_minute_count" yaml:"is_record_minute_count"`
}

// LoadConfig 加载配置文件（支持 yaml/json）
func LoadConfig(configFile string) (*Config, error) {
	conf := &Config{}
	ext := filepath.Ext(configFile)
	switch ext {
	case ".json":
		if err := tools.LoadJson(configFile, conf); err != nil {
			return nil, fmt.Errorf("load json config failed: %w", err)
		}
	case ".yaml", ".yml":
		if err := tools.LoadYaml(configFile, conf); err != nil {
			return nil, fmt.Errorf("load yaml config failed: %w", err)
		}
	default:
		return nil, fmt.Errorf("unsupported config file format: %s", ext)
	}
	return conf, nil
}
