package main

import (
    "context"
    "log"
    "net/http"
    "os"
    "os/signal"
    "strings"
    "syscall"
    "time"

    cloudpb "pc-remote-ctrl/cloud-middleware/proto/cloud"
    "pc-remote-ctrl/cloud-middleware/internal/device"
    "pc-remote-ctrl/cloud-middleware/internal/grpcserver"
    "pc-remote-ctrl/cloud-middleware/internal/proxy"

    "github.com/improbable-eng/grpc-web/go/grpcweb"
    "google.golang.org/grpc"
    "golang.org/x/net/http2"
    "golang.org/x/net/http2/h2c"
)

func main() {
    // 配置
    config := &Config{
        GRPCPort:       getEnv("GRPC_PORT", "7073"),
        AllowedOrigins: getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:5173, http://127.0.0.1:5173"),
    }

    log.Printf("Starting cloud middleware on port %s (grpc+grpc-web)", config.GRPCPort)

    // 初始化组件
    deviceManager := device.NewManager()
    grpcProxy := proxy.NewGrpcProxy(deviceManager)

    // 启动设备状态检查
    go startDeviceHealthCheck(deviceManager)

    // 启动 gRPC 服务器（云端服务）
    grpcSrv := grpc.NewServer()
    cloudpb.RegisterDeviceRegistryServiceServer(grpcSrv, grpcserver.NewDeviceRegistryServer(deviceManager, grpcProxy))
    cloudpb.RegisterGatewayServiceServer(grpcSrv, grpcserver.NewGatewayServer(deviceManager, grpcProxy))

    // grpc-web 封装 + 统一 HTTP Server
    allowed := parseOrigins(config.AllowedOrigins)
    wrapped := grpcweb.WrapServer(
        grpcSrv,
        grpcweb.WithOriginFunc(func(origin string) bool {
            if origin == "" { // non-browser client
                return true
            }
            if allowed["*"] {
                return true
            }
            return allowed[strings.TrimSpace(origin)]
        }),
        grpcweb.WithCorsForRegisteredEndpointsOnly(false),
    )

    handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // 先交给 grpc-web 处理（包含预检 OPTIONS）
        if wrapped.IsGrpcWebRequest(r) || wrapped.IsAcceptableGrpcCorsRequest(r) || wrapped.IsGrpcWebSocketRequest(r) {
            wrapped.ServeHTTP(w, r)
            return
        }
        // 尝试处理原生 gRPC（HTTP/2）
        if r.ProtoMajor == 2 && strings.HasPrefix(r.Header.Get("Content-Type"), "application/grpc") {
            grpcSrv.ServeHTTP(w, r)
            return
        }
        w.WriteHeader(http.StatusNotFound)
        _, _ = w.Write([]byte("cloud-middleware grpc/grpc-web endpoint"))
    })

    // 用 h2c 包装，允许明文 HTTP/2，便于本地 gRPC 客户端（agent）直连
    httpSrv := &http.Server{
        Addr:    ":" + config.GRPCPort,
        Handler: h2c.NewHandler(handler, &http2.Server{}),
    }

    // 优雅关闭
    go func() {
        sigCh := make(chan os.Signal, 1)
        signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
        <-sigCh
        log.Println("Shutting down server...")
        _ = httpSrv.Shutdown(context.Background())
        grpcProxy.Cleanup()
        grpcSrv.GracefulStop()
    }()

    log.Printf("listening on %s (grpc/grpc-web)", config.GRPCPort)
    if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
        log.Fatalf("server failed: %v", err)
    }
}

type Config struct {
    GRPCPort string
    AllowedOrigins string
}

func startDeviceHealthCheck(deviceManager *device.Manager) {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	
	for range ticker.C {
		deviceManager.CheckOfflineDevices(5 * time.Minute)
	}
}

func getEnv(key, defaultValue string) string {
    if value := os.Getenv(key); value != "" {
        return value
    }
    return defaultValue
}

func parseOrigins(csv string) map[string]bool {
    m := make(map[string]bool)
    for _, s := range strings.Split(csv, ",") {
        s = strings.TrimSpace(s)
        if s == "" { continue }
        m[s] = true
    }
    return m
}
