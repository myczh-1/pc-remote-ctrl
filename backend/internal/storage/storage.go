package storage

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sync"

	"pc-remote-ctrl/backend/internal/executor"
)

// Storage handles command set persistence
type Storage struct {
	commandSets map[string]*executor.CommandSet
	mu          sync.RWMutex
	filename    string
}

// New creates a new storage instance
func New(filename string) *Storage {
	return &Storage{
		commandSets: make(map[string]*executor.CommandSet),
		filename:    filename,
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

	s.mu.Lock()
	defer s.mu.Unlock()
	
	if err := json.Unmarshal(data, &s.commandSets); err != nil {
		return fmt.Errorf("unmarshal command sets: %w", err)
	}

	log.Printf("loaded %d command sets from file", len(s.commandSets))
	return nil
}

// Save saves command sets to file
func (s *Storage) Save() error {
	s.mu.RLock()
	data, err := json.Marshal(s.commandSets)
	s.mu.RUnlock()
	if err != nil {
		return fmt.Errorf("marshal command sets: %w", err)
	}

	return os.WriteFile(s.filename, data, 0644)
}

// Store stores a command set
func (s *Storage) Store(id string, cmdSet *executor.CommandSet) error {
	s.mu.Lock()
	s.commandSets[id] = cmdSet
	s.mu.Unlock()

	return s.Save()
}

// Get retrieves a command set by ID
func (s *Storage) Get(id string) *executor.CommandSet {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.commandSets[id]
}

// GetAll returns all command sets
func (s *Storage) GetAll() map[string]*executor.CommandSet {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	result := make(map[string]*executor.CommandSet)
	for k, v := range s.commandSets {
		result[k] = v
	}
	return result
}