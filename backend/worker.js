export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Bucket bindings
    const mainBucket = env.Zxaion_B;
    const comitbaseBucket = env.ZX_BUCKET;
    const treasureBucket = env.TREASURE;

// Database binding
const DB = env.DB;
// PayPal credentials (set via Cloudflare dashboard → Workers → Settings → Variables)
const PAYPAL_CLIENT_ID = env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET_ID = env.PAYPAL_CLIENT_SECRET_ID;
const PAYPAL_WEBHOOK_ID = env.PAYPAL_WEBHOOK_ID;
const PAYPAL_BASE = 'https://api-m.sandbox.paypal.com';

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "https://zxaion-verse.pages.dev",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS, DELETE",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-User-Token",
      "Access-Control-Max-Age": "86400",
    };

    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    function getUserToken(request) {
      return request.headers.get('X-User-Token') || 'anonymous';
    }

    async function checkRateLimit(endpoint, identifier, limit = 50, windowSec = 3600) {
      const key = `rate:${endpoint}:${identifier}`;
      const now = Math.floor(Date.now() / 1000);
      try {
        const record = await DB.prepare("SELECT * FROM rate_limits WHERE id = ?").bind(key).first();
        if (!record || record.reset_time < now) {
          await DB.prepare("INSERT OR REPLACE INTO rate_limits (id, count, reset_time) VALUES (?, 1, ?)")
            .bind(key, now + windowSec).run();
          return true;
        }
        if (record.count >= limit) return false;
        await DB.prepare("UPDATE rate_limits SET count = count + 1 WHERE id = ?").bind(key).run();
        return true;
      } catch (e) {
        return true;
      }
    }
    
    // ✅ SERVER-SIDE: Get PayPal access token using Client Credentials
async function getPayPalAccessToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET_ID) {
    throw new Error('PayPal credentials not configured');
  }
  const credentials = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET_ID}`);
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
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

// ✅ FIXED: verifyPayPalOrder — URL diperbaiki ke v2 + api-m subdomain
async function verifyPayPalOrder(orderId, accessToken) {
  const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    console.error(`verifyPayPalOrder failed: HTTP ${res.status} for order ${orderId}`);
    return null;
  }
  return res.json();
}

            // ✅ ADD: Health check endpoint
            if (path === '/api/health' && method === 'GET') {
                try {
                    const test = await DB.prepare("SELECT 1").first();
                    return new Response(JSON.stringify({ status: 'ok', db: 'connected' }), {
                        headers: { ...corsHeaders, "Content-Type": "application/json" }
                    });
                } catch (e) {
                    return new Response(JSON.stringify({ status: 'error', db: 'disconnected', message: e.message }), {
                        status: 500,
                        headers: { ...corsHeaders, "Content-Type": "application/json" }
                    });
                }
            }
            
  // ✅ PayPal Webhook Handler — safety net jika client onApprove gagal
if (path === '/api/paypal/webhook' && method === 'POST') {
  try {
    const rawBody = await request.text();
    let webhookEvent;
    try {
      webhookEvent = JSON.parse(rawBody);
    } catch (e) {
      return new Response('Invalid JSON', { status: 400 });
    }

    // ✅ Verify webhook signature with PayPal
    const transmissionId = request.headers.get('paypal-transmission-id');
    const transmissionTime = request.headers.get('paypal-transmission-time');
    const certUrl = request.headers.get('paypal-cert-url');
    const transmissionSig = request.headers.get('paypal-transmission-sig');
    const authAlgo = request.headers.get('paypal-auth-algo');

    if (!transmissionId || !transmissionSig || !certUrl) {
      console.error('Missing PayPal webhook headers');
      return new Response('Unauthorized', { status: 401 });
    }

    // Verify signature via PayPal API
    try {
      const accessToken = await getPayPalAccessToken();
      // ✅ FIXED: Webhook signature verify — URL diperbaiki ke api-m subdomain
const verifyRes = await fetch(`${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    auth_algo: authAlgo,
    cert_url: certUrl,
    transmission_id: transmissionId,
    transmission_sig: transmissionSig,
    transmission_time: transmissionTime,
    webhook_id: PAYPAL_WEBHOOK_ID,
    webhook_event: webhookEvent,
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

    // ✅ Only handle PAYMENT.CAPTURE.COMPLETED events
    if (webhookEvent.event_type !== 'PAYMENT.CAPTURE.COMPLETED') {
      return new Response('OK', { status: 200 });
    }

    const orderId = webhookEvent.resource?.supplementary_data?.related_ids?.order_id;
    const capturedAmount = parseFloat(webhookEvent.resource?.amount?.value || '0');
    const currencyCode = webhookEvent.resource?.amount?.currency_code;

    if (!orderId || !capturedAmount || currencyCode !== 'USD') {
      return new Response('OK', { status: 200 });
    }

    // Check if already processed
    const existingOrder = await DB.prepare(
      'SELECT id FROM rate_limits WHERE id = ?'
    ).bind(`order:${orderId}`).first();

    if (existingOrder) {
      return new Response('OK', { status: 200 }); // Already credited, idempotent
    }

    // Determine pack from amount
    const PACK_BY_PRICE = {
      5:   { credits: 200,  bonus: 0,    lifetime: false },
      25:  { credits: 1300, bonus: 450,  lifetime: false },
      45:  { credits: 2700, bonus: 900,  lifetime: false },
      75:  { credits: 4500, bonus: 1400, lifetime: false },
      99:  { credits: 7000, bonus: 2300, lifetime: false },
      125: { credits: 0,    bonus: 0,    lifetime: true  },
    };

    const roundedAmount = Math.round(capturedAmount);
    const packData = PACK_BY_PRICE[roundedAmount];

    if (!packData) {
      console.error(`Unknown pack amount from webhook: $${capturedAmount}`);
      return new Response('OK', { status: 200 });
    }

    let userId = null;

    if (webhookEvent.resource?.custom_id) {
      userId = webhookEvent.resource.custom_id;
    }

    if (!userId && orderId) {
      try {
        const accessTokenForOrder = await getPayPalAccessToken();
        const orderDetails = await verifyPayPalOrder(orderId, accessTokenForOrder);
        if (orderDetails && orderDetails.purchase_units && orderDetails.purchase_units.length > 0) {
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

    // Credit the user
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

    // Mark order as processed
    await DB.prepare(
      'INSERT OR IGNORE INTO rate_limits (id, count, reset_time) VALUES (?, 1, 4102444800)'
    ).bind(`order:${orderId}`).run();

    console.log(`Webhook: credited user ${userId} for order ${orderId} ($${capturedAmount})`);
    return new Response('OK', { status: 200 });

  } catch (e) {
    console.error('Webhook handler error:', e.message);
    return new Response('Internal error', { status: 500 });
  }
}
    // API: List main gallery
    if (path === '/api/list' && method === 'GET') {
      try {
        const list = await mainBucket.list();
        const allowedExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
        const objects = list.objects.filter(obj => {
          const name = obj.key.toLowerCase();
          return allowedExt.some(ext => name.endsWith(ext)) && !name.startsWith('_') && !name.includes('/header/');
        });

        const photos = objects.map(obj => {
          const parts = obj.key.split('/');
          let category = 'Other', subCategory = null;
          if (parts.length >= 2) {
            category = parts[0];
            if (parts.length > 2) subCategory = parts[1];
          }
          category = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
          if (subCategory) subCategory = subCategory.toLowerCase();

          const filename = parts.pop();
          const title = filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").replace(/\b\w/g, l => l.toUpperCase());

          return {
            id: obj.etag,
            title,
            category,
            subCategory,
            url: `/api/img/${encodeURIComponent(obj.key)}`,
            size: obj.size,
            uploaded: obj.uploaded,
            path: obj.key
          };
        }).filter(p => p.category !== 'Header');

        return new Response(JSON.stringify(photos), {
          headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
      }
    }

    // API: COMITBASE list
    if (path === '/api/comitbase/list' && method === 'GET') {
      if (!comitbaseBucket) return new Response("[]", { headers: corsHeaders });
      try {
        const list = await comitbaseBucket.list();
        const allowedExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
        const objects = list.objects.filter(obj => allowedExt.some(ext => obj.key.toLowerCase().endsWith(ext)));
        const photos = await Promise.all(objects.map(async obj => {
          const metaKey = obj.key.replace(/\.[^/.]+$/, "") + '.json';
          let meta = {};
          try {
            const metaObj = await comitbaseBucket.get(metaKey);
            if (metaObj) meta = await metaObj.json();
          } catch (e) {}
          const title = meta.title || obj.key.split('/').pop().replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
          return {
            id: obj.etag,
            title,
            uploader: meta.uploader || 'Community',
            url: `/api/comitbase/img/${encodeURIComponent(obj.key)}`,
            uploaded: obj.uploaded
          };
        }));
        photos.sort((a,b) => new Date(b.uploaded) - new Date(a.uploaded));
        return new Response(JSON.stringify(photos), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e) {
        return new Response("[]", { headers: corsHeaders });
      }
    }

    // API: DTREASURE list
    if (path === '/api/dtreasure/list' && method === 'GET') {
      if (!treasureBucket) return new Response("[]", { headers: corsHeaders });
      try {
        const list = await treasureBucket.list();
        const allowedExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
        const objects = list.objects.filter(obj => allowedExt.some(ext => obj.key.toLowerCase().endsWith(ext)));
        const photos = objects.map(obj => {
          const title = obj.key.split('/').pop().replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
          return {
            id: obj.etag,
            title,
            category: 'DTREASURE',
            url: `/api/dtreasure/img/${encodeURIComponent(obj.key)}`,
            uploaded: obj.uploaded
          };
        });
        photos.sort((a,b) => new Date(b.uploaded) - new Date(a.uploaded));
        return new Response(JSON.stringify(photos), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e) {
        return new Response("[]", { headers: corsHeaders });
      }
    }

    // API: Image stats
    if (path.startsWith('/api/stats/') && method === 'GET') {
      const photoId = path.split('/').pop();
      try {
        const views = await DB.prepare("SELECT COUNT(*) as c FROM views WHERE photo_id = ?").bind(photoId).first();
        const downloads = await DB.prepare("SELECT COUNT(*) as c FROM downloads WHERE photo_id = ?").bind(photoId).first();
        return new Response(JSON.stringify({
          views: views?.c || 0,
          downloads: downloads?.c || 0
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({ views: 0, downloads: 0 }), { headers: corsHeaders });
      }
    }

    // API: Record view
    if (path.startsWith('/api/view/') && method === 'POST') {
      const photoId = path.split('/').pop();
      const userId = getUserToken(request);
      if (!await checkRateLimit('view', userId, 100, 3600)) return new Response(null, { status: 429 });
      try {
        await DB.prepare("INSERT INTO views (photo_id, user_id) VALUES (?, ?)").bind(photoId, userId).run();
        return new Response(null, { status: 204, headers: corsHeaders });
      } catch (e) {
        return new Response(null, { status: 200, headers: corsHeaders });
      }
    }

    // API: Record download
    if (path.startsWith('/api/download/') && method === 'POST') {
      const photoId = path.split('/').pop();
      const userId = getUserToken(request);
      if (!await checkRateLimit('download', userId, 50, 3600)) return new Response(null, { status: 429 });
      try {
        await DB.prepare("INSERT INTO downloads (photo_id, user_id) VALUES (?, ?)").bind(photoId, userId).run();
        return new Response(null, { status: 204, headers: corsHeaders });
      } catch (e) {
        return new Response(null, { status: 200, headers: corsHeaders });
      }
    }

    // CREDIT SYSTEM
    if (path === '/api/credits/balance' && method === 'GET') {
      const userId = getUserToken(request);
      try {
        let user = await DB.prepare("SELECT credits, lifetime FROM user_credits WHERE user_id = ?").bind(userId).first();
        if (!user) {
          user = { credits: 0, lifetime: 0 };
          await DB.prepare("INSERT INTO user_credits (user_id, credits, lifetime) VALUES (?, 0, 0)").bind(userId).run();
        }
        const purchasedRows = await DB.prepare("SELECT photo_id FROM purchased_images WHERE user_id = ?").bind(userId).all();
        const purchased = purchasedRows.results.map(r => r.photo_id);
        return new Response(JSON.stringify({ credits: user.credits, lifetime: !!user.lifetime, purchased }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ credits: 0, lifetime: false, purchased: [] }), { headers: corsHeaders });
      }
    }

    // ✅ KODE LENGKAP PERBAIKAN untuk endpoint `/api/credits/purchase`
// GANTI SELURUH BLOK DARI `if (path === '/api/credits/purchase' && method === 'POST')` 

if (path === '/api/credits/purchase' && method === 'POST') {
  const userId = getUserToken(request);
  
  if (!userId || userId === 'anonymous') {
    return new Response(JSON.stringify({ success: false, error: 'Invalid user token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid request body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { pack, orderId } = body;

  if (!pack || !orderId) {
    return new Response(JSON.stringify({ success: false, error: 'Missing pack or orderId' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // ✅ STEP 1: Cek apakah order sudah pernah diproses (di tabel yang benar)
    const existingPayment = await DB.prepare(
      'SELECT status FROM payment_orders WHERE order_id = ? LIMIT 1'
    ).bind(orderId).first();

    if (existingPayment) {
      if (existingPayment.status === 'completed') {
        // ✅ Order sudah diproses, ambil balance user yang sekarang
        const user = await DB.prepare(
          'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
        ).bind(userId).first();
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Order already processed',
          newBalance: user?.credits || 0,
          lifetime: !!user?.lifetime,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      // Jika status pending atau failed, lanjutkan proses
    }

    // ✅ STEP 2: Verifikasi dengan PayPal API
    const accessToken = await getPayPalAccessToken();
    const orderDetails = await verifyPayPalOrder(orderId, accessToken);

    if (!orderDetails) {
      // Simpan record failed
      await DB.prepare(
        'INSERT OR REPLACE INTO payment_orders (id, user_id, order_id, pack_key, amount, status, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        `order:${orderId}`,
        userId,
        orderId,
        pack,
        PACK_PRICES[pack],
        'failed',
        'Order not found in PayPal'
      ).run();

      return new Response(JSON.stringify({ success: false, error: 'PayPal order not found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ✅ STEP 3: Validasi payment status
    if (orderDetails.status !== 'COMPLETED') {
      await DB.prepare(
        'INSERT OR REPLACE INTO payment_orders (id, user_id, order_id, pack_key, amount, status, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        `order:${orderId}`,
        userId,
        orderId,
        pack,
        PACK_PRICES[pack],
        'failed',
        `Order status is ${orderDetails.status}, not COMPLETED`
      ).run();

      return new Response(JSON.stringify({
        success: false,
        error: `Payment status invalid: ${orderDetails.status}. Please try again or contact support.`
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ✅ STEP 4: Extract verified user ID dari payment
    let verifiedUserId = userId; // Default ke request user
    let verifiedAmount = null;

    if (orderDetails.purchase_units && orderDetails.purchase_units.length > 0) {
      const purchaseUnit = orderDetails.purchase_units[0];
      
      // Ambil custom_id jika ada
      if (purchaseUnit.custom_id) {
        verifiedUserId = purchaseUnit.custom_id;
      }

      // Ambil amount dari capture payment
      if (purchaseUnit.payments && purchaseUnit.payments.captures && purchaseUnit.payments.captures.length > 0) {
        verifiedAmount = parseFloat(purchaseUnit.payments.captures[0].amount?.value || '0');
      }
    }

    // ✅ STEP 5: Validasi amount jika ada
    if (verifiedAmount !== null) {
      const roundedAmount = Math.round(verifiedAmount * 100) / 100; // Prevent floating point errors
      const expectedAmount = PACK_PRICES[pack];
      
      if (roundedAmount !== expectedAmount) {
        await DB.prepare(
          'INSERT OR REPLACE INTO payment_orders (id, user_id, order_id, pack_key, amount, status, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          `order:${orderId}`,
          verifiedUserId,
          orderId,
          pack,
          roundedAmount,
          'failed',
          `Amount mismatch: expected $${expectedAmount}, got $${roundedAmount}`
        ).run();

        return new Response(JSON.stringify({
          success: false,
          error: `Amount mismatch. Expected $${expectedAmount}, received $${roundedAmount}.`
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ✅ STEP 6: Credit the user (ATOMIC OPERATION)
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

      // ✅ STEP 7: Mark order as completed
      await DB.prepare(
        'INSERT OR REPLACE INTO payment_orders (id, user_id, order_id, pack_key, amount, status, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        `order:${orderId}`,
        verifiedUserId,
        orderId,
        pack,
        PACK_PRICES[pack],
        'completed',
        new Date().toISOString()
      ).run();

      // ✅ STEP 8: Fetch updated user balance
      const user = await DB.prepare(
        'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
      ).bind(verifiedUserId).first();

      console.log(`✅ Payment success: User ${verifiedUserId}, Order ${orderId}, Pack ${pack}`);

      return new Response(JSON.stringify({
        success: true,
        newBalance: user?.credits || 0,
        lifetime: !!user?.lifetime,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (dbError) {
      console.error('Database credit error:', dbError.message);
      
      // Simpan failed record
      await DB.prepare(
        'INSERT OR REPLACE INTO payment_orders (id, user_id, order_id, pack_key, amount, status, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        `order:${orderId}`,
        verifiedUserId,
        orderId,
        pack,
        PACK_PRICES[pack],
        'failed',
        `Database error: ${dbError.message}`
      ).run();

      throw dbError;
    }

  } catch (e) {
    console.error('Credit purchase error:', e.message, 'OrderID:', orderId);
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Payment processing error. Please contact support with Order ID: ' + orderId,
      orderId: orderId
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

    if (path === '/api/credits/spend' && method === 'POST') {
  const userId = getUserToken(request);

  if (!userId || userId === 'anonymous') {
    return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid request body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { photoId } = body;

  if (!photoId) {
    return new Response(JSON.stringify({ success: false, error: 'Missing photoId' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Step 1: Check if already purchased (free re-download)
    const alreadyPurchased = await DB.prepare(
      'SELECT 1 FROM purchased_images WHERE user_id = ? AND photo_id = ?'
    ).bind(userId, photoId).first();

    if (alreadyPurchased) {
      const user = await DB.prepare(
        'SELECT credits FROM user_credits WHERE user_id = ?'
      ).bind(userId).first();
      return new Response(JSON.stringify({
        success: true,
        newBalance: user?.credits || 0,
        purchased: true,
        alreadyOwned: true,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Step 2: Check lifetime access
    const userRecord = await DB.prepare(
      'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
    ).bind(userId).first();

    if (!userRecord) {
      return new Response(JSON.stringify({ success: false, error: 'User not found. Please refresh.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (userRecord.lifetime) {
      // Lifetime: record purchase but don't deduct
      await DB.prepare(
        'INSERT OR IGNORE INTO purchased_images (user_id, photo_id) VALUES (?, ?)'
      ).bind(userId, photoId).run();
      return new Response(JSON.stringify({
        success: true,
        newBalance: userRecord.credits || 0,
        purchased: true,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Step 3: Check sufficient credits FIRST before any write
    if (userRecord.credits < 10) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Insufficient credits',
        currentCredits: userRecord.credits,
        required: 10,
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Step 4: ✅ Deduct credits ONLY — do NOT insert purchased yet
    const deductResult = await DB.prepare(
      'UPDATE user_credits SET credits = credits - 10 WHERE user_id = ? AND credits >= 10'
    ).bind(userId).run();

    // Step 5: Verify deduction actually happened (race condition guard)
    if (deductResult.changes === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Insufficient credits (concurrent request detected)',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Step 6: ✅ Only AFTER confirmed deduction, record the purchase
    await DB.prepare(
      'INSERT OR IGNORE INTO purchased_images (user_id, photo_id) VALUES (?, ?)'
    ).bind(userId, photoId).run();

    const newUser = await DB.prepare(
      'SELECT credits FROM user_credits WHERE user_id = ?'
    ).bind(userId).first();

    return new Response(JSON.stringify({
      success: true,
      newBalance: newUser?.credits || 0,
      purchased: true,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error('Spend credit error:', e.message);
    return new Response(JSON.stringify({ success: false, error: 'Database error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Serve images
if (path.startsWith('/api/img/') || path.startsWith('/api/comitbase/img/') || path.startsWith('/api/dtreasure/img/')) {
  const isDtreasure = path.startsWith('/api/dtreasure/img/');

  // ✅ FIX: Server-side auth hanya untuk download DTREASURE
  if (isDtreasure && url.searchParams.get('download') === 'true') {
    const userId = getUserToken(request);
    if (!userId || userId === 'anonymous') {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    try {
      const userRecord = await DB.prepare(
        'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
      ).bind(userId).first();

      const hasLifetime = userRecord && !!userRecord.lifetime;

      if (!hasLifetime) {
        // ✅ FIX: Ambil photoId dari query param (etag) yang dikirim client
        // Fallback ke rawKey jika photoId tidak ada (backward compat)
        const photoIdFromQuery = url.searchParams.get('photoId');
        const rawKey = decodeURIComponent(path.slice('/api/dtreasure/img/'.length));

        // Cek purchased_images dengan photoId (etag) ATAU rawKey sebagai fallback
        let purchasedRecord = null;

        if (photoIdFromQuery) {
          purchasedRecord = await DB.prepare(
            'SELECT 1 FROM purchased_images WHERE user_id = ? AND photo_id = ?'
          ).bind(userId, photoIdFromQuery).first();
        }

        // Fallback: cek dengan rawKey juga (untuk data lama yang mungkin di-store dengan key)
        if (!purchasedRecord) {
          purchasedRecord = await DB.prepare(
            'SELECT 1 FROM purchased_images WHERE user_id = ? AND photo_id = ?'
          ).bind(userId, rawKey).first();
        }

        if (!purchasedRecord) {
          return new Response(JSON.stringify({ error: 'Purchase required to download this image' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
    } catch (e) {
      console.error('Auth check error:', e.message);
      return new Response(JSON.stringify({ error: 'Authorization check failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
    const key = decodeURIComponent(path.slice(prefix.length));
    const object = await bucket.get(key);
    if (!object) return new Response('Not found', { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Access-Control-Allow-Origin', 'https://zxaion-verse.pages.dev');
    headers.set('Cache-Control', isDtreasure ? 'private, no-store' : 'public, max-age=31536000, immutable');

    if (url.searchParams.get('download') === 'true') {
      const safeFilename = key.split('/').pop().replace(/[^a-zA-Z0-9._-]/g, '_');
      headers.set('Content-Disposition', `attachment; filename="${safeFilename}"`);
    }

    return new Response(object.body, { headers });
  } catch (e) {
    console.error('Image serve error:', e.message);
    return new Response(JSON.stringify({ error: 'Failed to fetch image' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

    // Serve static files
    try {
      let key = path === '/' ? 'index.html' : path.slice(1);
      if (key.startsWith('api/')) return new Response('Not Found', { status: 404 });

      const object = await mainBucket.get(key) || await mainBucket.get('index.html');
      if (!object) return new Response('Not found', { status: 404 });

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('Access-Control-Allow-Origin', 'https://zxaion-verse.pages.dev');

      const ext = key.split('.').pop().toLowerCase();
      const mimeTypes = {
        html: 'text/html; charset=utf-8',
        css: 'text/css; charset=utf-8',
        js: 'application/javascript; charset=utf-8',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        svg: 'image/svg+xml',
        ico: 'image/x-icon',
      };
      if (mimeTypes[ext]) headers.set('Content-Type', mimeTypes[ext]);

      if (ext === 'html') {
        headers.set('X-Frame-Options', 'DENY');
        headers.set('X-Content-Type-Options', 'nosniff');
        headers.set('X-XSS-Protection', '1; mode=block');
        headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
        headers.set('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://www.paypal.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com; connect-src 'self' https://ai.zxaionverse.workers.dev https://www.paypal.com; frame-src https://www.paypal.com;");
      }

      return new Response(object.body, { headers });
    } catch (e) {
      return new Response('Internal error', { status: 500 });
    }
  }
};