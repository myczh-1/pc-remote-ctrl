package main

import (
	"context"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	controllerpb "pc-remote-ctrl/backend/proto"
	"pc-remote-ctrl/backend/internal/executor"
	"pc-remote-ctrl/backend/internal/server"
	"pc-remote-ctrl/backend/internal/storage"

	"github.com/improbable-eng/grpc-web/go/grpcweb"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)


func main() {
	// Initialize components
	storage := storage.New("command_sets.json")
	if err := storage.Load(); err != nil {
		log.Fatalf("failed to load command sets: %v", err)
	}

	executor := executor.New()
	srv := server.New(storage, executor)

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
