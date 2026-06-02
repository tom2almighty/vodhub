# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project

vodhub is a Mac CMS (苹果CMS) video-source aggregator: a React + Vite SPA backed by a [Hono](https://hono.dev/) API. It aggregates third-party CMS sources via [`@ouonnki/cms-core`](https://www.npmjs.com/package/@ouonnki/cms-core), proxies Douban for recommendations, and plays HLS streams. It has no database — auth is stateless and all per-user data lives in the browser. User-facing strings and error messages are Simplified Chinese; match that when adding UI text.

## Commands

`pnpm` is the package manager (no `npm`/`yarn`).

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Vite dev server on `:3000`, with the Hono API mounted as dev middleware |
| `pnpm build` | `tsc -b && vite build` → outputs SPA to `dist/` |
| `pnpm typecheck` | `tsc --noEmit` — the primary correctness gate |
| `pnpm prod` | `node server.js` — production Node server (serves `dist/` + API + SPA fallback) |
| `pnpm preview` | Vite static preview of `dist/` (no API) |

There are **no tests** and **no ESLint/Prettier** config. CI (`.github/workflows/docker-image.yml`) only runs `pnpm typecheck` then `pnpm build`; treat those two passing as the bar before considering work done.

## Architecture

### One Hono app, many thin adapters (the central pattern)

All API business logic lives in **`server/`** and is assembled into a single Hono app at `server/app.mjs` (`createApp()`, base path `/api`). Every deployment target is a 2–4 line shell that imports that app — **never duplicate route logic into an adapter**:

| Target | Entry | Mechanism |
| --- | --- | --- |
| Vercel | `app.mjs` | re-exports the Hono app as default |
| Cloudflare Pages | `functions/api/[[route]].mjs` | `hono/cloudflare-pages` `handle()` |
| Netlify | `netlify/edge-functions/api.mjs` | `hono/netlify` `handle()` |
| Node / Docker | `server.js` | `@hono/node-server` + `serveStatic` for `dist/` + SPA fallback |
| Local dev | `vite.config.ts` `honoApiPlugin` | Vite middleware that `ssrLoadModule`s `server/app.mjs` and bridges Node req/res ↔ Web `Request`/`Response` |

SPA history fallback (serve `index.html` for non-`/api` routes) is configured per-platform: `vercel.json` rewrites, `netlify.toml` redirects, and explicit handling in `server.js`.

### Cross-platform server constraints

`server/` code runs on **edge runtimes** (Cloudflare/Netlify) as well as Node, so it must use **Web-standard APIs only**: `fetch`, `ReadableStream`, `Request`/`Response`, and Web Crypto (`crypto.subtle`) — see the HMAC implementation in `server/lib/auth.mjs`. Read env via `server/lib/env.mjs` (`readEnv`/`readEnvInt`), which checks **both** the platform binding `c.env` (edge) **and** `process.env` (Node). Don't read `process.env` directly in route code.

### Auth

Stateless, single admin user, no sessions/DB. `POST /api/auth/login` compares the submitted password (constant-time) against `ADMIN_PASSWORD` and returns an HMAC-SHA256-signed token (`base64url(JSON {sub,iat,exp}) + "." + sig`, key = `AUTH_SECRET`). A global middleware in `server/app.mjs` enforces a `Bearer` token on every route **except** the `PUBLIC_ROUTES` set (`/auth/login`, `/auth/verify`, `/site-config`). The token may also arrive as `?token=` (used for the streaming/image endpoints). Client side: `src/lib/auth.ts` stores it in `localStorage` (persist) or `sessionStorage` (session) and `authFetch` attaches the header; `AuthProvider` + `ProtectedLayout` gate the SPA and redirect to `/login`.

### CMS aggregation & sources

`server/lib/cms.mjs` builds a `@ouonnki/cms-core` client (fetch adapter, direct proxy strategy, `SEARCH_CONCURRENCY`-bounded) and maps the library's `VideoItem`/detail shapes onto the app's flat `SearchResult` shape (see `src/lib/types.ts`). `server/lib/sources.mjs` loads source definitions from `SOURCES_URL` (remote JSON, 5-min in-memory cache) or `SOURCES_JSON` (inline), normalizing/validating each. `GET /api/search-stream` runs an aggregated search and streams results as **NDJSON** (`start`/`result`/`progress`/`complete`/`error` events) driven by the cms-core event emitter; the client (`src/lib/api/sources.ts` `searchStream`) parses the stream and **falls back to the non-streaming `GET /api/search`** if the streaming response isn't usable.

### Frontend layout

- `src/app/` — shell: `App.tsx` (React Router v7 routes, lazy pages, `motion` page transitions), `providers.tsx`, and layouts (`BareLayout` for `/login`, `ProtectedLayout` for everything else).
- `src/features/<name>/` — feature modules (`auth`, `home`, `search`, `douban`, `play`), each self-contained with `pages/`, `components/`, `hooks/`, `lib/`. **This is the primary unit of organization** — add feature code here, not in shared dirs.
- `src/components/` — cross-feature: `ui/` (shadcn/ui, `components.json`, zinc base, lucide icons), plus `media/`, `shell/`, `theme/`.
- `src/lib/` — `api/` (typed fetch wrappers over `apiJson`/`apiFetch`), `auth.ts`, `db.ts`, `query/` (TanStack Query client + centralized `keys.ts`), `hooks/`, `utils/`, `types.ts`.

### Client-side persistence (no server state)

`src/lib/db.ts` is a `localStorage`-backed store for **play records** (watch progress + history), **search history**, and a **recommendations cache**. It is version-gated (`CACHE_VERSION` — bump to invalidate old shapes) and broadcasts changes via custom DOM events (`playRecordsUpdated`, `searchHistoryUpdated`) that hooks subscribe to. TanStack Query seeds the recommendations cache from `db.ts` at startup (`src/lib/query/client.ts`).

### Play flow

Search/recommendation click → `POST /api/play-session` (`createPlaySession`) resolves candidate sources by `mode` (`direct` | `group` | `search`), picks the current source, and fetches episode URLs → the response is stashed in `sessionStorage` (`vodhub_play_session`) → navigate to `/play`. `PlayPage` rehydrates from that session, plays via `@vidstack/react` + `hls.js`, **persists progress to `db.ts` every 5s and on pause/`pagehide`/unmount**, resumes from saved time (>5s threshold), auto-advances episodes, and supports live source switching (carries over playback time).

## Conventions & gotchas

- **Path aliases**: `@/` → `src/`, `~/` → `public/`. Declared in `tsconfig.json` (types) **and** `vite.config.ts` (bundling) — update both.
- **`@ouonnki/cms-core` resolution workaround**: the package ships a broken `"development"` export pointing at a non-existent `src/`. `vite.config.ts` aliases `@ouonnki/cms-core` and `/m3u8` directly to their `dist/*.js` files and sets `resolve.conditions` to exclude `development`. Don't "simplify" this away.
- **Tailwind v4, CSS-first**: there is no `tailwind.config.js`. Config lives in `src/index.css` via `@import 'tailwindcss'` + `@theme inline`, which bridges shadcn CSS variables (`:root`/`.dark`) into Tailwind utilities. Dark mode via `next-themes`.
- **Required env**: `ADMIN_PASSWORD` and `AUTH_SECRET` (32+ random chars) must be set or auth returns 500; one of `SOURCES_URL`/`SOURCES_JSON` must be set or search returns empty. Optional: `SITE_NAME`, `AUTH_TOKEN_TTL`, `SEARCH_CONCURRENCY` (default 5, max 20). See `README.md` for the full table.
- **Build chunking**: `vite.config.ts` `manualChunks` splits `react-vendor`, `radix`, `motion`, `query` — keep large new deps out of the main bundle the same way.
