package storage

import (
    "encoding/json"
    "errors"
    "os"
    "path/filepath"
    "sync"
)

// Minimal rule model for future automation (IFTTT style).
type Rule struct {
    ID     string         `json:"id"`
    Name   string         `json:"name"`
    Tags   []string       `json:"tags,omitempty"`
    When   map[string]any `json:"when"`   // trigger conditions (placeholder)
    Then   []SceneAction  `json:"then"`   // reuse SceneAction for actions
    Enable bool           `json:"enable"`
}

type AutomationsSnapshot struct {
    Version int    `json:"version"`
    Rules   []Rule `json:"rules"`
}

type Automations struct {
    mu   sync.RWMutex
    path string
    snap AutomationsSnapshot
}

func NewAutomations(path string) *Automations {
    return &Automations{path: path, snap: AutomationsSnapshot{Version: 1, Rules: []Rule{}}}
}

func (a *Automations) Load() error {
    a.mu.Lock(); defer a.mu.Unlock()
    if a.path == "" { return errors.New("empty automations file path") }
    b, err := os.ReadFile(a.path)
    if err != nil {
        if errors.Is(err, os.ErrNotExist) { return nil }
        return err
    }
    var snap AutomationsSnapshot
    if err := json.Unmarshal(b, &snap); err != nil { return err }
    if snap.Version == 0 { snap.Version = 1 }
    a.snap = snap
    return nil
}

func (a *Automations) saveSnapshot(snap AutomationsSnapshot) error {
    if err := os.MkdirAll(filepath.Dir(a.path), 0o755); err != nil { return err }
    b, err := json.MarshalIndent(snap, "", "  ")
    if err != nil { return err }
    tmp := a.path + ".tmp"
    if err := os.WriteFile(tmp, b, 0o644); err != nil { return err }
    return os.Rename(tmp, a.path)
}

func (a *Automations) List() []Rule {
    a.mu.RLock(); defer a.mu.RUnlock()
    out := make([]Rule, len(a.snap.Rules))
    copy(out, a.snap.Rules)
    return out
}

func (a *Automations) Get(id string) *Rule {
    a.mu.RLock(); defer a.mu.RUnlock()
    for i := range a.snap.Rules {
        if a.snap.Rules[i].ID == id {
            r := a.snap.Rules[i]
            return &r
        }
    }
    return nil
}

func (a *Automations) Upsert(r Rule) error {
    a.mu.Lock()
    found := false
    for i := range a.snap.Rules {
        if a.snap.Rules[i].ID == r.ID {
            a.snap.Rules[i] = r
            found = true
            break
        }
    }
    if !found { a.snap.Rules = append(a.snap.Rules, r) }
    snap := a.snap
    a.mu.Unlock()
    return a.saveSnapshot(snap)
}

func (a *Automations) Remove(id string) error {
    a.mu.Lock()
    out := a.snap.Rules[:0]
    for _, r := range a.snap.Rules {
        if r.ID != id { out = append(out, r) }
    }
    a.snap.Rules = out
    snap := a.snap
    a.mu.Unlock()
    return a.saveSnapshot(snap)
}

