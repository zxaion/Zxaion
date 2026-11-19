
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

        const record = await DB.prepare(
          'SELECT count FROM rate_limits WHERE id = ?'
        ).bind(key).first();

        return !record || record.count <= limit;
      } catch (e) {
        console.error('[RateLimit] DB error:', e.message);
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
          'Authorization': `Basic ${credentials}`,
          'Content-Type':  'application/x-www-form-urlencoded',
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
      return await res.json();
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
        const rawBody = await request.text();
        let webhookEvent;
        try {
          webhookEvent = JSON.parse(rawBody);
        } catch (e) {
          return new Response('Invalid JSON', { status: 400 });
        }

        const transmissionId   = request.headers.get('paypal-transmission-id');
        const transmissionTime = request.headers.get('paypal-transmission-time');
        const certUrl          = request.headers.get('paypal-cert-url');
        const transmissionSig  = request.headers.get('paypal-transmission-sig');
        const authAlgo         = request.headers.get('paypal-auth-algo');

        if (!transmissionId || !transmissionSig || !certUrl || !authAlgo) {
          console.error('Missing required PayPal webhook headers');
          return new Response('Unauthorized', { status: 401 });
        }

        // SSRF guard — only accept certs from official PayPal domains
        const PAYPAL_CERT_DOMAINS = [
          'https://api.paypal.com',
          'https://api-m.paypal.com',
          'https://api.sandbox.paypal.com',
        ];
        if (!PAYPAL_CERT_DOMAINS.some(domain => certUrl.startsWith(domain))) {
          console.error('Webhook certUrl domain not trusted:', certUrl);
          return new Response('Unauthorized', { status: 401 });
        }

        // FIX: Satu kali getPayPalAccessToken — reuse untuk signature verify
        // dan order detail fetch. Cegah double OAuth round-trip.
        let accessToken;
        try {
          accessToken = await getPayPalAccessToken();
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

        if (webhookEvent.event_type !== 'PAYMENT.CAPTURE.COMPLETED') {
          return new Response('OK', { status: 200 });
        }

        const orderId        = webhookEvent.resource?.supplementary_data?.related_ids?.order_id;
        const capturedAmount = parseFloat(webhookEvent.resource?.amount?.value || '0');
        const currencyCode   = webhookEvent.resource?.amount?.currency_code;

        if (!orderId || !capturedAmount || currencyCode !== 'USD') {
          return new Response('OK', { status: 200 });
        }

        const existingOrder = await DB.prepare(
          'SELECT status FROM payment_orders WHERE order_id = ? LIMIT 1'
        ).bind(orderId).first();

        if (existingOrder) {
          console.log(`Webhook: order ${orderId} already processed (status: ${existingOrder.status})`);
          return new Response('OK', { status: 200 });
        }

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

        let userId = webhookEvent.resource?.custom_id || null;

        // FIX: Reuse accessToken dari signature verification — cegah double OAuth
        if (!userId && orderId) {
          try {
            const orderDetails = await verifyPayPalOrder(orderId, accessToken);
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

        // FIX: ATOMIC CLAIM — pasangan dari klaim yang sama di /api/credits/purchase.
        // Siapa yang berhasil INSERT lebih dulu (id = order:<orderId> adalah PK),
        // dialah yang boleh credit. Yang kedua dapat changes=0 dan langsung stop
        // — mencegah double-credit untuk orderId yang sama.
        const claim = await DB.prepare(`
          INSERT INTO payment_orders (id, user_id, order_id, pack_key, amount, status)
          VALUES (?, ?, ?, ?, ?, 'processing')
          ON CONFLICT(id) DO NOTHING
        `).bind(`order:${orderId}`, userId, orderId, String(roundedAmount), capturedAmount).run();

        if (!claim.meta || claim.meta.changes === 0) {
          console.log(`Webhook: order ${orderId} sudah diklaim/diproses sebelumnya — skip duplikasi credit`);
          return new Response('OK', { status: 200 });
        }

        try {
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

          await DB.prepare(
            `UPDATE payment_orders SET status = 'completed', completed_at = ? WHERE id = ?`
          ).bind(new Date().toISOString(), `order:${orderId}`).run();

          console.log(`Webhook: credited user ${userId} for order ${orderId} ($${capturedAmount})`);
        } catch (creditError) {
          // Klaim sudah terambil tapi crediting gagal — tandai 'failed', JANGAN
          // biarkan 'processing' permanen (PayPal akan retry webhook ini).
          console.error(`Webhook: gagal credit user ${userId} untuk order ${orderId}:`, creditError.message);
          await DB.prepare(
            `UPDATE payment_orders SET status = 'failed', error_message = ? WHERE id = ?`
          ).bind(creditError.message, `order:${orderId}`).run();
        }

        return new Response('OK', { status: 200 });

      } catch (e) {
        console.error('Webhook handler error:', e.message);
        return new Response('Internal error', { status: 500 });
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

      if (!userId || userId === 'anonymous') {
        return new Response(
          JSON.stringify({ credits: 0, lifetime: false, purchased: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      try {
        let user = await DB.prepare(
          'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
        ).bind(userId).first();

        if (!user) {
          user = { credits: 0, lifetime: 0 };
          // FIX: INSERT OR IGNORE — idempotent, cegah error UNIQUE constraint
          // kalau ada 2 request bersamaan dari user baru yang sama.
          await DB.prepare(
            'INSERT OR IGNORE INTO user_credits (user_id, credits, lifetime) VALUES (?, 0, 0)'
          ).bind(userId).run();
        }

        const purchasedRows = await DB.prepare(
          'SELECT photo_id FROM purchased_images WHERE user_id = ? LIMIT 1000'
        ).bind(userId).all();
        const purchased = purchasedRows.results.map(r => r.photo_id);

        return new Response(
          JSON.stringify({ credits: user.credits, lifetime: !!user.lifetime, purchased }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (e) {
        console.error('/api/credits/balance error:', e.message);
        return new Response(
          JSON.stringify({ credits: 0, lifetime: false, purchased: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ================================================================
    // ENDPOINT: Purchase credits
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
        }

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

        let verifiedUserId = userId;
        let verifiedAmount = null;

        if (orderDetails.purchase_units?.length > 0) {
          const purchaseUnit = orderDetails.purchase_units[0];
          if (purchaseUnit.custom_id) verifiedUserId = purchaseUnit.custom_id;
          if (purchaseUnit.payments?.captures?.length > 0) {
            verifiedAmount = parseFloat(purchaseUnit.payments.captures[0].amount?.value || '0');
          }
        }

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

        // FIX: ATOMIC CLAIM — pasangan dari klaim yang sama di webhook handler.
        const claim = await DB.prepare(`
          INSERT INTO payment_orders (id, user_id, order_id, pack_key, amount, status)
          VALUES (?, ?, ?, ?, ?, 'processing')
          ON CONFLICT(id) DO NOTHING
        `).bind(`order:${orderId}`, verifiedUserId, orderId, pack, PACK_PRICES[pack]).run();

        if (!claim.meta || claim.meta.changes === 0) {
          // Sudah diklaim proses lain (kemungkinan besar webhook PayPal datang
          // lebih dulu). Tunggu sebentar lalu laporkan status final — JANGAN
          // credit dua kali untuk orderId yang sama.
          await new Promise(r => setTimeout(r, 1500));

          const settled = await DB.prepare(
            'SELECT status FROM payment_orders WHERE id = ?'
          ).bind(`order:${orderId}`).first();
          const user = await DB.prepare(
            'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
          ).bind(verifiedUserId).first();

          if (settled?.status === 'completed') {
            return new Response(JSON.stringify({
              success:    true,
              message:    'Order already processed',
              newBalance: user?.credits  || 0,
              lifetime:   !!user?.lifetime,
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          return new Response(JSON.stringify({
            success: false,
            error:   'Order is being processed by another request. Please refresh in a few seconds.',
          }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

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

          await DB.prepare(
            `UPDATE payment_orders SET status = 'completed', completed_at = ? WHERE id = ?`
          ).bind(new Date().toISOString(), `order:${orderId}`).run();

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
          await DB.prepare(
            `UPDATE payment_orders SET status = 'failed', error_message = ? WHERE id = ?`
          ).bind(dbError.message, `order:${orderId}`).run();
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
    // ENDPOINT: Spend credits
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
        const alreadyPurchased = await DB.prepare(
          'SELECT 1 FROM purchased_images WHERE user_id = ? AND photo_id = ?'
        ).bind(userId, photoId).first();

        if (alreadyPurchased) {
          const user = await DB.prepare(
            'SELECT credits FROM user_credits WHERE user_id = ?'
          ).bind(userId).first();
          return new Response(JSON.stringify({
            success:      true,
            newBalance:   user?.credits || 0,
            purchased:    true,
            alreadyOwned: true,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

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

        if (userRecord.credits < 10) {
          return new Response(JSON.stringify({
            success:        false,
            error:          'Insufficient credits',
            currentCredits: userRecord.credits,
            required:       10,
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

// Atomic deduct — race condition safe.
        // FIX: jumlah baris berubah ada di `meta.changes`, bukan `changes`.
        const deductResult = await DB.prepare(
          'UPDATE user_credits SET credits = credits - 10 WHERE user_id = ? AND credits >= 10'
        ).bind(userId).run();

        if (!deductResult.meta || deductResult.meta.changes === 0) {
          return new Response(JSON.stringify({
            success: false,
            error:   'Insufficient credits (concurrent request detected)',
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

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
    // ENDPOINT: Serve images dari R2 (main, comitbase, dtreasure)
    // ================================================================
    if (
      path.startsWith('/api/img/') ||
      path.startsWith('/api/comitbase/img/') ||
      path.startsWith('/api/dtreasure/img/')
    ) {
      const isDtreasure = path.startsWith('/api/dtreasure/img/');

      // Auth check untuk DTREASURE download
      if (isDtreasure && url.searchParams.get('download') === 'true') {
        const headerToken = getUserToken(request);
        const userId = (headerToken && headerToken !== 'anonymous')
          ? headerToken
          : (url.searchParams.get('userToken') || 'anonymous');

        if (!userId || userId === 'anonymous') {
          return new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        try {
          const userRecord = await DB.prepare(
            'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
          ).bind(userId).first();

          const hasLifetime = userRecord && !!userRecord.lifetime;

          if (!hasLifetime) {
            const photoIdFromQuery = url.searchParams.get('photoId');
            const rawKey           = decodeURIComponent(path.slice('/api/dtreasure/img/'.length));

            let purchasedRecord = null;

            if (photoIdFromQuery) {
              purchasedRecord = await DB.prepare(
                'SELECT 1 FROM purchased_images WHERE user_id = ? AND photo_id = ?'
              ).bind(userId, photoIdFromQuery).first();
            }

            if (!purchasedRecord) {
              purchasedRecord = await DB.prepare(
                'SELECT 1 FROM purchased_images WHERE user_id = ? AND photo_id = ?'
              ).bind(userId, rawKey).first();
            }

            if (!purchasedRecord) {
              return new Response(JSON.stringify({ error: 'Purchase required to download this image' }), {
                status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
          }
        } catch (e) {
          console.error('[DTREASURE Download] Auth check DB error:', e.message);
          return new Response(JSON.stringify({ error: 'Server error during authorization check' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

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
        headers.set('Cache-Control',
          isDtreasure ? 'private, no-store' : 'public, max-age=31536000, immutable');

        if (url.searchParams.get('download') === 'true') {
          const rawFilename     = key.split('/').pop();
          const asciiFilename   = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
          const encodedFilename = encodeURIComponent(rawFilename);
          headers.set(
            'Content-Disposition',
            `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`
          );
        }

        return new Response(object.body, { headers });
      } catch (e) {
        console.error('Image serve error:', e.message);
        return new Response(JSON.stringify({ error: 'Failed to fetch image' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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
            "https://www.paypal.com " +
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
            "https://www.paypal.com " +
            "https://pagead2.googlesyndication.com " +
            "https://googleads.g.doubleclick.net " +
            "https://www.google.com; " +
          "frame-src " +
            "https://www.paypal.com " +
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
