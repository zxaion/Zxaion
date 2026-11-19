/**
 * Stable Cloudflare Worker adapter.
 * Request routing lives in src/router.js; scheduled R2 sync stays isolated
 * in its service module. Keep wrangler.toml pointed at src/index.js.
 */
import { handleScheduled } from "./src/services/r2-sync.service.js";
import { handleRequest } from "./src/router.js";

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(env));
  },

  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};
