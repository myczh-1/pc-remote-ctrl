package home

import (
	"context"
	"fmt"

	"pc-remote-ctrl/backend/internal/storage"
	homepb "pc-remote-ctrl/backend/proto/home"

	"google.golang.org/protobuf/types/known/structpb"
)

// AuditService exposes audit log querying/cleanup over gRPC.
type AuditService struct {
	homepb.UnimplementedAuditServiceServer
	logs *storage.AuditLogs
}

func NewAuditService(logs *storage.AuditLogs) *AuditService {
	return &AuditService{logs: logs}
}

func (s *AuditService) ListLogs(ctx context.Context, req *homepb.ListLogsRequest) (*homepb.ListLogsResponse, error) {
	entries, next, err := s.logs.List(storage.ListLogsOptions{
		Kind:      req.GetKind(),
		Subject:   req.GetSubject(),
		PageSize:  int(req.GetPageSize()),
		PageToken: req.GetPageToken(),
	})
	if err != nil {
		return nil, fmt.Errorf("list logs: %w", err)
	}
	out := make([]*homepb.LogEntry, 0, len(entries))
	for _, e := range entries {
		var data *structpb.Struct
		if e.Data != nil {
			data, _ = structpb.NewStruct(mapStringAny(e.Data))
		}
		out = append(out, &homepb.LogEntry{
			Id:      e.ID,
			Ts:      e.TS,
			Kind:    e.Kind,
			Subject: e.Subject,
			Actor:   e.Actor,
			Data:    data,
		})
	}
	return &homepb.ListLogsResponse{Entries: out, NextPageToken: next}, nil
}

func (s *AuditService) CleanupLogs(ctx context.Context, req *homepb.CleanupLogsRequest) (*homepb.CleanupLogsResponse, error) {
	deleted, err := s.logs.Cleanup(req.GetBeforeTs(), int(req.GetLimit()))
	if err != nil {
		return nil, fmt.Errorf("cleanup logs: %w", err)
	}
	return &homepb.CleanupLogsResponse{Deleted: int32(deleted)}, nil
}
