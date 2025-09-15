package ops

import (
    "context"
)

// DeviceOps defines operations against a device abstraction.
// Concrete implementations will use MQTT/Serial/HTTP per device adapter.
type DeviceOps interface {
    InvokeAction(ctx context.Context, deviceID, action string, args map[string]any) (map[string]any, error)
    UpdateDesired(ctx context.Context, deviceID string, desired map[string]any) error
}

