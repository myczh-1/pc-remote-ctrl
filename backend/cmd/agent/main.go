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

func main() {
    cfg := loadConfig()
    log.Printf("agent starting: device_id=%s cloud=%s", cfg.DeviceID, cfg.CloudAddr)

    // Load local command sets (if available)
    store := storage.New(cfg.CommandsFile)
    if err := store.Load(); err != nil {
        log.Printf("warn: load command sets failed: %v", err)
    }
    exec := executor.New()

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
            // Decode request
            var req controllerpb.ExecuteCommandSetRequest
            if err := proto.Unmarshal(m.Command.Payload, &req); err != nil {
                log.Printf("bad command payload: %v", err)
                continue
            }
            // Lookup scripts
            cmdSet := store.Get(req.CommandSetId)
            if cmdSet == nil {
                resp := &controllerpb.ExecuteCommandSetResponse{Success: false, Error: "command set not found"}
                sendResponse(stream, m.Command.RequestId, resp)
                continue
            }
            // Execute
            // Adapt backend storage.CommandSet to executor.CommandSet
            local := &executor.CommandSet{Name: cmdSet.Name, Scripts: cmdSet.Scripts, Desc: cmdSet.Desc}
            res, _ := exec.ExecuteCommandSet(ctx, local)
            sendResponse(stream, m.Command.RequestId, res)
        case *cloudpb.CloudMessage_Ping:
            // ignore; heartbeat loop maintains liveness
        default:
            log.Printf("unknown control message")
        }
    }
}

func sendResponse(stream cloudpb.DeviceRegistryService_ConnectAgentClient, requestID string, resp *controllerpb.ExecuteCommandSetResponse) {
    b, _ := proto.Marshal(resp)
    _ = stream.Send(&cloudpb.AgentMessage{Message: &cloudpb.AgentMessage_Response{Response: &cloudpb.CommandResponse{
        RequestId: requestID,
        Payload:   b,
    }}})
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
    host, _ := os.Hostname()
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
