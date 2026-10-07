import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import apiApp from './server/app.mjs';
import { readEnvInt } from './server/lib/env.mjs';

// Resolve dist/ relative to this file, not the process CWD, so `node server.js`
// works from any working directory.
const distDir = join(dirname(fileURLToPath(import.meta.url)), 'dist');

const app = new Hono();

// Routes whose responses must not be buffered by compression:
//  - /api/search-stream is NDJSON meant to arrive incrementally
//  - /api/image already returns compressed image bytes
const SKIP_COMPRESSION = new Set(['/api/search-stream', '/api/image']);
const compressMiddleware = compress();

app.use('*', (c, next) => {
  if (SKIP_COMPRESSION.has(c.req.path)) return next();
  return compressMiddleware(c, next);
});

app.route('/', apiApp);

app.use('/assets/*', serveStatic({ root: distDir }));
app.use('*', serveStatic({ root: distDir }));

// SPA fallback for client-side routes
app.get('*', serveStatic({ root: distDir, path: 'index.html' }));

const port = readEnvInt(null, 'PORT', 3000);
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' });
console.log(`vodhub running on port ${port}`);
