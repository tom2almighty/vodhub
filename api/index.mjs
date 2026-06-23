import { handle } from 'hono/vercel';
import app from '../server/app.mjs';

export const config = { runtime: 'edge' };

const handler = handle(app);

function requestForRoute(request) {
  const url = new URL(request.url);
  const route = url.searchParams.get('__vodhub_route');
  if (!route) return request;

  url.pathname = `/api/${route}`;
  url.searchParams.delete('__vodhub_route');
  return new Request(url, request);
}

export default {
  fetch(request) {
    return handler(requestForRoute(request));
  },
};
