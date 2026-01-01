package home

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"pc-remote-ctrl/backend/internal/mqtt"
	"pc-remote-ctrl/backend/internal/storage"
	homepb "pc-remote-ctrl/backend/proto/home"

	"google.golang.org/protobuf/types/known/structpb"
)

// eventHub manages server-side WatchDevices subscribers and broadcasts events.
type eventHub struct {
	mu   sync.RWMutex
	subs map[*subscriber]struct{}
}

type subscriber struct {
	ch chan *homepb.DeviceEvent
	// empty ids means subscribe all
	ids map[string]struct{}
}

func newEventHub() *eventHub { return &eventHub{subs: make(map[*subscriber]struct{})} }

func (h *eventHub) subscribe(ids []string) (*subscriber, func()) {
	s := &subscriber{ch: make(chan *homepb.DeviceEvent, 64), ids: map[string]struct{}{}}
	for _, id := range ids {
		s.ids[id] = struct{}{}
	}
	h.mu.Lock()
	h.subs[s] = struct{}{}
	h.mu.Unlock()
	cancel := func() {
		h.mu.Lock()
		delete(h.subs, s)
		close(s.ch)
		h.mu.Unlock()
	}
	return s, cancel
}

func (h *eventHub) publish(ev *homepb.DeviceEvent) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for s := range h.subs {
		if len(s.ids) > 0 {
			if _, ok := s.ids[ev.GetDeviceId()]; !ok {
				continue
			}
		}
		select {
		case s.ch <- ev:
		default: /* drop if slow */
		}
	}
}

// subscriptionManager subscribes to MQTT topics for devices and forwards messages to eventHub.
type subscriptionManager struct {
	mqtt    mqtt.Client
	devices *storage.Devices
	audit   *storage.AuditLogs
	hub     *eventHub
	// track topics we already subscribed to
	mu   sync.Mutex
	subs map[string]bool
}

func newSubscriptionManager(c mqtt.Client, devs *storage.Devices, audit *storage.AuditLogs, hub *eventHub) *subscriptionManager {
	return &subscriptionManager{mqtt: c, devices: devs, audit: audit, hub: hub, subs: make(map[string]bool)}
}

func (m *subscriptionManager) initAll(ctx context.Context) {
	for _, d := range m.devices.List() {
		if strings.ToLower(string(d.Adapter.Kind)) != "mqtt" {
			continue
		}
		m.subscribeDevice(ctx, &d)
	}
}

func (m *subscriptionManager) subscribeDevice(ctx context.Context, d *storage.Device) {
	id := d.ID
	topics := deriveTopics(d)
	// state
	m.ensureSub(ctx, topics.state, 1, func(topic string, payload []byte) {
		st := toStruct(payload)
		// update state in storage (reported)
		dev := m.devices.Get(id)
		if dev != nil {
			if dev.Shadow.Reported == nil {
				dev.Shadow.Reported = map[string]any{}
			}
			for k, v := range st.AsMap() {
				dev.Shadow.Reported[k] = v
			}
			dev.LastSeen = time.Now().UnixMilli()
			dev.Online = true
			_ = m.devices.Upsert(*dev)
		}
		m.logAudit("device_state", id, st.AsMap())
		m.hub.publish(&homepb.DeviceEvent{DeviceId: id, Ts: time.Now().UnixMilli(), Kind: homepb.TelemetryEventKind_STATE, Payload: st})
	})
	// action results wildcard
	m.ensureSub(ctx, topics.actionResult, 1, func(topic string, payload []byte) {
		st := toStruct(payload)
		m.logAudit("action_result", id, st.AsMap())
		m.hub.publish(&homepb.DeviceEvent{DeviceId: id, Ts: time.Now().UnixMilli(), Kind: homepb.TelemetryEventKind_ACTION_RESULT, Payload: st})
	})
	// events
	m.ensureSub(ctx, topics.events, 1, func(topic string, payload []byte) {
		st := toStruct(payload)
		m.logAudit("device_event", id, st.AsMap())
		m.hub.publish(&homepb.DeviceEvent{DeviceId: id, Ts: time.Now().UnixMilli(), Kind: homepb.TelemetryEventKind_EVENT, Payload: st})
	})
	// status (online/offline)
	m.ensureSub(ctx, topics.status, 1, func(topic string, payload []byte) {
		txt := strings.TrimSpace(string(payload))
		online := strings.EqualFold(txt, "online") || strings.EqualFold(txt, "1") || strings.EqualFold(txt, "true")
		dev := m.devices.Get(id)
		if dev != nil {
			dev.Online = online
			dev.LastSeen = time.Now().UnixMilli()
			_ = m.devices.Upsert(*dev)
		}
		st, _ := structpb.NewStruct(map[string]any{"online": online, "raw": txt})
		m.logAudit("device_online", id, st.AsMap())
		m.hub.publish(&homepb.DeviceEvent{DeviceId: id, Ts: time.Now().UnixMilli(), Kind: homepb.TelemetryEventKind_ONLINE, Payload: st})
	})
}

type topicSet struct{ state, actionResult, events, status string }

func deriveTopics(d *storage.Device) topicSet {
	// prefer explicit topics map if present
	get := func(k, def string) string {
		if d.Topics != nil {
			if v, ok := d.Topics[k]; ok && v != "" {
				return v
			}
		}
		return def
	}
	base := fmt.Sprintf("devices/%s", d.ID)
	return topicSet{
		state:        get("state", base+"/state"),
		actionResult: get("action_result", base+"/actions/+/result"),
		events:       get("events", base+"/events"),
		status:       get("status", base+"/status"),
	}
}

func (m *subscriptionManager) ensureSub(ctx context.Context, topic string, qos byte, cb func(string, []byte)) {
	m.mu.Lock()
	if m.subs[topic] {
		m.mu.Unlock()
		return
	}
	m.subs[topic] = true
	m.mu.Unlock()
	if err := m.mqtt.Subscribe(ctx, topic, qos, cb); err != nil {
		log.Printf("[mqtt] subscribe failed topic=%s qos=%d err=%v", topic, qos, err)
	}
}

func toStruct(payload []byte) *structpb.Struct {
	var v any
	if err := json.Unmarshal(payload, &v); err == nil {
		// convert via map
		switch vv := v.(type) {
		case map[string]any:
			st, _ := structpb.NewStruct(vv)
			return st
		default:
			st, _ := structpb.NewStruct(map[string]any{"value": vv})
			return st
		}
	}
	st, _ := structpb.NewStruct(map[string]any{"raw": string(payload)})
	return st
}

func (m *subscriptionManager) logAudit(kind, subject string, data map[string]any) {
	if m.audit == nil {
		return
	}
	_ = m.audit.Append(storage.AuditEntry{Kind: kind, Subject: subject, Data: data})
}
