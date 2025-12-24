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

// AuditEntry represents a single audit log row.
type AuditEntry struct {
	ID      int64          `json:"id"`
	TS      int64          `json:"ts"`
	Kind    string         `json:"kind"`
	Subject string         `json:"subject,omitempty"`
	Actor   string         `json:"actor,omitempty"`
	Data    map[string]any `json:"data,omitempty"`
}

// AuditLogs persists audit events in a dedicated sqlite database.
type AuditLogs struct {
	mu   sync.RWMutex
	path string
	db   *sql.DB
}

func NewAuditLogs(path string) *AuditLogs { return &AuditLogs{path: path} }

func (l *AuditLogs) Load() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if strings.TrimSpace(l.path) == "" {
		return errors.New("empty audit log database path")
	}
	if err := os.MkdirAll(filepath.Dir(l.path), 0o755); err != nil {
		return fmt.Errorf("make audit data dir: %w", err)
	}
	db, err := sql.Open("sqlite", l.path)
	if err != nil {
		return fmt.Errorf("open sqlite: %w", err)
	}
	if _, err := db.Exec(`PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;`); err != nil {
		_ = db.Close()
		return fmt.Errorf("init pragmas: %w", err)
	}
	if err := createAuditSchema(db); err != nil {
		_ = db.Close()
		return err
	}
	l.db = db
	return nil
}

func createAuditSchema(db *sql.DB) error {
	ddl := []string{
		`CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER NOT NULL,
            kind TEXT NOT NULL,
            subject TEXT,
            actor TEXT,
            data TEXT
        );`,
		`CREATE INDEX IF NOT EXISTS idx_audit_logs_ts_id ON audit_logs(ts DESC, id DESC);`,
	}
	for _, stmt := range ddl {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("init audit schema: %w", err)
		}
	}
	return nil
}

// Append writes a new audit entry.
func (l *AuditLogs) Append(e AuditEntry) error {
	l.mu.RLock()
	db := l.db
	l.mu.RUnlock()
	if db == nil {
		return errors.New("audit storage not initialized")
	}
	if e.TS == 0 {
		e.TS = time.Now().UnixMilli()
	}
	dataJSON, err := marshalJSON(e.Data)
	if err != nil {
		return err
	}
	_, err = db.Exec(`INSERT INTO audit_logs (ts, kind, subject, actor, data) VALUES (?, ?, ?, ?, ?)`,
		e.TS, strings.TrimSpace(e.Kind), strings.TrimSpace(e.Subject), strings.TrimSpace(e.Actor), dataJSON)
	return err
}

type ListLogsOptions struct {
	Kind     string
	Subject  string
	PageSize int
	// PageToken is the last seen ID for keyset pagination (descending ID).
	PageToken string
}

// List returns logs ordered by id desc with keyset pagination.
func (l *AuditLogs) List(opts ListLogsOptions) ([]AuditEntry, string, error) {
	l.mu.RLock()
	db := l.db
	l.mu.RUnlock()
	if db == nil {
		return nil, "", errors.New("audit storage not initialized")
	}

	lastID := int64(0)
	if strings.TrimSpace(opts.PageToken) != "" {
		if id, err := strconv.ParseInt(opts.PageToken, 10, 64); err == nil && id > 0 {
			lastID = id
		} else {
			return nil, "", fmt.Errorf("invalid page_token")
		}
	}

	pageSize := opts.PageSize
	if pageSize <= 0 || pageSize > 200 {
		pageSize = 50
	}

	q := `SELECT id, ts, kind, subject, actor, data FROM audit_logs WHERE 1=1`
	args := []any{}
	if k := strings.TrimSpace(opts.Kind); k != "" {
		q += " AND kind = ?"
		args = append(args, k)
	}
	if s := strings.TrimSpace(opts.Subject); s != "" {
		q += " AND subject = ?"
		args = append(args, s)
	}
	if lastID > 0 {
		q += " AND id < ?"
		args = append(args, lastID)
	}
	q += " ORDER BY id DESC LIMIT ?"
	args = append(args, pageSize+1) // fetch one extra to derive next_page_token

	rows, err := db.Query(q, args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	var out []AuditEntry
	for rows.Next() {
		var (
			id            int64
			ts            int64
			kind, subject string
			actor         sql.NullString
			data          sql.NullString
		)
		if err := rows.Scan(&id, &ts, &kind, &subject, &actor, &data); err != nil {
			return nil, "", err
		}
		entry := AuditEntry{ID: id, TS: ts, Kind: kind, Subject: subject, Actor: actor.String}
		if data.Valid && data.String != "" {
			_ = json.Unmarshal([]byte(data.String), &entry.Data)
		}
		out = append(out, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}

	nextToken := ""
	if len(out) > pageSize {
		nextToken = fmt.Sprintf("%d", out[pageSize].ID)
		out = out[:pageSize]
	}
	return out, nextToken, nil
}

// Cleanup deletes logs older than beforeTs; limit caps deletions to avoid long locks.
func (l *AuditLogs) Cleanup(beforeTs int64, limit int) (int64, error) {
	l.mu.RLock()
	db := l.db
	l.mu.RUnlock()
	if db == nil {
		return 0, errors.New("audit storage not initialized")
	}
	if beforeTs <= 0 {
		beforeTs = time.Now().UnixMilli()
	}

	if limit > 0 {
		res, err := db.Exec(`
            DELETE FROM audit_logs
            WHERE id IN (
                SELECT id FROM audit_logs WHERE ts < ? ORDER BY ts LIMIT ?
            )`, beforeTs, limit)
		if err != nil {
			return 0, err
		}
		return res.RowsAffected()
	}

	res, err := db.Exec(`DELETE FROM audit_logs WHERE ts < ?`, beforeTs)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
