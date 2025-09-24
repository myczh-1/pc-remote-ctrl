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

    cloudpb "pc-remote-ctrl/cloud-middleware/proto/cloud"
    "pc-remote-ctrl/cloud-middleware/internal/registry"
    svr "pc-remote-ctrl/cloud-middleware/internal/server"

    "github.com/improbable-eng/grpc-web/go/grpcweb"
    "golang.org/x/net/http2"
    "golang.org/x/net/http2/h2c"
    "google.golang.org/grpc"
    "google.golang.org/grpc/reflection"
)

type Config struct {
    Port               string
    DefaultBackendAddr string // deprecated in tunnel-only mode
    AuthMode           string // none|tiny (tiny 待接入 tiny auth)
    AgentSecret        string // 全局 agent 注册密钥（MVP）
    TunnelSessionBuf   int    // default 64
    TunnelMaxFrameBytes int   // default 1MiB
}

func getenv(k, def string) string {
    if v := os.Getenv(k); v != "" {
        return v
    }
    return def
}

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
                if os.Getenv(key) == "" {
                    os.Setenv(key, value)
                }
            }
        }
    }
}

func loadConfig() *Config {
    atoi := func(k string, def int) int {
        v := getenv(k, "")
        if v == "" { return def }
        if n, err := strconv.Atoi(v); err == nil { return n }
        return def
    }
    return &Config{
        Port:               getenv("GRPC_PORT", "7073"),
        DefaultBackendAddr: getenv("DEFAULT_BACKEND_ADDR", ""),
        AuthMode:           getenv("AUTH_MODE", "none"),
        AgentSecret:        getenv("AGENT_SECRET", ""),
        TunnelSessionBuf:   atoi("TUNNEL_SESSION_BUF", 64),
        TunnelMaxFrameBytes: atoi("TUNNEL_MAX_FRAME_BYTES", 1024*1024),
    }
}

func main() {
    loadDotEnv()
    cfg := loadConfig()
    log.Printf("cloud-middleware starting on :%s", cfg.Port)

    // gRPC server
    grpcServer := grpc.NewServer()
    reflection.Register(grpcServer)

    // init services
    reg := registry.NewMemoryRegistry(cfg.DefaultBackendAddr)
    gw := svr.NewGatewayServer(reg, cfg.TunnelMaxFrameBytes)
    agent := svr.NewAgentServer(reg, cfg.AgentSecret)
    tunnel := svr.NewTunnelServer(reg, cfg.TunnelSessionBuf, cfg.TunnelMaxFrameBytes, cfg.AgentSecret)

    cloudpb.RegisterGatewayServiceServer(grpcServer, gw)
    cloudpb.RegisterAgentServiceServer(grpcServer, agent)
    cloudpb.RegisterTunnelServiceServer(grpcServer, tunnel)

    // grpc-web wrapper with open CORS (dev)
    wrapped := grpcweb.WrapServer(
        grpcServer,
        grpcweb.WithOriginFunc(func(origin string) bool { return true }),
        grpcweb.WithWebsockets(true),
        grpcweb.WithWebsocketOriginFunc(func(r *http.Request) bool { return true }),
    )

    handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.Method == http.MethodGet && r.URL.Path == "/healthz" {
            w.WriteHeader(http.StatusOK)
            _, _ = w.Write([]byte("ok"))
            return
        }
        // Allow raw gRPC over h2c (non-web) to reach grpcServer
        if r.ProtoMajor == 2 && strings.Contains(r.Header.Get("Content-Type"), "application/grpc") {
            grpcServer.ServeHTTP(w, r)
            return
        }
        if wrapped.IsGrpcWebRequest(r) || wrapped.IsAcceptableGrpcCorsRequest(r) || wrapped.IsGrpcWebSocketRequest(r) {
            wrapped.ServeHTTP(w, r)
            return
        }
        w.WriteHeader(http.StatusNoContent)
    })

    httpSrv := &http.Server{Addr: ":" + cfg.Port, Handler: h2c.NewHandler(handler, &http2.Server{})}

    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()
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
