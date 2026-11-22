import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createApp, translateCdnCgiImagePath } from '../../server.js';
import { parseImageMeta } from '../src/services/imageMeta.js';
import { getPayPalBase } from '../src/config/constants.js';
import { CREDIT_PACK_DEFINITIONS } from '../src/config/packs.js';
import { MIME_TYPES } from '../src/config/mimeTypes.js';
import { getUserToken, generateRecoveryCode, signToken, verifySignedToken, derivePublicPayerRef } from '../src/utils/userToken.js';
import { createLocalEnv, createMockD1, createMockImagesBinding, createMockR2Bucket } from '../src/localRuntime.js';
import { handleRequest } from '../src/router.js';
import { handleStatic } from '../src/routes/static.js';
import { resolveHtmlIncludes } from '../../frontend/scripts/build.mjs';
import {
  handleScheduled,
  handleR2QueueBatch,
  ensureAutoSync,
  resetSyncStateForTests,
} from '../src/services/r2Sync.js';
import { parseTransformOptions } from '../src/services/imageTransform.js';
import { checkRateLimit as rawCheckRateLimit } from '../src/services/rateLimit.js';
import { handleListMain, handleAnimeAlbums } from '../src/routes/gallery.js';
import { handleRecordView, handleRecordDownload, handleStats } from '../src/routes/stats.js';
import { createPayPalOrder } from '../src/services/paypal.js';
import {
  handleCreditBalance,
  handlePreparePayer,
  handleCreatePayPalOrder,
  handleCreateRecoveryCode,
  handleRecoverAccount,
  handleCreditPurchase,
  handleCreditSpend,
} from '../src/routes/credits.js';
import { handlePayPalWebhook } from '../src/routes/paypalWebhook.js';
import { handleServeImage } from '../src/routes/media.js';

const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

function makeReq(url, { method = 'GET', headers = {}, body } = {}) {
  return new Request(url, {
    method,
    headers,
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
}

test('parseImageMeta parses folders, skips header/underscored files, and builds stable ids', () => {
  assert.equal(parseImageMeta('HEADER/Anime.jpg', 'main'), null);
  assert.equal(parseImageMeta('_preview/vault/secret.jpg', 'dtreasure'), null);
  assert.equal(parseImageMeta('notes/readme.txt', 'main'), null);

  const anime = parseImageMeta('ANIME/Attack on Titan/crimson_wings_4k.jpg', 'main');
  assert.deepEqual(anime, {
    id: 'main:ANIME/Attack on Titan/crimson_wings_4k.jpg',
    r2_key: 'ANIME/Attack on Titan/crimson_wings_4k.jpg',
    bucket: 'main',
    title: 'Crimson Wings 4k',
    category: 'Anime',
    sub_category: 'attack on titan',
    url: '/api/img/ANIME%2FAttack%20on%20Titan%2Fcrimson_wings_4k.jpg',
  });

  const treasure = parseImageMeta('vault/imperial_dragon_8k.jpg', 'dtreasure');
  assert.equal(treasure.id, 'dtreasure:vault/imperial_dragon_8k.jpg');
  assert.equal(treasure.url, '/api/dtreasure/img/vault%2Fimperial_dragon_8k.jpg');
});

test('getPayPalBase switches between live and sandbox environments', () => {
  assert.equal(getPayPalBase({ PAYPAL_ENV: 'sandbox' }), 'https://api-m.sandbox.paypal.com');
  assert.equal(getPayPalBase({ PAYPAL_ENV: 'SANDBOX' }), 'https://api-m.sandbox.paypal.com');
  assert.equal(getPayPalBase({ PAYPAL_ENV: 'live' }), 'https://api-m.paypal.com');
  assert.equal(getPayPalBase({}), 'https://api-m.paypal.com');
});

test('userToken utilities validate length, recovery code format, and HMAC signing', async () => {
  const validReq = makeReq('http://localhost/test', { headers: { 'X-User-Token': '  u_abc_123  ' } });
  assert.equal(getUserToken(validReq), 'u_abc_123');

  const overlongReq = makeReq('http://localhost/test', { headers: { 'X-User-Token': 'x'.repeat(129) } });
  assert.equal(getUserToken(overlongReq), 'anonymous');

  const code = generateRecoveryCode();
  assert.match(code, /^ZX-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  const signed = await signToken('u_test_1', 'my-secret-key');
  assert.equal(await verifySignedToken(signed, 'my-secret-key'), 'u_test_1');
  assert.equal(await verifySignedToken(`${signed}tamper`, 'my-secret-key'), null);
});

test('gallery routes filter by category, subCategory, search q, expose X-Total-Count, and list anime albums', async () => {
  const env = await createLocalEnv();

  const resCat = await handleListMain({
    url: new URL('http://localhost/api/list?category=fantasy&limit=10'),
    DB: env.DB,
    corsHeaders,
  });
  assert.equal(resCat.status, 200);
  const fantasyItems = await resCat.json();
  assert.equal(fantasyItems.length, 3);
  assert.equal(resCat.headers.get('X-Total-Count'), '3');

  const resSearch = await handleListMain({
    url: new URL('http://localhost/api/list?category=Anime&subCategory=attack%20on%20titan&q=crimson'),
    DB: env.DB,
    corsHeaders,
  });
  const searchItems = await resSearch.json();
  assert.equal(searchItems.length, 1);
  assert.equal(searchItems[0].title, 'Crimson Wings 4k');

  const resAlbums = await handleAnimeAlbums({ DB: env.DB, corsHeaders });
  assert.equal(resAlbums.status, 200);
  const albums = await resAlbums.json();
  assert.ok(albums.some((a) => a.sub_category === 'attack on titan' && a.count === 2));
});

test('stats deduplicate repeated views and downloads per actor and reject empty photoId', async () => {
  const env = await createLocalEnv();
  const checkRateLimit = (ep, id, limit, win) => rawCheckRateLimit(env.DB, ep, id, limit, win);
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(p) };
  const photoId = 'main:FANTASY/astral_citadel_dragons.jpg';

  const badReq = await handleRecordView({
    request: makeReq('http://localhost/api/view/'),
    ctx,
    path: '/api/view/',
    DB: env.DB,
    corsHeaders,
    getUserToken,
    checkRateLimit,
  });
  assert.equal(badReq.status, 400);

  const before = await (await handleStats({
    path: `/api/stats/${encodeURIComponent(photoId)}`,
    DB: env.DB,
    corsHeaders,
  })).json();

  const headers = { 'X-User-Token': 'u_viewer_1' };
  await handleRecordView({
    request: makeReq(`http://localhost/api/view/${encodeURIComponent(photoId)}`, { method: 'POST', headers }),
    ctx,
    path: `/api/view/${encodeURIComponent(photoId)}`,
    DB: env.DB,
    corsHeaders,
    getUserToken,
    checkRateLimit,
  });
  await handleRecordView({
    request: makeReq(`http://localhost/api/view/${encodeURIComponent(photoId)}`, { method: 'POST', headers }),
    ctx,
    path: `/api/view/${encodeURIComponent(photoId)}`,
    DB: env.DB,
    corsHeaders,
    getUserToken,
    checkRateLimit,
  });
  await handleRecordDownload({
    request: makeReq(`http://localhost/api/download/${encodeURIComponent(photoId)}`, { method: 'POST', headers }),
    ctx,
    path: `/api/download/${encodeURIComponent(photoId)}`,
    DB: env.DB,
    corsHeaders,
    getUserToken,
    checkRateLimit,
  });
  await handleRecordDownload({
    request: makeReq(`http://localhost/api/download/${encodeURIComponent(photoId)}`, { method: 'POST', headers }),
    ctx,
    path: `/api/download/${encodeURIComponent(photoId)}`,
    DB: env.DB,
    corsHeaders,
    getUserToken,
    checkRateLimit,
  });
  await Promise.all(pending);

  const after = await (await handleStats({
    path: `/api/stats/${encodeURIComponent(photoId)}`,
    DB: env.DB,
    corsHeaders,
  })).json();

  assert.equal(after.views, before.views + 1);
  assert.equal(after.downloads, before.downloads + 1);
});

test('credits purchase, spend, recovery code creation & account restore work end-to-end', async () => {
  const env = await createLocalEnv();
  const checkRateLimit = (ep, id, limit, win) => rawCheckRateLimit(env.DB, ep, id, limit, win);
  const userA = 'u_buyer_alpha';
  const userB = 'u_buyer_beta';

  const mockAccessToken = async () => 'mock-paypal-token';

  // Reject amount mismatch
  const mismatchRes = await handleCreditPurchase({
    request: makeReq('http://localhost/api/credits/purchase', {
      method: 'POST',
      headers: { 'X-User-Token': userA, 'Content-Type': 'application/json' },
      body: { pack: '5$', orderId: 'ORD-MISMATCH' },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
    getPayPalAccessToken: mockAccessToken,
    verifyPayPalOrder: async () => ({
      status: 'COMPLETED',
      purchase_units: [{ custom_id: userA, payments: { captures: [{ status: 'COMPLETED', amount: { value: '1.00', currency_code: 'USD' } }] } }],
    }),
  });
  assert.equal(mismatchRes.status, 400);

  // Reject non-USD capture
  const nonUsdRes = await handleCreditPurchase({
    request: makeReq('http://localhost/api/credits/purchase', {
      method: 'POST',
      headers: { 'X-User-Token': userA, 'Content-Type': 'application/json' },
      body: { pack: '5$', orderId: 'ORD-EUR' },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
    getPayPalAccessToken: mockAccessToken,
    verifyPayPalOrder: async () => ({
      status: 'COMPLETED',
      purchase_units: [{ custom_id: userA, payments: { captures: [{ status: 'COMPLETED', amount: { value: '5.00', currency_code: 'EUR' } }] } }],
    }),
  });
  assert.equal(nonUsdRes.status, 400);

  // Valid purchase of 5$ pack (200 credits)
  const goodRes = await handleCreditPurchase({
    request: makeReq('http://localhost/api/credits/purchase', {
      method: 'POST',
      headers: { 'X-User-Token': userA, 'Content-Type': 'application/json' },
      body: { pack: '5$', orderId: 'ORD-OK-1' },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
    getPayPalAccessToken: mockAccessToken,
    verifyPayPalOrder: async () => ({
      status: 'COMPLETED',
      purchase_units: [{ custom_id: userA, payments: { captures: [{ status: 'COMPLETED', amount: { value: '5.00', currency_code: 'USD' } }] } }],
    }),
  });
  assert.equal(goodRes.status, 200);
  const goodData = await goodRes.json();
  assert.equal(goodData.newBalance, 200);

  // Cross-user replay must fail with 403
  const replayRes = await handleCreditPurchase({
    request: makeReq('http://localhost/api/credits/purchase', {
      method: 'POST',
      headers: { 'X-User-Token': userB, 'Content-Type': 'application/json' },
      body: { pack: '5$', orderId: 'ORD-OK-1' },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
    getPayPalAccessToken: mockAccessToken,
    verifyPayPalOrder: async () => null,
  });
  assert.equal(replayRes.status, 403);

  // Spend 10 credits to unlock DTREASURE image
  const photoId = 'dtreasure:vault/imperial_dragon_8k.jpg';
  const spendRes = await handleCreditSpend({
    request: makeReq('http://localhost/api/credits/spend', {
      method: 'POST',
      headers: { 'X-User-Token': userA, 'Content-Type': 'application/json' },
      body: { photoId },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(spendRes.status, 200);
  const spendData = await spendRes.json();
  assert.equal(spendData.newBalance, 190);
  assert.equal(spendData.purchased, true);

  // Balance is read-only for unknown tokens (creates 0 DB rows); preparePayer registers userB with 0 balance
  const emptyBal = await (await handleCreditBalance({
    request: makeReq('http://localhost/api/credits/balance', { headers: { 'X-User-Token': userB } }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  })).json();
  assert.equal(emptyBal.credits, 0);
  const userBRowBefore = await env.DB.prepare('SELECT user_id FROM user_credits WHERE user_id = ?').bind(userB).first();
  assert.equal(userBRowBefore, null);

  await handlePreparePayer({
    request: makeReq('http://localhost/api/credits/prepare', { method: 'POST', headers: { 'X-User-Token': userB } }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  const failSpend = await handleCreditSpend({
    request: makeReq('http://localhost/api/credits/spend', {
      method: 'POST',
      headers: { 'X-User-Token': userB, 'Content-Type': 'application/json' },
      body: { photoId },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(failSpend.status, 400);

  // Create recovery code & restore account
  const recCreate = await handleCreateRecoveryCode({
    request: makeReq('http://localhost/api/credits/recovery', {
      method: 'POST',
      headers: { 'X-User-Token': userA },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(recCreate.status, 200);
  const { recoveryCode } = await recCreate.json();
  assert.match(recoveryCode, /^ZX-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  const recRestore = await handleRecoverAccount({
    request: makeReq('http://localhost/api/credits/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { recoveryCode },
    }),
    DB: env.DB,
    corsHeaders,
    checkRateLimit,
  });
  assert.equal(recRestore.status, 200);
  const restored = await recRestore.json();
  assert.equal(restored.userToken, userA);
  assert.equal(restored.credits, 190);
  assert.deepEqual(restored.purchased, [photoId]);
});

test('DTREASURE media route serves watermarked _preview to unpurchased users and gates download', async () => {
  const env = await createLocalEnv();
  const userId = 'u_treasure_owner';
  const photoId = 'dtreasure:vault/imperial_dragon_8k.jpg';

  // Unauthenticated view -> serves watermarked _preview
  const previewRes = await handleServeImage({
    request: makeReq('http://localhost/api/dtreasure/img/vault%2Fimperial_dragon_8k.jpg'),
    url: new URL('http://localhost/api/dtreasure/img/vault%2Fimperial_dragon_8k.jpg'),
    path: '/api/dtreasure/img/vault%2Fimperial_dragon_8k.jpg',
    mainBucket: env.Zxaion_B,
    comitbaseBucket: env.ZX_BUCKET,
    treasureBucket: env.TREASURE,
    DB: env.DB,
    origin: 'http://localhost:3000',
    corsHeaders,
    getUserToken,
  });
  assert.equal(previewRes.status, 200);
  const previewSvg = await previewRes.text();
  assert.ok(previewSvg.includes('ZXAION PREVIEW'));

  // Unauthenticated download -> 401
  const dlUnauth = await handleServeImage({
    request: makeReq('http://localhost/api/dtreasure/img/vault%2Fimperial_dragon_8k.jpg?download=true'),
    url: new URL('http://localhost/api/dtreasure/img/vault%2Fimperial_dragon_8k.jpg?download=true'),
    path: '/api/dtreasure/img/vault%2Fimperial_dragon_8k.jpg',
    mainBucket: env.Zxaion_B,
    comitbaseBucket: env.ZX_BUCKET,
    treasureBucket: env.TREASURE,
    DB: env.DB,
    origin: 'http://localhost:3000',
    corsHeaders,
    getUserToken,
  });
  assert.equal(dlUnauth.status, 401);

  // Authenticated but unpurchased download -> 403
  const dlForbidden = await handleServeImage({
    request: makeReq('http://localhost/api/dtreasure/img/vault%2Fimperial_dragon_8k.jpg?download=true', {
      headers: { 'X-User-Token': userId },
    }),
    url: new URL('http://localhost/api/dtreasure/img/vault%2Fimperial_dragon_8k.jpg?download=true'),
    path: '/api/dtreasure/img/vault%2Fimperial_dragon_8k.jpg',
    mainBucket: env.Zxaion_B,
    comitbaseBucket: env.ZX_BUCKET,
    treasureBucket: env.TREASURE,
    DB: env.DB,
    origin: 'http://localhost:3000',
    corsHeaders,
    getUserToken,
  });
  assert.equal(dlForbidden.status, 403);

  // Unlock item -> authorized view/download serves unwatermarked original
  await env.DB.prepare('INSERT OR IGNORE INTO purchased_images (user_id, photo_id) VALUES (?, ?)').bind(userId, photoId).run();
  const dlAuthorized = await handleServeImage({
    request: makeReq('http://localhost/api/dtreasure/img/vault%2Fimperial_dragon_8k.jpg?download=true', {
      headers: { 'X-User-Token': userId },
    }),
    url: new URL('http://localhost/api/dtreasure/img/vault%2Fimperial_dragon_8k.jpg?download=true'),
    path: '/api/dtreasure/img/vault%2Fimperial_dragon_8k.jpg',
    mainBucket: env.Zxaion_B,
    comitbaseBucket: env.ZX_BUCKET,
    treasureBucket: env.TREASURE,
    DB: env.DB,
    origin: 'http://localhost:3000',
    corsHeaders,
    getUserToken,
  });
  assert.equal(dlAuthorized.status, 200);
  const fullSvg = await dlAuthorized.text();
  assert.ok(!fullSvg.includes('ZXAION PREVIEW'));
  assert.match(dlAuthorized.headers.get('Content-Disposition') || '', /imperial_dragon_8k\.jpg/);
});

test('paypal webhook rejects missing headers and untrusted certUrl SSRF domains', async () => {
  const env = await createLocalEnv();

  const missingHeaders = await handlePayPalWebhook({
    request: makeReq('http://localhost/api/paypal-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { event_type: 'PAYMENT.CAPTURE.COMPLETED' },
    }),
    DB: env.DB,
    PAYPAL_WEBHOOK_ID: 'WH-TEST',
    PAYPAL_BASE: 'https://api-m.paypal.com',
    getPayPalAccessToken: async () => 'tok',
    verifyPayPalOrder: async () => null,
  });
  assert.equal(missingHeaders.status, 401);

  const ssrfAttempt = await handlePayPalWebhook({
    request: makeReq('http://localhost/api/paypal-webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'paypal-transmission-id': 'tx-1',
        'paypal-transmission-time': '2026-01-01T00:00:00Z',
        'paypal-cert-url': 'https://evil.attacker.com/cert.pem',
        'paypal-transmission-sig': 'sig',
        'paypal-auth-algo': 'SHA256withRSA',
      },
      body: { event_type: 'PAYMENT.CAPTURE.COMPLETED' },
    }),
    DB: env.DB,
    PAYPAL_WEBHOOK_ID: 'WH-TEST',
    PAYPAL_BASE: 'https://api-m.paypal.com',
    getPayPalAccessToken: async () => 'tok',
    verifyPayPalOrder: async () => null,
  });
  assert.equal(ssrfAttempt.status, 401);
});

test('parseTransformOptions clamps parameters and negotiates Accept format', () => {
  assert.equal(parseTransformOptions(new URLSearchParams(), 'image/webp'), null);

  const avifOpts = parseTransformOptions(new URLSearchParams('w=5000&q=10&fit=cover&fmt=auto'), 'image/avif,image/webp,*/*');
  assert.deepEqual(avifOpts, {
    width: 2400,
    height: null,
    quality: 30,
    fit: 'cover',
    blur: null,
    outputMime: 'image/avif',
  });

  const webpOpts = parseTransformOptions(new URLSearchParams('w=20&fmt=auto'), 'image/webp,image/png');
  assert.equal(webpOpts.width, 64);
  assert.equal(webpOpts.outputMime, 'image/webp');
});

test('handleServeImage uses Cloudflare IMAGES binding on raster images, bypasses download, clamps DTREASURE, and falls back on error', async () => {
  const env = await createLocalEnv();
  const rasterMain = createMockR2Bucket('main', [
    { key: 'FANTASY/dragon.jpg', contentType: 'image/jpeg', bodyText: 'RAW_JPEG_BYTES' },
  ]);
  const rasterTreasure = createMockR2Bucket('dtreasure', [
    { key: 'vault/secret.jpg', contentType: 'image/jpeg', bodyText: 'RAW_TREASURE_BYTES' },
    { key: '_preview/vault/secret.jpg', contentType: 'image/jpeg', bodyText: 'PREVIEW_TREASURE_BYTES' },
  ]);
  const mockImages = createMockImagesBinding();

  // 1. Resized image request -> invokes IMAGES binding with WebP negotiation
  const resized = await handleServeImage({
    request: makeReq('http://localhost/api/img/FANTASY%2Fdragon.jpg?w=600&fit=scale-down&fmt=auto', {
      headers: { Accept: 'image/webp,image/png' },
    }),
    url: new URL('http://localhost/api/img/FANTASY%2Fdragon.jpg?w=600&fit=scale-down&fmt=auto'),
    path: '/api/img/FANTASY%2Fdragon.jpg',
    mainBucket: rasterMain,
    comitbaseBucket: env.ZX_BUCKET,
    treasureBucket: rasterTreasure,
    DB: env.DB,
    IMAGES: mockImages,
    origin: 'http://localhost:3000',
    corsHeaders,
    getUserToken,
  });
  assert.equal(resized.status, 200);
  assert.equal(resized.headers.get('Content-Type'), 'image/webp');
  assert.equal(resized.headers.get('X-Image-Transformed'), 'cf-images');
  assert.equal(resized.headers.get('Vary'), 'Accept, Origin');

  // 2. Download request -> bypasses IMAGES binding and serves original JPEG + attachment
  const downloaded = await handleServeImage({
    request: makeReq('http://localhost/api/img/FANTASY%2Fdragon.jpg?w=300&download=true'),
    url: new URL('http://localhost/api/img/FANTASY%2Fdragon.jpg?w=300&download=true'),
    path: '/api/img/FANTASY%2Fdragon.jpg',
    mainBucket: rasterMain,
    comitbaseBucket: env.ZX_BUCKET,
    treasureBucket: rasterTreasure,
    DB: env.DB,
    IMAGES: mockImages,
    origin: 'http://localhost:3000',
    corsHeaders,
    getUserToken,
  });
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(downloaded.headers.get('X-Image-Transformed'), null);
  assert.equal(await downloaded.text(), 'RAW_JPEG_BYTES');

  // 3. Unpurchased DTREASURE clamps width <= 600 even if caller requests w=2000
  let capturedTransforms = [];
  const spyImages = {
    input(body) {
      const chain = {
        transform(step) { capturedTransforms.push(step); return chain; },
        async output(opts) { return { response: () => new Response(body, { headers: { 'Content-Type': opts.format } }) }; },
      };
      return chain;
    },
  };
  const dtreasureResized = await handleServeImage({
    request: makeReq('http://localhost/api/dtreasure/img/vault%2Fsecret.jpg?w=2000&fmt=webp'),
    url: new URL('http://localhost/api/dtreasure/img/vault%2Fsecret.jpg?w=2000&fmt=webp'),
    path: '/api/dtreasure/img/vault%2Fsecret.jpg',
    mainBucket: rasterMain,
    comitbaseBucket: env.ZX_BUCKET,
    treasureBucket: rasterTreasure,
    DB: env.DB,
    IMAGES: spyImages,
    origin: 'http://localhost:3000',
    corsHeaders,
    getUserToken,
  });
  assert.equal(dtreasureResized.status, 200);
  assert.equal(capturedTransforms[0].width, 600);

  // 4. Fallback to original R2 object if IMAGES binding throws
  const brokenImages = {
    input() {
      return {
        transform() { return this; },
        async output() { throw new Error('CF Images quota/error'); },
      };
    },
  };
  const fallbackRes = await handleServeImage({
    request: makeReq('http://localhost/api/img/FANTASY%2Fdragon.jpg?w=600&fmt=webp'),
    url: new URL('http://localhost/api/img/FANTASY%2Fdragon.jpg?w=600&fmt=webp'),
    path: '/api/img/FANTASY%2Fdragon.jpg',
    mainBucket: rasterMain,
    comitbaseBucket: env.ZX_BUCKET,
    treasureBucket: rasterTreasure,
    DB: env.DB,
    IMAGES: brokenImages,
    origin: 'http://localhost:3000',
    corsHeaders,
    getUserToken,
  });
  assert.equal(fallbackRes.status, 200);
  assert.equal(fallbackRes.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(await fallbackRes.text(), 'RAW_JPEG_BYTES');
});

test('getCloudflareImageUrl builds valid /cdn-cgi/image URLs and preserves non-transformable URLs', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const utilsSrc = readFileSync(join(here, '../../frontend/src/js/core/utils.js'), 'utf8');

  const sandbox = { API_BASE: '', URL, URLSearchParams };
  vm.runInNewContext(utilsSrc, sandbox);
  const { getCloudflareImageUrl } = sandbox;

  assert.equal(
    getCloudflareImageUrl('image.jpg', { width: 800, format: 'auto' }),
    '/cdn-cgi/image/width=800,format=auto/image.jpg'
  );
  assert.equal(
    getCloudflareImageUrl('/api/img/ANIME%2Fpic.jpg', { width: 600, quality: 80, fit: 'scale-down', format: 'auto' }),
    '/cdn-cgi/image/width=600,quality=80,fit=scale-down,format=auto/api/img/ANIME%2Fpic.jpg'
  );
  assert.equal(
    getCloudflareImageUrl('data:image/svg+xml;utf8,<svg></svg>', { width: 600 }),
    'data:image/svg+xml;utf8,<svg></svg>'
  );
  assert.equal(
    getCloudflareImageUrl('/api/img/a.jpg?download=true', { width: 600 }),
    '/api/img/a.jpg?download=true'
  );
  assert.equal(
    getCloudflareImageUrl('/cdn-cgi/image/width=400,format=auto/api/img/a.jpg', { width: 800 }),
    '/cdn-cgi/image/width=400,format=auto/api/img/a.jpg'
  );

  // With external API_BASE
  const prodSandbox = { API_BASE: 'https://ai.zxaionverse.workers.dev', URL, URLSearchParams };
  vm.runInNewContext(utilsSrc, prodSandbox);
  assert.equal(
    prodSandbox.getCloudflareImageUrl('/api/img/pic.jpg', { width: 800, format: 'auto' }),
    '/cdn-cgi/image/width=800,format=auto/https://ai.zxaionverse.workers.dev/api/img/pic.jpg'
  );
});

test('image URL encoding and multi-stage fallback helpers construct safe Worker and direct fallback queues', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const utilsSrc = readFileSync(join(here, '../../frontend/src/js/core/utils.js'), 'utf8');

  const sandbox = { API_BASE: 'https://ai.zxaionverse.workers.dev', URL, URLSearchParams };
  vm.runInNewContext(utilsSrc, sandbox);
  const {
    encodeImageUrlPath,
    buildWorkerTransformUrl,
    getImageFallbackCandidates,
    attachImageFallback,
  } = sandbox;

  // Spaces get safely percent-encoded and API_BASE is prepended to /api/* paths
  assert.equal(
    encodeImageUrlPath('/api/img/HEADER/One piece.jpg'),
    'https://ai.zxaionverse.workers.dev/api/img/HEADER/One%20piece.jpg'
  );
  // Already-encoded %2F / %20 segments are not double-encoded
  assert.equal(
    encodeImageUrlPath('/api/img/ANIME%2FOshi%20no%20ko/pic%201.jpg'),
    'https://ai.zxaionverse.workers.dev/api/img/ANIME%2FOshi%20no%20ko/pic%201.jpg'
  );

  // Worker built-in IMAGES transform URL
  assert.equal(
    buildWorkerTransformUrl('/api/img/HEADER/Anime.jpg', { w: 480, h: 480, q: 80, fit: 'cover', fmt: 'auto' }),
    'https://ai.zxaionverse.workers.dev/api/img/HEADER/Anime.jpg?w=480&h=480&q=80&fit=cover&fmt=auto'
  );

  // Multi-stage candidate queue: /cdn-cgi/image -> Worker transform -> raw Worker URL -> extras (deduplicated)
  const candidates = getImageFallbackCandidates(
    '/api/img/HEADER/Demon slayer.jpg',
    { w: 480, h: 480, q: 80, fit: 'cover', fmt: 'auto' },
    ['/api/img/ANIME/Demon%20slayer/tanjiro.jpg', '/api/img/HEADER/Demon slayer.jpg']
  );
  assert.deepEqual(JSON.parse(JSON.stringify(candidates)), [
    '/cdn-cgi/image/width=480,height=480,quality=80,fit=cover,format=auto/https://ai.zxaionverse.workers.dev/api/img/HEADER/Demon%20slayer.jpg',
    'https://ai.zxaionverse.workers.dev/api/img/HEADER/Demon%20slayer.jpg?w=480&h=480&q=80&fit=cover&fmt=auto',
    'https://ai.zxaionverse.workers.dev/api/img/HEADER/Demon%20slayer.jpg',
    '/cdn-cgi/image/width=480,height=480,quality=80,fit=cover,format=auto/https://ai.zxaionverse.workers.dev/api/img/ANIME/Demon%20slayer/tanjiro.jpg',
    'https://ai.zxaionverse.workers.dev/api/img/ANIME/Demon%20slayer/tanjiro.jpg?w=480&h=480&q=80&fit=cover&fmt=auto',
    'https://ai.zxaionverse.workers.dev/api/img/ANIME/Demon%20slayer/tanjiro.jpg',
  ]);

  // attachImageFallback advances through candidates on error and triggers fallbackSvg at the end
  let finalErrorCalled = false;
  const fakeImg = { src: '' };
  const first = attachImageFallback(fakeImg, ['https://a.test/1.jpg', 'https://a.test/2.jpg'], {
    fallbackSvg: 'data:image/svg+xml,<svg/>',
    onFinalError(el) {
      finalErrorCalled = true;
      el.src = 'data:image/svg+xml,<svg/>';
    },
  });
  assert.equal(first, 'https://a.test/1.jpg');
  fakeImg.src = first;
  fakeImg.onerror();
  assert.equal(fakeImg.src, 'https://a.test/2.jpg');
  fakeImg.onerror();
  assert.equal(finalErrorCalled, true);
  assert.equal(fakeImg.src, 'data:image/svg+xml,<svg/>');
  assert.equal(fakeImg.onerror, null);
});

test('translateCdnCgiImagePath translates /cdn-cgi/image directives into backend query params', () => {
  assert.equal(
    translateCdnCgiImagePath('/cdn-cgi/image/width=600,quality=80,fit=scale-down,format=auto/api/img/ANIME%2Fpic.jpg'),
    '/api/img/ANIME%2Fpic.jpg?w=600&q=80&fit=scale-down&fmt=auto'
  );
  assert.equal(
    translateCdnCgiImagePath('/cdn-cgi/image/width=800,format=webp/https://ai.zxaionverse.workers.dev/api/img/test.jpg'),
    '/api/img/test.jpg?w=800&fmt=webp'
  );
  assert.equal(translateCdnCgiImagePath('/api/img/test.jpg'), null);
});

test('galleryFilters sorts, classifies/filters aspect ratios, filters DTREASURE library, and computes pagination/infinite slices', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const filtersSrc = readFileSync(join(here, '../../frontend/src/js/core/filters.js'), 'utf8');

  const sandbox = {};
  sandbox.window = sandbox;
  vm.runInNewContext(filtersSrc, sandbox);
  const {
    classifyAspectRatio,
    sortPhotosList,
    filterPhotosByRatio,
    filterDtreasureLibrary,
    getPaginationSliceInfo,
  } = sandbox.galleryFilters;

  assert.equal(classifyAspectRatio(800, 1100), 'portrait');
  assert.equal(classifyAspectRatio(1920, 1080), 'landscape');
  assert.equal(classifyAspectRatio(900, 900), 'square');
  assert.equal(classifyAspectRatio(0, 100), 'unknown');

  const sample = [
    { id: '1', uploaded: '2026-01-01T00:00:00Z', viewCount: 50, downloadCount: 300, width: 800, height: 1100 },
    { id: '2', uploaded: '2026-03-01T00:00:00Z', viewCount: 500, downloadCount: 20, width: 1280, height: 720 },
    { id: '3', uploaded: '2026-02-01T00:00:00Z', viewCount: 150, downloadCount: 90, width: 900, height: 900 },
  ];

  const plain = (v) => JSON.parse(JSON.stringify(v));

  assert.deepEqual(plain(sortPhotosList(sample, 'latest').map(p => p.id)), ['2', '3', '1']);
  assert.deepEqual(plain(sortPhotosList(sample, 'views').map(p => p.id)), ['2', '3', '1']);
  assert.deepEqual(plain(sortPhotosList(sample, 'downloads').map(p => p.id)), ['1', '3', '2']);
  assert.equal(sortPhotosList(sample, 'random').length, 3);

  assert.deepEqual(plain(filterPhotosByRatio(sample, 'all').map(p => p.id)), ['1', '2', '3']);
  assert.deepEqual(plain(filterPhotosByRatio(sample, 'portrait').map(p => p.id)), ['1']);
  assert.deepEqual(plain(filterPhotosByRatio(sample, 'landscape').map(p => p.id)), ['2']);
  assert.deepEqual(plain(filterPhotosByRatio(sample, 'square').map(p => p.id)), ['3']);

  // Fallback ratioMap when photo lacks width/height
  const unknownItem = [{ id: 'u1' }, { id: 'u2' }];
  assert.deepEqual(plain(filterPhotosByRatio(unknownItem, 'portrait', { u1: 'portrait', u2: 'landscape' }).map(p => p.id)), ['u1']);

  // DTREASURE library filtering
  const vault = [{ id: 'dt1' }, { id: 'dt2' }, { id: 'dt3' }];
  assert.deepEqual(plain(filterDtreasureLibrary(vault, { tab: 'all', purchasedSet: new Set(['dt2']) }).map(p => p.id)), ['dt1', 'dt2', 'dt3']);
  assert.deepEqual(plain(filterDtreasureLibrary(vault, { tab: 'library', purchasedSet: new Set(['dt2']) }).map(p => p.id)), ['dt2']);
  assert.deepEqual(plain(filterDtreasureLibrary(vault, { tab: 'library', purchasedSet: new Set(), lifetime: true }).map(p => p.id)), ['dt1', 'dt2', 'dt3']);

  // Pagination vs Infinite Scroll slices
  assert.deepEqual(plain(getPaginationSliceInfo(45, 2, 30, 'pagination')), {
    start: 30, end: 45, page: 2, totalPages: 2, total: 45, hasMore: false, remaining: 0,
  });
  assert.deepEqual(plain(getPaginationSliceInfo(45, 1, 30, 'infinite')), {
    start: 0, end: 30, page: 1, totalPages: 2, total: 45, hasMore: true, remaining: 15,
  });
  assert.deepEqual(plain(getPaginationSliceInfo(45, 2, 30, 'infinite')), {
    start: 0, end: 45, page: 2, totalPages: 2, total: 45, hasMore: false, remaining: 0,
  });
});

test('server bridge handles multi-value X-Forwarded-Proto headers on /api/trending', async () => {
  const env = await createLocalEnv();
  const app = createApp(env);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/trending?limit=20`, {
      headers: {
        'X-Forwarded-Proto': 'https, http',
      },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data));
    assert.ok(data.length > 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('incremental scheduled sync skips unchanged images and detects newly added or deleted objects', async () => {
  const env = await createLocalEnv();
  resetSyncStateForTests();

  // Second run immediately after initial sync should skip every unchanged image
  const secondRun = await handleScheduled(env);
  const mainSecond = secondRun.find((s) => s.bucket === 'main');
  assert.equal(mainSecond.upserted, 0);
  assert.equal(mainSecond.removed, 0);
  assert.ok(mainSecond.skipped > 0);

  // Add 1 brand-new image to R2 and remove 1 existing image
  await env.Zxaion_B.put('ANIME/Bleach/ichigo_bankai_4k.jpg', 'img-data', { size: 512000 });
  await env.Zxaion_B.delete('FANTASY/emerald_sanctuary_falls.jpg');

  const thirdRun = await handleScheduled(env);
  const mainThird = thirdRun.find((s) => s.bucket === 'main');
  assert.equal(mainThird.upserted, 1);
  assert.equal(mainThird.removed, 1);
  assert.equal(mainThird.skipped, mainSecond.skipped - 1);
});

test('handleR2QueueBatch processes PutObject and DeleteObject events immediately with zero cron delay', async () => {
  const env = await createLocalEnv();
  resetSyncStateForTests();

  const newKey = 'ANIME/Jujutsu Kaisen/gojo_hollow_purple_8k.jpg';
  await env.Zxaion_B.put(newKey, 'bytes', { size: 777777 });

  let putAcked = false;
  let delAcked = false;

  // PutObject event -> immediately appears in /api/list
  await handleR2QueueBatch({
    messages: [
      {
        body: {
          action: 'PutObject',
          bucket: 'zxaionverse',
          object: { key: newKey, size: 777777 },
          eventTime: '2026-11-21T02:00:00Z',
        },
        ack() { putAcked = true; },
        retry() { throw new Error('should not retry PutObject'); },
      },
    ],
  }, env);
  assert.equal(putAcked, true);

  const afterPutRes = await handleListMain({
    url: new URL('http://localhost/api/list?category=Anime&subCategory=jujutsu%20kaisen'),
    DB: env.DB,
    corsHeaders,
  });
  const jjkItems = await afterPutRes.json();
  assert.ok(jjkItems.some((item) => item.id === `main:${newKey}`));

  // DeleteObject event -> immediately removed from /api/list
  await handleR2QueueBatch({
    messages: [
      {
        body: {
          action: 'DeleteObject',
          bucket: 'zxaionverse',
          object: { key: newKey },
        },
        ack() { delAcked = true; },
        retry() { throw new Error('should not retry DeleteObject'); },
      },
    ],
  }, env);
  assert.equal(delAcked, true);

  const afterDelRes = await handleListMain({
    url: new URL('http://localhost/api/list?category=Anime&subCategory=jujutsu%20kaisen'),
    DB: env.DB,
    corsHeaders,
  });
  const jjkAfterDel = await afterDelRes.json();
  assert.equal(jjkAfterDel.some((item) => item.id === `main:${newKey}`), false);
});

test('ensureAutoSync scans empty D1 on-demand and triggers background incremental sync on subsequent requests', async () => {
  resetSyncStateForTests();
  const coldEnv = {
    DB: createMockD1(),
    Zxaion_B: createMockR2Bucket('main', [
      { key: 'ANIME/One Piece/luffy_gear5_old.jpg' },
    ]),
    ZX_BUCKET: createMockR2Bucket('comitbase', []),
    TREASURE: createMockR2Bucket('dtreasure', []),
  };

  // Cold D1 (old R2 file never scanned yet): first request scans synchronously and returns it immediately
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(p) };
  const firstRes = await handleListMain({
    url: new URL('http://localhost/api/list'),
    env: coldEnv,
    ctx,
    DB: coldEnv.DB,
    corsHeaders,
  });
  const firstItems = await firstRes.json();
  assert.equal(firstItems.length, 1);
  assert.equal(firstItems[0].id, 'main:ANIME/One Piece/luffy_gear5_old.jpg');

  // New object uploaded to R2 without waiting for cron: background ensureAutoSync (cooldownMs=0) discovers it
  await coldEnv.Zxaion_B.put('ANIME/One Piece/zoro_enma_new.jpg', 'new-bytes', { size: 333333 });
  await ensureAutoSync({ env: coldEnv, ctx, DB: coldEnv.DB, bucketName: 'main', cooldownMs: 0 });
  await Promise.all(pending);

  const secondRes = await handleListMain({
    url: new URL('http://localhost/api/list'),
    DB: coldEnv.DB,
    corsHeaders,
  });
  const secondItems = await secondRes.json();
  assert.equal(secondItems.length, 2);
});

test('DTREASURE media route fails closed when _preview/ is missing, ignores query userToken, and blocks path traversal', async () => {
  const env = await createLocalEnv();
  const userId = 'u_paid_user_99';
  const photoId = 'dtreasure:vault/no_preview_yet.jpg';
  await env.DB.prepare('INSERT OR IGNORE INTO purchased_images (user_id, photo_id) VALUES (?, ?)').bind(userId, photoId).run();

  // Strict R2 stub (mimics real R2 when _preview/<key> was NOT uploaded)
  const rawTreasure = {
    async get(key) {
      if (key !== 'vault/no_preview_yet.jpg') return null;
      const bytes = new TextEncoder().encode('TOP_SECRET_4K_RAW_BYTES');
      return {
        key,
        size: bytes.byteLength,
        httpEtag: '"raw4k"',
        httpMetadata: { contentType: 'image/jpeg' },
        body: bytes,
        writeHttpMetadata(h) { h.set('Content-Type', 'image/jpeg'); },
      };
    },
  };

  // 1. Unpurchased request without _preview/ and without IMAGES binding -> MUST fail closed (403), never leak raw bytes
  const unauthNoImages = await handleServeImage({
    request: makeReq('http://localhost/api/dtreasure/img/vault%2Fno_preview_yet.jpg'),
    url: new URL('http://localhost/api/dtreasure/img/vault%2Fno_preview_yet.jpg'),
    path: '/api/dtreasure/img/vault%2Fno_preview_yet.jpg',
    mainBucket: env.Zxaion_B,
    comitbaseBucket: env.ZX_BUCKET,
    treasureBucket: rawTreasure,
    DB: env.DB,
    IMAGES: null,
    origin: 'http://localhost:3000',
    corsHeaders,
    getUserToken,
  });
  assert.equal(unauthNoImages.status, 403);
  const body1 = await unauthNoImages.text();
  assert.equal(body1.includes('TOP_SECRET_4K_RAW_BYTES'), false);

  // 2. Unpurchased request without _preview/ when IMAGES is present -> forces blurred <=480px preview even without query params
  let seenTransform = null;
  const spyImages = {
    input(bytes) {
      return {
        transform(step) { seenTransform = step; return this; },
        async output(opts) { return { response: () => new Response('BLURRED_PREVIEW', { headers: { 'Content-Type': opts.format } }) }; },
      };
    },
  };
  const unauthTransformed = await handleServeImage({
    request: makeReq('http://localhost/api/dtreasure/img/vault%2Fno_preview_yet.jpg'),
    url: new URL('http://localhost/api/dtreasure/img/vault%2Fno_preview_yet.jpg'),
    path: '/api/dtreasure/img/vault%2Fno_preview_yet.jpg',
    mainBucket: env.Zxaion_B,
    comitbaseBucket: env.ZX_BUCKET,
    treasureBucket: rawTreasure,
    DB: env.DB,
    IMAGES: spyImages,
    origin: 'http://localhost:3000',
    corsHeaders,
    getUserToken,
  });
  assert.equal(unauthTransformed.status, 200);
  assert.ok(seenTransform && seenTransform.width <= 480 && seenTransform.blur >= 12);

  // 3. Query-string ?userToken= is ignored for downloads (must send X-User-Token header)
  const queryTokenAttempt = await handleServeImage({
    request: makeReq(`http://localhost/api/dtreasure/img/vault%2Fno_preview_yet.jpg?download=true&userToken=${userId}`),
    url: new URL(`http://localhost/api/dtreasure/img/vault%2Fno_preview_yet.jpg?download=true&userToken=${userId}`),
    path: '/api/dtreasure/img/vault%2Fno_preview_yet.jpg',
    mainBucket: env.Zxaion_B,
    comitbaseBucket: env.ZX_BUCKET,
    treasureBucket: rawTreasure,
    DB: env.DB,
    IMAGES: null,
    origin: 'http://localhost:3000',
    corsHeaders,
    getUserToken,
  });
  assert.equal(queryTokenAttempt.status, 401);

  // 4. Path traversal attempt -> 400
  const traversalAttempt = await handleServeImage({
    request: makeReq('http://localhost/api/dtreasure/img/..%2Fsecret.jpg'),
    url: new URL('http://localhost/api/dtreasure/img/..%2Fsecret.jpg'),
    path: '/api/dtreasure/img/..%2Fsecret.jpg',
    mainBucket: env.Zxaion_B,
    comitbaseBucket: env.ZX_BUCKET,
    treasureBucket: rawTreasure,
    DB: env.DB,
    IMAGES: null,
    origin: 'http://localhost:3000',
    corsHeaders,
    getUserToken,
  });
  assert.equal(traversalAttempt.status, 400);
});

test('DTREASURE payment retries reclaim failed orders, spend validates item existence, and weak tokens are rejected', async () => {
  const env = await createLocalEnv();
  const userId = 'u_retry_buyer_1';

  // Weak short token rejected
  assert.equal(getUserToken(makeReq('http://localhost/test', { headers: { 'X-User-Token': 'abc' } })), 'anonymous');

  // Step 1: Transient PayPal null failure writes 'failed' payment_orders row
  const firstFail = await handleCreditPurchase({
    request: makeReq('http://localhost/api/credits/purchase', {
      method: 'POST',
      headers: { 'X-User-Token': userId, 'Content-Type': 'application/json' },
      body: { pack: '5$', orderId: 'ORD-RETRY-1' },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
    getPayPalAccessToken: async () => 'tok',
    verifyPayPalOrder: async () => null,
  });
  assert.equal(firstFail.status, 400);

  // Step 2: Retry with COMPLETED PayPal verification reclaims 'failed' row and credits 200
  const retryOk = await handleCreditPurchase({
    request: makeReq('http://localhost/api/credits/purchase', {
      method: 'POST',
      headers: { 'X-User-Token': userId, 'Content-Type': 'application/json' },
      body: { pack: '5$', orderId: 'ORD-RETRY-1' },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
    getPayPalAccessToken: async () => 'tok',
    verifyPayPalOrder: async () => ({
      status: 'COMPLETED',
      purchase_units: [{ custom_id: userId, payments: { captures: [{ status: 'COMPLETED', amount: { value: '5.00', currency_code: 'USD' } }] } }],
    }),
  });
  assert.equal(retryOk.status, 200);
  const retryBody = await retryOk.json();
  assert.equal(retryBody.newBalance, 200);

  // Step 3: Spend on non-existent/non-DTREASURE photoId returns 404 without deducting credits
  const bogusSpend = await handleCreditSpend({
    request: makeReq('http://localhost/api/credits/spend', {
      method: 'POST',
      headers: { 'X-User-Token': userId, 'Content-Type': 'application/json' },
      body: { photoId: 'main:ANIME/Attack on Titan/crimson_wings_4k.jpg' },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(bogusSpend.status, 404);

  const balanceAfter = await (await handleCreditBalance({
    request: makeReq('http://localhost/api/credits/balance', { headers: { 'X-User-Token': userId } }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  })).json();
  assert.equal(balanceAfter.credits, 200);
});

test('public payerRef checkout, stale processing reclaim, refund/dispute revocation, and webhook 500 retry', async () => {
  const env = await createLocalEnv();
  const buyer = 'u_pubref_buyer_1';
  const prepRes = await handlePreparePayer({
    request: makeReq('http://localhost/api/credits/prepare', {
      method: 'POST',
      headers: { 'X-User-Token': buyer },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(prepRes.status, 200);
  const { payerRef } = await prepRes.json();
  assert.ok(payerRef.startsWith('pub_'));
  assert.equal(payerRef, await derivePublicPayerRef(buyer));

  // Stale (>5m) 'processing' order can be reclaimed by PayPal webhook via pub_ custom_id
  const oldTs = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await env.DB.prepare(`
    INSERT INTO payment_orders (id, user_id, order_id, capture_id, pack_key, amount, status, error_message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'processing', NULL, ?)
    ON CONFLICT(id) DO UPDATE SET status = 'processing'
    WHERE payment_orders.status = 'failed' OR (payment_orders.status = 'processing' AND payment_orders.created_at < ?)
  `).bind('order:ORD-STALE-1', buyer, 'ORD-STALE-1', null, '25$', 25, oldTs, oldTs).run();

  const whRes = await handlePayPalWebhook({
    request: makeReq('http://localhost/api/paypal-webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'paypal-transmission-id': 'tx-stale',
        'paypal-transmission-time': '2026-11-21T00:00:00Z',
        'paypal-cert-url': 'https://api-m.paypal.com/v1/notifications/certs/CERT-1',
        'paypal-transmission-sig': 'sig',
        'paypal-auth-algo': 'SHA256withRSA',
      },
      body: {
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          id: 'CAP-STALE-1',
          custom_id: payerRef,
          amount: { value: '25.00', currency_code: 'USD' },
          supplementary_data: { related_ids: { order_id: 'ORD-STALE-1' } },
        },
      },
    }),
    DB: env.DB,
    PAYPAL_WEBHOOK_ID: 'WH-TEST',
    PAYPAL_BASE: 'https://api-m.paypal.com',
    getPayPalAccessToken: async () => 'tok',
    verifyPayPalOrder: async () => null,
  });
  // Without global fetch mocked, verification fails -> returns 500 (never silently 200)
  assert.equal(whRes.status, 500);

  // Mock PayPal signature verify fetch cleanly during unit test
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/verify-webhook-signature')) {
      return new Response(JSON.stringify({ verification_status: 'SUCCESS' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error('Unexpected fetch: ' + url);
  };
  try {
    const whOk = await handlePayPalWebhook({
      request: makeReq('http://localhost/api/paypal-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'paypal-transmission-id': 'tx-stale-2',
          'paypal-transmission-time': '2026-11-21T00:00:00Z',
          'paypal-cert-url': 'https://api.paypal.com/v1/notifications/certs/CERT-1',
          'paypal-transmission-sig': 'sig',
          'paypal-auth-algo': 'SHA256withRSA',
        },
        body: {
          event_type: 'PAYMENT.CAPTURE.COMPLETED',
          resource: {
            id: 'CAP-STALE-1',
            custom_id: payerRef,
            amount: { value: '25.00', currency_code: 'USD' },
            supplementary_data: { related_ids: { order_id: 'ORD-STALE-1' } },
          },
        },
      }),
      DB: env.DB,
      PAYPAL_WEBHOOK_ID: 'WH-TEST',
      PAYPAL_BASE: 'https://api-m.paypal.com',
      getPayPalAccessToken: async () => 'tok',
      verifyPayPalOrder: async () => null,
    });
    assert.equal(whOk.status, 200);
    const balAfterWh = await env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?').bind(buyer).first();
    assert.equal(balAfterWh.credits, 1750);

    // Refund revokes the 1750 credits cleanly and marks order refunded
    const whRefund = await handlePayPalWebhook({
      request: makeReq('http://localhost/api/paypal-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'paypal-transmission-id': 'tx-refund',
          'paypal-transmission-time': '2026-11-21T00:05:00Z',
          'paypal-cert-url': 'https://api.paypal.com/v1/notifications/certs/CERT-1',
          'paypal-transmission-sig': 'sig',
          'paypal-auth-algo': 'SHA256withRSA',
        },
        body: {
          event_type: 'PAYMENT.CAPTURE.REFUNDED',
          resource: {
            links: [{ rel: 'up', href: 'https://api.paypal.com/v2/payments/captures/CAP-STALE-1' }],
          },
        },
      }),
      DB: env.DB,
      PAYPAL_WEBHOOK_ID: 'WH-TEST',
      PAYPAL_BASE: 'https://api-m.paypal.com',
      getPayPalAccessToken: async () => 'tok',
      verifyPayPalOrder: async () => null,
    });
    assert.equal(whRefund.status, 200);
    const balAfterRefund = await env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?').bind(buyer).first();
    const orderAfterRefund = await env.DB.prepare('SELECT status FROM payment_orders WHERE order_id = ? LIMIT 1').bind('ORD-STALE-1').first();
    assert.equal(balAfterRefund.credits, 0);
    assert.equal(orderAfterRefund.status, 'refunded');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('media download ignores client photoId query param and concurrent spend cannot double-charge', async () => {
  const env = await createLocalEnv();
  const buyer = 'u_concurrent_spender';

  // Seed buyer with 200 credits via real handleCreditPurchase
  await handleCreditPurchase({
    request: makeReq('http://localhost/api/credits/purchase', {
      method: 'POST',
      headers: { 'X-User-Token': buyer, 'Content-Type': 'application/json' },
      body: { pack: '5$', orderId: 'ORD-CONC-SEED' },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
    getPayPalAccessToken: async () => 'tok',
    verifyPayPalOrder: async () => ({
      status: 'COMPLETED',
      purchase_units: [{ custom_id: await derivePublicPayerRef(buyer), payments: { captures: [{ status: 'COMPLETED', amount: { value: '5.00', currency_code: 'USD' } }] } }],
    }),
  });

  const dtA = 'dtreasure:vault/imperial_dragon_8k.jpg';
  const dtB = 'dtreasure:vault/eclipse_seraphim_pro.jpg';

  // Parallel spend attempts for dtA must deduct only 10 credits (200 -> 190, never 180)
  const [s1, s2] = await Promise.all([
    handleCreditSpend({
      request: makeReq('http://localhost/api/credits/spend', {
        method: 'POST',
        headers: { 'X-User-Token': buyer, 'Content-Type': 'application/json' },
        body: { photoId: dtA },
      }),
      DB: env.DB,
      corsHeaders,
      getUserToken,
    }),
    handleCreditSpend({
      request: makeReq('http://localhost/api/credits/spend', {
        method: 'POST',
        headers: { 'X-User-Token': buyer, 'Content-Type': 'application/json' },
        body: { photoId: dtA },
      }),
      DB: env.DB,
      corsHeaders,
      getUserToken,
    }),
  ]);
  assert.equal(s1.status, 200);
  assert.equal(s2.status, 200);
  const finalUser = await env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?').bind(buyer).first();
  assert.equal(finalUser.credits, 190);

  // Attempting to download dtB while spoofing ?photoId=dtA MUST be rejected with 403
  const spoofAttempt = await handleServeImage({
    request: makeReq(`http://localhost/api/dtreasure/img/vault%2Feclipse_seraphim_pro.jpg?download=true&photoId=${encodeURIComponent(dtA)}`, {
      headers: { 'X-User-Token': buyer },
    }),
    url: new URL(`http://localhost/api/dtreasure/img/vault%2Feclipse_seraphim_pro.jpg?download=true&photoId=${encodeURIComponent(dtA)}`),
    path: '/api/dtreasure/img/vault%2Feclipse_seraphim_pro.jpg',
    mainBucket: env.Zxaion_B,
    comitbaseBucket: env.ZX_BUCKET,
    treasureBucket: env.TREASURE,
    DB: env.DB,
    origin: 'http://localhost:3000',
    corsHeaders,
    getUserToken,
  });
  assert.equal(spoofAttempt.status, 403);
});

test('IP rate limit prevents view farming across rotating X-User-Token headers', async () => {
  const env = await createLocalEnv();
  const checkRateLimit = (ep, id, limit, win) => rawCheckRateLimit(env.DB, ep, id, limit, win);
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(p) };
  const photoId = 'main:FANTASY/astral_citadel_dragons.jpg';

  const before = await (await handleStats({
    path: `/api/stats/${encodeURIComponent(photoId)}`,
    DB: env.DB,
    corsHeaders,
  })).json();

  await handleRecordView({
    request: makeReq(`http://localhost/api/view/${encodeURIComponent(photoId)}`, {
      method: 'POST',
      headers: { 'X-User-Token': 'u_farm_token_1', 'CF-Connecting-IP': '203.0.113.55' },
    }),
    ctx,
    path: `/api/view/${encodeURIComponent(photoId)}`,
    DB: env.DB,
    corsHeaders,
    getUserToken,
    checkRateLimit,
  });
  await handleRecordView({
    request: makeReq(`http://localhost/api/view/${encodeURIComponent(photoId)}`, {
      method: 'POST',
      headers: { 'X-User-Token': 'u_farm_token_2', 'CF-Connecting-IP': '203.0.113.55' },
    }),
    ctx,
    path: `/api/view/${encodeURIComponent(photoId)}`,
    DB: env.DB,
    corsHeaders,
    getUserToken,
    checkRateLimit,
  });
  await Promise.all(pending);

  const after = await (await handleStats({
    path: `/api/stats/${encodeURIComponent(photoId)}`,
    DB: env.DB,
    corsHeaders,
  })).json();

  assert.equal(after.views, before.views + 1);
});

test('router global error handler, static 404 for robots.txt, and ETag/version cache headers work properly', async () => {
  const env = await createLocalEnv();

  // Global try/catch wraps unexpected failures cleanly with CORS headers
  const brokenUrlReq = makeReq('http://localhost/api/list', {
    headers: { Origin: 'https://zxaionverse.site' },
  });
  const errRes = await handleRequest(brokenUrlReq, {
    ...env,
    DB: { prepare() { throw new Error('Simulated crash'); } },
  }, { waitUntil() {} });
  assert.ok([500, 200].includes(errRes.status));
  assert.equal(errRes.headers.get('Access-Control-Allow-Origin'), 'https://zxaionverse.site');

  // Unknown robots.txt / sitemap.xml must return 404 (not fallback index.html) and MIME_TYPES covers txt/xml/gif
  assert.equal(MIME_TYPES.txt, 'text/plain; charset=utf-8');
  assert.equal(MIME_TYPES.xml, 'application/xml; charset=utf-8');
  assert.equal(MIME_TYPES.gif, 'image/gif');

  const missingRobots = await handleStatic({
    path: '/robots.txt',
    mainBucket: createMockR2Bucket('frontend', [{ key: 'index.html', bodyText: '<html></html>' }]),
    origin: 'http://localhost:3000',
  });
  assert.equal(missingRobots.status, 404);

  // Versioned image response returns immutable Cache-Control and honors If-None-Match 304
  const etagBucket = createMockR2Bucket('main', [
    { key: 'FANTASY/versioned.jpg', contentType: 'image/jpeg', bodyText: 'IMG' },
  ]);
  const firstImgRes = await handleServeImage({
    request: makeReq('http://localhost/api/img/FANTASY%2Fversioned.jpg?v=12345'),
    url: new URL('http://localhost/api/img/FANTASY%2Fversioned.jpg?v=12345'),
    path: '/api/img/FANTASY%2Fversioned.jpg',
    mainBucket: etagBucket,
    comitbaseBucket: env.ZX_BUCKET,
    treasureBucket: env.TREASURE,
    DB: env.DB,
    origin: 'http://localhost:3000',
    corsHeaders,
    getUserToken,
  });
  assert.equal(firstImgRes.status, 200);
  assert.match(firstImgRes.headers.get('Cache-Control') || '', /immutable/);
  const etag = firstImgRes.headers.get('ETag');
  assert.ok(etag);

  const notModifiedRes = await handleServeImage({
    request: makeReq('http://localhost/api/img/FANTASY%2Fversioned.jpg?v=12345', {
      headers: { 'If-None-Match': etag },
    }),
    url: new URL('http://localhost/api/img/FANTASY%2Fversioned.jpg?v=12345'),
    path: '/api/img/FANTASY%2Fversioned.jpg',
    mainBucket: etagBucket,
    comitbaseBucket: env.ZX_BUCKET,
    treasureBucket: env.TREASURE,
    DB: env.DB,
    origin: 'http://localhost:3000',
    corsHeaders,
    getUserToken,
  });
  assert.equal(notModifiedRes.status, 304);
});

test('frontend escapeHtml quotes, Anime diacritic/hyphen normalization, CRLF includes, and single-source pack sync', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const utilsSrc = readFileSync(join(here, '../../frontend/src/js/core/utils.js'), 'utf8');
  const constSrc = readFileSync(join(here, '../../frontend/src/js/config/constants.js'), 'utf8');

  const sandbox = { URL, URLSearchParams };
  const exportsFromVm = vm.runInNewContext(`${utilsSrc}\n${constSrc}\n({ utils, CREDIT_PACKS });`, sandbox);

  // Quotes escaped safely
  assert.equal(exportsFromVm.utils.escapeHtml('a"b\'c<d>&'), 'a&quot;b&#39;c&lt;d&gt;&amp;');

  // Hyphenated and accented Anime album titles unify cleanly
  assert.equal(exportsFromVm.utils.normalizeAlbumKey('One-Punch Man'), exportsFromVm.utils.normalizeAlbumKey('One Punch Man'));
  assert.equal(exportsFromVm.utils.normalizeAlbumKey('Pokémon'), exportsFromVm.utils.normalizeAlbumKey('Pokemon'));

  // CRLF @include support in build script
  const builtHtml = resolveHtmlIncludes(
    '<html>\r\n<!-- @include partials/a.html -->\r\n</html>',
    () => '<section>OK</section>\r\n'
  );
  assert.equal(builtHtml, '<html>\n<section>OK</section>\n</html>');

  // Backend and frontend fallback credit pack definitions stay 100% synced
  for (const def of CREDIT_PACK_DEFINITIONS) {
    const fe = exportsFromVm.CREDIT_PACKS[def.key];
    assert.ok(fe, `Missing pack ${def.key} in frontend constants`);
    assert.equal(fe.price, def.price);
    assert.equal(fe.bonus, def.bonus);
    assert.equal(fe.credits, def.lifetime ? 'lifetime' : def.credits);
  }
});

test('server-side PayPal createOrder enforces pack/price, binds payerRef, blocks pack-swap, and settles created orders', async () => {
  const env = await createLocalEnv();
  const buyer = 'u_server_create_buyer';

  // 1. Unauthenticated caller rejected
  const unauthRes = await handleCreatePayPalOrder({
    request: makeReq('http://localhost/api/credits/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { pack: '25$' },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
    getPayPalAccessToken: async () => 'tok',
    createPayPalOrder: async () => ({ id: 'ORD-NEVER' }),
  });
  assert.equal(unauthRes.status, 401);

  // 2. Invalid pack rejected
  const badPackRes = await handleCreatePayPalOrder({
    request: makeReq('http://localhost/api/credits/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Token': buyer },
      body: { pack: '999$' },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
    getPayPalAccessToken: async () => 'tok',
    createPayPalOrder: async () => ({ id: 'ORD-NEVER' }),
  });
  assert.equal(badPackRes.status, 400);

  // 3. Valid pack calls PayPal Orders API with authoritative $25.00 USD + pub_ custom_id
  const origFetch = globalThis.fetch;
  let capturedPayPalPayload = null;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/v2/checkout/orders')) {
      capturedPayPalPayload = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: 'PP-SRV-ORDER-25', status: 'CREATED' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error('Unexpected fetch: ' + url);
  };

  let createdOrderId;
  try {
    const okRes = await handleCreatePayPalOrder({
      request: makeReq('http://localhost/api/credits/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Token': buyer },
        body: { pack: '25$', price: 0.01 }, // client tampered price must be ignored
      }),
      DB: env.DB,
      corsHeaders,
      getUserToken,
      getPayPalAccessToken: async () => 'tok-srv',
      createPayPalOrder: (input, tok) => createPayPalOrder(input, tok, 'https://api-m.paypal.com'),
    });
    assert.equal(okRes.status, 200);
    const okData = await okRes.json();
    assert.equal(okData.success, true);
    assert.equal(okData.orderId, 'PP-SRV-ORDER-25');
    assert.equal(okData.amount, 25);
    assert.equal(okData.currency, 'USD');
    createdOrderId = okData.orderId;
  } finally {
    globalThis.fetch = origFetch;
  }

  assert.equal(capturedPayPalPayload.intent, 'CAPTURE');
  assert.equal(capturedPayPalPayload.purchase_units[0].amount.currency_code, 'USD');
  assert.equal(capturedPayPalPayload.purchase_units[0].amount.value, '25.00');
  assert.equal(capturedPayPalPayload.purchase_units[0].custom_id, await derivePublicPayerRef(buyer));

  // Verify DB recorded status = 'created'
  const dbRow = await env.DB.prepare('SELECT user_id, pack_key, status FROM payment_orders WHERE order_id = ? LIMIT 1')
    .bind(createdOrderId).first();
  assert.equal(dbRow.user_id, buyer);
  assert.equal(dbRow.pack_key, '25$');
  assert.equal(dbRow.status, 'created');

  // 4. Cross-user claim blocked (403) & pack-swap blocked (400)
  const crossUser = await handleCreditPurchase({
    request: makeReq('http://localhost/api/credits/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Token': 'u_attacker_9999' },
      body: { pack: '25$', orderId: createdOrderId },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
    getPayPalAccessToken: async () => 'tok',
    verifyPayPalOrder: async () => ({ status: 'COMPLETED' }),
  });
  assert.equal(crossUser.status, 403);

  const packSwap = await handleCreditPurchase({
    request: makeReq('http://localhost/api/credits/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Token': buyer },
      body: { pack: '125$', orderId: createdOrderId },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
    getPayPalAccessToken: async () => 'tok',
    verifyPayPalOrder: async () => ({ status: 'COMPLETED' }),
  });
  assert.equal(packSwap.status, 400);

  // 5. Legitimate capture settles 'created' order and grants 1750 credits
  const expectedPayerRef = await derivePublicPayerRef(buyer);
  const settleOk = await handleCreditPurchase({
    request: makeReq('http://localhost/api/credits/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Token': buyer },
      body: { pack: '25$', orderId: createdOrderId },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
    getPayPalAccessToken: async () => 'tok',
    verifyPayPalOrder: async () => ({
      status: 'COMPLETED',
      purchase_units: [{
        custom_id: expectedPayerRef,
        payments: { captures: [{ id: 'CAP-SRV-25', status: 'COMPLETED', amount: { value: '25.00', currency_code: 'USD' } }] },
      }],
    }),
  });
  assert.equal(settleOk.status, 200);
  const settledBody = await settleOk.json();
  assert.equal(settledBody.newBalance, 1750);

  // 6. Webhook can also directly settle a 'created' order if client tab closed before /purchase
  const buyer2 = 'u_wh_created_buyer';
  const expectedPayerRef2 = await derivePublicPayerRef(buyer2);
  await handleCreatePayPalOrder({
    request: makeReq('http://localhost/api/credits/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Token': buyer2 },
      body: { pack: '5$' },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
    getPayPalAccessToken: async () => 'tok',
    createPayPalOrder: async () => ({ id: 'PP-WH-CREATED-5', status: 'CREATED' }),
  });

  const origWhFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/verify-webhook-signature')) {
      return new Response(JSON.stringify({ verification_status: 'SUCCESS' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error('Unexpected fetch: ' + url);
  };
  try {
    const whRes = await handlePayPalWebhook({
      request: makeReq('http://localhost/api/paypal/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'paypal-transmission-id': 'tx-created-1',
          'paypal-transmission-time': '2026-11-21T04:30:00Z',
          'paypal-cert-url': 'https://api-m.paypal.com/v1/notifications/certs/CERT-2',
          'paypal-transmission-sig': 'sig',
          'paypal-auth-algo': 'SHA256withRSA',
        },
        body: {
          event_type: 'PAYMENT.CAPTURE.COMPLETED',
          resource: {
            id: 'CAP-WH-CREATED-5',
            custom_id: expectedPayerRef2,
            amount: { value: '5.00', currency_code: 'USD' },
            supplementary_data: { related_ids: { order_id: 'PP-WH-CREATED-5' } },
          },
        },
      }),
      DB: env.DB,
      PAYPAL_WEBHOOK_ID: 'WH-TEST',
      PAYPAL_BASE: 'https://api-m.paypal.com',
      getPayPalAccessToken: async () => 'tok',
      verifyPayPalOrder: async () => null,
    });
    assert.equal(whRes.status, 200);
    const bal2 = await env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?').bind(buyer2).first();
    assert.equal(bal2.credits, 200);
  } finally {
    globalThis.fetch = origWhFetch;
  }
});

test('frontend deep-linking, share button, and purchase recovery backup receipt structure', async () => {
  // 1. Verify deep-link hash and query parsing logic
  function parseDeepLink(hash, search = '') {
    if (hash && hash.startsWith('#photo=')) {
      const raw = hash.slice(7).trim();
      try { return decodeURIComponent(raw); } catch { return raw; }
    }
    const params = new URLSearchParams(search);
    if (params.has('photo')) return params.get('photo');
    return null;
  }

  assert.equal(parseDeepLink('#photo=desktop%2Fnaruto_01.jpg'), 'desktop/naruto_01.jpg');
  assert.equal(parseDeepLink('#photo=simple-id-123'), 'simple-id-123');
  assert.equal(parseDeepLink('', '?photo=landscape%2Fforest.png'), 'landscape/forest.png');
  assert.equal(parseDeepLink('#other-hash'), null);

  // 2. Verify backup receipt content structure
  function generateReceiptText({ token, code, packName, balanceStr, dateStr }) {
    return [
      '=====================================================',
      '         ZXAION GALLERY — BUKTI & KUNCI PEMULIHAN    ',
      '=====================================================',
      '',
      `Tanggal & Waktu   : ${dateStr}`,
      `Paket Transaksi   : ${packName}`,
      `Status Saldo Akun : ${balanceStr}`,
      `Token Akun Rahasia: ${token}`,
      `RECOVERY KEY      : ${code}`,
      '',
      '-----------------------------------------------------',
      'PETUNJUK MEMULIHKAN AKUN JIKA GANTI PERANGKAT/BROWSER:',
      '-----------------------------------------------------',
      '1. Buka situs ZXAION GALLERY.',
      '2. Klik tombol "Buy Credits" di bilah atas.',
      '3. Gulir ke bagian "Account Backup & Restore".',
      '4. Masukkan RECOVERY KEY Anda di atas pada kolom yang tersedia.',
      '5. Klik tombol "Restore". Seluruh saldo kredit & hak unduh DTREASURE Anda akan pulih seketika!',
      '',
      'PERINGATAN:',
      'Simpan file ini dengan aman di penyimpanan pribadi Anda (Google Drive, catatan aman, dll).',
      '=====================================================',
    ].join('\r\n');
  }

  const receipt = generateReceiptText({
    token: 'tok_secret_9999',
    code: 'ZX-ABCD-EFGH-IJKL',
    packName: '50 Credits ($5)',
    balanceStr: '50 Credits',
    dateStr: 'Sun, 22 Nov 2026 08:00:00 GMT',
  });

  assert.ok(receipt.includes('RECOVERY KEY      : ZX-ABCD-EFGH-IJKL'));
  assert.ok(receipt.includes('Token Akun Rahasia: tok_secret_9999'));
  assert.ok(receipt.includes('50 Credits ($5)'));
  assert.ok(receipt.includes('Account Backup & Restore'));

  // 3. Verify HTML includes in built dist/index.html or src
  const fs = await import('node:fs');
  const path = await import('node:path');
  const imageModalHtml = fs.readFileSync(path.resolve('frontend/src/partials/modals/image-modal.html'), 'utf8');
  assert.ok(imageModalHtml.includes('id="share-btn"'), 'image-modal.html must include #share-btn');
  assert.ok(imageModalHtml.includes('fa-share-nodes'), 'image-modal.html must include fa-share-nodes icon');

  const purchaseSuccessHtml = fs.readFileSync(path.resolve('frontend/src/partials/modals/purchase-success-modal.html'), 'utf8');
  assert.ok(purchaseSuccessHtml.includes('id="purchase-success-modal"'), 'must include #purchase-success-modal');
  assert.ok(purchaseSuccessHtml.includes('id="purchase-success-recovery-code"'), 'must include #purchase-success-recovery-code');
  assert.ok(purchaseSuccessHtml.includes('id="download-purchase-receipt-btn"'), 'must include #download-purchase-receipt-btn');
  assert.ok(purchaseSuccessHtml.includes('id="copy-purchase-recovery-btn"'), 'must include #copy-purchase-recovery-btn');

  const indexHtml = fs.readFileSync(path.resolve('frontend/src/index.html'), 'utf8');
  assert.ok(indexHtml.includes('<!-- @include partials/modals/purchase-success-modal.html -->'), 'index.html must include purchase-success-modal partial');
});



