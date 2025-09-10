.PHONY: proto-gen proto-clean build-backend build-frontend dev-backend dev-frontend clean setup-tools install help

# ---------- Paths ----------
PROTO_DIR      := proto
AGENT_PROTO_FILES := $(shell find $(PROTO_DIR) -maxdepth 1 -name '*.proto')
CLOUD_PROTO_FILES := $(shell find $(PROTO_DIR)/cloud -name '*.proto')
BACKEND_DIR    := backend
FRONTEND_DIR   := frontend
CLOUD_DIR      := cloud-middleware

# Go bin dir: 优先 GOBIN，其次 GOPATH/bin
GO_BIN_DIR     := $(shell go env GOBIN)
ifeq ($(GO_BIN_DIR),)
  GO_BIN_DIR   := $(shell go env GOPATH)/bin
endif

PROTOC         := protoc
# 显式指定插件绝对路径，避免 PATH 问题
PROTOC_GEN_GO        := $(GO_BIN_DIR)/protoc-gen-go
PROTOC_GEN_GO_GRPC   := $(GO_BIN_DIR)/protoc-gen-go-grpc

# ---------- Tools ----------
setup-tools:
	@echo "Installing protobuf tools..."
	@which $(PROTOC) >/dev/null || (echo "❌ protoc 未安装，请先在本机安装。macOS 可用: brew install protobuf"; exit 1)
	@echo "protoc: $$($(PROTOC) --version)"
	@echo "Installing Go protoc plugins (if missing)..."
	@test -x "$(PROTOC_GEN_GO)" || (echo "→ go install protoc-gen-go"; go install google.golang.org/protobuf/cmd/protoc-gen-go@latest)
	@test -x "$(PROTOC_GEN_GO_GRPC)" || (echo "→ go install protoc-gen-go-grpc"; go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest)
	@echo "Using GO_BIN_DIR=$(GO_BIN_DIR)"
	@ls -l "$(PROTOC_GEN_GO)" "$(PROTOC_GEN_GO_GRPC)" || (echo "❌ 插件仍未找到，请检查 go env GOBIN/GOPATH"; exit 1)
	@echo "✅ Tools ready."

# ---------- Generate ----------
proto-gen: setup-tools
    @echo "Generating protobuf code..."
    # Go (agent protos into backend)
    $(PROTOC) -I $(PROTO_DIR) \
      --plugin=protoc-gen-go=$(PROTOC_GEN_GO) \
      --plugin=protoc-gen-go-grpc=$(PROTOC_GEN_GO_GRPC) \
      --go_out=$(BACKEND_DIR)/proto --go_opt=paths=source_relative \
      --go-grpc_out=$(BACKEND_DIR)/proto --go-grpc_opt=paths=source_relative \
      $(AGENT_PROTO_FILES)
    # Go (cloud protos into cloud-middleware)
    $(PROTOC) -I $(PROTO_DIR) \
      --plugin=protoc-gen-go=$(PROTOC_GEN_GO) \
      --plugin=protoc-gen-go-grpc=$(PROTOC_GEN_GO_GRPC) \
      --go_out=$(CLOUD_DIR)/proto --go_opt=paths=source_relative \
      --go-grpc_out=$(CLOUD_DIR)/proto --go-grpc_opt=paths=source_relative \
      $(CLOUD_PROTO_FILES)
    # Frontend (protobuf-ts)
    cd $(FRONTEND_DIR) && npm run proto:gen
    @echo "✅ proto generated for Go & TS."

proto-clean:
    @echo "Cleaning generated protobuf code..."
    @find $(BACKEND_DIR)/proto -name '*.pb.go' -delete || true
    @rm -f $(FRONTEND_DIR)/src/proto/*.ts || true

# ---------- Build / Dev ----------
build-backend: proto-gen
	@echo "Building backend..."
	cd $(BACKEND_DIR) && go build -o ../bin/pc-remote-ctrl .

build-frontend: proto-gen
	@echo "Building frontend..."
	cd $(FRONTEND_DIR) && npm run build

build: build-backend build-frontend

dev-backend: proto-gen
	@echo "Starting backend in development mode..."
	cd $(BACKEND_DIR) && go run .

dev-frontend:
	@echo "Starting frontend in development mode..."
	cd $(FRONTEND_DIR) && npm run dev

install:
	@echo "Installing dependencies..."
	cd $(BACKEND_DIR) && go mod download
	cd $(FRONTEND_DIR) && npm install

clean:
	@echo "Cleaning build artifacts..."
	rm -rf bin/
	rm -rf $(FRONTEND_DIR)/dist/
	rm -f $(BACKEND_DIR)/proto/remotepb/*.pb.go
	rm -f $(FRONTEND_DIR)/src/proto/*.ts

help:
    @echo "Available commands:"
    @echo "  setup-tools     - Install required protobuf tools"
    @echo "  proto-gen       - Generate protobuf code for both backend and frontend"
    @echo "  proto-clean     - Clean generated protobuf code"
    @echo "  build-backend   - Build Go backend"
    @echo "  build-frontend  - Build React frontend"
    @echo "  build           - Build both backend and frontend"
    @echo "  dev-backend     - Run backend in development mode"
    @echo "  dev-frontend    - Run frontend in development mode"
    @echo "  install         - Install all dependencies"
    @echo "  clean           - Clean all build artifacts"
    @echo "  help            - Show this help message"
