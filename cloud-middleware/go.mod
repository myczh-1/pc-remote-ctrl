module pc-remote-ctrl/cloud-middleware

go 1.24.4


require (
	github.com/improbable-eng/grpc-web v0.15.0
	google.golang.org/grpc v1.75.0
	google.golang.org/protobuf v1.36.8
    pc-remote-ctrl/backend v0.0.0-00010101000000-000000000000
)

require (
	github.com/cenkalti/backoff/v4 v4.1.1 // indirect
	github.com/desertbit/timer v0.0.0-20180107155436-c41aec40b27f // indirect
	github.com/klauspost/compress v1.11.7 // indirect
	github.com/rs/cors v1.7.0 // indirect
	golang.org/x/net v0.41.0 // indirect
	golang.org/x/sys v0.33.0 // indirect
	golang.org/x/text v0.28.0 // indirect
	nhooyr.io/websocket v1.8.6 // indirect
)

// Resolve ambiguous import of genproto by forcing split paths to monorepo
// unify genproto path to avoid dual module path
require google.golang.org/genproto v0.0.0-20210126160654-44e461bb6506 // indirect

// unify split import path to root module to avoid dual module paths
replace google.golang.org/genproto/googleapis/rpc => google.golang.org/genproto v0.0.0-20210126160654-44e461bb6506

// Link local backend module for shared proto imports
replace pc-remote-ctrl/backend => ../backend
