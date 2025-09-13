package main

import (
	"context"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	controllerpb "pc-remote-ctrl/backend/proto"
	cloudpb "pc-remote-ctrl/cloud-middleware/proto/cloud"
	"pc-remote-ctrl/backend/internal/executor"
	"pc-remote-ctrl/backend/internal/server"
	"pc-remote-ctrl/backend/internal/storage"

	"github.com/improbable-eng/grpc-web/go/grpcweb"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
	"google.golang.org/protobuf/proto"
)


type Config struct {
	LocalPort       string // 本地gRPC服务端口
	CloudAddr       string // 云端中间件地址（如果设置则启用云端模式）
	DeviceID        string // 设备ID
	AgentName       string // 设备显示名称
	Version         string // 版本
	CommandsFile    string // 命令集文件路径
	EnableLocal     bool   // 启用本地模式
	EnableCloud     bool   // 启用云端模式
}

func loadConfig() *Config {
	host, err := os.Hostname()
	if err != nil {
		host = "unknown"
	}

	cloudAddr := os.Getenv("CLOUD_ADDR")
	enableLocal := os.Getenv("ENABLE_LOCAL") != "false" // 默认启用
	enableCloud := cloudAddr != "" && os.Getenv("ENABLE_CLOUD") != "false" // 有云端地址且未明确禁用

	return &Config{
		LocalPort:    getEnv("LOCAL_PORT", "7071"),
		CloudAddr:    hostPort(cloudAddr),
		DeviceID:     getEnv("DEVICE_ID", host),
		AgentName:    getEnv("AGENT_NAME", host),
		Version:      getEnv("AGENT_VERSION", "dev"),
		CommandsFile: getEnv("COMMANDS_FILE", "backend/command_sets.json"),
		EnableLocal:  enableLocal,
		EnableCloud:  enableCloud,
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func hostPort(addr string) string {
	if addr == "" {
		return ""
	}
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return addr
	}
	if host == "" {
		host = "localhost"
	}
	return net.JoinHostPort(host, port)
}

func main() {
	cfg := loadConfig()
	log.Printf("Starting unified agent: local=%v cloud=%v device_id=%s",
		cfg.EnableLocal, cfg.EnableCloud, cfg.DeviceID)

	// Initialize components
	storage := storage.New(cfg.CommandsFile)
	if err := storage.Load(); err != nil {
		log.Printf("warn: load command sets failed: %v", err)
	}

	executor := executor.New()
	srv := server.New(storage, executor)

	// Setup gRPC server
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

	// Single handler for both gRPC and HTTP on one port
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if wrapped.IsGrpcWebRequest(r) || wrapped.IsAcceptableGrpcCorsRequest(r) || wrapped.IsGrpcWebSocketRequest(r) {
			wrapped.ServeHTTP(w, r)
			return
		}
		if r.Method == http.MethodGet && r.URL.Path == "/healthz" {
			w.WriteHeader(http.StatusOK)
			if _, err := w.Write([]byte("ok")); err != nil {
				log.Printf("failed to write health check response: %v", err)
			}
			return
		}
		// Try to handle as gRPC (for direct gRPC clients)
		if r.ProtoMajor == 2 && strings.HasPrefix(r.Header.Get("Content-Type"), "application/grpc") {
			grpcServer.ServeHTTP(w, r)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	// Single server on configured port
	httpSrv := &http.Server{
		Addr:    ":" + cfg.LocalPort,
		Handler: h2c.NewHandler(handler, &http2.Server{}),
	}

	// Setup graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Channel to listen for interrupt signal
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)

	// Start local gRPC server if enabled
	if cfg.EnableLocal {
		go func() {
			log.Printf("Local gRPC/HTTP server listening on port %s", cfg.LocalPort)
			if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Printf("Local server error: %v", err)
				cancel()
			}
		}()
	}

	// Start cloud connection if enabled
	if cfg.EnableCloud {
		go func() {
			if err := startCloudConnection(ctx, cfg, storage, executor); err != nil {
				log.Printf("Cloud connection error: %v", err)
				cancel()
			}
		}()
	}

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

// 云端连接功能
func startCloudConnection(ctx context.Context, cfg *Config, store *storage.Storage, exec *executor.Executor) error {
	log.Printf("Connecting to cloud middleware: %s", cfg.CloudAddr)

	// 创建命令路由器
	router := newCommandRouter(store, exec)

	// 连接到云端中间件
	conn, err := grpc.Dial(cfg.CloudAddr, grpc.WithInsecure(), grpc.WithBlock(), grpc.WithDefaultCallOptions(grpc.MaxCallRecvMsgSize(32<<20)))
	if err != nil {
		return err
	}
	defer conn.Close()

	client := cloudpb.NewDeviceRegistryServiceClient(conn)

	// 连接控制流
	stream, err := client.ConnectAgent(ctx)
	if err != nil {
		return err
	}

	// 发送初始连接消息
	if err := stream.Send(&cloudpb.AgentMessage{Message: &cloudpb.AgentMessage_Connect{Connect: &cloudpb.AgentConnect{
		DeviceId: cfg.DeviceID,
		Name:     cfg.AgentName,
		Version:  cfg.Version,
	}}}); err != nil {
		return err
	}

	// 启动心跳协程
	go func() {
		t := time.NewTicker(30 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case now := <-t.C:
				_ = stream.Send(&cloudpb.AgentMessage{Message: &cloudpb.AgentMessage_Heartbeat{Heartbeat: &cloudpb.AgentHeartbeat{
					DeviceId:  cfg.DeviceID,
					Timestamp: now.UnixNano(),
				}}})
			}
		}
	}()

	// 接收控制消息
	for {
		select {
		case <-ctx.Done():
			return nil
		default:
			in, err := stream.Recv()
			if err != nil {
				log.Printf("cloud stream recv error: %v", err)
				return err
			}
			switch m := in.Message.(type) {
			case *cloudpb.CloudMessage_ConnectAck:
				log.Printf("cloud connected: %v", m.ConnectAck.Message)
			case *cloudpb.CloudMessage_Command:
				resp, err := router.handle(ctx, m.Command.Method, m.Command.Payload)
				if err != nil {
					log.Printf("command handler error: %v", err)
					continue
				}
				sendResponse(stream, m.Command.RequestId, resp)
			case *cloudpb.CloudMessage_Ping:
				// ignore; heartbeat loop maintains liveness
			default:
				log.Printf("unknown cloud message")
			}
		}
	}
}

func sendResponse(stream cloudpb.DeviceRegistryService_ConnectAgentClient, requestID string, resp proto.Message) {
	b, err := proto.Marshal(resp)
	if err != nil {
		log.Printf("failed to marshal response: %v", err)
		return
	}

	if err := stream.Send(&cloudpb.AgentMessage{Message: &cloudpb.AgentMessage_Response{Response: &cloudpb.CommandResponse{
		RequestId: requestID,
		Payload:   b,
	}}}); err != nil {
		log.Printf("failed to send response: %v", err)
	}
}

// 命令路由器和处理器（复制自agent/main.go）
type CommandHandler interface {
	Handle(ctx context.Context, payload []byte) (proto.Message, error)
}

type commandRouter struct {
	handlers map[cloudpb.ControllerMethod]CommandHandler
}

func newCommandRouter(store *storage.Storage, exec *executor.Executor) *commandRouter {
	return &commandRouter{
		handlers: map[cloudpb.ControllerMethod]CommandHandler{
			cloudpb.ControllerMethod_CONTROLLER_METHOD_EXECUTE: &executeHandler{store: store, exec: exec},
			cloudpb.ControllerMethod_CONTROLLER_METHOD_LIST:    &listHandler{store: store},
			cloudpb.ControllerMethod_CONTROLLER_METHOD_STORE:   &storeHandler{store: store},
			cloudpb.ControllerMethod_CONTROLLER_METHOD_UPDATE:  &updateHandler{store: store},
			cloudpb.ControllerMethod_CONTROLLER_METHOD_DELETE:  &deleteHandler{store: store},
		},
	}
}

func (r *commandRouter) handle(ctx context.Context, method cloudpb.ControllerMethod, payload []byte) (proto.Message, error) {
	handler, exists := r.handlers[method]
	if !exists {
		return nil, &CommandError{Message: "unknown method"}
	}
	return handler.Handle(ctx, payload)
}

type CommandError struct {
	Message string
}

func (e *CommandError) Error() string {
	return e.Message
}

// 处理器实现
type executeHandler struct {
	store *storage.Storage
	exec  *executor.Executor
}

func (h *executeHandler) Handle(ctx context.Context, payload []byte) (proto.Message, error) {
	var req controllerpb.ExecuteCommandSetRequest
	if err := proto.Unmarshal(payload, &req); err != nil {
		return nil, err
	}

	cmdSet := h.store.Get(req.CommandSetId)
	if cmdSet == nil {
		return &controllerpb.ExecuteCommandSetResponse{Success: false, Error: "command set not found"}, nil
	}

	return h.exec.ExecuteCommandSet(ctx, cmdSet)
}

type listHandler struct {
	store *storage.Storage
}

func (h *listHandler) Handle(ctx context.Context, payload []byte) (proto.Message, error) {
	var req controllerpb.GetAllCommandSetsRequest
	if err := proto.Unmarshal(payload, &req); err != nil {
		return nil, err
	}

	all := h.store.GetAll()
	out := &controllerpb.GetAllCommandSetsResponse{}
	for _, cs := range all {
		out.CommandSets = append(out.CommandSets, cs)
	}
	return out, nil
}

type storeHandler struct {
	store *storage.Storage
}

func (h *storeHandler) Handle(ctx context.Context, payload []byte) (proto.Message, error) {
	var req controllerpb.StoreCommandSetRequest
	if err := proto.Unmarshal(payload, &req); err != nil {
		return nil, err
	}

	cs := &controllerpb.CommandSetInfo{CommandSetId: req.CommandSetId, CommandSetName: req.CommandSetName, CommandScripts: req.CommandScripts, Description: req.Description}
	if err := h.store.Store(req.CommandSetId, cs); err != nil {
		return &controllerpb.StoreCommandSetResponse{Success: false, Message: "failed to save command set: " + err.Error()}, nil
	}
	return &controllerpb.StoreCommandSetResponse{Success: true, Message: "command set saved successfully"}, nil
}

type updateHandler struct {
	store *storage.Storage
}

func (h *updateHandler) Handle(ctx context.Context, payload []byte) (proto.Message, error) {
	var req controllerpb.UpdateCommandSetRequest
	if err := proto.Unmarshal(payload, &req); err != nil {
		return nil, err
	}

	if h.store.Get(req.CommandSetId) == nil {
		return &controllerpb.UpdateCommandSetResponse{Success: false, Message: "command set not found"}, nil
	}

	cs := &controllerpb.CommandSetInfo{CommandSetId: req.CommandSetId, CommandSetName: req.CommandSetName, CommandScripts: req.CommandScripts, Description: req.Description}
	if err := h.store.Store(req.CommandSetId, cs); err != nil {
		return &controllerpb.UpdateCommandSetResponse{Success: false, Message: "failed to update command set: " + err.Error()}, nil
	}
	return &controllerpb.UpdateCommandSetResponse{Success: true, Message: "command set updated successfully"}, nil
}

type deleteHandler struct {
	store *storage.Storage
}

func (h *deleteHandler) Handle(ctx context.Context, payload []byte) (proto.Message, error) {
	var req controllerpb.DeleteCommandSetRequest
	if err := proto.Unmarshal(payload, &req); err != nil {
		return nil, err
	}

	if h.store.Get(req.CommandSetId) == nil {
		return &controllerpb.DeleteCommandSetResponse{Success: false, Message: "command set not found"}, nil
	}

	if err := h.store.Delete(req.CommandSetId); err != nil {
		return &controllerpb.DeleteCommandSetResponse{Success: false, Message: "failed to delete command set: " + err.Error()}, nil
	}
	return &controllerpb.DeleteCommandSetResponse{Success: true, Message: "command set deleted successfully"}, nil
}
