import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { isAuthorized } from './lib/auth.mjs';
import * as auth from './routes/auth.mjs';
import * as site from './routes/site.mjs';
import * as search from './routes/search.mjs';
import * as detail from './routes/detail.mjs';
import * as play from './routes/play-session.mjs';
import * as douban from './routes/douban.mjs';
import * as image from './routes/image.mjs';

const PUBLIC_ROUTES = new Set(['/auth/login', '/auth/verify', '/site-config', '/health']);

export function createApp() {
  const app = new Hono().basePath('/api');

  app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }));

  app.use('*', async (c, next) => {
    const sub = c.req.path.replace(/^\/api/, '');
    if (PUBLIC_ROUTES.has(sub)) return next();
    if (!(await isAuthorized(c.req.raw, c.env))) {
      return c.json({ error: '未登录或登录已过期' }, 401);
    }
    return next();
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
    console.error('api error:', err);
    return c.json({ error: err instanceof Error ? err.message : '服务器错误' }, 500);
  });

  return app;
}

const app = createApp();
export default app;
