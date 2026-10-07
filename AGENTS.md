# AGENTS.md

This file provides guidance when working with code in this repository.

## Project

vodhub is a Mac CMS (苹果CMS) video-source aggregator: a React + Vite SPA backed by a [Hono](https://hono.dev/) API. It aggregates third-party CMS sources via [`@ouonnki/cms-core`](https://www.npmjs.com/package/@ouonnki/cms-core), proxies Douban for recommendations, and plays HLS streams. It has no database — auth is stateless and all per-user data lives in the browser. User-facing strings and error messages are Simplified Chinese; match that when adding UI text.

## Commands

`pnpm` is the package manager (no `npm`/`yarn`).

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Vite dev server on `:3000`, with the Hono API mounted as dev middleware |
| `pnpm build` | `tsc -b && vite build` → outputs SPA to `dist/` |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm check` | `biome check .` — lint + format check |
| `pnpm lint` / `pnpm format` | Biome lint only / format and rewrite |
| `pnpm prod` | `node server.js` — production Node server (serves `dist/` + API + SPA fallback) |
| `pnpm preview` | Vite static preview of `dist/` (no API) |

There are **no tests**. Linting/formatting is [Biome](https://biomejs.dev/) (`biome.json`) — there is no ESLint or Prettier. Note `tsc` only covers `src/` (see `tsconfig.json` `include`), so `server/*.mjs` is **not** type-checked; `node --check <file>` is the cheapest syntax gate for it.

CI (`.github/workflows/docker-image.yml`) runs `pnpm check` → `pnpm typecheck` → `pnpm build` in a `verify` job on pushes to `main`/`master` and on PRs. Treat those three passing as the bar before considering work done. The `release` and `docker` jobs are gated on a `v*` tag and only publish artifacts.

## Architecture

### One Hono app, many thin adapters (the central pattern)

All API business logic lives in **`server/`** and is assembled into a single Hono app at `server/app.mjs` (`createApp()`, base path `/api`). Every deployment target is a 2–4 line shell that imports that app — **never duplicate route logic into an adapter**:

| Target | Entry | Mechanism |
| --- | --- | --- |
| Vercel | `api/index.mjs` | Exports `default { fetch }` — Vercel's Web Standard handler, which Vercel documents as the integration point for Hono. `vercel.json` rewrites `/api/:path*` → `/api/index?__vodhub_route=:path*` and the adapter rebuilds `url.pathname` from that query param before handing the request to the app. Vercel also supports bracket filenames (`api/[...route].mjs`) for dynamic segments, but this repo deliberately uses the single-file + rewrite form. |
| Cloudflare Pages | `functions/api/[[route]].mjs` | `hono/cloudflare-pages` `handle()`; `public/_routes.json` scopes `/api/*` to Functions. Build params are set in the Dashboard. |
| Netlify | `netlify/edge-functions/api.mjs` | `hono/netlify` `handle()`; routed via `netlify.toml`. |
| Node / Docker | `server.js` | `@hono/node-server` + `serveStatic` for `dist/` + SPA fallback. `dist/` is resolved relative to the module, not the CWD. |
| Local dev | `vite.config.ts` `honoApiPlugin` | Vite middleware that `ssrLoadModule`s `server/app.mjs` and bridges Node req/res ↔ Web `Request`/`Response`. Sets `duplex: 'half'` when forwarding a body. |

SPA history fallback (serve `index.html` for non-`/api` routes) is configured per-platform: `vercel.json` rewrites, `netlify.toml` redirects, and explicit handling in `server.js`.

### Cross-platform server constraints

`server/` code runs on **edge runtimes** (Cloudflare/Netlify) as well as Node, so it must use **Web-standard APIs only**: `fetch`, `ReadableStream`, `Request`/`Response`, and Web Crypto (`crypto.subtle`) — see the HMAC implementation in `server/lib/auth.mjs`. Read env via `server/lib/env.mjs` (`readEnv`/`readEnvInt`), which checks **both** the platform binding `c.env` (edge) **and** `process.env` (Node). Don't read `process.env` directly in route code.

Shared helpers — reuse these instead of re-rolling them per route:

- `server/lib/http.mjs` — `COMMON_UA`, `createTimeoutSignal` (timeout chained to an upstream signal, with an explicit `dispose()`), `fetchWithTimeout`, `readCappedBody`, `hostMatches`, `isBlockedHost`.
- `server/lib/cache.mjs` — `createCache()`: a **bounded** TTL + LRU cache with in-flight dedup. Always give it a `maxEntries`; an unbounded map keyed by request parameters is a memory-growth vector.
- `server/lib/ratelimit.mjs` — `createRateLimiter()`, `clientIp()`.

In-memory caches are **per-isolate** on edge runtimes: a miss just costs an extra upstream fetch, never incorrect behaviour. Don't rely on them for correctness.

`app.onError` must **not** return `err.message` to clients, and must pass `HTTPException` through via `err.getResponse()` — overriding `onError` without that turns framework-raised 4xx into 500s. Authenticated JSON responses get `private, no-store` from the auth middleware unless a route sets its own directive (the image proxy and the Douban routes do).

### Auth

Stateless, single admin user, no sessions/DB. `POST /api/auth/login` compares the submitted password (constant-time) against `ADMIN_PASSWORD` and returns an HMAC-SHA256-signed token (`base64url(JSON {sub,iat,exp}) + "." + sig`, key = `AUTH_SECRET`). A global middleware in `server/app.mjs` enforces a `Bearer` token on every route **except** the `PUBLIC_ROUTES` set (`/auth/login`, `/auth/verify`, `/site-config`, `/health`). The token may also arrive as `?token=` (used for the streaming/image endpoints).

Login is rate-limited to 10 attempts per 5 minutes per IP (429 + `Retry-After`), with the counter cleared on success; the counters are in-memory, so on edge runtimes the effective limit is per-isolate. `verifyAuthToken` requires exactly two `.`-separated segments — keep it strict.

Client side: `src/lib/auth.ts` stores the token in `localStorage` (persist) or `sessionStorage` (session) and `authFetch` attaches the header; `AuthProvider` + `ProtectedLayout` gate the SPA and redirect to `/login`. `verify()` returns `'valid' | 'invalid' | 'error'` and **only `'invalid'` ends the session** — never treat a network failure as a bad token.

### CMS aggregation & sources

`server/lib/cms.mjs` builds a `@ouonnki/cms-core` client (fetch adapter, direct proxy strategy, `SEARCH_CONCURRENCY`-bounded) and maps the library's `VideoItem`/detail shapes onto the app's flat `SearchResult` shape (see `src/lib/types.ts`). `server/lib/sources.mjs` loads source definitions from `SOURCES_URL` (remote JSON, TTL-cached, TTL configurable) or `SOURCES_JSON` (inline), normalizing/validating each. It serves the last known-good list when the upstream fails and retries after a short backoff — **never cache a transient failure for the full TTL**, that silently disables search for the whole window.

`GET /api/search-stream` runs an aggregated search and streams results as **NDJSON** (`start`/`result`/`progress`/`complete`/`error` events) driven by the cms-core event emitter; the `complete` event reports the sources that actually completed, not the number requested. `enqueue` must stay wrapped in try/catch — a client disconnect throws there, and an unguarded throw propagates into cms-core's event handler, which catches and logs, silently losing every later event. The client (`src/lib/api/sources.ts` `searchStream`) parses the stream and **falls back to the non-streaming `GET /api/search`** if the streaming response isn't usable.

### Image proxy

`GET /api/image` is the only route that fetches an arbitrary URL on the caller's behalf, so its guards are load-bearing: a host allowlist (douban domains, extendable via `IMAGE_PROXY_ALLOWED_HOSTS`), private/loopback/link-local/metadata address blocking, **re-validation of the final URL after redirects**, an 8 MB body cap, and an explicit response-header allowlist. Don't relax any of these to "make an image load".

### Frontend layout

- `src/app/` — shell: `App.tsx` (React Router v7 routes, lazy pages, CSS entrance animation), `providers.tsx`, and layouts (`BareLayout` for `/login`, `ProtectedLayout` for everything else).
- `src/features/<name>/` — feature modules (`auth`, `home`, `search`, `douban`, `play`), each self-contained with `pages/`, `components/`, `hooks/`, `lib/`. **This is the primary unit of organization** — add feature code here, not in shared dirs.
- `src/components/` — cross-feature: `ui/` (shadcn/ui, `components.json`, **base-nova** style + **neutral** base colour, lucide icons), plus `media/`, `shell/`, `theme/`.
- `src/lib/` — `api/` (typed fetch wrappers over `apiJson`/`apiFetch`), `auth.ts`, `db.ts`, `query/` (TanStack Query client + centralized `keys.ts`), `hooks/`, `utils/`, `types.ts`.

### Client-side persistence (no server state)

`src/lib/db.ts` is a `localStorage`-backed store for **play records** (watch progress + history), **search history**, and two timestamped caches (**recommendations**, **Douban categories**). All four are version-gated on `CACHE_VERSION` — bump it to invalidate old shapes. The play-record and search-history mutators **return a boolean** for write success so callers can surface a full quota instead of silently dropping data; play records are capped at the 200 most recent.

Updates broadcast through custom DOM events (`playRecordsUpdated`, `searchHistoryUpdated`) that hooks subscribe to, and a module-level `storage` listener re-broadcasts them when another tab changes the store — the custom events alone never cross tabs.

TanStack Query does **not** seed these at module load. Hooks that have a disk cache read it via `initialData` (see `useRecommendations`), which the default `gcTime` can't evict before first render. `resetQueryCache()` in `src/lib/query/client.ts` clears the cache when a session ends.

### Play flow

Search/recommendation click → `POST /api/play-session` (`createPlaySession`) resolves candidate sources by `mode` (`direct` | `group` | `search`), picks the current source, and fetches episode URLs → the response is stashed in `sessionStorage` (`vodhub_play_session`) → navigate to `/play`. `PlayPage` rehydrates from that session, plays via `@vidstack/react` + `hls.js` (**lazily imported** — the player chunk is only fetched once there is a stream URL), **persists progress to `db.ts` every 5s and on pause/`pagehide`/unmount**, resumes from saved time (>5s threshold), auto-advances episodes, and supports live source switching.

Source switching aborts the previous request, carries a sequence number so a superseded response is discarded, and disables the source buttons while pending — keep all three, or clicking two sources quickly can leave you on the wrong one. The switching overlay is cleared as soon as we know there are no episodes, since the player never mounts in that case.

## Conventions & gotchas

- **Path aliases**: `@/` → `src/`, `~/` → `public/`. Declared in `tsconfig.json` (types) **and** `vite.config.ts` (bundling) — update both.
- **`@ouonnki/cms-core` resolution workaround**: the package ships a broken `"development"` export pointing at a non-existent `src/`. `vite.config.ts` aliases the bare specifier directly to its `dist/index.js` and sets `resolve.conditions` to exclude `development`. Only the server imports it (through `ssrLoadModule` in dev, and directly under Node in production), so it is not part of the client bundle. Don't "simplify" this away.
- **shadcn components are the official `base-nova` sources.** `components.json` declares `style: "base-nova"` (Base UI) and `baseColor: "neutral"`; changing the style makes `pnpm exec shadcn add …` pull Radix components into a Base UI codebase. `src/index.css` imports `shadcn/tailwind.css` for the `data-open:` / `data-active:` / `data-disabled:` custom variants the components rely on. Registry-only `cn-*` marker classes and `IconPlaceholder` are not portable — substitute a concrete utility or a lucide icon.
- **Base UI puts positioning on the `Positioner`, not the `Popup`.** `Popup` is statically positioned, so a `z-*` class on it does nothing and the popup paints below any positive-z-index sibling (this is why the theme menu sat under the `z-40` navbar). Put `isolate z-50` on the `Positioner`.
- **Tailwind v4, CSS-first**: there is no `tailwind.config.js`. Config lives in `src/index.css` via `@import 'tailwindcss'` + `@theme inline`, which bridges shadcn CSS variables (`:root`/`.dark`) into Tailwind utilities. Entrance animations are `@theme` keyframes (`animate-fade-in`, `animate-fade-in-up`) rather than a JS animation library, so the global `prefers-reduced-motion` rule covers them. Dark mode via `next-themes`; `index.html` carries an inline FOUC guard that must stay in sync with `ThemeProvider`.
- **Official `base-nova` `Badge` has a fixed `h-5`** sized for `text-xs`. A call site that wants `text-sm` or extra padding must opt out with `h-auto`, otherwise the text is clipped by the badge's `overflow-hidden`.
- **Required env**: `ADMIN_PASSWORD` and `AUTH_SECRET` (32+ random chars) must be set or auth returns 500; one of `SOURCES_URL`/`SOURCES_JSON` must be set or search returns empty. Optional: `SITE_NAME`, `SITE_ANNOUNCEMENT`, `SITE_ANNOUNCEMENT_TITLE`, `AUTH_TOKEN_TTL`, `SEARCH_CONCURRENCY` (default 5, max 20), `IMAGE_PROXY_ALLOWED_HOSTS`, `SOURCES_CACHE_TTL_MS`, `SOURCES_RETRY_MS`, `SOURCES_FETCH_TIMEOUT_MS`. See `README.md` for the full table.
- **Build chunking**: `vite.config.ts` `manualChunks` splits `react-vendor`, `hls`, `base-ui`, `query` — keep large new deps out of the main bundle the same way. The player (`VidstackPlayer`) and every route are lazy chunks. The PWA precaches **all** JS, including the lazy chunks, so a new heavy chunk is downloaded in the background on first visit even if it's off the critical path.
