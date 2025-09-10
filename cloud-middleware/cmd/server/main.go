package main

import (
    "context"
    "log"
    "net"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"
    
    cloudpb "pc-remote-ctrl/cloud-middleware/proto"
    "pc-remote-ctrl/cloud-middleware/internal/auth"
    "pc-remote-ctrl/cloud-middleware/internal/cache"
    "pc-remote-ctrl/cloud-middleware/internal/device"
    "pc-remote-ctrl/cloud-middleware/internal/grpcserver"
    "pc-remote-ctrl/cloud-middleware/internal/proxy"
    
    "github.com/gorilla/mux"
    "google.golang.org/grpc"
)

func main() {
	// 配置
    config := &Config{
        Port:        getEnv("PORT", "8080"),
        GRPCPort:    getEnv("GRPC_PORT", "7073"),
        JWTSecret:   getEnv("JWT_SECRET", "your-secret-key"),
        TinyauthURL: getEnv("TINYAUTH_URL", "http://localhost:3000"),
    }
	
	log.Printf("Starting cloud middleware server on port %s", config.Port)
	
	// 初始化组件
	cache := cache.NewCache("memory")
	deviceManager := device.NewManager()
	authenticator := auth.NewAuthenticator(config.JWTSecret, config.TinyauthURL)
	grpcProxy := proxy.NewGrpcProxy(deviceManager, authenticator)
	
	// 启动设备状态检查
	go startDeviceHealthCheck(deviceManager)
	
	// 创建HTTP路由
	router := createRouter(deviceManager, authenticator, grpcProxy, cache)
	
    // 启动HTTP服务器（REST）
    server := &http.Server{
        Addr:    ":" + config.Port,
        Handler: router,
    }

    // 启动 gRPC 服务器（云端服务）
    grpcSrv := grpc.NewServer()
    cloudpb.RegisterDeviceRegistryServiceServer(grpcSrv, grpcserver.NewDeviceRegistryServer(deviceManager))
    cloudpb.RegisterGatewayServiceServer(grpcSrv, grpcserver.NewGatewayServer(deviceManager, grpcProxy))

    lis, err := net.Listen("tcp", ":"+config.GRPCPort)
    if err != nil {
        log.Fatalf("Failed to listen on gRPC port %s: %v", config.GRPCPort, err)
    }

    // 优雅关闭
    go func() {
        sigCh := make(chan os.Signal, 1)
        signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
        <-sigCh
        
        log.Println("Shutting down server...")
        
        ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
        defer cancel()
        
        grpcProxy.Cleanup()
        server.Shutdown(ctx)
        grpcSrv.GracefulStop()
    }()

    log.Printf("Server listening on http://localhost:%s", config.Port)
    log.Printf("gRPC listening on %s", config.GRPCPort)

    // 并行启动两个服务
    go func() {
        if err := server.ListenAndServe(); err != http.ErrServerClosed {
            log.Fatalf("HTTP server failed: %v", err)
        }
    }()

    if err := grpcSrv.Serve(lis); err != nil {
        log.Fatalf("gRPC server failed: %v", err)
    }
}

type Config struct {
    Port        string
    GRPCPort    string
    JWTSecret   string
    TinyauthURL string
}

func createRouter(
	deviceManager *device.Manager,
	authenticator *auth.Authenticator,
	grpcProxy *proxy.GrpcProxy,
	cache cache.Cache,
) *mux.Router {
	router := mux.NewRouter()
	
	// 健康检查
	router.HandleFunc("/health", healthCheckHandler).Methods("GET")
	
	// 设备注册（无需认证）
	router.HandleFunc("/api/devices/register", registerDeviceHandler(deviceManager)).Methods("POST")
	
	// 设备心跳（无需认证，使用设备token）
	router.HandleFunc("/api/devices/{id}/heartbeat", deviceHeartbeatHandler(deviceManager)).Methods("POST")
	
	// 需要认证的API
	authRouter := router.PathPrefix("/api").Subrouter()
	authRouter.Use(authenticator.AuthMiddleware)
	
	// 用户设备列表
	authRouter.HandleFunc("/devices", listDevicesHandler(deviceManager)).Methods("GET")
	
	// gRPC代理（需要认证）
	router.PathPrefix("/grpc/").Handler(
		http.StripPrefix("/grpc", grpcProxy.ProxyHandler()),
	)
	
	return router
}

func healthCheckHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status": "ok"}`))
}

func registerDeviceHandler(deviceManager *device.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// TODO: 实现设备注册逻辑
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"message": "Device registration - TODO"}`))
	}
}

func deviceHeartbeatHandler(deviceManager *device.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// TODO: 实现设备心跳逻辑
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"message": "Heartbeat - TODO"}`))
	}
}

func listDevicesHandler(deviceManager *device.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// TODO: 实现设备列表逻辑
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"devices": []}`))
	}
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
