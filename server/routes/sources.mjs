import { loadSources } from '../lib/sources.mjs';

/**
 * Read-only source list for the client-side preference panel. Upstream URLs are
 * deliberately omitted — they can contain credentials.
 */
export async function listSources(c) {
  const sources = await loadSources(c.env);
  return c.json({
    items: sources.map((s) => ({ id: s.id, name: s.name, isEnabled: s.isEnabled })),
  });
}
