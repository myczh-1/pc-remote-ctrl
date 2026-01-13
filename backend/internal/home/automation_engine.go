package home

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"pc-remote-ctrl/backend/internal/ops"
	"pc-remote-ctrl/backend/internal/storage"
	homepb "pc-remote-ctrl/backend/proto/home"
)

// AutomationEngine evaluates incoming device events and fires automation actions.
// It keeps a cached copy of enabled automations; AutomationService should call Reload on changes.
type AutomationEngine struct {
	autos *storage.Automations
	devs  *storage.Devices
	ops   ops.DeviceOps
	audit *storage.AuditLogs

	mu      sync.RWMutex
	cache   []storage.Automation
	execing map[string]bool      // automationID -> running
	lastRun map[string]time.Time // automationID -> last execution ts
}

func NewAutomationEngine(autos *storage.Automations, devs *storage.Devices, ops ops.DeviceOps, audit *storage.AuditLogs) *AutomationEngine {
	return &AutomationEngine{
		autos:   autos,
		devs:    devs,
		ops:     ops,
		audit:   audit,
		execing: map[string]bool{},
		lastRun: map[string]time.Time{},
	}
}

// Run subscribes to device events and processes automations until ctx is cancelled.
func (e *AutomationEngine) Run(ctx context.Context, hub *eventHub) {
	_ = e.Reload()
	sub, cancel := hub.subscribe(nil) // all devices
	go func() {
		<-ctx.Done()
		cancel()
	}()
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case ev := <-sub.ch:
				if ev == nil {
					return
				}
				e.handleEvent(ev)
			}
		}
	}()
}

// Reload refreshes cached automations; errors are logged via audit best-effort.
func (e *AutomationEngine) Reload() error {
	autos, _, err := e.autos.List(storage.ListAutomationsOptions{IncludeDisabled: true, PageSize: 200})
	if err != nil {
		return err
	}
	e.mu.Lock()
	e.cache = autos
	e.mu.Unlock()
	return nil
}

func (e *AutomationEngine) handleEvent(ev *homepb.DeviceEvent) {
	e.mu.RLock()
	autos := make([]storage.Automation, len(e.cache))
	copy(autos, e.cache)
	e.mu.RUnlock()
	for _, a := range autos {
		if !a.Enabled {
			continue
		}
		if matchTrigger(a.When, ev) {
			go e.runAutomation(a, ev, false)
		}
	}
}

// TriggerNow executes an automation on demand (manual trigger).
func (e *AutomationEngine) TriggerNow(ctx context.Context, automationID string, payload map[string]any) error {
	e.mu.RLock()
	var picked *storage.Automation
	for i := range e.cache {
		if e.cache[i].ID == automationID {
			tmp := e.cache[i]
			picked = &tmp
			break
		}
	}
	e.mu.RUnlock()
	if picked == nil {
		return fmt.Errorf("automation not found")
	}
	if !picked.Enabled {
		return fmt.Errorf("automation disabled")
	}
	go e.runAutomation(*picked, nil, true)
	e.logAudit("automation_manual", automationID, map[string]any{"payload": payload})
	return nil
}

func (e *AutomationEngine) runAutomation(a storage.Automation, ev *homepb.DeviceEvent, force bool) {
	if !force && !e.acquire(a.ID) {
		return
	}
	defer func() {
		if !force {
			e.release(a.ID)
		}
	}()

	// debounce per automation unless force
	if !force && e.isDebounced(a.ID, 500*time.Millisecond) {
		return
	}
	e.markRun(a.ID)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	for _, act := range a.Then {
		if strings.TrimSpace(act.DeviceID) == "" || strings.TrimSpace(act.Action) == "" {
			continue
		}
		args := act.Args
		if args == nil {
			args = map[string]any{}
		}
		corrID := newCorrID()
		_, err := e.ops.InvokeAction(ctx, act.DeviceID, act.Action, args, corrID)
		e.logAudit("automation_execute", a.ID, map[string]any{
			"automation_name": a.Name,
			"device_id":       act.DeviceID,
			"action":          act.Action,
			"corr_id":         corrID,
			"ok":              err == nil,
			"error":           errString(err),
		})
	}
}

func matchTrigger(when map[string]any, ev *homepb.DeviceEvent) bool {
	if when == nil || ev == nil {
		return false
	}
	wtype := strings.ToLower(fmt.Sprint(when["type"]))
	deviceID := strings.TrimSpace(fmt.Sprint(when["device_id"]))
	if deviceID != "" && deviceID != ev.GetDeviceId() {
		return false
	}
	payload := ev.GetPayload()
	payloadMap := map[string]any{}
	if payload != nil {
		payloadMap = payload.AsMap()
	}
	switch wtype {
	case "state":
		if ev.GetKind() != homepb.TelemetryEventKind_STATE {
			return false
		}
		return matchFieldEquals(when, payloadMap)
	case "event":
		if ev.GetKind() != homepb.TelemetryEventKind_EVENT {
			return false
		}
		return matchFieldEquals(when, payloadMap)
	case "online":
		if ev.GetKind() != homepb.TelemetryEventKind_ONLINE {
			return false
		}
		return matchFieldEquals(when, payloadMap)
	case "action_result":
		if ev.GetKind() != homepb.TelemetryEventKind_ACTION_RESULT {
			return false
		}
		return matchFieldEquals(when, payloadMap)
	default:
		return false
	}
}

// matchFieldEquals supports a simple predicate: path (top-level key) + equals value.
func matchFieldEquals(when map[string]any, payload map[string]any) bool {
	path := strings.TrimSpace(fmt.Sprint(when["path"]))
	if path == "" {
		return true // match any event of this type
	}
	val, ok := payload[path]
	if !ok {
		return false
	}
	if eqRaw, exists := when["equals"]; exists {
		return fmt.Sprint(eqRaw) == fmt.Sprint(val)
	}
	return true
}

func (e *AutomationEngine) logAudit(kind, subject string, data map[string]any) {
	if e.audit == nil {
		return
	}
	_ = e.audit.Append(storage.AuditEntry{Kind: kind, Subject: subject, Data: data})
}

func (e *AutomationEngine) acquire(id string) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.execing[id] {
		return false
	}
	e.execing[id] = true
	return true
}

func (e *AutomationEngine) release(id string) {
	e.mu.Lock()
	delete(e.execing, id)
	e.mu.Unlock()
}

func (e *AutomationEngine) isDebounced(id string, minGap time.Duration) bool {
	e.mu.RLock()
	last, ok := e.lastRun[id]
	e.mu.RUnlock()
	if !ok {
		return false
	}
	return time.Since(last) < minGap
}

func (e *AutomationEngine) markRun(id string) {
	e.mu.Lock()
	e.lastRun[id] = time.Now()
	e.mu.Unlock()
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
