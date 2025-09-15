package broker

import (
    "context"
    "log"
    "time"

    mqttserver "github.com/mochi-co/mqtt/server"
    "github.com/mochi-co/mqtt/server/listeners"
)

// Embedded is a lightweight in-process MQTT broker for local development.
type Embedded struct {
    srv *mqttserver.Server
}

// StartEmbedded starts a TCP MQTT broker listening on addr (e.g. ":1883").
func StartEmbedded(addr string) (*Embedded, error) {
    s := mqttserver.New(nil)
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

