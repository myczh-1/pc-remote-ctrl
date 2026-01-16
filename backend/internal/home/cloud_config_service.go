package home

import (
	"context"
	"fmt"
	"strings"
	"time"

	cloudmgr "pc-remote-ctrl/backend/internal/cloud"
	"pc-remote-ctrl/backend/internal/storage"
	homepb "pc-remote-ctrl/backend/proto/home"
)

const defaultTunnelTimeoutMS = 8000

type CloudConfigService struct {
	homepb.UnimplementedCloudConfigServiceServer
	store   *storage.CloudConfigs
	manager *cloudmgr.Manager
}

func NewCloudConfigService(store *storage.CloudConfigs, manager *cloudmgr.Manager) *CloudConfigService {
	return &CloudConfigService{store: store, manager: manager}
}

func (s *CloudConfigService) ListCloudConfigs(ctx context.Context, req *homepb.ListCloudConfigsRequest) (*homepb.ListCloudConfigsResponse, error) {
	items, err := s.store.List()
	if err != nil {
		return nil, fmt.Errorf("list cloud configs: %w", err)
	}
	out := make([]*homepb.CloudConfig, 0, len(items))
	for _, it := range items {
		out = append(out, toPBCloudConfig(it))
	}
	return &homepb.ListCloudConfigsResponse{Configs: out}, nil
}

func (s *CloudConfigService) UpsertCloudConfig(ctx context.Context, req *homepb.UpsertCloudConfigRequest) (*homepb.UpsertCloudConfigResponse, error) {
	if req.GetConfig() == nil {
		return &homepb.UpsertCloudConfigResponse{Ok: false, Message: "config required"}, nil
	}
	cfg := req.GetConfig()
	id := cfg.GetId()
	if strings.TrimSpace(id) == "" {
		nid, err := generateID()
		if err != nil {
			return &homepb.UpsertCloudConfigResponse{Ok: false, Message: "id generate failed"}, nil
		}
		cfg.Id = nid
		id = nid
	}
	st, err := fromPBCloudConfig(cfg)
	if err != nil {
		return &homepb.UpsertCloudConfigResponse{Ok: false, Message: err.Error()}, nil
	}
	if err := validateCloudConfig(*st); err != nil {
		return &homepb.UpsertCloudConfigResponse{Ok: false, Message: err.Error()}, nil
	}
	existing, err := s.store.Get(id)
	if err != nil {
		return &homepb.UpsertCloudConfigResponse{Ok: false, Message: err.Error()}, nil
	}
	if existing != nil {
		st.Active = existing.Active
	}
	st.UpdatedAt = time.Now().UnixMilli()
	if err := s.store.Upsert(*st); err != nil {
		return &homepb.UpsertCloudConfigResponse{Ok: false, Message: err.Error()}, nil
	}
	if existing != nil && existing.Active {
		rt := &cloudmgr.RuntimeConfig{
			CloudAddr:               st.CloudAddr,
			AgentDeviceID:           st.AgentDeviceID,
			AgentSecret:             st.AgentSecret,
			AgentTunnelUnaryTimeout: time.Duration(normalizeTimeout(st.AgentTunnelUnaryTimeoutMS)) * time.Millisecond,
		}
		s.manager.Apply(rt)
	}
	return &homepb.UpsertCloudConfigResponse{Ok: true, Message: "ok", ConfigId: id}, nil
}

func (s *CloudConfigService) DeleteCloudConfig(ctx context.Context, req *homepb.DeleteCloudConfigRequest) (*homepb.DeleteCloudConfigResponse, error) {
	id := req.GetConfigId()
	if strings.TrimSpace(id) == "" {
		return &homepb.DeleteCloudConfigResponse{Ok: false, Message: "config_id required"}, nil
	}
	active, _ := s.store.GetActive()
	wasActive := active != nil && active.ID == id
	if err := s.store.Remove(id); err != nil {
		return &homepb.DeleteCloudConfigResponse{Ok: false, Message: err.Error()}, nil
	}
	if wasActive {
		s.manager.Apply(nil)
	}
	return &homepb.DeleteCloudConfigResponse{Ok: true, Message: "ok"}, nil
}

func (s *CloudConfigService) ApplyCloudConfig(ctx context.Context, req *homepb.ApplyCloudConfigRequest) (*homepb.ApplyCloudConfigResponse, error) {
	id := strings.TrimSpace(req.GetConfigId())
	if err := s.store.SetActive(id); err != nil {
		return &homepb.ApplyCloudConfigResponse{Ok: false, Message: err.Error()}, nil
	}
	if id == "" {
		s.manager.Apply(nil)
		return &homepb.ApplyCloudConfigResponse{Ok: true, Message: "ok"}, nil
	}
	cfg, err := s.store.GetActive()
	if err != nil {
		return &homepb.ApplyCloudConfigResponse{Ok: false, Message: err.Error()}, nil
	}
	if cfg == nil {
		s.manager.Apply(nil)
		return &homepb.ApplyCloudConfigResponse{Ok: true, Message: "ok"}, nil
	}
	rt := &cloudmgr.RuntimeConfig{
		CloudAddr:               cfg.CloudAddr,
		AgentDeviceID:           cfg.AgentDeviceID,
		AgentSecret:             cfg.AgentSecret,
		HomeGRPCAddr:            cfg.HomeGRPCAddr,
		AgentTunnelUnaryTimeout: time.Duration(normalizeTimeout(cfg.AgentTunnelUnaryTimeoutMS)) * time.Millisecond,
	}
	s.manager.Apply(rt)
	return &homepb.ApplyCloudConfigResponse{Ok: true, Message: "ok"}, nil
}

func toPBCloudConfig(cfg storage.CloudConfig) *homepb.CloudConfig {
	return &homepb.CloudConfig{
		Id:                        cfg.ID,
		Name:                      cfg.Name,
		CloudAddr:                 cfg.CloudAddr,
		AgentDeviceId:             cfg.AgentDeviceID,
		AgentSecret:               cfg.AgentSecret,
		AgentTunnelUnaryTimeoutMs: int32(cfg.AgentTunnelUnaryTimeoutMS),
		Active:                    cfg.Active,
		UpdatedAt:                 cfg.UpdatedAt,
	}
}

func fromPBCloudConfig(cfg *homepb.CloudConfig) (*storage.CloudConfig, error) {
	return &storage.CloudConfig{
		ID:                        cfg.GetId(),
		Name:                      strings.TrimSpace(cfg.GetName()),
		CloudAddr:                 strings.TrimSpace(cfg.GetCloudAddr()),
		AgentDeviceID:             strings.TrimSpace(cfg.GetAgentDeviceId()),
		AgentSecret:               strings.TrimSpace(cfg.GetAgentSecret()),
		AgentTunnelUnaryTimeoutMS: normalizeTimeout(int(cfg.GetAgentTunnelUnaryTimeoutMs())),
		Active:                    cfg.GetActive(),
		UpdatedAt:                 cfg.GetUpdatedAt(),
	}, nil
}

func normalizeTimeout(val int) int {
	if val <= 0 {
		return defaultTunnelTimeoutMS
	}
	return val
}

func validateCloudConfig(cfg storage.CloudConfig) error {
	if strings.TrimSpace(cfg.Name) == "" {
		return fmt.Errorf("name required")
	}
	if strings.TrimSpace(cfg.CloudAddr) == "" {
		return fmt.Errorf("cloud_addr required")
	}
	if strings.TrimSpace(cfg.AgentDeviceID) == "" {
		return fmt.Errorf("agent_device_id required")
	}
	return nil
}
