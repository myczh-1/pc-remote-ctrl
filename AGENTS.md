# Repository Guidelines

## Project Structure & Modules
- `backend/` – Go gRPC server and business logic (`internal/{server,executor,storage}`), generated Go stubs in `backend/proto/`.
- `cloud-middleware/` – Go services for cloud registry/gateway (`cmd/server`, `internal/*`, generated stubs in `cloud-middleware/proto/`).
- `frontend/` – React + TypeScript app (`src/components`, `src/hooks`, generated TS in `src/proto/`).
- `proto/` – Source `.proto` files (`proto/*.proto`, `proto/cloud/*.proto`). Do not edit generated code.
- `Makefile` – One‑shot tasks for setup, codegen, build, and dev.

## Build, Test, and Development
- `make install` – Install Go and Node dependencies.
- `make setup-tools` – Verify `protoc` and install Go plugins into `GOBIN`.
- `make proto-gen` – Generate Go and TS protobuf code (writes to `backend/proto` and `frontend/src/proto`).
- `make dev-backend` – Run backend locally (gRPC 7071; grpc-web gateway 7072 per README).
- `make dev-frontend` – Run frontend locally on 5173.
- `make build` – Build backend binary to `bin/pc-remote-ctrl` and frontend to `frontend/dist`.
- `make clean` – Remove build artifacts and generated stubs.

## Coding Style & Naming
- Go: use `go fmt ./...`; package names lowercase; exported identifiers `CamelCase`; files `snake_case.go`. Keep new logic under `backend/internal/...` or `cloud-middleware/internal/...` and wire via `cmd` or `main`.
- TypeScript/React: follow existing ESLint config; components `PascalCase` in `src/components`; hooks `useX` in `src/hooks`; 2‑space indent.
- Protobuf: place sources under `proto/`; service names end with `Service`; fields `snake_case`; update `option go_package` when adding files; regenerate with `make proto-gen`.

## Testing Guidelines
- Go: standard `testing` in `*_test.go` next to packages; run `go test ./...`. Prefer table‑driven tests and target core logic (`executor`, `storage`).
- Frontend: no test runner configured; run `npm run lint` and verify flows manually via `make dev-frontend`. If adding tests, prefer Vitest + React Testing Library.

## Commit & Pull Request Guidelines
- Use Conventional Commits (e.g., `feat:`, `fix:`, `refactor:`). Example: `feat(backend/server): add grpc-web CORS allowlist`.
- PRs: include clear description, linked issues, screenshots for UI changes, and any port/env changes (e.g., `GRPC_PORT` for cloud middleware). Update README when behavior or commands change.

## Security & Configuration Tips
- Do not commit secrets or local binaries. Edit `.proto` sources only; never hand‑edit generated files. Default ports: backend 7071/7072, frontend 5173, cloud middleware 7073 (`GRPC_PORT`).
