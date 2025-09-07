package main

import (
	"context"
	"encoding/json"
	"log"
	"net"
	"os"
	"os/exec"
	"runtime"
	"sync"

	controllerpb "basic-grpc-controller/proto"

	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

type server struct {
	controllerpb.UnimplementedControllerServiceServer
	commands map[string]*Command
	mu       sync.RWMutex
}

// 简化的命令结构，消除冗余字段
type Command struct {
	Name   string `json:"name"`
	Script string `json:"script"`
	Desc   string `json:"desc"`
}

// 安全的错误处理，避免panic
func safeError(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func (s *server) ExecuteCommand(ctx context.Context, req *controllerpb.ExecuteCommandRequest) (*controllerpb.ExecuteCommandResponse, error) {
	s.mu.RLock()
	cmd := s.commands[req.CommandId]
	s.mu.RUnlock()

	if cmd == nil {
		return &controllerpb.ExecuteCommandResponse{
			Success:  false,
			Error:    "命令不存在",
			ExitCode: -1,
		}, nil
	}

	// 跨平台命令执行
	var execCmd *exec.Cmd
	if runtime.GOOS == "windows" {
		execCmd = exec.CommandContext(ctx, "cmd", "/C", cmd.Script)
	} else {
		execCmd = exec.CommandContext(ctx, "sh", "-c", cmd.Script)
	}

	output, err := execCmd.CombinedOutput()
	exitCode := int32(0)
	if execCmd.ProcessState != nil {
		exitCode = int32(execCmd.ProcessState.ExitCode())
	}

	return &controllerpb.ExecuteCommandResponse{
		Success:  err == nil,
		Output:   string(output),
		Error:    safeError(err),
		ExitCode: exitCode,
	}, nil
}

func (s *server) StoreCommand(ctx context.Context, req *controllerpb.StoreCommandRequest) (*controllerpb.StoreCommandResponse, error) {
	s.mu.Lock()
	s.commands[req.CommandId] = &Command{
		Name:   req.CommandName,
		Script: req.CommandScript,
		Desc:   req.Description,
	}
	s.mu.Unlock()

	if err := s.saveCommands(); err != nil {
		return &controllerpb.StoreCommandResponse{
			Success: false,
			Message: "保存命令失败: " + safeError(err),
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
	for id, cmd := range s.commands {
		commands = append(commands, &controllerpb.CommandInfo{
			CommandId:     id,
			CommandName:   cmd.Name,
			CommandScript: cmd.Script,
			Description:   cmd.Desc,
		})
	}
	s.mu.RUnlock()

	return &controllerpb.GetAllCommandsResponse{
		Commands: commands,
	}, nil
}

func (s *server) saveCommands() error {
	s.mu.RLock()
	data, _ := json.Marshal(s.commands)
	s.mu.RUnlock()

	return os.WriteFile("commands.json", data, 0644)
}

func (s *server) loadCommands() error {
	data, err := os.ReadFile("commands.json")
	if err != nil {
		return nil // 文件不存在是正常情况
	}

	s.mu.Lock()
	json.Unmarshal(data, &s.commands)
	s.mu.Unlock()

	return nil
}

func main() {
	lis, err := net.Listen("tcp", ":7071")
	if err != nil {
		log.Fatalf("监听失败: %v", err)
	}

	s := grpc.NewServer()

	srv := &server{
		commands: make(map[string]*Command),
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
