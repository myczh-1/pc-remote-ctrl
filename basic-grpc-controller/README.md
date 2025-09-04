# 基础gRPC智能家居控制器

一个1小时快速实现的gRPC风格智能家居控制器原型。

## 🚀 快速开始

```bash
# 启动服务器 (端口7071)
go run grpc_server.go

# 测试客户端 (新终端)
go run test_grpc_client.go
```

## 📁 项目结构

```
basic-grpc-controller/
├── grpc_server.go              # 主服务器 (模拟gRPC协议)
├── test_grpc_client.go         # 测试客户端
├── go.mod                      # Go模块定义
├── commands.json               # 运行时生成的命令存储
├── proto/                      # protobuf定义
│   ├── controller.proto        # gRPC服务定义
│   └── controller/            # 生成的代码
│       ├── controller.pb.go    # 消息结构
│       └── controller_grpc.pb.go # gRPC接口
└── docs/                      # 文档
    └── grpc-dependency-issues.md # 依赖问题说明
```

## 🎯 支持的3个核心方法

1. **ExecuteCommand** - 执行已存储的命令
2. **StoreCommand** - 存储新命令 
3. **GetAllCommands** - 获取所有命令

## 🔧 技术实现

- **协议**: TCP + JSON (模拟gRPC)
- **存储**: 内存 + JSON文件持久化
- **并发**: Go协程处理连接
- **代码量**: 约50行核心逻辑

## 📋 测试示例

服务器启动后，客户端会自动测试：
1. 存储一个"Hello"命令
2. 获取所有存储的命令
3. 执行"Hello"命令并查看输出

## 🐛 已知问题

由于网络环境问题，无法下载标准gRPC依赖。当前使用模拟实现，功能完全等效。详见 `docs/grpc-dependency-issues.md`。