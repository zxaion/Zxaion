# Architecture and integration audit

## Existing runtime (baseline)

### Frontend

- Static entry: `frontend/index.html`
- Stylesheet: `/style.css`
- Browser script: `/script.js`
- Quick links data: `/quicklink.json`
- API origin configured in the legacy application: `https://ai.zxaionverse.workers.dev`
- Important global entry points: `window.refreshImages`, `window.changeCategory`, `window.openAnimeCollection`
- HTML contains 106 ID declarations in the inspected baseline. Two IDs are duplicated (`mobile-search-bar`, `category-nav`); this is recorded as a pre-existing audit finding, not silently altered during a no-regression refactor.

### Worker route contract

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/admin/sync` | Admin-triggered R2/D1 sync |
| POST | `/api/paypal/webhook` | PayPal webhook |
| GET | `/api/list` | Main gallery listing |
| GET | `/api/comitbase/list` | Comitbase listing |
| GET | `/api/dtreasure/list` | DTreasure listing |
| GET | `/api/trending` | Trending images |
| GET | `/api/stats/:id` | Image stats |
| POST | `/api/view/:id` | Record view |
| POST | `/api/download/:id` | Record download |
| GET | `/api/credits/balance` | Credit balance |
| POST | `/api/credits/purchase` | Credit purchase |
| POST | `/api/credits/spend` | Spend credits |
| GET | `/api/img/:key` | Main R2 media |
| GET | `/api/comitbase/img/:key` | Comitbase R2 media |
| GET | `/api/dtreasure/img/:key` | DTreasure R2 media |

OPTIONS is handled globally for CORS. Static assets are served by the Worker fallback from the main R2 bucket.

### Cloudflare bindings and configuration

- Worker name: `ai`; entry aktif `src/index.js` me-re-export default handler dari `../worker.js` sebagai lapisan kompatibilitas. Binding dan cron tidak berubah.
- D1: `DB` -> database `zxwallpaper`.
- R2: `Zxaion_B` -> `zxaionverse`; `ZX_BUCKET` -> `zx-cloud2`; `TREASURE` -> `d-treasures`.
- Cron: `0 * * * *`.
- Runtime secrets read by Worker: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET_ID`, `PAYPAL_WEBHOOK_ID`, `ADMIN_TOKEN`.

### Persistence entities referenced in Worker SQL

The current Worker refers to `images`, `rate_limits`, `payment_orders`, `user_credits`, `views`, `downloads`, and `purchased_images`. Database migrations/schema are not present in the current tracked repository snapshot; verify the live D1 schema before changing queries or deploying a new backend entry.


## Modules extracted in the current branch

### Frontend modules now active through the esbuild bundle

- `src/config/app.config.js`: API base, category/album data, credit packs, legacy image maps, logo, and icon maps.
- `src/core/state.js`: `AppState` and the shared state instance.
- `src/core/elements.js`: DOM element references keyed to the existing HTML IDs.
- `src/services/session.service.js`: legacy anonymous visitor token storage/format.
- `src/services/api.service.js`: gallery, statistics, trending, credits, and anime album data operations.
- `src/services/ads.service.js`: AdSense slot and in-feed behavior.
- `src/ui/ui.service.js`: gallery rendering, modals, pagination, category/search, and credit UI.
- `src/utils/helpers.js`: escaping, shuffle, debounce, number formatting, and count parsing.
- `src/app.js` remains the esbuild entry; it bundles the active application into the legacy `/script.js` URL.

### Backend modules now used by the Worker

- `src/services/r2-sync.service.js`: R2 metadata parsing and scheduled R2-to-D1 sync.
- `src/services/paypal.service.js`: PayPal OAuth access-token and order-verification requests.
- `src/middleware/cors.js`: existing CORS origin/header policy.
- `src/middleware/auth.js`: existing `X-User-Token` reader and anonymous fallback.
- `src/middleware/rate-limit.js`: existing D1 fixed-window rate limiter and fail-open behavior.
- `src/routes/health.js`: `GET /api/health`.
- `src/routes/admin.js`: `POST /api/admin/sync`.
- `src/routes/trending.js`: `GET /api/trending`.
- `src/routes/stats.js`: `GET /api/stats/:id`.
- `src/routes/gallery.js`: main, Comitbase, and DTreasure gallery listings.
- `src/routes/activity.js`: view/download tracking and credit balance.
- `src/routes/paypal.js`: PayPal webhook signature verification and event handling.
- `src/routes/credits.js`: credit purchase verification and credit spending.
- `src/routes/media.js`: R2 image delivery, DTREASURE authorization, and download headers.
- `src/routes/static.js`: R2 static assets, SPA fallback, and HTML security headers.
- `src/index.js` remains the Wrangler entry and re-exports the Worker handler while the remaining route handlers are extracted.

Route business logic has been extracted from `backend/worker.js`; the Worker retains request-scoped dependency setup and method/path dispatch. D1 repositories are still embedded in route handlers and remain a future separation step.

## Transitional build

`frontend/src/app.js` imports the untouched legacy script. esbuild emits one browser bundle at `frontend/dist/script.js`; HTML, CSS, and quicklink JSON are copied byte-for-byte. This establishes a reproducible build without changing the browser URL contract.

## Planned target boundaries

1. Frontend: config -> core state/DOM/events -> API services -> feature modules (gallery, anime, Comitbase, DTreasure, ranking, payments) -> UI components.
2. Backend: Worker entry -> CORS/context/router -> route handlers -> domain services -> D1 repositories/R2 adapters.
3. Keep the route and DOM contracts above until parity/integration tests explicitly authorize a change.

## Migration gates

- Extract one feature/domain at a time; retain original source in `legacy/original/`.
- Add behavior tests before switching the active import.
- Compare all route methods, response shapes, status codes, CORS behavior, R2 range behavior, and PayPal webhook verification.
- Validate against a staging Worker + staging D1/R2 before production deployment.
- Never deploy automatically from this branch.
