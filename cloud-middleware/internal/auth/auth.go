package auth

import (
    "context"
)

// Authenticator 为后续 tiny auth 集成预留接口。
// MVP 使用开放模式（不校验）。
type Authenticator interface {
    Authenticate(ctx context.Context) error
}

type NoopAuth struct{}

func (NoopAuth) Authenticate(ctx context.Context) error { return nil }
