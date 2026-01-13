package ops

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"pc-remote-ctrl/backend/internal/mqtt"
)

// MQTTOps is a placeholder implementation that only publishes call payloads.
// Result/subscribe wiring will be added later.
type MQTTOps struct {
	Client mqtt.Client
}

func NewMQTTOps(c mqtt.Client) *MQTTOps { return &MQTTOps{Client: c} }

// mqtt发布
func (m *MQTTOps) InvokeAction(ctx context.Context, deviceID, action string, args map[string]any, corrID string) (map[string]any, error) {
	// publish to a conventional topic; deviceID & action compose the path
	topic := fmt.Sprintf("devices/%s/actions/%s/call", deviceID, action)
	payload := map[string]any{"args": args, "ts": time.Now().UnixMilli()}
	if corrID != "" {
		payload["corr_id"] = corrID
	}
	body, _ := json.Marshal(payload)
	if err := m.Client.Publish(ctx, topic, body, 1, false); err != nil {
		return nil, err
	}
	// No result yet; return ack-like response
	return map[string]any{"published": true, "corr_id": corrID}, nil
}

func (m *MQTTOps) UpdateDesired(ctx context.Context, deviceID string, desired map[string]any) error {
	topic := fmt.Sprintf("devices/%s/shadow/desired", deviceID)
	payload, _ := json.Marshal(desired)
	return m.Client.Publish(ctx, topic, payload, 1, false)
}
