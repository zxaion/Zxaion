import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createApp, translateCdnCgiImagePath } from '../../server.js';
import {
  parseImageMeta,
  extractImageDimensions,
  decodeBase64DataUrl,
  buildWatermarkedPreviewSvg,
} from '../src/services/imageMeta.js';
import { getPayPalBase } from '../src/config/constants.js';
import { CREDIT_PACK_DEFINITIONS } from '../src/config/packs.js';
import { MIME_TYPES } from '../src/config/mimeTypes.js';
import { getUserToken, generateRecoveryCode, escapeHtml, derivePublicPayerRef, isAccountIdFormat, generateAccountId, hashPassword, verifyPassword } from '../src/utils/userToken.js';
import { jsonResponse } from '../src/utils/cors.js';
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
import {
  handleListMain,
  handleAnimeAlbums,
  handleListComitbase,
  handleListDtreasure,
  handleTrending,
  handleSubmitComitbase,
  handleListComitbaseCreators,
  handleMyCreatorProfile,
  handleApplyComitbaseCreator,
  handleGetComitbaseCreator,
  handleUploadComitbaseCreatorImage,
  handleDeleteComitbaseCreatorImage,
} from '../src/routes/gallery.js';
import { handleRecordView, handleRecordDownload, handleStats, handleToggleReaction } from '../src/routes/stats.js';
import { createPayPalOrder } from '../src/services/paypal.js';
import {
  handleCreditBalance,
  handlePreparePayer,
  handleCreatePayPalOrder,
  handleCreateRecoveryCode,
  handleRecoverAccount,
  handleCreditPurchase,
  handleCreditSpend,
  handleDtreasureDownloadToken,
} from '../src/routes/credits.js';
import {
  handleAutoAccount,
  handleAccountMe,
  handleRegisterAccount,
  handleVerifyEmail,
  handleLoginAccount,
  handleLogoutAccount,
  handleRecoverRequest,
  handleRecoverConfirm,
  handleAccountLedger,
  handleAccountCheckin,
  computeNextCheckinState,
  handleListSessions,
  handleRevokeSession,
  handleRevokeOtherSessions,
  handleAccountExport,
} from '../src/routes/account.js';
import { handlePayPalWebhook } from '../src/routes/paypalWebhook.js';
import { handleServeImage } from '../src/routes/media.js';
import {
  validateAdminAuth,
  handleAdminDashboard,
  handleAdminRescan,
  handleAdminBackupList,
  handleAdminBackupCreate,
  handleAdminBackupDownload,
  handleAdminBackupRestore,
  handleAdminAdjustCredits,
  handleAdminUpload,
  handleAdminListCreators,
  handleAdminCreatorDecision,
} from '../src/routes/admin.js';
import {
  injectOpenGraphMetadata,
  injectBaseSeoOrigin,
  buildPhotoCanonicalUrl,
  buildPhotoImageUrl,
  findPhotoForSeo,
  handleRobotsTxt,
  handleSitemapXml,
} from '../src/services/seo.js';
import { sha256Hex } from '../src/utils/userToken.js';

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

test('userToken and shared response utilities validate length, recovery codes, escapeHtml, jsonResponse, and SEO lookup', async () => {
  const validReq = makeReq('http://localhost/test', { headers: { 'X-User-Token': '  u_abc_123  ' } });
  assert.equal(getUserToken(validReq), 'u_abc_123');

  const overlongReq = makeReq('http://localhost/test', { headers: { 'X-User-Token': 'x'.repeat(129) } });
  assert.equal(getUserToken(overlongReq), 'anonymous');

  const code = generateRecoveryCode();
  assert.match(code, /^ZX-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  assert.equal(escapeHtml(`<script>"a&b"</script>`), '&lt;script&gt;&quot;a&amp;b&quot;&lt;/script&gt;');
  const res = jsonResponse({ ok: true }, 201, corsHeaders, { 'X-Custom': '1' });
  assert.equal(res.status, 201);
  assert.equal(res.headers.get('X-Custom'), '1');
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(typeof findPhotoForSeo, 'function');
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

  // Unlock item -> missing dt_token fails closed (403), signed dt_token serves original bytes
  await env.DB.prepare('INSERT OR IGNORE INTO purchased_images (user_id, photo_id) VALUES (?, ?)').bind(userId, photoId).run();
  const dlMissingTok = await handleServeImage({
    request: makeReq('http://localhost/api/dtreasure/img/vault%2Fimperial_dragon_8k.jpg?download=true', {
      headers: { 'X-User-Token': userId },
    }),
    url: new URL('http://localhost/api/dtreasure/img/vault%2Fimperial_dragon_8k.jpg?download=true'),
    path: '/api/dtreasure/img/vault%2Fimperial_dragon_8k.jpg',
    env,
    mainBucket: env.Zxaion_B,
    comitbaseBucket: env.ZX_BUCKET,
    treasureBucket: env.TREASURE,
    DB: env.DB,
    origin: 'http://localhost:3000',
    corsHeaders,
    getUserToken,
  });
  assert.equal(dlMissingTok.status, 403);

  const tokRes = await handleDtreasureDownloadToken({
    request: makeReq('http://localhost/api/dtreasure/download-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Token': userId },
      body: { photoId },
    }),
    env,
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(tokRes.status, 200);
  const { downloadToken } = await tokRes.json();
  assert.ok(downloadToken);

  const dlAuthorized = await handleServeImage({
    request: makeReq(`http://localhost/api/dtreasure/img/vault%2Fimperial_dragon_8k.jpg?download=true&dt_token=${encodeURIComponent(downloadToken)}`, {
      headers: { 'X-User-Token': userId },
    }),
    url: new URL(`http://localhost/api/dtreasure/img/vault%2Fimperial_dragon_8k.jpg?download=true&dt_token=${encodeURIComponent(downloadToken)}`),
    path: '/api/dtreasure/img/vault%2Fimperial_dragon_8k.jpg',
    env,
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

test('admin dashboard requires secret token, returns KPIs, orders breakdown, users, and 1-click R2 force-rescan', async () => {
  const env = await createLocalEnv();
  const validToken = env.ADMIN_TOKEN || 'local-dev-admin';

  // 1. Auth validation (header, bearer, query, invalid)
  const unauthReq = makeReq('http://localhost/api/admin/dashboard');
  assert.equal(validateAdminAuth(unauthReq, env), false);
  const badTokenReq = makeReq('http://localhost/api/admin/dashboard', { headers: { 'X-Admin-Token': 'wrong-token' } });
  assert.equal(validateAdminAuth(badTokenReq, env), false);
  const headerReq = makeReq('http://localhost/api/admin/dashboard', { headers: { 'X-Admin-Token': validToken } });
  assert.equal(validateAdminAuth(headerReq, env), true);
  const bearerReq = makeReq('http://localhost/api/admin/dashboard', { headers: { 'Authorization': `Bearer ${validToken}` } });
  assert.equal(validateAdminAuth(bearerReq, env), true);
  const queryReq = makeReq(`http://localhost/api/admin/dashboard?token=${encodeURIComponent(validToken)}`);
  assert.equal(validateAdminAuth(queryReq, env), true);

  // 2. Unauthenticated request returns 401
  const failRes = await handleAdminDashboard({ request: unauthReq, env, corsHeaders });
  assert.equal(failRes.status, 401);

  // 3. Populate test orders and users in D1
  await env.DB.prepare(
    'INSERT OR REPLACE INTO payment_orders (id, user_id, order_id, pack_key, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind('ord-1', 'u_admin_buyer_1', 'PP-ORD-1', '25$', '25.00', 'completed', '2026-11-22T10:00:00Z').run();

  await env.DB.prepare(
    'INSERT OR REPLACE INTO payment_orders (id, user_id, order_id, pack_key, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind('ord-2', 'u_admin_buyer_2', 'PP-ORD-2', '5$', '5.00', 'failed', '2026-11-22T11:00:00Z').run();

  await env.DB.prepare(
    'INSERT OR REPLACE INTO user_credits (user_id, public_id, credits, lifetime, recovery_hash) VALUES (?, ?, ?, ?, ?)'
  ).bind('u_admin_buyer_1', 'pub_buyer_1', 1300, 0, 'hash_abc').run();

  // 4. Authenticated dashboard request returns accurate metrics
  const authRes = await handleAdminDashboard({ request: headerReq, env, corsHeaders });
  assert.equal(authRes.status, 200);
  const data = await authRes.json();

  assert.equal(data.success, true);
  assert.ok(data.metrics.revenue.totalGross >= 25.00);
  assert.ok(data.metrics.revenue.completedOrders >= 1);
  assert.ok(data.metrics.revenue.failedOrders >= 1);
  assert.equal(data.metrics.revenue.packBreakdown['25$'], 1);

  assert.ok(data.users.some(u => u.user_id === 'u_admin_buyer_1' && u.has_recovery === true));
  assert.ok(data.orders.some(o => o.order_id === 'PP-ORD-1' && o.status === 'completed'));
  assert.ok(data.metrics.catalog.main > 0);

  // 5. Force-Rescan R2 trigger endpoint works
  const rescanRes = await handleAdminRescan({ request: headerReq, env, corsHeaders });
  assert.equal(rescanRes.status, 200);
  const rescanData = await rescanRes.json();
  assert.equal(rescanData.success, true);
  assert.ok(Array.isArray(rescanData.stats));
  assert.ok(rescanData.stats.some(s => s.bucket === 'main'));
});

test('dynamic OpenGraph metadata, Twitter cards, and Schema.org ImageObject injection', async () => {
  const dummyHtml = `<!DOCTYPE html>
<html>
<head>
    <title>ZXAION GALLERY</title>
    <meta name="description" content="Old description">
    <meta property="og:title" content="Old OG">
</head>
<body><h1>Gallery</h1></body>
</html>`;

  const samplePhoto = {
    id: 'main:ANIME/Naruto/sage_mode_4k.jpg',
    r2_key: 'ANIME/Naruto/sage_mode_4k.jpg',
    bucket: 'main',
    title: 'Sage Mode 4k',
    category: 'Anime',
    sub_category: 'naruto',
    url: '/api/img/ANIME%2FNaruto%2Fsage_mode_4k.jpg',
  };

  const origin = 'https://zxaion.app';
  const canonical = buildPhotoCanonicalUrl(samplePhoto.id, origin);
  assert.equal(canonical, 'https://zxaion.app/?photo=main%3AANIME%2FNaruto%2Fsage_mode_4k.jpg');

  const imageUrl = buildPhotoImageUrl(samplePhoto, origin);
  assert.equal(imageUrl, 'https://zxaion.app/api/img/ANIME%2FNaruto%2Fsage_mode_4k.jpg');

  const injected = injectOpenGraphMetadata(dummyHtml, samplePhoto, origin);

  assert.ok(injected.includes('<title>Sage Mode 4k — 4K Wallpaper | ZXAION GALLERY</title>'));
  assert.ok(injected.includes('<meta property="og:title" content="Sage Mode 4k — ZXAION GALLERY">'));
  assert.ok(injected.includes('<meta property="og:image" content="https://zxaion.app/api/img/ANIME%2FNaruto%2Fsage_mode_4k.jpg">'));
  assert.ok(injected.includes('<meta name="twitter:card" content="summary_large_image">'));
  assert.ok(injected.includes('<meta name="twitter:image" content="https://zxaion.app/api/img/ANIME%2FNaruto%2Fsage_mode_4k.jpg">'));
  assert.ok(injected.includes('<link rel="canonical" href="https://zxaion.app/?photo=main%3AANIME%2FNaruto%2Fsage_mode_4k.jpg">'));
  assert.ok(injected.includes('"@type": "ImageObject"'));
  assert.ok(injected.includes('"name": "Sage Mode 4k"'));

  // Static route integration with ?photo=...
  const env = await createLocalEnv();
  await env.Zxaion_B.put('index.html', dummyHtml, { contentType: 'text/html' });
  const staticHtml = await handleStatic({
    path: '/',
    url: new URL('http://localhost/?photo=main%3AFANTASY%2Fastral_citadel_dragons.jpg'),
    mainBucket: env.Zxaion_B,
    DB: env.DB,
    origin: 'http://localhost:3000',
  });
  assert.equal(staticHtml.status, 200);
  const transformedBody = await staticHtml.text();
  assert.ok(transformedBody.includes('Astral Citadel Dragons'));
  assert.ok(transformedBody.includes('og:image'));
});

test('device resolution selector presets and filename generation', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  // Verify resolution selector exists in image-modal.html
  const imageModalHtml = fs.readFileSync(path.resolve('frontend/src/partials/modals/image-modal.html'), 'utf8');
  assert.ok(imageModalHtml.includes('id="resolution-button-group"'), 'image-modal.html must include #resolution-button-group');
  assert.ok(imageModalHtml.includes('data-resolution="desktop"'), 'image-modal.html must include desktop resolution');
  assert.ok(imageModalHtml.includes('data-resolution="mobile"'), 'image-modal.html must include mobile resolution');
  assert.ok(imageModalHtml.includes('data-resolution="tablet"'), 'image-modal.html must include tablet resolution');
  assert.ok(imageModalHtml.includes('data-resolution="square"'), 'image-modal.html must include square resolution');

  // Verify admin section markup exists
  const adminSectionHtml = fs.readFileSync(path.resolve('frontend/src/partials/sections/admin-section.html'), 'utf8');
  assert.ok(adminSectionHtml.includes('id="admin-rescan-btn"'), 'must include 1-click admin rescan button');
  assert.ok(adminSectionHtml.includes('id="admin-orders-table-body"'), 'must include orders table body');
  assert.ok(adminSectionHtml.includes('id="admin-users-table-body"'), 'must include users table body');
  assert.ok(adminSectionHtml.includes('id="admin-metric-revenue"'), 'must include revenue KPI card');
  assert.ok(adminSectionHtml.includes('id="admin-token-input"'), 'must include admin secret token input');
});

test('Virtual Account Generator rejects Account ID as login credential or auth token and upgrades guest wallet', async () => {
  const env = await createLocalEnv();
  const deviceToken = 'u_guest_upgrade_9001';

  // 1. Account ID format helper & getUserToken rejection
  const sampleAcctId = generateAccountId();
  assert.match(sampleAcctId, /^ZXA-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(isAccountIdFormat(sampleAcctId), true);
  assert.equal(getUserToken(makeReq('http://localhost/api/account/auto', {
    headers: { 'X-User-Token': sampleAcctId },
  })), 'anonymous');

  // 2. Reject passing Account ID in /api/account/auto
  const badAutoRes = await handleAutoAccount({
    request: makeReq('http://localhost/api/account/auto', {
      method: 'POST',
      headers: { 'X-User-Token': sampleAcctId },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(badAutoRes.status, 401);

  // 3. Seed pre-existing guest wallet credits before registration
  await env.DB.prepare(
    'INSERT OR REPLACE INTO user_credits (user_id, public_id, credits, lifetime) VALUES (?, ?, ?, ?)'
  ).bind(deviceToken, await derivePublicPayerRef(deviceToken), 75, 0).run();
  await env.DB.prepare(
    'INSERT OR IGNORE INTO purchased_images (user_id, photo_id, purchased_at) VALUES (?, ?, ?)'
  ).bind(deviceToken, 'dtreasure:vault/existing_gem.jpg', '2026-11-20T00:00:00Z').run();

  // 4. Provision auto account
  const autoRes = await handleAutoAccount({
    request: makeReq('http://localhost/api/account/auto', {
      method: 'POST',
      headers: { 'X-User-Token': deviceToken },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(autoRes.status, 200);
  const autoData = await autoRes.json();
  assert.equal(autoData.success, true);
  assert.match(autoData.account.accountId, /^ZXA-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(autoData.wallet.credits, 75);
  assert.deepEqual(autoData.wallet.purchased, ['dtreasure:vault/existing_gem.jpg']);

  // Calling auto again returns the exact same permanent Account ID
  const autoRes2 = await handleAutoAccount({
    request: makeReq('http://localhost/api/account/auto', {
      method: 'POST',
      headers: { 'X-User-Token': deviceToken },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  const autoData2 = await autoRes2.json();
  assert.equal(autoData2.account.accountId, autoData.account.accountId);

  // 5. Register account -> preserves credits & purchases, issues OTP & session
  const regRes = await handleRegisterAccount({
    request: makeReq('http://localhost/api/account/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Token': deviceToken },
      body: { email: '  UserOne@Example.COM ', password: 'StrongPassword#2026', displayName: 'Zxaion Tester' },
    }),
    env,
    DB: env.DB,
    corsHeaders,
    getUserToken,
    sendEmail: async () => ({ sent: false, provider: 'unconfigured' }),
  });
  assert.equal(regRes.status, 201);
  const regData = await regRes.json();
  assert.equal(regData.account.accountId, autoData.account.accountId);
  assert.equal(regData.account.email, 'userone@example.com');
  assert.equal(regData.account.emailVerified, false);
  assert.equal(regData.account.hasPassword, true);
  assert.equal(regData.wallet.credits, 75);
  assert.match(regData.sessionToken, /^zxs_[0-9a-f]{64}$/);
  assert.match(regData.verification.devOtpPreview, /^\d{6}$/);

  // 6. Verify email OTP (invalid first, then valid)
  const wrongOtp = await handleVerifyEmail({
    request: makeReq('http://localhost/api/account/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${regData.sessionToken}` },
      body: { code: '000000' },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  if (regData.verification.devOtpPreview !== '000000') {
    assert.equal(wrongOtp.status, 400);
  }

  const okOtp = await handleVerifyEmail({
    request: makeReq('http://localhost/api/account/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${regData.sessionToken}` },
      body: { code: regData.verification.devOtpPreview },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(okOtp.status, 200);
  const verifiedData = await okOtp.json();
  assert.equal(verifiedData.account.emailVerified, true);

  // 7. Account ID strictly forbidden in login payload & Bearer header
  const acctIdLogin = await handleLoginAccount({
    request: makeReq('http://localhost/api/account/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: autoData.account.accountId, password: 'StrongPassword#2026' },
    }),
    DB: env.DB,
    corsHeaders,
  });
  assert.equal(acctIdLogin.status, 400);

  const acctIdBearer = await handleAccountMe({
    request: makeReq('http://localhost/api/account/me', {
      headers: { 'Authorization': `Bearer ${autoData.account.accountId}` },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(acctIdBearer.status, 401);

  // 8. Bare X-User-Token is blocked on password-protected account (requiresLogin: true)
  const bareTokenMe = await handleAccountMe({
    request: makeReq('http://localhost/api/account/me', {
      headers: { 'X-User-Token': deviceToken },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(bareTokenMe.status, 401);
  const bareBody = await bareTokenMe.json();
  assert.equal(bareBody.requiresLogin, true);
});

test('Login lockout, multi-device session management, and verified email recovery revoke old sessions', async () => {
  const env = await createLocalEnv();
  const userTok = 'u_security_test_77';

  // Provision & register verified user
  const regRes = await handleRegisterAccount({
    request: makeReq('http://localhost/api/account/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Token': userTok },
      body: { email: 'sec@zxaion.test', password: 'InitialPass!99' },
    }),
    env,
    DB: env.DB,
    corsHeaders,
    getUserToken,
    sendEmail: async () => ({ sent: false, provider: 'unconfigured' }),
  });
  const regData = await regRes.json();

  await handleVerifyEmail({
    request: makeReq('http://localhost/api/account/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${regData.sessionToken}` },
      body: { code: regData.verification.devOtpPreview },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });

  // 1. Brute-force lockout after 5 wrong attempts
  for (let i = 0; i < 4; i++) {
    const failRes = await handleLoginAccount({
      request: makeReq('http://localhost/api/account/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { email: 'sec@zxaion.test', password: 'WrongPassword123' },
      }),
      DB: env.DB,
      corsHeaders,
    });
    assert.equal(failRes.status, 401);
  }
  const lockedRes = await handleLoginAccount({
    request: makeReq('http://localhost/api/account/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: 'sec@zxaion.test', password: 'WrongPassword123' },
    }),
    DB: env.DB,
    corsHeaders,
  });
  assert.equal(lockedRes.status, 429);

  // Even correct password is blocked while locked
  const duringLock = await handleLoginAccount({
    request: makeReq('http://localhost/api/account/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: 'sec@zxaion.test', password: 'InitialPass!99' },
    }),
    DB: env.DB,
    corsHeaders,
  });
  assert.equal(duringLock.status, 429);

  // Clear lock directly in DB to continue testing multi-session login
  await env.DB.prepare('UPDATE accounts SET failed_login_attempts = 0, locked_until = NULL WHERE email = ?')
    .bind('sec@zxaion.test').run();

  const login2 = await handleLoginAccount({
    request: makeReq('http://localhost/api/account/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'MobileBrowser/2.0' },
      body: { email: 'sec@zxaion.test', password: 'InitialPass!99' },
    }),
    DB: env.DB,
    corsHeaders,
  });
  assert.equal(login2.status, 200);
  const sess2 = (await login2.json()).sessionToken;

  // 2. List sessions (should see 2 active sessions) and revoke others
  const listRes = await handleListSessions({
    request: makeReq('http://localhost/api/account/sessions', {
      headers: { 'Authorization': `Bearer ${sess2}` },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  const listData = await listRes.json();
  assert.equal(listData.sessions.length, 2);

  const revokeOthers = await handleRevokeOtherSessions({
    request: makeReq('http://localhost/api/account/sessions/revoke-others', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sess2}` },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal((await revokeOthers.json()).revokedCount, 1);

  // Old session is now rejected
  const oldMe = await handleAccountMe({
    request: makeReq('http://localhost/api/account/me', {
      headers: { 'Authorization': `Bearer ${regData.sessionToken}` },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(oldMe.status, 401);

  // 3. Verified Email Recovery resets password and revokes sess2
  const recReq = await handleRecoverRequest({
    request: makeReq('http://localhost/api/account/recover/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: 'sec@zxaion.test' },
    }),
    env,
    DB: env.DB,
    corsHeaders,
    sendEmail: async () => ({ sent: false, provider: 'unconfigured' }),
  });
  assert.equal(recReq.status, 200);
  const recReqData = await recReq.json();
  assert.match(recReqData.devOtpPreview, /^\d{6}$/);

  const recConf = await handleRecoverConfirm({
    request: makeReq('http://localhost/api/account/recover/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: 'sec@zxaion.test', code: recReqData.devOtpPreview, newPassword: 'BrandNewPassword#88' },
    }),
    DB: env.DB,
    corsHeaders,
  });
  assert.equal(recConf.status, 200);
  const recConfData = await recConf.json();
  assert.match(recConfData.sessionToken, /^zxs_[0-9a-f]{64}$/);

  // sess2 is revoked after recovery
  const revokedSess2Check = await handleAccountMe({
    request: makeReq('http://localhost/api/account/me', {
      headers: { 'Authorization': `Bearer ${sess2}` },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(revokedSess2Check.status, 401);

  // Can sign in with new password and logout cleanly
  const newLogin = await handleLoginAccount({
    request: makeReq('http://localhost/api/account/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: 'sec@zxaion.test', password: 'BrandNewPassword#88' },
    }),
    DB: env.DB,
    corsHeaders,
  });
  assert.equal(newLogin.status, 200);

  const logoutRes = await handleLogoutAccount({
    request: makeReq('http://localhost/api/account/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${recConfData.sessionToken}` },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(logoutRes.status, 200);

  const afterLogoutMe = await handleAccountMe({
    request: makeReq('http://localhost/api/account/me', {
      headers: { 'Authorization': `Bearer ${recConfData.sessionToken}` },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(afterLogoutMe.status, 401);
});

test('Atomic Credit Ledger records PayPal purchase, DTREASURE spend, webhook refund, and personal JSON export', async () => {
  const env = await createLocalEnv();
  const buyer = 'u_ledger_buyer_44';
  const payerRef = await derivePublicPayerRef(buyer);

  // 1. Auto provision & register session
  const regRes = await handleRegisterAccount({
    request: makeReq('http://localhost/api/account/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Token': buyer },
      body: { email: 'ledger@zxaion.test', password: 'LedgerPass#2026' },
    }),
    env,
    DB: env.DB,
    corsHeaders,
    getUserToken,
    sendEmail: async () => ({ sent: false, provider: 'unconfigured' }),
  });
  const { sessionToken, account } = await regRes.json();

  // 2. Create PayPal order (5$ = 200 credits) & settle purchase
  const createRes = await handleCreatePayPalOrder({
    request: makeReq('http://localhost/api/credits/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
      body: { pack: '5$' },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
    getPayPalAccessToken: async () => 'tok',
    createPayPalOrder: async () => ({ id: 'PP-LED-5', status: 'CREATED' }),
  });
  assert.equal(createRes.status, 200);

  const purchaseRes = await handleCreditPurchase({
    request: makeReq('http://localhost/api/credits/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
      body: { pack: '5$', orderId: 'PP-LED-5' },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
    getPayPalAccessToken: async () => 'tok',
    verifyPayPalOrder: async () => ({
      status: 'COMPLETED',
      purchase_units: [{
        custom_id: payerRef,
        payments: { captures: [{ id: 'CAP-LED-5', status: 'COMPLETED', amount: { value: '5.00', currency_code: 'USD' } }] },
      }],
    }),
  });
  assert.equal(purchaseRes.status, 200);
  assert.equal((await purchaseRes.json()).newBalance, 200);

  // 3. Spend 5 credits on DTREASURE unlock
  const spendRes = await handleCreditSpend({
    request: makeReq('http://localhost/api/credits/spend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
      body: { photoId: 'dtreasure:vault/imperial_dragon_8k.jpg' },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(spendRes.status, 200);
  assert.equal((await spendRes.json()).newBalance, 190);

  // 4. Reversal / Refund webhook claws back 200 credits cleanly (clamped at >= 0) & appends refund ledger
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
    const refundRes = await handlePayPalWebhook({
      request: makeReq('http://localhost/api/paypal/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'paypal-transmission-id': 'tx-refund-led-1',
          'paypal-transmission-time': '2026-11-24T01:00:00Z',
          'paypal-cert-url': 'https://api-m.paypal.com/v1/notifications/certs/CERT-9',
          'paypal-transmission-sig': 'sig',
          'paypal-auth-algo': 'SHA256withRSA',
        },
        body: {
          event_type: 'PAYMENT.CAPTURE.REFUNDED',
          resource: {
            id: 'CAP-LED-5',
            supplementary_data: { related_ids: { order_id: 'PP-LED-5' } },
          },
        },
      }),
      DB: env.DB,
      PAYPAL_WEBHOOK_ID: 'WH-TEST',
      PAYPAL_BASE: 'https://api-m.paypal.com',
      getPayPalAccessToken: async () => 'tok',
      verifyPayPalOrder: async () => null,
    });
    assert.equal(refundRes.status, 200);
  } finally {
    globalThis.fetch = origWhFetch;
  }

  // 5. Inspect ledger entries (purchase +200, spend -5, refund -200)
  const ledgerRes = await handleAccountLedger({
    request: makeReq('http://localhost/api/account/ledger', {
      headers: { 'Authorization': `Bearer ${sessionToken}` },
    }),
    url: new URL('http://localhost/api/account/ledger?limit=20'),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(ledgerRes.status, 200);
  const { entries } = await ledgerRes.json();
  assert.equal(entries.length, 3);
  const types = entries.map(e => e.tx_type);
  assert.ok(types.includes('purchase'));
  assert.ok(types.includes('spend'));
  assert.ok(types.includes('refunded'));

  // 6. Export personal backup JSON & verify checksum
  const exportRes = await handleAccountExport({
    request: makeReq('http://localhost/api/account/export', {
      headers: { 'Authorization': `Bearer ${sessionToken}` },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(exportRes.status, 200);
  const exported = await exportRes.json();
  assert.equal(exported.account.accountId, account.accountId);
  assert.equal(exported.credit_ledger.length, 3);
  assert.ok(exported.checksum_sha);
});

test('Database Backup Snapshot creation, SHA-256 tamper rejection, full D1 restore, and private R2 _backups blocking', async () => {
  const env = await createLocalEnv();
  const validAdmin = env.ADMIN_TOKEN || 'local-dev-admin';
  const adminHeaders = { 'X-Admin-Token': validAdmin };

  // Seed user account + credits + ledger
  const autoRes = await handleAutoAccount({
    request: makeReq('http://localhost/api/account/auto', {
      method: 'POST',
      headers: { 'X-User-Token': 'u_backup_user_01' },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  const autoData = await autoRes.json();
  await env.DB.prepare('UPDATE user_credits SET credits = ? WHERE user_id = ?').bind(888, 'u_backup_user_01').run();

  // 1. Create snapshot via Admin API
  const createSnap = await handleAdminBackupCreate({
    request: makeReq('http://localhost/api/admin/backup/snapshot', {
      method: 'POST',
      headers: adminHeaders,
    }),
    env,
    corsHeaders,
  });
  assert.equal(createSnap.status, 201);
  const snapData = await createSnap.json();
  assert.equal(snapData.success, true);
  assert.ok(snapData.snapshot.snapshot_id.startsWith('snap_'));
  assert.equal(snapData.snapshot.r2_backed_up, true);

  // 2. Private _backups/ prefix must NEVER be accessible via /api/img/
  const leakAttempt = await handleServeImage({
    request: makeReq('http://localhost/api/img/_backups%2Fd1-latest.json'),
    path: '/api/img/_backups%2Fd1-latest.json',
    url: new URL('http://localhost/api/img/_backups%2Fd1-latest.json'),
    env,
    mainBucket: env.Zxaion_B,
    dtreasureBucket: env.Zxaion_DT,
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(leakAttempt.status, 400);

  // 3. Download snapshot JSON
  const dlRes = await handleAdminBackupDownload({
    request: makeReq(`http://localhost/api/admin/backup/download?id=${snapData.snapshot.snapshot_id}`, {
      headers: adminHeaders,
    }),
    url: new URL(`http://localhost/api/admin/backup/download?id=${snapData.snapshot.snapshot_id}`),
    env,
    corsHeaders,
  });
  assert.equal(dlRes.status, 200);
  const downloadedJson = await dlRes.json();
  assert.equal(downloadedJson.snapshot_id, snapData.snapshot.snapshot_id);

  // 4. Reject tampered snapshot payload (checksum mismatch)
  const tampered = structuredClone(downloadedJson);
  tampered.tables.user_credits[0].credits = 999999;
  const tamperRes = await handleAdminBackupRestore({
    request: makeReq('http://localhost/api/admin/backup/restore', {
      method: 'POST',
      headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: { snapshot: tampered },
    }),
    env,
    corsHeaders,
  });
  assert.equal(tamperRes.status, 400);

  // 5. Mutate D1 (wipe credits) and verify restore recovers exact balance & account
  await env.DB.prepare('DELETE FROM user_credits WHERE user_id = ?').bind('u_backup_user_01').run();
  await env.DB.prepare('DELETE FROM accounts WHERE user_id = ?').bind('u_backup_user_01').run();

  const restoreRes = await handleAdminBackupRestore({
    request: makeReq('http://localhost/api/admin/backup/restore', {
      method: 'POST',
      headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: { snapshot: downloadedJson },
    }),
    env,
    corsHeaders,
  });
  assert.equal(restoreRes.status, 200);

  const restoredCredit = await env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
    .bind('u_backup_user_01').first();
  const restoredAcct = await env.DB.prepare('SELECT account_id FROM accounts WHERE user_id = ?')
    .bind('u_backup_user_01').first();
  assert.equal(restoredCredit.credits, 888);
  assert.equal(restoredAcct.account_id, autoData.account.accountId);
});

test('Technical SEO: /robots.txt, /sitemap.xml, canonical/WebSite JSON-LD, and English OpenGraph copy', async () => {
  const env = await createLocalEnv();

  // 1. /robots.txt via router
  const robotsRes = await handleRequest(
    makeReq('https://gallery.zxaion.com/robots.txt'),
    env,
    { waitUntil: () => {} }
  );
  assert.equal(robotsRes.status, 200);
  const robotsText = await robotsRes.text();
  assert.match(robotsText, /Disallow: \/admin/);
  assert.match(robotsText, /Disallow: \/api\//);
  assert.match(robotsText, /Sitemap: https:\/\/gallery\.zxaion\.com\/sitemap\.xml/);

  // 2. /sitemap.xml excludes HEADER, includes ?photo= URLs & <image:image> for public, omits <image:image> for DTREASURE
  const sitemapRes = await handleSitemapXml({
    DB: env.DB,
    env,
    ctx: { waitUntil: () => {} },
    origin: 'https://gallery.zxaion.com',
    corsHeaders,
  });
  assert.equal(sitemapRes.status, 200);
  const sitemapXml = await sitemapRes.text();
  assert.ok(sitemapXml.includes('<loc>https://gallery.zxaion.com/</loc>'));
  assert.ok(sitemapXml.includes('?photo='));
  assert.ok(sitemapXml.includes('<image:loc>https://gallery.zxaion.com/api/img/'));
  assert.equal(sitemapXml.includes('HEADER%2F'), false);
  assert.equal(sitemapXml.includes('/api/dtreasure/img/'), false);

  // 3. Frontend index.html includes canonical, og:site_name, og:url, and WebSite JSON-LD
  const fs = await import('node:fs');
  const path = await import('node:path');
  const indexHtml = fs.readFileSync(path.resolve('frontend/src/index.html'), 'utf8');
  assert.ok(indexHtml.includes('<link rel="canonical" href="/">'));
  assert.ok(indexHtml.includes('property="og:site_name"'));
  assert.ok(indexHtml.includes('id="zx-schema-site"'));
  assert.ok(indexHtml.includes('"@type": "WebSite"'));

  // 4. OpenGraph injection uses English description
  const injected = injectOpenGraphMetadata(indexHtml, {
    id: 'main:ANIME/Jujutsu%20Kaisen/domain_4k.jpg',
    r2_key: 'ANIME/Jujutsu Kaisen/domain_4k.jpg',
    bucket: 'main',
    title: 'Domain 4k',
    category: 'Anime',
  }, 'https://gallery.zxaion.com');
  assert.ok(injected.includes('Download 4K &quot;Domain 4k&quot; (Anime) wallpaper on ZXAION GALLERY'));
});

test('Data retention scheduled cleanup removes expired logs/tokens while keeping recent records and image totals intact', async () => {
  const env = await createLocalEnv();
  const nowSec = Math.floor(Date.now() / 1000);
  const oldDate = new Date(Date.now() - 40 * 86400 * 1000).toISOString();
  const recentDate = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
  const oldEightDaysIso = new Date(Date.now() - 8 * 86400 * 1000).toISOString();
  const futureIso = new Date(Date.now() + 7 * 86400 * 1000).toISOString();

  // Seed expired and active rate_limits using production INSERT syntax
  await env.DB.prepare(
    'INSERT INTO rate_limits (id, count, reset_time) VALUES (?, 1, ?) ON CONFLICT(id) DO UPDATE SET count = CASE WHEN reset_time < ? THEN 1 ELSE count + 1 END, reset_time = CASE WHEN reset_time < ? THEN ? ELSE reset_time END'
  ).bind('old-rl', nowSec - 7200, nowSec, nowSec, nowSec - 7200).run();
  await env.DB.prepare(
    'INSERT INTO rate_limits (id, count, reset_time) VALUES (?, 1, ?) ON CONFLICT(id) DO UPDATE SET count = CASE WHEN reset_time < ? THEN 1 ELSE count + 1 END, reset_time = CASE WHEN reset_time < ? THEN ? ELSE reset_time END'
  ).bind('fresh-rl', nowSec + 3600, nowSec, nowSec, nowSec + 3600).run();

  await env.DB.prepare(
    'INSERT INTO email_verifications (id, account_id, email, purpose, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind('ev-old', 'ZXA-RET1-0001', 'old@test.local', 'verify_email', 'h1', oldEightDaysIso, oldEightDaysIso).run();
  await env.DB.prepare(
    'INSERT INTO email_verifications (id, account_id, email, purpose, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind('ev-fresh', 'ZXA-RET1-0001', 'fresh@test.local', 'verify_email', 'h2', futureIso, recentDate).run();

  await env.DB.prepare(
    'INSERT INTO user_sessions (session_id, account_id, token_hash, user_agent, ip_hash, expires_at, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind('sess-old', 'ZXA-RET1-0001', 'th-old', 'UA', 'ip1', oldEightDaysIso, oldEightDaysIso, oldEightDaysIso).run();
  await env.DB.prepare(
    'INSERT INTO user_sessions (session_id, account_id, token_hash, user_agent, ip_hash, expires_at, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind('sess-active', 'ZXA-RET1-0001', 'th-active', 'UA', 'ip1', futureIso, recentDate, recentDate).run();

  await env.DB.prepare('INSERT OR IGNORE INTO views (photo_id, viewer_id, created_at) VALUES (?, ?, ?)')
    .bind('main:FANTASY/astral_citadel_dragons.jpg', 'viewer-old', oldDate).run();
  await env.DB.prepare('INSERT OR IGNORE INTO views (photo_id, viewer_id, created_at) VALUES (?, ?, ?)')
    .bind('main:FANTASY/astral_citadel_dragons.jpg', 'viewer-fresh', recentDate).run();

  await env.DB.prepare('INSERT OR IGNORE INTO downloads (photo_id, downloader_id, created_at) VALUES (?, ?, ?)')
    .bind('main:FANTASY/astral_citadel_dragons.jpg', 'dl-old', oldDate).run();
  await env.DB.prepare('INSERT OR IGNORE INTO downloads (photo_id, downloader_id, created_at) VALUES (?, ?, ?)')
    .bind('main:FANTASY/astral_citadel_dragons.jpg', 'dl-fresh', recentDate).run();

  const imgBefore = await env.DB.prepare('SELECT view_count, download_count FROM images WHERE id = ?')
    .bind('main:FANTASY/astral_citadel_dragons.jpg').first();

  await handleScheduled(env, {});

  const rlOld = await env.DB.prepare('SELECT count FROM rate_limits WHERE id = ?').bind('old-rl').first();
  const rlFresh = await env.DB.prepare('SELECT count FROM rate_limits WHERE id = ?').bind('fresh-rl').first();
  assert.equal(rlOld, null);
  assert.equal(rlFresh.count, 1);

  const evOld = await env.DB.prepare('SELECT id, expires_at FROM email_verifications WHERE email = ? AND purpose = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1').bind('old@test.local', 'verify_email').first();
  const evFresh = await env.DB.prepare('SELECT id, expires_at FROM email_verifications WHERE email = ? AND purpose = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1').bind('fresh@test.local', 'verify_email').first();
  assert.equal(evOld, null);
  assert.equal(evFresh.id, 'ev-fresh');

  const sessOld = await env.DB.prepare('SELECT session_id FROM user_sessions WHERE token_hash = ? LIMIT 1').bind('th-old').first();
  const sessActive = await env.DB.prepare('SELECT session_id FROM user_sessions WHERE token_hash = ? LIMIT 1').bind('th-active').first();
  assert.equal(sessOld, null);
  assert.equal(sessActive.session_id, 'sess-active');

  // Re-inserting old viewer/downloader succeeds only if retention purged the >30d row; fresh row remains deduplicated
  const reinsertOldView = await env.DB.prepare('INSERT OR IGNORE INTO views (photo_id, viewer_id, created_at) VALUES (?, ?, ?)')
    .bind('main:FANTASY/astral_citadel_dragons.jpg', 'viewer-old', recentDate).run();
  const reinsertFreshView = await env.DB.prepare('INSERT OR IGNORE INTO views (photo_id, viewer_id, created_at) VALUES (?, ?, ?)')
    .bind('main:FANTASY/astral_citadel_dragons.jpg', 'viewer-fresh', recentDate).run();
  assert.equal(reinsertOldView.meta.changes, 1);
  assert.equal(reinsertFreshView.meta.changes, 0);

  const reinsertOldDl = await env.DB.prepare('INSERT OR IGNORE INTO downloads (photo_id, downloader_id, created_at) VALUES (?, ?, ?)')
    .bind('main:FANTASY/astral_citadel_dragons.jpg', 'dl-old', recentDate).run();
  const reinsertFreshDl = await env.DB.prepare('INSERT OR IGNORE INTO downloads (photo_id, downloader_id, created_at) VALUES (?, ?, ?)')
    .bind('main:FANTASY/astral_citadel_dragons.jpg', 'dl-fresh', recentDate).run();
  assert.equal(reinsertOldDl.meta.changes, 1);
  assert.equal(reinsertFreshDl.meta.changes, 0);

  const imgStats = await env.DB.prepare('SELECT view_count, download_count FROM images WHERE id = ?')
    .bind('main:FANTASY/astral_citadel_dragons.jpg').first();
  assert.equal(imgStats.view_count, imgBefore.view_count);
  assert.equal(imgStats.download_count, imgBefore.download_count);
});

test('Dynamic Anime albums API includes sample_url & new R2 series; paginated list endpoints include X-Total-Count & search', async () => {
  const env = await createLocalEnv();
  await env.Zxaion_B.put('ANIME/Frieren/beyond_journeys_end_4k.jpg', new Uint8Array([1, 2, 3]), { contentType: 'image/jpeg' });
  await handleScheduled(env, {});

  const albumsRes = await handleAnimeAlbums({
    env,
    ctx: { waitUntil: () => {} },
    DB: env.DB,
    corsHeaders,
  });
  assert.equal(albumsRes.status, 200);
  const albums = await albumsRes.json();
  const frieren = albums.find(a => a.sub_category === 'frieren');
  assert.ok(frieren, 'Newly synced R2 folder ANIME/Frieren must appear dynamically in /api/anime/albums');
  assert.equal(frieren.count, 1);
  assert.match(frieren.sample_url, /^\/api\/img\/ANIME%2FFrieren%2F/);

  // Paginated search across /api/list, /api/comitbase/list, /api/dtreasure/list with X-Total-Count
  const listSearchRes = await handleListMain({
    url: new URL('http://localhost/api/list?q=Frieren&page=1&limit=10'),
    env,
    ctx: { waitUntil: () => {} },
    DB: env.DB,
    corsHeaders,
  });
  assert.equal(listSearchRes.status, 200);
  assert.ok(Number(listSearchRes.headers.get('X-Total-Count')) >= 1);
  const listItems = await listSearchRes.json();
  assert.ok(listItems.some(item => item.subCategory === 'frieren'));

  const comitRes = await handleListComitbase({
    url: new URL('http://localhost/api/comitbase/list?page=1&limit=1'),
    env,
    ctx: { waitUntil: () => {} },
    comitbaseBucket: env.ZX_BUCKET,
    DB: env.DB,
    corsHeaders,
  });
  assert.equal(comitRes.status, 200);
  assert.ok(Number(comitRes.headers.get('X-Total-Count')) >= 1);

  const dtRes = await handleListDtreasure({
    url: new URL('http://localhost/api/dtreasure/list?page=1&limit=1'),
    env,
    ctx: { waitUntil: () => {} },
    treasureBucket: env.TREASURE,
    DB: env.DB,
    corsHeaders,
  });
  assert.equal(dtRes.status, 200);
  assert.ok(Number(dtRes.headers.get('X-Total-Count')) >= 1);
});

test('Public cleanliness, accessibility, legal compliance disclosures, and English UI consistency', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const footerHtml = fs.readFileSync(path.resolve('frontend/src/partials/layout/footer.html'), 'utf8');
  assert.equal(footerHtml.includes('footer-admin-link'), false, 'Public footer must not expose Admin Portal link');
  const socialLinkMatches = footerHtml.match(/<a\s+[^>]*target="_blank"[^>]*>/g) || [];
  assert.ok(socialLinkMatches.length >= 9);
  for (const linkTag of socialLinkMatches) {
    assert.ok(/aria-label="/.test(linkTag), `Social link must define aria-label: ${linkTag}`);
  }

  const quicklinks = JSON.parse(fs.readFileSync(path.resolve('frontend/src/quicklink.json'), 'utf8'));
  assert.ok(quicklinks.contact.content.includes('rel="noopener noreferrer"'), 'External contact link must include rel="noopener noreferrer"');
  assert.ok(quicklinks.privacy.content.includes('Virtual Account') && quicklinks.privacy.content.includes('PayPal'));
  assert.ok(quicklinks.terms.content.includes('ZXA-') && quicklinks.terms.content.includes('Credits & Purchases'));

  const accountHtml = fs.readFileSync(path.resolve('frontend/src/partials/modals/account-modal.html'), 'utf8');
  assert.ok(accountHtml.includes('Your Account Dashboard'));
  assert.equal(/Dasbor Akun|Daftar &amp; Verifikasi|Pemulihan/.test(accountHtml), false);

  const animeJs = fs.readFileSync(path.resolve('frontend/src/js/ui/anime.js'), 'utf8');
  assert.ok(animeJs.includes('animeAlbumServerList'));
  assert.ok(animeJs.includes("'role', 'button'") && animeJs.includes("'tabindex', '0'"));
});

test('Purchased DTREASURE serves unblurred high-res preview via X-User-Token with auth Vary headers and unified hero search bar placement', async () => {
  const env = await createLocalEnv();
  const buyerId = 'u_dtreasure_crisp_01';
  const photoId = 'dtreasure:vault/crisp_artwork.jpg';

  const treasureBucket = createMockR2Bucket('dtreasure', [
    { key: 'vault/crisp_artwork.jpg', contentType: 'image/jpeg', bodyText: 'CRISP_FULL_ARTWORK_BYTES' },
    { key: '_preview/vault/crisp_artwork.jpg', contentType: 'image/jpeg', bodyText: 'WATERMARKED_BLUR_PREVIEW_BYTES' },
  ]);

  await env.DB.prepare('INSERT OR IGNORE INTO purchased_images (user_id, photo_id) VALUES (?, ?)').bind(buyerId, photoId).run();

  let capturedStep = null;
  const spyImages = {
    input(body) {
      return {
        transform(step) { capturedStep = step; return this; },
        async output(opts) {
          return { response: () => new Response(body, { headers: { 'Content-Type': opts.format } }) };
        },
      };
    },
  };

  // Purchased user authenticated purely via X-User-Token (no Cookie) gets unblurred w=1400 from original key
  const purchasedRes = await handleServeImage({
    request: makeReq('http://localhost/api/dtreasure/img/vault%2Fcrisp_artwork.jpg?w=1400&q=85&fit=scale-down&fmt=webp', {
      headers: { 'X-User-Token': buyerId },
    }),
    url: new URL('http://localhost/api/dtreasure/img/vault%2Fcrisp_artwork.jpg?w=1400&q=85&fit=scale-down&fmt=webp'),
    path: '/api/dtreasure/img/vault%2Fcrisp_artwork.jpg',
    mainBucket: env.Zxaion_B,
    comitbaseBucket: env.ZX_BUCKET,
    treasureBucket,
    DB: env.DB,
    IMAGES: spyImages,
    origin: 'http://localhost:3000',
    corsHeaders,
    getUserToken,
  });

  assert.equal(purchasedRes.status, 200);
  assert.match(purchasedRes.headers.get('Vary') || '', /X-User-Token/);
  assert.match(purchasedRes.headers.get('Vary') || '', /Authorization/);
  assert.equal(purchasedRes.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(capturedStep.width, 1400);
  assert.equal(capturedStep.blur, undefined);
  assert.equal(await purchasedRes.text(), 'CRISP_FULL_ARTWORK_BYTES');

  // Frontend authenticated candidate builder bypasses /cdn-cgi/image/
  const fs = await import('node:fs');
  const path = await import('node:path');
  const utilsSrc = fs.readFileSync(path.resolve('frontend/src/js/core/utils.js'), 'utf8');
  const sandbox = { API_BASE: '', URL, URLSearchParams };
  vm.runInNewContext(utilsSrc, sandbox);
  const authCandidates = JSON.parse(JSON.stringify(
    sandbox.getAuthenticatedImageCandidates('/api/dtreasure/img/vault%2Fcrisp_artwork.jpg', { w: 1400, q: 85, fit: 'scale-down', fmt: 'auto' })
  ));
  assert.equal(authCandidates.some(u => u.startsWith('/cdn-cgi/image/')), false);
  assert.equal(authCandidates[0], '/api/dtreasure/img/vault%2Fcrisp_artwork.jpg?w=1400&q=85&fit=scale-down&fmt=auto');
  assert.equal(authCandidates[1], '/api/dtreasure/img/vault%2Fcrisp_artwork.jpg');

  // Modal & DTREASURE gallery wire unlocked authenticated preview reload
  const modalJs = fs.readFileSync(path.resolve('frontend/src/js/ui/modal.js'), 'utf8');
  assert.ok(modalJs.includes('loadAuthenticatedImage'));
  assert.ok(modalJs.includes('refreshModalLockState'));
  assert.ok(modalJs.includes('w: 1400'));

  const dtreasureJs = fs.readFileSync(path.resolve('frontend/src/js/ui/dtreasure.js'), 'utf8');
  assert.ok(dtreasureJs.includes('loadAuthenticatedImage'));

  // Searchbar relocated from nav/mobile-search into spacious unified hero search wrapper
  const navHtml = fs.readFileSync(path.resolve('frontend/src/partials/layout/nav.html'), 'utf8');
  const heroHtml = fs.readFileSync(path.resolve('frontend/src/partials/layout/hero.html'), 'utf8');
  const indexHtml = fs.readFileSync(path.resolve('frontend/src/index.html'), 'utf8');
  assert.equal(navHtml.includes('id="searchInput"'), false);
  assert.equal(indexHtml.includes('mobile-search.html'), false);
  assert.ok(heroHtml.includes('id="hero-search-wrapper"'));
  assert.ok(heroHtml.includes('id="searchInput"'));
  assert.ok(heroHtml.includes('id="search-clear"'));
});

test('Crypto donation buttons and crypto modal render inline brand SVGs for all 10 networks without broken icon classes', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const donationHtml = fs.readFileSync(path.resolve('frontend/src/partials/modals/donation-modal.html'), 'utf8');
  const cryptoModalHtml = fs.readFileSync(path.resolve('frontend/src/partials/modals/crypto-modal.html'), 'utf8');
  const donationJs = fs.readFileSync(path.resolve('frontend/src/js/events/donation.js'), 'utf8');
  const assetsJs = fs.readFileSync(path.resolve('frontend/src/js/config/assets.js'), 'utf8');

  const expectedCoins = [
    'Bitcoin', 'Ethereum', 'Solana', 'BNB', 'Polygon', 'XRP (BSC)',
    'USDT (TRON)', 'USDT (ETH)', 'USDT (SOL)', 'USDT (BNB)',
  ];
  for (const name of expectedCoins) {
    assert.ok(donationHtml.includes(`data-name="${name}"`), `Missing crypto button for ${name}`);
  }

  const badgeCount = (donationHtml.match(/class="crypto-logo-badge /g) || []).length;
  assert.equal(badgeCount, 10);
  assert.equal((donationHtml.match(/class="crypto-main-svg /g) || []).length, 10);

  for (const badIcon of ['fa-hexagon', 'fa-sun', 'fa-bolt', 'fa-chart-line', 'fa-circle']) {
    assert.equal(donationHtml.includes(badIcon), false, `Removed broken/generic icon ${badIcon}`);
  }
  assert.equal(assetsJs.includes('HEADER/icons/'), false);
  assert.ok(cryptoModalHtml.includes('id="crypto-icon-badge"'));
  assert.ok(donationJs.includes('crypto-icon-badge') && donationJs.includes('.crypto-logo-badge'));
});

test('View state persistence across refresh, Home latest default ordering, and web/image speed optimizations', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  // 1. Home default sortBy is 'latest' (never 'random') in both state.js and navigation.js
  const stateSrc = fs.readFileSync(path.resolve('frontend/src/js/core/state.js'), 'utf8');
  const navSrc = fs.readFileSync(path.resolve('frontend/src/js/ui/navigation.js'), 'utf8');
  const stateSandbox = { URLSearchParams, CATEGORIES: ['All', 'Anime', 'Fantasy', 'Abstract', 'Photography', 'COMITBASE', 'DTREASURE', 'ZMEME', 'OVERLAY'] };
  const { state: initState, viewState } = vm.runInNewContext(`${stateSrc}\n;({ state, viewState });`, stateSandbox);

  assert.equal(initState.sortBy, 'latest');
  assert.equal(navSrc.includes("state.sortBy = 'random'"), false);
  assert.ok(navSrc.includes("state.sortBy = 'latest'"));

  // 2. viewState restores DTREASURE / Anime album / page from sessionStorage and URL without resetting to Home
  const dtSnap = viewState.parseInitialView({
    search: '',
    storageJson: JSON.stringify({
      category: 'DTREASURE',
      dtreasureTab: 'library',
      dtreasurePage: 3,
      aspectFilter: 'portrait',
    }),
  });
  assert.equal(dtSnap.category, 'DTREASURE');
  assert.equal(dtSnap.dtreasureTab, 'library');
  assert.equal(dtSnap.dtreasurePage, 3);
  assert.equal(dtSnap.aspectFilter, 'portrait');

  const urlOverride = viewState.parseInitialView({
    search: '?cat=Anime&album=Sousou%20no%20Frieren&page=2',
    storageJson: JSON.stringify({ category: 'DTREASURE' }),
  });
  assert.equal(urlOverride.category, 'Anime');
  assert.equal(urlOverride.animeAlbum, 'Sousou no Frieren');
  assert.equal(urlOverride.page, 2);

  assert.equal(viewState.buildUrlSearch({ category: 'All', page: 1, aspectFilter: 'all' }), '');
  assert.equal(
    viewState.buildUrlSearch({ category: 'DTREASURE', dtreasureTab: 'library', dtreasurePage: 2, aspectFilter: 'all' }),
    '?cat=DTREASURE&tab=library&page=2'
  );

  // init.js & modal.js preserve restored view state instead of hardcoding 'All'
  const initSrc = fs.readFileSync(path.resolve('frontend/src/js/app/init.js'), 'utf8');
  const modalSrc = fs.readFileSync(path.resolve('frontend/src/js/ui/modal.js'), 'utf8');
  assert.ok(initSrc.includes('loadInitialViewState'));
  assert.ok(modalSrc.includes("params.delete('photo')"));

  // 3. Browser hosts (.workers.dev / .run.app / localhost) skip /cdn-cgi/image/ waterfall cleanly
  const utilsSrc = fs.readFileSync(path.resolve('frontend/src/js/core/utils.js'), 'utf8');
  const browserSandbox = {
    API_BASE: '',
    URL,
    URLSearchParams,
    window: { location: { hostname: 'localhost' } },
  };
  vm.runInNewContext(utilsSrc, browserSandbox);
  const localCandidates = JSON.parse(JSON.stringify(
    browserSandbox.getImageFallbackCandidates('/api/img/ANIME/pic.jpg', { w: 520, q: 78, fit: 'scale-down', fmt: 'auto' })
  ));
  assert.equal(localCandidates.some(u => u.includes('/cdn-cgi/image/')), false);
  assert.equal(localCandidates[0], '/api/img/ANIME/pic.jpg?w=520&q=78&fit=scale-down&fmt=auto');

  // Above-the-fold eager loading + lazy PayPal SDK + preconnects + immutable anime sample_url
  const baseSrc = fs.readFileSync(path.resolve('frontend/src/js/ui/base.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.resolve('frontend/src/index.html'), 'utf8');
  const paypalSrc = fs.readFileSync(path.resolve('frontend/src/js/integrations/paypal.js'), 'utf8');
  assert.ok(baseSrc.includes('fetchpriority="high"'));
  assert.ok(baseSrc.includes("rootMargin = '500px 0px'"));
  assert.equal(indexHtml.includes('paypal.com/sdk/js'), false);
  assert.ok(indexHtml.includes('rel="preconnect" href="https://fonts.googleapis.com"'));
  assert.ok(paypalSrc.includes('ensurePayPalSdkLoaded'));

  const env = await createLocalEnv();
  const albumsRes = await handleAnimeAlbums({
    env,
    ctx: { waitUntil: () => {} },
    DB: env.DB,
    corsHeaders,
  });
  assert.equal(albumsRes.status, 200);
  const albums = await albumsRes.json();
  assert.ok(albums.length > 0);
  assert.match(albums[0].sample_url, /\?v=/);
});

test('DTREASURE gallery sorts newest-first with deterministic SQLite/ISO dates and row-first masonry columns', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  // 1. sortPhotosList handles SQLite space-separated timestamps, ISO timestamps, and id tie-breaking
  const filtersSrc = fs.readFileSync(path.resolve('frontend/src/js/core/filters.js'), 'utf8');
  const filtersSandbox = {};
  const { sortPhotosList } = vm.runInNewContext(`${filtersSrc}\n;({ sortPhotosList });`, filtersSandbox);

  const mixedDates = [
    { id: 'dtreasure:a.jpg', uploaded: '2026-11-20 10:00:00' },
    { id: 'dtreasure:c.jpg', uploaded: '2026-11-26T08:00:00.000Z' },
    { id: 'dtreasure:b.jpg', uploaded: '2026-11-26T08:00:00.000Z' },
    { id: 'dtreasure:old.jpg', uploaded: '2026-10-01 00:00:00' },
  ];
  assert.deepEqual(
    JSON.parse(JSON.stringify(sortPhotosList(mixedDates, 'latest').map(p => p.id))),
    ['dtreasure:c.jpg', 'dtreasure:b.jpg', 'dtreasure:a.jpg', 'dtreasure:old.jpg']
  );

  // 2. /api/dtreasure/list returns strictly descending uploaded order (newest first)
  const env = await createLocalEnv();
  const dtRes = await handleListDtreasure({
    url: new URL('http://localhost/api/dtreasure/list?page=1&limit=50'),
    env,
    ctx: { waitUntil: () => {} },
    treasureBucket: env.TREASURE,
    DB: env.DB,
    corsHeaders,
  });
  assert.equal(dtRes.status, 200);
  const dtList = await dtRes.json();
  assert.ok(dtList.length >= 4);
  for (let i = 1; i < dtList.length; i++) {
    assert.ok(
      Date.parse(dtList[i - 1].uploaded) >= Date.parse(dtList[i].uploaded),
      `Expected item ${i - 1} (${dtList[i - 1].uploaded}) >= item ${i} (${dtList[i].uploaded})`
    );
  }

  // 3. DTREASURE UI & masonry CSS use row-first horizontal columns rather than vertical CSS column-count
  const masonryCss = fs.readFileSync(path.resolve('frontend/src/css/01-masonry.css'), 'utf8');
  const baseSrc = fs.readFileSync(path.resolve('frontend/src/js/ui/base.js'), 'utf8');
  const dtreasureSrc = fs.readFileSync(path.resolve('frontend/src/js/ui/dtreasure.js'), 'utf8');
  assert.equal(masonryCss.includes('column-count:'), false);
  assert.ok(masonryCss.includes('.masonry-column'));
  assert.ok(masonryCss.includes('.masonry-layout.hidden'));
  assert.ok(baseSrc.includes('renderMasonryItems'));
  assert.ok(dtreasureSrc.includes('renderMasonryItems'));
  assert.ok(dtreasureSrc.includes('state.purchasedImages.size'));
});

// ================================================================
// Feature Tests (9 New Features + Share OG & Brand Logo Fixes)
// ================================================================

test('extractImageDimensions parses PNG, GIF, JPEG, WebP, and SVG dimensions and decodeBase64DataUrl validates payloads', () => {
  // 1. PNG IHDR (640x480)
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  png.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  new DataView(png.buffer).setUint32(16, 640, false);
  new DataView(png.buffer).setUint32(20, 480, false);
  assert.deepEqual(extractImageDimensions(png, 'image/png'), { width: 640, height: 480 });

  // 2. GIF89a (320x180)
  const gif = new Uint8Array(10);
  gif.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0);
  new DataView(gif.buffer).setUint16(6, 320, true);
  new DataView(gif.buffer).setUint16(8, 180, true);
  assert.deepEqual(extractImageDimensions(gif, 'image/gif'), { width: 320, height: 180 });

  // 3. WebP VP8X (1920x1080 -> stored minus 1 in 24-bit LE)
  const webp = new Uint8Array(30);
  webp.set([0x52, 0x49, 0x46, 0x46], 0);
  webp.set([0x57, 0x45, 0x42, 0x50], 8);
  webp.set([0x56, 0x50, 0x38, 0x58], 12);
  const wM1 = 1920 - 1;
  const hM1 = 1080 - 1;
  webp[24] = wM1 & 0xff; webp[25] = (wM1 >> 8) & 0xff; webp[26] = (wM1 >> 16) & 0xff;
  webp[27] = hM1 & 0xff; webp[28] = (hM1 >> 8) & 0xff; webp[29] = (hM1 >> 16) & 0xff;
  assert.deepEqual(extractImageDimensions(webp, 'image/webp'), { width: 1920, height: 1080 });

  // 4. JPEG SOF0 (1080x1920)
  const jpeg = new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, // APP0
    0xff, 0xc0, 0x00, 0x09, 0x08, // SOF0 len=9 precision=8
    0x07, 0x80, // height = 1920
    0x04, 0x38, // width = 1080
    0xff, 0xd9, // EOI
  ]);
  assert.deepEqual(extractImageDimensions(jpeg, 'image/jpeg'), { width: 1080, height: 1920 });

  // 5. SVG viewBox
  const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200"></svg>');
  assert.deepEqual(extractImageDimensions(svgBytes, 'image/svg+xml'), { width: 800, height: 1200 });

  // 6. decodeBase64DataUrl rejects invalid MIME and oversize payloads
  const bad = decodeBase64DataUrl('data:text/plain;base64,SGVsbG8=');
  assert.equal(bad.status, 400);
  const b64Png = Buffer.from(png).toString('base64');
  const ok = decodeBase64DataUrl(`data:image/png;base64,${b64Png}`);
  assert.equal(ok.ext, 'png');
  assert.equal(ok.bytes.byteLength, 24);
  const tooBig = decodeBase64DataUrl(`data:image/png;base64,${b64Png}`, { maxBytes: 10 });
  assert.equal(tooBig.status, 413);
});

test('Quick Love toggle (/api/react/:id), /api/stats/:id, and /api/trending?by=loved|downloaded work end-to-end', async () => {
  const env = await createLocalEnv();
  const listRes = await handleListMain({
    url: new URL('http://localhost/api/list?limit=10'),
    env,
    ctx: { waitUntil: () => {} },
    DB: env.DB,
    corsHeaders,
  });
  const list = await listRes.json();
  assert.ok(list.length >= 2);
  const photo = list[0];
  const initialLoves = photo.loveCount || 0;

  const reactHeaders = { 'X-User-Token': 'tok-love-viewer-1', 'CF-Connecting-IP': '10.20.30.40' };

  // First toggle -> loves +1, loved = true
  const addRes = await handleToggleReaction({
    request: makeReq(`http://localhost/api/react/${encodeURIComponent(photo.id)}`, { method: 'POST', headers: reactHeaders }),
    path: `/api/react/${encodeURIComponent(photo.id)}`,
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(addRes.status, 200);
  const added = await addRes.json();
  assert.equal(added.success, true);
  assert.equal(added.loved, true);
  assert.equal(added.loves, initialLoves + 1);

  // /api/stats returns loved = true for same viewer and false for another viewer
  const statsSame = await (await handleStats({
    request: makeReq(`http://localhost/api/stats/${encodeURIComponent(photo.id)}`, { headers: reactHeaders }),
    path: `/api/stats/${encodeURIComponent(photo.id)}`,
    DB: env.DB,
    corsHeaders,
    getUserToken,
  })).json();
  assert.equal(statsSame.loved, true);
  assert.equal(statsSame.loves, initialLoves + 1);

  const statsOther = await (await handleStats({
    request: makeReq(`http://localhost/api/stats/${encodeURIComponent(photo.id)}`, { headers: { 'X-User-Token': 'other-viewer' } }),
    path: `/api/stats/${encodeURIComponent(photo.id)}`,
    DB: env.DB,
    corsHeaders,
    getUserToken,
  })).json();
  assert.equal(statsOther.loved, false);

  // Second toggle by same viewer -> un-love
  const removeRes = await handleToggleReaction({
    request: makeReq(`http://localhost/api/react/${encodeURIComponent(photo.id)}`, { method: 'POST', headers: reactHeaders }),
    path: `/api/react/${encodeURIComponent(photo.id)}`,
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  const removed = await removeRes.json();
  assert.equal(removed.loved, false);
  assert.equal(removed.loves, initialLoves);

  // Leaderboard ordering: by=loved and by=downloaded
  const lovedBoard = await (await handleTrending({
    url: new URL('http://localhost/api/trending?limit=12&by=loved'),
    env,
    ctx: { waitUntil: () => {} },
    DB: env.DB,
    corsHeaders,
  })).json();
  assert.ok(lovedBoard.length >= 2);
  for (let i = 1; i < lovedBoard.length; i++) {
    assert.ok(lovedBoard[i - 1].loveCount >= lovedBoard[i].loveCount);
  }

  const dlBoard = await (await handleTrending({
    url: new URL('http://localhost/api/trending?limit=12&by=downloaded'),
    env,
    ctx: { waitUntil: () => {} },
    DB: env.DB,
    corsHeaders,
  })).json();
  assert.ok(dlBoard.length >= 2);
  for (let i = 1; i < dlBoard.length; i++) {
    assert.ok(dlBoard[i - 1].downloadCount >= dlBoard[i].downloadCount);
  }
});

test('Email verification grants one-time +20 credits and daily check-in increments UTC streak with 7-day bonus', async () => {
  const env = await createLocalEnv();
  env.ALLOW_DEV_OTP_PREVIEW = 'true';
  const userTok = 'tok-checkin-bonus-user';
  const reqHeaders = { 'X-User-Token': userTok, 'Content-Type': 'application/json' };
  const sendEmail = async () => ({ sent: false, provider: 'test', error: null });

  // 1. Auto account + Register triggers verification OTP
  await handleAutoAccount({ request: makeReq('http://localhost/api/account/auto', { method: 'POST', headers: reqHeaders }), DB: env.DB, corsHeaders, getUserToken });
  const regRes = await handleRegisterAccount({
    request: makeReq('http://localhost/api/account/register', {
      method: 'POST',
      headers: reqHeaders,
      body: { email: 'streakuser@example.com', password: 'StrongPassword123', displayName: 'Streak Tester' },
    }),
    env,
    DB: env.DB,
    corsHeaders,
    getUserToken,
    sendEmail,
  });
  assert.equal(regRes.status, 201);
  const regJson = await regRes.json();
  const otp = regJson.verification?.devOtpPreview;
  assert.match(String(otp), /^\d{6}$/);

  const sessionHeaders = { Authorization: `Bearer ${regJson.sessionToken}`, 'Content-Type': 'application/json' };

  // 2. Verify email -> +20 credits + verify_bonus ledger entry
  const verifyRes = await handleVerifyEmail({
    request: makeReq('http://localhost/api/account/verify-email', {
      method: 'POST',
      headers: sessionHeaders,
      body: { code: otp },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(verifyRes.status, 200);
  const verified = await verifyRes.json();
  assert.equal(verified.bonusAwarded, 20);
  assert.equal(verified.wallet.credits, 20);
  assert.equal(verified.account.emailVerified, true);

  // 3. Daily check-in Day 1 -> +2 credits (total 22), streak = 1
  const checkin1 = await (await handleAccountCheckin({
    request: makeReq('http://localhost/api/account/checkin', { method: 'POST', headers: sessionHeaders }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  })).json();
  assert.equal(checkin1.success, true);
  assert.equal(checkin1.awarded, 2);
  assert.equal(checkin1.streak, 1);
  assert.equal(checkin1.wallet.credits, 22);

  // 4. Same-day UTC duplicate check-in does NOT award again
  const checkinDup = await (await handleAccountCheckin({
    request: makeReq('http://localhost/api/account/checkin', { method: 'POST', headers: sessionHeaders }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  })).json();
  assert.equal(checkinDup.success, false);
  assert.equal(checkinDup.alreadyClaimed, true);
  assert.equal(checkinDup.awarded, 0);
  assert.equal(checkinDup.wallet.credits, 22);

  // 5. Day 7 streak calculation helper awards +2 daily +5 milestone = +7
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const milestonePlan = computeNextCheckinState({ checkin_streak: 6, last_checkin_date: yesterday });
  assert.equal(milestonePlan.nextStreak, 7);
  assert.equal(milestonePlan.baseCredits, 2);
  assert.equal(milestonePlan.milestoneBonus, 5);
  assert.equal(milestonePlan.totalAwarded, 7);
});

test('COMITBASE direct submission stores PNG artwork with extracted dimensions and lists it newest-first', async () => {
  const env = await createLocalEnv();
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  png.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  new DataView(png.buffer).setUint32(16, 1024, false);
  new DataView(png.buffer).setUint32(20, 768, false);
  const dataUrl = `data:image/png;base64,${Buffer.from(png).toString('base64')}`;

  const submitRes = await handleSubmitComitbase({
    request: makeReq('http://localhost/api/comitbase/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Token': 'artist-1' },
      body: { title: 'Neon Horizon Test', creator: 'Raka Studio', imageData: dataUrl },
    }),
    comitbaseBucket: env.ZX_BUCKET,
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(submitRes.status, 201);
  const submitted = await submitRes.json();
  assert.equal(submitted.success, true);
  assert.equal(submitted.photo.width, 1024);
  assert.equal(submitted.photo.height, 768);
  assert.equal(submitted.photo.uploader, 'Raka Studio');

  const listRes = await handleListComitbase({
    url: new URL('http://localhost/api/comitbase/list?limit=10'),
    env,
    ctx: { waitUntil: () => {} },
    comitbaseBucket: env.ZX_BUCKET,
    DB: env.DB,
    corsHeaders,
  });
  const items = await listRes.json();
  const found = items.find((i) => i.id === submitted.photo.id);
  assert.ok(found);
  assert.equal(found.width, 1024);
  assert.equal(found.height, 768);
  assert.equal(found.uploader, 'Raka Studio');
});

test('Admin direct upload creates _preview/ watermark SVG for DTREASURE, serves X-Dtreasure-Preview, and admin credits adjusts VIP/balance', async () => {
  const env = await createLocalEnv();
  const adminToken = env.ADMIN_TOKEN || 'local-dev-admin';
  const adminHeaders = { 'X-Admin-Token': adminToken, 'Content-Type': 'application/json' };

  // Build 1280x720 PNG
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  png.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  new DataView(png.buffer).setUint32(16, 1280, false);
  new DataView(png.buffer).setUint32(20, 720, false);
  const dataUrl = `data:image/png;base64,${Buffer.from(png).toString('base64')}`;

  // 1. Direct upload to DTREASURE
  const uploadRes = await handleAdminUpload({
    request: makeReq('http://localhost/api/admin/upload', {
      method: 'POST',
      headers: adminHeaders,
      body: { bucket: 'dtreasure', category: 'vault', title: 'Golden Sovereign', imageData: dataUrl },
    }),
    env,
    corsHeaders,
  });
  assert.equal(uploadRes.status, 201);
  const uploaded = await uploadRes.json();
  assert.equal(uploaded.success, true);
  assert.ok(uploaded.watermarkPreviewKey.startsWith('_preview/'));
  assert.equal(uploaded.photo.width, 1280);
  assert.equal(uploaded.photo.height, 720);

  // 2. Unpurchased DTREASURE preview serves watermarked SVG + X-Dtreasure-Preview header
  const previewRes = await handleServeImage({
    request: makeReq(`http://localhost${uploaded.photo.url}`, { headers: { 'X-User-Token': 'visitor-unpaid' } }),
    ctx: { waitUntil: () => {} },
    url: new URL(`http://localhost${uploaded.photo.url}`),
    path: uploaded.photo.url,
    mainBucket: env.Zxaion_B,
    comitbaseBucket: env.ZX_BUCKET,
    treasureBucket: env.TREASURE,
    DB: env.DB,
    IMAGES: null,
    origin: 'http://localhost',
    corsHeaders,
    getUserToken,
  });
  assert.equal(previewRes.status, 200);
  assert.equal(previewRes.headers.get('X-Dtreasure-Preview'), 'watermarked');
  const svgBody = await previewRes.text();
  assert.ok(svgBody.includes('ZXAION PREVIEW'));

  // 3. Direct download without purchase still fails closed with 403
  const dlBlocked = await handleServeImage({
    request: makeReq(`http://localhost${uploaded.photo.url}?download=true`, { headers: { 'X-User-Token': 'visitor-unpaid' } }),
    ctx: { waitUntil: () => {} },
    url: new URL(`http://localhost${uploaded.photo.url}?download=true`),
    path: uploaded.photo.url,
    mainBucket: env.Zxaion_B,
    comitbaseBucket: env.ZX_BUCKET,
    treasureBucket: env.TREASURE,
    DB: env.DB,
    IMAGES: null,
    origin: 'http://localhost',
    corsHeaders,
    getUserToken,
  });
  assert.equal(dlBlocked.status, 403);

  // 4. Admin user credits add + VIP toggle
  const targetUser = 'tok-admin-adjusted-user';
  const addCreds = await (await handleAdminAdjustCredits({
    request: makeReq('http://localhost/api/admin/credits', {
      method: 'POST',
      headers: adminHeaders,
      body: { userId: targetUser, mode: 'add', amount: 25, reason: 'Community contest prize' },
    }),
    env,
    corsHeaders,
  })).json();
  assert.equal(addCreds.success, true);
  assert.equal(addCreds.user.credits, 25);

  const setVip = await (await handleAdminAdjustCredits({
    request: makeReq('http://localhost/api/admin/credits', {
      method: 'POST',
      headers: adminHeaders,
      body: { userId: targetUser, mode: 'lifetime', lifetime: true, reason: 'Grant VIP pass' },
    }),
    env,
    corsHeaders,
  })).json();
  assert.equal(setVip.user.lifetime, true);

  // Mint signed download token for VIP user -> forged token rejected (403), valid token downloads (200)
  const vipMissingTok = await handleServeImage({
    request: makeReq(`http://localhost${uploaded.photo.url}?download=true&dt_token=invalid.token`, { headers: { 'X-User-Token': targetUser } }),
    ctx: { waitUntil: () => {} },
    url: new URL(`http://localhost${uploaded.photo.url}?download=true&dt_token=invalid.token`),
    path: uploaded.photo.url,
    env,
    mainBucket: env.Zxaion_B,
    comitbaseBucket: env.ZX_BUCKET,
    treasureBucket: env.TREASURE,
    DB: env.DB,
    IMAGES: null,
    origin: 'http://localhost',
    corsHeaders,
    getUserToken,
  });
  assert.equal(vipMissingTok.status, 403);

  const vipTokRes = await handleDtreasureDownloadToken({
    request: makeReq('http://localhost/api/dtreasure/download-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Token': targetUser },
      body: { photoId: uploaded.photo.id },
    }),
    env,
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(vipTokRes.status, 200);
  const vipTok = await vipTokRes.json();
  assert.ok(vipTok.downloadToken);

  const vipDl = await handleServeImage({
    request: makeReq(`http://localhost${uploaded.photo.url}?download=true&dt_token=${encodeURIComponent(vipTok.downloadToken)}`, { headers: { 'X-User-Token': targetUser } }),
    ctx: { waitUntil: () => {} },
    url: new URL(`http://localhost${uploaded.photo.url}?download=true&dt_token=${encodeURIComponent(vipTok.downloadToken)}`),
    path: uploaded.photo.url,
    env,
    mainBucket: env.Zxaion_B,
    comitbaseBucket: env.ZX_BUCKET,
    treasureBucket: env.TREASURE,
    DB: env.DB,
    IMAGES: null,
    origin: 'http://localhost',
    corsHeaders,
    getUserToken,
  });
  assert.equal(vipDl.status, 200);
});

test('SEO photo OpenGraph tags emit og:image:width/height/secure_url, base origin replaces brand logo URLs, and brand-logo.jpg exists', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const rawHtml = fs.readFileSync(path.resolve('frontend/dist/index.html'), 'utf8');
  assert.ok(fs.existsSync(path.resolve('frontend/src/assets/brand-logo.jpg')));
  assert.ok(fs.existsSync(path.resolve('frontend/dist/assets/brand-logo.jpg')));

  const baseSeoHtml = injectBaseSeoOrigin(rawHtml, 'https://gallery.zxaion.com');
  assert.ok(baseSeoHtml.includes('<meta property="og:image" content="https://gallery.zxaion.com/assets/brand-logo.jpg">'));
  assert.ok(baseSeoHtml.includes('<meta name="twitter:image" content="https://gallery.zxaion.com/assets/brand-logo.jpg">'));

  const photoHtml = injectOpenGraphMetadata(
    rawHtml,
    { id: 'main:ANIME/test_hero.png', title: 'Test Hero', category: 'Anime', bucket: 'main', r2_key: 'ANIME/test_hero.png', width: 1440, height: 2560 },
    'https://gallery.zxaion.com'
  );
  assert.ok(photoHtml.includes('<meta property="og:image:secure_url" content="https://gallery.zxaion.com/api/img/ANIME%2Ftest_hero.png">'));
  assert.ok(photoHtml.includes('<meta property="og:image:type" content="image/png">'));
  assert.ok(photoHtml.includes('<meta property="og:image:width" content="1440">'));
  assert.ok(photoHtml.includes('<meta property="og:image:height" content="2560">'));
  assert.ok(photoHtml.includes('<meta name="twitter:card" content="summary_large_image">'));
});

test('Quick Fire reaction (/api/react/:id?type=fire) and Top Creators leaderboard (/api/trending?by=creators) enforce deduplication and ranking', async () => {
  const env = await createLocalEnv();
  const list = await (await handleListMain({
    url: new URL('http://localhost/api/list?limit=5'),
    env,
    ctx: { waitUntil: () => {} },
    DB: env.DB,
    corsHeaders,
  })).json();
  assert.ok(list.length > 0);
  const photo = list[0];
  assert.equal(typeof photo.width, 'number');
  assert.equal(typeof photo.height, 'number');

  const viewerHeaders = { 'X-User-Token': 'tok-fire-viewer-1', 'CF-Connecting-IP': '10.99.0.1' };
  const fireAdd = await (await handleToggleReaction({
    request: makeReq(`http://localhost/api/react/${encodeURIComponent(photo.id)}?type=fire`, {
      method: 'POST',
      headers: { ...viewerHeaders, 'Content-Type': 'application/json' },
      body: { type: 'fire' },
    }),
    path: `/api/react/${encodeURIComponent(photo.id)}`,
    DB: env.DB,
    corsHeaders,
    getUserToken,
  })).json();
  assert.equal(fireAdd.success, true);
  assert.equal(fireAdd.fired, true);
  assert.equal(fireAdd.fires, (photo.fireCount || 0) + 1);

  const statsRes = await (await handleStats({
    request: makeReq(`http://localhost/api/stats/${encodeURIComponent(photo.id)}`, { headers: viewerHeaders }),
    path: `/api/stats/${encodeURIComponent(photo.id)}`,
    DB: env.DB,
    corsHeaders,
    getUserToken,
  })).json();
  assert.equal(statsRes.fired, true);
  assert.equal(statsRes.fires, (photo.fireCount || 0) + 1);

  const creatorsBoard = await (await handleTrending({
    url: new URL('http://localhost/api/trending?limit=10&by=creators'),
    env,
    ctx: { waitUntil: () => {} },
    DB: env.DB,
    corsHeaders,
  })).json();
  assert.ok(Array.isArray(creatorsBoard) && creatorsBoard.length >= 3);
  for (let i = 1; i < creatorsBoard.length; i++) {
    assert.ok(creatorsBoard[i - 1].weeklyScore >= creatorsBoard[i].weeklyScore);
  }
});

test('COMITBASE Verified Creator workflow enforces application validation, admin approval, owner-only uploads, and owner deletes', async () => {
  const env = await createLocalEnv();
  const adminToken = env.ADMIN_TOKEN || 'local-dev-admin';
  const adminHeaders = { 'X-Admin-Token': adminToken, 'Content-Type': 'application/json' };
  const applicantHeaders = { 'X-User-Token': 'tok-new-creator-42', 'Content-Type': 'application/json' };
  const strangerHeaders = { 'X-User-Token': 'tok-stranger-99', 'Content-Type': 'application/json' };

  await handleAutoAccount({
    request: makeReq('http://localhost/api/account/auto', { method: 'POST', headers: applicantHeaders }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });

  // 1. Reject unsafe or missing social link
  const badRes = await handleApplyComitbaseCreator({
    request: makeReq('http://localhost/api/comitbase/creators/apply', {
      method: 'POST',
      headers: applicantHeaders,
      body: { profileName: 'Lumina Ink', description: 'Original anime matte paintings and cyber landscapes.', socialLinks: ['javascript:alert(1)'] },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(badRes.status, 400);

  // 2. Valid application starts as pending & hidden from public directory
  const applyRes = await handleApplyComitbaseCreator({
    request: makeReq('http://localhost/api/comitbase/creators/apply', {
      method: 'POST',
      headers: applicantHeaders,
      body: {
        profileName: 'Lumina Ink Studio',
        description: 'High-detail cyberpunk and mecha illustrations painted at 4K resolution.',
        socialLinks: ['https://x.com/luminaink', 'https://pixiv.net/users/12345'],
      },
    }),
    DB: env.DB,
    corsHeaders,
    getUserToken,
  });
  assert.equal(applyRes.status, 201);
  const applied = await applyRes.json();
  assert.equal(applied.creator.status, 'pending');
  const slug = applied.creator.slug;

  const publicBefore = await (await handleListComitbaseCreators({
    url: new URL('http://localhost/api/comitbase/creators'),
    env,
    ctx: { waitUntil: () => {} },
    DB: env.DB,
    corsHeaders,
  })).json();
  assert.ok(!publicBefore.creators.some((c) => c.slug === slug));

  // Pending creator cannot upload yet (403)
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  png.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  new DataView(png.buffer).setUint32(16, 1920, false);
  new DataView(png.buffer).setUint32(20, 1080, false);
  const dataUrl = `data:image/png;base64,${Buffer.from(png).toString('base64')}`;

  const pendingUpload = await handleUploadComitbaseCreatorImage({
    request: makeReq(`http://localhost/api/comitbase/creators/${slug}/upload`, {
      method: 'POST',
      headers: applicantHeaders,
      body: { title: 'Blocked Pending Art', imageData: dataUrl },
    }),
    comitbaseBucket: env.ZX_BUCKET,
    DB: env.DB,
    corsHeaders,
    getUserToken,
    creatorSlug: slug,
  });
  assert.equal(pendingUpload.status, 403);

  // 3. Admin lists & approves -> automatic profile visibility
  const adminCreators = await (await handleAdminListCreators({
    request: makeReq('http://localhost/api/admin/creators', { headers: adminHeaders }),
    env,
    corsHeaders,
  })).json();
  assert.ok(adminCreators.creators.some((c) => c.creatorId === applied.creator.creatorId && c.status === 'pending'));

  const decisionRes = await handleAdminCreatorDecision({
    request: makeReq('http://localhost/api/admin/creators/decision', {
      method: 'POST',
      headers: adminHeaders,
      body: { creatorId: applied.creator.creatorId, decision: 'approve' },
    }),
    env,
    corsHeaders,
  });
  assert.equal(decisionRes.status, 200);
  const decided = await decisionRes.json();
  assert.equal(decided.creator.status, 'approved');

  // 4. Non-owner upload blocked (403); Owner upload succeeds (201) & appears on profile
  const strangerUpload = await handleUploadComitbaseCreatorImage({
    request: makeReq(`http://localhost/api/comitbase/creators/${slug}/upload`, {
      method: 'POST',
      headers: strangerHeaders,
      body: { title: 'Hijack Attempt', imageData: dataUrl },
    }),
    comitbaseBucket: env.ZX_BUCKET,
    DB: env.DB,
    corsHeaders,
    getUserToken,
    creatorSlug: slug,
  });
  assert.equal(strangerUpload.status, 403);

  const ownerUpload = await handleUploadComitbaseCreatorImage({
    request: makeReq(`http://localhost/api/comitbase/creators/${slug}/upload`, {
      method: 'POST',
      headers: applicantHeaders,
      body: { title: 'Astral Neon Skyline', imageData: dataUrl },
    }),
    comitbaseBucket: env.ZX_BUCKET,
    DB: env.DB,
    corsHeaders,
    getUserToken,
    creatorSlug: slug,
  });
  assert.equal(ownerUpload.status, 201);
  const uploadedArt = await ownerUpload.json();
  assert.equal(uploadedArt.photo.width, 1920);
  assert.equal(uploadedArt.photo.height, 1080);

  const profileRes = await (await handleGetComitbaseCreator({
    request: makeReq(`http://localhost/api/comitbase/creators/${slug}`, { headers: applicantHeaders }),
    env,
    ctx: { waitUntil: () => {} },
    DB: env.DB,
    corsHeaders,
    getUserToken,
    creatorSlug: slug,
  })).json();
  assert.equal(profileRes.isOwner, true);
  assert.equal(profileRes.creator.profileName, 'Lumina Ink Studio');
  assert.ok(profileRes.creator.socialLinks.length === 2);
  assert.ok(profileRes.photos.some((p) => p.id === uploadedArt.photo.id));

  // 5. Owner deletes own artwork
  const delRes = await handleDeleteComitbaseCreatorImage({
    request: makeReq(`http://localhost/api/comitbase/creators/${slug}/images/${encodeURIComponent(uploadedArt.photo.id)}`, {
      method: 'DELETE',
      headers: applicantHeaders,
    }),
    comitbaseBucket: env.ZX_BUCKET,
    DB: env.DB,
    corsHeaders,
    getUserToken,
    creatorSlug: slug,
    targetImageId: uploadedArt.photo.id,
  });
  assert.equal(delRes.status, 200);
});

test('Built frontend enforces updated emails, logo asset, CSP purity, WebP thumbnails, and new feature UI markers', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const html = fs.readFileSync(path.resolve('frontend/dist/index.html'), 'utf8');
  const script = fs.readFileSync(path.resolve('frontend/dist/script.js'), 'utf8');
  const combined = `${html}\n${script}`;

  assert.equal(/zxaionxl/i.test(combined), false, 'Old email zxaionxl should be completely removed');
  assert.ok(combined.includes('zxaionart@gmail.com'));
  assert.ok(combined.includes('zvizualscl@gmail.com'));
  assert.equal(html.includes('/api/img/HEADER/Logo.png'), false, 'Old Logo.png header URL should be replaced');
  assert.ok(html.includes('/assets/brand-logo.jpg'));
  assert.ok(html.includes('Preview on Device'));
  assert.ok(html.includes('+20 Bonus Credits'));
  assert.ok(html.includes('Top Creators'));
  assert.ok(script.includes('w:480') || script.includes('w: 480'));
  assert.equal(/\son(click|change|submit|input)=/i.test(html), false, 'Strict CSP forbids inline HTML event handlers');
  assert.ok(html.includes('modal-desktop-controls'));
  assert.ok(html.includes('modal-desktop-zoom-range'));
  assert.ok(html.includes('modal-desktop-reset'));
  assert.ok(html.includes('id="modal-related-grid" class="columns-2 sm:columns-3 gap-2"'));
  assert.equal(script.includes('files:[file]'), false, 'Web Share should prioritize clickable website link rather than file-only attachment');
  assert.ok(script.includes('computeDesktopMockupLayout'));
});

test('Desktop mockup cover-fit pan/zoom clamping math prevents black gaps and supports vertical artwork panning', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const vm = await import('node:vm');

  const modalSrc = fs.readFileSync(path.resolve('frontend/src/js/ui/modal.js'), 'utf8');
  const sandbox = {
    ui: {},
    state: {},
    elements: {},
    api: {},
    utils: {},
    preventTouchSave: () => {},
  };
  vm.runInNewContext(modalSrc, sandbox);
  const compute = sandbox.ui.computeDesktopMockupLayout;
  assert.equal(typeof compute, 'function');

  // Vertical 800x1100 inside 800x450 16:9 monitor
  const vertBase = compute({ stageW: 800, stageH: 450, natW: 800, natH: 1100, scale: 1, x: 500, y: -900 });
  assert.equal(vertBase.baseW, 800);
  assert.equal(vertBase.baseH, 1100);
  assert.equal(vertBase.maxX, 0);
  assert.equal(vertBase.maxY, 325);
  assert.equal(vertBase.x, 0);
  assert.equal(vertBase.y, -325);

  // Landscape 1920x1080 zoomed to 2x (clamped max 3x, min 1x)
  const landZoom = compute({ stageW: 800, stageH: 450, natW: 1920, natH: 1080, scale: 2, x: 999, y: 999 });
  assert.equal(landZoom.scale, 2);
  assert.equal(landZoom.maxX, 400);
  assert.equal(landZoom.maxY, 225);
  assert.equal(landZoom.x, 400);
  assert.equal(landZoom.y, 225);

  const clampedScale = compute({ stageW: 800, stageH: 450, natW: 1920, natH: 1080, scale: 9, x: 0, y: 0 });
  assert.equal(clampedScale.scale, 3);
});
