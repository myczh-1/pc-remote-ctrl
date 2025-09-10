package proxy

import (
    "context"
    "fmt"
    "log"
    "net/http"
    "sync"
    
    "pc-remote-ctrl/cloud-middleware/internal/device"
    "pc-remote-ctrl/cloud-middleware/internal/auth"
    
    "google.golang.org/grpc"
    "google.golang.org/grpc/credentials/insecure"
    "github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
)

// GrpcProxy gRPC代理服务
type GrpcProxy struct {
    deviceManager *device.Manager
    authenticator *auth.Authenticator
    connections   map[string]*grpc.ClientConn // deviceID -> connection
    mu            sync.RWMutex                // protects connections
}

// NewGrpcProxy 创建gRPC代理
func NewGrpcProxy(deviceManager *device.Manager, authenticator *auth.Authenticator) *GrpcProxy {
	return &GrpcProxy{
		deviceManager: deviceManager,
		authenticator: authenticator,
		connections:   make(map[string]*grpc.ClientConn),
	}
}

// GetDeviceConnection 获取设备连接
func (p *GrpcProxy) GetDeviceConnection(deviceID string) (*grpc.ClientConn, error) {
    // 检查现有连接
    p.mu.RLock()
    conn, exists := p.connections[deviceID]
    p.mu.RUnlock()
    if exists {
        // TODO: 检查连接状态（如健康探测/状态）
        return conn, nil
    }
	
	// 获取设备信息
	device, exists := p.deviceManager.GetDevice(deviceID)
	if !exists {
		return nil, fmt.Errorf("device not found: %s", deviceID)
	}
	
	if device.Status != "online" {
		return nil, fmt.Errorf("device offline: %s", deviceID)
	}
	
    // 创建新连接
    newConn, err := grpc.Dial(device.Address, grpc.WithTransportCredentials(insecure.NewCredentials()))
    if err != nil {
        return nil, fmt.Errorf("failed to connect to device: %w", err)
    }
    
    p.mu.Lock()
    p.connections[deviceID] = newConn
    p.mu.Unlock()
    return newConn, nil
}

// CloseDeviceConnection 关闭设备连接
func (p *GrpcProxy) CloseDeviceConnection(deviceID string) {
    p.mu.Lock()
    if conn, exists := p.connections[deviceID]; exists {
        conn.Close()
        delete(p.connections, deviceID)
    }
    p.mu.Unlock()
}

// CreateGatewayHandler 创建gRPC-Gateway处理器
func (p *GrpcProxy) CreateGatewayHandler(ctx context.Context) (http.Handler, error) {
	mux := runtime.NewServeMux(
		runtime.WithIncomingHeaderMatcher(func(key string) (string, bool) {
			// 允许设备ID头部传递
			if key == "X-Device-Id" {
				return key, true
			}
			return runtime.DefaultHeaderMatcher(key)
		}),
	)
	
	// TODO: 注册gRPC服务到gateway
	// 这里需要根据具体的protobuf服务来实现
	
	return mux, nil
}

// ProxyHandler HTTP代理处理器
func (p *GrpcProxy) ProxyHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 认证检查
		claims, err := p.authenticator.AuthenticateRequest(r)
		if err != nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		
		// 获取设备ID
		deviceID := r.Header.Get("X-Device-Id")
		if deviceID == "" {
			http.Error(w, "Device ID required", http.StatusBadRequest)
			return
		}
		
		// 检查用户是否有权限访问该设备
		device, exists := p.deviceManager.GetDevice(deviceID)
		if !exists {
			http.Error(w, "Device not found", http.StatusNotFound)
			return
		}
		
		if device.UserID != claims.UserID {
			http.Error(w, "Access denied", http.StatusForbidden)
			return
		}
		
		// 获取设备连接
		_, err = p.GetDeviceConnection(deviceID)
		if err != nil {
			log.Printf("Failed to get device connection: %v", err)
			http.Error(w, "Device unavailable", http.StatusServiceUnavailable)
			return
		}
		
		// TODO: 转发请求到具体的gRPC服务
		// 这里需要根据URL路径将请求路由到对应的gRPC方法
		
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Proxy handler - TODO: implement request forwarding"))
	})
}

// Cleanup 清理资源
func (p *GrpcProxy) Cleanup() {
    p.mu.Lock()
    for deviceID, conn := range p.connections {
        conn.Close()
        delete(p.connections, deviceID)
    }
    p.mu.Unlock()
}
