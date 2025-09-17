package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"pc-remote-ctrl/backend/internal/broker"
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
	Port            string
	DevicesFile     string
	ScenesFile      string
	AutomationsFile string
	// MQTT broker settings
	MqttURL      string
	MqttUser     string
	MqttPass     string
	MqttClientID string
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func loadConfig() *Config {
	return &Config{
		Port:            getenv("LOCAL_PORT", "7071"),
		DevicesFile:     getenv("HOME_DEVICES_FILE", "backend/data/devices.json"),
		ScenesFile:      getenv("HOME_SCENES_FILE", "backend/data/scenes.json"),
		AutomationsFile: getenv("HOME_AUTOMATIONS_FILE", "backend/data/automations.json"),
		MqttURL:         getenv("MQTT_URL", "tcp://192.168.30.64:1883"),
		MqttUser:        getenv("MQTT_USER", ""),
		MqttPass:        getenv("MQTT_PASS", ""),
		MqttClientID:    getenv("MQTT_CLIENT_ID", ""),
	}
}

func main() {
	cfg := loadConfig()
	log.Printf("home-gateway starting on :%s", cfg.Port)

	// ensure data dir exists
	if err := os.MkdirAll("backend/data", 0o755); err != nil {
		log.Printf("warn: create data dir failed: %v", err)
	}

	// initialize new storages (devices/scenes/automations)
	devices := devstore.NewDevices(cfg.DevicesFile)
	if err := devices.Load(); err != nil {
		log.Printf("warn: load devices failed: %v", err)
	}
	scenes := devstore.NewScenes(cfg.ScenesFile)
	if err := scenes.Load(); err != nil {
		log.Printf("warn: load scenes failed: %v", err)
	}
	// TODO: automation rules will be added later
	// automations := devstore.NewAutomations(cfg.AutomationsFile)
	// if err := automations.Load(); err != nil { log.Printf("warn: load automations failed: %v", err) }
	_ = devices
	_ = scenes

	// Optionally start embedded MQTT broker when MQTT_URL is empty
	var embedded *broker.Embedded
	if cfg.MqttURL == "" {
		emb, err := broker.StartEmbedded(":1883")
		if err != nil {
			log.Printf("warn: failed to start embedded mqtt broker: %v", err)
		} else {
			embedded = emb
			// point client to embedded broker
			os.Setenv("MQTT_URL", "tcp://127.0.0.1:1883")
			cfg.MqttURL = "tcp://127.0.0.1:1883"
			log.Printf("embedded mqtt broker listening on :1883")
		}
	}

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
	homesvc := home.New(devices, scenes, ops)
	homesvc.InitSubscriptions(mqttClient)
	homepb.RegisterHomeServiceServer(grpcServer, homesvc)

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
	if embedded != nil {
		_ = embedded.Stop(sdCtx)
	}
}
