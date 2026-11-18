// backend/test/smoke.mjs
// Smoke test tanpa jaringan: CORS preflight, static serving, dan 404 untuk API tak dikenal.
// Jalankan dari folder backend: npm test
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const ORIGIN = 'https://zxaionverse.com';
const BASE = 'https://ai.zxaionverse.workers.dev';

// R2 palsu: hanya mengembalikan objek jika key ada.
const fakeR2 = (files) => ({
  get: async (key) => {
    if (!(key in files)) return null;
    return { body: files[key], httpEtag: '"etag"', writeHttpMetadata() {} };
  },
});

const env = {
  DB: { prepare() { throw new Error('DB tidak boleh disentuh di smoke test'); } },
  Zxaion_B: fakeR2({ 'index.html': '<!doctype html>', 'js/main.js': 'console.log(1)' }),
  ZX_BUCKET: fakeR2({}),
  TREASURE: fakeR2({}),
};
const ctx = { waitUntil() {} };
const call = (path, init = {}) => worker.fetch(new Request(BASE + path, init), env, ctx);

// 1. CORS preflight dari origin yang diizinkan
{
  const res = await call('/api/list', { method: 'OPTIONS', headers: { Origin: ORIGIN } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  console.log('ok  preflight CORS');
}

// 2. Root -> index.html dari R2
{
  const res = await call('/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type'), /text\/html/);
  console.log('ok  GET / -> index.html');
}

// 3. Modul JS disajikan dengan MIME yang benar
{
  const res = await call('/js/main.js');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type'), /javascript/);
  console.log('ok  GET /js/main.js');
}

// 4. Asset yang tidak ada -> 404 (tidak jatuh ke index.html)
{
  const res = await call('/js/missing.js');
  assert.equal(res.status, 404);
  console.log('ok  asset hilang -> 404');
}

// 5. Path /api/ yang tidak dikenal -> 404
{
  const res = await call('/api/tidak-ada');
  assert.equal(res.status, 404);
  console.log('ok  API tak dikenal -> 404');
}

console.log('\nSmoke test selesai.');
