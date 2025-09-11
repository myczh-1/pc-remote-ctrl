package proxy

import (
    "context"
    "errors"
    "fmt"
    "log"
    "sync"
    "time"

    cloudpb "pc-remote-ctrl/cloud-middleware/proto"
    "pc-remote-ctrl/cloud-middleware/internal/device"
)

// AgentStream 绑定每台设备的控制面流与发送队列
type AgentStream struct {
    deviceID string
    userID   string
    stream   cloudpb.DeviceRegistryService_ConnectAgentServer
    sendQ    chan *cloudpb.CloudMessage
    closed   chan struct{}
    lastSeen time.Time
}

// PendingRequest 待处理命令
type PendingRequest struct {
    respChan chan []byte
    errChan  chan error
}

// GrpcProxy 管理Agent连接与命令收发
type GrpcProxy struct {
    deviceManager   *device.Manager
    agentStreams    map[string]*AgentStream       // deviceID -> Agent流
    pendingRequests map[string]*PendingRequest    // requestID -> 待处理
    deviceRequests  map[string]map[string]struct{} // deviceID -> set(requestID)
    mu              sync.RWMutex
}

// NewGrpcProxy 创建代理
func NewGrpcProxy(deviceManager *device.Manager) *GrpcProxy {
    return &GrpcProxy{
        deviceManager:   deviceManager,
        agentStreams:    make(map[string]*AgentStream),
        pendingRequests: make(map[string]*PendingRequest),
        deviceRequests:  make(map[string]map[string]struct{}),
    }
}

// RegisterAgentStream 注册/替换设备流（单写协程）
func (p *GrpcProxy) RegisterAgentStream(deviceID, userID string, stream cloudpb.DeviceRegistryService_ConnectAgentServer) {
    p.mu.Lock()
    // 若已有旧流，先取消该设备所有挂起请求
    if old := p.agentStreams[deviceID]; old != nil {
        log.Printf("Agent %s reconnected; canceling in-flight requests", deviceID)
        close(old.closed) // 停止旧发送循环
        p.cancelAllForDeviceLocked(deviceID, errors.New("agent reconnected"))
    }

    as := &AgentStream{
        deviceID: deviceID,
        userID:   userID,
        stream:   stream,
        sendQ:    make(chan *cloudpb.CloudMessage, 1024),
        closed:   make(chan struct{}),
        lastSeen: time.Now(),
    }
    p.agentStreams[deviceID] = as
    p.deviceManager.UpdateStatus(deviceID, device.StatusOnline)
    p.mu.Unlock()

    // 启动单写发送循环
    go p.sendLoop(as)
    log.Printf("Agent %s connected", deviceID)
}

// UnregisterAgentStream 注销设备流并取消挂起请求
func (p *GrpcProxy) UnregisterAgentStream(deviceID string) {
    p.mu.Lock()
    if old := p.agentStreams[deviceID]; old != nil {
        close(old.closed)
        delete(p.agentStreams, deviceID)
    }
    p.cancelAllForDeviceLocked(deviceID, errors.New("agent disconnected"))
    p.deviceManager.UpdateStatus(deviceID, device.StatusOffline)
    p.mu.Unlock()
    log.Printf("Agent %s disconnected", deviceID)
}

func (p *GrpcProxy) sendLoop(as *AgentStream) {
    for {
        select {
        case <-as.closed:
            return
        case msg := <-as.sendQ:
            if err := as.stream.Send(msg); err != nil {
                log.Printf("Send to agent %s failed: %v", as.deviceID, err)
                // 主动下线并取消挂起请求
                p.UnregisterAgentStream(as.deviceID)
                return
            }
        }
    }
}

// SendCommandToAgent 发送命令到Agent（控制面流）
func (p *GrpcProxy) SendCommandToAgent(ctx context.Context, deviceID string, requestID string, payload []byte) ([]byte, error) {
    // 包装默认超时（若上层未设置）
    if _, ok := ctx.Deadline(); !ok {
        var cancel context.CancelFunc
        ctx, cancel = context.WithTimeout(ctx, 60*time.Second)
        defer cancel()
    }

    p.mu.RLock()
    as := p.agentStreams[deviceID]
    p.mu.RUnlock()
    if as == nil {
        return nil, fmt.Errorf("agent not connected: %s", deviceID)
    }

    // 挂起请求
    pr := &PendingRequest{respChan: make(chan []byte, 1), errChan: make(chan error, 1)}
    p.mu.Lock()
    p.pendingRequests[requestID] = pr
    if p.deviceRequests[deviceID] == nil {
        p.deviceRequests[deviceID] = make(map[string]struct{})
    }
    p.deviceRequests[deviceID][requestID] = struct{}{}
    p.mu.Unlock()

    // 入发送队列
    cmd := &cloudpb.CloudMessage{
        Message: &cloudpb.CloudMessage_Command{
            Command: &cloudpb.CommandRequest{RequestId: requestID, Payload: payload},
        },
    }

    select {
    case as.sendQ <- cmd:
        // ok
    case <-ctx.Done():
        p.cleanupRequest(deviceID, requestID)
        return nil, ctx.Err()
    }

    log.Printf("Send command %s -> device %s", requestID, deviceID)

    // 等待响应/取消/超时
    select {
    case resp := <-pr.respChan:
        p.cleanupRequest(deviceID, requestID)
        return resp, nil
    case err := <-pr.errChan:
        p.cleanupRequest(deviceID, requestID)
        return nil, err
    case <-ctx.Done():
        p.cleanupRequest(deviceID, requestID)
        return nil, ctx.Err()
    }
}

// HandleCommandResponse 由接收协程回调
func (p *GrpcProxy) HandleCommandResponse(requestID string, payload []byte) {
    p.mu.RLock()
    pr, ok := p.pendingRequests[requestID]
    p.mu.RUnlock()
    if !ok {
        log.Printf("No pending request for %s", requestID)
        return
    }
    select {
    case pr.respChan <- payload:
    default:
        // 丢弃（调用端已超时/取消）
    }
}

func (p *GrpcProxy) cancelAllForDeviceLocked(deviceID string, err error) {
    ids := p.deviceRequests[deviceID]
    for rid := range ids {
        if pr, ok := p.pendingRequests[rid]; ok {
            select { case pr.errChan <- err: default: }
            delete(p.pendingRequests, rid)
        }
    }
    delete(p.deviceRequests, deviceID)
}

func (p *GrpcProxy) cleanupRequest(deviceID, requestID string) {
    p.mu.Lock()
    delete(p.pendingRequests, requestID)
    if m := p.deviceRequests[deviceID]; m != nil {
        delete(m, requestID)
        if len(m) == 0 { delete(p.deviceRequests, deviceID) }
    }
    p.mu.Unlock()
}

// Cleanup 清理资源
func (p *GrpcProxy) Cleanup() {
    p.mu.Lock()
    for deviceID, as := range p.agentStreams {
        close(as.closed)
        delete(p.agentStreams, deviceID)
    }
    // 取消所有挂起
    for rid, pr := range p.pendingRequests {
        select { case pr.errChan <- errors.New("server shutdown"): default: }
        delete(p.pendingRequests, rid)
    }
    p.deviceRequests = make(map[string]map[string]struct{})
    p.mu.Unlock()
}
