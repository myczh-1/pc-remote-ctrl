.PHONY: proto-gen proto-clean build-backend build-frontend dev-backend dev-frontend dev-cloud dev-agent clean setup-tools install help vendor

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

# Path to TS plugin (absolute), used when generating frontend stubs
PROTOC_GEN_TS := $(abspath $(FRONTEND_DIR))/node_modules/.bin/protoc-gen-ts

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
	@echo "Generating protobuf code (Go + TS for home service)..."
	# Go (home protos into backend)
	$(PROTOC) -I $(PROTO_DIR) \
	  --plugin=protoc-gen-go=$(PROTOC_GEN_GO) \
	  --plugin=protoc-gen-go-grpc=$(PROTOC_GEN_GO_GRPC) \
	  --go_out=$(BACKEND_DIR)/proto --go_opt=paths=source_relative \
	  --go-grpc_out=$(BACKEND_DIR)/proto --go-grpc_opt=paths=source_relative \
	  $(PROTO_DIR)/home/*.proto
	# Go (cloud protos into cloud-middleware)
	$(PROTOC) -I $(PROTO_DIR) \
	  --plugin=protoc-gen-go=$(PROTOC_GEN_GO) \
	  --plugin=protoc-gen-go-grpc=$(PROTOC_GEN_GO_GRPC) \
	  --go_out=$(CLOUD_DIR)/proto --go_opt=paths=source_relative \
	  --go-grpc_out=$(CLOUD_DIR)/proto --go-grpc_opt=paths=source_relative \
	  $(PROTO_DIR)/cloud/*.proto
	# Frontend (protobuf-ts)
	cd $(FRONTEND_DIR) && \
	  test -x "$(PROTOC_GEN_TS)" || (echo "❌ Missing protoc-gen-ts. Run: cd $(FRONTEND_DIR) && npm install"; exit 1); \
	  $(PROTOC) -I ../$(PROTO_DIR) \
	    ../$(PROTO_DIR)/home/*.proto \
	    ../$(PROTO_DIR)/cloud/*.proto \
	    --plugin=protoc-gen-ts=$(PROTOC_GEN_TS) \
	    --ts_out=./src/proto --ts_opt=long_type_string
	@echo "✅ proto generated for Go & TS (home + cloud)."

proto-clean:
	@echo "Cleaning generated protobuf code..."
	@find $(BACKEND_DIR)/proto -name '*.pb.go' -delete || true
	@rm -f $(FRONTEND_DIR)/src/proto/*.ts || true

# ---------- Build / Dev ----------
build-backend: proto-gen
	@echo "Building backend (home-gateway)..."
	@mkdir -p bin
	go build -o bin/pc-remote-ctrl $(BACKEND_DIR)/cmd/home-gateway/main.go

# Removed build-agent - now using unified backend

build-frontend: proto-gen
	@echo "Building frontend..."
	cd $(FRONTEND_DIR) && npm run build

build: build-backend build-frontend

vendor:
	@echo "Syncing workspace vendor directory..."
	go work vendor
	@echo "✅ vendor synced (workspace)"

dev-backend: proto-gen vendor
	@echo "Starting backend (home-gateway) in development mode..."
	GOPROXY=https://proxy.golang.org,direct GOSUMDB=sum.golang.org go -C $(BACKEND_DIR) mod tidy
	go run -mod=vendor $(BACKEND_DIR)/cmd/home-gateway/main.go

dev-frontend:
	@echo "Starting frontend in development mode..."
	cd $(FRONTEND_DIR) && npm run dev

# Run cloud middleware (gRPC + gRPC-Web on 7073)
dev-cloud: proto-gen vendor
	@echo "Starting cloud-middleware in development mode (7073)..."
	GOPROXY=https://proxy.golang.org,direct GOSUMDB=sum.golang.org go -C $(CLOUD_DIR) mod tidy
	go run -mod=vendor ./cloud-middleware/cmd/server/main.go

# Run unified backend with cloud connection enabled (cloud only)
dev-agent:
	@echo "unified agent mode removed in this branch (use dev-backend)"

# Run unified backend with both local and cloud enabled
dev-unified:
	@echo "unified mode removed in this branch (use dev-backend)"

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
	@echo "  dev-backend     - Run unified backend (local mode only)"
	@echo "  dev-frontend    - Run frontend in development mode"
	@echo "  dev-cloud       - Run cloud middleware in development mode"
	@echo "  dev-agent       - Run unified backend with cloud connection"
	@echo "  dev-unified     - Run unified backend (local + cloud modes)"
	@echo "  install         - Install all dependencies"
	@echo "  clean           - Clean all build artifacts"
	@echo "  help            - Show this help message"
