package grpcserver

import (
    "context"
    "fmt"
    "log"
    "math/rand"
    "time"

    cloudpb "pc-remote-ctrl/cloud-middleware/proto"
    "pc-remote-ctrl/cloud-middleware/internal/device"
    "pc-remote-ctrl/cloud-middleware/internal/proxy"
    controllerpb "pc-remote-ctrl/backend/proto"

    "google.golang.org/grpc"
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

func (s *DeviceRegistryServer) RegisterDevice(ctx context.Context, req *cloudpb.RegisterDeviceRequest) (*cloudpb.RegisterDeviceResponse, error) {
    s.devMgr.Register(&device.Device{
        ID:      req.DeviceId,
        Name:    req.Name,
        UserID:  req.UserId,
        Address: req.Address,
    })
    return &cloudpb.RegisterDeviceResponse{Success: true, Message: "registered"}, nil
}

func (s *DeviceRegistryServer) Heartbeat(ctx context.Context, req *cloudpb.HeartbeatRequest) (*cloudpb.HeartbeatResponse, error) {
    ok := s.devMgr.Heartbeat(req.DeviceId)
    return &cloudpb.HeartbeatResponse{Success: ok}, nil
}

func (s *DeviceRegistryServer) ListDevices(ctx context.Context, req *cloudpb.ListDevicesRequest) (*cloudpb.ListDevicesResponse, error) {
    list := s.devMgr.GetDevicesByUser(req.UserId)
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
    var userID string
    
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
            userID = payload.Connect.UserId
            
            // 注册设备
            s.devMgr.Register(&device.Device{
                ID:     deviceID,
                Name:   payload.Connect.Name,
                UserID: userID,
                Status: device.StatusOnline,
            })
            
            // 注册Agent流
            s.proxy.RegisterAgentStream(deviceID, userID, stream)
            
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
    respPayload, err := s.proxy.SendCommandToAgent(ctx, req.DeviceId, requestID, payload)
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

func generateRequestID() string {
    return fmt.Sprintf("req_%d_%d", time.Now().UnixNano(), rand.Int63())
}

