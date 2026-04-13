// Package configstore 提供配置管理和热更新支持。
// 通过 Subscribe() 获取变更通知 channel，各子系统可订阅配置变更。
package configstore

import (
	"exporter/config"
	"os"
	"path/filepath"
	"sync"

	"git.woa.com/castlexu/goutils/ablog"
	"git.woa.com/castlexu/goutils/tools"
	"gopkg.in/yaml.v3"
)

var logger = ablog.NewLogger("configstore")

// Store 配置存储，支持热更新和变更通知
type Store struct {
	mu          sync.RWMutex
	current     *config.Config
	configFile  string
	subscribers []chan *config.Config
}

// New 创建配置存储并从文件加载初始配置
func New(configFile string) (*Store, error) {
	cfg, err := config.LoadConfig(configFile)
	if err != nil {
		return nil, err
	}
	return &Store{
		current:    cfg,
		configFile: configFile,
	}, nil
}

// Get 获取当前配置（只读，线程安全）
func (s *Store) Get() *config.Config {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.current
}

// GetConfigFile 返回配置文件路径
func (s *Store) GetConfigFile() string {
	return s.configFile
}

// Subscribe 订阅配置变更通知。
// 返回一个 buffered channel，每当配置热更新成功，新配置会被发送到此 channel。
// 调用方应持续从 channel 消费，防止阻塞。
func (s *Store) Subscribe() <-chan *config.Config {
	ch := make(chan *config.Config, 1)
	s.mu.Lock()
	s.subscribers = append(s.subscribers, ch)
	s.mu.Unlock()
	return ch
}

// Update 用新配置替换当前配置，并通知所有订阅者（不写盘）
func (s *Store) Update(newCfg *config.Config) {
	s.mu.Lock()
	s.current = newCfg
	subs := make([]chan *config.Config, len(s.subscribers))
	copy(subs, s.subscribers)
	s.mu.Unlock()

	logger.Info("config updated in-memory, notifying %d subscriber(s)", len(subs))
	s.notify(subs, newCfg)
}

// Save 将当前内存配置持久化写回配置文件（yaml 格式）
func (s *Store) Save() error {
	s.mu.RLock()
	cfg := s.current
	s.mu.RUnlock()

	data, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}
	return os.WriteFile(s.configFile, data, 0644)
}

// UpdateAndSave 更新内存配置 + 写盘 + 通知订阅者（对应 PUT /config）
func (s *Store) UpdateAndSave(newCfg *config.Config) error {
	// 先写盘，确保磁盘持久化成功再更新内存
	data, err := yaml.Marshal(newCfg)
	if err != nil {
		return err
	}
	if err := os.WriteFile(s.configFile, data, 0644); err != nil {
		return err
	}

	s.mu.Lock()
	s.current = newCfg
	subs := make([]chan *config.Config, len(s.subscribers))
	copy(subs, s.subscribers)
	s.mu.Unlock()

	logger.Info("config saved to %s, notifying %d subscriber(s)", s.configFile, len(subs))
	s.notify(subs, newCfg)
	return nil
}

// Reload 从文件重新加载配置并通知所有订阅者
func (s *Store) Reload() error {
	newCfg := &config.Config{}
	ext := filepath.Ext(s.configFile)
	switch ext {
	case ".json":
		if err := tools.LoadJson(s.configFile, newCfg); err != nil {
			return err
		}
	default:
		if err := tools.LoadYaml(s.configFile, newCfg); err != nil {
			return err
		}
	}

	s.mu.Lock()
	s.current = newCfg
	subs := make([]chan *config.Config, len(s.subscribers))
	copy(subs, s.subscribers)
	s.mu.Unlock()

	logger.Info("config reloaded from %s, notifying %d subscriber(s)", s.configFile, len(subs))
	s.notify(subs, newCfg)
	return nil
}

// notify 向所有订阅者发送新配置（非阻塞）
func (s *Store) notify(subs []chan *config.Config, cfg *config.Config) {
	for _, ch := range subs {
		select {
		case ch <- cfg:
		default:
			// 丢弃旧通知，放入最新配置
			select {
			case <-ch:
			default:
			}
			ch <- cfg
		}
	}
}
