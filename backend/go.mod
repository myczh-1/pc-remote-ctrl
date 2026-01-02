module pc-remote-ctrl/backend

go 1.24.4

toolchain go1.24.7

require (
	github.com/eclipse/paho.mqtt.golang v1.4.3
	github.com/improbable-eng/grpc-web v0.15.0
	github.com/mochi-mqtt/server/v2 v2.4.0
	golang.org/x/net v0.43.0
	google.golang.org/grpc v1.75.0
	google.golang.org/protobuf v1.36.8
	modernc.org/sqlite v1.30.1
	pc-remote-ctrl/cloud-middleware v0.0.0-00010101000000-000000000000
)

require (
	github.com/cenkalti/backoff/v4 v4.1.1 // indirect
	github.com/desertbit/timer v0.0.0-20180107155436-c41aec40b27f // indirect
	github.com/dustin/go-humanize v1.0.1 // indirect
	github.com/golang/protobuf v1.5.4 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/gorilla/websocket v1.5.0 // indirect
	github.com/hashicorp/golang-lru/v2 v2.0.7 // indirect
	github.com/klauspost/compress v1.11.7 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/ncruces/go-strftime v0.1.9 // indirect
	github.com/remyoudompheng/bigfft v0.0.0-20230129092748-24d4a6f8daec // indirect
	github.com/rs/cors v1.7.0 // indirect
	github.com/rs/xid v1.4.0 // indirect
	golang.org/x/sync v0.16.0 // indirect
	golang.org/x/sys v0.35.0 // indirect
	golang.org/x/text v0.28.0 // indirect
	google.golang.org/genproto v0.0.0-20210126160654-44e461bb6506 // indirect
	modernc.org/gc/v3 v3.0.0-20240107210532-573471604cb6 // indirect
	modernc.org/libc v1.52.1 // indirect
	modernc.org/mathutil v1.6.0 // indirect
	modernc.org/memory v1.8.0 // indirect
	modernc.org/strutil v1.2.0 // indirect
	modernc.org/token v1.1.0 // indirect
	nhooyr.io/websocket v1.8.6 // indirect
)

// Unify split path: map submodule path to root module at same commit to avoid ambiguity
replace google.golang.org/genproto/googleapis/rpc => google.golang.org/genproto v0.0.0-20210126160654-44e461bb6506

// Prevent pulling split submodule versions that collide
exclude google.golang.org/genproto/googleapis/rpc v0.0.0-20250707201910-8d1bb00bc6a7

exclude google.golang.org/genproto/googleapis/rpc v0.0.0-20250818200422-3122310a409c

// link local cloud-middleware module so agent can import its generated protos
replace pc-remote-ctrl/cloud-middleware => ../cloud-middleware
