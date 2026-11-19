# ZXAION VERSE

Repository tunggal untuk frontend gallery dan Cloudflare Worker API.

## Status migrasi

Refactor berjalan bertahap di branch `refactor/modular-architecture`. Snapshot asli tersimpan di `legacy/original/`; kode aktif dimigrasikan bertahap tanpa mengubah kontrak browser/API.

- `legacy/original/`: snapshot file repository sebelum modularisasi. File backup memakai Git blob yang sama dengan file sumber.
- `frontend/index.html` dan `frontend/style.css`: aset aktif dengan URL dan isi lama.
- `frontend/script.js`: lapisan komposisi kompatibilitas yang mengimpor modul dari `frontend/src/`.
- `legacy/original/frontend/script.js`: salinan persis script monolitik sebelum ekstraksi.
- `frontend/src/app.js`: entry point esbuild yang membundle komposisi modul ke `frontend/dist/script.js`.
- `frontend/scripts/build.mjs`: membangun `frontend/dist/` dengan nama aset tetap: `index.html`, `style.css`, `script.js`, `quicklink.json`.
- `backend/src/index.js`: entry Wrangler yang me-re-export handler kompatibilitas dari `backend/worker.js`.
- `backend/src/router.js`: dispatcher HTTP dan komposisi route modules.
- `backend/worker.js`: adapter tipis untuk `fetch` dan `scheduled`, meneruskan request ke `backend/src/router.js`.

## Prasyarat

- Node.js 20 atau lebih baru
- npm
- Untuk backend: Wrangler dan akses ke konfigurasi Cloudflare yang sesuai

## Perintah

```bash
npm install
npm run build:frontend
npm run verify:frontend
npm test
npm run check
```

Hasil build berada di `frontend/dist/`. Nama file output dipertahankan agar jalur aset lama tetap cocok.

### Cloudflare Pages

Agar esbuild benar-benar dipakai saat deploy Pages, atur project Pages:

- Root directory: `/` (repository root).
- Build command: `npm install && npm run build:frontend`.
- Build output directory: `frontend/dist`.

`index.html` memuat `/script.js` sebagai ES module. Ini juga membuat source directory `frontend/` tetap dapat diuji langsung, sementara hasil `dist/` berisi bundle IIFE hasil esbuild. Jangan arahkan Pages ke `frontend/src/`.

Deploy backend Worker secara terpisah dari `backend/` memakai `backend/wrangler.toml`. Jangan mengubah binding atau production deployment sebelum smoke test Cloudflare staging.

## Kontrak integrasi yang dipertahankan

- Frontend API base: `https://ai.zxaionverse.workers.dev`
- Asset browser: `/style.css`, `/script.js`, dan `/quicklink.json`
- Worker entry: `backend/src/index.js`
- D1 binding: `DB`
- R2 bindings: `Zxaion_B`, `ZX_BUCKET`, `TREASURE`
- PayPal secrets: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET_ID`, `PAYPAL_WEBHOOK_ID`
- Kontrak DOM/global dan endpoint lama didokumentasikan di `docs/architecture.md`.

## Batasan verifikasi

Pemeriksaan lokal/CI memvalidasi build, aset, dan kontrak statis. Integrasi nyata D1/R2/PayPal memerlukan environment Cloudflare dan kredensial yang tidak disimpan di repository. Jangan menganggap deployment produksi sudah tervalidasi hanya dari keberhasilan build.
