package storage

import (
    "encoding/json"
    "fmt"
    "log"
    "os"
    "path/filepath"
    "sync"

    "pc-remote-ctrl/backend/internal/executor"
)

// Storage handles command set persistence
type Storage struct {
    mu         sync.RWMutex
    commandSets map[string]*executor.CommandSet // guarded by mu
    filename    string
}

// New creates a new storage instance
func New(filename string) *Storage {
    return &Storage{
        filename:    filename,
        commandSets: make(map[string]*executor.CommandSet),
    }
}

// Load loads command sets from file
func (s *Storage) Load() error {
    data, err := os.ReadFile(s.filename)
    if err != nil {
        if os.IsNotExist(err) {
            log.Printf("%s not found, starting with empty command sets", s.filename)
            return nil
        }
        return fmt.Errorf("read command sets file: %w", err)
    }

    var tempMap map[string]*executor.CommandSet
    if err := json.Unmarshal(data, &tempMap); err != nil {
        return fmt.Errorf("unmarshal command sets: %w", err)
    }

    s.mu.Lock()
    s.commandSets = make(map[string]*executor.CommandSet, len(tempMap))
    for id, cs := range tempMap {
        s.commandSets[id] = cs
    }
    s.mu.Unlock()

    log.Printf("loaded %d command sets from file", len(tempMap))
    return nil
}

// Save saves command sets to file using atomic rename
func (s *Storage) Save() error {
    // Take a consistent snapshot without holding the lock during IO
    s.mu.RLock()
    snapshot := make(map[string]*executor.CommandSet, len(s.commandSets))
    for k, v := range s.commandSets {
        snapshot[k] = v
    }
    s.mu.RUnlock()

    data, err := json.Marshal(snapshot)
    if err != nil {
        return fmt.Errorf("marshal command sets: %w", err)
    }

    dir := filepath.Dir(s.filename)
    base := filepath.Base(s.filename)
    tmpFile, err := os.CreateTemp(dir, base+".tmp-*")
    if err != nil {
        return fmt.Errorf("create temp file: %w", err)
    }
    tmpName := tmpFile.Name()
    // Ensure cleanup on failures
    defer func() {
        _ = tmpFile.Close()
        _ = os.Remove(tmpName)
    }()

    if _, err := tmpFile.Write(data); err != nil {
        return fmt.Errorf("write temp file: %w", err)
    }
    if err := tmpFile.Sync(); err != nil { // flush to disk
        return fmt.Errorf("fsync temp file: %w", err)
    }
    if err := tmpFile.Chmod(0644); err != nil {
        return fmt.Errorf("chmod temp file: %w", err)
    }
    if err := tmpFile.Close(); err != nil {
        return fmt.Errorf("close temp file: %w", err)
    }

    if err := os.Rename(tmpName, s.filename); err != nil { // atomic on same filesystem
        return fmt.Errorf("rename temp file: %w", err)
    }
    return nil
}

// Store stores a command set
func (s *Storage) Store(id string, cmdSet *executor.CommandSet) error {
    s.mu.Lock()
    if s.commandSets == nil {
        s.commandSets = make(map[string]*executor.CommandSet)
    }
    s.commandSets[id] = cmdSet
    s.mu.Unlock()
    return s.Save()
}

// Get retrieves a command set by ID
func (s *Storage) Get(id string) *executor.CommandSet {
    s.mu.RLock()
    defer s.mu.RUnlock()
    if s.commandSets == nil {
        return nil
    }
    return s.commandSets[id]
}

// GetAll returns a shallow copy of all command sets
func (s *Storage) GetAll() map[string]*executor.CommandSet {
    s.mu.RLock()
    defer s.mu.RUnlock()
    result := make(map[string]*executor.CommandSet, len(s.commandSets))
    for k, v := range s.commandSets {
        result[k] = v
    }
    return result
}

// Delete removes a command set by ID
func (s *Storage) Delete(id string) error {
    s.mu.Lock()
    if s.commandSets != nil {
        delete(s.commandSets, id)
    }
    s.mu.Unlock()
    return s.Save()
}
