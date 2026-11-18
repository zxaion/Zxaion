// backend/src/index.js
// Entry point Worker: fetch & scheduled
import { buildContext } from './config/env.js';
import { routeRequest } from './router.js';
import { handleScheduled } from './services/r2Sync.js';

export default {
  // Cron trigger (wrangler.toml [triggers]): sinkron R2 -> D1 setiap jam.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(env));
  },

  async fetch(request, env, ctx) {
    const c = buildContext(request, env, ctx);

    // Preflight CORS dijawab sebelum routing, sama seperti versi lama.
    if (c.method === 'OPTIONS') {
      return new Response(null, { headers: c.corsHeaders });
    }

    return routeRequest(c);
  },
};
