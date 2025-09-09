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
	commandSets map[string]*CommandSet
	mu          sync.RWMutex
}

// CommandSet represents a stored command set with metadata
type CommandSet struct {
	Name    string   `json:"name"`
	Scripts []string `json:"scripts"`
	Desc    string   `json:"desc"`
}

// safeError safely converts error to string, avoiding panic
func safeError(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func (s *server) ExecuteCommandSet(ctx context.Context, req *controllerpb.ExecuteCommandSetRequest) (*controllerpb.ExecuteCommandSetResponse, error) {
	s.mu.RLock()
	cmdSet := s.commandSets[req.CommandSetId]
	s.mu.RUnlock()

	if cmdSet == nil {
		return &controllerpb.ExecuteCommandSetResponse{
			Success: false,
			Error:   "command set not found",
		}, nil
	}

	var stepResults []*controllerpb.StepResult
	allSuccess := true

	// 顺序执行命令集中的每个脚本
	for i, script := range cmdSet.Scripts {
		// 为每个步骤创建独立的上下文，支持超时控制
		stepCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		
		// Cross-platform command execution
		var execCmd *exec.Cmd
		if runtime.GOOS == "windows" {
			execCmd = exec.CommandContext(stepCtx, "cmd", "/C", script)
		} else {
			execCmd = exec.CommandContext(stepCtx, "sh", "-c", script)
		}

		output, err := execCmd.CombinedOutput()
		exitCode := int32(0)
		success := true
		
		if execCmd.ProcessState != nil {
			exitCode = int32(execCmd.ProcessState.ExitCode())
			success = exitCode == 0
		}
		
		if err != nil && success {
			// 如果有错误但退出码是0，仍然认为是失败
			success = false
		}

		stepResult := &controllerpb.StepResult{
			StepIndex:  int32(i),
			StepScript: script,
			Output:     string(output),
			Error:      safeError(err),
			ExitCode:   exitCode,
			Success:    success,
		}
		
		stepResults = append(stepResults, stepResult)
		cancel()

		// 如果某一步失败，停止执行后续步骤
		if !success {
			allSuccess = false
			break
		}
	}

	var overallError string
	if !allSuccess {
		overallError = "one or more steps failed"
	}

	return &controllerpb.ExecuteCommandSetResponse{
		StepResults: stepResults,
		Success:     allSuccess,
		Error:       overallError,
	}, nil
}

func (s *server) StoreCommandSet(ctx context.Context, req *controllerpb.StoreCommandSetRequest) (*controllerpb.StoreCommandSetResponse, error) {
	s.mu.Lock()
	s.commandSets[req.CommandSetId] = &CommandSet{
		Name:    req.CommandSetName,
		Scripts: req.CommandScripts,
		Desc:    req.Description,
	}
	s.mu.Unlock()

	if err := s.saveCommandSets(); err != nil {
		return &controllerpb.StoreCommandSetResponse{
			Success: false,
			Message: "failed to save command set: " + safeError(err),
		}, nil
	}

	return &controllerpb.StoreCommandSetResponse{
		Success: true,
		Message: "command set saved successfully",
	}, nil
}

func (s *server) GetAllCommandSets(ctx context.Context, req *controllerpb.GetAllCommandSetsRequest) (*controllerpb.GetAllCommandSetsResponse, error) {
	s.mu.RLock()
	commandSets := make([]*controllerpb.CommandSetInfo, 0, len(s.commandSets))
	for id, cmdSet := range s.commandSets {
		commandSets = append(commandSets, &controllerpb.CommandSetInfo{
			CommandSetId:     id,
			CommandSetName:   cmdSet.Name,
			CommandScripts:   cmdSet.Scripts,
			Description:      cmdSet.Desc,
		})
	}
	s.mu.RUnlock()

	return &controllerpb.GetAllCommandSetsResponse{
		CommandSets: commandSets,
	}, nil
}

func (s *server) saveCommandSets() error {
	s.mu.RLock()
	data, err := json.Marshal(s.commandSets)
	s.mu.RUnlock()
	if err != nil {
		return fmt.Errorf("marshal command sets: %w", err)
	}

	return os.WriteFile("command_sets.json", data, 0644)
}

func (s *server) loadCommandSets() error {
	data, err := os.ReadFile("command_sets.json")
	if err != nil {
		if os.IsNotExist(err) {
			log.Printf("command_sets.json not found, starting with empty command sets")
			return nil
		}
		return fmt.Errorf("read command sets file: %w", err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	
	if err := json.Unmarshal(data, &s.commandSets); err != nil {
		return fmt.Errorf("unmarshal command sets: %w", err)
	}

	log.Printf("loaded %d command sets from file", len(s.commandSets))
	return nil
}

func main() {
	// Initialize server
	srv := &server{
		commandSets: make(map[string]*CommandSet),
	}
	if err := srv.loadCommandSets(); err != nil {
		log.Fatalf("failed to load command sets: %v", err)
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
