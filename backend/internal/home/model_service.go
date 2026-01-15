package home

import (
	"context"
	"fmt"
	"strings"
	"time"

	"pc-remote-ctrl/backend/internal/storage"
	homepb "pc-remote-ctrl/backend/proto/home"
)

type DeviceModelService struct {
	homepb.UnimplementedDeviceModelServiceServer
	models *storage.DeviceModels
	audit  *storage.AuditLogs
}

func NewDeviceModelService(models *storage.DeviceModels, audit *storage.AuditLogs) *DeviceModelService {
	return &DeviceModelService{models: models, audit: audit}
}

func (s *DeviceModelService) ListDeviceModels(ctx context.Context, req *homepb.ListDeviceModelsRequest) (*homepb.ListDeviceModelsResponse, error) {
	items, err := s.models.List(storage.ListDeviceModelsOptions{
		ID:           req.GetId(),
		NameContains: req.GetNameContains(),
		Limit:        200,
	})
	if err != nil {
		return nil, fmt.Errorf("list device models: %w", err)
	}
	out := make([]*homepb.DeviceModel, 0, len(items))
	for _, it := range items {
		out = append(out, toPBDeviceModel(it))
	}
	return &homepb.ListDeviceModelsResponse{Models: out}, nil
}

func (s *DeviceModelService) GetDeviceModel(ctx context.Context, req *homepb.GetDeviceModelRequest) (*homepb.GetDeviceModelResponse, error) {
	if req.GetId() == "" || req.GetVersion() == "" {
		return nil, fmt.Errorf("id and version required")
	}
	model := s.models.Get(req.GetId(), req.GetVersion())
	if model == nil {
		return &homepb.GetDeviceModelResponse{}, nil
	}
	return &homepb.GetDeviceModelResponse{Model: toPBDeviceModel(*model)}, nil
}

func (s *DeviceModelService) CreateDeviceModel(ctx context.Context, req *homepb.CreateDeviceModelRequest) (*homepb.CreateDeviceModelResponse, error) {
	if req.GetModel() == nil {
		return &homepb.CreateDeviceModelResponse{Ok: false, Message: "model required"}, nil
	}
	model, err := fromPBDeviceModelSpec(req.GetModel())
	if err != nil {
		return &homepb.CreateDeviceModelResponse{Ok: false, Message: err.Error()}, nil
	}
	if existing := s.models.Get(model.ID, model.Version); existing != nil {
		return &homepb.CreateDeviceModelResponse{Ok: false, Message: "model already exists"}, nil
	}
	model.UpdatedAt = time.Now().UnixMilli()
	if err := s.models.Upsert(*model); err != nil {
		return &homepb.CreateDeviceModelResponse{Ok: false, Message: err.Error()}, nil
	}
	s.logAudit("model_create", model.ID+":"+model.Version, map[string]any{"name": model.Name})
	return &homepb.CreateDeviceModelResponse{Ok: true, Message: "ok"}, nil
}

func (s *DeviceModelService) UpdateDeviceModel(ctx context.Context, req *homepb.UpdateDeviceModelRequest) (*homepb.UpdateDeviceModelResponse, error) {
	if req.GetModel() == nil {
		return &homepb.UpdateDeviceModelResponse{Ok: false, Message: "model required"}, nil
	}
	model, err := fromPBDeviceModelSpec(req.GetModel())
	if err != nil {
		return &homepb.UpdateDeviceModelResponse{Ok: false, Message: err.Error()}, nil
	}
	if existing := s.models.Get(model.ID, model.Version); existing == nil {
		return &homepb.UpdateDeviceModelResponse{Ok: false, Message: "model not found"}, nil
	}
	model.UpdatedAt = time.Now().UnixMilli()
	if err := s.models.Upsert(*model); err != nil {
		return &homepb.UpdateDeviceModelResponse{Ok: false, Message: err.Error()}, nil
	}
	s.logAudit("model_update", model.ID+":"+model.Version, map[string]any{"name": model.Name})
	return &homepb.UpdateDeviceModelResponse{Ok: true, Message: "ok"}, nil
}

func (s *DeviceModelService) DeleteDeviceModel(ctx context.Context, req *homepb.DeleteDeviceModelRequest) (*homepb.DeleteDeviceModelResponse, error) {
	if req.GetId() == "" || req.GetVersion() == "" {
		return &homepb.DeleteDeviceModelResponse{Ok: false, Message: "id and version required"}, nil
	}
	if err := s.models.Remove(req.GetId(), req.GetVersion()); err != nil {
		return &homepb.DeleteDeviceModelResponse{Ok: false, Message: err.Error()}, nil
	}
	s.logAudit("model_delete", req.GetId()+":"+req.GetVersion(), nil)
	return &homepb.DeleteDeviceModelResponse{Ok: true, Message: "ok"}, nil
}

func fromPBDeviceModelSpec(m *homepb.DeviceModelSpec) (*storage.DeviceModel, error) {
	id := strings.TrimSpace(m.GetId())
	version := strings.TrimSpace(m.GetVersion())
	if id == "" || version == "" {
		return nil, fmt.Errorf("id and version required")
	}
	name := strings.TrimSpace(m.GetName())
	if name == "" {
		return nil, fmt.Errorf("name required")
	}
	out := &storage.DeviceModel{
		ID:          id,
		Version:     version,
		Name:        name,
		Description: strings.TrimSpace(m.GetDescription()),
		Tags:        m.GetTags(),
		StateSchema: map[string]string{},
	}
	for k, v := range m.GetStateSchema() {
		out.StateSchema[k] = v
	}
	for _, a := range m.GetActions() {
		out.Actions = append(out.Actions, storage.ActionSpec{
			Name:       a.GetName(),
			ArgsSchema: mapStringAnyFromString(a.GetArgsSchema()),
			TimeoutMS:  int(a.GetTimeoutMs()),
		})
	}
	return out, nil
}

func toPBDeviceModel(m storage.DeviceModel) *homepb.DeviceModel {
	acts := make([]*homepb.ActionSpec, 0, len(m.Actions))
	for _, a := range m.Actions {
		acts = append(acts, &homepb.ActionSpec{
			Name:       a.Name,
			ArgsSchema: mapStringString(a.ArgsSchema),
			TimeoutMs:  int32(a.TimeoutMS),
		})
	}
	stateSchema := map[string]string{}
	for k, v := range m.StateSchema {
		stateSchema[k] = v
	}
	return &homepb.DeviceModel{
		Id:          m.ID,
		Version:     m.Version,
		Name:        m.Name,
		Description: m.Description,
		Tags:        m.Tags,
		Actions:     acts,
		StateSchema: stateSchema,
		UpdatedAt:   m.UpdatedAt,
	}
}

func (s *DeviceModelService) logAudit(kind, subject string, data map[string]any) {
	if s.audit == nil {
		return
	}
	_ = s.audit.Append(storage.AuditEntry{Kind: kind, Subject: subject, Data: data})
}
