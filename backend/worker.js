
function parseImageMeta(key, bucket) {
  const allowedExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const lower = key.toLowerCase();
  if (!allowedExt.some(ext => lower.endsWith(ext))) return null;
  if (lower.startsWith('_') || lower.includes('/header/')) return null;

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
    r2_key:      key,
    bucket,
    title,
    category,
    sub_category: subCategory,
    url:         `${urlPrefix}${encodeURIComponent(key)}`,
  };
}

// ============================================================
// Scheduled Handler: Auto-scan R2 → D1 (Cron Trigger)
// Tambahkan di wrangler.toml: [triggers] crons = ["0 * * * *"]
// Artinya: scan + sync otomatis setiap jam
// ============================================================
async function handleScheduled(env) {
  const DB = env.DB;
  const buckets = [
    { bucket: env.Zxaion_B,  name: 'main' },
    { bucket: env.ZX_BUCKET, name: 'comitbase' },
    { bucket: env.TREASURE,  name: 'dtreasure' },
  ];

  for (const { bucket, name } of buckets) {
    if (!bucket) continue;
    try {
      let cursor    = undefined;
      let totalSynced = 0;

      // Pagination cursor — handle bucket > 1000 objek
      do {
        const listResult = await bucket.list({ cursor, limit: 1000 });
        const stmts = [];

        for (const obj of listResult.objects) {
          const meta = parseImageMeta(obj.key, name);
          if (!meta) continue;

          stmts.push(
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
              obj.httpEtag,
              obj.key,
              name,
              meta.title,
              meta.category,
              meta.sub_category,
              obj.size,
              obj.uploaded ? new Date(obj.uploaded).toISOString() : null,
              new Date().toISOString()
            )
          );
          totalSynced++;
        }

        // Batch insert ke D1 — satu transaksi per 1000 baris
        if (stmts.length > 0) {
          await DB.batch(stmts);
        }

        cursor = listResult.truncated ? listResult.cursor : undefined;
      } while (cursor);

      console.log(`[Scheduled] Synced ${totalSynced} images from bucket: ${name}`);
    } catch (e) {
      console.error(`[Scheduled] Error syncing bucket ${name}:`, e.message);
    }
  }
}

// ============================================================
// Export default — fetch + scheduled
// ============================================================
export default {

  // Dipanggil oleh Cloudflare Cron Trigger setiap jam
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(env));
  },

  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    // Bucket bindings
    const mainBucket      = env.Zxaion_B;
    const comitbaseBucket = env.ZX_BUCKET;
    const treasureBucket  = env.TREASURE;

    // Database binding
    const DB = env.DB;

    // PayPal credentials
    const PAYPAL_CLIENT_ID        = env.PAYPAL_CLIENT_ID;
    const PAYPAL_CLIENT_SECRET_ID = env.PAYPAL_CLIENT_SECRET_ID;
    const PAYPAL_WEBHOOK_ID       = env.PAYPAL_WEBHOOK_ID;
    const PAYPAL_BASE = 'https://api-m.paypal.com'; // ✅ LIVE — bukan sandbox

// ================================================================
    // IMAGE URL SIGNING — HMAC-SHA256
    // Mencegah URL gambar DTREASURE diakses langsung dari DevTools
    // ================================================================
    const IMAGE_SIGN_SECRET = env.JWT || 'fallback-dev-only-not-for-prod';
    const PREVIEW_TTL_SECONDS = 300; // signed URL preview kadaluarsa 5 menit

    async function generateSignature(message, secret) {
      const encoder  = new TextEncoder();
      const keyData  = encoder.encode(secret);
      const msgData  = encoder.encode(message);
      const cryptoKey = await crypto.subtle.importKey(
        'raw', keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false, ['sign']
      );
      const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
      return Array.from(new Uint8Array(sigBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }

    async function createSignedPreviewUrl(r2Key) {
      const expiresAt = Math.floor(Date.now() / 1000) + PREVIEW_TTL_SECONDS;
      const message   = `${r2Key}:${expiresAt}`;
      const sig       = await generateSignature(message, IMAGE_SIGN_SECRET);
      return `/api/dtreasure/img/${encodeURIComponent(r2Key)}?exp=${expiresAt}&sig=${sig}`;
    }

    async function verifySignedUrl(r2Key, expiresAt, sig) {
      const now = Math.floor(Date.now() / 1000);
      if (!expiresAt || now > parseInt(expiresAt, 10)) return false; // kadaluarsa
      const message      = `${r2Key}:${expiresAt}`;
      const expectedSig  = await generateSignature(message, IMAGE_SIGN_SECRET);
      // Constant-time comparison untuk mencegah timing attack
      if (expectedSig.length !== sig.length) return false;
      let diff = 0;
      for (let i = 0; i < expectedSig.length; i++) {
        diff |= expectedSig.charCodeAt(i) ^ sig.charCodeAt(i);
      }
      return diff === 0;
    }
    // ----------------------------------------------------------------
    // CORS — multi-origin support
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
    function getUserToken(req) {
      return req.headers.get('X-User-Token') || 'anonymous';
    }

    async function checkRateLimit(endpoint, identifier, limit = 50, windowSec = 3600) {
      const key = `rate:${endpoint}:${identifier}`;
      const now = Math.floor(Date.now() / 1000);
      try {
        const record = await DB.prepare(
          'SELECT * FROM rate_limits WHERE id = ?'
        ).bind(key).first();

        if (!record || record.reset_time < now) {
          await DB.prepare(
            'INSERT OR REPLACE INTO rate_limits (id, count, reset_time) VALUES (?, 1, ?)'
          ).bind(key, now + windowSec).run();
          return true;
        }
        if (record.count >= limit) return false;
        await DB.prepare(
          'UPDATE rate_limits SET count = count + 1 WHERE id = ?'
        ).bind(key).run();
        return true;
      } catch (e) {
        return true; // fail open
      }
    }

    async function getPayPalAccessToken() {
      if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET_ID) {
        throw new Error('PayPal credentials not configured');
      }
      const credentials = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET_ID}`);
      const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Authorization':  `Basic ${credentials}`,
          'Content-Type':   'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`PayPal auth failed: ${err}`);
      }
      const data = await res.json();
      return data.access_token;
    }

    async function verifyPayPalOrder(orderId, accessToken) {
      const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type':  'application/json',
        },
      });
      if (!res.ok) {
        console.error(`verifyPayPalOrder failed: HTTP ${res.status} for order ${orderId}`);
        return null;
      }
      return res.json();
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
    // ENDPOINT: Manual sync trigger (GET /api/admin/sync)
    // Panggil sekali setelah deploy untuk populate D1 pertama kali
    // Proteksi dengan secret header X-Admin-Token
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
        const rawBody = await request.text();
        let webhookEvent;
        try {
          webhookEvent = JSON.parse(rawBody);
        } catch (e) {
          return new Response('Invalid JSON', { status: 400 });
        }

        // Verify webhook signature headers
        const transmissionId   = request.headers.get('paypal-transmission-id');
        const transmissionTime = request.headers.get('paypal-transmission-time');
        const certUrl          = request.headers.get('paypal-cert-url');
        const transmissionSig  = request.headers.get('paypal-transmission-sig');
        const authAlgo         = request.headers.get('paypal-auth-algo');

        if (!transmissionId || !transmissionSig || !certUrl) {
          console.error('Missing PayPal webhook headers');
          return new Response('Unauthorized', { status: 401 });
        }

        try {
          const accessToken = await getPayPalAccessToken();
          const verifyRes = await fetch(`${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type':  'application/json',
            },
            body: JSON.stringify({
              auth_algo:         authAlgo,
              cert_url:          certUrl,
              transmission_id:   transmissionId,
              transmission_sig:  transmissionSig,
              transmission_time: transmissionTime,
              webhook_id:        PAYPAL_WEBHOOK_ID,
              webhook_event:     webhookEvent,
            }),
          });
          const verifyData = await verifyRes.json();
          if (verifyData.verification_status !== 'SUCCESS') {
            console.error('Webhook signature verification failed:', verifyData);
            return new Response('Unauthorized', { status: 401 });
          }
        } catch (e) {
          console.error('Webhook verification error:', e.message);
          return new Response('Verification failed', { status: 500 });
        }

        // Hanya handle PAYMENT.CAPTURE.COMPLETED
        if (webhookEvent.event_type !== 'PAYMENT.CAPTURE.COMPLETED') {
          return new Response('OK', { status: 200 });
        }

        const orderId       = webhookEvent.resource?.supplementary_data?.related_ids?.order_id;
        const capturedAmount = parseFloat(webhookEvent.resource?.amount?.value || '0');
        const currencyCode  = webhookEvent.resource?.amount?.currency_code;

        if (!orderId || !capturedAmount || currencyCode !== 'USD') {
          return new Response('OK', { status: 200 });
        }

        // FIX: Cek idempotency di payment_orders, bukan rate_limits
        const existingOrder = await DB.prepare(
          'SELECT status FROM payment_orders WHERE order_id = ? LIMIT 1'
        ).bind(orderId).first();

        if (existingOrder) {
          console.log(`Webhook: order ${orderId} already processed (status: ${existingOrder.status})`);
          return new Response('OK', { status: 200 });
        }

        // Tentukan pack dari amount
        const PACK_BY_PRICE = {
          5:   { credits: 200,  bonus: 0,    lifetime: false },
          25:  { credits: 1300, bonus: 450,  lifetime: false },
          45:  { credits: 2700, bonus: 900,  lifetime: false },
          75:  { credits: 4500, bonus: 1400, lifetime: false },
          99:  { credits: 7000, bonus: 2300, lifetime: false },
          125: { credits: 0,    bonus: 0,    lifetime: true  },
        };

        const roundedAmount = Math.round(capturedAmount);
        const packData      = PACK_BY_PRICE[roundedAmount];

        if (!packData) {
          console.error(`Unknown pack amount from webhook: $${capturedAmount}`);
          return new Response('OK', { status: 200 });
        }

        // Cari userId dari custom_id
        let userId = webhookEvent.resource?.custom_id || null;

        if (!userId && orderId) {
          try {
            const accessTokenForOrder = await getPayPalAccessToken();
            const orderDetails = await verifyPayPalOrder(orderId, accessTokenForOrder);
            if (orderDetails?.purchase_units?.length > 0) {
              userId = orderDetails.purchase_units[0].custom_id || null;
            }
          } catch (fetchErr) {
            console.error('Failed to fetch order for custom_id:', fetchErr.message);
          }
        }

        if (!userId) {
          console.error('No userId found in webhook event for orderId:', orderId);
          return new Response('OK', { status: 200 });
        }

        // Credit user
        if (packData.lifetime) {
          await DB.prepare(
            'INSERT INTO user_credits (user_id, credits, lifetime) VALUES (?, 0, 1) ON CONFLICT(user_id) DO UPDATE SET lifetime = 1'
          ).bind(userId).run();
        } else {
          const totalCredits = packData.credits + (packData.bonus || 0);
          await DB.prepare(
            'INSERT INTO user_credits (user_id, credits, lifetime) VALUES (?, ?, 0) ON CONFLICT(user_id) DO UPDATE SET credits = credits + ?'
          ).bind(userId, totalCredits, totalCredits).run();
        }

        // FIX: Simpan ke payment_orders, bukan rate_limits
        await DB.prepare(`
          INSERT OR REPLACE INTO payment_orders (id, user_id, order_id, pack_key, amount, status, completed_at)
          VALUES (?, ?, ?, ?, ?, 'completed', ?)
        `).bind(
          `order:${orderId}`,
          userId,
          orderId,
          String(roundedAmount),
          capturedAmount,
          new Date().toISOString()
        ).run();

        console.log(`Webhook: credited user ${userId} for order ${orderId} ($${capturedAmount})`);
        return new Response('OK', { status: 200 });

      } catch (e) {
        console.error('Webhook handler error:', e.message);
        return new Response('Internal error', { status: 500 });
      }
    }

    // ================================================================
    // ENDPOINT: List main gallery — baca dari D1, bukan langsung R2
    // ================================================================
    if (path === '/api/list' && method === 'GET') {
      try {
        const page     = Math.max(1, parseInt(url.searchParams.get('page')  || '1'));
        const limit    = Math.min(500, parseInt(url.searchParams.get('limit') || '500'));
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
          id:          row.id,
          title:       row.title,
          category:    row.category,
          subCategory: row.sub_category,
          url:         `/api/img/${encodeURIComponent(row.r2_key)}`,
          size:        row.size,
          uploaded:    row.uploaded,
          path:        row.r2_key,
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
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500, headers: corsHeaders,
        });
      }
    }

    // ================================================================
    // ENDPOINT: COMITBASE list — baca dari D1
    // ================================================================
    if (path === '/api/comitbase/list' && method === 'GET') {
      if (!comitbaseBucket) return new Response('[]', { headers: corsHeaders });
      try {
        const { results } = await DB.prepare(
          "SELECT * FROM images WHERE bucket = 'comitbase' ORDER BY uploaded DESC LIMIT 500"
        ).all();

        const photos = results.map(row => ({
          id:       row.id,
          title:    row.title,
          uploader: 'Community',
          url:      `/api/comitbase/img/${encodeURIComponent(row.r2_key)}`,
          uploaded: row.uploaded,
        }));

        return new Response(JSON.stringify(photos), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        console.error('/api/comitbase/list error:', e.message);
        return new Response('[]', { headers: corsHeaders });
      }
    }

// ================================================================
    // ENDPOINT: DTREASURE list — signed preview URL per gambar
    // URL preview kadaluarsa setiap 5 menit, tidak bisa dibuka langsung
    // ================================================================
    if (path === '/api/dtreasure/list' && method === 'GET') {
      if (!treasureBucket) return new Response('[]', { headers: corsHeaders });
      try {
        const { results } = await DB.prepare(
          "SELECT * FROM images WHERE bucket = 'dtreasure' ORDER BY uploaded DESC LIMIT 500"
        ).all();

        // ✅ Setiap URL preview ditandatangani HMAC, kadaluarsa 5 menit
        const photos = await Promise.all(results.map(async row => ({
          id:             row.id,
          title:          row.title,
          category:       'DTREASURE',
          searchCategory: 'DTREASURE',
          url:            await createSignedPreviewUrl(row.r2Key || row.r2_key),
          r2Key:          row.r2Key || row.r2_key, // ✅ Tetap kirim r2Key untuk generate download URL baru
          uploaded:       row.uploaded,
        })));

        return new Response(JSON.stringify(photos), {
          headers: {
            ...corsHeaders,
            'Content-Type':  'application/json',
            'Cache-Control': 'no-store', // ✅ Jangan cache response list karena signed URL punya TTL
          },
        });
      } catch (e) {
        console.error('/api/dtreasure/list error:', e.message);
        return new Response('[]', { headers: corsHeaders });
      }
    }

    // ================================================================
    // ENDPOINT: Image stats
    // ================================================================
    if (path.startsWith('/api/stats/') && method === 'GET') {
      const photoId = decodeURIComponent(path.split('/').pop());
      try {
        const views     = await DB.prepare('SELECT COUNT(*) as c FROM views WHERE photo_id = ?').bind(photoId).first();
        const downloads = await DB.prepare('SELECT COUNT(*) as c FROM downloads WHERE photo_id = ?').bind(photoId).first();
        return new Response(JSON.stringify({
          views:     views?.c     || 0,
          downloads: downloads?.c || 0,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ views: 0, downloads: 0 }), { headers: corsHeaders });
      }
    }

    // ================================================================
    // ENDPOINT: Record view
    // ================================================================
    if (path.startsWith('/api/view/') && method === 'POST') {
      const photoId = decodeURIComponent(path.split('/').pop());
      const userId  = getUserToken(request);
      if (!await checkRateLimit('view', userId, 100, 3600)) {
        return new Response(null, { status: 429, headers: corsHeaders });
      }
      try {
        await DB.prepare('INSERT INTO views (photo_id, user_id) VALUES (?, ?)').bind(photoId, userId).run();
        return new Response(null, { status: 204, headers: corsHeaders });
      } catch (e) {
        return new Response(null, { status: 200, headers: corsHeaders });
      }
    }

    // ================================================================
    // ENDPOINT: Record download
    // ================================================================
    if (path.startsWith('/api/download/') && method === 'POST') {
      const photoId = decodeURIComponent(path.split('/').pop());
      const userId  = getUserToken(request);
      if (!await checkRateLimit('download', userId, 50, 3600)) {
        return new Response(null, { status: 429, headers: corsHeaders });
      }
      try {
        await DB.prepare('INSERT INTO downloads (photo_id, user_id) VALUES (?, ?)').bind(photoId, userId).run();
        return new Response(null, { status: 204, headers: corsHeaders });
      } catch (e) {
        return new Response(null, { status: 200, headers: corsHeaders });
      }
    }

    // ================================================================
    // ENDPOINT: Credit balance
    // ================================================================
    if (path === '/api/credits/balance' && method === 'GET') {
      const userId = getUserToken(request);
      try {
        let user = await DB.prepare(
          'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
        ).bind(userId).first();

        if (!user) {
          user = { credits: 0, lifetime: 0 };
          await DB.prepare(
            'INSERT INTO user_credits (user_id, credits, lifetime) VALUES (?, 0, 0)'
          ).bind(userId).run();
        }

        const purchasedRows = await DB.prepare(
          'SELECT photo_id FROM purchased_images WHERE user_id = ?'
        ).bind(userId).all();
        const purchased = purchasedRows.results.map(r => r.photo_id);

        return new Response(
          JSON.stringify({ credits: user.credits, lifetime: !!user.lifetime, purchased }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({ credits: 0, lifetime: false, purchased: [] }),
          { headers: corsHeaders }
        );
      }
    }

    // ================================================================
    // ENDPOINT: Purchase credits (verifikasi PayPal order)
    // ================================================================
    if (path === '/api/credits/purchase' && method === 'POST') {
      const userId = getUserToken(request);

      if (!userId || userId === 'anonymous') {
        return new Response(JSON.stringify({ success: false, error: 'Invalid user token' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let body;
      try {
        body = await request.json();
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid request body' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { pack, orderId } = body;

      if (!pack || !orderId) {
        return new Response(JSON.stringify({ success: false, error: 'Missing pack or orderId' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const PACK_PRICES = {
        '5$':   5,
        '25$':  25,
        '45$':  45,
        '75$':  75,
        '99$':  99,
        '125$': 125,
      };

      const packs = {
        '5$':   { credits: 200,  bonus: 0,    lifetime: false },
        '25$':  { credits: 1300, bonus: 450,  lifetime: false },
        '45$':  { credits: 2700, bonus: 900,  lifetime: false },
        '75$':  { credits: 4500, bonus: 1400, lifetime: false },
        '99$':  { credits: 7000, bonus: 2300, lifetime: false },
        '125$': { credits: 0,    bonus: 0,    lifetime: true  },
      };

      const packData = packs[pack];
      if (!packData) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid pack' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        // STEP 1: Cek idempotency di payment_orders
        const existingPayment = await DB.prepare(
          'SELECT status FROM payment_orders WHERE order_id = ? LIMIT 1'
        ).bind(orderId).first();

        if (existingPayment) {
          if (existingPayment.status === 'completed') {
            const user = await DB.prepare(
              'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
            ).bind(userId).first();
            return new Response(JSON.stringify({
              success:    true,
              message:    'Order already processed',
              newBalance: user?.credits  || 0,
              lifetime:   !!user?.lifetime,
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          // Jika pending/failed, lanjutkan proses ulang
        }

        // STEP 2: Verifikasi dengan PayPal API
        const accessToken  = await getPayPalAccessToken();
        const orderDetails = await verifyPayPalOrder(orderId, accessToken);

        if (!orderDetails) {
          await DB.prepare(`
            INSERT OR REPLACE INTO payment_orders (id, user_id, order_id, pack_key, amount, status, error_message)
            VALUES (?, ?, ?, ?, ?, 'failed', ?)
          `).bind(`order:${orderId}`, userId, orderId, pack, PACK_PRICES[pack], 'Order not found in PayPal').run();

          return new Response(JSON.stringify({ success: false, error: 'PayPal order not found' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // STEP 3: Validasi payment status
        if (orderDetails.status !== 'COMPLETED') {
          await DB.prepare(`
            INSERT OR REPLACE INTO payment_orders (id, user_id, order_id, pack_key, amount, status, error_message)
            VALUES (?, ?, ?, ?, ?, 'failed', ?)
          `).bind(
            `order:${orderId}`, userId, orderId, pack, PACK_PRICES[pack],
            `Order status is ${orderDetails.status}, not COMPLETED`
          ).run();

          return new Response(JSON.stringify({
            success: false,
            error:   `Payment status invalid: ${orderDetails.status}. Please try again or contact support.`,
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // STEP 4: Extract verifiedUserId + amount dari PayPal response
        let verifiedUserId = userId;
        let verifiedAmount = null;

        if (orderDetails.purchase_units?.length > 0) {
          const purchaseUnit = orderDetails.purchase_units[0];
          if (purchaseUnit.custom_id) verifiedUserId = purchaseUnit.custom_id;
          if (purchaseUnit.payments?.captures?.length > 0) {
            verifiedAmount = parseFloat(purchaseUnit.payments.captures[0].amount?.value || '0');
          }
        }

        // STEP 5: Validasi amount
        if (verifiedAmount !== null) {
          const roundedAmount  = Math.round(verifiedAmount * 100) / 100;
          const expectedAmount = PACK_PRICES[pack];
          if (roundedAmount !== expectedAmount) {
            await DB.prepare(`
              INSERT OR REPLACE INTO payment_orders (id, user_id, order_id, pack_key, amount, status, error_message)
              VALUES (?, ?, ?, ?, ?, 'failed', ?)
            `).bind(
              `order:${orderId}`, verifiedUserId, orderId, pack, roundedAmount,
              `Amount mismatch: expected $${expectedAmount}, got $${roundedAmount}`
            ).run();

            return new Response(JSON.stringify({
              success: false,
              error:   `Amount mismatch. Expected $${expectedAmount}, received $${roundedAmount}.`,
            }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        }

        // STEP 6: Credit user (atomic)
        try {
          if (packData.lifetime) {
            await DB.prepare(
              'INSERT INTO user_credits (user_id, credits, lifetime) VALUES (?, 0, 1) ON CONFLICT(user_id) DO UPDATE SET lifetime = 1'
            ).bind(verifiedUserId).run();
          } else {
            const totalCredits = packData.credits + (packData.bonus || 0);
            await DB.prepare(
              'INSERT INTO user_credits (user_id, credits, lifetime) VALUES (?, ?, 0) ON CONFLICT(user_id) DO UPDATE SET credits = credits + ?'
            ).bind(verifiedUserId, totalCredits, totalCredits).run();
          }

          // STEP 7: Mark order completed di payment_orders
          await DB.prepare(`
            INSERT OR REPLACE INTO payment_orders (id, user_id, order_id, pack_key, amount, status, completed_at)
            VALUES (?, ?, ?, ?, ?, 'completed', ?)
          `).bind(
            `order:${orderId}`, verifiedUserId, orderId, pack, PACK_PRICES[pack], new Date().toISOString()
          ).run();

          // STEP 8: Fetch updated balance
          const user = await DB.prepare(
            'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
          ).bind(verifiedUserId).first();

          console.log(`Payment success: User ${verifiedUserId}, Order ${orderId}, Pack ${pack}`);

          return new Response(JSON.stringify({
            success:    true,
            newBalance: user?.credits  || 0,
            lifetime:   !!user?.lifetime,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        } catch (dbError) {
          console.error('Database credit error:', dbError.message);
          await DB.prepare(`
            INSERT OR REPLACE INTO payment_orders (id, user_id, order_id, pack_key, amount, status, error_message)
            VALUES (?, ?, ?, ?, ?, 'failed', ?)
          `).bind(
            `order:${orderId}`, verifiedUserId, orderId, pack, PACK_PRICES[pack],
            `Database error: ${dbError.message}`
          ).run();
          throw dbError;
        }

      } catch (e) {
        console.error('Credit purchase error:', e.message, 'OrderID:', orderId);
        return new Response(JSON.stringify({
          success: false,
          error:   'Payment processing error. Please contact support with Order ID: ' + orderId,
          orderId,
        }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // ================================================================
    // ENDPOINT: Spend credits (download DTREASURE)
    // ================================================================
    if (path === '/api/credits/spend' && method === 'POST') {
      const userId = getUserToken(request);

      if (!userId || userId === 'anonymous') {
        return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let body;
      try {
        body = await request.json();
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid request body' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { photoId } = body;
      if (!photoId) {
        return new Response(JSON.stringify({ success: false, error: 'Missing photoId' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        // Step 1: Cek apakah sudah pernah dibeli (free re-download)
        const alreadyPurchased = await DB.prepare(
          'SELECT 1 FROM purchased_images WHERE user_id = ? AND photo_id = ?'
        ).bind(userId, photoId).first();

        if (alreadyPurchased) {
          const user = await DB.prepare(
            'SELECT credits FROM user_credits WHERE user_id = ?'
          ).bind(userId).first();
          return new Response(JSON.stringify({
            success:     true,
            newBalance:  user?.credits || 0,
            purchased:   true,
            alreadyOwned: true,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Step 2: Cek lifetime access
        const userRecord = await DB.prepare(
          'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
        ).bind(userId).first();

        if (!userRecord) {
          return new Response(JSON.stringify({ success: false, error: 'User not found. Please refresh.' }), {
            status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (userRecord.lifetime) {
          await DB.prepare(
            'INSERT OR IGNORE INTO purchased_images (user_id, photo_id) VALUES (?, ?)'
          ).bind(userId, photoId).run();
          return new Response(JSON.stringify({
            success:    true,
            newBalance: userRecord.credits || 0,
            purchased:  true,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Step 3: Cek saldo cukup
        if (userRecord.credits < 10) {
          return new Response(JSON.stringify({
            success:        false,
            error:          'Insufficient credits',
            currentCredits: userRecord.credits,
            required:       10,
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Step 4: Deduct credits (atomic, race condition safe)
        const deductResult = await DB.prepare(
          'UPDATE user_credits SET credits = credits - 10 WHERE user_id = ? AND credits >= 10'
        ).bind(userId).run();

        // Step 5: Verifikasi deduction berhasil
        if (deductResult.changes === 0) {
          return new Response(JSON.stringify({
            success: false,
            error:   'Insufficient credits (concurrent request detected)',
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Step 6: Setelah deduction confirmed, record purchase
        await DB.prepare(
          'INSERT OR IGNORE INTO purchased_images (user_id, photo_id) VALUES (?, ?)'
        ).bind(userId, photoId).run();

        const newUser = await DB.prepare(
          'SELECT credits FROM user_credits WHERE user_id = ?'
        ).bind(userId).first();

        return new Response(JSON.stringify({
          success:    true,
          newBalance: newUser?.credits || 0,
          purchased:  true,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      } catch (e) {
        console.error('Spend credit error:', e.message);
        return new Response(JSON.stringify({ success: false, error: 'Database error' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    
    // ================================================================
    // ENDPOINT: Generate fresh signed download URL untuk DTREASURE
    // Hanya bisa dipanggil oleh user yang sudah purchase / lifetime
    // ================================================================
    if (path === '/api/dtreasure/sign-download' && method === 'POST') {
      const userId = getUserToken(request);

      if (!userId || userId === 'anonymous') {
        return new Response(JSON.stringify({ error: 'Authentication required' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let body;
      try {
        body = await request.json();
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid request body' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { photoId, r2Key } = body;
      if (!photoId || !r2Key) {
        return new Response(JSON.stringify({ error: 'Missing photoId or r2Key' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        // Verifikasi user boleh download (lifetime atau sudah purchase)
        const userRecord = await DB.prepare(
          'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
        ).bind(userId).first();

        const hasLifetime = userRecord && !!userRecord.lifetime;

        if (!hasLifetime) {
          const purchased = await DB.prepare(
            'SELECT 1 FROM purchased_images WHERE user_id = ? AND (photo_id = ? OR photo_id = ?)'
          ).bind(userId, photoId, r2Key).first();

          if (!purchased) {
            return new Response(JSON.stringify({ error: 'Purchase required to download this image' }), {
              status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }

        // ✅ Generate fresh signed URL khusus untuk download (TTL lebih pendek: 2 menit)
        const DOWNLOAD_TTL = 120;
        const expiresAt    = Math.floor(Date.now() / 1000) + DOWNLOAD_TTL;
        const message      = `${r2Key}:${expiresAt}`;
        const sig          = await generateSignature(message, IMAGE_SIGN_SECRET);

        const downloadUrl = `${url.origin}/api/dtreasure/img/${encodeURIComponent(r2Key)}` +
          `?download=true&photoId=${encodeURIComponent(photoId)}&exp=${expiresAt}&sig=${sig}`;

        return new Response(JSON.stringify({ downloadUrl }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      } catch (e) {
        console.error('sign-download error:', e.message);
        return new Response(JSON.stringify({ error: 'Failed to generate download URL' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

// ================================================================
    // ENDPOINT: Serve images dari R2
    // DTREASURE: Semua request (preview & download) divalidasi
    // ================================================================
    if (
      path.startsWith('/api/img/') ||
      path.startsWith('/api/comitbase/img/') ||
      path.startsWith('/api/dtreasure/img/')
    ) {
      const isDtreasure = path.startsWith('/api/dtreasure/img/');

      if (isDtreasure) {
        const r2Key      = decodeURIComponent(path.slice('/api/dtreasure/img/'.length));
        const isDownload = url.searchParams.get('download') === 'true';
        const sig        = url.searchParams.get('sig')  || '';
        const exp        = url.searchParams.get('exp')  || '';

        // ----------------------------------------------------------------
        // STEP 1: Validasi signed URL untuk SEMUA request (preview & download)
        // Ini mencegah URL yang dikopi dari DevTools dibuka langsung
        // ----------------------------------------------------------------
        const signatureValid = await verifySignedUrl(r2Key, exp, sig);
        if (!signatureValid) {
          return new Response(
            JSON.stringify({ error: 'Invalid or expired image URL. Please refresh the page.' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // ----------------------------------------------------------------
        // STEP 2: Untuk download, tambahan validasi pembelian
        // ----------------------------------------------------------------
        if (isDownload) {
          const userId = getUserToken(request);
          if (!userId || userId === 'anonymous') {
            return new Response(
              JSON.stringify({ error: 'Authentication required' }),
              { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          try {
            const userRecord = await DB.prepare(
              'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
            ).bind(userId).first();

            const hasLifetime = userRecord && !!userRecord.lifetime;

            if (!hasLifetime) {
              const photoIdFromQuery = url.searchParams.get('photoId') || r2Key;

              // Cek dengan photoId (primary) dan r2Key (fallback)
              const purchased = await DB.prepare(
                'SELECT 1 FROM purchased_images WHERE user_id = ? AND (photo_id = ? OR photo_id = ?)'
              ).bind(userId, photoIdFromQuery, r2Key).first();

              if (!purchased) {
                return new Response(
                  JSON.stringify({ error: 'Purchase required to download this image' }),
                  { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
              }
            }
          } catch (e) {
            console.error('Auth check error:', e.message);
            return new Response(
              JSON.stringify({ error: 'Authorization check failed' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      }

      // ----------------------------------------------------------------
      // Serve image dari R2
      // ----------------------------------------------------------------
      let bucket, prefix;
      if (path.startsWith('/api/comitbase/img/')) {
        bucket = comitbaseBucket;
        prefix = '/api/comitbase/img/';
      } else if (isDtreasure) {
        bucket = treasureBucket;
        prefix = '/api/dtreasure/img/';
      } else {
        bucket = mainBucket;
        prefix = '/api/img/';
      }

      try {
        const key    = decodeURIComponent(path.slice(prefix.length));
        const object = await bucket.get(key);
        if (!object) return new Response('Not found', { status: 404 });

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('Access-Control-Allow-Origin',
          ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
        headers.set('Vary', 'Origin');

        if (isDtreasure) {
          // ✅ Proteksi cache & embedding untuk DTREASURE
          headers.set('Cache-Control',                     'private, no-store, no-cache');
          headers.set('X-Content-Type-Options',            'nosniff');
          headers.set('X-Robots-Tag',                      'noindex, nofollow');
          headers.set('Content-Security-Policy',           "default-src 'none'");
          // ✅ Blokir hotlinking: hanya izinkan dari domain kita
          const referer = request.headers.get('Referer') || '';
          const validReferer = ALLOWED_ORIGINS.some(o => referer.startsWith(o));
          // Izinkan jika referer kosong (fetch dari worker sendiri) atau dari domain kita
          if (referer && !validReferer) {
            return new Response(
              JSON.stringify({ error: 'Direct access not permitted' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } else {
          headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        }

        if (url.searchParams.get('download') === 'true') {
          const safeFilename = key.split('/').pop().replace(/[^a-zA-Z0-9._-]/g, '_');
          headers.set('Content-Disposition', `attachment; filename="${safeFilename}"`);
        } else if (isDtreasure) {
          // ✅ Untuk preview, paksa inline & tidak bisa disimpan via toolbar browser
          headers.set('Content-Disposition', 'inline');
        }

        return new Response(object.body, { headers });
      } catch (e) {
        console.error('Image serve error:', e.message);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch image' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ================================================================
    // Serve static files dari R2
    // ================================================================
    try {
      let key = path === '/' ? 'index.html' : path.slice(1);
      if (key.startsWith('api/')) return new Response('Not Found', { status: 404 });

      const object = await mainBucket.get(key) || await mainBucket.get('index.html');
      if (!object) return new Response('Not found', { status: 404 });

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('Access-Control-Allow-Origin',
        ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
      headers.set('Vary', 'Origin');

      const ext = key.split('.').pop().toLowerCase();
      const mimeTypes = {
        html:  'text/html; charset=utf-8',
        css:   'text/css; charset=utf-8',
        js:    'application/javascript; charset=utf-8',
        png:   'image/png',
        jpg:   'image/jpeg',
        jpeg:  'image/jpeg',
        webp:  'image/webp',
        svg:   'image/svg+xml',
        ico:   'image/x-icon',
        woff2: 'font/woff2',
        woff:  'font/woff',
      };
      if (mimeTypes[ext]) headers.set('Content-Type', mimeTypes[ext]);

      if (ext === 'html') {
        headers.set('X-Frame-Options',         'DENY');
        headers.set('X-Content-Type-Options',  'nosniff');
        headers.set('X-XSS-Protection',        '1; mode=block');
        headers.set('Referrer-Policy',         'strict-origin-when-cross-origin');
        headers.set('Content-Security-Policy',
          "default-src 'self'; " +
          "img-src 'self' data: https:; " +
          "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://www.paypal.com; " +
          "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; " +
          "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com; " +
          "connect-src 'self' https://ai.zxaionverse.workers.dev https://www.paypal.com; " +
          "frame-src https://www.paypal.com;"
        );
      }

      return new Response(object.body, { headers });
    } catch (e) {
      console.error('Static file error:', e.message);
      return new Response('Internal error', { status: 500 });
    }
  },
};