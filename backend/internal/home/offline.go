package home

import (
	"context"
	"log"
	"strings"
	"time"

	homepb "pc-remote-ctrl/backend/proto/home"

	"google.golang.org/protobuf/types/known/structpb"
)

// StartOfflineWatcher launches a background loop that marks devices offline when
// they have not reported within the configured timeout. Zero or negative timeout disables it.
func (s *Service) StartOfflineWatcher(ctx context.Context, offlineAfter time.Duration) {
	if offlineAfter <= 0 {
		return
	}

	interval := offlineAfter / 2
	if interval < 5*time.Second {
		interval = 5 * time.Second
	}

	ticker := time.NewTicker(interval)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.scanOffline(offlineAfter)
			}
		}
	}()
}

func (s *Service) scanOffline(offlineAfter time.Duration) {
	now := time.Now()
	for _, d := range s.devices.List() {
		if !d.Online {
			continue
		}
		if !strings.EqualFold(string(d.Adapter.Kind), "mqtt") {
			continue
		}
		if d.LastSeen <= 0 {
			continue
		}
		last := time.UnixMilli(d.LastSeen)
		if now.Sub(last) <= offlineAfter {
			continue
		}
		if err := s.markOffline(d.ID, now); err != nil {
			log.Printf("[home] offline watcher: device=%s set offline failed: %v", d.ID, err)
		}
	}
}

func (s *Service) markOffline(id string, now time.Time) error {
	dev := s.devices.Get(id)
	if dev == nil || !dev.Online {
		return nil
	}
	dev.Online = false
	dev.LastSeen = now.UnixMilli()
	if err := s.devices.Upsert(*dev); err != nil {
		return err
	}
	payload, _ := structpb.NewStruct(map[string]any{
		"online":    false,
		"reason":    "timeout",
		"timestamp": now.UnixMilli(),
	})
	s.hub.publish(&homepb.DeviceEvent{
		DeviceId: id,
		Ts:       now.UnixMilli(),
		Kind:     homepb.TelemetryEventKind_ONLINE,
		Payload:  payload,
	})
	return nil
}
