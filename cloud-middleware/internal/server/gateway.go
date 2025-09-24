package server

import (
    "context"
    "fmt"
    "log"
    "math/rand"
    "time"

    homepb "pc-remote-ctrl/backend/proto/home"
    cloudpb "pc-remote-ctrl/cloud-middleware/proto/cloud"
    "pc-remote-ctrl/cloud-middleware/internal/registry"

    "google.golang.org/protobuf/proto"
    "google.golang.org/grpc/codes"
    "google.golang.org/grpc/status"
)

type GatewayServer struct {
    cloudpb.UnimplementedGatewayServiceServer
    reg *registry.MemoryRegistry
    maxFrameBytes int
}

func NewGatewayServer(reg *registry.MemoryRegistry, maxFrameBytes int) *GatewayServer {
    return &GatewayServer{reg: reg, maxFrameBytes: maxFrameBytes}
}

func corrID() string {
    return fmt.Sprintf("%d-%d", time.Now().UnixNano(), rand.Int63())
}

const homeSvc = "/remote_control.home.HomeService/"

func (s *GatewayServer) unaryViaTunnel(ctx context.Context, deviceID, method string, in proto.Message, out proto.Message) error {
    link, ok := s.reg.GetTunnel(deviceID)
    if !ok {
        return status.Error(codes.NotFound, "no tunnel for device")
    }
    cid := corrID()
    ch, cancel := link.Register(cid)
    defer cancel()

    payload, err := proto.Marshal(in)
    if err != nil {
        return err
    }
    if s.maxFrameBytes > 0 && len(payload) > s.maxFrameBytes {
        return status.Error(codes.InvalidArgument, "payload too large")
    }
    log.Printf("gateway: OPEN device_id=%s corr_id=%s method=%s bytes=%d", deviceID, cid, method, len(payload))
    if err := link.Send(&cloudpb.TunnelFrame{CorrId: cid, Type: cloudpb.FrameType_OPEN, Method: method, Payload: payload}); err != nil {
        return err
    }
    // wait for DATA/CLOSE/ERROR
    gotData := false
    for {
        select {
        case <-ctx.Done():
            return ctx.Err()
        case f, ok := <-ch:
            if !ok {
                if gotData {
                    return nil
                }
                return status.Error(codes.Unavailable, "tunnel closed")
            }
            switch f.GetType() {
            case cloudpb.FrameType_ERROR:
                if f.GetMessage() != "" {
                    log.Printf("gateway: ERROR device_id=%s corr_id=%s method=%s msg=%s", deviceID, cid, method, f.GetMessage())
                    return status.Error(codes.Unavailable, f.GetMessage())
                }
                log.Printf("gateway: ERROR device_id=%s corr_id=%s method=%s", deviceID, cid, method)
                return status.Error(codes.Unavailable, "upstream error")
            case cloudpb.FrameType_DATA:
                if err := proto.Unmarshal(f.GetPayload(), out); err != nil {
                    return err
                }
                gotData = true
            case cloudpb.FrameType_CLOSE:
                log.Printf("gateway: CLOSE device_id=%s corr_id=%s method=%s got_data=%v", deviceID, cid, method, gotData)
                if !gotData {
                    return status.Error(codes.Internal, "no data before close")
                }
                return nil
            }
        }
    }
}

func (s *GatewayServer) ListDevices(ctx context.Context, req *cloudpb.ListDevicesRequest) (*homepb.ListDevicesResponse, error) {
    var out homepb.ListDevicesResponse
    err := s.unaryViaTunnel(ctx, req.GetDeviceId(), homeSvc+"ListDevices", req.GetRequest(), &out)
    if err != nil {
        return nil, err
    }
    return &out, nil
}

func (s *GatewayServer) UpsertDevice(ctx context.Context, req *cloudpb.UpsertDeviceRequest) (*homepb.UpsertDeviceResponse, error) {
    var out homepb.UpsertDeviceResponse
    err := s.unaryViaTunnel(ctx, req.GetDeviceId(), homeSvc+"UpsertDevice", req.GetRequest(), &out)
    if err != nil {
        return nil, err
    }
    return &out, nil
}

func (s *GatewayServer) DeleteDevice(ctx context.Context, req *cloudpb.DeleteDeviceRequest) (*homepb.DeleteDeviceResponse, error) {
    var out homepb.DeleteDeviceResponse
    err := s.unaryViaTunnel(ctx, req.GetDeviceId(), homeSvc+"DeleteDevice", req.GetRequest(), &out)
    if err != nil {
        return nil, err
    }
    return &out, nil
}

func (s *GatewayServer) InvokeAction(ctx context.Context, req *cloudpb.InvokeActionRequest) (*homepb.InvokeActionResponse, error) {
    var out homepb.InvokeActionResponse
    err := s.unaryViaTunnel(ctx, req.GetDeviceId(), homeSvc+"InvokeAction", req.GetRequest(), &out)
    if err != nil {
        return nil, err
    }
    return &out, nil
}

func (s *GatewayServer) WatchDevices(req *cloudpb.WatchDevicesRequest, stream cloudpb.GatewayService_WatchDevicesServer) error {
    ctx := stream.Context()
    deviceID := req.GetDeviceId()
    link, ok := s.reg.GetTunnel(deviceID)
    if !ok {
        return status.Error(codes.NotFound, "no tunnel for device")
    }
    cid := corrID()
    ch, cancel := link.Register(cid)
    defer cancel()

    payload, err := proto.Marshal(req.GetRequest())
    if err != nil {
        return err
    }
    if s.maxFrameBytes > 0 && len(payload) > s.maxFrameBytes {
        return status.Error(codes.InvalidArgument, "payload too large")
    }
    log.Printf("gateway: OPEN device_id=%s corr_id=%s method=%s bytes=%d", deviceID, cid, homeSvc+"WatchDevices", len(payload))
    if err := link.Send(&cloudpb.TunnelFrame{CorrId: cid, Type: cloudpb.FrameType_OPEN, Method: homeSvc + "WatchDevices", Payload: payload}); err != nil {
        return err
    }
    for {
        select {
        case <-ctx.Done():
            // best effort close
            _ = link.Send(&cloudpb.TunnelFrame{CorrId: cid, Type: cloudpb.FrameType_CLOSE})
            return ctx.Err()
        case f, ok := <-ch:
            if !ok {
                return nil
            }
            switch f.GetType() {
            case cloudpb.FrameType_ERROR:
                if f.GetMessage() != "" {
                    return status.Error(codes.Unavailable, f.GetMessage())
                }
                return status.Error(codes.Unavailable, "upstream error")
            case cloudpb.FrameType_DATA:
                var ev homepb.DeviceEvent
                if err := proto.Unmarshal(f.GetPayload(), &ev); err != nil {
                    return err
                }
                if err := stream.Send(&ev); err != nil {
                    log.Printf("watch: send error: %v", err)
                    return err
                }
            case cloudpb.FrameType_CLOSE:
                return nil
            }
        }
    }
}
