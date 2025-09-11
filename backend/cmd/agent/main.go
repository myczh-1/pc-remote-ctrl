package main

import (
    "context"
    "log"
    "net"
    "os"
    "os/signal"
    "time"

    controllerpb "pc-remote-ctrl/backend/proto"
    "pc-remote-ctrl/backend/internal/executor"
    "pc-remote-ctrl/backend/internal/storage"
    cloudpb "pc-remote-ctrl/cloud-middleware/proto/cloud"

    "google.golang.org/grpc"
    "google.golang.org/protobuf/proto"
)

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

func main() {
    cfg := loadConfig()
    log.Printf("agent starting: device_id=%s cloud=%s", cfg.DeviceID, cfg.CloudAddr)

    // Load local command sets (if available)
    store := storage.New(cfg.CommandsFile)
    if err := store.Load(); err != nil {
        log.Printf("warn: load command sets failed: %v", err)
    }
    exec := executor.New()
    router := newCommandRouter(store, exec)

    // Dial cloud
    conn, err := grpc.Dial(cfg.CloudAddr, grpc.WithInsecure(), grpc.WithBlock(), grpc.WithDefaultCallOptions(grpc.MaxCallRecvMsgSize(32<<20)))
    if err != nil {
        log.Fatalf("dial cloud failed: %v", err)
    }
    defer conn.Close()

    client := cloudpb.NewDeviceRegistryServiceClient(conn)

    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()

    // Handle signals
    go func() {
        ch := make(chan os.Signal, 1)
        signal.Notify(ch, os.Interrupt)
        <-ch
        log.Printf("agent shutting down...")
        cancel()
    }()

    // Connect control stream
    stream, err := client.ConnectAgent(ctx)
    if err != nil {
        log.Fatalf("connect control stream failed: %v", err)
    }

    // Send initial connect
    if err := stream.Send(&cloudpb.AgentMessage{Message: &cloudpb.AgentMessage_Connect{Connect: &cloudpb.AgentConnect{
        DeviceId: cfg.DeviceID,
        Name:     cfg.AgentName,
        Version:  cfg.Version,
    }}}); err != nil {
        log.Fatalf("send connect failed: %v", err)
    }

    // Heartbeat ticker
    go func() {
        t := time.NewTicker(30 * time.Second)
        defer t.Stop()
        for {
            select {
            case <-ctx.Done():
                return
            case now := <-t.C:
                _ = stream.Send(&cloudpb.AgentMessage{Message: &cloudpb.AgentMessage_Heartbeat{Heartbeat: &cloudpb.AgentHeartbeat{
                    DeviceId: cfg.DeviceID,
                    Timestamp: now.UnixNano(),
                }}})
            }
        }
    }()

    // Optional: start a logs stream when LOGS_ENABLE=true
    if os.Getenv("LOGS_ENABLE") == "true" {
        go streamLogs(ctx, client, cfg)
    }

    // Receive control messages
    for {
        in, err := stream.Recv()
        if err != nil {
            log.Printf("control stream recv error: %v", err)
            return
        }
        switch m := in.Message.(type) {
        case *cloudpb.CloudMessage_ConnectAck:
            log.Printf("connected: %v", m.ConnectAck.Message)
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
            log.Printf("unknown control message")
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

func streamLogs(ctx context.Context, client cloudpb.DeviceRegistryServiceClient, cfg *Config) {
    s, err := client.StreamLogs(ctx)
    if err != nil {
        log.Printf("open logs stream failed: %v", err)
        return
    }
    // Example: send a small hello log then end
    _ = s.Send(&cloudpb.LogLine{DeviceId: cfg.DeviceID, StreamId: cfg.DeviceID+"-boot", Seq: 1, Ts: time.Now().UnixNano(), Level: "INFO", Chunk: []byte("agent up"), End: true})
    // Read acks until context done
    go func() {
        for {
            ack, err := s.Recv()
            if err != nil {
                return
            }
            log.Printf("log ack: %s %d", ack.StreamId, ack.AckSeq)
        }
    }()
}

type Config struct {
    CloudAddr    string
    DeviceID     string
    AgentName    string
    Version      string
    CommandsFile string
}

func loadConfig() *Config {
    host, err := os.Hostname()
    if err != nil {
        host = "unknown"
    }
    deviceID := getenv("DEVICE_ID", host)
    return &Config{
        CloudAddr:    hostPort(getenv("CLOUD_ADDR", "localhost:7073")),
        DeviceID:     deviceID,
        AgentName:    getenv("AGENT_NAME", host),
        Version:      getenv("AGENT_VERSION", "dev"),
        CommandsFile: getenv("COMMANDS_FILE", "backend/command_sets.json"),
    }
}

func getenv(k, def string) string { v := os.Getenv(k); if v == "" { return def }; return v }

func hostPort(addr string) string {
    // accept ":7073" or "host:7073" forms; ensure host present
    host, port, err := net.SplitHostPort(addr)
    if err != nil {
        return addr
    }
    if host == "" { host = "localhost" }
    return net.JoinHostPort(host, port)
}
