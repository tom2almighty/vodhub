[中文](README.md)

# vodhub

## Overview

A single-binary, self-hosted Mac CMS video aggregator and player built with Go and React, featuring built-in source management, concurrent streaming search, relevance filtering, Douban recommendation proxy, and optional per-source API request proxying.

## Development Setup

Requirements: Go 1.26+, Node.js 22+, pnpm 12+.

1. Prepare environment variables:

```bash
cp .env.example .env
```

Required variables: `ADMIN_PASSWORD` and `AUTH_SECRET` (32+ random characters). Optional: `ACCESS_PASSWORD` (shared viewer password) and `UPSTREAM_PROXY` (applied only to API metadata requests for sources with `useProxy` enabled; playback streams always connect directly from the browser).

2. Start the Go backend (default `:3000`):

```bash
go run ./cmd/vodhub
```

3. Start the Vite frontend dev server (default `:5173`, proxying `/api` to `:3000`):

```bash
cd web
pnpm install
pnpm dev
```

## Build & Deployment

Build the self-contained single binary with embedded frontend assets:

```bash
cd web && pnpm install && pnpm build && cd ..
CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/vodhub ./cmd/vodhub
./bin/vodhub
```

Docker Compose deployment (configure `compose.yaml` first):

```bash
docker compose up -d
```

Source configuration (`sources.json`) is persisted via the bind mount `./data:/app/data`. Default listening port is `3000`.

## License

Licensed under [AGPL-3.0](LICENSE).
