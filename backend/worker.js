
function parseImageMeta(key, bucket) {
  const allowedExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const lower = key.toLowerCase();

  if (!allowedExt.some(ext => lower.endsWith(ext))) return null;

  if (lower.startsWith('_')) return null;
  if (lower.startsWith('header/') || lower.includes('/header/')) return null;

  const parts = key.split('/');
  let category = 'Other', subCategory = null;
  if (parts.length >= 2) {
    category = parts[0];
    if (parts.length > 2) subCategory = parts[1];
  }
  category = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
  if (subCategory) subCategory = subCategory.toLowerCase();

  const filename = parts[parts.length - 1];
  const title = filename
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());

  const urlPrefix = bucket === 'main'
    ? '/api/img/'
    : bucket === 'comitbase'
      ? '/api/comitbase/img/'
      : '/api/dtreasure/img/';

  return {
    // FIX: id stabil berbasis path (bucket:key), BUKAN content-hash (httpEtag).
    // ETag berubah setiap file di-replace di key yang sama → purchased_images/
    // views/downloads kehilangan relasinya. id berbasis path tetap konsisten
    // walau isi file diganti.
    id:           `${bucket}:${key}`,
    r2_key:       key,
    bucket,
    title,
    category,
    sub_category: subCategory,
    url:          `${urlPrefix}${encodeURIComponent(key)}`,
  };
}

// ============================================================
// DTREASURE MODULE — paket, PayPal helper, fulfillment, preview
// ============================================================
const PACKS = {
  '5$':   { priceCents: 500,   credits: 200,  bonus: 0,    lifetime: false },
  '25$':  { priceCents: 2500,  credits: 1300, bonus: 450,  lifetime: false },
  '45$':  { priceCents: 4500,  credits: 2700, bonus: 900,  lifetime: false },
  '75$':  { priceCents: 7500,  credits: 4500, bonus: 1400, lifetime: false },
  '99$':  { priceCents: 9900,  credits: 7000, bonus: 2300, lifetime: false },
  '125$': { priceCents: 12500, credits: 0,    bonus: 0,    lifetime: true  },
};
const SPEND_COST    = 10;
const PREVIEW_WIDTH = 640;
const TOKEN_RE      = /^u_[a-z0-9]{6,12}_[a-f0-9]{32}$/;
const ELIGIBLE      = "status IN ('created','processing','pending')";

const isValidToken = (t) => typeof t === 'string' && TOKEN_RE.test(t);
const hasPack      = (k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(PACKS, k);
const nowSec       = () => Math.floor(Date.now() / 1000);
const centsOf      = (v) => Math.round(parseFloat(v || '0') * 100);
const usd          = (cents) => (cents / 100).toFixed(2);

// ---------- PayPal ----------
const paypalBase = (env) =>
  env.PAYPAL_ENV === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';

let _ppToken = { value: null, exp: 0 };

async function getPayPalAccessToken(env) {
  if (_ppToken.value && _ppToken.exp > Date.now() + 60_000) return _ppToken.value;
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET_ID) throw new Error('PayPal credentials not configured');
  const res = await fetch(`${paypalBase(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET_ID}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal auth failed: HTTP ${res.status}`);
  const data = await res.json();
  _ppToken = { value: data.access_token, exp: Date.now() + (data.expires_in || 300) * 1000 };
  return _ppToken.value;
}

async function paypalRequest(env, method, path, body, requestId, _retry = false) {
  const token   = await getPayPalAccessToken(env);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (requestId) headers['PayPal-Request-Id'] = requestId;
  const res = await fetch(`${paypalBase(env)}${path}`, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !_retry) {
    _ppToken = { value: null, exp: 0 };
    return paypalRequest(env, method, path, body, requestId, true);
  }
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { ok: res.ok, status: res.status, data };
}

function isTrustedPayPalCert(certUrl) {
  try {
    const u = new URL(certUrl);
    return u.protocol === 'https:' && [
      'api.paypal.com', 'api-m.paypal.com', 'api.sandbox.paypal.com', 'api-m.sandbox.paypal.com',
    ].includes(u.hostname);
  } catch { return false; }
}

// Body mentah disisipkan apa adanya (PayPal memverifikasi terhadap body asli)
async function verifyWebhookSignature(env, h, rawBody) {
  const j    = JSON.stringify;
  const body = `{"auth_algo":${j(h.authAlgo)},"cert_url":${j(h.certUrl)},"transmission_id":${j(h.transmissionId)},` +
               `"transmission_sig":${j(h.transmissionSig)},"transmission_time":${j(h.transmissionTime)},` +
               `"webhook_id":${j(env.PAYPAL_WEBHOOK_ID)},"webhook_event":${rawBody}}`;
  const token = await getPayPalAccessToken(env);
  const res = await fetch(`${paypalBase(env)}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body,
  });
  if (!res.ok) return false;
  const data = await res.json();
  return data.verification_status === 'SUCCESS';
}

// Validasi hasil capture terhadap order yang DIBUAT SERVER (bukan input klien)
function validateCapture(order, row) {
  const capture = order?.purchase_units?.[0]?.payments?.captures?.[0];
  if (!capture) return { state: 'rejected', reason: 'no_capture' };
  const amt = capture.amount || {};
  if (amt.currency_code !== 'USD' || row.currency !== 'USD')
    return { state: 'rejected', reason: `currency ${amt.currency_code}` };
  if (centsOf(amt.value) !== row.amount_cents)
    return { state: 'rejected', reason: `amount ${amt.value} != ${row.amount_cents} cents` };
  if (capture.status === 'COMPLETED') return { state: 'completed', captureId: capture.id };
  if (capture.status === 'PENDING')   return { state: 'pending',   captureId: capture.id };
  return { state: 'rejected', reason: `capture_${capture.status}` };
}

// Kredit + ledger + status 'completed' dalam SATU transaksi (DB.batch).
// Semua statement dijaga status order, jadi aman dipanggil dobel (capture + webhook).
// Return true bila kredit diberikan SEKARANG, false bila sudah pernah.
async function fulfillOrder(env, row, captureId) {
  if (!row.user_id) throw new Error(`Order ${row.order_id} tanpa user_id`);
  const pack = PACKS[row.pack_key];
  if (!pack) throw new Error(`Pack tidak dikenal: ${row.pack_key}`);
  const credits = pack.credits + pack.bonus;
  const guard   = `EXISTS (SELECT 1 FROM dt_orders WHERE id = ? AND ${ELIGIBLE})`;
  const DB      = env.DB;

  const res = await DB.batch([
    DB.prepare(`
      INSERT INTO user_credits (user_id, credits, lifetime)
      SELECT ?, ?, ? WHERE ${guard}
      ON CONFLICT(user_id) DO UPDATE SET
        credits  = credits + excluded.credits,
        lifetime = MAX(lifetime, excluded.lifetime)
    `).bind(row.user_id, credits, pack.lifetime ? 1 : 0, row.id),
    DB.prepare(`
      INSERT OR IGNORE INTO credit_ledger (id, user_id, delta, kind, ref)
      SELECT ?, ?, ?, 'purchase', ? WHERE ${guard}
    `).bind(`purchase:${row.order_id}`, row.user_id, credits, row.order_id, row.id),
    DB.prepare(`
      UPDATE dt_orders
      SET status = 'completed', capture_id = ?, completed_at = ?, error_message = NULL, updated_at = ?
      WHERE id = ? AND ${ELIGIBLE}
    `).bind(captureId || null, new Date().toISOString(), nowSec(), row.id),
  ]);
  return res[2].meta.changes === 1;
}

// Refund penuh / reversal: cabut kredit atau lifetime, sekali saja (idempotent).
async function revokeOrder(env, row, newStatus) {
  const pack = PACKS[row.pack_key];
  if (!pack || !row.user_id) return false;
  const credits = pack.credits + pack.bonus;
  const guard   = "EXISTS (SELECT 1 FROM dt_orders WHERE id = ? AND status IN ('completed','disputed'))";
  const DB      = env.DB;

  const res = await DB.batch([
    pack.lifetime
      ? DB.prepare(`UPDATE user_credits SET lifetime = 0 WHERE user_id = ? AND ${guard}`).bind(row.user_id, row.id)
      : DB.prepare(`UPDATE user_credits SET credits = credits - ? WHERE user_id = ? AND ${guard}`).bind(credits, row.user_id, row.id),
    DB.prepare(`
      INSERT OR IGNORE INTO credit_ledger (id, user_id, delta, kind, ref)
      SELECT ?, ?, ?, 'revoke', ? WHERE ${guard}
    `).bind(`revoke:${row.order_id}`, row.user_id, pack.lifetime ? 0 : -credits, row.order_id, row.id),
    DB.prepare(`
      UPDATE dt_orders SET status = ?, refunded_at = ?, updated_at = ?
      WHERE id = ? AND status IN ('completed','disputed')
    `).bind(newStatus, new Date().toISOString(), nowSec(), row.id),
  ]);
  return res[2].meta.changes === 1;
}

async function processPayPalEvent(env, ev) {
  const DB   = env.DB;
  const type = ev.event_type;
  const r    = ev.resource || {};
  const log  = (outcome, orderId, captureId) =>
    DB.prepare('INSERT OR IGNORE INTO payment_events (id, event_type, order_id, capture_id, outcome) VALUES (?, ?, ?, ?, ?)')
      .bind(ev.id || crypto.randomUUID(), type, orderId || null, captureId || null, outcome).run();

  // ---- COMPLETED / PENDING / DENIED ----
  if (['PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.CAPTURE.PENDING', 'PAYMENT.CAPTURE.DENIED'].includes(type)) {
    const orderId   = r.supplementary_data?.related_ids?.order_id;
    const captureId = r.id;
    if (!orderId) { await log('no_order_id', null, captureId); return; }

    const row = await DB.prepare('SELECT * FROM dt_orders WHERE order_id = ?').bind(orderId).first();
    if (!row) {
      // Bukan order buatan server ini (mis. klien lama): JANGAN auto-credit, simpan untuk review
      await DB.prepare(`
        INSERT OR IGNORE INTO dt_orders (id, order_id, amount_cents, currency, status, capture_id, error_message, updated_at)
        VALUES (?, ?, ?, ?, 'unmatched', ?, ?, ?)
      `).bind(`order:${orderId}`, orderId, centsOf(r.amount?.value), r.amount?.currency_code || 'USD',
              captureId || null, `unmatched ${type}`, nowSec()).run();
      console.error(`[Webhook] ORDER TIDAK DIKENAL ${orderId} — perlu review manual`);
      await log('unmatched', orderId, captureId);
      return;
    }

    const ts = nowSec();
    if (type === 'PAYMENT.CAPTURE.DENIED') {
      await DB.prepare(`UPDATE dt_orders SET status = 'failed', updated_at = ? WHERE id = ? AND ${ELIGIBLE}`).bind(ts, row.id).run();
      await log('denied', orderId, captureId);
      return;
    }
    if (type === 'PAYMENT.CAPTURE.PENDING') {
      await DB.prepare(`UPDATE dt_orders SET status = 'pending', capture_id = ?, updated_at = ? WHERE id = ? AND status IN ('created','processing')`)
        .bind(captureId || null, ts, row.id).run();
      await log('pending', orderId, captureId);
      return;
    }
    // COMPLETED
    if (r.amount?.currency_code !== 'USD' || centsOf(r.amount?.value) !== row.amount_cents) {
      await DB.prepare(`UPDATE dt_orders SET status = 'rejected', error_message = ?, updated_at = ? WHERE id = ? AND ${ELIGIBLE}`)
        .bind(`webhook amount ${r.amount?.value} ${r.amount?.currency_code}`, ts, row.id).run();
      console.error(`[Webhook] AMOUNT MISMATCH order ${orderId}`);
      await log('amount_mismatch', orderId, captureId);
      return;
    }
    const fulfilled = await fulfillOrder(env, row, captureId); // throw → handler balas 500 → PayPal retry
    await log(fulfilled ? 'credited' : 'already_done', orderId, captureId);
    return;
  }

  // ---- REFUNDED / REVERSED ----
  if (type === 'PAYMENT.CAPTURE.REFUNDED' || type === 'PAYMENT.CAPTURE.REVERSED') {
    const ids = new Set();
    if (r.id) ids.add(r.id);
    for (const l of r.links || []) {
      if (l.rel === 'up') { const m = /\/captures\/([^/?]+)/.exec(l.href || ''); if (m) ids.add(m[1]); }
    }
    const list = [...ids];
    if (!list.length) { await log('no_capture_id'); return; }

    const row = await DB.prepare(`SELECT * FROM dt_orders WHERE capture_id IN (${list.map(() => '?').join(',')})`).bind(...list).first();
    if (!row) { await log('refund_unmatched', null, list[0]); return; }

    const refunded = centsOf(r.seller_payable_breakdown?.total_refunded_amount?.value ?? r.amount?.value);
    const full     = type === 'PAYMENT.CAPTURE.REVERSED' || refunded >= row.amount_cents;
    if (!full) {
      await DB.prepare('UPDATE dt_orders SET error_message = ?, updated_at = ? WHERE id = ?')
        .bind(`partial refund ${refunded} cents — review manual`, nowSec(), row.id).run();
      await log('partial_refund', row.order_id, list[0]);
      return;
    }
    const done = await revokeOrder(env, row, type === 'PAYMENT.CAPTURE.REVERSED' ? 'reversed' : 'refunded');
    await log(done ? 'revoked' : 'already_revoked', row.order_id, list[0]);
    return;
  }

  // ---- DISPUTE (struktur payload berdasarkan PayPal Disputes API — uji di sandbox) ----
  if (type === 'CUSTOMER.DISPUTE.CREATED') {
    const ids = (r.disputed_transactions || []).map((t) => t.seller_transaction_id).filter(Boolean);
    if (!ids.length) { await log('dispute_no_txn'); return; }
    const row = await DB.prepare(`SELECT * FROM dt_orders WHERE capture_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).first();
    if (row) {
      await DB.prepare(`UPDATE dt_orders SET status = 'disputed', updated_at = ? WHERE id = ? AND status = 'completed'`).bind(nowSec(), row.id).run();
    }
    await log(row ? 'disputed' : 'dispute_unmatched', row?.order_id, ids[0]);
    return;
  }

  await log('ignored');
}

// ---------- Preview DTREASURE ----------
const previewKeyOf = (key) => `_preview/${key}.webp`; // prefix '_' sudah di-skip oleh parseImageMeta

let _active = 0;
const _waiters = [];
async function withBuildSlot(fn, max = 3) { // batasi konkurensi agar memori isolate aman
  while (_active >= max) await new Promise((r) => _waiters.push(r));
  _active++;
  try { return await fn(); } finally { _active--; _waiters.shift()?.(); }
}

async function buildPreview(env, key) {
  const original = await env.TREASURE.get(key);
  if (!original) return null;
  const buf = await original.arrayBuffer();

  const render = async (watermark) => {
    let img = env.IMAGES.input(new Response(buf).body).transform({ width: PREVIEW_WIDTH });
    if (watermark) {
      img = img.draw(
        env.IMAGES.text('ZXAION VERSE · PREVIEW', { size: 26, color: '#ffffff' }),
        { repeat: true, opacity: 0.28 }
      );
    }
    return (await img.output({ format: 'image/webp', quality: 60 })).response().arrayBuffer();
  };

  try { return await render(true); }
  catch (e) {
    console.warn('[Preview] watermark gagal, fallback tanpa watermark:', e.message);
    return await render(false);
  }
}

async function serveDtreasurePreview(env, ctx, key, corsHeaders) {
  const errJson = (status, msg) => new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  if (!env.TREASURE || key.includes('..') || !parseImageMeta(key, 'dtreasure')) return errJson(404, 'Not found');

  const okHeaders = {
    ...corsHeaders,
    'Content-Type': 'image/webp',
    'Cache-Control': 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
  };

  const cached = await env.TREASURE.get(previewKeyOf(key));
  if (cached) return new Response(cached.body, { headers: okHeaders });

  if (!env.IMAGES) return errJson(503, 'Preview service not configured'); // JANGAN fallback ke file asli
  try {
    const buf = await withBuildSlot(() => buildPreview(env, key));
    if (!buf) return errJson(404, 'Not found');
    ctx.waitUntil(env.TREASURE.put(previewKeyOf(key), buf, { httpMetadata: { contentType: 'image/webp' } }));
    return new Response(buf, { headers: okHeaders });
  } catch (e) {
    console.error('[Preview] gagal:', key, e.message);
    return errJson(503, 'Preview unavailable');
  }
}

async function listAllKeys(bucket) {
  let cursor, keys = [];
  do {
    const r = await bucket.list({ cursor, limit: 1000 });
    for (const o of r.objects) keys.push(o.key);
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return keys;
}

async function warmDtreasurePreviews(env, limit = 5) {
  if (!env.TREASURE || !env.IMAGES) return;
  const keys    = await listAllKeys(env.TREASURE);
  const have    = new Set(keys.filter((k) => k.startsWith('_preview/')));
  const missing = keys.filter((k) => parseImageMeta(k, 'dtreasure') && !have.has(previewKeyOf(k))).slice(0, limit);
  for (const key of missing) {
    try {
      const buf = await buildPreview(env, key);
      if (buf) await env.TREASURE.put(previewKeyOf(key), buf, { httpMetadata: { contentType: 'image/webp' } });
    } catch (e) { console.error('[Warm] gagal:', key, e.message); }
  }
}
// ============================================================
// Scheduled Handler: Auto-scan R2 → D1 (Cron Trigger)
// wrangler.toml: [triggers] crons = ["0 * * * *"]
// ============================================================
async function handleScheduled(env) {
  const DB = env.DB;
  const buckets = [
    { bucket: env.Zxaion_B,  name: 'main' },
    { bucket: env.ZX_BUCKET, name: 'comitbase' },
    { bucket: env.TREASURE,  name: 'dtreasure' },
  ];

  const BATCH_CHUNK_SIZE = 200; // FIX: kirim batch bertahap, cegah payload D1 kebesaran

  for (const { bucket, name } of buckets) {
    if (!bucket) continue;
    const syncStartedAt = new Date().toISOString();
      // Pre-generate preview DTREASURE (dibatasi per run supaya aman dari limit subrequest)
  try { await warmDtreasurePreviews(env, 5); }
  catch (e) { console.error('[Scheduled] warm preview:', e.message); }

    try {
      let cursor  = undefined;
      let totalSynced = 0;
      let pending = [];

      const flush = async () => {
        if (pending.length === 0) return;
        await DB.batch(pending);
        pending = [];
      };

      do {
        const listResult = await bucket.list({ cursor, limit: 1000 });

        for (const obj of listResult.objects) {
          const meta = parseImageMeta(obj.key, name);
          if (!meta) continue;

          pending.push(
            DB.prepare(`
              INSERT INTO images (id, r2_key, bucket, title, category, sub_category, size, uploaded, last_synced)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                title        = excluded.title,
                category     = excluded.category,
                sub_category = excluded.sub_category,
                size         = excluded.size,
                uploaded     = excluded.uploaded,
                last_synced  = excluded.last_synced
            `).bind(
              meta.id,
              obj.key,
              name,
              meta.title,
              meta.category,
              meta.sub_category,
              obj.size,
              obj.uploaded ? new Date(obj.uploaded).toISOString() : null,
              syncStartedAt
            )
          );
          totalSynced++;

          if (pending.length >= BATCH_CHUNK_SIZE) await flush();
        }

        cursor = listResult.truncated ? listResult.cursor : undefined;
      } while (cursor);

      await flush();

      // FIX: hapus baris yang tidak lagi ditemukan di R2 pada sync ini
      // (file sudah dihapus dari bucket). Tanpa ini, gambar yang dihapus
      // tetap nyangkut di galeri (link mati / 404) selamanya.
      const cleanup = await DB.prepare(
        'DELETE FROM images WHERE bucket = ? AND (last_synced IS NULL OR last_synced < ?)'
      ).bind(name, syncStartedAt).run();

      const removed = cleanup?.meta?.changes || 0;
      console.log(`[Scheduled] Synced ${totalSynced} images, removed ${removed} stale rows from bucket: ${name}`);
    } catch (e) {
      console.error(`[Scheduled] Error syncing bucket ${name}:`, e.message);
    }
  }
}

// ============================================================
// Export default — fetch + scheduled
// ============================================================
export default {

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(env));
  },

  // FIX: ctx sebagai parameter ke-3 — wajib untuk ctx.waitUntil()
  async fetch(request, env, ctx) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    const mainBucket      = env.Zxaion_B;
    const comitbaseBucket = env.ZX_BUCKET;
    const treasureBucket  = env.TREASURE;
    const DB              = env.DB;

    const PAYPAL_CLIENT_ID        = env.PAYPAL_CLIENT_ID;
    const PAYPAL_CLIENT_SECRET_ID = env.PAYPAL_CLIENT_SECRET_ID;
    const PAYPAL_WEBHOOK_ID       = env.PAYPAL_WEBHOOK_ID;
    const PAYPAL_BASE             = 'https://api-m.paypal.com';

    // ----------------------------------------------------------------
    // CORS
    // ----------------------------------------------------------------
    const ALLOWED_ORIGINS = [
      'https://zxaion-verse.pages.dev',
      'https://zxaionverse.com',
    ];
    const origin = request.headers.get('Origin') || '';
    const corsHeaders = {
      'Access-Control-Allow-Origin':  ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Token',
      'Access-Control-Max-Age':       '86400',
      'Vary':                         'Origin',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

       // ----------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    
    const json = (data, status = 200, extra = {}) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra },
      });
    
    function getUserToken(req) {
      return req.headers.get('X-User-Token') || 'anonymous';
    }
    
    async function checkRateLimit(endpoint, identifier, limit = 50, windowSec = 3600) {
      const key = `rate:${endpoint}:${identifier}`;
      const now = Math.floor(Date.now() / 1000);
      try {
        await DB.prepare(`
          INSERT INTO rate_limits (id, count, reset_time) VALUES (?, 1, ?)
          ON CONFLICT(id) DO UPDATE SET
            count      = CASE WHEN reset_time < ? THEN 1    ELSE count + 1 END,
            reset_time = CASE WHEN reset_time < ? THEN ?    ELSE reset_time END
        `).bind(key, now + windowSec, now, now, now + windowSec).run();
        
        const record = await DB.prepare('SELECT count FROM rate_limits WHERE id = ?').bind(key).first();
        return !record || record.count <= limit;
      } catch (e) {
        console.error('[RateLimit] DB error:', e.message);
        return true; // fail open
      }
    }

    // ================================================================
    // ENDPOINT: Health check
    // ================================================================
    if (path === '/api/health' && method === 'GET') {
      try {
        await DB.prepare('SELECT 1').first();
        return new Response(JSON.stringify({ status: 'ok', db: 'connected' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(
          JSON.stringify({ status: 'error', db: 'disconnected', message: e.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ================================================================
    // ENDPOINT: Manual sync trigger (POST /api/admin/sync)
    // ================================================================
    if (path === '/api/admin/sync' && method === 'POST') {
      const adminToken = request.headers.get('X-Admin-Token');
      if (!env.ADMIN_TOKEN || adminToken !== env.ADMIN_TOKEN) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      try {
        await handleScheduled(env);
        return new Response(JSON.stringify({ success: true, message: 'Sync completed' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

        // ================================================================
    // ENDPOINT: PayPal Webhook
    // ================================================================
    if (path === '/api/paypal/webhook' && method === 'POST') {
      try {
        if (!env.PAYPAL_WEBHOOK_ID) {
          console.error('[Webhook] PAYPAL_WEBHOOK_ID belum diset');
          return new Response('Server misconfigured', { status: 500 });
        }
        const rawBody = await request.text();
        let ev;
        try { ev = JSON.parse(rawBody); } catch { return new Response('Invalid JSON', { status: 400 }); }

        const h = {
          transmissionId:   request.headers.get('paypal-transmission-id'),
          transmissionTime: request.headers.get('paypal-transmission-time'),
          certUrl:          request.headers.get('paypal-cert-url'),
          transmissionSig:  request.headers.get('paypal-transmission-sig'),
          authAlgo:         request.headers.get('paypal-auth-algo'),
        };
        if (!h.transmissionId || !h.transmissionTime || !h.certUrl || !h.transmissionSig || !h.authAlgo) {
          return new Response('Unauthorized', { status: 401 });
        }
        if (!isTrustedPayPalCert(h.certUrl)) {
          console.error('[Webhook] certUrl tidak tepercaya:', h.certUrl);
          return new Response('Unauthorized', { status: 401 });
        }
        if (!(await verifyWebhookSignature(env, h, rawBody))) {
          console.error('[Webhook] signature tidak valid');
          return new Response('Unauthorized', { status: 401 });
        }

        await processPayPalEvent(env, ev);
        return new Response('OK', { status: 200 });
      } catch (e) {
        console.error('[Webhook] error:', e.message);
        return new Response('Internal error', { status: 500 }); // 5xx → PayPal akan retry
      }
    }
    // ================================================================
    // ENDPOINT: List main gallery
    // ================================================================
    if (path === '/api/list' && method === 'GET') {
      try {
        const rawPage  = parseInt(url.searchParams.get('page')  ?? '1',  10);
        const rawLimit = parseInt(url.searchParams.get('limit') ?? '500', 10);
        const page     = Math.max(1,   Number.isFinite(rawPage)  ? rawPage  : 1);
        const limit    = Math.min(500, Number.isFinite(rawLimit) ? rawLimit : 500);
        const offset   = (page - 1) * limit;
        const category = url.searchParams.get('category') || null;

        let query, bindings;
        if (category && category !== 'All') {
          query    = "SELECT * FROM images WHERE bucket = 'main' AND category = ? ORDER BY uploaded DESC LIMIT ? OFFSET ?";
          bindings = [category, limit, offset];
        } else {
          query    = "SELECT * FROM images WHERE bucket = 'main' AND category != 'Header' ORDER BY uploaded DESC LIMIT ? OFFSET ?";
          bindings = [limit, offset];
        }

        const { results } = await DB.prepare(query).bind(...bindings).all();

        const photos = results.map(row => ({
          id:            row.id,
          title:         row.title,
          category:      row.category,
          subCategory:   row.sub_category,
          url:           `/api/img/${encodeURIComponent(row.r2_key)}`,
          size:          row.size,
          uploaded:      row.uploaded,
          path:          row.r2_key,
          viewCount:     row.view_count     || 0,
          downloadCount: row.download_count || 0,
        }));

        return new Response(JSON.stringify(photos), {
          headers: {
            ...corsHeaders,
            'Content-Type':  'application/json',
            'Cache-Control': 'public, max-age=60',
          },
        });
      } catch (e) {
        console.error('/api/list error:', e.message);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ================================================================
    // ENDPOINT: COMITBASE list
    // ================================================================
    if (path === '/api/comitbase/list' && method === 'GET') {
      if (!comitbaseBucket) return new Response('[]', {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
      try {
        // FIX: dukungan pagination — sebelumnya hardcode LIMIT 500 tanpa OFFSET,
        // gambar ke-501 dst tidak pernah bisa diambil.
        const rawPage  = parseInt(url.searchParams.get('page')  ?? '1',   10);
        const rawLimit = parseInt(url.searchParams.get('limit') ?? '500', 10);
        const page     = Math.max(1,   Number.isFinite(rawPage)  ? rawPage  : 1);
        const limit    = Math.min(500, Number.isFinite(rawLimit) ? rawLimit : 500);
        const offset   = (page - 1) * limit;

        const { results } = await DB.prepare(
          `SELECT id, title, r2_key, uploaded, view_count, download_count
           FROM images WHERE bucket = 'comitbase'
           ORDER BY uploaded DESC LIMIT ? OFFSET ?`
        ).bind(limit, offset).all();

        const photos = results.map(row => ({
          id:            row.id,
          title:         row.title,
          uploader:      'Community',
          url:           `/api/comitbase/img/${encodeURIComponent(row.r2_key)}`,
          uploaded:      row.uploaded,
          viewCount:     row.view_count     || 0,
          downloadCount: row.download_count || 0,
        }));

        return new Response(JSON.stringify(photos), {
          headers: {
            ...corsHeaders,
            'Content-Type':  'application/json',
            'Cache-Control': 'public, max-age=60',
          },
        });
      } catch (e) {
        console.error('/api/comitbase/list error:', e.message);
        return new Response('[]', {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ================================================================
    // ENDPOINT: DTREASURE list
    // ================================================================
    if (path === '/api/dtreasure/list' && method === 'GET') {
      if (!treasureBucket) return new Response('[]', {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
      try {
        // FIX: dukungan pagination — sama seperti /api/comitbase/list.
        const rawPage  = parseInt(url.searchParams.get('page')  ?? '1',   10);
        const rawLimit = parseInt(url.searchParams.get('limit') ?? '500', 10);
        const page     = Math.max(1,   Number.isFinite(rawPage)  ? rawPage  : 1);
        const limit    = Math.min(500, Number.isFinite(rawLimit) ? rawLimit : 500);
        const offset   = (page - 1) * limit;

        const { results } = await DB.prepare(
          `SELECT id, title, r2_key, uploaded, view_count, download_count
           FROM images WHERE bucket = 'dtreasure'
           ORDER BY uploaded DESC LIMIT ? OFFSET ?`
        ).bind(limit, offset).all();

        const photos = results.map(row => ({
          id:            row.id,
          title:         row.title,
          category:      'DTREASURE',
          url:           `/api/dtreasure/img/${encodeURIComponent(row.r2_key)}`,
          uploaded:      row.uploaded,
          viewCount:     row.view_count     || 0,
          downloadCount: row.download_count || 0,
        }));

        return new Response(JSON.stringify(photos), {
          headers: {
            ...corsHeaders,
            'Content-Type':  'application/json',
            'Cache-Control': 'private, max-age=30',
          },
        });
      } catch (e) {
        console.error('/api/dtreasure/list error:', e.message);
        return new Response('[]', {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ================================================================
    // ENDPOINT: Top trending images
    // ================================================================
    if (path === '/api/trending' && method === 'GET') {
      const rawLimit = parseInt(url.searchParams.get('limit') ?? '20', 10);
      const limit    = Math.min(50, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 20));

      try {
        const { results } = await DB.prepare(`
          SELECT id, title, r2_key, bucket, category, sub_category,
                 view_count, download_count,
                 (COALESCE(view_count, 0) + COALESCE(download_count, 0)) AS score
          FROM images
          WHERE bucket = 'main'
            AND category != 'Header'
          ORDER BY score DESC, uploaded DESC
          LIMIT ?
        `).bind(limit).all();

        const photos = results.map(row => ({
          id:            row.id,
          title:         row.title,
          category:      row.category,
          subCategory:   row.sub_category,
          url:           `/api/img/${encodeURIComponent(row.r2_key)}`,
          viewCount:     row.view_count     || 0,
          downloadCount: row.download_count || 0,
          score:         row.score          || 0,
        }));

        return new Response(JSON.stringify(photos), {
          headers: {
            ...corsHeaders,
            'Content-Type':  'application/json',
            'Cache-Control': 'public, max-age=120',
          },
        });
      } catch (e) {
        console.error('/api/trending error:', e.message);
        return new Response(JSON.stringify([]), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ================================================================
    // ENDPOINT: Image stats
    // ================================================================
    if (path.startsWith('/api/stats/') && method === 'GET') {
      const rawSegment = path.split('/').filter(Boolean).pop() || '';
      const photoId    = decodeURIComponent(rawSegment);
      if (!photoId) {
        return new Response(JSON.stringify({ error: 'Invalid photo ID' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      try {
        const row = await DB.prepare(
          'SELECT view_count, download_count FROM images WHERE id = ?'
        ).bind(photoId).first();

        return new Response(JSON.stringify({
          views:     row?.view_count     || 0,
          downloads: row?.download_count || 0,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (e) {
        console.error('/api/stats error:', e.message);
        return new Response(JSON.stringify({ views: 0, downloads: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ================================================================
    // ENDPOINT: Record view
    // FIX: ctx.waitUntil + DB.batch — return 204 IMMEDIATELY.
    // DB write terjadi di background, eliminasi ~50-200ms latensi dari
    // response time yang sebelumnya menunggu DB write selesai.
    // ================================================================
    if (path.startsWith('/api/view/') && method === 'POST') {
      const rawSegment = path.split('/').filter(Boolean).pop() || '';
      const photoId    = decodeURIComponent(rawSegment);
      if (!photoId) {
        return new Response(null, { status: 400, headers: corsHeaders });
      }
      const userId = getUserToken(request);
      if (!await checkRateLimit('view', userId, 100, 3600)) {
        return new Response(null, { status: 429, headers: corsHeaders });
      }

      ctx.waitUntil(
        DB.batch([
          DB.prepare(
            'UPDATE images SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?'
          ).bind(photoId),
          DB.prepare(
            'INSERT OR IGNORE INTO views (photo_id, user_id) VALUES (?, ?)'
          ).bind(photoId, userId),
        ]).catch(e => console.error('[view] DB batch error:', e.message))
      );

      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ================================================================
    // ENDPOINT: Record download
    // FIX: ctx.waitUntil + DB.batch — return 204 IMMEDIATELY.
    // ================================================================
    if (path.startsWith('/api/download/') && method === 'POST') {
      const rawSegment = path.split('/').filter(Boolean).pop() || '';
      const photoId    = decodeURIComponent(rawSegment);
      if (!photoId) {
        return new Response(null, { status: 400, headers: corsHeaders });
      }
      const userId = getUserToken(request);
      if (!await checkRateLimit('download', userId, 50, 3600)) {
        return new Response(null, { status: 429, headers: corsHeaders });
      }

      ctx.waitUntil(
        DB.batch([
          DB.prepare(
            'UPDATE images SET download_count = COALESCE(download_count, 0) + 1 WHERE id = ?'
          ).bind(photoId),
          DB.prepare(
            'INSERT OR IGNORE INTO downloads (photo_id, user_id) VALUES (?, ?)'
          ).bind(photoId, userId),
        ]).catch(e => console.error('[download] DB batch error:', e.message))
      );

      return new Response(null, { status: 204, headers: corsHeaders });
    }

        // ================================================================
    // ENDPOINT: Credit balance
    // ================================================================
    if (path === '/api/credits/balance' && method === 'GET') {
      const userId = getUserToken(request);
      const empty  = { credits: 0, lifetime: false, purchased: [] };
      if (!isValidToken(userId)) return json(empty);
      if (!await checkRateLimit('dt-balance', userId, 300, 3600)) return json(empty, 429);

      try {
        const user = await DB.prepare('SELECT credits, lifetime FROM user_credits WHERE user_id = ?').bind(userId).first();
        const rows = await DB.prepare(
          "SELECT photo_id FROM purchased_images WHERE user_id = ? AND photo_id LIKE 'dtreasure:%' LIMIT 5000"
        ).bind(userId).all();
        return json({
          credits:   Math.max(0, user?.credits || 0),
          lifetime:  !!user?.lifetime,
          purchased: rows.results.map((r) => r.photo_id),
        });
      } catch (e) {
        console.error('/api/credits/balance error:', e.message);
        return json(empty);
      }
    }

    // ================================================================
    // ENDPOINT: Buat order PayPal (SERVER-SIDE — harga & mata uang dari server)
    // ================================================================
    if (path === '/api/dtreasure/checkout/create' && method === 'POST') {
      const userId = getUserToken(request);
      if (!isValidToken(userId)) return json({ success: false, error: 'Authentication required' }, 401);
      if (!await checkRateLimit('dt-checkout', userId, 20, 3600) ||
          !await checkRateLimit('dt-checkout-ip', clientIp, 60, 3600)) {
        return json({ success: false, error: 'Too many requests' }, 429);
      }

      const body = await request.json().catch(() => null);
      if (!hasPack(body?.pack)) return json({ success: false, error: 'Invalid pack' }, 400);
      const pack = PACKS[body.pack];
      const ref  = crypto.randomUUID(); // custom_id di PayPal — BUKAN token user

      try {
        const created = await paypalRequest(env, 'POST', '/v2/checkout/orders', {
          intent: 'CAPTURE',
          purchase_units: [{
            reference_id: ref,
            custom_id:    ref,
            description:  `ZXAION Credits ${body.pack}`,
            amount:       { currency_code: 'USD', value: usd(pack.priceCents) },
          }],
        }, `create-${ref}`);

        if (!created.ok || !created.data?.id) {
          console.error('[Checkout] create gagal:', created.status, JSON.stringify(created.data)?.slice(0, 400));
          return json({ success: false, error: 'Gagal membuat order PayPal' }, 502);
        }

        await DB.prepare(`
          INSERT INTO dt_orders (id, order_id, ref, user_id, pack_key, amount_cents, currency, status, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'USD', 'created', ?)
        `).bind(`order:${created.data.id}`, created.data.id, ref, userId, body.pack, pack.priceCents, nowSec()).run();

        return json({ success: true, orderID: created.data.id });
      } catch (e) {
        console.error('[Checkout] create error:', e.message);
        return json({ success: false, error: 'Checkout error' }, 500);
      }
    }

    // ================================================================
    // ENDPOINT: Capture order PayPal (SERVER-SIDE, idempotent)
    // ================================================================
    if (path === '/api/dtreasure/checkout/capture' && method === 'POST') {
      const userId = getUserToken(request);
      if (!isValidToken(userId)) return json({ success: false, error: 'Authentication required' }, 401);
      if (!await checkRateLimit('dt-capture', userId, 30, 3600) ||
          !await checkRateLimit('dt-capture-ip', clientIp, 90, 3600)) {
        return json({ success: false, error: 'Too many requests' }, 429);
      }

      const body    = await request.json().catch(() => null);
      const orderID = body?.orderID;
      if (typeof orderID !== 'string' || !/^[A-Za-z0-9]{8,32}$/.test(orderID)) {
        return json({ success: false, error: 'Invalid orderID' }, 400);
      }

      try {
        const row = await DB.prepare('SELECT * FROM dt_orders WHERE order_id = ?').bind(orderID).first();
        if (!row || row.user_id !== userId) return json({ success: false, error: 'Order not found' }, 404);

        const balanceOf = async () => {
          const u = await DB.prepare('SELECT credits, lifetime FROM user_credits WHERE user_id = ?').bind(userId).first();
          return { newBalance: Math.max(0, u?.credits || 0), lifetime: !!u?.lifetime };
        };

        if (row.status === 'completed') return json({ success: true, status: 'completed', ...(await balanceOf()) });
        if (row.status === 'pending')   return json({ success: true, status: 'pending' });
        if (!['created', 'processing'].includes(row.status)) {
          return json({ success: false, error: `Order status: ${row.status}`, orderId: orderID }, 409);
        }

        // Klaim atomik; 'processing' yang macet >20 detik boleh diambil ulang
        const ts    = nowSec();
        const claim = await DB.prepare(`
          UPDATE dt_orders SET status = 'processing', updated_at = ?
          WHERE id = ? AND (status = 'created' OR (status = 'processing' AND updated_at < ?))
        `).bind(ts, row.id, ts - 20).run();

        if (claim.meta.changes === 0) {
          const cur = await DB.prepare('SELECT status FROM dt_orders WHERE id = ?').bind(row.id).first();
          if (cur?.status === 'completed') return json({ success: true, status: 'completed', ...(await balanceOf()) });
          if (cur?.status === 'pending')   return json({ success: true, status: 'pending' });
          return json({ success: false, retryable: true, error: 'Order sedang diproses, coba lagi.' }, 409);
        }

        // Capture ke PayPal (PayPal-Request-Id = idempotent bila diulang)
        let order = null, restart = false;
        try {
          const cap = await paypalRequest(env, 'POST', `/v2/checkout/orders/${orderID}/capture`, {}, `capture-${orderID}`);
          if (cap.ok) {
            order = cap.data;
          } else {
            const issue = cap.data?.details?.[0]?.issue;
            if (issue === 'ORDER_ALREADY_CAPTURED') {
              const g = await paypalRequest(env, 'GET', `/v2/checkout/orders/${orderID}`);
              if (g.ok) order = g.data;
            } else if (issue === 'INSTRUMENT_DECLINED') {
              restart = true;
            } else {
              console.error('[Capture] PayPal error', cap.status, JSON.stringify(cap.data)?.slice(0, 400));
            }
          }
        } catch (e) { console.error('[Capture] network:', e.message); }

        if (!order) {
          await DB.prepare(`UPDATE dt_orders SET status = 'created', updated_at = ? WHERE id = ? AND status = 'processing'`)
            .bind(nowSec(), row.id).run();
          return json({
            success: false, restart, retryable: !restart,
            error: restart ? 'Pembayaran ditolak, silakan pilih metode lain.' : 'Gagal menghubungi PayPal, coba lagi.',
          }, restart ? 422 : 502);
        }

        const v = validateCapture(order, row);

        if (v.state === 'completed') {
          try {
            await fulfillOrder(env, row, v.captureId);
          } catch (e) {
            // status tetap 'processing' → webhook / retry akan menyelesaikan
            console.error('[Capture] fulfill gagal:', e.message, orderID);
            return json({ success: false, retryable: true, error: 'Pembayaran diterima, kredit sedang diproses. Refresh sebentar lagi.', orderId: orderID }, 500);
          }
          return json({ success: true, status: 'completed', ...(await balanceOf()) });
        }

        if (v.state === 'pending') {
          await DB.prepare(`UPDATE dt_orders SET status = 'pending', capture_id = ?, updated_at = ? WHERE id = ? AND status IN ('created','processing')`)
            .bind(v.captureId || null, nowSec(), row.id).run();
          return json({ success: true, status: 'pending' });
        }

        await DB.prepare(`UPDATE dt_orders SET status = 'rejected', error_message = ?, updated_at = ? WHERE id = ? AND ${ELIGIBLE}`)
          .bind(v.reason, nowSec(), row.id).run();
        console.error(`[Capture] REJECTED order ${orderID}: ${v.reason}`);
        return json({ success: false, error: 'Verifikasi pembayaran gagal. Hubungi support dengan Order ID.', orderId: orderID }, 400);

      } catch (e) {
        console.error('[Capture] error:', e.message, orderID);
        return json({ success: false, retryable: true, error: 'Payment processing error.', orderId: orderID }, 500);
      }
    }

    // Endpoint lama (client-side order) DITUTUP
    if (path === '/api/credits/purchase') {
      return json({ success: false, error: 'Endpoint deprecated. Please refresh the page.' }, 410);
    }

    // ================================================================
    // ENDPOINT: Spend credits (atomik: satu transaksi, tanpa kompensasi)
    // ================================================================
    if (path === '/api/credits/spend' && method === 'POST') {
      const userId = getUserToken(request);
      if (!isValidToken(userId)) return json({ success: false, error: 'Authentication required' }, 401);
      if (!await checkRateLimit('dt-spend', userId, 60, 3600)) return json({ success: false, error: 'Too many requests' }, 429);

      const body    = await request.json().catch(() => null);
      const photoId = body?.photoId;
      if (typeof photoId !== 'string' || !photoId.startsWith('dtreasure:') || photoId.length > 600) {
        return json({ success: false, error: 'Invalid photoId' }, 400);
      }

      try {
        const exists = await DB.prepare("SELECT 1 FROM images WHERE id = ? AND bucket = 'dtreasure'").bind(photoId).first();
        if (!exists) return json({ success: false, error: 'Image not found' }, 404);

        const user = await DB.prepare('SELECT credits, lifetime FROM user_credits WHERE user_id = ?').bind(userId).first();

        // Lifetime: tidak potong kredit
        if (user?.lifetime) {
          await DB.prepare('INSERT OR IGNORE INTO purchased_images (user_id, photo_id) VALUES (?, ?)').bind(userId, photoId).run();
          return json({ success: true, newBalance: Math.max(0, user.credits || 0), purchased: true });
        }

        // Satu transaksi: ledger (penanda) → potong kredit → beri kepemilikan.
        // Ledger hanya masuk bila: kredit cukup & belum memiliki. Dua langkah berikutnya bergantung padanya.
        const nonce = `spend:${crypto.randomUUID()}`;
        const res = await DB.batch([
          DB.prepare(`
            INSERT INTO credit_ledger (id, user_id, delta, kind, ref)
            SELECT ?, ?, ?, 'spend', ?
            WHERE EXISTS (SELECT 1 FROM user_credits WHERE user_id = ? AND credits >= ? AND lifetime = 0)
              AND NOT EXISTS (SELECT 1 FROM purchased_images WHERE user_id = ? AND photo_id = ?)
          `).bind(nonce, userId, -SPEND_COST, photoId, userId, SPEND_COST, userId, photoId),
          DB.prepare(`
            UPDATE user_credits SET credits = credits - ?
            WHERE user_id = ? AND EXISTS (SELECT 1 FROM credit_ledger WHERE id = ?)
          `).bind(SPEND_COST, userId, nonce),
          DB.prepare(`
            INSERT OR IGNORE INTO purchased_images (user_id, photo_id)
            SELECT ?, ? WHERE EXISTS (SELECT 1 FROM credit_ledger WHERE id = ?)
          `).bind(userId, photoId, nonce),
        ]);

        const after = await DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?').bind(userId).first();
        const newBalance = Math.max(0, after?.credits || 0);

        if (res[0].meta.changes === 1) return json({ success: true, newBalance, purchased: true });

        const owned = await DB.prepare('SELECT 1 FROM purchased_images WHERE user_id = ? AND photo_id = ?').bind(userId, photoId).first();
        if (owned) return json({ success: true, newBalance, purchased: true, alreadyOwned: true });

        return json({ success: false, error: 'Insufficient credits', currentCredits: newBalance, required: SPEND_COST }, 400);
      } catch (e) {
        console.error('Spend credit error:', e.message);
        return json({ success: false, error: 'Database error' }, 500);
      }
    }

    // ================================================================
    // ENDPOINT: Admin — order DTREASURE bermasalah (butuh X-Admin-Token)
    // ================================================================
    if (path === '/api/admin/dt-orders' && method === 'GET') {
      if (!env.ADMIN_TOKEN || request.headers.get('X-Admin-Token') !== env.ADMIN_TOKEN) {
        return json({ error: 'Unauthorized' }, 401);
      }
      const { results } = await DB.prepare(`
        SELECT id, user_id, pack_key, amount_cents, status, capture_id, error_message, created_at, updated_at
        FROM dt_orders
        WHERE status IN ('unmatched','rejected','failed','disputed')
           OR (status IN ('processing','pending') AND updated_at > 0 AND updated_at < ?)
        ORDER BY created_at DESC LIMIT 100
      `).bind(nowSec() - 900).all();
      return json(results);
    }

    // ================================================================
    // ENDPOINT: DTREASURE preview (PUBLIK, 640px + watermark — bukan file asli)
    // ================================================================
    if (path.startsWith('/api/dtreasure/img/') && method === 'GET') {
      let key;
      try { key = decodeURIComponent(path.slice('/api/dtreasure/img/'.length)); }
      catch { return json({ error: 'Bad key' }, 400); }
      return serveDtreasurePreview(env, ctx, key, corsHeaders);
    }

    // ================================================================
    // ENDPOINT: DTREASURE download FILE ASLI (wajib punya hak akses)
    // Hak akses dihitung server dari key file — bukan dari parameter klien.
    // ================================================================
    if (path.startsWith('/api/dtreasure/download/') && method === 'GET') {
      if (!treasureBucket) return json({ error: 'Not available' }, 503);

      let key;
      try { key = decodeURIComponent(path.slice('/api/dtreasure/download/'.length)); }
      catch { return json({ error: 'Bad key' }, 400); }
      const meta = key.includes('..') ? null : parseImageMeta(key, 'dtreasure');
      if (!meta) return json({ error: 'Not found' }, 404);

      const userId = getUserToken(request);
      if (!isValidToken(userId)) return json({ error: 'Authentication required' }, 401);
      if (!await checkRateLimit('dt-download', userId, 60, 3600) ||
          !await checkRateLimit('dt-download-ip', clientIp, 200, 3600)) {
        return json({ error: 'Too many requests' }, 429);
      }

      try {
        const user = await DB.prepare('SELECT lifetime FROM user_credits WHERE user_id = ?').bind(userId).first();
        let allowed = !!user?.lifetime;
        if (!allowed) {
          allowed = !!(await DB.prepare('SELECT 1 FROM purchased_images WHERE user_id = ? AND photo_id = ?')
            .bind(userId, meta.id).first());
        }
        if (!allowed) return json({ error: 'Purchase required to download this image' }, 403);

        const object = await treasureBucket.get(key);
        if (!object) return json({ error: 'Not found' }, 404);

        const headers = new Headers(corsHeaders);
        object.writeHttpMetadata(headers);
        const raw = key.split('/').pop();
        headers.set('Content-Disposition',
          `attachment; filename="${raw.replace(/[^a-zA-Z0-9._-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(raw)}`);
        headers.set('Cache-Control', 'private, no-store');
        headers.set('X-Content-Type-Options', 'nosniff');
        return new Response(object.body, { headers });
      } catch (e) {
        console.error('[DTREASURE download] error:', e.message);
        return json({ error: 'Server error during authorization check' }, 500);
      }
    }

    // ================================================================
    // ENDPOINT: Serve images main & comitbase (publik)
    // ================================================================
    if (path.startsWith('/api/img/') || path.startsWith('/api/comitbase/img/')) {
      const isComit = path.startsWith('/api/comitbase/img/');
      const bucket  = isComit ? comitbaseBucket : mainBucket;
      const prefix  = isComit ? '/api/comitbase/img/' : '/api/img/';

      try {
        const key    = decodeURIComponent(path.slice(prefix.length));
        const object = await bucket.get(key);
        if (!object) return new Response('Not found', { status: 404 });

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
        headers.set('Vary', 'Origin');
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');

        if (url.searchParams.get('download') === 'true') {
          const rawFilename     = key.split('/').pop();
          const asciiFilename   = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
          const encodedFilename = encodeURIComponent(rawFilename);
          headers.set('Content-Disposition', `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`);
        }
        return new Response(object.body, { headers });
      } catch (e) {
        console.error('Image serve error:', e.message);
        return json({ error: 'Failed to fetch image' }, 500);
      }
    }

    // ================================================================
    // Serve static files dari R2
    // ================================================================
    try {
      let key = path === '/' ? 'index.html' : path.slice(1);
      if (key.startsWith('api/')) return new Response('Not Found', { status: 404 });

      const ext = key.split('.').pop().toLowerCase();
      const mimeTypes = {
        html:  'text/html; charset=utf-8',
        css:   'text/css; charset=utf-8',
        js:    'application/javascript; charset=utf-8',
        json:  'application/json',
        png:   'image/png',
        jpg:   'image/jpeg',
        jpeg:  'image/jpeg',
        webp:  'image/webp',
        svg:   'image/svg+xml',
        ico:   'image/x-icon',
        woff2: 'font/woff2',
        woff:  'font/woff',
      };

      let object       = await mainBucket.get(key);
      const isFallback = !object;
      const isAsset    = ext && ext !== 'html' && mimeTypes[ext];

      if (!object) {
        if (isAsset) {
          return new Response('Not Found', { status: 404 });
        }
        object = await mainBucket.get('index.html');
      }

      if (!object) return new Response('Not found', { status: 404 });

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('Access-Control-Allow-Origin',
        ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
      headers.set('Vary', 'Origin');

      const servedExt = isFallback ? 'html' : ext;
      if (mimeTypes[servedExt]) headers.set('Content-Type', mimeTypes[servedExt]);

      if (servedExt === 'html') {
        headers.set('X-Frame-Options',        'DENY');
        headers.set('X-Content-Type-Options', 'nosniff');
        headers.set('X-XSS-Protection',       '1; mode=block');
        headers.set('Referrer-Policy',        'strict-origin-when-cross-origin');
        headers.set('Content-Security-Policy',
          "default-src 'self'; " +
          "img-src 'self' data: https: blob:; " +
          "script-src 'self' 'unsafe-inline' " +
            "https://cdn.tailwindcss.com " +
            "https://cdnjs.cloudflare.com " +
            "https://www.paypal.com " + "https://*.paypal.com https://*.paypalobjects.com " +
            "https://pagead2.googlesyndication.com " +
            "https://partner.googleadservices.com " +
            "https://tpc.googlesyndication.com " +
            "https://securepubads.g.doubleclick.net " +
            "https://www.googletagservices.com " +
            "https://www.gstatic.com " +
            "https://adservice.google.com " +
            "https://adservice.google.co.id; " +
          "style-src 'self' 'unsafe-inline' " +
            "https://cdnjs.cloudflare.com " +
            "https://fonts.googleapis.com; " +
          "font-src 'self' " +
            "https://cdnjs.cloudflare.com " +
            "https://fonts.gstatic.com; " +
          "connect-src 'self' " +
            "https://ai.zxaionverse.workers.dev " +
            "https://www.paypal.com " +"https://*.paypal.com " +
            "https://pagead2.googlesyndication.com " +
            "https://googleads.g.doubleclick.net " +
            "https://www.google.com; " +
          "frame-src " +
            "https://www.paypal.com " + "https://*.paypal.com " +
            "https://googleads.g.doubleclick.net " +
            "https://tpc.googlesyndication.com " +
            "https://www.google.com;"
        );
      }

      return new Response(object.body, { headers });
    } catch (e) {
      console.error('Static file error:', e.message);
      return new Response('Internal error', { status: 500 });
    }
  },
};
