# PC Remote Control

A gRPC-based remote PC control system with web interface.

## Project Structure

```
pc-remote-ctrl/
├── proto/                      # Shared protobuf definitions
│   └── remote_control.proto
├── backend/                    # Go backend server
│   ├── main.go                 # Application entry point
│   ├── handlers.go             # gRPC service handlers
│   ├── models.go               # Data structures
│   ├── proto/                  # Generated Go code
│   └── data/
│       └── commands.json       # Stored commands
├── frontend/                   # React frontend
│   ├── src/
│   │   ├── proto/              # Generated TypeScript code
│   │   ├── hooks/              # React hooks
│   │   ├── components/         # React components
│   │   └── App.tsx
│   └── package.json
├── Makefile                    # Build automation
└── README.md
```

## Quick Start

### Prerequisites
- Go 1.23+
- Node.js 18+
- protoc (Protocol Buffer Compiler)

### Setup
```bash
# Install dependencies
make install

# Generate protobuf code
make proto-gen

# Start backend (port 7071 gRPC, 7072 grpc-web)
make dev-backend

# Start frontend (port 5173) - in another terminal
make dev-frontend
```

### Build for Production
```bash
# Build everything
make build

# Run the built backend
./bin/pc-remote-ctrl
```

## Architecture

- **gRPC Server (Port 7071)**: Native gRPC for Go clients
- **gRPC-Web Gateway (Port 7072)**: HTTP/2 gateway for web clients
- **Web Frontend (Port 5173)**: React app with gRPC-Web client

## Available Commands

- `make proto-gen` - Generate protobuf code
- `make build` - Build backend and frontend
- `make dev-backend` - Run backend in development
- `make dev-frontend` - Run frontend in development
- `make clean` - Clean build artifacts
- `make help` - Show all commands