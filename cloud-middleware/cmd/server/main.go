package main

import (
    "context"
    "log"
    "net"
    "os"
    "os/signal"
    "syscall"
    "time"
    
    cloudpb "pc-remote-ctrl/cloud-middleware/proto"
    "pc-remote-ctrl/cloud-middleware/internal/device"
    "pc-remote-ctrl/cloud-middleware/internal/grpcserver"
    "pc-remote-ctrl/cloud-middleware/internal/proxy"
    
    "google.golang.org/grpc"
)

func main() {
	// 配置
    config := &Config{
        GRPCPort: getEnv("GRPC_PORT", "7073"),
    }
	
	log.Printf("Starting cloud middleware gRPC server on port %s", config.GRPCPort)
	
	// 初始化组件
	deviceManager := device.NewManager()
	grpcProxy := proxy.NewGrpcProxy(deviceManager)
	
	// 启动设备状态检查
	go startDeviceHealthCheck(deviceManager)
	
    // 启动 gRPC 服务器（云端服务）
    grpcSrv := grpc.NewServer()
    cloudpb.RegisterDeviceRegistryServiceServer(grpcSrv, grpcserver.NewDeviceRegistryServer(deviceManager, grpcProxy))
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
        grpcProxy.Cleanup()
        grpcSrv.GracefulStop()
    }()

    log.Printf("gRPC listening on %s", config.GRPCPort)

    if err := grpcSrv.Serve(lis); err != nil {
        log.Fatalf("gRPC server failed: %v", err)
    }
}

type Config struct {
    GRPCPort string
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
