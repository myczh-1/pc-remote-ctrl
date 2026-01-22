package home

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"pc-remote-ctrl/backend/internal/mqtt"
	"pc-remote-ctrl/backend/internal/ops"
	"pc-remote-ctrl/backend/internal/storage"
	homepb "pc-remote-ctrl/backend/proto/home"

	crand "crypto/rand"

	"google.golang.org/protobuf/types/known/structpb"
)

type Service struct {
	homepb.UnimplementedHomeServiceServer
	devices *storage.Devices
	models  *storage.DeviceModels
	audit   *storage.AuditLogs
	ops     ops.DeviceOps
	hub     *eventHub
	submgr  *subscriptionManager
}

func New(devs *storage.Devices, models *storage.DeviceModels, audit *storage.AuditLogs, ops ops.DeviceOps) *Service {
	// hub/submgr will be set by InitSubscriptions from main after mqtt client is ready
	return &Service{devices: devs, models: models, audit: audit, ops: ops, hub: newEventHub()}
}

// InitSubscriptions wires MQTT subscriptions and starts listening for device topics.
func (s *Service) InitSubscriptions(c mqtt.Client) {
	s.submgr = newSubscriptionManager(c, s.devices, s.audit, s.hub)
	go s.submgr.initAll(context.Background())
}

func (s *Service) AttachAutomationEngine(ctx context.Context, eng *AutomationEngine) {
	if eng == nil {
		return
	}
	eng.Run(ctx, s.hub)
}

func (s *Service) ListDevices(ctx context.Context, req *homepb.ListDevicesRequest) (*homepb.ListDevicesResponse, error) {
	// Build composite filter from request - no special cases
	filter := NewCompositeFilter(
		NewIDFilter(req.GetIds()),
		buildTypeFilter(req.GetType()),
		buildRoomFilter(req.GetRoom()),
		NewTagFilter(req.GetTags()),
		NewStatusFilter(req.GetIncludePending()),
	)

	// Get all devices and apply filter
	devices := FilterDevices(s.devices.List(), filter)

	// Convert to protobuf
	out := make([]*homepb.Device, 0, len(devices))
	for _, d := range devices {
		out = append(out, toPBDevice(&d, req.GetIncludeState()))
	}

	log.Printf("[home] ListDevices: matched=%d total=%d", len(out), len(s.devices.List()))
	return &homepb.ListDevicesResponse{Devices: out}, nil
}

// Helper functions to build filters from strings
func buildTypeFilter(t string) DeviceFilter {
	if t == "" {
		return nil
	}
	return TypeFilter(t)
}

func buildRoomFilter(r string) DeviceFilter {
	if r == "" {
		return nil
	}
	return RoomFilter(r)
}

func (s *Service) WatchDevices(req *homepb.WatchDevicesRequest, stream homepb.HomeService_WatchDevicesServer) error {
	var ids []string
	if req != nil {
		ids = req.GetIds()
	}
	sub, cancel := s.hub.subscribe(ids)
	defer cancel()
	ctx := stream.Context()
	for {
		select {
		case <-ctx.Done():
			return nil
		case ev := <-sub.ch:
			if ev == nil {
				return nil
			}
			if err := stream.Send(ev); err != nil {
				return err
			}
		}
	}
}

func (s *Service) UpsertDevice(ctx context.Context, req *homepb.UpsertDeviceRequest) (*homepb.UpsertDeviceResponse, error) {
	if req.GetDevice() == nil {
		return &homepb.UpsertDeviceResponse{Ok: false, Message: "device required"}, nil
	}
	incoming := req.GetDevice()
	id := strings.TrimSpace(incoming.GetId())
	var existing *storage.Device

	// Create: empty id → generate a new one
	// Update: non-empty id must exist
	if id == "" {
		// generate unique id
		nid, err := generateID()
		if err != nil {
			return &homepb.UpsertDeviceResponse{Ok: false, Message: "id generate failed"}, nil
		}
		incoming.Id = nid
		if incoming.Status == homepb.DeviceStatus_DEVICE_STATUS_UNSPECIFIED {
			incoming.Status = homepb.DeviceStatus_DEVICE_STATUS_ACTIVE
		}
	} else {
		existing = s.devices.Get(id)
		if existing == nil {
			return &homepb.UpsertDeviceResponse{Ok: false, Message: "device not found (update requires existing id)"}, nil
		}
	}

	dev, err := fromPBDevice(incoming)
	if err != nil {
		return &homepb.UpsertDeviceResponse{Ok: false, Message: err.Error()}, nil
	}

	if existing != nil {
		dev.Status = existing.Status
		dev.Online = existing.Online
		dev.LastSeen = existing.LastSeen
		if incoming.State == nil {
			dev.Shadow = existing.Shadow
		}
	}

	if err := s.applyModel(dev); err != nil {
		return &homepb.UpsertDeviceResponse{Ok: false, Message: err.Error()}, nil
	}
	if err := s.devices.Upsert(*dev); err != nil {
		return &homepb.UpsertDeviceResponse{Ok: false, Message: err.Error()}, nil
	}
	s.logAudit("device_upsert", dev.ID, map[string]any{
		"name":    dev.Name,
		"type":    dev.Type,
		"room":    dev.Room,
		"created": id == "",
	})
	// subscribe newly created device's topics
	msg := "ok"
	if id == "" {
		msg = "created:" + dev.ID
		if s.submgr != nil {
			s.submgr.subscribeDevice(ctx, dev)
		}
	} else {
		msg = "updated:" + dev.ID
	}
	return &homepb.UpsertDeviceResponse{Ok: true, Message: msg}, nil
}

func (s *Service) ReserveDevice(ctx context.Context, req *homepb.ReserveDeviceRequest) (*homepb.ReserveDeviceResponse, error) {
	modelID := strings.TrimSpace(req.GetModelId())
	modelVer := strings.TrimSpace(req.GetModelVersion())
	if modelID == "" || modelVer == "" {
		return &homepb.ReserveDeviceResponse{Ok: false, Message: "model_id and model_version required"}, nil
	}
	nid, err := generateID()
	if err != nil {
		return &homepb.ReserveDeviceResponse{Ok: false, Message: "id generate failed"}, nil
	}
	dev := &storage.Device{
		ID:       nid,
		ModelID:  modelID,
		ModelVer: modelVer,
		Adapter:  storage.DeviceAdapter{Kind: storage.AdapterMQTT, Config: map[string]any{}},
		Status:   storage.DeviceStatusPending,
	}
	if err := s.applyModel(dev); err != nil {
		return &homepb.ReserveDeviceResponse{Ok: false, Message: err.Error()}, nil
	}
	if err := s.devices.Upsert(*dev); err != nil {
		return &homepb.ReserveDeviceResponse{Ok: false, Message: err.Error()}, nil
	}
	s.logAudit("device_reserve", dev.ID, map[string]any{
		"model_id":      dev.ModelID,
		"model_version": dev.ModelVer,
	})
	if s.submgr != nil {
		s.submgr.subscribeDevice(ctx, dev)
	}
	return &homepb.ReserveDeviceResponse{Ok: true, Message: "ok", DeviceId: dev.ID}, nil
}

func (s *Service) DeleteDevice(ctx context.Context, req *homepb.DeleteDeviceRequest) (*homepb.DeleteDeviceResponse, error) {
	if strings.TrimSpace(req.GetDeviceId()) == "" {
		return &homepb.DeleteDeviceResponse{Ok: false, Message: "device_id required"}, nil
	}
	if err := s.devices.Remove(req.GetDeviceId()); err != nil {
		return &homepb.DeleteDeviceResponse{Ok: false, Message: err.Error()}, nil
	}
	s.logAudit("device_delete", req.GetDeviceId(), nil)
	return &homepb.DeleteDeviceResponse{Ok: true, Message: "ok"}, nil
}

// 接受前端调用
func (s *Service) InvokeAction(ctx context.Context, req *homepb.InvokeActionRequest) (*homepb.InvokeActionResponse, error) {
	args := mapFromStruct(req.GetArgs())
	corrID := newCorrID()
	if desired := extractDesiredFromArgs(args); len(desired) > 0 {
		s.setDesired(ctx, req.GetDeviceId(), desired, corrID)
	}
	data, err := s.ops.InvokeAction(ctx, req.GetDeviceId(), req.GetAction(), args, corrID)
	if err != nil {
		s.logAudit("action_invoke", req.GetDeviceId(), map[string]any{
			"action":  req.GetAction(),
			"corr_id": corrID,
			"ok":      false,
			"error":   err.Error(),
		})
		return &homepb.InvokeActionResponse{Ok: false, Message: err.Error()}, nil
	}
	st, _ := structpb.NewStruct(mapStringAny(data))
	s.logAudit("action_invoke", req.GetDeviceId(), map[string]any{
		"action":  req.GetAction(),
		"corr_id": corrID,
		"ok":      true,
	})
	return &homepb.InvokeActionResponse{Ok: true, Message: "published", CorrId: corrID, Data: st}, nil
}

func toPBDevice(d *storage.Device, includeState bool) *homepb.Device {
	st := (*structpb.Struct)(nil)
	if includeState {
		if len(d.Shadow.Reported) > 0 && len(d.Shadow.Desired) > 0 {
			st, _ = structpb.NewStruct(map[string]any{
				"reported": d.Shadow.Reported,
				"desired":  d.Shadow.Desired,
			})
		} else if len(d.Shadow.Reported) > 0 {
			st, _ = structpb.NewStruct(mapStringAny(d.Shadow.Reported))
		} else if len(d.Shadow.Desired) > 0 {
			st, _ = structpb.NewStruct(map[string]any{
				"desired": d.Shadow.Desired,
			})
		}
	}
	acts := make([]*homepb.ActionSpec, 0, len(d.Actions))
	for _, a := range d.Actions {
		acts = append(acts, &homepb.ActionSpec{Name: a.Name, ArgsSchema: mapStringString(a.ArgsSchema), TimeoutMs: int32(a.TimeoutMS)})
	}
	cfg := mapStringString(d.Adapter.Config)
	ad := &homepb.Adapter{Kind: toPBAdapterKind(d.Adapter.Kind), Config: cfg}
	topics := map[string]string{}
	for k, v := range d.Topics {
		topics[k] = v
	}
	return &homepb.Device{
		Id: d.ID, Name: d.Name, Type: d.Type, Room: d.Room, Tags: d.Tags,
		Online: d.Online, LastSeen: d.LastSeen, Topics: topics, Adapter: ad, Actions: acts, State: st,
		ModelId: d.ModelID, ModelVersion: d.ModelVer,
		Status: toPBDeviceStatus(d.Status),
	}
}

func fromPBDevice(p *homepb.Device) (*storage.Device, error) {
	status := fromPBDeviceStatus(p.GetStatus())
	d := &storage.Device{
		ID:   strings.TrimSpace(p.GetId()),
		Name: p.GetName(), Type: p.GetType(), Room: p.GetRoom(), Tags: p.GetTags(),
		Online: p.GetOnline(), LastSeen: p.GetLastSeen(),
		Topics:   map[string]string{},
		ModelID:  strings.TrimSpace(p.GetModelId()),
		ModelVer: strings.TrimSpace(p.GetModelVersion()),
		Status:   status,
	}
	if d.Status == "" {
		d.Status = storage.DeviceStatusActive
	}
	for k, v := range p.GetTopics() {
		d.Topics[k] = v
	}
	// adapter
	if p.GetAdapter() != nil {
		d.Adapter.Kind = fromPBAdapterKind(p.GetAdapter().GetKind())
		d.Adapter.Config = mapStringAnyFromString(p.GetAdapter().GetConfig())
	}
	// actions
	for _, a := range p.GetActions() {
		d.Actions = append(d.Actions, storage.ActionSpec{Name: a.GetName(), ArgsSchema: mapStringAnyFromString(a.GetArgsSchema()), TimeoutMS: int(a.GetTimeoutMs())})
	}
	// state maps to Shadow.Reported for now
	if p.GetState() != nil {
		stateMap := mapStringAny(p.GetState().AsMap())
		if rep, ok := stateMap["reported"].(map[string]any); ok {
			d.Shadow.Reported = rep
		} else {
			d.Shadow.Reported = stateMap
		}
		if desired, ok := stateMap["desired"].(map[string]any); ok {
			d.Shadow.Desired = desired
			d.Shadow.TSDesired = time.Now().UnixMilli()
		}
		d.Shadow.TSReported = time.Now().UnixMilli()
	}
	return d, nil
}

// generateID creates a random UUIDv4-like string without extra deps.
func generateID() (string, error) {
	// 16 random bytes, set version and variant bits
	var b [16]byte
	if _, err := randRead(b[:]); err != nil {
		return "", err
	}
	b[6] = (b[6] & 0x0f) | 0x40 // version 4
	b[8] = (b[8] & 0x3f) | 0x80 // variant RFC4122
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		uint32(b[0])<<24|uint32(b[1])<<16|uint32(b[2])<<8|uint32(b[3]),
		uint16(b[4])<<8|uint16(b[5]),
		uint16(b[6])<<8|uint16(b[7]),
		uint16(b[8])<<8|uint16(b[9]),
		uint64(b[10])<<40|uint64(b[11])<<32|uint64(b[12])<<24|uint64(b[13])<<16|uint64(b[14])<<8|uint64(b[15]),
	), nil
}

// randRead wraps crypto/rand.Read, split for testability
var randRead = func(p []byte) (int, error) { return crand.Read(p) }

func newCorrID() string {
	id, err := generateID()
	if err == nil && id != "" {
		return "corr-" + id
	}
	return fmt.Sprintf("corr-%d", time.Now().UnixMilli())
}

func extractDesiredFromArgs(args map[string]any) map[string]any {
	if len(args) == 0 {
		return nil
	}
	if desired, ok := args["desired"].(map[string]any); ok {
		return desired
	}
	if desired, ok := args["state"].(map[string]any); ok {
		return desired
	}
	return args
}

func (s *Service) setDesired(ctx context.Context, deviceID string, desired map[string]any, corrID string) {
	if len(desired) == 0 {
		return
	}
	dev := s.devices.Get(deviceID)
	if dev == nil {
		return
	}
	dev.Shadow.Desired = cloneStringAnyMap(desired)
	dev.Shadow.TSDesired = time.Now().UnixMilli()
	dev.Shadow.Version++
	if err := s.devices.Upsert(*dev); err != nil {
		log.Printf("[home] set desired failed device=%s: %v", deviceID, err)
		return
	}
	s.logAudit("shadow_desired", deviceID, map[string]any{
		"corr_id": corrID,
		"desired": desired,
	})
	if err := s.ops.UpdateDesired(ctx, deviceID, desired); err != nil {
		log.Printf("[home] publish desired failed device=%s: %v", deviceID, err)
	}
}

func cloneStringAnyMap(in map[string]any) map[string]any {
	out := make(map[string]any, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}

func (s *Service) applyModel(dev *storage.Device) error {
	if s.models == nil {
		return fmt.Errorf("device models not available")
	}
	id := strings.TrimSpace(dev.ModelID)
	ver := strings.TrimSpace(dev.ModelVer)
	if id == "" || ver == "" {
		return fmt.Errorf("model_id and model_version required")
	}
	model := s.models.Get(id, ver)
	if model == nil {
		return fmt.Errorf("device model not found")
	}
	dev.ModelID = model.ID
	dev.ModelVer = model.Version
	if model.Name != "" {
		dev.Type = model.Name
	} else {
		dev.Type = model.ID
	}
	dev.Actions = append([]storage.ActionSpec(nil), model.Actions...)
	return nil
}

func toPBAdapterKind(k storage.AdapterKind) homepb.AdapterKind {
	switch strings.ToLower(string(k)) {
	case "mqtt":
		return homepb.AdapterKind_MQTT
	case "serial":
		return homepb.AdapterKind_SERIAL
	case "http":
		return homepb.AdapterKind_HTTP
	default:
		return homepb.AdapterKind_ADAPTER_KIND_UNSPECIFIED
	}
}

func fromPBAdapterKind(k homepb.AdapterKind) storage.AdapterKind {
	switch k {
	case homepb.AdapterKind_MQTT:
		return storage.AdapterMQTT
	case homepb.AdapterKind_SERIAL:
		return storage.AdapterSerial
	case homepb.AdapterKind_HTTP:
		return storage.AdapterHTTP
	default:
		return storage.AdapterKind("")
	}
}

func toPBDeviceStatus(s storage.DeviceStatus) homepb.DeviceStatus {
	switch s {
	case storage.DeviceStatusPending:
		return homepb.DeviceStatus_DEVICE_STATUS_PENDING
	case storage.DeviceStatusActive:
		return homepb.DeviceStatus_DEVICE_STATUS_ACTIVE
	default:
		return homepb.DeviceStatus_DEVICE_STATUS_UNSPECIFIED
	}
}

func fromPBDeviceStatus(s homepb.DeviceStatus) storage.DeviceStatus {
	switch s {
	case homepb.DeviceStatus_DEVICE_STATUS_PENDING:
		return storage.DeviceStatusPending
	case homepb.DeviceStatus_DEVICE_STATUS_ACTIVE:
		return storage.DeviceStatusActive
	default:
		return storage.DeviceStatus("")
	}
}

func mapStringString(m map[string]any) map[string]string {
	out := map[string]string{}
	for k, v := range m {
		out[k] = fmt.Sprint(v)
	}
	return out
}

func mapStringAnyFromString(m map[string]string) map[string]any {
	out := map[string]any{}
	for k, v := range m {
		out[k] = v
	}
	return out
}

func mapStringAny(m map[string]any) map[string]any { return m }

func mapFromStruct(s *structpb.Struct) map[string]any {
	if s == nil {
		return map[string]any{}
	}
	return s.AsMap()
}

func (s *Service) logAudit(kind, subject string, data map[string]any) {
	if s.audit == nil {
		return
	}
	_ = s.audit.Append(storage.AuditEntry{
		Kind:    strings.TrimSpace(kind),
		Subject: strings.TrimSpace(subject),
		Data:    data,
	})
}
