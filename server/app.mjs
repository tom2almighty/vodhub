import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { isAuthorized } from './lib/auth.mjs';
import * as auth from './routes/auth.mjs';
import * as detail from './routes/detail.mjs';
import * as douban from './routes/douban.mjs';
import * as image from './routes/image.mjs';
import * as play from './routes/play-session.mjs';
import * as search from './routes/search.mjs';
import * as site from './routes/site.mjs';

const PUBLIC_ROUTES = new Set(['/auth/login', '/auth/verify', '/site-config', '/health']);

export function createApp() {
  const app = new Hono().basePath('/api');

  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400,
    }),
  );

  app.use('*', async (c, next) => {
    const sub = c.req.path.replace(/^\/api/, '');
    if (PUBLIC_ROUTES.has(sub)) return next();
    if (!(await isAuthorized(c.req.raw, c.env))) {
      return c.json({ error: '未登录或登录已过期' }, 401);
    }
    await next();
    // Authenticated payloads must never be stored by a shared cache. Routes that
    // set their own directive (image proxy, Douban) win.
    if (!c.res.headers.has('Cache-Control')) {
      c.header('Cache-Control', 'private, no-store');
    }
  });

  app.post('/auth/login', auth.login);
  app.get('/auth/verify', auth.verify);
  app.get('/health', (c) => c.json({ ok: true }));
  app.get('/site-config', site.siteConfig);
  app.get('/search-stream', search.searchStream);
  app.get('/search', search.search);
  app.get('/detail', detail.detail);
  app.post('/play-session', play.playSession);
  app.get('/recommendations', douban.recommendations);
  app.get('/douban/category', douban.category);
  app.get('/douban/categories', douban.categories);
  app.get('/image', image.imageProxy);

  app.onError((err, c) => {
    // Framework-raised responses (404/405, malformed request, ...) must pass
    // through untouched instead of being flattened into a 500.
    if (err instanceof HTTPException) return err.getResponse();
    console.error('api error:', err);
    // Never return upstream/internal error text to the client.
    return c.json({ error: '服务器内部错误' }, 500);
  });

  return app;
}

const app = createApp();
export default app;
