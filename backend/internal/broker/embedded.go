package broker

import (
    "bytes"
    "context"
    "log"
    "time"

    mqttserver "github.com/mochi-mqtt/server/v2"
    "github.com/mochi-mqtt/server/v2/listeners"
    "github.com/mochi-mqtt/server/v2/packets"
)

// Embedded is a lightweight in-process MQTT broker for local development.
type Embedded struct {
    srv *mqttserver.Server
}

// StartEmbedded starts a TCP MQTT broker listening on addr (e.g. ":1883").
func StartEmbedded(addr string) (*Embedded, error) {
    s := mqttserver.New(nil)
    // Allow all auth + ACL (development only)
    _ = s.AddHook(new(allowAllHook), nil)
    l := listeners.NewTCP("tcp", addr, nil)
    if err := s.AddListener(l); err != nil { return nil, err }
    go func() {
        if err := s.Serve(); err != nil {
            log.Printf("embedded mqtt stopped: %v", err)
        }
    }()
    return &Embedded{srv: s}, nil
}

// Stop gracefully stops the embedded broker.
func (e *Embedded) Stop(ctx context.Context) error {
    if e == nil || e.srv == nil { return nil }
    done := make(chan struct{})
    go func() { e.srv.Close(); close(done) }()
    select {
    case <-done:
        return nil
    case <-ctx.Done():
        return ctx.Err()
    case <-time.After(2 * time.Second):
        return nil
    }
}

// allowAllHook permits all connections and ACL checks (dev only)
type allowAllHook struct{ mqttserver.HookBase }

func (h *allowAllHook) ID() string { return "allow-all-auth" }
func (h *allowAllHook) Provides(b byte) bool {
    return bytes.Contains([]byte{mqttserver.OnConnectAuthenticate, mqttserver.OnACLCheck}, []byte{b})
}
func (h *allowAllHook) OnConnectAuthenticate(cl *mqttserver.Client, pk packets.Packet) bool { return true }
func (h *allowAllHook) OnACLCheck(cl *mqttserver.Client, topic string, write bool) bool     { return true }
