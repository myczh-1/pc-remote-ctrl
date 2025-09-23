package storage

import (
    "encoding/json"
    "errors"
    "os"
    "path/filepath"
    "sync"
    "time"
)

type AdapterKind string

const (
    AdapterMQTT  AdapterKind = "mqtt"
    AdapterSerial AdapterKind = "serial"
    AdapterHTTP   AdapterKind = "http"
)

type Device struct {
    ID        string                 `json:"id"`
    Name      string                 `json:"name"`
    Type      string                 `json:"type"`
    Room      string                 `json:"room,omitempty"`
    Tags      []string               `json:"tags,omitempty"`
    Adapter   DeviceAdapter          `json:"adapter"`
    Topics    map[string]string      `json:"topics,omitempty"`
    Actions   []ActionSpec           `json:"actions,omitempty"`
    Shadow    Shadow                 `json:"shadow"`
    Online    bool                   `json:"online"`
    LastSeen  int64                  `json:"last_seen"`
    Provision map[string]any         `json:"provision,omitempty"`
    Meta      map[string]any         `json:"meta,omitempty"`
}

type DeviceAdapter struct {
    Kind   AdapterKind        `json:"kind"`
    Config map[string]any     `json:"config,omitempty"`
}

type ActionSpec struct {
    Name      string         `json:"name"`
    ArgsSchema map[string]any `json:"args_schema,omitempty"`
    TimeoutMS int            `json:"timeout_ms,omitempty"`
}

type Shadow struct {
    Reported   map[string]any `json:"reported,omitempty"`
    Desired    map[string]any `json:"desired,omitempty"`
    Version    int64          `json:"version,omitempty"`
    TSReported int64          `json:"ts_reported,omitempty"`
    TSDesired  int64          `json:"ts_desired,omitempty"`
}

type DevicesSnapshot struct {
    Version int       `json:"version"`
    Devices []Device  `json:"devices"`
}

type Devices struct {
    mu   sync.RWMutex
    path string
    snap DevicesSnapshot
}

func NewDevices(path string) *Devices {
    return &Devices{path: path, snap: DevicesSnapshot{Version: 1, Devices: []Device{}}}
}

func (r *Devices) Load() error {
    r.mu.Lock()
    defer r.mu.Unlock()
    if r.path == "" { return errors.New("empty devices file path") }
    data, err := os.ReadFile(r.path)
    if err != nil {
        if errors.Is(err, os.ErrNotExist) { return nil }
        return err
    }
    var snap DevicesSnapshot
    if err := json.Unmarshal(data, &snap); err != nil { return err }
    if snap.Version == 0 { snap.Version = 1 }
    r.snap = snap
    return nil
}

func (r *Devices) saveSnapshot(snap DevicesSnapshot) error {
    if err := os.MkdirAll(filepath.Dir(r.path), 0o755); err != nil { return err }
    b, err := json.MarshalIndent(snap, "", "  ")
    if err != nil { return err }
    tmp := r.path + ".tmp"
    if err := os.WriteFile(tmp, b, 0o644); err != nil { return err }
    return os.Rename(tmp, r.path)
}

func (r *Devices) List() []Device {
    r.mu.RLock(); defer r.mu.RUnlock()
    out := make([]Device, len(r.snap.Devices))
    for i := range r.snap.Devices {
        out[i] = cloneDevice(r.snap.Devices[i])
    }
    return out
}

func (r *Devices) Get(id string) *Device {
    r.mu.RLock(); defer r.mu.RUnlock()
    for i := range r.snap.Devices {
        if r.snap.Devices[i].ID == id {
            cd := cloneDevice(r.snap.Devices[i])
            return &cd
        }
    }
    return nil
}

func (r *Devices) Upsert(d Device) error {
    r.mu.Lock()
    now := time.Now().UnixMilli()
    if d.LastSeen == 0 { d.LastSeen = now }
    found := false
    for i := range r.snap.Devices {
        if r.snap.Devices[i].ID == d.ID {
            r.snap.Devices[i] = d
            found = true
            break
        }
    }
    if !found { r.snap.Devices = append(r.snap.Devices, d) }
    snap := r.snap
    r.mu.Unlock()
    return r.saveSnapshot(snap)
}

func (r *Devices) Remove(id string) error {
    r.mu.Lock()
    out := r.snap.Devices[:0]
    for _, d := range r.snap.Devices {
        if d.ID != id { out = append(out, d) }
    }
    r.snap.Devices = out
    snap := r.snap
    r.mu.Unlock()
    return r.saveSnapshot(snap)
}

// clone helpers ensure callers never alias internal maps/slices
func cloneDevice(d Device) Device {
    cd := d // copy by value (scalars)
    // slices / maps deep copy
    if d.Tags != nil {
        cd.Tags = append([]string(nil), d.Tags...)
    }
    if d.Topics != nil {
        cd.Topics = cloneMapStringString(d.Topics)
    }
    if d.Actions != nil {
        cd.Actions = make([]ActionSpec, len(d.Actions))
        for i := range d.Actions {
            cd.Actions[i] = cloneActionSpec(d.Actions[i])
        }
    }
    // Adapter
    cd.Adapter = DeviceAdapter{Kind: d.Adapter.Kind}
    if d.Adapter.Config != nil {
        cd.Adapter.Config = cloneMapStringAny(d.Adapter.Config)
    }
    // Shadow
    cd.Shadow = Shadow{
        Version:    d.Shadow.Version,
        TSReported: d.Shadow.TSReported,
        TSDesired:  d.Shadow.TSDesired,
    }
    if d.Shadow.Reported != nil {
        cd.Shadow.Reported = cloneMapStringAny(d.Shadow.Reported)
    }
    if d.Shadow.Desired != nil {
        cd.Shadow.Desired = cloneMapStringAny(d.Shadow.Desired)
    }
    // Provision / Meta
    if d.Provision != nil { cd.Provision = cloneMapStringAny(d.Provision) }
    if d.Meta != nil { cd.Meta = cloneMapStringAny(d.Meta) }
    return cd
}

func cloneActionSpec(a ActionSpec) ActionSpec {
    ca := a
    if a.ArgsSchema != nil {
        ca.ArgsSchema = cloneMapStringAny(a.ArgsSchema)
    }
    return ca
}

func cloneMapStringString(m map[string]string) map[string]string {
    out := make(map[string]string, len(m))
    for k, v := range m { out[k] = v }
    return out
}

func cloneMapStringAny(m map[string]any) map[string]any {
    out := make(map[string]any, len(m))
    for k, v := range m { out[k] = v }
    return out
}
