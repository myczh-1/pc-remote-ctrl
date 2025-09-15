package storage

import (
    "encoding/json"
    "errors"
    "os"
    "path/filepath"
    "sync"
)

type SceneAction struct {
    DeviceID string                 `json:"device_id"`
    Action   string                 `json:"action"`
    Args     map[string]any         `json:"args,omitempty"`
}

type Scene struct {
    ID      string         `json:"id"`
    Name    string         `json:"name"`
    Tags    []string       `json:"tags,omitempty"`
    Actions []SceneAction  `json:"actions"`
}

type ScenesSnapshot struct {
    Version int      `json:"version"`
    Scenes  []Scene  `json:"scenes"`
}

type Scenes struct {
    mu   sync.RWMutex
    path string
    snap ScenesSnapshot
}

func NewScenes(path string) *Scenes {
    return &Scenes{path: path, snap: ScenesSnapshot{Version: 1, Scenes: []Scene{}}}
}

func (s *Scenes) Load() error {
    s.mu.Lock(); defer s.mu.Unlock()
    if s.path == "" { return errors.New("empty scenes file path") }
    b, err := os.ReadFile(s.path)
    if err != nil {
        if errors.Is(err, os.ErrNotExist) { return nil }
        return err
    }
    var snap ScenesSnapshot
    if err := json.Unmarshal(b, &snap); err != nil { return err }
    if snap.Version == 0 { snap.Version = 1 }
    s.snap = snap
    return nil
}

func (s *Scenes) saveSnapshot(snap ScenesSnapshot) error {
    if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil { return err }
    b, err := json.MarshalIndent(snap, "", "  ")
    if err != nil { return err }
    tmp := s.path + ".tmp"
    if err := os.WriteFile(tmp, b, 0o644); err != nil { return err }
    return os.Rename(tmp, s.path)
}

func (s *Scenes) List() []Scene {
    s.mu.RLock(); defer s.mu.RUnlock()
    out := make([]Scene, len(s.snap.Scenes))
    copy(out, s.snap.Scenes)
    return out
}

func (s *Scenes) Get(id string) *Scene {
    s.mu.RLock(); defer s.mu.RUnlock()
    for i := range s.snap.Scenes {
        if s.snap.Scenes[i].ID == id {
            c := s.snap.Scenes[i]
            return &c
        }
    }
    return nil
}

func (s *Scenes) Upsert(sc Scene) error {
    s.mu.Lock()
    found := false
    for i := range s.snap.Scenes {
        if s.snap.Scenes[i].ID == sc.ID {
            s.snap.Scenes[i] = sc
            found = true
            break
        }
    }
    if !found { s.snap.Scenes = append(s.snap.Scenes, sc) }
    snap := s.snap
    s.mu.Unlock()
    return s.saveSnapshot(snap)
}

func (s *Scenes) Remove(id string) error {
    s.mu.Lock()
    out := s.snap.Scenes[:0]
    for _, sc := range s.snap.Scenes {
        if sc.ID != id { out = append(out, sc) }
    }
    s.snap.Scenes = out
    snap := s.snap
    s.mu.Unlock()
    return s.saveSnapshot(snap)
}

