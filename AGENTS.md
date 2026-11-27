# AGENTS.md

This file provides guidance when working with code in this repository.

## Project

vodhub is a single-binary self-hosted Mac CMS (苹果CMS) video aggregator built with a Go standard-library backend (`cmd/vodhub`, `internal/`) and an embedded React + Vite + Tailwind CSS v4 + Shadcn (`base-nova`) frontend (`web/`). Video source configurations are persisted in `DATA_DIR/sources.json`, while watch history, search history, and temporary per-source toggles stay isolated per browser in `localStorage`. User-facing copy and error messages are Simplified Chinese.

## Commands

### Backend (Go)

| Command | Purpose |
| --- | --- |
| `go run ./cmd/vodhub` | Run Go API + embedded SPA server on `:3000` |
| `go vet ./...` | Static analysis |
| `go test ./...` | Run Go unit tests |
| `CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/vodhub ./cmd/vodhub` | Build single self-contained binary (embeds `web/dist`) |

### Frontend (`web/`, pnpm pinned to `12.9.1`)

| Command | Purpose |
| --- | --- |
| `pnpm --dir web dev` | Vite dev server on `:5173`, proxying `/api` to `http://127.0.0.1:3000` |
| `pnpm --dir web check` | `biome check .` — lint + format check |
| `pnpm --dir web typecheck` | `tsc --noEmit` |
| `pnpm --dir web build` | `tsc --noEmit && vite build` → outputs to `web/dist` |

## Architecture

- `cmd/vodhub/main.go` — entrypoint, `log/slog` JSON logger, source store bootstrap, graceful HTTP shutdown.
- `internal/config/` — environment and optional `.env` loader.
- `internal/auth/` — HMAC-SHA256 tokens, dual-role password auth (`ADMIN_PASSWORD` → `admin`, optional `ACCESS_PASSWORD` → `viewer`), IP login rate limiter.
- `internal/store/` — thread-safe atomic JSON persistence (`DATA_DIR/sources.json`), OuonNkiTV/LunaTV parser, merge strategies.
- `internal/cms/` — native Go MacCMS client (concurrent streaming search, relevance scoring/filtering, `vod_play_url` parsing, per-source optional `UPSTREAM_PROXY` for API metadata only, and real/fake-search probing).
- `internal/douban/` — Douban recommendations & category proxy with bounded singleflight TTL cache.
- `internal/proxy/` — image proxy with host allowlist, DNS-resolved private/loopback/metadata IP blocking, redirect re-validation, and 8 MB body cap.
- `internal/server/` — Go 1.22+ `http.ServeMux` routing, role middleware, structured JSON logs, unified `{ code, message }` error envelope, gzip compression (excluding `/api/search-stream` and `/api/image`), and `embed.FS` SPA fallback.
- `web/` — `embed.go` + Vite/React SPA (`src/pages/`, `src/components/`, `src/hooks/`, `src/lib/`).

## Key Invariants

- **Dual roles**: `ADMIN_PASSWORD` grants `admin` access (`/sources` & `/api/admin/*`); optional `ACCESS_PASSWORD` grants `viewer` access (temporary browser-local source overrides only, `/api/admin/*` returns `403`).
- **Browser-local user data**: Watch history, search history, and temporary source overrides live in each browser's `localStorage` so shared viewer sessions never mix.
- **API-only proxy**: `UPSTREAM_PROXY` + per-source `useProxy` only proxy MacCMS JSON API calls; video streams always play directly from the browser.
- **Shadcn / Base UI**: `web/components.json` uses `style: "base-nova"`. Put `isolate z-50` on Base UI `Positioner`, not `Popup`.
