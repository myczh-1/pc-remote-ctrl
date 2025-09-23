# Cloud Middleware – Roadmap & TODO

当前状态（已合入）
- gRPC/Proto：GatewayService（前端入口），AgentService（Register/Heartbeat），TunnelService（占位）。源文件：
  - proto/cloud/gateway.proto（go_package=pc-remote-ctrl/cloud-middleware/proto/cloud;cloudpb）
  - proto/cloud/agent.proto（go_package 同上）
- 代码骨架：
  - gRPC + gRPC-Web 启动：cloud-middleware/cmd/server/main.go（开放 CORS；h2c 支持 application/grpc 直连）。
  - 路由与转发：cloud-middleware/internal/server/gateway.go（设备流/请求 → 后端 HomeService）。
  - 注册与心跳：cloud-middleware/internal/server/agent.go（内存注册表 TTL）。
  - 隧道占位：cloud-middleware/internal/server/tunnel.go（接口在位、回 ERROR）。
  - 注册表与拨号：
    - cloud-middleware/internal/registry/memory.go（device_id→{addr,conn,ttl}，支持默认上游）
    - cloud-middleware/internal/executor/dialer.go（backoff+keepalive）
- 后端自动注册：backend/cmd/home-gateway/main.go（CLOUD_ADDR / AGENT_DEVICE_ID / HOME_GRPC_ADDR）。
- 前端：
  - 切换本地/云端，云端设置（Endpoint、Agent ID）：frontend/src/App.tsx, frontend/src/components/Topbar.tsx, frontend/src/components/CloudSettings.tsx
  - 云端 API Hook：frontend/src/hooks/useCloudApi.ts（与 useHomeApi 形态一致）。
  - Vite 开发代理：/cloud → 7073（frontend/vite.config.ts）。

环境变量（现阶段）
- 云端：
  - GRPC_PORT=7073
  - DEFAULT_BACKEND_ADDR=127.0.0.1:7071（可选回落）
  - AGENT_SECRET=（占位，当前未强制）
- 后端（自动注册）：
  - CLOUD_ADDR=127.0.0.1:7073
  - AGENT_DEVICE_ID=dev1
  - HOME_GRPC_ADDR=127.0.0.1:7071
- 前端：
  - 本地使用 Vite 代理，无需额外配置。生产由 Nginx/网关转发 /cloud → 云端 7073。

---

优先级路线图（P0 → P2）

P0 稳定直连链路（已完成/收尾）
- [x] h2c 直连修复（application/grpc 分支 → grpcServer）。
- [x] 后端自动注册与心跳，断线重试。
- [x] 前端云端模式切换与设置面板。
- [ ] 文档与样例命令（见下）。

P1 反向隧道（NAT 友好）
- 云端数据面实现：cloud-middleware/internal/server/tunnel.go
  - 多路复用：corr_id 关联一次调用生命周期（OPEN/DATA/CLOSE/ERROR）。
  - 方法路由：OPEN.method 为目标 gRPC 方法（如 /remote_control.home.HomeService/InvokeAction）。
  - 超时与背压：请求超时、窗口/限速、连接断线重连。
- 后端 Agent 客户端：backend/internal/cloud/tunnel_client.go（新增）
  - 启动时连接云端 TunnelService.Open，维持双向流。
  - 将 HomeService 的入站请求从帧反解并调用本地 gRPC，再把响应/流事件编码回帧。
- Gateway 选择：
  - 路由策略优先级：隧道连接存在 → 走隧道；否则直连（或 DEFAULT_BACKEND_ADDR）。
- 错误语义：
  - 开放式错误映射，保留 gRPC Status.Code；网关仅在路由失败时返回 NotFound/Unavailable。

P1 安全与鉴权（tiny auth 接入）
- 前端（GatewayService）：
  - gRPC Unary/Stream 拦截器读取 `Authorization: Bearer <token>`，调用 tiny auth 校验（本地库或 introspection/JWKS）。
  - 配置：AUTH_MODE=tiny、TINY_AUTH_...（待对接你的 tiny auth 具体接口）。
- 设备（AgentService）：
  - Register/Heartbeat 校验 AGENT_SECRET（MVP 全局；后续支持 per-device secret 或 token）。
  - 失败返回 codes.Unauthenticated。
- CORS：开发期 `*`；生产白名单域名。

P1 持久化与多实例
- 注册表持久化：Redis（cloud/internal/registry/redis.go）
  - 键：device:{id} → {addr, meta, updated_at}，TTL 驱逐。
  - Conn 不持久化，隧道连接在内存中。
- 云端多实例：
  - Gateway 层无状态（直连模式可共享）；隧道需“黏住”同一实例（可通过 agent 连接时的租约/一致性哈希）。

P2 可观测性与运维
- 日志结构化：zap/slog，统一 request_id、device_id、corr_id。
- Metrics：Prometheus（连接数、路由命中、转发时延、错误码分布）。
- Tracing：OpenTelemetry（从前端→云端→后端链路）。
- 健康检查与探针：/healthz、/readyz。
- 速率限制与保护：IP/设备级限流、最大并发、消息大小上限。

---

前端改进清单
- 云端设置增强：
  - 保存/显示当前连接状态；Agent ID 选择器（列表来自云端 ListAgents，后续提供 API）。
  - Token 输入与存储（待 tiny auth）。
- BLE 配网流程：
  - 组件 DeviceCreateModal 目前内部用本地 HomeService；改为从 App 注入 `api`，支持云端路径。
- 错误展示统一：API 错误码/消息提示，重试提示。
- Lint 与健壮性：npm run lint，修复潜在类型告警。

---

测试计划（建议）
- Go 单元测试：
  - registry（TTL/GC/并发）、gateway（直连路由、WatchDevices 流转发）、agent（参数校验）。
  - 反向隧道完成后：帧编解码、断线重连、背压。
- 集成测试（可选）：
  - 本地起后端、云端，脚本注册 → Gateway 调用 → 断开/恢复。
- 前端：
  - 目前无测试框架，先以手动流程 + lint 为主。

---

部署与配置
- Docker 镜像与 Compose：
  - cloud-middleware：暴露 7073，环境变量见上；可挂载 Redis（若启用持久化）。
  - backend：本地网络，配置 CLOUD_ADDR 指向云端地址。
- 生产建议：
  - 启用 TLS/mTLS（cloud-public listener→TLS；agent 内网也可 TLS）。
  - 明确 CORS allowlist。
  - 使用 JWT/tiny auth 做前端鉴权，设备侧使用 per-device secret 或长期 token。

---

校验清单（E2E 手动）
1) 直连模式：
   - make dev-cloud
   - CLOUD_ADDR=127.0.0.1:7073 AGENT_DEVICE_ID=dev1 HOME_GRPC_ADDR=127.0.0.1:7071 make dev-backend
   - make dev-frontend → 切“云端”→ 齿轮设置：Endpoint=/cloud，Agent ID=dev1
   - 列表/事件/动作正常。
2) 回落模式：
   - DEFAULT_BACKEND_ADDR=127.0.0.1:7071 make dev-cloud
   - 前端云端设置 Agent ID 为空 → 功能可用。
3) 断线重连：
   - 停后端→恢复，心跳重注册成功；前端流自动重连（指数退避）。

---

里程碑与验收标准
- M1（直连生产可用）：
  - 自动注册/心跳稳定；前端全链路云端可用；基础日志与监控。
- M2（NAT 支持）：
  - 隧道数据面落地；路由优先级；压测 200 并发设备、消息可靠性通过。
- M3（安全完善）：
  - tiny auth 对接完成；CORS/限流/速率保护；mTLS。
- M4（运维健壮）：
  - Redis 持久化、云端多实例；指标/报警；部署脚本。

---

附：常用命令
- 生成 proto：`make proto-gen`
- 启动云端：`make dev-cloud`
- 启动后端（自动注册）：`CLOUD_ADDR=127.0.0.1:7073 AGENT_DEVICE_ID=dev1 HOME_GRPC_ADDR=127.0.0.1:7071 make dev-backend`
- 前端：`make dev-frontend`
- 手动注册（备用）：
  - `grpcurl -plaintext -d '{"device_id":"dev1","home_grpc_addr":"127.0.0.1:7071","ttl_sec":120}' localhost:7073 remote_control.cloud.v1.AgentService/Register`
  - `grpcurl -plaintext -d '{"device_id":"dev1"}' localhost:7073 remote_control.cloud.v1.AgentService/Heartbeat`

