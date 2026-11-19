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
import { handleMediaRequest } from "./src/routes/media.js";
import { handleStaticAsset } from "./src/routes/static.js";
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
      return handleMediaRequest({ path, url, request, DB, mainBucket, comitbaseBucket, treasureBucket, getUserToken, corsHeaders });
    }

        return handleStaticAsset({ path, mainBucket, corsHeaders });
