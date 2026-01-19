package storage

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type AutomationAction struct {
	DeviceID string         `json:"device_id"`
	Action   string         `json:"action"`
	Args     map[string]any `json:"args,omitempty"`
}

type AutomationCondition struct {
	DeviceID string `json:"device_id"`
	Kind     string `json:"kind"`
	Path     string `json:"path,omitempty"`
	Op       string `json:"op,omitempty"`
	Value    any    `json:"value,omitempty"`
}

type AutomationWhen struct {
	Logic      string                `json:"logic"`
	Conditions []AutomationCondition `json:"conditions"`
}

type Automation struct {
	ID        string             `json:"id"`
	Name      string             `json:"name"`
	Tags      []string           `json:"tags,omitempty"`
	When      AutomationWhen     `json:"when"`
	Then      []AutomationAction `json:"then"`
	Enabled   bool               `json:"enabled"`
	UpdatedAt int64              `json:"updated_at"`
}

type ListAutomationsOptions struct {
	IncludeDisabled bool
	PageSize        int
	PageToken       string // format: "<updated_at>:<id>"
	Tag             string
	NameContains    string
}

// Automations persists automation definitions in SQLite with JSON payloads.
type Automations struct {
	mu   sync.RWMutex
	path string
	db   *sql.DB
}

func NewAutomations(path string) *Automations {
	return &Automations{path: path}
}

func (a *Automations) Load() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if strings.TrimSpace(a.path) == "" {
		return errors.New("empty automations database path")
	}
	if strings.HasSuffix(strings.ToLower(strings.TrimSpace(a.path)), ".json") {
		return fmt.Errorf("json automation files are not supported; set HOME_AUTOMATIONS_DB to a sqlite path (got %s)", a.path)
	}
	if err := os.MkdirAll(filepath.Dir(a.path), 0o755); err != nil {
		return fmt.Errorf("make automations data dir: %w", err)
	}
	db, err := sql.Open("sqlite", a.path)
	if err != nil {
		return fmt.Errorf("open sqlite: %w", err)
	}
	if _, err := db.Exec(`PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;`); err != nil {
		_ = db.Close()
		return fmt.Errorf("init automations pragmas: %w", err)
	}
	if err := createAutomationSchema(db); err != nil {
		_ = db.Close()
		return err
	}
	a.db = db
	return nil
}

func createAutomationSchema(db *sql.DB) error {
	ddl := []string{
		`CREATE TABLE IF NOT EXISTS automations (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            tags TEXT,
            when_json TEXT,
            then_json TEXT,
            enabled INTEGER NOT NULL DEFAULT 1,
            updated_at INTEGER NOT NULL
        );`,
		`CREATE INDEX IF NOT EXISTS idx_automations_enabled ON automations(enabled);`,
		`CREATE INDEX IF NOT EXISTS idx_automations_updated ON automations(updated_at DESC, id DESC);`,
	}
	for _, stmt := range ddl {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("init automations schema: %w", err)
		}
	}
	return nil
}

func (a *Automations) Upsert(auto Automation) error {
	a.mu.RLock()
	db := a.db
	a.mu.RUnlock()
	if db == nil {
		return errors.New("automation storage not initialized")
	}
	if strings.TrimSpace(auto.ID) == "" {
		return errors.New("automation id required")
	}
	if auto.UpdatedAt == 0 {
		auto.UpdatedAt = time.Now().UnixMilli()
	}
	tags, err := marshalJSON(auto.Tags)
	if err != nil {
		return err
	}
	whenJSON, err := marshalJSON(auto.When)
	if err != nil {
		return err
	}
	thenJSON, err := marshalJSON(auto.Then)
	if err != nil {
		return err
	}
	_, err = db.Exec(`
        INSERT INTO automations (id, name, tags, when_json, then_json, enabled, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            tags = excluded.tags,
            when_json = excluded.when_json,
            then_json = excluded.then_json,
            enabled = excluded.enabled,
            updated_at = excluded.updated_at
    `, auto.ID, auto.Name, tags, whenJSON, thenJSON, boolToInt(auto.Enabled), auto.UpdatedAt)
	return err
}

func (a *Automations) Remove(id string) error {
	a.mu.RLock()
	db := a.db
	a.mu.RUnlock()
	if db == nil {
		return errors.New("automation storage not initialized")
	}
	_, err := db.Exec(`DELETE FROM automations WHERE id = ?`, id)
	return err
}

func (a *Automations) Get(id string) *Automation {
	a.mu.RLock()
	db := a.db
	a.mu.RUnlock()
	if db == nil {
		return nil
	}
	row := db.QueryRow(`SELECT id, name, tags, when_json, then_json, enabled, updated_at FROM automations WHERE id = ?`, id)
	var (
		name                         string
		tagsJSON, whenJSON, thenJSON sql.NullString
		enabledInt                   int
		updatedAt                    int64
	)
	if err := row.Scan(&id, &name, &tagsJSON, &whenJSON, &thenJSON, &enabledInt, &updatedAt); err != nil {
		return nil
	}
	auto := Automation{ID: id, Name: name, Enabled: enabledInt != 0, UpdatedAt: updatedAt}
	if tagsJSON.Valid && tagsJSON.String != "" {
		_ = json.Unmarshal([]byte(tagsJSON.String), &auto.Tags)
	}
	if whenJSON.Valid && whenJSON.String != "" {
		_ = json.Unmarshal([]byte(whenJSON.String), &auto.When)
	}
	if thenJSON.Valid && thenJSON.String != "" {
		_ = json.Unmarshal([]byte(thenJSON.String), &auto.Then)
	}
	return &auto
}

func (a *Automations) SetEnabled(id string, enabled bool) error {
	a.mu.RLock()
	db := a.db
	a.mu.RUnlock()
	if db == nil {
		return errors.New("automation storage not initialized")
	}
	_, err := db.Exec(`UPDATE automations SET enabled = ?, updated_at = ? WHERE id = ?`, boolToInt(enabled), time.Now().UnixMilli(), id)
	return err
}

func (a *Automations) List(opts ListAutomationsOptions) ([]Automation, string, error) {
	a.mu.RLock()
	db := a.db
	a.mu.RUnlock()
	if db == nil {
		return nil, "", errors.New("automation storage not initialized")
	}
	pageSize := opts.PageSize
	if pageSize <= 0 || pageSize > 200 {
		pageSize = 50
	}

	requestedTag := strings.TrimSpace(opts.Tag)
	nameSubstr := strings.ToLower(strings.TrimSpace(opts.NameContains))
	parseToken := func(tok string) (int64, string, error) {
		if strings.TrimSpace(tok) == "" {
			return 0, "", nil
		}
		parts := strings.Split(tok, ":")
		if len(parts) != 2 {
			return 0, "", fmt.Errorf("invalid page_token")
		}
		ts, err := strconv.ParseInt(parts[0], 10, 64)
		if err != nil {
			return 0, "", fmt.Errorf("invalid page_token ts")
		}
		return ts, parts[1], nil
	}

	fetchPage := func(tok string, limit int) ([]Automation, error) {
		lastTS, lastID, err := parseToken(tok)
		if err != nil {
			return nil, err
		}
		q := `SELECT id, name, tags, when_json, then_json, enabled, updated_at FROM automations WHERE 1=1`
		args := []any{}
		if !opts.IncludeDisabled {
			q += " AND enabled = 1"
		}
		if lastTS > 0 || lastID != "" {
			q += " AND (updated_at < ? OR (updated_at = ? AND id < ?))"
			args = append(args, lastTS, lastTS, lastID)
		}
		q += " ORDER BY updated_at DESC, id DESC LIMIT ?"
		args = append(args, limit)

		rows, err := db.Query(q, args...)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		batch := []Automation{}
		for rows.Next() {
			var (
				id, name                     string
				tagsJSON, whenJSON, thenJSON sql.NullString
				enabledInt                   int
				updatedAt                    int64
			)
			if err := rows.Scan(&id, &name, &tagsJSON, &whenJSON, &thenJSON, &enabledInt, &updatedAt); err != nil {
				return nil, err
			}
			auto := Automation{ID: id, Name: name, Enabled: enabledInt != 0, UpdatedAt: updatedAt}
			if tagsJSON.Valid && tagsJSON.String != "" {
				_ = json.Unmarshal([]byte(tagsJSON.String), &auto.Tags)
			}
			if whenJSON.Valid && whenJSON.String != "" {
				_ = json.Unmarshal([]byte(whenJSON.String), &auto.When)
			}
			if thenJSON.Valid && thenJSON.String != "" {
				_ = json.Unmarshal([]byte(thenJSON.String), &auto.Then)
			}
			batch = append(batch, auto)
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return batch, nil
	}

	out := []Automation{}
	pageToken := strings.TrimSpace(opts.PageToken)
	limit := pageSize + 1

	for {
		batch, err := fetchPage(pageToken, limit)
		if err != nil {
			return nil, "", err
		}
		if len(batch) == 0 {
			return out, "", nil
		}
		for _, auto := range batch {
			if requestedTag != "" && !hasTag(auto.Tags, requestedTag) {
				continue
			}
			if nameSubstr != "" && !strings.Contains(strings.ToLower(auto.Name), nameSubstr) {
				continue
			}
			out = append(out, auto)
			if len(out) > pageSize {
				last := out[pageSize-1]
				next := fmt.Sprintf("%d:%s", last.UpdatedAt, last.ID)
				return out[:pageSize], next, nil
			}
		}
		if len(batch) < limit {
			return out, "", nil
		}
		last := batch[len(batch)-1]
		pageToken = fmt.Sprintf("%d:%s", last.UpdatedAt, last.ID)
	}
}

func hasTag(tags []string, t string) bool {
	for _, tag := range tags {
		if strings.EqualFold(strings.TrimSpace(tag), strings.TrimSpace(t)) {
			return true
		}
	}
	return false
}
