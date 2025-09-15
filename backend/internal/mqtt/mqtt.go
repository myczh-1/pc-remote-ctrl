package mqtt

import (
    "context"
    "log"
)

// Client is a minimal interface for publishing messages to a broker.
// For MVP we provide a no-op implementation to avoid external deps.
// Later we can swap in paho.mqtt.golang without changing callers.
type Client interface {
    Connect(ctx context.Context) error
    Publish(ctx context.Context, topic string, payload []byte, qos byte, retain bool) error
    Subscribe(ctx context.Context, topic string, qos byte, cb func(topic string, payload []byte)) error
    Unsubscribe(ctx context.Context, topics ...string) error
    Close() error
}

// NoopClient logs publishes without network operations.
type NoopClient struct{}

func NewNoop() *NoopClient { return &NoopClient{} }

func (c *NoopClient) Connect(ctx context.Context) error {
    log.Println("[mqtt] using noop client (no broker connection)")
    return nil
}

func (c *NoopClient) Publish(ctx context.Context, topic string, payload []byte, qos byte, retain bool) error {
    log.Printf("[mqtt] publish noop topic=%s qos=%d retain=%v payload=%s", topic, qos, retain, string(payload))
    return nil
}

func (c *NoopClient) Subscribe(ctx context.Context, topic string, qos byte, cb func(topic string, payload []byte)) error {
    log.Printf("[mqtt] subscribe noop topic=%s qos=%d", topic, qos)
    return nil
}

func (c *NoopClient) Unsubscribe(ctx context.Context, topics ...string) error {
    log.Printf("[mqtt] unsubscribe noop topics=%v", topics)
    return nil
}

func (c *NoopClient) Close() error { return nil }
