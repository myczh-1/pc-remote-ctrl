package server

import (
    "io"
    "log"

    "google.golang.org/grpc/metadata"
    "google.golang.org/grpc/status"
    "google.golang.org/grpc/codes"

    "pc-remote-ctrl/cloud-middleware/internal/registry"
    cloudpb "pc-remote-ctrl/cloud-middleware/proto/cloud"
)

// TunnelServer handles reverse-tunnel connections from agents and
// dispatches frames to waiters based on corr_id.
type TunnelServer struct {
    cloudpb.UnimplementedTunnelServiceServer
    reg *registry.MemoryRegistry
    bufSize int
    maxFrameBytes int
    agentSecret string
}

func NewTunnelServer(reg *registry.MemoryRegistry, bufSize int, maxFrameBytes int, agentSecret string) *TunnelServer {
    return &TunnelServer{reg: reg, bufSize: bufSize, maxFrameBytes: maxFrameBytes, agentSecret: agentSecret}
}

func (s *TunnelServer) Open(stream cloudpb.TunnelService_OpenServer) error {
    // identify device from metadata
    md, _ := metadata.FromIncomingContext(stream.Context())
    ids := md.Get("x-device-id")
    if len(ids) == 0 || ids[0] == "" {
        log.Printf("tunnel: missing x-device-id metadata, closing")
        return status.Error(codes.InvalidArgument, "missing x-device-id")
    }
    deviceID := ids[0]
    // optional secret check
    if s.agentSecret != "" {
        ss := md.Get("x-agent-secret")
        if len(ss) == 0 || ss[0] != s.agentSecret {
            log.Printf("tunnel: device %s auth failed", deviceID)
            return status.Error(codes.Unauthenticated, "invalid agent secret")
        }
    }
    // must be registered
    if _, ok := s.reg.Get(deviceID); !ok {
        log.Printf("tunnel: device %s not registered", deviceID)
        return status.Error(codes.Unauthenticated, "device not registered")
    }
    log.Printf("tunnel: connected device_id=%s", deviceID)

    link := registry.NewTunnelLink(s.bufSize, func(f *cloudpb.TunnelFrame) error { return stream.Send(f) })
    s.reg.SetTunnel(deviceID, link)
    defer func() {
        link.Close()
        s.reg.ClearTunnel(deviceID)
        log.Printf("tunnel: disconnected device_id=%s", deviceID)
    }()

    for {
        frame, err := stream.Recv()
        if err != nil {
            if err == io.EOF {
                return nil
            }
            log.Printf("tunnel: recv err: %v", err)
            return err
        }
        // basic payload size guard (DATA/OPEN may carry payload)
        if pl := len(frame.GetPayload()); s.maxFrameBytes > 0 && pl > s.maxFrameBytes {
            log.Printf("tunnel: drop oversize frame device_id=%s corr_id=%s size=%d", deviceID, frame.GetCorrId(), pl)
            // inform waiter as ERROR
            link.Deliver(&cloudpb.TunnelFrame{CorrId: frame.GetCorrId(), Type: cloudpb.FrameType_ERROR, Message: "payload too large"})
            continue
        }
        // dispatch inbound frames by corr_id
        link.Deliver(frame)
    }
}
