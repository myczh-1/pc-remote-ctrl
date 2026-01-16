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
	when, err := fromPBAutomationWhen(a.GetWhen())
	if err != nil {
		return nil, err
	}
	st.When = when
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
	when := toPBAutomationWhen(a.When)
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
	if len(a.When.Conditions) == 0 {
		return fmt.Errorf("when.conditions required")
	}
	logic := strings.TrimSpace(strings.ToLower(a.When.Logic))
	if logic != "all" && logic != "any" {
		return fmt.Errorf("when.logic must be all/any")
	}
	for i, cond := range a.When.Conditions {
		if strings.TrimSpace(cond.DeviceID) == "" {
			return fmt.Errorf("when.conditions[%d].device_id required", i)
		}
		kind := strings.TrimSpace(strings.ToLower(cond.Kind))
		switch kind {
		case "state":
			if strings.TrimSpace(cond.Path) == "" {
				return fmt.Errorf("when.conditions[%d].path required", i)
			}
			if cond.Value == nil {
				return fmt.Errorf("when.conditions[%d].value required", i)
			}
		case "online":
			if cond.Value == nil {
				return fmt.Errorf("when.conditions[%d].value required", i)
			}
		default:
			return fmt.Errorf("when.conditions[%d].kind unsupported", i)
		}
		op := strings.TrimSpace(strings.ToLower(cond.Op))
		switch op {
		case "eq", "ne":
		case "gt", "gte", "lt", "lte":
			if kind != "state" {
				return fmt.Errorf("when.conditions[%d].op unsupported for kind", i)
			}
		default:
			return fmt.Errorf("when.conditions[%d].op unsupported", i)
		}
	}
	return nil
}

func fromPBAutomationWhen(when *homepb.AutomationWhen) (storage.AutomationWhen, error) {
	if when == nil {
		return storage.AutomationWhen{}, fmt.Errorf("when required")
	}
	logic := logicFromPB(when.GetLogic())
	if logic == "" {
		return storage.AutomationWhen{}, fmt.Errorf("when.logic required")
	}
	out := storage.AutomationWhen{Logic: logic}
	for _, cond := range when.GetConditions() {
		item := storage.AutomationCondition{
			DeviceID: cond.GetDeviceId(),
			Kind:     kindFromPB(cond.GetKind()),
			Path:     cond.GetPath(),
			Op:       opFromPB(cond.GetOp()),
		}
		if cond.GetValue() != nil {
			item.Value = cond.GetValue().AsInterface()
		}
		out.Conditions = append(out.Conditions, item)
	}
	return out, nil
}

func toPBAutomationWhen(when storage.AutomationWhen) *homepb.AutomationWhen {
	out := &homepb.AutomationWhen{
		Logic: logicToPB(when.Logic),
	}
	for _, cond := range when.Conditions {
		item := &homepb.AutomationCondition{
			DeviceId: cond.DeviceID,
			Kind:     kindToPB(cond.Kind),
			Path:     cond.Path,
			Op:       opToPB(cond.Op),
		}
		if cond.Value != nil {
			if v, err := structpb.NewValue(cond.Value); err == nil {
				item.Value = v
			}
		}
		out.Conditions = append(out.Conditions, item)
	}
	return out
}

func logicFromPB(v homepb.AutomationLogic) string {
	switch v {
	case homepb.AutomationLogic_LOGIC_ALL:
		return "all"
	case homepb.AutomationLogic_LOGIC_ANY:
		return "any"
	default:
		return ""
	}
}

func logicToPB(v string) homepb.AutomationLogic {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "all":
		return homepb.AutomationLogic_LOGIC_ALL
	case "any":
		return homepb.AutomationLogic_LOGIC_ANY
	default:
		return homepb.AutomationLogic_LOGIC_UNSPECIFIED
	}
}

func kindFromPB(v homepb.AutomationConditionKind) string {
	switch v {
	case homepb.AutomationConditionKind_CONDITION_STATE:
		return "state"
	case homepb.AutomationConditionKind_CONDITION_ONLINE:
		return "online"
	default:
		return ""
	}
}

func kindToPB(v string) homepb.AutomationConditionKind {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "state":
		return homepb.AutomationConditionKind_CONDITION_STATE
	case "online":
		return homepb.AutomationConditionKind_CONDITION_ONLINE
	default:
		return homepb.AutomationConditionKind_CONDITION_KIND_UNSPECIFIED
	}
}

func opFromPB(v homepb.AutomationOperator) string {
	switch v {
	case homepb.AutomationOperator_OP_EQ:
		return "eq"
	case homepb.AutomationOperator_OP_NE:
		return "ne"
	case homepb.AutomationOperator_OP_GT:
		return "gt"
	case homepb.AutomationOperator_OP_GTE:
		return "gte"
	case homepb.AutomationOperator_OP_LT:
		return "lt"
	case homepb.AutomationOperator_OP_LTE:
		return "lte"
	default:
		return ""
	}
}

func opToPB(v string) homepb.AutomationOperator {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "eq":
		return homepb.AutomationOperator_OP_EQ
	case "ne":
		return homepb.AutomationOperator_OP_NE
	case "gt":
		return homepb.AutomationOperator_OP_GT
	case "gte":
		return homepb.AutomationOperator_OP_GTE
	case "lt":
		return homepb.AutomationOperator_OP_LT
	case "lte":
		return homepb.AutomationOperator_OP_LTE
	default:
		return homepb.AutomationOperator_OP_UNSPECIFIED
	}
}
