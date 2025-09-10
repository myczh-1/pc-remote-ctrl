package proxy

import (
    "context"
    "fmt"
    "log"
    "sync"
    "time"
    
    "pc-remote-ctrl/cloud-middleware/internal/device"
    
    "google.golang.org/grpc"
)

// AgentStream Agent连接流
type AgentStream struct {
    deviceID string
    userID   string
    stream   StreamSender // 发送接口
    lastSeen time.Time
}

// StreamSender 流发送接口（避免直接依赖protobuf生成类型）
type StreamSender interface {
    Send(interface{}) error
}

// PendingRequest 待处理的请求
type PendingRequest struct {
    requestID string
    respChan  chan []byte
    timeout   time.Time
}

// GrpcProxy gRPC代理服务 - 管理Agent连接
type GrpcProxy struct {
    deviceManager    *device.Manager
    agentStreams     map[string]*AgentStream    // deviceID -> Agent流
    pendingRequests  map[string]*PendingRequest // requestID -> 待处理请求
    mu               sync.RWMutex              // 保护maps
}

// NewGrpcProxy 创建gRPC代理
func NewGrpcProxy(deviceManager *device.Manager) *GrpcProxy {
	return &GrpcProxy{
		deviceManager:   deviceManager,
		agentStreams:    make(map[string]*AgentStream),
		pendingRequests: make(map[string]*PendingRequest),
	}
}

// RegisterAgentStream 注册Agent连接流
func (p *GrpcProxy) RegisterAgentStream(deviceID, userID string, stream StreamSender) {
    p.mu.Lock()
    defer p.mu.Unlock()
    
    // 如果已存在，先清理
    if old, exists := p.agentStreams[deviceID]; exists {
        log.Printf("Agent %s reconnected, closing old stream", deviceID)
        // TODO: 关闭旧stream
        _ = old
    }
    
    p.agentStreams[deviceID] = &AgentStream{
        deviceID: deviceID,
        userID:   userID,
        stream:   stream,
        lastSeen: time.Now(),
    }
    
    // 更新设备状态为在线
    p.deviceManager.UpdateStatus(deviceID, device.StatusOnline)
    log.Printf("Agent %s connected", deviceID)
}

// UnregisterAgentStream 注销Agent连接流
func (p *GrpcProxy) UnregisterAgentStream(deviceID string) {
    p.mu.Lock()
    defer p.mu.Unlock()
    
    delete(p.agentStreams, deviceID)
    p.deviceManager.UpdateStatus(deviceID, device.StatusOffline)
    log.Printf("Agent %s disconnected", deviceID)
}

// SendCommandToAgent 发送命令到Agent
func (p *GrpcProxy) SendCommandToAgent(ctx context.Context, deviceID string, requestID string, payload []byte) ([]byte, error) {
    p.mu.RLock()
    agentStream, exists := p.agentStreams[deviceID]
    p.mu.RUnlock()
    
    if !exists {
        return nil, fmt.Errorf("agent not connected: %s", deviceID)
    }
    
    // 创建响应通道
    respChan := make(chan []byte, 1)
    timeout := time.Now().Add(60 * time.Second)
    
    p.mu.Lock()
    p.pendingRequests[requestID] = &PendingRequest{
        requestID: requestID,
        respChan:  respChan,
        timeout:   timeout,
    }
    p.mu.Unlock()
    
    // 创建CommandRequest消息（这里需要导入cloudpb包）
    cmdReq := map[string]interface{}{
        "Message": map[string]interface{}{
            "command": map[string]interface{}{
                "request_id": requestID,
                "payload":    payload,
            },
        },
    }
    
    // 通过stream发送CommandRequest
    if err := agentStream.stream.Send(cmdReq); err != nil {
        p.cleanupRequest(requestID)
        return nil, fmt.Errorf("failed to send command to agent: %w", err)
    }
    
    log.Printf("Sending command %s to agent %s", requestID, deviceID)
    
    // 等待响应或超时
    select {
    case response := <-respChan:
        p.cleanupRequest(requestID)
        return response, nil
    case <-ctx.Done():
        p.cleanupRequest(requestID)
        return nil, ctx.Err()
    case <-time.After(60 * time.Second):
        p.cleanupRequest(requestID)
        return nil, fmt.Errorf("command timeout")
    }
}

// HandleCommandResponse 处理Agent的命令响应
func (p *GrpcProxy) HandleCommandResponse(requestID string, payload []byte) {
    p.mu.RLock()
    pending, exists := p.pendingRequests[requestID]
    p.mu.RUnlock()
    
    if !exists {
        log.Printf("No pending request for ID: %s", requestID)
        return
    }
    
    select {
    case pending.respChan <- payload:
        // 响应发送成功
    default:
        // 通道已关闭或满
        log.Printf("Failed to send response for request %s", requestID)
    }
}

func (p *GrpcProxy) cleanupRequest(requestID string) {
    p.mu.Lock()
    if pending, exists := p.pendingRequests[requestID]; exists {
        close(pending.respChan)
        delete(p.pendingRequests, requestID)
    }
    p.mu.Unlock()
}

// Cleanup 清理资源
func (p *GrpcProxy) Cleanup() {
    p.mu.Lock()
    defer p.mu.Unlock()
    
    // 清理所有Agent连接
    for deviceID := range p.agentStreams {
        // TODO: 关闭stream
        delete(p.agentStreams, deviceID)
    }
    
    // 清理待处理请求
    for requestID, pending := range p.pendingRequests {
        close(pending.respChan)
        delete(p.pendingRequests, requestID)
    }
}
