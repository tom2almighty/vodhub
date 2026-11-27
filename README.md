[English](README.en.md)

# vodhub

## 项目简介

基于 Go 与 React 构建的单二进制自托管 Mac CMS（苹果CMS）视频聚合与播放服务，内置视频源管理、并发流式搜索、相关性过滤、豆瓣推荐代理以及按源可选的 API 请求代理。

## 开发环境配置

环境要求：Go 1.26+、Node.js 22+、pnpm 12+。

1. 准备环境变量：

```bash
cp .env.example .env
```

必填项：`ADMIN_PASSWORD`（管理员密码）、`AUTH_SECRET`（32 位以上随机密钥）。可选配置 `ACCESS_PASSWORD`（普通访问密码，只读用户权限）与 `UPSTREAM_PROXY`（仅用于勾选 `useProxy` 的视频源 API 元数据请求，不代理视频播放）。

2. 启动后端（默认监听 `:3000`）：

```bash
go run ./cmd/vodhub
```

3. 启动前端开发服务器（默认监听 `:5173`，自动将 `/api` 代理至 `:3000`）：

```bash
cd web
pnpm install
pnpm dev
```

## 构建与部署

构建单二进制可执行文件（前端产物自动嵌入二进制）：

```bash
cd web && pnpm install && pnpm build && cd ..
CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/vodhub ./cmd/vodhub
./bin/vodhub
```

Docker Compose 部署（编辑 `compose.yaml` 后启动）：

```bash
docker compose up -d
```

容器使用绑定挂载 `./data:/app/data` 持久化视频源配置（`sources.json`），默认服务端口 `3000`。

## 开源许可证

本项目采用 [AGPL-3.0](LICENSE) 许可证。
