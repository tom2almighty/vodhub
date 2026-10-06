import { createClient, mapItem } from '../lib/cms.mjs';
import { loadSources } from '../lib/sources.mjs';

export async function search(c) {
  const query = (c.req.query('q') || '').trim();
  if (!query) return c.json({ error: '缺少搜索关键词' }, 400);
  return c.json(await aggregate(query, c.env));
}

export function searchStream(c) {
  const env = c.env;
  const query = (c.req.query('q') || '').trim();
  if (!query) return c.json({ error: '缺少搜索关键词' }, 400);

  const signal = c.req.raw.signal;
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      try {
        const sources = (await loadSources(env)).filter((s) => s.isEnabled);
        send({ type: 'start', totalSources: sources.length });
        if (sources.length === 0) {
          send({ type: 'complete', totalResults: 0, completedSources: 0 });
          close();
          return;
        }

        const cms = createClient(env);
        let total = 0;
        const unsubResult = cms.on('search:result', (e) => {
          const items = e.items.map(mapItem);
          total += items.length;
          send({
            type: 'result',
            items,
            sourceKey: e.source?.id || '',
            sourceName: e.source?.name || '',
          });
        });
        const unsubProgress = cms.on('search:progress', (e) => {
          send({ type: 'progress', completed: e.completed, total: e.total });
        });

        try {
          await cms.aggregatedSearch(query, sources, 1, signal);
        } finally {
          unsubResult();
          unsubProgress();
        }
        send({ type: 'complete', totalResults: total, completedSources: sources.length });
        close();
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : '搜索失败' });
        close();
      }
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function aggregate(query, env) {
  const sources = (await loadSources(env)).filter((s) => s.isEnabled);
  if (!query || sources.length === 0) {
    return { items: [], totalSources: sources.length, completedSources: 0 };
  }
  const cms = createClient(env);
  const raw = await cms.aggregatedSearch(query, sources, 1);
  return {
    items: raw.map(mapItem),
    totalSources: sources.length,
    completedSources: sources.length,
  };
}
