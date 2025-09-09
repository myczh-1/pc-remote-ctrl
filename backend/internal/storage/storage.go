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
	commandSets sync.Map // map[string]*executor.CommandSet
	filename    string
}

// New creates a new storage instance
func New(filename string) *Storage {
	return &Storage{
		filename: filename,
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

	// Load data into sync.Map
	count := 0
	for id, cmdSet := range tempMap {
		s.commandSets.Store(id, cmdSet)
		count++
	}

	log.Printf("loaded %d command sets from file", count)
	return nil
}

// Save saves command sets to file
func (s *Storage) Save() error {
	tempMap := make(map[string]*executor.CommandSet)
	
	s.commandSets.Range(func(key, value interface{}) bool {
		tempMap[key.(string)] = value.(*executor.CommandSet)
		return true
	})
	
	data, err := json.Marshal(tempMap)
	if err != nil {
		return fmt.Errorf("marshal command sets: %w", err)
	}

	return os.WriteFile(s.filename, data, 0644)
}

// Store stores a command set
func (s *Storage) Store(id string, cmdSet *executor.CommandSet) error {
	s.commandSets.Store(id, cmdSet)
	return s.Save()
}

// Get retrieves a command set by ID
func (s *Storage) Get(id string) *executor.CommandSet {
	value, ok := s.commandSets.Load(id)
	if !ok {
		return nil
	}
	return value.(*executor.CommandSet)
}

// GetAll returns all command sets
func (s *Storage) GetAll() map[string]*executor.CommandSet {
	result := make(map[string]*executor.CommandSet)
	s.commandSets.Range(func(key, value interface{}) bool {
		result[key.(string)] = value.(*executor.CommandSet)
		return true
	})
	return result
}