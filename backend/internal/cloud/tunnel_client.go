package cloud

import (
    "context"
    "log"
    "time"

    homepb "pc-remote-ctrl/backend/proto/home"
    cloudpb "pc-remote-ctrl/cloud-middleware/proto/cloud"

    "google.golang.org/grpc"
    "google.golang.org/grpc/metadata"
    "google.golang.org/protobuf/proto"
)

// Default tunables (runtime-configurable via caller)
const (
    streamRecvIdleTimeout = 0 // no idle timeout; rely on connection liveness
)

// StartTunnelClient connects to cloud TunnelService and bridges requests to local HomeService.
// It blocks in a goroutine with automatic reconnects until ctx is cancelled.
func StartTunnelClient(ctx context.Context, cloudAddr, deviceID, agentSecret, localPort string, unaryTimeout time.Duration) {
    if cloudAddr == "" || deviceID == "" {
        return
    }
    go func() {
        backoff := time.Second
        for {
            if ctx.Err() != nil { return }
            conn, err := grpc.DialContext(ctx, cloudAddr, grpc.WithInsecure())
            if err != nil {
                log.Printf("[tunnel] dial cloud failed: %v", err)
                time.Sleep(backoff)
                if backoff < 15*time.Second { backoff *= 2 }
                continue
            }
            tc := cloudpb.NewTunnelServiceClient(conn)
            // attach device identity and optional secret
            pairs := []string{"x-device-id", deviceID}
            if agentSecret != "" { pairs = append(pairs, "x-agent-secret", agentSecret) }
            md := metadata.Pairs(pairs...)
            sctx := metadata.NewOutgoingContext(ctx, md)
            stream, err := tc.Open(sctx)
            if err != nil {
                log.Printf("[tunnel] open stream failed: %v", err)
                _ = conn.Close()
                time.Sleep(backoff)
                if backoff < 15*time.Second { backoff *= 2 }
                continue
            }
            log.Printf("[tunnel] opened to %s as %s", cloudAddr, deviceID)

            // local home client (h2c grpc)
            homeConn, err := grpc.DialContext(ctx, "127.0.0.1:"+localPort, grpc.WithInsecure())
            if err != nil {
                log.Printf("[tunnel] dial local home failed: %v", err)
                _ = stream.CloseSend(); _ = conn.Close()
                time.Sleep(backoff)
                if backoff < 15*time.Second { backoff *= 2 }
                continue
            }
            home := homepb.NewHomeServiceClient(homeConn)

            // recv loop
            if err := handleFrames(ctx, stream, home, unaryTimeout); err != nil {
                log.Printf("[tunnel] stream closed: %v", err)
            }
            _ = homeConn.Close()
            _ = conn.Close()
            time.Sleep(2 * time.Second)
        }
    }()
}

func handleFrames(ctx context.Context, stream cloudpb.TunnelService_OpenClient, home homepb.HomeServiceClient, unaryTimeout time.Duration) error {
    for {
        f, err := stream.Recv()
        if err != nil {
            return err
        }
        switch f.GetType() {
        case cloudpb.FrameType_OPEN:
            go handleOpen(ctx, stream, home, f, unaryTimeout)
        case cloudpb.FrameType_CLOSE:
            // ignore stray CLOSE from server
        case cloudpb.FrameType_DATA:
            // data frames are not expected from server without an OPEN context here
        case cloudpb.FrameType_ERROR:
            // log and continue
            log.Printf("[tunnel] server ERROR: %s corr_id=%s", f.GetMessage(), f.GetCorrId())
        }
    }
}

func handleOpen(ctx context.Context, stream cloudpb.TunnelService_OpenClient, home homepb.HomeServiceClient, f *cloudpb.TunnelFrame, unaryTimeout time.Duration) {
    method := f.GetMethod()
    corr := f.GetCorrId()
    sendErr := func(msg string) { _ = stream.Send(&cloudpb.TunnelFrame{CorrId: corr, Type: cloudpb.FrameType_ERROR, Message: msg}) }
    sendClose := func() { _ = stream.Send(&cloudpb.TunnelFrame{CorrId: corr, Type: cloudpb.FrameType_CLOSE}) }

    log.Printf("[tunnel] OPEN method=%s corr_id=%s", method, corr)
    switch method {
    case "/remote_control.home.HomeService/ListDevices":
        var in homepb.ListDevicesRequest
        if err := proto.Unmarshal(f.GetPayload(), &in); err != nil { sendErr(err.Error()); return }
        cctx, cancel := context.WithTimeout(ctx, unaryTimeout); defer cancel()
        out, err := home.ListDevices(cctx, &in)
        if err != nil { sendErr(err.Error()); return }
        b, _ := proto.Marshal(out)
        if err := stream.Send(&cloudpb.TunnelFrame{CorrId: corr, Type: cloudpb.FrameType_DATA, Payload: b}); err != nil { return }
        sendClose()
    case "/remote_control.home.HomeService/UpsertDevice":
        var in homepb.UpsertDeviceRequest
        if err := proto.Unmarshal(f.GetPayload(), &in); err != nil { sendErr(err.Error()); return }
        cctx, cancel := context.WithTimeout(ctx, unaryTimeout); defer cancel()
        out, err := home.UpsertDevice(cctx, &in)
        if err != nil { sendErr(err.Error()); return }
        b, _ := proto.Marshal(out)
        if err := stream.Send(&cloudpb.TunnelFrame{CorrId: corr, Type: cloudpb.FrameType_DATA, Payload: b}); err != nil { return }
        sendClose()
    case "/remote_control.home.HomeService/DeleteDevice":
        var in homepb.DeleteDeviceRequest
        if err := proto.Unmarshal(f.GetPayload(), &in); err != nil { sendErr(err.Error()); return }
        cctx, cancel := context.WithTimeout(ctx, unaryTimeout); defer cancel()
        out, err := home.DeleteDevice(cctx, &in)
        if err != nil { sendErr(err.Error()); return }
        b, _ := proto.Marshal(out)
        if err := stream.Send(&cloudpb.TunnelFrame{CorrId: corr, Type: cloudpb.FrameType_DATA, Payload: b}); err != nil { return }
        sendClose()
    case "/remote_control.home.HomeService/InvokeAction":
        var in homepb.InvokeActionRequest
        if err := proto.Unmarshal(f.GetPayload(), &in); err != nil { sendErr(err.Error()); return }
        cctx, cancel := context.WithTimeout(ctx, unaryTimeout); defer cancel()
        out, err := home.InvokeAction(cctx, &in)
        if err != nil { sendErr(err.Error()); return }
        b, _ := proto.Marshal(out)
        if err := stream.Send(&cloudpb.TunnelFrame{CorrId: corr, Type: cloudpb.FrameType_DATA, Payload: b}); err != nil { return }
        sendClose()
    case "/remote_control.home.HomeService/WatchDevices":
        var in homepb.WatchDevicesRequest
        if err := proto.Unmarshal(f.GetPayload(), &in); err != nil { sendErr(err.Error()); return }
        s, err := home.WatchDevices(ctx, &in)
        if err != nil { sendErr(err.Error()); return }
        for {
            ev, err := s.Recv()
            if err != nil { sendClose(); return }
            b, _ := proto.Marshal(ev)
            if err := stream.Send(&cloudpb.TunnelFrame{CorrId: corr, Type: cloudpb.FrameType_DATA, Payload: b}); err != nil { sendErr("stream send failed"); return }
        }
    default:
        sendErr("unknown method")
    }
}
