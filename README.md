# ZXAION VERSE

Repository tunggal untuk frontend gallery dan Cloudflare Worker API.

## Status migrasi

Refactor berjalan bertahap di branch `refactor/modular-architecture`. File produksi lama tetap dipertahankan; tidak ada penghapusan atau penggantian fitur dalam tahap fondasi ini.

- `legacy/original/`: snapshot file repository sebelum modularisasi. File backup memakai Git blob yang sama dengan file sumber.
- `frontend/script.js`, `frontend/index.html`, `frontend/style.css`: implementasi aktif lama yang tetap menjadi sumber kompatibilitas selama migrasi.
- `frontend/src/app.js`: entry point esbuild sementara yang mengimpor implementasi lama. Pemisahan modul fitur dilakukan bertahap setelah kontrak UI/API diuji.
- `frontend/scripts/build.mjs`: membangun `frontend/dist/` dengan nama aset tetap: `index.html`, `style.css`, `script.js`, `quicklink.json`.
- `backend/src/index.js`: entry Worker stabil yang me-re-export implementasi lama dari `backend/worker.js`. `wrangler.toml` kini menunjuk ke entry baru; implementasi fetch/scheduled lama tetap utuh.

## Prasyarat

- Node.js 20 atau lebih baru
- npm
- Untuk backend: Wrangler dan akses ke konfigurasi Cloudflare yang sesuai

## Perintah

```bash
npm install
npm run build:frontend
npm run verify:frontend
npm run check
```

Hasil build berada di `frontend/dist/`. Nama file output dipertahankan agar jalur aset lama tetap cocok. Upload hasil build ke R2 hanya setelah hasil verifikasi dan pengujian deployment staging disetujui.

## Kontrak integrasi yang dipertahankan

- Frontend API base: `https://ai.zxaionverse.workers.dev`
- Asset browser: `/style.css`, `/script.js`, dan `/quicklink.json`
- Worker entry: `backend/worker.js`
- D1 binding: `DB`
- R2 bindings: `Zxaion_B`, `ZX_BUCKET`, `TREASURE`
- PayPal secrets: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET_ID`, `PAYPAL_WEBHOOK_ID`
- Kontrak DOM/global dan endpoint lama didokumentasikan di `docs/architecture.md`.

## Batasan verifikasi

Pemeriksaan lokal/CI memvalidasi build, aset, dan kontrak statis. Integrasi nyata D1/R2/PayPal memerlukan environment Cloudflare dan kredensial yang tidak disimpan di repository. Jangan menganggap deployment produksi sudah tervalidasi hanya dari keberhasilan build.
