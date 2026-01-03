package server

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"time"

	homepb "pc-remote-ctrl/backend/proto/home"
	"pc-remote-ctrl/cloud-middleware/internal/registry"
	cloudpb "pc-remote-ctrl/cloud-middleware/proto/cloud"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
)

const auditSvc = "/remote_control.home.AuditService/"

type AuditProxy struct {
	cloudpb.UnimplementedAuditServiceServer
	reg           *registry.MemoryRegistry
	maxFrameBytes int
}

func NewAuditProxy(reg *registry.MemoryRegistry, maxFrameBytes int) *AuditProxy {
	return &AuditProxy{reg: reg, maxFrameBytes: maxFrameBytes}
}

func corrIDAudit() string {
	return fmt.Sprintf("%d-%d", time.Now().UnixNano(), rand.Int63())
}

func (s *AuditProxy) unaryViaTunnel(ctx context.Context, deviceID, method string, in proto.Message, out proto.Message) error {
	link, ok := s.reg.GetTunnel(deviceID)
	if !ok {
		log.Printf("audit: no tunnel for device_id=%s; reg_ids=%v", deviceID, s.reg.IDs())
		return status.Error(codes.NotFound, "no tunnel for device")
	}
	cid := corrIDAudit()
	ch, cancel := link.Register(cid)
	defer cancel()

	payload, err := proto.Marshal(in)
	if err != nil {
		return err
	}
	if s.maxFrameBytes > 0 && len(payload) > s.maxFrameBytes {
		return status.Error(codes.InvalidArgument, "payload too large")
	}
	log.Printf("audit: OPEN device_id=%s corr_id=%s method=%s bytes=%d", deviceID, cid, method, len(payload))
	if err := link.Send(&cloudpb.TunnelFrame{CorrId: cid, Type: cloudpb.FrameType_OPEN, Method: method, Payload: payload}); err != nil {
		return err
	}
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
				msg := f.GetMessage()
				if msg == "" {
					msg = "upstream error"
				}
				log.Printf("audit: ERROR device_id=%s corr_id=%s method=%s msg=%s", deviceID, cid, method, msg)
				return status.Error(codes.Unavailable, msg)
			case cloudpb.FrameType_DATA:
				if err := proto.Unmarshal(f.GetPayload(), out); err != nil {
					return err
				}
				gotData = true
			case cloudpb.FrameType_CLOSE:
				log.Printf("audit: CLOSE device_id=%s corr_id=%s method=%s got_data=%v", deviceID, cid, method, gotData)
				if !gotData {
					return status.Error(codes.Internal, "no data before close")
				}
				return nil
			}
		}
	}
}

func (s *AuditProxy) ListLogs(ctx context.Context, req *cloudpb.ListAuditLogsRequest) (*homepb.ListLogsResponse, error) {
	var out homepb.ListLogsResponse
	if err := s.unaryViaTunnel(ctx, req.GetDeviceId(), auditSvc+"ListLogs", req.GetRequest(), &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (s *AuditProxy) CleanupLogs(ctx context.Context, req *cloudpb.CleanupAuditLogsRequest) (*homepb.CleanupLogsResponse, error) {
	var out homepb.CleanupLogsResponse
	if err := s.unaryViaTunnel(ctx, req.GetDeviceId(), auditSvc+"CleanupLogs", req.GetRequest(), &out); err != nil {
		return nil, err
	}
	return &out, nil
}
