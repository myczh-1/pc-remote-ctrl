package registry

import (
    "log"
    "sync"
    "time"

    "google.golang.org/grpc"
)

type DeviceEntry struct {
    DeviceID string
    Addr     string
    Conn     *grpc.ClientConn
    Tags     []string
    Expires  time.Time
}

// MemoryRegistry keeps device routing info in-memory.
type MemoryRegistry struct {
    mu        sync.RWMutex
    devices   map[string]*DeviceEntry
    defaultUpstream string // fallback address when device not registered
}

func NewMemoryRegistry(defaultUpstream string) *MemoryRegistry {
    r := &MemoryRegistry{
        devices: make(map[string]*DeviceEntry),
        defaultUpstream: defaultUpstream,
    }
    go r.gc()
    return r
}

func (r *MemoryRegistry) gc() {
    t := time.NewTicker(30 * time.Second)
    defer t.Stop()
    for range t.C {
        now := time.Now()
        r.mu.Lock()
        for id, e := range r.devices {
            if e.Expires.Before(now) {
                if e.Conn != nil {
                    _ = e.Conn.Close()
                }
                delete(r.devices, id)
            }
        }
        r.mu.Unlock()
    }
}

func (r *MemoryRegistry) Upsert(id, addr string, ttl time.Duration, tags []string) {
    r.mu.Lock()
    defer r.mu.Unlock()
    e, ok := r.devices[id]
    if !ok {
        e = &DeviceEntry{DeviceID: id}
        r.devices[id] = e
    }
    e.Addr = addr
    e.Tags = tags
    e.Expires = time.Now().Add(ttl)
}

func (r *MemoryRegistry) Heartbeat(id string, extend time.Duration) bool {
    r.mu.Lock()
    defer r.mu.Unlock()
    e, ok := r.devices[id]
    if !ok {
        return false
    }
    e.Expires = time.Now().Add(extend)
    return true
}

func (r *MemoryRegistry) Get(id string) (*DeviceEntry, bool) {
    r.mu.RLock()
    e, ok := r.devices[id]
    r.mu.RUnlock()
    if ok {
        return e, true
    }
    if r.defaultUpstream != "" {
        return &DeviceEntry{DeviceID: "", Addr: r.defaultUpstream}, true
    }
    return nil, false
}

func (r *MemoryRegistry) SetConn(id string, conn *grpc.ClientConn) {
    r.mu.Lock()
    defer r.mu.Unlock()
    e, ok := r.devices[id]
    if !ok {
        log.Printf("registry: SetConn for unknown id=%s", id)
        return
    }
    // close old conn if replaced
    if e.Conn != nil && e.Conn != conn {
        _ = e.Conn.Close()
    }
    e.Conn = conn
}
