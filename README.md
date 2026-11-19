# ZXAION VERSE

Satu repo, dua bagian: `backend/` (Cloudflare Worker) dan `frontend/` (HTML/CSS/JS).

## Struktur
```
backend/
  wrangler.toml          main = src/index.js
  src/
    index.js             entry: fetch + scheduled (cron)
    router.js            CORS preflight -> route -> static fallback
    context.js           variabel per-request
    routes/index.js      TABEL ROUTE (semua endpoint)
    routes/*.js          handler: health, admin, paypalWebhook, gallery, stats, credits, media, static
    services/            paypal, rateLimit, imageMeta, r2Sync
    config/              constants, packs, mimeTypes, security
    utils/               cors, userToken
frontend/
  scripts/build.mjs      src/ -> dist/
  src/
    index.html           shell + <!-- @include partials/... -->
    partials/            layout/, sections/, modals/
    css/                 00..12 (urutan cascade)
    js/                  config, core, modules, services, ui, events, integrations, app
    manifest.json        URUTAN file css & js di bundle
    quicklink.json
  dist/                  hasil build (di-gitignore)
```

## Alur kerja
- Frontend: edit `frontend/src`, jalankan `npm run build:frontend`, upload isi `frontend/dist` ke R2 `zxaionverse` (key tetap: index.html, style.css, script.js, quicklink.json).
- Backend: `npm run dev:backend` / `npm run deploy:backend`.

## Menambah sesuatu
- Endpoint: buat handler di `backend/src/routes/`, daftarkan di `routes/index.js`.
- File JS: buat di `frontend/src/js/...`, daftarkan di `manifest.json` SETELAH file yang dipakainya.
- HTML: buat partial, panggil `<!-- @include partials/xxx.html -->`.
