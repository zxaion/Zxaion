import { handleScheduled } from './services/r2Sync.js';
import { handleRequest } from './router.js';

// ============================================================
// Export default — fetch + scheduled
// ============================================================
export default {

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(env));
  },

  // FIX: ctx sebagai parameter ke-3 — wajib untuk ctx.waitUntil()
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};
