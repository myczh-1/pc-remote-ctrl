package executor

import (
    "context"
    "time"

    "google.golang.org/grpc"
    "google.golang.org/grpc/backoff"
    "google.golang.org/grpc/credentials/insecure"
    "google.golang.org/grpc/keepalive"
)

type Dialer struct{}

func NewDialer() *Dialer { return &Dialer{} }

func (d *Dialer) Dial(ctx context.Context, addr string) (*grpc.ClientConn, error) {
    cfg := backoff.Config{BaseDelay: 100 * time.Millisecond, Multiplier: 1.6, MaxDelay: 2 * time.Second}
    return grpc.DialContext(
        ctx,
        addr,
        grpc.WithTransportCredentials(insecure.NewCredentials()),
        grpc.WithConnectParams(grpc.ConnectParams{Backoff: cfg, MinConnectTimeout: 2 * time.Second}),
        grpc.WithKeepaliveParams(keepalive.ClientParameters{Time: 20 * time.Second, Timeout: 5 * time.Second}),
    )
}
