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
	cmdSet := &controllerpb.CommandSetInfo{
		CommandSetId:   req.CommandSetId,
		CommandSetName: req.CommandSetName,
		CommandScripts: req.CommandScripts,
		Description:    req.Description,
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
	
	for _, cmdSet := range s.storage.GetAll() {
		commandSets = append(commandSets, cmdSet)
	}

	return &controllerpb.GetAllCommandSetsResponse{
		CommandSets: commandSets,
	}, nil
}

// UpdateCommandSet updates an existing command set
func (s *Server) UpdateCommandSet(ctx context.Context, req *controllerpb.UpdateCommandSetRequest) (*controllerpb.UpdateCommandSetResponse, error) {
	// 检查命令集是否存在
	existing := s.storage.Get(req.CommandSetId)
	if existing == nil {
		return &controllerpb.UpdateCommandSetResponse{
			Success: false,
			Message: "command set not found",
		}, nil
	}

	// 更新命令集
	updatedCmdSet := &controllerpb.CommandSetInfo{
		CommandSetId:   req.CommandSetId,
		CommandSetName: req.CommandSetName,
		CommandScripts: req.CommandScripts,
		Description:    req.Description,
	}

	if err := s.storage.Store(req.CommandSetId, updatedCmdSet); err != nil {
		return &controllerpb.UpdateCommandSetResponse{
			Success: false,
			Message: "failed to update command set: " + err.Error(),
		}, nil
	}

	return &controllerpb.UpdateCommandSetResponse{
		Success: true,
		Message: "command set updated successfully",
	}, nil
}

// DeleteCommandSet deletes a command set
func (s *Server) DeleteCommandSet(ctx context.Context, req *controllerpb.DeleteCommandSetRequest) (*controllerpb.DeleteCommandSetResponse, error) {
	// 检查命令集是否存在
	existing := s.storage.Get(req.CommandSetId)
	if existing == nil {
		return &controllerpb.DeleteCommandSetResponse{
			Success: false,
			Message: "command set not found",
		}, nil
	}

	// 删除命令集
	if err := s.storage.Delete(req.CommandSetId); err != nil {
		return &controllerpb.DeleteCommandSetResponse{
			Success: false,
			Message: "failed to delete command set: " + err.Error(),
		}, nil
	}

	return &controllerpb.DeleteCommandSetResponse{
		Success: true,
		Message: "command set deleted successfully",
	}, nil
}