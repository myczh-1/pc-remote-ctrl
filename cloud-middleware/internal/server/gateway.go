package server

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"time"

	"pc-remote-ctrl/cloud-middleware/internal/registry"
	cloudpb "pc-remote-ctrl/cloud-middleware/proto/cloud"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type GatewayServer struct {
	cloudpb.UnimplementedGatewayServiceServer
	reg           *registry.MemoryRegistry
	maxFrameBytes int
}

func NewGatewayServer(reg *registry.MemoryRegistry, maxFrameBytes int) *GatewayServer {
	return &GatewayServer{reg: reg, maxFrameBytes: maxFrameBytes}
}

func corrID() string {
	return fmt.Sprintf("%d-%d", time.Now().UnixNano(), rand.Int63())
}

func (s *GatewayServer) Unary(ctx context.Context, req *cloudpb.ProxyUnaryRequest) (*cloudpb.ProxyUnaryResponse, error) {
	deviceID := req.GetDeviceId()
	method := req.GetMethod()
	if method == "" {
		return nil, status.Error(codes.InvalidArgument, "missing method")
	}

	link, ok := s.reg.GetTunnel(deviceID)
	if !ok {
		log.Printf("gateway: no tunnel for device_id=%s; reg_ids=%v", deviceID, s.reg.IDs())
		return nil, status.Error(codes.NotFound, "no tunnel for device")
	}
	cid := corrID()
	ch, cancel := link.Register(cid)
	defer cancel()

	payload := req.GetPayload()
	if s.maxFrameBytes > 0 && len(payload) > s.maxFrameBytes {
		return nil, status.Error(codes.InvalidArgument, "payload too large")
	}

	log.Printf("gateway: OPEN device_id=%s corr_id=%s method=%s bytes=%d", deviceID, cid, method, len(payload))
	if err := link.Send(&cloudpb.TunnelFrame{CorrId: cid, Type: cloudpb.FrameType_OPEN, Method: method, Payload: payload}); err != nil {
		return nil, err
	}

	var out []byte
	gotData := false
	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case f, ok := <-ch:
			if !ok {
				if gotData {
					return &cloudpb.ProxyUnaryResponse{Payload: out}, nil
				}
				return nil, status.Error(codes.Unavailable, "tunnel closed")
			}
			switch f.GetType() {
			case cloudpb.FrameType_ERROR:
				msg := f.GetMessage()
				if msg == "" {
					msg = "upstream error"
				}
				log.Printf("gateway: ERROR device_id=%s corr_id=%s method=%s msg=%s", deviceID, cid, method, msg)
				return nil, status.Error(codes.Unavailable, msg)
			case cloudpb.FrameType_DATA:
				out = append(out[:0], f.GetPayload()...)
				gotData = true
			case cloudpb.FrameType_CLOSE:
				log.Printf("gateway: CLOSE device_id=%s corr_id=%s method=%s got_data=%v", deviceID, cid, method, gotData)
				if !gotData {
					return nil, status.Error(codes.Internal, "no data before close")
				}
				return &cloudpb.ProxyUnaryResponse{Payload: out}, nil
			}
		}
	}
}

func (s *GatewayServer) Stream(req *cloudpb.ProxyStreamRequest, stream cloudpb.GatewayService_StreamServer) error {
	ctx := stream.Context()
	deviceID := req.GetDeviceId()
	method := req.GetMethod()
	if method == "" {
		return status.Error(codes.InvalidArgument, "missing method")
	}

	link, ok := s.reg.GetTunnel(deviceID)
	if !ok {
		log.Printf("gateway: no tunnel(stream) for device_id=%s; reg_ids=%v", deviceID, s.reg.IDs())
		return status.Error(codes.NotFound, "no tunnel for device")
	}
	cid := corrID()
	ch, cancel := link.Register(cid)
	defer cancel()

	payload := req.GetPayload()
	if s.maxFrameBytes > 0 && len(payload) > s.maxFrameBytes {
		return status.Error(codes.InvalidArgument, "payload too large")
	}
	log.Printf("gateway: OPEN device_id=%s corr_id=%s method=%s bytes=%d", deviceID, cid, method, len(payload))
	if err := link.Send(&cloudpb.TunnelFrame{CorrId: cid, Type: cloudpb.FrameType_OPEN, Method: method, Payload: payload}); err != nil {
		return err
	}

	for {
		select {
		case <-ctx.Done():
			_ = link.Send(&cloudpb.TunnelFrame{CorrId: cid, Type: cloudpb.FrameType_CLOSE})
			return ctx.Err()
		case f, ok := <-ch:
			if !ok {
				return nil
			}
			switch f.GetType() {
			case cloudpb.FrameType_ERROR:
				msg := f.GetMessage()
				if msg == "" {
					msg = "upstream error"
				}
				return status.Error(codes.Unavailable, msg)
			case cloudpb.FrameType_DATA:
				if err := stream.Send(&cloudpb.ProxyStreamResponse{Payload: f.GetPayload()}); err != nil {
					log.Printf("stream: send error: %v", err)
					return err
				}
			case cloudpb.FrameType_CLOSE:
				return nil
			}
		}
	}
}
