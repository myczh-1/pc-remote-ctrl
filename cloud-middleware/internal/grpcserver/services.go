package grpcserver

import (
    "context"
    "fmt"
    "log"
    "math/rand"
    "time"

    cloudpb "pc-remote-ctrl/cloud-middleware/proto/cloud"
    "pc-remote-ctrl/cloud-middleware/internal/device"
    "pc-remote-ctrl/cloud-middleware/internal/proxy"
    controllerpb "pc-remote-ctrl/backend/proto"

    "google.golang.org/grpc/codes"
    "google.golang.org/grpc/status"
    "google.golang.org/protobuf/proto"
)

// DeviceRegistryServer implements cloud DeviceRegistryService
type DeviceRegistryServer struct {
    cloudpb.UnimplementedDeviceRegistryServiceServer
    devMgr *device.Manager
    proxy  *proxy.GrpcProxy
}

func NewDeviceRegistryServer(devMgr *device.Manager, proxy *proxy.GrpcProxy) *DeviceRegistryServer {
    return &DeviceRegistryServer{devMgr: devMgr, proxy: proxy}
}

// 删除了 RegisterDevice/Heartbeat：改为仅通过 ConnectAgent/AgentHeartbeat 维护在线状态

func (s *DeviceRegistryServer) ListDevices(ctx context.Context, req *cloudpb.ListDevicesRequest) (*cloudpb.ListDevicesResponse, error) {
    list := s.devMgr.GetAllDevices()
    out := make([]*cloudpb.DeviceInfo, 0, len(list))
    for _, d := range list {
        out = append(out, &cloudpb.DeviceInfo{
            DeviceId: d.ID,
            Name:     d.Name,
            Address:  d.Address,
            Status:   string(d.Status),
        })
    }
    return &cloudpb.ListDevicesResponse{Devices: out}, nil
}

// ConnectAgent 处理Agent的双向流连接
func (s *DeviceRegistryServer) ConnectAgent(stream cloudpb.DeviceRegistryService_ConnectAgentServer) error {
    log.Printf("New agent connection attempt")
    
    var deviceID string
    
    // 等待Agent的连接消息
    for {
        msg, err := stream.Recv()
        if err != nil {
            log.Printf("Agent stream recv error: %v", err)
            if deviceID != "" {
                s.proxy.UnregisterAgentStream(deviceID)
            }
            return err
        }
        
        switch payload := msg.Message.(type) {
        case *cloudpb.AgentMessage_Connect:
            // 处理Agent连接
            deviceID = payload.Connect.DeviceId
            
            // 注册设备
            s.devMgr.Register(&device.Device{
                ID:     deviceID,
                Name:   payload.Connect.Name,
                Status: device.StatusOnline,
            })
            
            // 注册Agent流（单写协程 + 队列）
            s.proxy.RegisterAgentStream(deviceID, stream)
            
            // 发送连接确认
            ack := &cloudpb.CloudMessage{
                Message: &cloudpb.CloudMessage_ConnectAck{
                    ConnectAck: &cloudpb.ConnectAck{
                        Success:   true,
                        Message:   "Connected successfully",
                        SessionId: fmt.Sprintf("session_%s_%d", deviceID, time.Now().Unix()),
                    },
                },
            }
            if err := stream.Send(ack); err != nil {
                log.Printf("Failed to send connect ack: %v", err)
                return err
            }
            
            log.Printf("Agent %s connected successfully", deviceID)
            
        case *cloudpb.AgentMessage_Heartbeat:
            // 处理心跳
            s.devMgr.Heartbeat(payload.Heartbeat.DeviceId)
            
        case *cloudpb.AgentMessage_Response:
            // 处理命令响应
            s.proxy.HandleCommandResponse(payload.Response.RequestId, payload.Response.Payload)
            
        default:
            log.Printf("Unknown message type from agent")
        }
    }
}

// GatewayServer implements cloud GatewayService
type GatewayServer struct {
    cloudpb.UnimplementedGatewayServiceServer
    devMgr *device.Manager
    proxy  *proxy.GrpcProxy
}

func NewGatewayServer(devMgr *device.Manager, proxy *proxy.GrpcProxy) *GatewayServer {
    return &GatewayServer{devMgr: devMgr, proxy: proxy}
}

func (s *GatewayServer) ExecuteOnDevice(ctx context.Context, req *cloudpb.ExecuteOnDeviceRequest) (*controllerpb.ExecuteCommandSetResponse, error) {
    // 生成请求ID
    requestID := generateRequestID()
    
    // 序列化请求
    payload, err := proto.Marshal(req.Request)
    if err != nil {
        return nil, status.Errorf(codes.InvalidArgument, "failed to marshal request: %v", err)
    }
    
    // 通过双向流发送命令到Agent
    respPayload, err := s.proxy.SendCommandToAgent(ctx, req.DeviceId, requestID, cloudpb.ControllerMethod_CONTROLLER_METHOD_EXECUTE, payload)
    if err != nil {
        return nil, status.Errorf(codes.Unavailable, "failed to send command to agent: %v", err)
    }
    
    // 反序列化响应
    var response controllerpb.ExecuteCommandSetResponse
    if err := proto.Unmarshal(respPayload, &response); err != nil {
        return nil, status.Errorf(codes.Internal, "failed to unmarshal response: %v", err)
    }
    
    return &response, nil
}

func (s *GatewayServer) ListDeviceCommandSets(ctx context.Context, req *cloudpb.ListDeviceCommandSetsRequest) (*controllerpb.GetAllCommandSetsResponse, error) {
    requestID := generateRequestID()
    payload, err := proto.Marshal(req.Request)
    if err != nil {
        return nil, status.Errorf(codes.InvalidArgument, "failed to marshal request: %v", err)
    }
    respPayload, err := s.proxy.SendCommandToAgent(ctx, req.DeviceId, requestID, cloudpb.ControllerMethod_CONTROLLER_METHOD_LIST, payload)
    if err != nil {
        return nil, status.Errorf(codes.Unavailable, "failed to send to agent: %v", err)
    }
    var response controllerpb.GetAllCommandSetsResponse
    if err := proto.Unmarshal(respPayload, &response); err != nil {
        return nil, status.Errorf(codes.Internal, "failed to unmarshal response: %v", err)
    }
    return &response, nil
}

func (s *GatewayServer) StoreOnDevice(ctx context.Context, req *cloudpb.StoreOnDeviceRequest) (*controllerpb.StoreCommandSetResponse, error) {
    requestID := generateRequestID()
    payload, err := proto.Marshal(req.Request)
    if err != nil {
        return nil, status.Errorf(codes.InvalidArgument, "failed to marshal request: %v", err)
    }
    respPayload, err := s.proxy.SendCommandToAgent(ctx, req.DeviceId, requestID, cloudpb.ControllerMethod_CONTROLLER_METHOD_STORE, payload)
    if err != nil {
        return nil, status.Errorf(codes.Unavailable, "failed to send to agent: %v", err)
    }
    var response controllerpb.StoreCommandSetResponse
    if err := proto.Unmarshal(respPayload, &response); err != nil {
        return nil, status.Errorf(codes.Internal, "failed to unmarshal response: %v", err)
    }
    return &response, nil
}

func (s *GatewayServer) UpdateOnDevice(ctx context.Context, req *cloudpb.UpdateOnDeviceRequest) (*controllerpb.UpdateCommandSetResponse, error) {
    requestID := generateRequestID()
    payload, err := proto.Marshal(req.Request)
    if err != nil {
        return nil, status.Errorf(codes.InvalidArgument, "failed to marshal request: %v", err)
    }
    respPayload, err := s.proxy.SendCommandToAgent(ctx, req.DeviceId, requestID, cloudpb.ControllerMethod_CONTROLLER_METHOD_UPDATE, payload)
    if err != nil {
        return nil, status.Errorf(codes.Unavailable, "failed to send to agent: %v", err)
    }
    var response controllerpb.UpdateCommandSetResponse
    if err := proto.Unmarshal(respPayload, &response); err != nil {
        return nil, status.Errorf(codes.Internal, "failed to unmarshal response: %v", err)
    }
    return &response, nil
}

func (s *GatewayServer) DeleteOnDevice(ctx context.Context, req *cloudpb.DeleteOnDeviceRequest) (*controllerpb.DeleteCommandSetResponse, error) {
    requestID := generateRequestID()
    payload, err := proto.Marshal(req.Request)
    if err != nil {
        return nil, status.Errorf(codes.InvalidArgument, "failed to marshal request: %v", err)
    }
    respPayload, err := s.proxy.SendCommandToAgent(ctx, req.DeviceId, requestID, cloudpb.ControllerMethod_CONTROLLER_METHOD_DELETE, payload)
    if err != nil {
        return nil, status.Errorf(codes.Unavailable, "failed to send to agent: %v", err)
    }
    var response controllerpb.DeleteCommandSetResponse
    if err := proto.Unmarshal(respPayload, &response); err != nil {
        return nil, status.Errorf(codes.Internal, "failed to unmarshal response: %v", err)
    }
    return &response, nil
}

func generateRequestID() string {
    return fmt.Sprintf("req_%d_%d", time.Now().UnixNano(), rand.Int63())
}

// StreamLogs: 处理大体量日志上报，定期ACK防止阻塞控制面
func (s *DeviceRegistryServer) StreamLogs(stream cloudpb.DeviceRegistryService_StreamLogsServer) error {
    var deviceID string
    var streamID string
    var lastAck int64
    ackEvery := int64(50) // 每50条ACK一次，简单背压（示例）
    count := int64(0)

    for {
        line, err := stream.Recv()
        if err != nil {
            // 结束/错误：若有设备ID，将其心跳更新时间
            if deviceID != "" {
                s.devMgr.Heartbeat(deviceID)
            }
            return err
        }
        if deviceID == "" {
            deviceID = line.DeviceId
        }
        if streamID == "" {
            streamID = line.StreamId
        }
        // 简单处理：更新在线状态，打印或路由日志（此处先打印）
        s.devMgr.Heartbeat(line.DeviceId)
        // 可替换为写入存储/消息队列
        log.Printf("log[%s/%s] #%d %s len=%d end=%v", line.DeviceId, line.StreamId, line.Seq, line.Level, len(line.Chunk), line.End)

        count++
        if line.End || (count%ackEvery == 0) {
            lastAck = line.Seq
            if err := stream.Send(&cloudpb.LogAck{StreamId: streamID, AckSeq: lastAck}); err != nil {
                return err
            }
            if line.End {
                return nil
            }
        }
    }
}
