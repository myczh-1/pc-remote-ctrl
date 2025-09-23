package server

import (
    "io"
    "log"

    cloudpb "pc-remote-ctrl/cloud-middleware/proto/cloud"
)

// TunnelServer is a placeholder implementation. Interface is defined and server is registered,
// but data plane will be implemented in a later step.
type TunnelServer struct {
    cloudpb.UnimplementedTunnelServiceServer
}

func NewTunnelServer() *TunnelServer { return &TunnelServer{} }

func (s *TunnelServer) Open(stream cloudpb.TunnelService_OpenServer) error {
    for {
        frame, err := stream.Recv()
        if err != nil {
            if err == io.EOF {
                return nil
            }
            log.Printf("tunnel: recv err: %v", err)
            return err
        }
        log.Printf("tunnel: recv frame type=%v corr=%s method=%s bytes=%d", frame.GetType(), frame.GetCorrId(), frame.GetMethod(), len(frame.GetPayload()))
        // Not implemented yet. Echo ERROR to make behavior explicit.
        _ = stream.Send(&cloudpb.TunnelFrame{CorrId: frame.GetCorrId(), Type: cloudpb.FrameType_ERROR, Message: "tunnel not implemented"})
    }
}
