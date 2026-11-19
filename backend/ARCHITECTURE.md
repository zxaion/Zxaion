# Backend modularization plan

The deployed entry is now `src/index.js`, a compatibility entry that re-exports the untouched default Worker from `../worker.js`. `wrangler.toml` changes only its `main` path; bindings and cron configuration remain unchanged. This creates a stable seam for incremental route/service extraction.

Already extracted and active:

- `src/index.js` stable Wrangler entry re-exporting the compatibility Worker.
- `src/services/r2-sync.service.js` for metadata parsing and scheduled R2 sync.
- `src/services/paypal.service.js` for OAuth and order lookup.
- `src/middleware/cors.js`, `auth.js`, and `rate-limit.js` for existing middleware behavior.
- `src/routes/health.js` and `src/routes/admin.js` for the first route handlers.

Still in `worker.js`: PayPal webhook, gallery listing, trending, stats, view/download, credits, media delivery, and static fallback routes.

Target extraction order for remaining routes:

1. `src/index.js`: fetch/scheduled composition.
2. `src/middleware/cors.js` and `src/middleware/rate-limit.js`.
3. `src/routes/`: preserve the complete method/path contract in `../docs/architecture.md`.
4. `src/services/`: R2 synchronization, image metadata, gallery queries, credits, PayPal.
5. `src/repositories/`: D1 statements grouped by images, credits, payments, and analytics.
6. Switch `wrangler.toml` only after parity tests prove that the modular Worker matches the original.

Do not copy snippets into active handlers without first tracing their shared helpers, SQL transaction boundaries, error responses, and Cloudflare bindings. The original Worker is retained in `legacy/original/backend/worker.js`.
