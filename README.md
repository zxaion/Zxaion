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
- `backend/worker.js`: router kompatibilitas; middleware, service, serta route handler health/admin/gallery/stats/trending/activity sudah dipindahkan ke `backend/src/`.

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

Hasil build berada di `frontend/dist/`. Nama file output dipertahankan agar jalur aset lama tetap cocok. Upload hasil build ke R2 hanya setelah hasil verifikasi dan pengujian deployment staging disetujui.

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
