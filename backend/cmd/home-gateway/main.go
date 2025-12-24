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

	cloudcli "pc-remote-ctrl/backend/internal/cloud"
	home "pc-remote-ctrl/backend/internal/home"
	"pc-remote-ctrl/backend/internal/mqtt"
	"pc-remote-ctrl/backend/internal/ops"
	devstore "pc-remote-ctrl/backend/internal/storage"
	homepb "pc-remote-ctrl/backend/proto/home"
	cloudpb "pc-remote-ctrl/cloud-middleware/proto/cloud"

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

	// Cloud registration (optional)
	CloudAddr                 string // e.g. 127.0.0.1:7073
	AgentDeviceID             string // required when CloudAddr set
	AgentSecret               string // optional
	HomeGRPCAddr              string // override reported addr; default 127.0.0.1:Port
	AgentTunnelUnaryTimeoutMS int    // default 8000
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

		CloudAddr:     getenv("CLOUD_ADDR", ""),
		AgentDeviceID: getenv("AGENT_DEVICE_ID", ""),
		AgentSecret:   getenv("AGENT_SECRET", ""),
		HomeGRPCAddr:  getenv("HOME_GRPC_ADDR", ""),
		AgentTunnelUnaryTimeoutMS: func() int {
			if v := getenv("AGENT_TUNNEL_UNARY_TIMEOUT_MS", ""); v != "" {
				if n, err := strconv.Atoi(v); err == nil {
					return n
				}
			}
			return 8000
		}(),
	}
}

func tryCloudRegister(ctx context.Context, cfg *Config) {
	if cfg.CloudAddr == "" {
		return
	}
	addr := cfg.HomeGRPCAddr
	if addr == "" {
		addr = "127.0.0.1:" + cfg.Port
	}
	if cfg.AgentDeviceID == "" {
		log.Printf("[cloud] skip: AGENT_DEVICE_ID not set")
		return
	}
	go func() {
		backoff := time.Second
		for {
			if ctx.Err() != nil {
				return
			}
			conn, err := grpc.DialContext(ctx, cfg.CloudAddr, grpc.WithInsecure())
			if err != nil {
				log.Printf("[cloud] dial failed: %v", err)
				time.Sleep(backoff)
				if backoff < 15*time.Second {
					backoff *= 2
				}
				continue
			}
			client := cloudpb.NewAgentServiceClient(conn)
			rctx, cancel := context.WithTimeout(ctx, 5*time.Second)
			_, err = client.Register(rctx, &cloudpb.RegisterRequest{DeviceId: cfg.AgentDeviceID, HomeGrpcAddr: addr, Secret: cfg.AgentSecret, TtlSec: 120})
			cancel()
			if err != nil {
				log.Printf("[cloud] register failed: %v", err)
				_ = conn.Close()
				time.Sleep(backoff)
				if backoff < 15*time.Second {
					backoff *= 2
				}
				continue
			}
			log.Printf("[cloud] registered device_id=%s upstream=%s via %s", cfg.AgentDeviceID, addr, cfg.CloudAddr)
			// heartbeat loop
			hbTicker := time.NewTicker(30 * time.Second)
			defer hbTicker.Stop()
			for {
				select {
				case <-ctx.Done():
					_ = conn.Close()
					return
				case <-hbTicker.C:
					hctx, cc := context.WithTimeout(ctx, 3*time.Second)
					_, herr := client.Heartbeat(hctx, &cloudpb.HeartbeatRequest{DeviceId: cfg.AgentDeviceID})
					cc()
					if herr != nil {
						log.Printf("[cloud] heartbeat failed: %v", herr)
						_ = conn.Close()
						time.Sleep(2 * time.Second)
						// break to outer loop to re-register
						goto REREG
					}
				}
			}
		REREG:
			continue
		}
	}()
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
	auditLogs := devstore.NewAuditLogs(cfg.LogsFile)
	if err := auditLogs.Load(); err != nil {
		log.Fatalf("FATAL: load audit db %s failed: %v", cfg.LogsFile, err)
	}
	log.Printf("[storage] audit logs ready: %s", cfg.LogsFile)
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
	homesvc := home.New(devices, auditLogs, ops)
	homesvc.InitSubscriptions(mqttClient)
	homepb.RegisterHomeServiceServer(grpcServer, homesvc)
	homepb.RegisterAuditServiceServer(grpcServer, home.NewAuditService(auditLogs))
	homepb.RegisterAutomationServiceServer(grpcServer, home.NewAutomationService(automations, auditLogs))

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

	// background device offline detection
	homesvc.StartOfflineWatcher(ctx, cfg.DeviceOfflineAfter)

	// cloud registration (optional)
	tryCloudRegister(ctx, cfg)

	// start tunnel client (Tunnel Only): enabled when CLOUD_ADDR and AGENT_DEVICE_ID provided
	if cfg.CloudAddr != "" && cfg.AgentDeviceID != "" {
		localPort := cfg.Port
		to := time.Duration(cfg.AgentTunnelUnaryTimeoutMS) * time.Millisecond
		cloudcli.StartTunnelClient(ctx, cfg.CloudAddr, cfg.AgentDeviceID, cfg.AgentSecret, localPort, to)
	}

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
