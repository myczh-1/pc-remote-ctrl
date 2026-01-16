package cloud

import (
	"context"
	"log"
	"strings"
	"sync"
	"time"

	cloudpb "pc-remote-ctrl/cloud-middleware/proto/cloud"

	"google.golang.org/grpc"
)

type RuntimeConfig struct {
	CloudAddr               string
	AgentDeviceID           string
	AgentSecret             string
	AgentTunnelUnaryTimeout time.Duration
}

type Manager struct {
	mu        sync.Mutex
	baseCtx   context.Context
	cancel    context.CancelFunc
	localPort string
	active    *RuntimeConfig
}

func NewManager(ctx context.Context, localPort string) *Manager {
	return &Manager{baseCtx: ctx, localPort: localPort}
}

func (m *Manager) Apply(cfg *RuntimeConfig) {
	m.mu.Lock()
	if m.cancel != nil {
		m.cancel()
		m.cancel = nil
	}
	m.active = cfg
	if cfg == nil || strings.TrimSpace(cfg.CloudAddr) == "" || strings.TrimSpace(cfg.AgentDeviceID) == "" {
		m.mu.Unlock()
		log.Printf("[cloud] disabled")
		return
	}
	runCtx, cancel := context.WithCancel(m.baseCtx)
	m.cancel = cancel
	m.mu.Unlock()

	log.Printf("[cloud] apply device_id=%s addr=%s", cfg.AgentDeviceID, cfg.CloudAddr)
	startRegister(runCtx, cfg)
	StartTunnelClient(runCtx, cfg.CloudAddr, cfg.AgentDeviceID, cfg.AgentSecret, m.localPort, cfg.AgentTunnelUnaryTimeout)
}

func startRegister(ctx context.Context, cfg *RuntimeConfig) {
	go func() {
		backoff := time.Second
		for {
			if ctx.Err() != nil {
				return
			}
			conn, err := grpc.DialContext(ctx, cfg.CloudAddr, grpc.WithInsecure())
			if err != nil {
				log.Printf("[cloud] dial failed: %v", err)
				time.Sleep(backoff)
				if backoff < 15*time.Second {
					backoff *= 2
				}
				continue
			}
			client := cloudpb.NewAgentServiceClient(conn)
			rctx, cancel := context.WithTimeout(ctx, 5*time.Second)
			_, err = client.Register(rctx, &cloudpb.RegisterRequest{
				DeviceId: cfg.AgentDeviceID,
				Secret:   cfg.AgentSecret,
				TtlSec:   120,
			})
			cancel()
			if err != nil {
				log.Printf("[cloud] register failed: %v", err)
				_ = conn.Close()
				time.Sleep(backoff)
				if backoff < 15*time.Second {
					backoff *= 2
				}
				continue
			}
			log.Printf("[cloud] registered device_id=%s via %s", cfg.AgentDeviceID, cfg.CloudAddr)
			hbTicker := time.NewTicker(30 * time.Second)
			defer hbTicker.Stop()
			for {
				select {
				case <-ctx.Done():
					_ = conn.Close()
					return
				case <-hbTicker.C:
					hctx, cc := context.WithTimeout(ctx, 3*time.Second)
					_, herr := client.Heartbeat(hctx, &cloudpb.HeartbeatRequest{DeviceId: cfg.AgentDeviceID})
					cc()
					if herr != nil {
						log.Printf("[cloud] heartbeat failed: %v", herr)
						_ = conn.Close()
						time.Sleep(2 * time.Second)
						goto REREG
					}
				}
			}
		REREG:
			continue
		}
	}()
}
