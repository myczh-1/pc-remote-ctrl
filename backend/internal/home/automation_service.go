package home

import (
	"context"
	"fmt"
	"strings"
	"time"

	"pc-remote-ctrl/backend/internal/storage"
	homepb "pc-remote-ctrl/backend/proto/home"

	"google.golang.org/protobuf/types/known/structpb"
)

// AutomationService manages automation definitions via gRPC.
type AutomationService struct {
	homepb.UnimplementedAutomationServiceServer
	autos  *storage.Automations
	audit  *storage.AuditLogs
	engine *AutomationEngine
}

func NewAutomationService(autos *storage.Automations, audit *storage.AuditLogs, engine *AutomationEngine) *AutomationService {
	return &AutomationService{autos: autos, audit: audit, engine: engine}
}

func (s *AutomationService) ListAutomations(ctx context.Context, req *homepb.ListAutomationsRequest) (*homepb.ListAutomationsResponse, error) {
	items, next, err := s.autos.List(storage.ListAutomationsOptions{
		IncludeDisabled: req.GetIncludeDisabled(),
		PageSize:        int(req.GetPageSize()),
		PageToken:       req.GetPageToken(),
		Tag:             req.GetTag(),
		NameContains:    req.GetNameContains(),
	})
	if err != nil {
		return nil, fmt.Errorf("list automations: %w", err)
	}
	out := make([]*homepb.Automation, 0, len(items))
	for _, it := range items {
		out = append(out, toPBAutomation(it))
	}
	return &homepb.ListAutomationsResponse{Automations: out, NextPageToken: next}, nil
}

func (s *AutomationService) UpsertAutomation(ctx context.Context, req *homepb.UpsertAutomationRequest) (*homepb.UpsertAutomationResponse, error) {
	if req.GetAutomation() == nil {
		return &homepb.UpsertAutomationResponse{Ok: false, Message: "automation required"}, nil
	}
	auto := req.GetAutomation()
	id := auto.GetId()
	created := false
	if id == "" {
		nid, err := generateID()
		if err != nil {
			return &homepb.UpsertAutomationResponse{Ok: false, Message: "id generate failed"}, nil
		}
		auto.Id = nid
		id = nid
		created = true
	}
	stAuto, err := fromPBAutomation(auto)
	if err != nil {
		return &homepb.UpsertAutomationResponse{Ok: false, Message: err.Error()}, nil
	}
	if err := validateAutomation(*stAuto); err != nil {
		return &homepb.UpsertAutomationResponse{Ok: false, Message: err.Error()}, nil
	}
	stAuto.UpdatedAt = time.Now().UnixMilli()
	if err := s.autos.Upsert(*stAuto); err != nil {
		return &homepb.UpsertAutomationResponse{Ok: false, Message: err.Error()}, nil
	}
	_ = s.reloadEngine()
	s.logAudit("automation_upsert", id, map[string]any{
		"name":    stAuto.Name,
		"enabled": stAuto.Enabled,
		"created": created,
	})
	return &homepb.UpsertAutomationResponse{Ok: true, Message: "ok", AutomationId: id}, nil
}

func (s *AutomationService) DeleteAutomation(ctx context.Context, req *homepb.DeleteAutomationRequest) (*homepb.DeleteAutomationResponse, error) {
	if req.GetAutomationId() == "" {
		return &homepb.DeleteAutomationResponse{Ok: false, Message: "automation_id required"}, nil
	}
	if err := s.autos.Remove(req.GetAutomationId()); err != nil {
		return &homepb.DeleteAutomationResponse{Ok: false, Message: err.Error()}, nil
	}
	_ = s.reloadEngine()
	s.logAudit("automation_delete", req.GetAutomationId(), nil)
	return &homepb.DeleteAutomationResponse{Ok: true, Message: "ok"}, nil
}

func (s *AutomationService) SetAutomationEnabled(ctx context.Context, req *homepb.SetAutomationEnabledRequest) (*homepb.SetAutomationEnabledResponse, error) {
	if req.GetAutomationId() == "" {
		return &homepb.SetAutomationEnabledResponse{Ok: false, Message: "automation_id required"}, nil
	}
	if err := s.autos.SetEnabled(req.GetAutomationId(), req.GetEnabled()); err != nil {
		return &homepb.SetAutomationEnabledResponse{Ok: false, Message: err.Error()}, nil
	}
	_ = s.reloadEngine()
	s.logAudit("automation_enable", req.GetAutomationId(), map[string]any{"enabled": req.GetEnabled()})
	return &homepb.SetAutomationEnabledResponse{Ok: true, Message: "ok"}, nil
}

func (s *AutomationService) TriggerAutomation(ctx context.Context, req *homepb.TriggerAutomationRequest) (*homepb.TriggerAutomationResponse, error) {
	if req.GetAutomationId() == "" {
		return &homepb.TriggerAutomationResponse{Ok: false, Message: "automation_id required"}, nil
	}
	payload := mapFromStruct(req.GetPayload())
	if s.engine == nil {
		return &homepb.TriggerAutomationResponse{Ok: false, Message: "engine not available"}, nil
	}
	if err := s.engine.TriggerNow(ctx, req.GetAutomationId(), payload); err != nil {
		return &homepb.TriggerAutomationResponse{Ok: false, Message: err.Error()}, nil
	}
	s.logAudit("automation_manual_trigger", req.GetAutomationId(), payload)
	return &homepb.TriggerAutomationResponse{Ok: true, Message: "ok"}, nil
}

func fromPBAutomation(a *homepb.Automation) (*storage.Automation, error) {
	st := &storage.Automation{
		ID:      a.GetId(),
		Name:    a.GetName(),
		Tags:    a.GetTags(),
		Enabled: a.GetEnabled(),
	}
	if a.GetWhen() != nil {
		st.When = mapStringAny(a.GetWhen().AsMap())
	}
	for _, act := range a.GetThen() {
		stAct := storage.AutomationAction{
			DeviceID: act.GetDeviceId(),
			Action:   act.GetAction(),
			Args:     mapFromStruct(act.GetArgs()),
		}
		st.Then = append(st.Then, stAct)
	}
	return st, nil
}

func toPBAutomation(a storage.Automation) *homepb.Automation {
	var when *structpb.Struct
	if a.When != nil {
		when, _ = structpb.NewStruct(mapStringAny(a.When))
	}
	then := make([]*homepb.AutomationAction, 0, len(a.Then))
	for _, act := range a.Then {
		var args *structpb.Struct
		if act.Args != nil {
			args, _ = structpb.NewStruct(mapStringAny(act.Args))
		}
		then = append(then, &homepb.AutomationAction{
			DeviceId: act.DeviceID,
			Action:   act.Action,
			Args:     args,
		})
	}
	return &homepb.Automation{
		Id:        a.ID,
		Name:      a.Name,
		Tags:      a.Tags,
		Enabled:   a.Enabled,
		When:      when,
		Then:      then,
		UpdatedAt: a.UpdatedAt,
	}
}

func (s *AutomationService) logAudit(kind, subject string, data map[string]any) {
	if s.audit == nil {
		return
	}
	_ = s.audit.Append(storage.AuditEntry{Kind: kind, Subject: subject, Data: data})
}

func (s *AutomationService) reloadEngine() error {
	if s.engine == nil {
		return nil
	}
	return s.engine.Reload()
}

func validateAutomation(a storage.Automation) error {
	if strings.TrimSpace(a.Name) == "" {
		return fmt.Errorf("name required")
	}
	if len(a.Then) == 0 {
		return fmt.Errorf("then actions required")
	}
	for i, act := range a.Then {
		if strings.TrimSpace(act.DeviceID) == "" {
			return fmt.Errorf("then[%d].device_id required", i)
		}
		if strings.TrimSpace(act.Action) == "" {
			return fmt.Errorf("then[%d].action required", i)
		}
	}
	wtype := strings.ToLower(fmt.Sprint(a.When["type"]))
	if wtype == "" {
		return fmt.Errorf("when.type required")
	}
	switch wtype {
	case "state", "event", "online", "action_result":
	default:
		return fmt.Errorf("unsupported when.type %s", wtype)
	}
	if dev := strings.TrimSpace(fmt.Sprint(a.When["device_id"])); dev == "" {
		return fmt.Errorf("when.device_id required")
	}
	return nil
}
