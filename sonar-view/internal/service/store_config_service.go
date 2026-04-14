package service

import (
	"context"
	"time"

	"github.com/google/uuid"
	"sonar-view/internal/repo"
)

// StoreConfigService store 配置管理服务
type StoreConfigService struct {
	repo *repo.StoreConfigRepo
}

func NewStoreConfigService(r *repo.StoreConfigRepo) *StoreConfigService {
	return &StoreConfigService{repo: r}
}

func (s *StoreConfigService) List(ctx context.Context) ([]*repo.StoreConfig, error) {
	return s.repo.List(ctx)
}

func (s *StoreConfigService) Create(ctx context.Context, name, addr, desc string) (*repo.StoreConfig, error) {
	cfg := &repo.StoreConfig{
		ID:          uuid.NewString(),
		Name:        name,
		Addr:        addr,
		Description: desc,
		CreatedAt:   time.Now().UnixMilli(),
		UpdatedAt:   time.Now().UnixMilli(),
	}
	created, err := s.repo.Create(ctx, cfg)
	if err != nil {
		return nil, err
	}
	return created, nil
}

func (s *StoreConfigService) Update(ctx context.Context, id, name, addr, desc string) error {
	cfg, err := s.repo.Get(ctx, id)
	if err != nil {
		return err
	}
	if name != "" {
		cfg.Name = name
	}
	if addr != "" {
		cfg.Addr = addr
	}
	if desc != "" {
		cfg.Description = desc
	}
	cfg.UpdatedAt = time.Now().UnixMilli()
	_, err = s.repo.Update(ctx, cfg)
	return err
}

func (s *StoreConfigService) Delete(ctx context.Context, id string) error {
	return s.repo.Delete(ctx, id)
}
