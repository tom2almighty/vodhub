import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function honoApiPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'vodhub-hono-api-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();

        const origin = `http://${req.headers.host || 'localhost:3000'}`;
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        req.on('end', async () => {
          try {
            const mod = await server.ssrLoadModule('/server/app.mjs');
            const app = mod.default;
            const body = chunks.length ? Buffer.concat(chunks) : undefined;
            const request = new Request(new URL(req.url || '/', origin), {
              method: req.method,
              headers: req.headers as HeadersInit,
              body,
              // @ts-expect-error Node requires duplex for streamed/request bodies.
              duplex: body ? 'half' : undefined,
            });

            const webResp: Response = await app.fetch(request, env);
            res.statusCode = webResp.status;
            webResp.headers.forEach((value, key) => res.setHeader(key, value));
            if (!webResp.body) {
              res.end();
              return;
            }
            const reader = webResp.body.getReader();
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) res.write(Buffer.from(value));
            }
            res.end();
          } catch (err) {
            if (!res.headersSent) res.statusCode = 500;
            res.end(err instanceof Error ? err.message : 'api error');
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      tailwindcss(),
      honoApiPlugin(env),
      // PWA: generate a Workbox service worker that precaches the built app
      // shell so the SPA is installable and loads instantly. Everything else
      // (search/Douban/streams/images under /api) keeps hitting the network.
      VitePWA({
        registerType: 'autoUpdate',
        // Auto-inject the registration; no app code changes needed. New SW
        // self-activates (skipWaiting + clientsClaim) and the new build is
        // applied on the next full load/refresh.
        injectRegister: 'auto',
        // Keep the hand-maintained public/manifest.json (already linked in
        // index.html) as the single source of truth — don't generate one.
        manifest: false,
        workbox: {
          // Precache the app shell only.
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          // SPA fallback for client routes — but never answer /api requests
          // (auth, NDJSON search, m3u8/image proxy) with index.html; those
          // must always reach the Hono backend.
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
        },
        // The Hono dev middleware + Vite HMR own dev; don't register a SW
        // there (avoids stale caching while developing).
        devOptions: { enabled: false },
      }),
    ],
    server: {
      host: '0.0.0.0',
      port: 3000,
    },
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            hls: ['hls.js'],
            radix: [
              '@radix-ui/react-dialog',
              '@radix-ui/react-dropdown-menu',
              '@radix-ui/react-label',
              '@radix-ui/react-navigation-menu',
              '@radix-ui/react-popover',
              '@radix-ui/react-progress',
              '@radix-ui/react-scroll-area',
              '@radix-ui/react-separator',
              '@radix-ui/react-slot',
              '@radix-ui/react-tabs',
              '@radix-ui/react-tooltip',
            ],
            motion: ['motion'],
            query: ['@tanstack/react-query'],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': '/src',
        '~': '/public',
        // @ouonnki/cms-core has a broken "development" export pointing to non-existent src/.
        // The /m3u8 subpath must precede the bare alias — vite matches alias keys in order
        // and the bare key is a prefix of the subpath, so it would otherwise win and produce
        // `dist/index.js/m3u8`.
        '@ouonnki/cms-core/m3u8': '/node_modules/@ouonnki/cms-core/dist/m3u8/index.js',
        '@ouonnki/cms-core': '/node_modules/@ouonnki/cms-core/dist/index.js',
      },
      conditions: ['import', 'module', 'browser', 'default'],
    },
  };
});
