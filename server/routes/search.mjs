import { createClient, mapItem } from '../lib/cms.mjs';
import { loadSources } from '../lib/sources.mjs';

const MAX_QUERY_LENGTH = 100;

function readQuery(c) {
  return (c.req.query('q') || '').trim().slice(0, MAX_QUERY_LENGTH);
}

export async function search(c) {
  const query = readQuery(c);
  if (!query) return c.json({ error: '缺少搜索关键词' }, 400);
  return c.json(await aggregate(query, c.env, c.req.raw.signal));
}

export function searchStream(c) {
  const env = c.env;
  const query = readQuery(c);
  if (!query) return c.json({ error: '缺少搜索关键词' }, 400);

  const signal = c.req.raw.signal;
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      let closed = false;

      const send = (event) => {
        if (closed) return false;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          return true;
        } catch {
          // The client disconnected and the stream was cancelled. Swallow it and
          // stop emitting: throwing here would propagate into cms-core's event
          // handler, which catches and logs — losing every later event.
          closed = true;
          return false;
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed or errored — nothing to do.
        }
      };

      try {
        const sources = (await loadSources(env)).filter((s) => s.isEnabled);
        if (!send({ type: 'start', totalSources: sources.length })) return;

        if (sources.length === 0) {
          send({ type: 'complete', totalResults: 0, completedSources: 0 });
          close();
          return;
        }

        const cms = createClient(env);
        let total = 0;
        let completed = 0;
        let sawProgress = false;

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
          sawProgress = true;
          completed = e.completed;
          send({ type: 'progress', completed: e.completed, total: e.total });
        });

        try {
          await cms.aggregatedSearch(query, sources, 1, signal);
        } finally {
          unsubResult();
          unsubProgress();
        }

        // Report the real number of sources that came back, not the number we
        // asked for — the previous value disagreed with the last progress event.
        send({
          type: 'complete',
          totalResults: total,
          completedSources: sawProgress ? completed : sources.length,
        });
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
      // Ask nginx-fronted proxies not to buffer, so events stream incrementally.
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function aggregate(query, env, signal) {
  const sources = (await loadSources(env)).filter((s) => s.isEnabled);
  if (!query || sources.length === 0) {
    return { items: [], totalSources: sources.length, completedSources: 0 };
  }
  const cms = createClient(env);
  const raw = await cms.aggregatedSearch(query, sources, 1, signal);
  return {
    items: raw.map(mapItem),
    totalSources: sources.length,
    completedSources: sources.length,
  };
}
