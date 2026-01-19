package storage

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type AdapterKind string

const (
	AdapterMQTT   AdapterKind = "mqtt"
	AdapterSerial AdapterKind = "serial"
	AdapterHTTP   AdapterKind = "http"
)

type DeviceStatus string

const (
	DeviceStatusActive  DeviceStatus = "active"
	DeviceStatusPending DeviceStatus = "pending"
)

type Device struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Type      string            `json:"type"`
	Room      string            `json:"room,omitempty"`
	Tags      []string          `json:"tags,omitempty"`
	Adapter   DeviceAdapter     `json:"adapter"`
	Topics    map[string]string `json:"topics,omitempty"`
	Actions   []ActionSpec      `json:"actions,omitempty"`
	Shadow    Shadow            `json:"shadow"`
	Online    bool              `json:"online"`
	LastSeen  int64             `json:"last_seen"`
	ModelID   string            `json:"model_id,omitempty"`
	ModelVer  string            `json:"model_version,omitempty"`
	Status    DeviceStatus      `json:"status,omitempty"`
	Provision map[string]any    `json:"provision,omitempty"`
	Meta      map[string]any    `json:"meta,omitempty"`
}

type DeviceAdapter struct {
	Kind   AdapterKind    `json:"kind"`
	Config map[string]any `json:"config,omitempty"`
}

type ActionSpec struct {
	Name       string         `json:"name"`
	ArgsSchema map[string]any `json:"args_schema,omitempty"`
	TimeoutMS  int            `json:"timeout_ms,omitempty"`
}

type Shadow struct {
	Reported   map[string]any `json:"reported,omitempty"`
	Desired    map[string]any `json:"desired,omitempty"`
	Version    int64          `json:"version,omitempty"`
	TSReported int64          `json:"ts_reported,omitempty"`
	TSDesired  int64          `json:"ts_desired,omitempty"`
}

// Devices persists device state in SQLite; schema is created on first load.
type Devices struct {
	mu   sync.RWMutex
	path string
	db   *sql.DB
}

func NewDevices(path string) *Devices {
	return &Devices{path: path}
}

// Load opens the sqlite database (creating it and the tables if missing).
func (r *Devices) Load() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if strings.TrimSpace(r.path) == "" {
		return errors.New("empty devices database path")
	}
	if strings.HasSuffix(strings.ToLower(strings.TrimSpace(r.path)), ".json") {
		return fmt.Errorf("json device files are not supported; set HOME_DEVICES_DB to a sqlite path (got %s)", r.path)
	}
	if err := os.MkdirAll(filepath.Dir(r.path), 0o755); err != nil {
		return fmt.Errorf("make data dir: %w", err)
	}
	db, err := sql.Open("sqlite", r.path)
	if err != nil {
		return fmt.Errorf("open sqlite: %w", err)
	}
	if _, err := db.Exec(`PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;`); err != nil {
		_ = db.Close()
		return fmt.Errorf("init pragmas: %w", err)
	}
	if err := createSchema(db); err != nil {
		_ = db.Close()
		return err
	}
	r.db = db
	return nil
}

func createSchema(db *sql.DB) error {
	ddl := []string{
		`CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            type TEXT NOT NULL DEFAULT '',
            room TEXT,
            model_id TEXT,
            model_version TEXT,
            online INTEGER NOT NULL DEFAULT 0,
            last_seen INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            snapshot_version INTEGER NOT NULL DEFAULT 1
        );`,
		`CREATE TABLE IF NOT EXISTS device_adapter (
            device_id TEXT PRIMARY KEY,
            kind TEXT NOT NULL CHECK(kind IN ('mqtt','serial','http')),
            config TEXT,
            FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
        );`,
		`CREATE TABLE IF NOT EXISTS device_shadows (
            device_id TEXT PRIMARY KEY,
            reported TEXT,
            desired TEXT,
            version INTEGER,
            ts_reported INTEGER,
            ts_desired INTEGER,
            FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
        );`,
		`CREATE TABLE IF NOT EXISTS device_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            name TEXT NOT NULL,
            args_schema TEXT,
            timeout_ms INTEGER,
            UNIQUE(device_id, name),
            FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
        );`,
		`CREATE TABLE IF NOT EXISTS device_topics (
            device_id TEXT NOT NULL,
            k TEXT NOT NULL,
            v TEXT,
            PRIMARY KEY(device_id, k),
            FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
        );`,
		`CREATE TABLE IF NOT EXISTS device_tags (
            device_id TEXT NOT NULL,
            tag TEXT NOT NULL,
            PRIMARY KEY(device_id, tag),
            FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
        );`,
		`CREATE TABLE IF NOT EXISTS device_kv (
            device_id TEXT NOT NULL,
            scope TEXT NOT NULL CHECK(scope IN ('provision','meta')),
            k TEXT NOT NULL,
            v TEXT,
            PRIMARY KEY(device_id, scope, k),
            FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
        );`,
	}
	for _, stmt := range ddl {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("init schema: %w", err)
		}
	}
	if err := ensureDeviceStatusColumn(db); err != nil {
		return err
	}
	return nil
}

func ensureDeviceStatusColumn(db *sql.DB) error {
	rows, err := db.Query(`PRAGMA table_info(devices)`)
	if err != nil {
		return fmt.Errorf("check devices schema: %w", err)
	}
	defer rows.Close()
	hasStatus := false
	for rows.Next() {
		var cid int
		var name, ctype string
		var notNull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &ctype, &notNull, &dflt, &pk); err != nil {
			return fmt.Errorf("scan devices schema: %w", err)
		}
		if name == "status" {
			hasStatus = true
			break
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("scan devices schema: %w", err)
	}
	if hasStatus {
		return nil
	}
	if _, err := db.Exec(`ALTER TABLE devices ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`); err != nil {
		return fmt.Errorf("add devices.status: %w", err)
	}
	return nil
}

func (r *Devices) List() []Device {
	r.mu.RLock()
	db := r.db
	r.mu.RUnlock()
	if db == nil {
		return nil
	}
	devs, err := r.fetchDevices("")
	if err != nil {
		log.Printf("[storage] list devices failed: %v", err)
		return nil
	}
	return devs
}

func (r *Devices) Get(id string) *Device {
	r.mu.RLock()
	db := r.db
	r.mu.RUnlock()
	if db == nil {
		return nil
	}
	devs, err := r.fetchDevices("WHERE d.id = ?", id)
	if err != nil || len(devs) == 0 {
		if err != nil {
			log.Printf("[storage] get device %s failed: %v", id, err)
		}
		return nil
	}
	d := devs[0]
	return &d
}

func (r *Devices) fetchDevices(where string, args ...any) ([]Device, error) {
	r.mu.RLock()
	db := r.db
	r.mu.RUnlock()
	if db == nil {
		return nil, errors.New("storage not initialized")
	}
	q := `
        SELECT d.id, d.name, d.type, d.room, d.model_id, d.model_version, d.online, d.last_seen, d.status
        FROM devices d
    `
	if where != "" {
		q += " " + where
	}
	rows, err := db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	devMap := map[string]*Device{}
	var order []string
	for rows.Next() {
		var room sql.NullString
		var modelID, modelVer sql.NullString
		var status sql.NullString
		var onlineInt int
		d := Device{Topics: map[string]string{}}
		if err := rows.Scan(&d.ID, &d.Name, &d.Type, &room, &modelID, &modelVer, &onlineInt, &d.LastSeen, &status); err != nil {
			return nil, err
		}
		d.Room = room.String
		d.ModelID = modelID.String
		d.ModelVer = modelVer.String
		d.Online = onlineInt != 0
		if status.Valid && strings.TrimSpace(status.String) != "" {
			d.Status = DeviceStatus(status.String)
		} else {
			d.Status = DeviceStatusActive
		}
		devMap[d.ID] = &d
		order = append(order, d.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(devMap) == 0 {
		return []Device{}, nil
	}

	loaders := []func(map[string]*Device) error{
		r.loadAdapters,
		r.loadShadows,
		r.loadActions,
		r.loadTopics,
		r.loadTags,
		r.loadKV,
	}
	for _, fn := range loaders {
		if err := fn(devMap); err != nil {
			return nil, err
		}
	}

	out := make([]Device, 0, len(order))
	for _, id := range order {
		if d := devMap[id]; d != nil {
			out = append(out, cloneDevice(*d))
		}
	}
	return out, nil
}

func (r *Devices) loadAdapters(m map[string]*Device) error {
	rows, err := r.db.Query(`SELECT device_id, kind, config FROM device_adapter`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id, kind string
		var cfg sql.NullString
		if err := rows.Scan(&id, &kind, &cfg); err != nil {
			return err
		}
		d := m[id]
		if d == nil {
			continue
		}
		d.Adapter.Kind = AdapterKind(kind)
		if cfg.Valid && cfg.String != "" {
			var c map[string]any
			if err := json.Unmarshal([]byte(cfg.String), &c); err == nil {
				d.Adapter.Config = c
			}
		}
	}
	return rows.Err()
}

func (r *Devices) loadShadows(m map[string]*Device) error {
	rows, err := r.db.Query(`SELECT device_id, reported, desired, version, ts_reported, ts_desired FROM device_shadows`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var reported, desired sql.NullString
		var version, tsReported, tsDesired sql.NullInt64
		if err := rows.Scan(&id, &reported, &desired, &version, &tsReported, &tsDesired); err != nil {
			return err
		}
		d := m[id]
		if d == nil {
			continue
		}
		if reported.Valid && reported.String != "" {
			_ = json.Unmarshal([]byte(reported.String), &d.Shadow.Reported)
		}
		if desired.Valid && desired.String != "" {
			_ = json.Unmarshal([]byte(desired.String), &d.Shadow.Desired)
		}
		d.Shadow.Version = version.Int64
		d.Shadow.TSReported = tsReported.Int64
		d.Shadow.TSDesired = tsDesired.Int64
	}
	return rows.Err()
}

func (r *Devices) loadActions(m map[string]*Device) error {
	rows, err := r.db.Query(`SELECT device_id, name, args_schema, timeout_ms FROM device_actions`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id, name string
		var argsSchema sql.NullString
		var timeout sql.NullInt64
		if err := rows.Scan(&id, &name, &argsSchema, &timeout); err != nil {
			return err
		}
		d := m[id]
		if d == nil || name == "" {
			continue
		}
		spec := ActionSpec{Name: name, TimeoutMS: int(timeout.Int64)}
		if argsSchema.Valid && argsSchema.String != "" {
			_ = json.Unmarshal([]byte(argsSchema.String), &spec.ArgsSchema)
		}
		d.Actions = append(d.Actions, spec)
	}
	return rows.Err()
}

func (r *Devices) loadTopics(m map[string]*Device) error {
	rows, err := r.db.Query(`SELECT device_id, k, v FROM device_topics`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id, k, v string
		if err := rows.Scan(&id, &k, &v); err != nil {
			return err
		}
		d := m[id]
		if d == nil {
			continue
		}
		if d.Topics == nil {
			d.Topics = map[string]string{}
		}
		d.Topics[k] = v
	}
	return rows.Err()
}

func (r *Devices) loadTags(m map[string]*Device) error {
	rows, err := r.db.Query(`SELECT device_id, tag FROM device_tags`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id, tag string
		if err := rows.Scan(&id, &tag); err != nil {
			return err
		}
		d := m[id]
		if d == nil {
			continue
		}
		d.Tags = append(d.Tags, tag)
	}
	return rows.Err()
}

func (r *Devices) loadKV(m map[string]*Device) error {
	rows, err := r.db.Query(`SELECT device_id, scope, k, v FROM device_kv`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id, scope, k, v string
		if err := rows.Scan(&id, &scope, &k, &v); err != nil {
			return err
		}
		d := m[id]
		if d == nil {
			continue
		}
		target := &d.Provision
		if scope == "meta" {
			target = &d.Meta
		}
		if *target == nil {
			*target = map[string]any{}
		}
		// best-effort decode JSON, fallback to raw string
		var parsed any
		if v != "" && json.Unmarshal([]byte(v), &parsed) == nil {
			(*target)[k] = parsed
		} else {
			(*target)[k] = v
		}
	}
	return rows.Err()
}

func (r *Devices) Upsert(d Device) error {
	r.mu.RLock()
	db := r.db
	r.mu.RUnlock()
	if db == nil {
		return errors.New("storage not initialized")
	}
	if strings.TrimSpace(d.ID) == "" {
		return errors.New("device id required")
	}
	now := time.Now().UnixMilli()
	if d.LastSeen == 0 {
		d.LastSeen = now
	}
	if strings.TrimSpace(string(d.Status)) == "" {
		d.Status = DeviceStatusActive
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

	_, err = tx.Exec(`
        INSERT INTO devices (id, name, type, room, model_id, model_version, online, last_seen, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            type = excluded.type,
            room = excluded.room,
            model_id = excluded.model_id,
            model_version = excluded.model_version,
            online = excluded.online,
            last_seen = excluded.last_seen,
            status = excluded.status
    `, d.ID, d.Name, d.Type, nullString(d.Room), nullString(d.ModelID), nullString(d.ModelVer), boolToInt(d.Online), d.LastSeen, string(d.Status))
	if err != nil {
		return err
	}

	// adapter
	cfgJSON, err := marshalJSON(d.Adapter.Config)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`
        INSERT INTO device_adapter (device_id, kind, config)
        VALUES (?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET
            kind = excluded.kind,
            config = excluded.config
    `, d.ID, string(d.Adapter.Kind), cfgJSON)
	if err != nil {
		return err
	}

	// shadow
	reportedJSON, err := marshalJSON(d.Shadow.Reported)
	if err != nil {
		return err
	}
	desiredJSON, err := marshalJSON(d.Shadow.Desired)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`
        INSERT INTO device_shadows (device_id, reported, desired, version, ts_reported, ts_desired)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET
            reported = excluded.reported,
            desired = excluded.desired,
            version = excluded.version,
            ts_reported = excluded.ts_reported,
            ts_desired = excluded.ts_desired
    `, d.ID, reportedJSON, desiredJSON, d.Shadow.Version, d.Shadow.TSReported, d.Shadow.TSDesired)
	if err != nil {
		return err
	}

	// actions: replace per device
	if _, err = tx.Exec(`DELETE FROM device_actions WHERE device_id = ?`, d.ID); err != nil {
		return err
	}
	for _, a := range d.Actions {
		if strings.TrimSpace(a.Name) == "" {
			continue
		}
		argsJSON, err := marshalJSON(a.ArgsSchema)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(`
            INSERT INTO device_actions (device_id, name, args_schema, timeout_ms)
            VALUES (?, ?, ?, ?)
        `, d.ID, a.Name, argsJSON, a.TimeoutMS); err != nil {
			return err
		}
	}

	if err := replaceTopics(tx, d.ID, d.Topics); err != nil {
		return err
	}
	if err := replaceTags(tx, d.ID, d.Tags); err != nil {
		return err
	}
	if err := replaceKV(tx, d.ID, "provision", d.Provision); err != nil {
		return err
	}
	if err := replaceKV(tx, d.ID, "meta", d.Meta); err != nil {
		return err
	}

	return tx.Commit()
}

func replaceTopics(tx *sql.Tx, deviceID string, topics map[string]string) error {
	if _, err := tx.Exec(`DELETE FROM device_topics WHERE device_id = ?`, deviceID); err != nil {
		return err
	}
	for k, v := range topics {
		if strings.TrimSpace(k) == "" {
			continue
		}
		if _, err := tx.Exec(`INSERT INTO device_topics (device_id, k, v) VALUES (?, ?, ?)`, deviceID, k, v); err != nil {
			return err
		}
	}
	return nil
}

func replaceTags(tx *sql.Tx, deviceID string, tags []string) error {
	if _, err := tx.Exec(`DELETE FROM device_tags WHERE device_id = ?`, deviceID); err != nil {
		return err
	}
	seen := map[string]struct{}{}
	for _, tag := range tags {
		tag = strings.TrimSpace(tag)
		if tag == "" {
			continue
		}
		if _, ok := seen[tag]; ok {
			continue
		}
		seen[tag] = struct{}{}
		if _, err := tx.Exec(`INSERT INTO device_tags (device_id, tag) VALUES (?, ?)`, deviceID, tag); err != nil {
			return err
		}
	}
	return nil
}

func replaceKV(tx *sql.Tx, deviceID, scope string, kv map[string]any) error {
	if _, err := tx.Exec(`DELETE FROM device_kv WHERE device_id = ? AND scope = ?`, deviceID, scope); err != nil {
		return err
	}
	for k, v := range kv {
		if strings.TrimSpace(k) == "" {
			continue
		}
		val, err := marshalJSON(v)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(`INSERT INTO device_kv (device_id, scope, k, v) VALUES (?, ?, ?, ?)`, deviceID, scope, k, val); err != nil {
			return err
		}
	}
	return nil
}

func (r *Devices) Remove(id string) error {
	r.mu.RLock()
	db := r.db
	r.mu.RUnlock()
	if db == nil {
		return errors.New("storage not initialized")
	}
	_, err := db.Exec(`DELETE FROM devices WHERE id = ?`, id)
	return err
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
	if d.Provision != nil {
		cd.Provision = cloneMapStringAny(d.Provision)
	}
	if d.Meta != nil {
		cd.Meta = cloneMapStringAny(d.Meta)
	}
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
	for k, v := range m {
		out[k] = v
	}
	return out
}

func cloneMapStringAny(m map[string]any) map[string]any {
	out := make(map[string]any, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

func marshalJSON(v any) (string, error) {
	if v == nil {
		return "", nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func nullString(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
