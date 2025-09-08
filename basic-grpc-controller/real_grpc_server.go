package main

import (
	"context"
	"encoding/json"
	"log"
	"net"
	"net/http" // 👈 新增
	"os"
	"os/exec"
	"runtime"
	"sync"

	controllerpb "basic-grpc-controller/proto"

	"github.com/improbable-eng/grpc-web/go/grpcweb" // 👈 新增
	"golang.org/x/net/http2"                        // 👈 新增
	"golang.org/x/net/http2/h2c"                    // 👈 新增
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

	// 1) 纯 gRPC server（保持你原有逻辑）
	grpcServer := grpc.NewServer()

	srv := &server{
		commands: make(map[string]*Command),
	}
	if err := srv.loadCommands(); err != nil {
		log.Printf("加载命令失败: %v", err)
	}

	controllerpb.RegisterControllerServiceServer(grpcServer, srv)
	reflection.Register(grpcServer)

	// 2) 启动原生 gRPC 监听（7071）
	go func() {
		log.Printf("gRPC 在端口 7071（原生 gRPC 客户端使用）...")
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatalf("gRPC 服务启动失败: %v", err)
		}
	}()

	// 3) 包一层 grpc-web，提供给浏览器（8080）
	wrapped := grpcweb.WrapServer(
		grpcServer,
		grpcweb.WithOriginFunc(func(origin string) bool {
			// 开发阶段先全开；生产可改成白名单校验
			return true
		}),
		grpcweb.WithCorsForRegisteredEndpointsOnly(false),
	)

	// 4) HTTP 服务器（h2c 同时兼容 HTTP/1.1 与明文 HTTP/2）
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 处理预检 / grpc-web / websocket
		if wrapped.IsGrpcWebRequest(r) || wrapped.IsAcceptableGrpcCorsRequest(r) || wrapped.IsGrpcWebSocketRequest(r) {
			wrapped.ServeHTTP(w, r)
			return
		}
		// 可选：健康检查
		if r.Method == http.MethodGet && r.URL.Path == "/healthz" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("ok"))
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	httpSrv := &http.Server{
		Addr:    ":7072",
		Handler: h2c.NewHandler(handler, &http2.Server{}),
	}

	log.Printf("grpc-web 网关在端口 7072（浏览器/前端使用）...")
	if err := httpSrv.ListenAndServe(); err != nil {
		log.Fatalf("grpc-web 网关启动失败: %v", err)
	}
}
