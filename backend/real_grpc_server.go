package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"sync"
	"syscall"
	"time"

	controllerpb "pc-remote-ctrl/backend/proto"

	"github.com/improbable-eng/grpc-web/go/grpcweb"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

type server struct {
	controllerpb.UnimplementedControllerServiceServer
	commands map[string]*Command
	mu       sync.RWMutex
}

// Command represents a stored command with metadata
type Command struct {
	Name   string `json:"name"`
	Script string `json:"script"`
	Desc   string `json:"desc"`
}

// safeError safely converts error to string, avoiding panic
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
			Error:    "command not found",
			ExitCode: -1,
		}, nil
	}

	// Cross-platform command execution
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
			Message: "failed to save command: " + safeError(err),
		}, nil
	}

	return &controllerpb.StoreCommandResponse{
		Success: true,
		Message: "command saved successfully",
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
	data, err := json.Marshal(s.commands)
	s.mu.RUnlock()
	if err != nil {
		return fmt.Errorf("marshal commands: %w", err)
	}

	return os.WriteFile("commands.json", data, 0644)
}

func (s *server) loadCommands() error {
	data, err := os.ReadFile("commands.json")
	if err != nil {
		if os.IsNotExist(err) {
			log.Printf("commands.json not found, starting with empty commands")
			return nil
		}
		return fmt.Errorf("read commands file: %w", err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	
	if err := json.Unmarshal(data, &s.commands); err != nil {
		return fmt.Errorf("unmarshal commands: %w", err)
	}

	log.Printf("loaded %d commands from file", len(s.commands))
	return nil
}

func main() {
	// Initialize server
	srv := &server{
		commands: make(map[string]*Command),
	}
	if err := srv.loadCommands(); err != nil {
		log.Fatalf("failed to load commands: %v", err)
	}

	// Setup gRPC server
	lis, err := net.Listen("tcp", ":7071")
	if err != nil {
		log.Fatalf("failed to listen on port 7071: %v", err)
	}

	grpcServer := grpc.NewServer()
	controllerpb.RegisterControllerServiceServer(grpcServer, srv)
	reflection.Register(grpcServer)

	// Setup HTTP server with grpc-web support
	wrapped := grpcweb.WrapServer(
		grpcServer,
		grpcweb.WithOriginFunc(func(origin string) bool {
			// TODO: Use whitelist in production
			return true
		}),
		grpcweb.WithCorsForRegisteredEndpointsOnly(false),
	)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if wrapped.IsGrpcWebRequest(r) || wrapped.IsAcceptableGrpcCorsRequest(r) || wrapped.IsGrpcWebSocketRequest(r) {
			wrapped.ServeHTTP(w, r)
			return
		}
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

	// Setup graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Channel to listen for interrupt signal
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)

	// Start gRPC server in goroutine
	go func() {
		log.Printf("gRPC server listening on port 7071")
		if err := grpcServer.Serve(lis); err != nil {
			log.Printf("gRPC server error: %v", err)
			cancel()
		}
	}()

	// Start HTTP server in goroutine
	go func() {
		log.Printf("grpc-web gateway listening on port 7072")
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("HTTP server error: %v", err)
			cancel()
		}
	}()

	// Wait for shutdown signal or context cancellation
	select {
	case <-c:
		log.Println("shutting down servers...")
	case <-ctx.Done():
		log.Println("context cancelled, shutting down...")
	}

	// Graceful shutdown
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	// Shutdown HTTP server
	if err := httpSrv.Shutdown(shutdownCtx); err != nil {
		log.Printf("HTTP server shutdown error: %v", err)
	}

	// Graceful stop gRPC server
	grpcServer.GracefulStop()
	
	log.Println("servers shutdown complete")
}
