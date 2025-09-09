package server

import (
	"context"

	controllerpb "pc-remote-ctrl/backend/proto"
	"pc-remote-ctrl/backend/internal/executor"
	"pc-remote-ctrl/backend/internal/storage"
)

// Server implements the gRPC controller service
type Server struct {
	controllerpb.UnimplementedControllerServiceServer
	storage  *storage.Storage
	executor *executor.Executor
}

// New creates a new gRPC server
func New(storage *storage.Storage, executor *executor.Executor) *Server {
	return &Server{
		storage:  storage,
		executor: executor,
	}
}

// ExecuteCommandSet executes a command set
func (s *Server) ExecuteCommandSet(ctx context.Context, req *controllerpb.ExecuteCommandSetRequest) (*controllerpb.ExecuteCommandSetResponse, error) {
	cmdSet := s.storage.Get(req.CommandSetId)
	if cmdSet == nil {
		return &controllerpb.ExecuteCommandSetResponse{
			Success: false,
			Error:   "command set not found",
		}, nil
	}

	return s.executor.ExecuteCommandSet(ctx, cmdSet)
}

// StoreCommandSet stores a command set
func (s *Server) StoreCommandSet(ctx context.Context, req *controllerpb.StoreCommandSetRequest) (*controllerpb.StoreCommandSetResponse, error) {
	cmdSet := &executor.CommandSet{
		Name:    req.CommandSetName,
		Scripts: req.CommandScripts,
		Desc:    req.Description,
	}

	if err := s.storage.Store(req.CommandSetId, cmdSet); err != nil {
		return &controllerpb.StoreCommandSetResponse{
			Success: false,
			Message: "failed to save command set: " + err.Error(),
		}, nil
	}

	return &controllerpb.StoreCommandSetResponse{
		Success: true,
		Message: "command set saved successfully",
	}, nil
}

// GetAllCommandSets returns all command sets
func (s *Server) GetAllCommandSets(ctx context.Context, req *controllerpb.GetAllCommandSetsRequest) (*controllerpb.GetAllCommandSetsResponse, error) {
	commandSets := make([]*controllerpb.CommandSetInfo, 0)
	
	for id, cmdSet := range s.storage.GetAll() {
		commandSets = append(commandSets, &controllerpb.CommandSetInfo{
			CommandSetId:     id,
			CommandSetName:   cmdSet.Name,
			CommandScripts:   cmdSet.Scripts,
			Description:      cmdSet.Desc,
		})
	}

	return &controllerpb.GetAllCommandSetsResponse{
		CommandSets: commandSets,
	}, nil
}