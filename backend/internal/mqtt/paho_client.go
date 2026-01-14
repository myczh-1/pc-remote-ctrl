package mqtt

import (
	"context"
	"crypto/tls"
	"fmt"
	"log"
	"net/url"
	"sync"
	"time"

	paho "github.com/eclipse/paho.mqtt.golang"
)

type PahoClient struct {
	url       string
	username  string
	password  string
	clientID  string
	keepAlive time.Duration
	c         paho.Client
	mu        sync.RWMutex
	subs      map[string]subEntry
}

type subEntry struct {
	qos byte
	cb  func(string, []byte)
}

type PahoOptions struct {
	URL         string
	Username    string
	Password    string
	ClientID    string
	KeepAlive   time.Duration
	InsecureTLS bool // allow insecure TLS for demos
}

func NewPaho(opts PahoOptions) *PahoClient {
	if opts.KeepAlive <= 0 {
		opts.KeepAlive = 30 * time.Second
	}
	return &PahoClient{
		url: opts.URL, username: opts.Username, password: opts.Password,
		clientID: opts.ClientID, keepAlive: opts.KeepAlive,
	}
}

func (p *PahoClient) Connect(ctx context.Context) error {
	if p.url == "" {
		return fmt.Errorf("mqtt url is empty")
	}
	u, err := url.Parse(p.url)
	if err != nil {
		return err
	}

	opts := paho.NewClientOptions()
	opts.AddBroker(p.url)
	if p.clientID != "" {
		opts.SetClientID(p.clientID)
	}
	if p.username != "" {
		opts.SetUsername(p.username)
	}
	if p.password != "" {
		opts.SetPassword(p.password)
	}
	opts.SetKeepAlive(p.keepAlive)
	opts.SetAutoReconnect(true)
	opts.SetConnectRetry(true)
	opts.SetConnectRetryInterval(2 * time.Second)
	opts.SetMaxReconnectInterval(30 * time.Second)
	// basic TLS if scheme is ssl/tls or wss
	if u.Scheme == "ssl" || u.Scheme == "tls" || u.Scheme == "wss" || u.Scheme == "mqtts" {
		opts.SetTLSConfig(&tls.Config{InsecureSkipVerify: true})
	}

	opts.OnConnect = func(c paho.Client) {
		log.Printf("[mqtt] connected to %s", p.url)
		p.resubscribeAll()
	}
	opts.OnConnectionLost = func(c paho.Client, err error) { log.Printf("[mqtt] connection lost: %v", err) }

	p.c = paho.NewClient(opts)
	token := p.c.Connect()
	if !token.WaitTimeout(10 * time.Second) {
		return fmt.Errorf("mqtt connect timeout")
	}
	if err := token.Error(); err != nil {
		return err
	}
	return nil
}

func (p *PahoClient) Publish(ctx context.Context, topic string, payload []byte, qos byte, retain bool) error {
	if p.c == nil {
		return fmt.Errorf("mqtt client not connected")
	}
	token := p.c.Publish(topic, qos, retain, payload)
	// optional timeout via context
	done := make(chan struct{})
	go func() { token.Wait(); close(done) }()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-done:
		return token.Error()
	case <-time.After(10 * time.Second):
		return fmt.Errorf("mqtt publish timeout")
	}
}

func (p *PahoClient) Subscribe(ctx context.Context, topic string, qos byte, cb func(topic string, payload []byte)) error {
	if p.c == nil {
		return fmt.Errorf("mqtt client not connected")
	}
	p.mu.Lock()
	if p.subs == nil {
		p.subs = make(map[string]subEntry)
	}
	p.subs[topic] = subEntry{qos: qos, cb: cb}
	p.mu.Unlock()

	token := p.c.Subscribe(topic, qos, p.wrapHandler(cb))
	if !token.WaitTimeout(10 * time.Second) {
		return fmt.Errorf("mqtt subscribe timeout")
	}
	return token.Error()
}

func (p *PahoClient) Unsubscribe(ctx context.Context, topics ...string) error {
	if p.c == nil {
		return fmt.Errorf("mqtt client not connected")
	}
	token := p.c.Unsubscribe(topics...)
	if !token.WaitTimeout(10 * time.Second) {
		return fmt.Errorf("mqtt unsubscribe timeout")
	}
	p.mu.Lock()
	if p.subs != nil {
		for _, t := range topics {
			delete(p.subs, t)
		}
	}
	p.mu.Unlock()
	return token.Error()
}

func (p *PahoClient) Close() error {
	if p.c != nil {
		p.c.Disconnect(250)
	}
	return nil
}

func (p *PahoClient) wrapHandler(cb func(topic string, payload []byte)) func(paho.Client, paho.Message) {
	return func(_ paho.Client, m paho.Message) {
		payload := make([]byte, len(m.Payload()))
		copy(payload, m.Payload())
		go cb(m.Topic(), payload)
	}
}

func (p *PahoClient) resubscribeAll() {
	p.mu.RLock()
	if len(p.subs) == 0 || p.c == nil {
		p.mu.RUnlock()
		return
	}
	snapshot := make(map[string]subEntry, len(p.subs))
	for topic, entry := range p.subs {
		snapshot[topic] = entry
	}
	p.mu.RUnlock()

	for topic, entry := range snapshot {
		token := p.c.Subscribe(topic, entry.qos, p.wrapHandler(entry.cb))
		if !token.WaitTimeout(10 * time.Second) {
			log.Printf("[mqtt] resubscribe timeout topic=%s", topic)
			continue
		}
		if err := token.Error(); err != nil {
			log.Printf("[mqtt] resubscribe failed topic=%s err=%v", topic, err)
		}
	}
}
