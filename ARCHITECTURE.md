# Architecture & Best Practices

> "Bad programmers worry about the code. Good programmers worry about data structures." - Linus Torvalds

这个项目展示了如何构建**有品味**的 gRPC + MQTT 系统。每个设计决策都基于 Linus 的核心哲学。

## 核心原则

### 1. "好品味" - 消除特殊情况

**坏代码:**
```go
// 特殊情况满天飞
if id == "" {
    // create logic
} else {
    if exists {
        // update logic
    } else {
        // error handling
    }
}
```

**好代码:**
```go
// 清晰分离，无特殊情况
func CreateDevice(req *CreateRequest) (*CreateResponse, error)
func UpdateDevice(req *UpdateRequest) (*UpdateResponse, error)
```
→ 见 `backend/internal/home/service_improved.go`

### 2. 数据结构第一

**坏品味:** 复杂的过滤逻辑
```go
for _, d := range devices {
    if len(idsSet) > 0 { if _, ok := idsSet[d.ID]; !ok { continue } }
    if type != "" && d.Type != type { continue }
    // 继续嵌套...
}
```

**好品味:** 组合式过滤器
```go
filter := NewCompositeFilter(
    NewIDFilter(ids),
    TypeFilter(deviceType),
    RoomFilter(room),
)
return FilterDevices(devices, filter)
```
→ 见 `backend/internal/home/filter.go`

### 3. "Never break userspace" - 向后兼容

- gRPC 服务保持向后兼容
- 配置文件支持默认值
- 优雅降级而非崩溃

### 4. 实用主义胜过理论

**删除了什么:**
- ❌ 嵌入式 MQTT broker（过度工程）
- ❌ 复杂的错误"恢复"逻辑（假装没事的垃圾）

**保留了什么:**
- ✅ gRPC/gRPC-Web（实际需要）
- ✅ MQTT 客户端（学习价值）
- ✅ 简单的文件存储（够用就行）

## 架构设计

```
Frontend (React) ──gRPC-Web──> Gateway (Go) ──MQTT──> Devices
                                    │
                                    └──> Storage (JSON)
```

### 组件职责

1. **Frontend**: 纯 UI，不包含业务逻辑
2. **Gateway**: gRPC 服务 + MQTT 客户端
3. **MQTT Broker**: 独立服务 (docker-compose)
4. **Storage**: 简单文件存储，可扩展

## 错误处理策略

### 分层错误处理

```go
// 存储层：返回明确错误
func (s *Storage) Get(id string) (*Device, error) {
    if not_found {
        return nil, ErrNotFound  // 明确的错误类型
    }
}

// 服务层：包装上下文
func (s *Service) GetDevice(ctx context.Context, id string) error {
    dev, err := s.storage.Get(id)
    if err == storage.ErrNotFound {
        return fmt.Errorf("device not found: %s", id)
    }
    if err != nil {
        return fmt.Errorf("storage error: %w", err)
    }
}
```

### 快速失败原则

```go
// 启动时检查关键依赖
if err := os.MkdirAll("data", 0755); err != nil {
    log.Fatalf("FATAL: cannot create data directory: %v", err)
}

// 不要假装一切正常
if err := devices.Load(); err != nil && !os.IsNotExist(err) {
    log.Fatalf("FATAL: corrupted storage: %v", err)
}
```

## MQTT 最佳实践

### 主题设计

```
devices/{device_id}/state      # 设备状态上报
devices/{device_id}/command    # 向设备发送命令
devices/{device_id}/config     # 设备配置更新
```

### 连接管理

```go
// 优雅降级：MQTT 不可用时系统仍可运行
if cfg.MqttURL != "" {
    client = mqtt.NewPaho(opts)
    if err := client.Connect(ctx); err != nil {
        log.Printf("warn: mqtt unavailable, using noop: %v", err)
        client = mqtt.NewNoop()  // 空实现，不会崩溃
    }
} else {
    client = mqtt.NewNoop()
}
```

## 开发工作流

### 1. 启动开发环境

```bash
# 启动所有服务（MQTT + 网关 + 前端）
make dev

# 或者单独启动 MQTT 用于调试
make mqtt
```

### 2. 调试 MQTT

```bash
# 监听所有 MQTT 消息
make mqtt-debug

# 发送测试消息
make mqtt-test
```

### 3. 原型开发循环

```bash
# 修改 proto 文件
vim proto/home/service.proto

# 重新生成代码
make proto-gen

# 测试
make test
```

## 代码审查检查清单

### ✅ 好品味指标

- [ ] 函数功能单一，无特殊情况
- [ ] 数据结构清晰，关系明确
- [ ] 错误处理明确，失败即停止
- [ ] 无嵌套超过 3 层的代码
- [ ] 变量命名简洁（`id` 不是 `deviceIdentifier`）

### ❌ 坏品味警告

- [ ] 有 `if (special_case)` 的代码
- [ ] 错误后还继续执行的逻辑
- [ ] 一个函数做多件事
- [ ] 超过 50 行的函数
- [ ] 过度抽象的"企业级"模式

## 部署建议

### 开发环境
```bash
docker-compose up
```

### 生产环境
- 使用外部 MQTT broker（如 AWS IoT）
- 添加 TLS 终止
- 配置日志聚合
- 监控 gRPC 指标

---

> "Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away." - Antoine de Saint-Exupéry

这个架构的美在于**简洁**。每个组件都有明确的职责，没有不必要的复杂性。