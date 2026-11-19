import { handleScheduled } from "./src/services/r2-sync.service.js";
import { createCorsHeaders } from "./src/middleware/cors.js";
import { getUserToken } from "./src/middleware/auth.js";
import { createRateLimit } from "./src/middleware/rate-limit.js";
import { createPayPalService } from "./src/services/paypal.service.js";
import { handleHealth } from "./src/routes/health.js";
import { handleAdminSync } from "./src/routes/admin.js";
import { handleTrending } from "./src/routes/trending.js";
import { handleImageStats } from "./src/routes/stats.js";
import { handleMainGallery, handleComitbaseGallery, handleDtreasureGallery } from "./src/routes/gallery.js";
import { handlePayPalWebhook } from "./src/routes/paypal.js";
import { handleCreditPurchase, handleCreditSpend } from "./src/routes/credits.js";
import { handleRecordView, handleRecordDownload, handleCreditBalance } from "./src/routes/activity.js";


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
    const { getPayPalAccessToken, verifyPayPalOrder } = createPayPalService({
      clientId: PAYPAL_CLIENT_ID,
      clientSecret: PAYPAL_CLIENT_SECRET_ID,
      baseUrl: PAYPAL_BASE,
    });

    // ----------------------------------------------------------------
    // CORS
    // ----------------------------------------------------------------
    const corsHeaders = createCorsHeaders(request);

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ----------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------
    const checkRateLimit = createRateLimit(DB);

    // ================================================================
    // ENDPOINT: Health check
    // ================================================================
    if (path === '/api/health' && method === 'GET') {
      return handleHealth({ DB, corsHeaders });
    }

    // ================================================================
    // ENDPOINT: Manual sync trigger (POST /api/admin/sync)
    // ================================================================
    if (path === '/api/admin/sync' && method === 'POST') {
      return handleAdminSync({ request, env, handleScheduled, corsHeaders });
    }

    // ================================================================
    // ENDPOINT: PayPal Webhook
    // ================================================================
    if (path === '/api/paypal/webhook' && method === 'POST') {
      return handlePayPalWebhook({ request, DB, getPayPalAccessToken, verifyPayPalOrder, PAYPAL_WEBHOOK_ID, PAYPAL_BASE });
    }

    // ================================================================
    // ENDPOINT: List main gallery
    // ================================================================
    if (path === '/api/list' && method === 'GET') {
      return handleMainGallery({ url, DB, corsHeaders });
    }

    // ================================================================
    // ENDPOINT: COMITBASE list
    // ================================================================
    if (path === '/api/comitbase/list' && method === 'GET') {
      return handleComitbaseGallery({ url, DB, comitbaseBucket, corsHeaders });
    }

    // ================================================================
    // ENDPOINT: DTREASURE list
    // ================================================================
    if (path === '/api/dtreasure/list' && method === 'GET') {
      return handleDtreasureGallery({ url, DB, treasureBucket, corsHeaders });
    }

    // ================================================================
    // ENDPOINT: Top trending images
    // ================================================================
    if (path === '/api/trending' && method === 'GET') {
      return handleTrending({ url, DB, corsHeaders });
    }

    // ================================================================
    // ENDPOINT: Image stats
    // ================================================================
    if (path.startsWith('/api/stats/') && method === 'GET') {
      return handleImageStats({ path, DB, corsHeaders });
    }

    // ================================================================
    // ENDPOINT: Record view
    // FIX: ctx.waitUntil + DB.batch — return 204 IMMEDIATELY.
    // DB write terjadi di background, eliminasi ~50-200ms latensi dari
    // response time yang sebelumnya menunggu DB write selesai.
    // ================================================================
    if (path.startsWith('/api/view/') && method === 'POST') {
      return handleRecordView({ path, request, ctx, DB, getUserToken, checkRateLimit, corsHeaders });
    }

    // ================================================================
    // ENDPOINT: Record download
    // FIX: ctx.waitUntil + DB.batch — return 204 IMMEDIATELY.
    // ================================================================
    if (path.startsWith('/api/download/') && method === 'POST') {
      return handleRecordDownload({ path, request, ctx, DB, getUserToken, checkRateLimit, corsHeaders });
    }

    // ================================================================
    // ENDPOINT: Credit balance
    // ================================================================
    if (path === '/api/credits/balance' && method === 'GET') {
      return handleCreditBalance({ request, DB, getUserToken, corsHeaders });
    }

    // ================================================================
    // ENDPOINT: Purchase credits
    // ================================================================
    if (path === '/api/credits/purchase' && method === 'POST') {
      return handleCreditPurchase({ request, DB, getUserToken, getPayPalAccessToken, verifyPayPalOrder, corsHeaders });
    }

    // ================================================================
    // ENDPOINT: Spend credits
    // ================================================================
    if (path === '/api/credits/spend' && method === 'POST') {
      return handleCreditSpend({ request, DB, getUserToken, corsHeaders });
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
