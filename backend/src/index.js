
import { handleScheduled, handleR2QueueBatch } from './services/r2Sync.js';
import { handleRequest } from './router.js';

// ============================================================
// Export default — fetch + scheduled + queue (real-time R2 events)
// ============================================================
export default {

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(env));
  },

  async queue(batch, env, ctx) {
    await handleR2QueueBatch(batch, env);
  },

  // FIX: ctx sebagai parameter ke-3 — wajib untuk ctx.waitUntil()
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};
