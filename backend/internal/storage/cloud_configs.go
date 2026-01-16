package storage

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type CloudConfig struct {
	ID                        string
	Name                      string
	CloudAddr                 string
	AgentDeviceID             string
	AgentSecret               string
	AgentTunnelUnaryTimeoutMS int
	Active                    bool
	UpdatedAt                 int64
}

type CloudConfigs struct {
	mu   sync.RWMutex
	path string
	db   *sql.DB
}

func NewCloudConfigs(path string) *CloudConfigs {
	return &CloudConfigs{path: path}
}

func (c *CloudConfigs) Load() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if strings.TrimSpace(c.path) == "" {
		return errors.New("empty cloud configs database path")
	}
	if strings.HasSuffix(strings.ToLower(strings.TrimSpace(c.path)), ".json") {
		return fmt.Errorf("json configs are not supported; set HOME_DEVICES_DB to a sqlite path (got %s)", c.path)
	}
	if err := os.MkdirAll(filepath.Dir(c.path), 0o755); err != nil {
		return fmt.Errorf("make configs data dir: %w", err)
	}
	db, err := sql.Open("sqlite", c.path)
	if err != nil {
		return fmt.Errorf("open sqlite: %w", err)
	}
	if _, err := db.Exec(`PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;`); err != nil {
		_ = db.Close()
		return fmt.Errorf("init configs pragmas: %w", err)
	}
	if err := createCloudConfigSchema(db); err != nil {
		_ = db.Close()
		return err
	}
	c.db = db
	return nil
}

func createCloudConfigSchema(db *sql.DB) error {
	ddl := []string{
		`CREATE TABLE IF NOT EXISTS cloud_configs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            cloud_addr TEXT NOT NULL DEFAULT '',
            agent_device_id TEXT NOT NULL DEFAULT '',
            agent_secret TEXT,
            agent_tunnel_unary_timeout_ms INTEGER NOT NULL DEFAULT 8000,
            active INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL
        );`,
		`CREATE INDEX IF NOT EXISTS idx_cloud_configs_active ON cloud_configs(active);`,
		`CREATE INDEX IF NOT EXISTS idx_cloud_configs_updated ON cloud_configs(updated_at DESC);`,
	}
	for _, stmt := range ddl {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("init cloud configs schema: %w", err)
		}
	}
	return nil
}

func (c *CloudConfigs) List() ([]CloudConfig, error) {
	c.mu.RLock()
	db := c.db
	c.mu.RUnlock()
	if db == nil {
		return nil, errors.New("cloud config storage not initialized")
	}
	rows, err := db.Query(`
        SELECT id, name, cloud_addr, agent_device_id, agent_secret,
               agent_tunnel_unary_timeout_ms, active, updated_at
        FROM cloud_configs
        ORDER BY updated_at DESC, name ASC
    `)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CloudConfig
	for rows.Next() {
		var cfg CloudConfig
		var active int
		if err := rows.Scan(
			&cfg.ID,
			&cfg.Name,
			&cfg.CloudAddr,
			&cfg.AgentDeviceID,
			&cfg.AgentSecret,
			&cfg.AgentTunnelUnaryTimeoutMS,
			&active,
			&cfg.UpdatedAt,
		); err != nil {
			return nil, err
		}
		cfg.Active = active == 1
		out = append(out, cfg)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *CloudConfigs) GetActive() (*CloudConfig, error) {
	c.mu.RLock()
	db := c.db
	c.mu.RUnlock()
	if db == nil {
		return nil, errors.New("cloud config storage not initialized")
	}
	row := db.QueryRow(`
        SELECT id, name, cloud_addr, agent_device_id, agent_secret,
               agent_tunnel_unary_timeout_ms, active, updated_at
        FROM cloud_configs
        WHERE active = 1
        ORDER BY updated_at DESC
        LIMIT 1
    `)
	var cfg CloudConfig
	var active int
	switch err := row.Scan(
		&cfg.ID,
		&cfg.Name,
		&cfg.CloudAddr,
		&cfg.AgentDeviceID,
		&cfg.AgentSecret,
		&cfg.AgentTunnelUnaryTimeoutMS,
		&active,
		&cfg.UpdatedAt,
	); err {
	case sql.ErrNoRows:
		return nil, nil
	case nil:
		cfg.Active = active == 1
		return &cfg, nil
	default:
		return nil, err
	}
}

func (c *CloudConfigs) Get(id string) (*CloudConfig, error) {
	c.mu.RLock()
	db := c.db
	c.mu.RUnlock()
	if db == nil {
		return nil, errors.New("cloud config storage not initialized")
	}
	if strings.TrimSpace(id) == "" {
		return nil, errors.New("cloud config id required")
	}
	row := db.QueryRow(`
        SELECT id, name, cloud_addr, agent_device_id, agent_secret,
               agent_tunnel_unary_timeout_ms, active, updated_at
        FROM cloud_configs
        WHERE id = ?
        LIMIT 1
    `, id)
	var cfg CloudConfig
	var active int
	switch err := row.Scan(
		&cfg.ID,
		&cfg.Name,
		&cfg.CloudAddr,
		&cfg.AgentDeviceID,
		&cfg.AgentSecret,
		&cfg.AgentTunnelUnaryTimeoutMS,
		&active,
		&cfg.UpdatedAt,
	); err {
	case sql.ErrNoRows:
		return nil, nil
	case nil:
		cfg.Active = active == 1
		return &cfg, nil
	default:
		return nil, err
	}
}

func (c *CloudConfigs) Upsert(cfg CloudConfig) error {
	c.mu.RLock()
	db := c.db
	c.mu.RUnlock()
	if db == nil {
		return errors.New("cloud config storage not initialized")
	}
	if strings.TrimSpace(cfg.ID) == "" {
		return errors.New("cloud config id required")
	}
	if cfg.UpdatedAt == 0 {
		cfg.UpdatedAt = time.Now().UnixMilli()
	}
	_, err := db.Exec(`
        INSERT INTO cloud_configs (
            id, name, cloud_addr, agent_device_id, agent_secret,
            agent_tunnel_unary_timeout_ms, active, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            cloud_addr = excluded.cloud_addr,
            agent_device_id = excluded.agent_device_id,
            agent_secret = excluded.agent_secret,
            agent_tunnel_unary_timeout_ms = excluded.agent_tunnel_unary_timeout_ms,
            updated_at = excluded.updated_at
    `, cfg.ID, cfg.Name, cfg.CloudAddr, cfg.AgentDeviceID, nullString(cfg.AgentSecret),
		cfg.AgentTunnelUnaryTimeoutMS, boolToInt(cfg.Active), cfg.UpdatedAt)
	return err
}

func (c *CloudConfigs) Remove(id string) error {
	c.mu.RLock()
	db := c.db
	c.mu.RUnlock()
	if db == nil {
		return errors.New("cloud config storage not initialized")
	}
	if strings.TrimSpace(id) == "" {
		return errors.New("cloud config id required")
	}
	_, err := db.Exec(`DELETE FROM cloud_configs WHERE id = ?`, id)
	return err
}

func (c *CloudConfigs) SetActive(id string) error {
	c.mu.RLock()
	db := c.db
	c.mu.RUnlock()
	if db == nil {
		return errors.New("cloud config storage not initialized")
	}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()
	if _, err = tx.Exec(`UPDATE cloud_configs SET active = 0`); err != nil {
		return err
	}
	if strings.TrimSpace(id) != "" {
		res, err2 := tx.Exec(`UPDATE cloud_configs SET active = 1 WHERE id = ?`, id)
		if err2 != nil {
			return err2
		}
		rows, err2 := res.RowsAffected()
		if err2 != nil {
			return err2
		}
		if rows == 0 {
			return fmt.Errorf("cloud config not found")
		}
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	return nil
}
