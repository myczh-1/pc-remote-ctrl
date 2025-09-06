package main

import (
	"context"
	"encoding/json"
	"log"
	"net"
	"os"
	"os/exec"
	"sync"

	controllerpb "basic-grpc-controller/proto/controller"

	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

type server struct {
	controllerpb.UnimplementedControllerServiceServer
	commands map[string]*controllerpb.CommandInfo
	mu       sync.RWMutex
}

func (s *server) ExecuteCommand(ctx context.Context, req *controllerpb.ExecuteCommandRequest) (*controllerpb.ExecuteCommandResponse, error) {
	if req.CommandId == "" {
		return &controllerpb.ExecuteCommandResponse{
			Success:  false,
			Error:    "命令ID不能为空",
			ExitCode: -1,
		}, nil
	}

	s.mu.RLock()
	cmd, exists := s.commands[req.CommandId]
	s.mu.RUnlock()

	if !exists {
		return &controllerpb.ExecuteCommandResponse{
			Success:  false,
			Error:    "命令不存在",
			ExitCode: -1,
		}, nil
	}

	execCmd := exec.CommandContext(ctx, "sh", "-c", cmd.CommandScript)
	output, err := execCmd.CombinedOutput()

	if err != nil {
		return &controllerpb.ExecuteCommandResponse{
			Success:  false,
			Output:   string(output),
			Error:    err.Error(),
			ExitCode: int32(execCmd.ProcessState.ExitCode()),
		}, nil
	}

	return &controllerpb.ExecuteCommandResponse{
		Success:  true,
		Output:   string(output),
		ExitCode: 0,
	}, nil
}

func (s *server) StoreCommand(ctx context.Context, req *controllerpb.StoreCommandRequest) (*controllerpb.StoreCommandResponse, error) {
	if req.CommandId == "" {
		return &controllerpb.StoreCommandResponse{
			Success: false,
			Message: "命令ID不能为空",
		}, nil
	}

	if req.CommandScript == "" {
		return &controllerpb.StoreCommandResponse{
			Success: false,
			Message: "命令脚本不能为空",
		}, nil
	}

	s.mu.Lock()
	s.commands[req.CommandId] = &controllerpb.CommandInfo{
		CommandId:     req.CommandId,
		CommandName:   req.CommandName,
		CommandScript: req.CommandScript,
		Description:   req.Description,
	}
	s.mu.Unlock()

	if err := s.saveCommands(); err != nil {
		return &controllerpb.StoreCommandResponse{
			Success: false,
			Message: "保存命令失败: " + err.Error(),
		}, nil
	}

	return &controllerpb.StoreCommandResponse{
		Success: true,
		Message: "命令保存成功",
	}, nil
}

func (s *server) GetAllCommands(ctx context.Context, req *controllerpb.GetAllCommandsRequest) (*controllerpb.GetAllCommandsResponse, error) {
	s.mu.RLock()
	commands := make([]*controllerpb.CommandInfo, 0, len(s.commands))
	for _, cmd := range s.commands {
		commands = append(commands, cmd)
	}
	s.mu.RUnlock()

	return &controllerpb.GetAllCommandsResponse{
		Commands: commands,
	}, nil
}

func (s *server) saveCommands() error {
	s.mu.RLock()
	data, err := json.Marshal(s.commands)
	s.mu.RUnlock()

	if err != nil {
		return err
	}

	return os.WriteFile("commands.json", data, 0644)
}

func (s *server) loadCommands() error {
	data, err := os.ReadFile("commands.json")
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	s.mu.Lock()
	err = json.Unmarshal(data, &s.commands)
	s.mu.Unlock()

	return err
}

func main() {
	lis, err := net.Listen("tcp", ":7071")
	if err != nil {
		log.Fatalf("监听失败: %v", err)
	}

	s := grpc.NewServer()

	srv := &server{
		commands: make(map[string]*controllerpb.CommandInfo),
	}

	if err := srv.loadCommands(); err != nil {
		log.Printf("加载命令失败: %v", err)
	}

	controllerpb.RegisterControllerServiceServer(s, srv)
	reflection.Register(s)

	log.Printf("真正的gRPC服务器启动在端口7071...")
	if err := s.Serve(lis); err != nil {
		log.Fatalf("服务启动失败: %v", err)
	}
}
