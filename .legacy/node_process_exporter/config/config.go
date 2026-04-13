package config

import (
	"git.woa.com/castlexu/goutils/tools"
	"fmt"
	"path/filepath"
)

type ExtractType string

const (
	ExtractTypeDefault ExtractType = "default"
	ExtractTypeSplit ExtractType = "split"
	ExtractTypeRegex ExtractType = "regex"
)

type Config struct {
	// 
	Step int `json:"step" yaml:"step"`
	// 推送网关
	PushGateway PushGateway `json:"push_gateway" yaml:"push_gateway"`
	// 进程监控
	ProcessExporter ProcessExporter `json:"process_exporter" yaml:"process_exporter"`
	// node监控
	NodeExporter NodeExporter `json:"node_exporter" yaml:"node_exporter"`
}

type PushGateway struct {
	// 应用id
	AppId string `json:"app_id" yaml:"app_id"`
	// 是否开启推送
	Enabled bool `json:"enabled" yaml:"enabled"`
	Host string `json:"host" yaml:"host"`
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
	// 通道大小
	ChannelSize int `json:"channel_size" yaml:"channel_size"`
}

type ProcessExporter struct {
	Enabled bool `json:"enabled" yaml:"enabled"`
	DynamicInterval int `json:"dynamic_interval" yaml:"dynamic_interval"` // 动态刷新间隔 0代表不开启
	Rules []Rule `json:"rules" yaml:"rules"`
}

type Rule struct {
	Pid int `json:"pid" yaml:"pid"`
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

type NodeExporter struct {
	// 是否开启node监控
	Enabled bool `json:"enabled" yaml:"enabled"`
	// 直接固定的额外标签
	Labels map[string]string `json:"labels" yaml:"labels"`
}

func InitConfig(caseFile string) *Config {
	conf := &Config{}
	if filepath.Ext(caseFile) == ".json" {
		if err := tools.LoadJson(caseFile, conf); err != nil {
			panic(fmt.Sprintf("load json config failed, %v", err))
		}
	} else if filepath.Ext(caseFile) == ".yaml" {
		if err := tools.LoadYaml(caseFile, conf); err != nil {
			panic(fmt.Sprintf("load yaml config failed, %v", err))
		}
	}
	return conf
}