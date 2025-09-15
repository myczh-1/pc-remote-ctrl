module pc-remote-ctrl/backend

go 1.23.0

toolchain go1.24.7

require (
    github.com/eclipse/paho.mqtt.golang v1.4.3
    github.com/mochi-co/mqtt v2.4.0+incompatible
    google.golang.org/grpc v1.75.0
    google.golang.org/protobuf v1.36.8
)

require (
	github.com/cenkalti/backoff/v4 v4.1.1 // indirect
	github.com/desertbit/timer v0.0.0-20180107155436-c41aec40b27f // indirect
	github.com/improbable-eng/grpc-web v0.15.0 // indirect
	github.com/klauspost/compress v1.11.7 // indirect
	github.com/rs/cors v1.7.0 // indirect
	golang.org/x/net v0.43.0 // indirect
	golang.org/x/sys v0.35.0 // indirect
	golang.org/x/text v0.28.0 // indirect
	// avoid split genproto imports ambiguity
	google.golang.org/genproto/googleapis/rpc v0.0.0-20210126160654-44e461bb6506 // indirect
	nhooyr.io/websocket v1.8.6 // indirect
)

// force split path to monorepo to avoid ambiguity with older deps
replace google.golang.org/genproto/googleapis/rpc => google.golang.org/genproto v0.0.0-20210126160654-44e461bb6506

// link local cloud-middleware module so agent can import its generated protos
// cloud-middleware removed in this branch
