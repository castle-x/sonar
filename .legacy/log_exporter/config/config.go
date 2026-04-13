package config

import (
	"fmt"
	"strings"

	"git.woa.com/castlexu/goutils/tools"
)

type ExtractType string

const (
	ExtractTypeDefault ExtractType = "default"
	ExtractTypeSplit ExtractType = "split"
	ExtractTypeRegex ExtractType = "regex"
)
// ReadMode 文件读取模式枚举
type ReadMode string

const (
	ReadModeTail ReadMode = "tail" // 从文件末尾开始读取
	ReadModeHead ReadMode = "head" // 从文件开头开始读取
)

// Encoding 文件编码格式枚举
type Encoding string

const (
	EncodingUTF8    Encoding = "utf-8"     // UTF-8编码
	EncodingGBK     Encoding = "gbk"       // GBK编码
	EncodingGB2312  Encoding = "gb2312"    // GB2312编码
	EncodingASCII   Encoding = "ascii"     // ASCII编码
	EncodingISO8859 Encoding = "iso8859-1" // ISO-8859-1编码
)

// Config 主配置结构体
type Config struct {
	// 日志配置列表
	Logconfig []LogConfig `yaml:"log_config" json:"log_config"`

	// 推送网关配置
	PushGateway PushGateway `yaml:"push_gateway,omitempty" json:"push_gateway,omitempty"`
}

type PushGateway struct {
	// 应用id
	AppId string `json:"app_id" yaml:"app_id"`
	// 是否开启推送
	Enabled bool   `json:"enabled" yaml:"enabled"`
	Host    string `json:"host" yaml:"host"`
	// 请求超时时间
	ReqTimeout int `json:"req_timeout" yaml:"req_timeout"`
	// 上报间隔
	ReportInterval int `json:"report_interval" yaml:"report_interval"`
	// 缓冲大小
	BufSize int `json:"buf_size" yaml:"buf_size"`
	// 是否打印指标日志
	PrintMetrics bool `json:"print_metrics" yaml:"print_metrics"`
	// 标签
	Labels map[string]string `json:"labels" yaml:"labels"`
	//
	ChannelSize int `json:"channel_size" yaml:"channel_size"`
}

// LogConfig 单个日志文件的配置
type LogConfig struct {
	// 配置名称，用于标识
	Name string `yaml:"name" json:"name"`

	// 日志文件路径或模式
	// 支持两种格式：
	// 1. 确切文件路径：/tmp/app.log
	// 2. 模式匹配：/tmp/*.log, /var/log/app-*.log
	FilePath string `yaml:"file_path" json:"file_path"`

	// 进程匹配规则
	Rules []Rule `yaml:"rules" json:"rules"`

	// 动态刷新间隔
	DynamicInterval int `yaml:"dynamic_interval" json:"dynamic_interval"`

	// 文件编码格式
	Encoding string `yaml:"encoding,omitempty" json:"encoding,omitempty" default:"utf-8"`

	// 是否启用
	Enabled bool `yaml:"enabled,omitempty" json:"enabled,omitempty" default:"true"`

	// 读取模式：tail（从末尾开始）、head（从开头开始）
	ReadMode string `yaml:"read_mode,omitempty" json:"read_mode,omitempty" default:"tail"`

	// 最大文件大小限制（MB）
	MaxFileSizeMB int64 `yaml:"max_file_size_mb,omitempty" json:"max_file_size_mb,omitempty" default:"1024"`

	// 文件监听配置
	WatchConfig WatchConfig `yaml:"watch,omitempty" json:"watch,omitempty"`

	// 指标配置
	Metrics []MetricConfig `yaml:"metrics,omitempty" json:"metrics,omitempty"`
}


type Rule struct {
	LogPathPattern string `json:"log_path_pattern" yaml:"log_path_pattern"`
	Name string `json:"name" yaml:"name"`
	Cmdlines []string `json:"cmdlines" yaml:"cmdlines"`
	Extracts []Extract `json:"extracts" yaml:"extracts"`
}

type Extract struct {
	Type ExtractType `json:"type" yaml:"type"`
	Sep string `json:"sep" yaml:"sep"`
	Labels map[string]string `json:"labels" yaml:"labels"`
	Pattern string `json:"pattern" yaml:"pattern"`
}
// MetricConfig 指标配置
type MetricConfig struct {
	// 指标名称
	Name string `yaml:"name,omitempty" json:"name,omitempty"`
	
	// 指标帮助
	Help string `yaml:"help,omitempty" json:"help,omitempty"`
	// 指标模式
	Pattern string `yaml:"pattern,omitempty" json:"pattern,omitempty"`
	// 指标是否启用
	Enabled bool `yaml:"enabled,omitempty" json:"enabled,omitempty"`

	// 指标采样密度
	Density int `yaml:"density,omitempty" json:"density,omitempty"`

	// 指标时间
	Timestamp string `yaml:"timestamp,omitempty" json:"timestamp,omitempty"` // 如果配置，则从正则中提取，否则使用当前时间

	// 时间格式化
	TimestampFormat string `yaml:"timestamp_format,omitempty" json:"timestamp_format,omitempty"`

	// 时区
	TimeZone string `yaml:"time_zone,omitempty" json:"time_zone,omitempty"`

	// 指标值
	Value string `yaml:"value,omitempty" json:"value,omitempty"`

	// 指标标签
	Labels map[string]string `yaml:"labels,omitempty" json:"labels,omitempty"`
	
	// 是否记录每分钟出现次数,作为新指标上传打点，每分钟打一个
	IsRecordMinuteCount bool `yaml:"is_record_minute_count,omitempty" json:"is_record_minute_count,omitempty"`
}

// WatchConfig 文件监听配置
type WatchConfig struct {
	// 监听间隔
	PollInterval string `yaml:"poll_interval,omitempty" json:"poll_interval,omitempty" default:"1s"`

	// 是否使用inotify（Linux）
	UseInotify bool `yaml:"use_inotify,omitempty" json:"use_inotify,omitempty" default:"true"`

	// 文件轮转检测间隔
	RotateCheckInterval string `yaml:"rotate_check_interval,omitempty" json:"rotate_check_interval,omitempty" default:"10s"`

	// 最大重试次数
	MaxRetries int `yaml:"max_retries,omitempty" json:"max_retries,omitempty" default:"3"`
}

// LoadConfig 加载配置文件
func LoadConfig(filepath string) (*Config, error) {
	config := &Config{}
	if err := tools.LoadYaml(filepath, config); err != nil {
		return nil, fmt.Errorf("failed to load config file %s: %w", filepath, err)
	}
	return config, nil
}

// IsPatternPath 检测路径是否为模式匹配
// 包含通配符 * 或 ? 的路径被认为是模式匹配
func IsPatternPath(path string) bool {
	return strings.Contains(path, "*") || strings.Contains(path, "?")
}

// GetFilePath 获取文件路径（兼容旧版本）
func (lc *LogConfig) GetFilePath() string {
	return lc.FilePath
}

// IsPattern 检测当前配置是否为模式匹配
func (lc *LogConfig) IsPattern() bool {
	return IsPatternPath(lc.FilePath)
}
