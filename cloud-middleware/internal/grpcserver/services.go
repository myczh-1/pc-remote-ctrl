package grpcserver

import (
    "context"
    "time"

    cloudpb "pc-remote-ctrl/cloud-middleware/proto"
    "pc-remote-ctrl/cloud-middleware/internal/device"
    "pc-remote-ctrl/cloud-middleware/internal/proxy"
    controllerpb "pc-remote-ctrl/backend/proto"

    "google.golang.org/grpc"
)

// DeviceRegistryServer implements cloud DeviceRegistryService
type DeviceRegistryServer struct {
    cloudpb.UnimplementedDeviceRegistryServiceServer
    devMgr *device.Manager
}

func NewDeviceRegistryServer(devMgr *device.Manager) *DeviceRegistryServer {
    return &DeviceRegistryServer{devMgr: devMgr}
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
    // 获取到目标设备的 gRPC 连接
    conn, err := s.proxy.GetDeviceConnection(req.DeviceId)
    if err != nil {
        return &controllerpb.ExecuteCommandSetResponse{Success: false, Error: err.Error()}, nil
    }

    // 代理调用 Agent 的 ControllerService
    client := controllerpb.NewControllerServiceClient(conn)

    // 给代理调用一个合理的超时
    timeoutCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
    defer cancel()

    // 透传请求
    return client.ExecuteCommandSet(timeoutCtx, req.Request, grpc.WaitForReady(true))
}

