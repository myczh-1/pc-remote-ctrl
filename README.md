# PC Remote Control

A gRPC-based remote PC control system with web interface.

## Project Structure

```
pc-remote-ctrl/
├── proto/                        # Shared protobuf sources
│   ├── home/
│   │   └── service.proto         # HomeService for smart home management
│   └── cloud/
│       └── gateway.proto         # Cloud gateway for request forwarding
├── backend/                      # Go backend (home gateway)
│   ├── cmd/home-gateway/main.go  # Home gateway gRPC + gRPC-Web server
│   ├── internal/
│   │   ├── home/                 # HomeService implementation
│   │   ├── storage/              # Device/scene/automation storage
│   │   ├── mqtt/                 # MQTT client & broker integration
│   │   ├── ops/                  # Device operation handlers
│   │   └── broker/               # Embedded MQTT broker
│   ├── proto/                    # Generated Go stubs (do not edit)
│   └── data/                     # Storage files (home.db for devices, scenes.json, etc.)
├── cloud-middleware/             # Cloud registry & tunnel proxy
│   ├── cmd/server/main.go        # Unified gRPC + gRPC-Web entry (7073)
│   ├── internal/{device,proxy,grpcserver}
│   └── proto/                    # Generated Go stubs (do not edit)
├── frontend/                     # React + TypeScript web UI
│   ├── src/
│   │   ├── proto/                # Generated TS stubs (do not edit)
│   │   ├── hooks/                # React hooks
│   │   └── components/           # UI components
│   └── vite.config.ts            # Dev proxy (/api -> 7071)
├── Makefile                      # Build automation
└── README.md
```

## Ports & Endpoints

- Backend (local agent/server):
  - Port 7071 serves BOTH native gRPC and gRPC-Web on a single listener (h2c + grpc-web wrapper).
  - Health endpoint: `GET /healthz` → 200 OK.
  - Note: No auth or strict CORS in dev. Do NOT expose publicly without a reverse proxy and ACL.
- Cloud middleware (Tunnel Only):
  - Default gRPC/gRPC-Web port 7073 (env `GRPC_PORT` to override).
  - Transport: reverse tunnel only. Devices must establish `TunnelService.Open` to be reachable.
  - `DEFAULT_BACKEND_ADDR` deprecated and ignored for routing.
  - Configure allowed CORS origins via `CORS_ALLOWED_ORIGINS` (comma-separated list). Example: `http://localhost:5173`.
  - Tunnel tuning (env): `TUNNEL_SESSION_BUF` (default 64), `TUNNEL_MAX_FRAME_BYTES` (default 1048576 bytes)
  - Auth: when `AGENT_SECRET` is set on cloud, agents must include metadata `x-device-id` and `x-agent-secret` when opening tunnel.
- Frontend:
  - Dev server on 5173.
  - Vite proxy maps `/api` → `http://localhost:7071` for gRPC-Web to backend.
  - For cloud calls, set `VITE_CLOUD_GRPCWEB_URL` (defaults to `http://localhost:7073`).

## Quick Start

### Prerequisites
- Go 1.23+
- Node.js 18+
- protoc (Protocol Buffer Compiler)

### Setup
```bash
# Install dependencies
make install

# Generate protobuf code (Go + TS)
make proto-gen

# Start backend (unified gRPC + gRPC-Web on 7071)
make dev-backend

# Start frontend (5173) - in another terminal
make dev-frontend

# Start cloud middleware (7073)
make dev-cloud

# Backend can register and (later) open tunnel to cloud
# Example (dev):
# CLOUD_ADDR=127.0.0.1:7073 AGENT_DEVICE_ID=dev1 make dev-backend
```

## Docker Compose Modes

Two standalone compose files cover the direct (local) and cloud deployments so the backend agent and the cloud middleware never run in the same stack. Both modes include a production frontend container so you can access the UI without `npm run dev`.

### Local / Direct Stack (`docker-compose.yml`)
- `docker compose up --build` starts `mqtt`, `home-gateway`, and the nginx-based `frontend`; append `--profile debug` to also run `mqtt-explorer`.
- Ports: MQTT `1883/9001`, backend `7071`, SPA `8080`, optional explorer `4000`.
- Backend data persists via `./backend/data:/data`, and Mosquitto picks up `backend/config/mosquitto.conf`.
- The frontend proxies `/api/*` to `home-gateway` using `HOME_BACKEND_URL` (default `http://home-gateway:7071/`). Set `CLOUD_GATEWAY_URL` if you want `/cloud/*` to forward to a remote tunnel endpoint even in the local stack.

### Cloud Stack (`docker-compose.cloud.yml`)
- `docker compose -f docker-compose.cloud.yml up --build` runs only the cloud middleware plus the frontend so the agent never ships with the cloud mode.
- Ports: cloud gRPC/gRPC-Web `7073`, SPA `8080`.
- `cloud-middleware` honors `GRPC_PORT`, `CORS_ALLOWED_ORIGINS`, `AUTH_MODE`, and `AGENT_SECRET` via Compose env overrides.
- The frontend proxies `/cloud/*` to the in-stack middleware (`CLOUD_GATEWAY_URL=http://cloud-middleware:7073/`) while `/api/*` returns 502 because no backend service exists in this mode.

### Frontend Container Behavior
- `frontend/Dockerfile` builds the Vite app once and serves it through nginx; build args default `VITE_HOME_GRPCWEB_URL=/api` and `VITE_CLOUD_GRPCWEB_URL=/cloud` so the browser always talks to same-origin paths.
- `frontend/docker/entrypoint.sh` renders nginx config on boot; override `HOME_BACKEND_URL` or `CLOUD_GATEWAY_URL` (the entrypoint appends a trailing `/` if you forget) when the upstreams sit behind another host or TLS terminator.
- Both stacks expose the SPA on `http://localhost:8080` and provide `/healthz` so you can hang them behind your own reverse proxy or TinyAuth if needed.

### Deploy TinyAuth Gateway (Docker Compose)

服务器侧使用 `docker-compose.tinyauth.yml` 启动 TinyAuth、cloud middleware、前端与 Nginx：

```bash
cp tinyauth.env.example .env                      # 配置 ROOT_DOMAIN、TINYAUTH_URL、TINYAUTH_USERS 等
# 生成 BCrypt 哈希（示例密码 password）
docker run --rm httpd:2.4-alpine htpasswd -bnBC 10 "" password | tr -d ':\n'

# 配置 DNS 或 /etc/hosts 指向 tinyauth.<域名>、cloud.<域名>、app.<域名>
docker compose -f docker-compose.tinyauth.yml --env-file .env up -d
```

验证：
- `http://tinyauth.<域名>` → TinyAuth 登录页；
- 未登录访问 `http://cloud.<域名>/healthz` 或 `http://app.<域名>` 会跳转登录；
- 登录后再访问 cloud/frontend，TinyAuth Cookie 在主域生效，Nginx 放行到内部服务。

若需公开前端，可在 `nginx.tinyauth.conf` 的 `app.$ROOT_DOMAIN` server block 移除 `auth_request`。

# Build for Production
```bash
# Build everything (backend binary -> bin/pc-remote-ctrl; frontend -> frontend/dist)
make build

# Run the built backend (7071)
./bin/pc-remote-ctrl
```

## Architecture

- Backend: unified listener (7071) that handles both gRPC and gRPC-Web; executes command sets as shell scripts (platform-specific: `sh -c` / `cmd /C`).
- Cloud middleware (7073): device registry + reverse-tunnel proxy (Tunnel Only); `GatewayService` forwards HomeService requests over tunnels.
- Frontend: gRPC-Web clients (protobuf-ts) to call backend locally or cloud middleware remotely.

## Proto & Codegen

- Edit sources only under `proto/` and `proto/cloud/`.
- Run `make proto-gen` to generate:
  - Go stubs → `backend/proto` and `cloud-middleware/proto`
  - TS stubs → `frontend/src/proto`
- Do not hand-edit generated code.

## Security Notes

- Backend currently allows all origins for gRPC-Web in dev and has no auth; it executes arbitrary shell scripts from stored command sets. Treat it as a local/development component.
- For cloud middleware, set `CORS_ALLOWED_ORIGINS` and place behind a firewall/reverse proxy. Do not expose unauthenticated execution endpoints to the internet.

## Available Commands

- `make install`     - Install Go and Node dependencies
- `make setup-tools` - Verify protoc and install Go plugins
- `make proto-gen`   - Generate protobuf code for Go & TS
- `make build`       - Build backend and frontend
- `make dev-backend` - Run backend (dev)
- `make dev-frontend`- Run frontend (dev)
- `make clean`       - Clean build artifacts
- `make help`        - Show all commands

## Makefile Usage

- Development
  - Backend (7071): `make dev-backend`
  - Frontend (5173): `make dev-frontend`
  - Proto generation: `make proto-gen` (runs Go + TS codegen)
- Build
  - Backend binary: `make build-backend` → `bin/pc-remote-ctrl`
  - Frontend assets: `make build-frontend` → `frontend/dist`
  - All: `make build`
- Tooling
  - Protobuf toolchain check/install: `make setup-tools`
  - Clean artifacts and generated stubs: `make clean`

## Environment Variables

- Cloud middleware
  - `GRPC_PORT`: gRPC/gRPC-Web listen port (default `7073`).
    - Example: `GRPC_PORT=9090 go run ./cmd/server`
  - `CORS_ALLOWED_ORIGINS`: comma-separated list of allowed origins for grpc-web.
    - Example (local dev): `CORS_ALLOWED_ORIGINS="http://localhost:5173, http://127.0.0.1:5173"`
  - `TUNNEL_SESSION_BUF`: per-session buffered frames (default `64`).
  - `TUNNEL_MAX_FRAME_BYTES`: max payload size per frame (default `1048576`).
- Frontend
  - `VITE_HOME_GRPCWEB_URL`: grpc-web base URL for the local agent in SPA/dev builds (default `/api`).
  - `VITE_CLOUD_GRPCWEB_URL`: grpc-web base URL for cloud middleware in SPA/dev builds (default `http://localhost:7073`).
    - Example: `VITE_CLOUD_GRPCWEB_URL=http://localhost:9090 npm run dev`
  - Dockerized frontend (nginx) also consumes `HOME_BACKEND_URL` and `CLOUD_GATEWAY_URL` to decide where `/api/*` and `/cloud/*` proxy (trailing `/` is optional; the entrypoint normalizes it).
- Backend (agent)
  - `CLOUD_ADDR`: cloud middleware address (e.g., `127.0.0.1:7073`).
  - `AGENT_DEVICE_ID`: unique device ID to identify the agent.
  - `AGENT_SECRET`: optional secret; used by AgentService Register and sent in tunnel metadata `x-agent-secret`.
  - `AGENT_TUNNEL_UNARY_TIMEOUT_MS`: unary call timeout over tunnel in milliseconds (default `8000`).

Notes
- Backend currently listens on `7071` and accepts grpc + grpc-web on a single port; no environment flags yet. Use a reverse proxy if you need to remap externally.
- For production, always set `CORS_ALLOWED_ORIGINS` on cloud middleware and deploy behind a firewall/reverse proxy.
