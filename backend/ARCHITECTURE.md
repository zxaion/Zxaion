# Backend modularization plan

The deployed entry is now `src/index.js`, a compatibility entry that re-exports the untouched default Worker from `../worker.js`. `wrangler.toml` changes only its `main` path; bindings and cron configuration remain unchanged. This creates a stable seam for incremental route/service extraction.

Already extracted and active:

- `src/index.js` stable Wrangler entry re-exporting the compatibility Worker.
- `src/router.js` owns HTTP dispatch and composes route modules.
- `src/services/r2-sync.service.js` for metadata parsing and scheduled R2 sync.
- `src/services/paypal.service.js` for OAuth and order lookup.
- `src/middleware/cors.js`, `auth.js`, and `rate-limit.js` for existing middleware behavior.
- `src/routes/health.js`, `admin.js`, `trending.js`, `stats.js`, `gallery.js`, `activity.js`, `paypal.js`, `credits.js`, `media.js`, and `static.js` for extracted route handlers.

`worker.js` is now a thin Cloudflare adapter for `fetch` and `scheduled`; `src/router.js` wires Cloudflare bindings, constructs request-scoped services, applies global OPTIONS/CORS handling, and dispatches method/path pairs to route modules. D1 query/repository extraction remains a separate next phase.

Target extraction order for remaining backend internals:

1. Extract D1 query groups into repositories for images, credits, payments, and analytics.
2. Keep PayPal webhook verification and payment claim/crediting semantics covered by integration tests.
3. Add contract tests for R2 Range requests, content metadata, CORS, and static fallback.
4. Keep `src/index.js` as the only Wrangler entry and avoid changing binding names.

Do not copy snippets into active handlers without first tracing their shared helpers, SQL transaction boundaries, error responses, and Cloudflare bindings. The original Worker is retained in `legacy/original/backend/worker.js`.
