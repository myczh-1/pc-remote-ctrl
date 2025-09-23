package server

import (
    "context"
    "errors"
    "log"

    homepb "pc-remote-ctrl/backend/proto/home"
    cloudpb "pc-remote-ctrl/cloud-middleware/proto/cloud"
    "pc-remote-ctrl/cloud-middleware/internal/executor"
    "pc-remote-ctrl/cloud-middleware/internal/registry"
)

type GatewayServer struct {
    cloudpb.UnimplementedGatewayServiceServer
    reg    *registry.MemoryRegistry
    dialer *executor.Dialer
}

func NewGatewayServer(reg *registry.MemoryRegistry, dialer *executor.Dialer) *GatewayServer {
    return &GatewayServer{reg: reg, dialer: dialer}
}

func (s *GatewayServer) getClient(ctx context.Context, deviceID string) (homepb.HomeServiceClient, error) {
    e, ok := s.reg.Get(deviceID)
    if !ok || e.Addr == "" {
        return nil, errors.New("no route for device")
    }
    if e.Conn == nil {
        conn, err := s.dialer.Dial(ctx, e.Addr)
        if err != nil {
            return nil, err
        }
        if deviceID != "" {
            s.reg.SetConn(deviceID, conn)
        }
        e.Conn = conn
    }
    return homepb.NewHomeServiceClient(e.Conn), nil
}

func (s *GatewayServer) ListDevices(ctx context.Context, req *cloudpb.ListDevicesRequest) (*homepb.ListDevicesResponse, error) {
    c, err := s.getClient(ctx, req.GetDeviceId())
    if err != nil {
        return nil, err
    }
    return c.ListDevices(ctx, req.GetRequest())
}

func (s *GatewayServer) UpsertDevice(ctx context.Context, req *cloudpb.UpsertDeviceRequest) (*homepb.UpsertDeviceResponse, error) {
    c, err := s.getClient(ctx, req.GetDeviceId())
    if err != nil {
        return nil, err
    }
    return c.UpsertDevice(ctx, req.GetRequest())
}

func (s *GatewayServer) DeleteDevice(ctx context.Context, req *cloudpb.DeleteDeviceRequest) (*homepb.DeleteDeviceResponse, error) {
    c, err := s.getClient(ctx, req.GetDeviceId())
    if err != nil {
        return nil, err
    }
    return c.DeleteDevice(ctx, req.GetRequest())
}

func (s *GatewayServer) InvokeAction(ctx context.Context, req *cloudpb.InvokeActionRequest) (*homepb.InvokeActionResponse, error) {
    c, err := s.getClient(ctx, req.GetDeviceId())
    if err != nil {
        return nil, err
    }
    return c.InvokeAction(ctx, req.GetRequest())
}

func (s *GatewayServer) WatchDevices(req *cloudpb.WatchDevicesRequest, stream cloudpb.GatewayService_WatchDevicesServer) error {
    ctx := stream.Context()
    c, err := s.getClient(ctx, req.GetDeviceId())
    if err != nil {
        return err
    }
    src, err := c.WatchDevices(ctx, req.GetRequest())
    if err != nil {
        return err
    }
    for {
        ev, err := src.Recv()
        if err != nil {
            if ctx.Err() != nil {
                return ctx.Err()
            }
            return err
        }
        if err := stream.Send(ev); err != nil {
            log.Printf("watch: send error: %v", err)
            return err
        }
    }
}
