package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os"
	"os/exec"
	"sync"
)

// 模拟gRPC消息结构
type ExecuteCommandRequest struct {
	CommandID string `json:"command_id"`
}

type ExecuteCommandResponse struct {
	Success  bool   `json:"success"`
	Output   string `json:"output"`
	Error    string `json:"error"`
	ExitCode int32  `json:"exit_code"`
}

type StoreCommandRequest struct {
	CommandID     string `json:"command_id"`
	CommandName   string `json:"command_name"`
	CommandScript string `json:"command_script"`
	Description   string `json:"description"`
}

type StoreCommandResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type CommandInfo struct {
	CommandID     string `json:"command_id"`
	CommandName   string `json:"command_name"`
	CommandScript string `json:"command_script"`
	Description   string `json:"description"`
}

type GetAllCommandsResponse struct {
	Commands []*CommandInfo `json:"commands"`
}

// 服务器实现
type ControllerServer struct {
	commands map[string]*CommandInfo
	mu       sync.RWMutex
}

func (s *ControllerServer) ExecuteCommand(req *ExecuteCommandRequest) *ExecuteCommandResponse {
	s.mu.RLock()
	cmd, exists := s.commands[req.CommandID]
	s.mu.RUnlock()
	
	if !exists {
		return &ExecuteCommandResponse{Success: false, Error: "命令不存在", ExitCode: -1}
	}
	
	output, err := exec.Command("sh", "-c", cmd.CommandScript).CombinedOutput()
	if err != nil {
		return &ExecuteCommandResponse{Success: false, Output: string(output), Error: err.Error(), ExitCode: 1}
	}
	return &ExecuteCommandResponse{Success: true, Output: string(output), ExitCode: 0}
}

func (s *ControllerServer) StoreCommand(req *StoreCommandRequest) *StoreCommandResponse {
	s.mu.Lock()
	s.commands[req.CommandID] = &CommandInfo{
		CommandID: req.CommandID, CommandName: req.CommandName, 
		CommandScript: req.CommandScript, Description: req.Description}
	s.mu.Unlock()
	s.saveCommands()
	return &StoreCommandResponse{Success: true, Message: "命令保存成功"}
}

func (s *ControllerServer) GetAllCommands() *GetAllCommandsResponse {
	s.mu.RLock()
	commands := make([]*CommandInfo, 0, len(s.commands))
	for _, cmd := range s.commands { commands = append(commands, cmd) }
	s.mu.RUnlock()
	return &GetAllCommandsResponse{Commands: commands}
}

func (s *ControllerServer) saveCommands() {
	data, _ := json.Marshal(s.commands)
	os.WriteFile("commands.json", data, 0644)
}

func (s *ControllerServer) loadCommands() {
	data, err := os.ReadFile("commands.json")
	if err != nil { return }
	json.Unmarshal(data, &s.commands)
}

// 简化的"gRPC"协议处理
func handleConnection(conn net.Conn, server *ControllerServer) {
	defer conn.Close()
	buf := make([]byte, 1024)
	n, err := conn.Read(buf)
	if err != nil { return }
	
	var msg map[string]interface{}
	json.Unmarshal(buf[:n], &msg)
	
	method := msg["method"].(string)
	var response interface{}
	
	switch method {
	case "ExecuteCommand":
		var req ExecuteCommandRequest
		json.Unmarshal([]byte(msg["data"].(string)), &req)
		response = server.ExecuteCommand(&req)
	case "StoreCommand":
		var req StoreCommandRequest
		json.Unmarshal([]byte(msg["data"].(string)), &req)
		response = server.StoreCommand(&req)
	case "GetAllCommands":
		response = server.GetAllCommands()
	}
	
	respData, _ := json.Marshal(response)
	conn.Write(respData)
}

func main() {
	server := &ControllerServer{commands: make(map[string]*CommandInfo)}
	server.loadCommands()
	
	listener, err := net.Listen("tcp", ":7071")
	if err != nil { log.Fatalf("监听失败: %v", err) }
	
	fmt.Println("gRPC风格服务器启动在端口7071...")
	fmt.Println("支持的方法: ExecuteCommand, StoreCommand, GetAllCommands")
	
	for {
		conn, err := listener.Accept()
		if err != nil { continue }
		go handleConnection(conn, server)
	}
}