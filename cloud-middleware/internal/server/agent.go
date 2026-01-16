package server

import (
	"context"
	"errors"
	"time"

	"pc-remote-ctrl/cloud-middleware/internal/registry"
	cloudpb "pc-remote-ctrl/cloud-middleware/proto/cloud"
)

type AgentServer struct {
	cloudpb.UnimplementedAgentServiceServer
	reg         *registry.MemoryRegistry
	agentSecret string
}

func NewAgentServer(reg *registry.MemoryRegistry, secret string) *AgentServer {
	return &AgentServer{reg: reg, agentSecret: secret}
}

func (s *AgentServer) Register(ctx context.Context, req *cloudpb.RegisterRequest) (*cloudpb.RegisterResponse, error) {
	if s.agentSecret != "" && req.GetSecret() != s.agentSecret {
		return &cloudpb.RegisterResponse{Ok: false, Message: "unauthorized"}, nil
	}
	if req.GetDeviceId() == "" {
		return nil, errors.New("device_id required")
	}
	ttl := time.Duration(req.GetTtlSec()) * time.Second
	if ttl <= 0 {
		ttl = 60 * time.Second
	}
	s.reg.Upsert(req.GetDeviceId(), "", ttl, req.GetTags())
	return &cloudpb.RegisterResponse{Ok: true, Message: "ok"}, nil
}

func (s *AgentServer) Heartbeat(ctx context.Context, req *cloudpb.HeartbeatRequest) (*cloudpb.HeartbeatResponse, error) {
	ok := s.reg.Heartbeat(req.GetDeviceId(), 60*time.Second)
	return &cloudpb.HeartbeatResponse{Ok: ok}, nil
}
