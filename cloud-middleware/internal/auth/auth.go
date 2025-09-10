package auth

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var (
	ErrInvalidToken = errors.New("invalid token")
	ErrTokenExpired = errors.New("token expired")
	ErrNoToken      = errors.New("no token provided")
)

// Claims JWT声明
type Claims struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// Authenticator 认证器
type Authenticator struct {
	jwtSecret     []byte
	tinyauthURL   string
	httpClient    *http.Client
}

// NewAuthenticator 创建认证器
func NewAuthenticator(jwtSecret string, tinyauthURL string) *Authenticator {
	return &Authenticator{
		jwtSecret:   []byte(jwtSecret),
		tinyauthURL: tinyauthURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// ValidateToken 验证JWT token
func (a *Authenticator) ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		return a.jwtSecret, nil
	})
	
	if err != nil {
		return nil, ErrInvalidToken
	}
	
	if !token.Valid {
		return nil, ErrInvalidToken
	}
	
	claims, ok := token.Claims.(*Claims)
	if !ok {
		return nil, ErrInvalidToken
	}
	
	return claims, nil
}

// ExtractTokenFromRequest 从请求中提取token
func (a *Authenticator) ExtractTokenFromRequest(r *http.Request) (string, error) {
	// 从Authorization header获取
	authHeader := r.Header.Get("Authorization")
	if authHeader != "" {
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) == 2 && parts[0] == "Bearer" {
			return parts[1], nil
		}
	}
	
	// 从query参数获取
	token := r.URL.Query().Get("token")
	if token != "" {
		return token, nil
	}
	
	return "", ErrNoToken
}

// AuthenticateRequest 认证HTTP请求
func (a *Authenticator) AuthenticateRequest(r *http.Request) (*Claims, error) {
	tokenString, err := a.ExtractTokenFromRequest(r)
	if err != nil {
		return nil, err
	}
	
	return a.ValidateToken(tokenString)
}

// VerifyWithTinyauth 通过tinyauth验证token（可选实现）
func (a *Authenticator) VerifyWithTinyauth(ctx context.Context, token string) (*Claims, error) {
	// TODO: 实现与tinyauth的token验证
	// 这里可以调用tinyauth的验证端点
	return nil, errors.New("not implemented")
}

// AuthMiddleware HTTP认证中间件
func (a *Authenticator) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, err := a.AuthenticateRequest(r)
		if err != nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		
		// 将用户信息添加到context
		ctx := context.WithValue(r.Context(), "user_id", claims.UserID)
		ctx = context.WithValue(ctx, "username", claims.Username)
		
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// GetUserIDFromContext 从context获取用户ID
func GetUserIDFromContext(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value("user_id").(string)
	return userID, ok
}