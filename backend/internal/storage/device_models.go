package storage

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type DeviceModel struct {
	ID          string
	Version     string
	Name        string
	Description string
	Tags        []string
	Actions     []ActionSpec
	StateSchema map[string]string
	UpdatedAt   int64
}

type DeviceModels struct {
	mu   sync.RWMutex
	path string
	db   *sql.DB
}

func NewDeviceModels(path string) *DeviceModels { return &DeviceModels{path: path} }

func (m *DeviceModels) Load() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if strings.TrimSpace(m.path) == "" {
		return errors.New("empty device models database path")
	}
	if err := os.MkdirAll(filepath.Dir(m.path), 0o755); err != nil {
		return fmt.Errorf("make model data dir: %w", err)
	}
	db, err := sql.Open("sqlite", m.path)
	if err != nil {
		return fmt.Errorf("open sqlite: %w", err)
	}
	if _, err := db.Exec(`PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;`); err != nil {
		_ = db.Close()
		return fmt.Errorf("init pragmas: %w", err)
	}
	if err := createDeviceModelSchema(db); err != nil {
		_ = db.Close()
		return err
	}
	m.db = db
	return nil
}

func createDeviceModelSchema(db *sql.DB) error {
	ddl := []string{
		`CREATE TABLE IF NOT EXISTS device_models (
            id TEXT NOT NULL,
            version TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            tags TEXT,
            actions TEXT,
            state_schema TEXT,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (id, version)
        );`,
		`CREATE INDEX IF NOT EXISTS idx_device_models_id ON device_models(id);`,
		`CREATE INDEX IF NOT EXISTS idx_device_models_updated ON device_models(updated_at DESC);`,
	}
	for _, stmt := range ddl {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("init device_models schema: %w", err)
		}
	}
	return nil
}

func (m *DeviceModels) Upsert(model DeviceModel) error {
	m.mu.RLock()
	db := m.db
	m.mu.RUnlock()
	if db == nil {
		return errors.New("device model storage not initialized")
	}
	if strings.TrimSpace(model.ID) == "" || strings.TrimSpace(model.Version) == "" {
		return errors.New("model id and version required")
	}
	if model.UpdatedAt == 0 {
		model.UpdatedAt = time.Now().UnixMilli()
	}
	tagsJSON, err := marshalJSON(model.Tags)
	if err != nil {
		return err
	}
	actionsJSON, err := marshalJSON(model.Actions)
	if err != nil {
		return err
	}
	stateSchemaJSON, err := marshalJSON(model.StateSchema)
	if err != nil {
		return err
	}
	_, err = db.Exec(`
        INSERT INTO device_models (id, version, name, description, tags, actions, state_schema, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id, version) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            tags = excluded.tags,
            actions = excluded.actions,
            state_schema = excluded.state_schema,
            updated_at = excluded.updated_at
    `, model.ID, model.Version, model.Name, nullString(model.Description), tagsJSON, actionsJSON, stateSchemaJSON, model.UpdatedAt)
	return err
}

func (m *DeviceModels) Remove(id, version string) error {
	m.mu.RLock()
	db := m.db
	m.mu.RUnlock()
	if db == nil {
		return errors.New("device model storage not initialized")
	}
	_, err := db.Exec(`DELETE FROM device_models WHERE id = ? AND version = ?`, id, version)
	return err
}

func (m *DeviceModels) Get(id, version string) *DeviceModel {
	m.mu.RLock()
	db := m.db
	m.mu.RUnlock()
	if db == nil {
		return nil
	}
	row := db.QueryRow(`SELECT id, version, name, description, tags, actions, state_schema, updated_at FROM device_models WHERE id = ? AND version = ?`, id, version)
	var (
		name            string
		descriptionSQL  sql.NullString
		tagsJSON        sql.NullString
		actionsJSON     sql.NullString
		stateSchemaJSON sql.NullString
		updatedAt       int64
	)
	if err := row.Scan(&id, &version, &name, &descriptionSQL, &tagsJSON, &actionsJSON, &stateSchemaJSON, &updatedAt); err != nil {
		return nil
	}
	out := DeviceModel{
		ID:          id,
		Version:     version,
		Name:        name,
		Description: descriptionSQL.String,
		UpdatedAt:   updatedAt,
	}
	if tagsJSON.Valid && tagsJSON.String != "" {
		_ = json.Unmarshal([]byte(tagsJSON.String), &out.Tags)
	}
	if actionsJSON.Valid && actionsJSON.String != "" {
		_ = json.Unmarshal([]byte(actionsJSON.String), &out.Actions)
	}
	if stateSchemaJSON.Valid && stateSchemaJSON.String != "" {
		_ = json.Unmarshal([]byte(stateSchemaJSON.String), &out.StateSchema)
	}
	return &out
}

type ListDeviceModelsOptions struct {
	ID           string
	NameContains string
	Limit        int
}

func (m *DeviceModels) List(opts ListDeviceModelsOptions) ([]DeviceModel, error) {
	m.mu.RLock()
	db := m.db
	m.mu.RUnlock()
	if db == nil {
		return nil, errors.New("device model storage not initialized")
	}
	limit := opts.Limit
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	q := `SELECT id, version, name, description, tags, actions, state_schema, updated_at FROM device_models WHERE 1=1`
	args := []any{}
	if id := strings.TrimSpace(opts.ID); id != "" {
		q += " AND id = ?"
		args = append(args, id)
	}
	if name := strings.TrimSpace(opts.NameContains); name != "" {
		q += " AND LOWER(name) LIKE ?"
		args = append(args, "%"+strings.ToLower(name)+"%")
	}
	q += " ORDER BY updated_at DESC LIMIT ?"
	args = append(args, limit)
	rows, err := db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []DeviceModel
	for rows.Next() {
		var (
			id, version, name string
			descriptionSQL    sql.NullString
			tagsJSON          sql.NullString
			actionsJSON       sql.NullString
			stateSchemaJSON   sql.NullString
			updatedAt         int64
		)
		if err := rows.Scan(&id, &version, &name, &descriptionSQL, &tagsJSON, &actionsJSON, &stateSchemaJSON, &updatedAt); err != nil {
			return nil, err
		}
		model := DeviceModel{
			ID:          id,
			Version:     version,
			Name:        name,
			Description: descriptionSQL.String,
			UpdatedAt:   updatedAt,
		}
		if tagsJSON.Valid && tagsJSON.String != "" {
			_ = json.Unmarshal([]byte(tagsJSON.String), &model.Tags)
		}
		if actionsJSON.Valid && actionsJSON.String != "" {
			_ = json.Unmarshal([]byte(actionsJSON.String), &model.Actions)
		}
		if stateSchemaJSON.Valid && stateSchemaJSON.String != "" {
			_ = json.Unmarshal([]byte(stateSchemaJSON.String), &model.StateSchema)
		}
		out = append(out, model)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}
