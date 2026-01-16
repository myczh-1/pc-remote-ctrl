package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	cloudmgr "pc-remote-ctrl/backend/internal/cloud"
	home "pc-remote-ctrl/backend/internal/home"
	"pc-remote-ctrl/backend/internal/mqtt"
	"pc-remote-ctrl/backend/internal/ops"
	devstore "pc-remote-ctrl/backend/internal/storage"
	homepb "pc-remote-ctrl/backend/proto/home"

	"github.com/improbable-eng/grpc-web/go/grpcweb"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

type Config struct {
	Port          string
	DevicesFile   string
	LogsFile      string
	AutomationsDB string
	// MQTT broker settings
	MqttURL      string
	MqttUser     string
	MqttPass     string
	MqttClientID string

	// Device status
	DeviceOfflineAfter time.Duration
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func parseDurationEnv(val string, def time.Duration) time.Duration {
	if val == "" {
		return def
	}
	if d, err := time.ParseDuration(val); err == nil && d > 0 {
		return d
	}
	if n, err := strconv.Atoi(val); err == nil && n > 0 {
		return time.Duration(n) * time.Second
	}
	log.Printf("[config] invalid duration %q, fallback=%s", val, def)
	return def
}

// loadDotEnv loads .env file if present (optional)
func loadDotEnv() {
	if data, err := os.ReadFile(".env"); err == nil {
		lines := strings.Split(string(data), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			if idx := strings.Index(line, "="); idx > 0 {
				key := strings.TrimSpace(line[:idx])
				value := strings.TrimSpace(line[idx+1:])
				if os.Getenv(key) == "" { // 不覆盖已存在的环境变量
					os.Setenv(key, value)
				}
			}
		}
	}
}

func loadConfig() *Config {
	if legacy := os.Getenv("HOME_DEVICES_FILE"); legacy != "" {
		log.Printf("[config] HOME_DEVICES_FILE is no longer supported; use HOME_DEVICES_DB (sqlite path). Ignoring %q", legacy)
	}
	if legacyScene := os.Getenv("HOME_SCENES_FILE"); legacyScene != "" {
		log.Printf("[config] HOME_SCENES_FILE is removed (scenes are deprecated); ignoring %q", legacyScene)
	}
	if os.Getenv("CLOUD_ADDR") != "" || os.Getenv("AGENT_DEVICE_ID") != "" || os.Getenv("AGENT_SECRET") != "" || os.Getenv("AGENT_TUNNEL_UNARY_TIMEOUT_MS") != "" {
		log.Printf("[config] cloud env vars are deprecated; configure via CloudConfigService instead")
	}
	return &Config{
		Port:          getenv("LOCAL_PORT", "7071"),
		DevicesFile:   getenv("HOME_DEVICES_DB", "backend/data/home.db"),
		LogsFile:      getenv("HOME_LOGS_DB", "backend/data/logs.db"),
		AutomationsDB: getenv("HOME_AUTOMATIONS_DB", "backend/data/home.db"),
		MqttURL:       getenv("MQTT_URL", "tcp://192.168.30.64:1883"),
		MqttUser:      getenv("MQTT_USER", ""),
		MqttPass:      getenv("MQTT_PASS", ""),
		MqttClientID:  getenv("MQTT_CLIENT_ID", ""),

		DeviceOfflineAfter: parseDurationEnv(getenv("DEVICE_OFFLINE_AFTER", ""), 2*time.Minute),
	}
}

func main() {
	// Load .env file if exists (optional)
	loadDotEnv()
	cfg := loadConfig()
	log.Printf("home-gateway starting on :%s", cfg.Port)

	// ensure data dir exists - fail fast if we can't create it
	if err := os.MkdirAll("backend/data", 0o755); err != nil {
		log.Fatalf("FATAL: cannot create data directory: %v", err)
	}

	// initialize new storages (devices/automations)
	devices := devstore.NewDevices(cfg.DevicesFile)
	if err := devices.Load(); err != nil {
		log.Fatalf("FATAL: load devices db %s failed: %v", cfg.DevicesFile, err)
	}
	log.Printf("[storage] devices loaded: %d from %s", len(devices.List()), cfg.DevicesFile)
	models := devstore.NewDeviceModels(cfg.DevicesFile)
	if err := models.Load(); err != nil {
		log.Fatalf("FATAL: load device models db %s failed: %v", cfg.DevicesFile, err)
	}
	log.Printf("[storage] device models ready: %s", cfg.DevicesFile)
	auditLogs := devstore.NewAuditLogs(cfg.LogsFile)
	if err := auditLogs.Load(); err != nil {
		log.Fatalf("FATAL: load audit db %s failed: %v", cfg.LogsFile, err)
	}
	log.Printf("[storage] audit logs ready: %s", cfg.LogsFile)
	cloudConfigs := devstore.NewCloudConfigs(cfg.DevicesFile)
	if err := cloudConfigs.Load(); err != nil {
		log.Fatalf("FATAL: load cloud configs db %s failed: %v", cfg.DevicesFile, err)
	}
	log.Printf("[storage] cloud configs ready: %s", cfg.DevicesFile)
	automations := devstore.NewAutomations(cfg.AutomationsDB)
	if err := automations.Load(); err != nil {
		log.Fatalf("FATAL: load automations db %s failed: %v", cfg.AutomationsDB, err)
	}
	log.Printf("[storage] automations ready: %s", cfg.AutomationsDB)

	// MQTT is optional - system can work without it
	// For development: use docker-compose with mosquitto
	// For production: point to your MQTT broker

	// init mqtt client: prefer paho when MQTT_URL provided, else noop
	var mqttClient mqtt.Client
	if cfg.MqttURL != "" {
		clientID := cfg.MqttClientID
		if clientID == "" {
			clientID = "home-gateway-" + time.Now().Format("150405.000")
		}
		log.Printf("[mqtt] connecting url=%s client_id=%s", cfg.MqttURL, clientID)
		pc := mqtt.NewPaho(mqtt.PahoOptions{URL: cfg.MqttURL, Username: cfg.MqttUser, Password: cfg.MqttPass, ClientID: clientID})
		if err := pc.Connect(context.Background()); err != nil {
			log.Printf("warn: mqtt connect failed, fallback to noop: %v", err)
			mqttClient = mqtt.NewNoop()
			_ = mqttClient.Connect(context.Background())
		} else {
			mqttClient = pc
		}
	} else {
		mqttClient = mqtt.NewNoop()
		_ = mqttClient.Connect(context.Background())
	}
	defer mqttClient.Close()

	// gRPC server: register HomeService
	grpcServer := grpc.NewServer()
	reflection.Register(grpcServer)
	// ops via MQTT
	ops := ops.NewMQTTOps(mqttClient)
	homesvc := home.New(devices, models, auditLogs, ops)
	engine := home.NewAutomationEngine(automations, devices, ops, auditLogs)
	homesvc.InitSubscriptions(mqttClient)
	homepb.RegisterHomeServiceServer(grpcServer, homesvc)
	homepb.RegisterAuditServiceServer(grpcServer, home.NewAuditService(auditLogs))
	homepb.RegisterAutomationServiceServer(grpcServer, home.NewAutomationService(automations, auditLogs, engine))
	homepb.RegisterDeviceModelServiceServer(grpcServer, home.NewDeviceModelService(models, auditLogs))

	wrapped := grpcweb.WrapServer(
		grpcServer,
		grpcweb.WithOriginFunc(func(origin string) bool { return true }),
		grpcweb.WithWebsockets(true),
		grpcweb.WithWebsocketOriginFunc(func(r *http.Request) bool { return true }),
	)
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// healthz
		if r.Method == http.MethodGet && r.URL.Path == "/healthz" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("ok"))
			return
		}
		// Support raw gRPC over h2c for upstream callers (e.g., cloud middleware)
		if r.ProtoMajor == 2 && strings.Contains(r.Header.Get("Content-Type"), "application/grpc") {
			grpcServer.ServeHTTP(w, r)
			return
		}
		if wrapped.IsGrpcWebRequest(r) || wrapped.IsAcceptableGrpcCorsRequest(r) || wrapped.IsGrpcWebSocketRequest(r) {
			wrapped.ServeHTTP(w, r)
			return
		}
		// default no content
		w.WriteHeader(http.StatusNoContent)
	})

	httpSrv := &http.Server{Addr: ":" + cfg.Port, Handler: h2c.NewHandler(handler, &http2.Server{})}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cloudManager := cloudmgr.NewManager(ctx, cfg.Port)
	if active, err := cloudConfigs.GetActive(); err != nil {
		log.Printf("[cloud] load active config failed: %v", err)
	} else if active != nil {
		timeoutMS := active.AgentTunnelUnaryTimeoutMS
		if timeoutMS <= 0 {
			timeoutMS = 8000
		}
		cloudManager.Apply(&cloudmgr.RuntimeConfig{
			CloudAddr:               active.CloudAddr,
			AgentDeviceID:           active.AgentDeviceID,
			AgentSecret:             active.AgentSecret,
			AgentTunnelUnaryTimeout: time.Duration(timeoutMS) * time.Millisecond,
		})
	}
	homepb.RegisterCloudConfigServiceServer(grpcServer, home.NewCloudConfigService(cloudConfigs, cloudManager))

	// background device offline detection
	homesvc.StartOfflineWatcher(ctx, cfg.DeviceOfflineAfter)
	// automation engine consuming device events
	homesvc.AttachAutomationEngine(ctx, engine)

	// shutdown signals
	sigc := make(chan os.Signal, 1)
	signal.Notify(sigc, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("listening http/grpc-web on :%s", cfg.Port)
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("server error: %v", err)
			cancel()
		}
	}()

	select {
	case <-sigc:
		log.Printf("signal received, shutting down")
	case <-ctx.Done():
		log.Printf("context cancelled, shutting down")
	}

	sdCtx, sdCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer sdCancel()
	_ = httpSrv.Shutdown(sdCtx)
	grpcServer.GracefulStop()
}
