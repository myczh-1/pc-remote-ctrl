# PC Remote Control - Cloud Middleware

云端中间件服务，用于远程访问本地 PC 控制器。

## 功能特性

- 🔐 用户认证 (集成 tinyauth)  
- 🔄 请求转发 (gRPC-Web ↔ gRPC)
- 📱 设备管理 (注册/状态监控)
- 💾 内存缓存 (可扩展至 Redis)

## 架构

```
Frontend -> Cloud Middleware -> Local Agent
           ↑
    tinyauth 认证
```

## 开发

```bash
# 启动服务
go run cmd/server/main.go

# 构建
go build -o cloud-middleware cmd/server/main.go
```

## 部署

支持 Docker 部署，配合 tinyauth 提供完整的认证和转发服务。