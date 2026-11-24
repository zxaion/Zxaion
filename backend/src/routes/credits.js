import { PACK_PRICES, PACKS } from '../config/packs.js';
import { generateRecoveryCode, sha256Hex, derivePublicPayerRef, maskTokenForLog } from '../utils/userToken.js';
import { appendCreditLedgerStatement, ensureAutoAccount, resolveSessionAuth } from '../services/accountAuth.js';

const STALE_PROCESSING_MS = 5 * 60 * 1000;

// ================================================================
// ENDPOINT: Credit balance (read-only; respects session-protected accounts)
// ================================================================
export async function handleCreditBalance({ request, DB, corsHeaders, getUserToken }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken });
  const userId = auth.authenticated ? auth.userId : 'anonymous';

  if (!userId || userId === 'anonymous') {
    return new Response(
      JSON.stringify({
        credits: 0,
        lifetime: false,
        purchased: [],
        accountId: null,
        requiresLogin: !!auth.requiresLogin,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const user = await DB.prepare(
      'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
    ).bind(userId).first();

    const account = auth.account || await DB.prepare(
      'SELECT account_id, email, email_verified, password_hash FROM accounts WHERE user_id = ? LIMIT 1'
    ).bind(userId).first();

    if (!user) {
      return new Response(
        JSON.stringify({
          credits: 0,
          lifetime: false,
          purchased: [],
          accountId: account?.account_id || null,
          email: account?.email || null,
          emailVerified: !!account?.email_verified,
          hasPassword: !!account?.password_hash,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const purchasedRows = await DB.prepare(
      'SELECT photo_id FROM purchased_images WHERE user_id = ? ORDER BY purchased_at DESC LIMIT 5000'
    ).bind(userId).all();
    const purchased = purchasedRows.results.map(r => r.photo_id);

    return new Response(
      JSON.stringify({
        credits: user.credits,
        lifetime: !!user.lifetime,
        purchased,
        accountId: account?.account_id || null,
        email: account?.email || null,
        emailVerified: !!account?.email_verified,
        hasPassword: !!account?.password_hash,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('/api/credits/balance error:', e.message);
    return new Response(
      JSON.stringify({ error: 'Database error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// ================================================================
// ENDPOINT: Prepare public payer reference & automatic Account ID
// ================================================================
export async function handlePreparePayer({ request, DB, corsHeaders, getUserToken, checkRateLimit }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken });
  if (!auth.authenticated || !auth.userId || auth.userId === 'anonymous') {
    return new Response(JSON.stringify({
      success: false,
      requiresLogin: !!auth.requiresLogin,
      error: auth.requiresLogin ? 'Please sign in to your account to continue' : 'Authentication required',
    }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userId = auth.userId;

  if (typeof checkRateLimit === 'function') {
    const ip = request.headers.get('CF-Connecting-IP') || userId;
    if (!await checkRateLimit('prepare_payer', ip, 60, 3600)) {
      return new Response(JSON.stringify({ success: false, error: 'Too many requests. Please slow down.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    const { account } = await ensureAutoAccount(DB, { userId, request, issueSession: false });
    const payerRef = await derivePublicPayerRef(userId);
    await DB.prepare(
      `INSERT INTO user_credits (user_id, public_id, credits, lifetime)
       VALUES (?, ?, 0, 0)
       ON CONFLICT(user_id) DO UPDATE SET public_id = excluded.public_id`
    ).bind(userId, payerRef).run();

    return new Response(JSON.stringify({
      success: true,
      payerRef,
      accountId: account?.account_id || null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('/api/credits/prepare error:', e.message);
    return new Response(JSON.stringify({ success: false, error: 'Failed to prepare checkout' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// ================================================================
// ENDPOINT: Create PayPal Order server-side (auto-provisions Account ID first)
// ================================================================
export async function handleCreatePayPalOrder({ request, DB, corsHeaders, getUserToken, checkRateLimit, getPayPalAccessToken, createPayPalOrder }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken });
  if (!auth.authenticated || !auth.userId || auth.userId === 'anonymous') {
    return new Response(JSON.stringify({
      success: false,
      requiresLogin: !!auth.requiresLogin,
      error: auth.requiresLogin ? 'Please sign in to your account before purchasing credits' : 'Authentication required',
    }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userId = auth.userId;

  if (typeof checkRateLimit === 'function') {
    const ip = request.headers.get('CF-Connecting-IP') || userId;
    if (!await checkRateLimit('create_order', ip, 30, 3600)) {
      return new Response(JSON.stringify({ success: false, error: 'Too many checkout attempts. Please slow down.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid request body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const pack = typeof body?.pack === 'string' ? body.pack.trim() : '';
  const packData = PACKS[pack];
  const packPrice = PACK_PRICES[pack];
  if (!pack || !packData || !Number.isFinite(packPrice) || packPrice <= 0) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid credit pack' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { account } = await ensureAutoAccount(DB, { userId, request, issueSession: false });
    const payerRef = await derivePublicPayerRef(userId);
    await DB.prepare(
      `INSERT INTO user_credits (user_id, public_id, credits, lifetime)
       VALUES (?, ?, 0, 0)
       ON CONFLICT(user_id) DO UPDATE SET public_id = excluded.public_id`
    ).bind(userId, payerRef).run();

    const accessToken = await getPayPalAccessToken();
    const created = await createPayPalOrder({ packKey: pack, price: packPrice, payerRef }, accessToken);
    const orderId = typeof created?.id === 'string' ? created.id.trim() : '';

    if (!/^[A-Za-z0-9_-]{6,64}$/.test(orderId)) {
      console.error('PayPal createOrder returned invalid id');
      return new Response(JSON.stringify({ success: false, error: 'Failed to create PayPal order' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await DB.prepare(`
      INSERT INTO payment_orders (id, user_id, order_id, pack_key, amount, status, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, 'created', NULL, ?)
      ON CONFLICT(id) DO NOTHING
    `).bind(`order:${orderId}`, userId, orderId, pack, packPrice, new Date().toISOString()).run();

    return new Response(JSON.stringify({
      success:   true,
      orderId,
      accountId: account?.account_id || null,
      pack,
      amount:    packPrice,
      currency:  'USD',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('/api/credits/create-order error:', e.message);
    return new Response(JSON.stringify({ success: false, error: 'Failed to initialize PayPal checkout' }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// ================================================================
// ENDPOINT: Generate / rotate Recovery Code for current token
// ================================================================
export async function handleCreateRecoveryCode({ request, DB, corsHeaders, getUserToken, checkRateLimit }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken });
  if (!auth.authenticated || !auth.userId || auth.userId === 'anonymous') {
    return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userId = auth.userId;

  if (typeof checkRateLimit === 'function') {
    const ip = request.headers.get('CF-Connecting-IP') || userId;
    if (!await checkRateLimit('recovery_create', ip, 10, 3600)) {
      return new Response(JSON.stringify({ success: false, error: 'Too many requests. Try again later.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    const { account } = await ensureAutoAccount(DB, { userId, request, issueSession: false });
    const publicId = await derivePublicPayerRef(userId);
    await DB.prepare(
      `INSERT INTO user_credits (user_id, public_id, credits, lifetime)
       VALUES (?, ?, 0, 0)
       ON CONFLICT(user_id) DO UPDATE SET public_id = COALESCE(user_credits.public_id, excluded.public_id)`
    ).bind(userId, publicId).run();

    const recoveryCode = generateRecoveryCode();
    const recoveryHash = await sha256Hex(recoveryCode);

    await DB.prepare(
      'UPDATE user_credits SET recovery_hash = ? WHERE user_id = ?'
    ).bind(recoveryHash, userId).run();

    return new Response(JSON.stringify({
      success: true,
      recoveryCode,
      accountId: account?.account_id || null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('/api/credits/recovery error:', e.message);
    return new Response(JSON.stringify({ success: false, error: 'Failed to generate recovery code' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// ================================================================
// ENDPOINT: Restore account token via Recovery Code
// ================================================================
export async function handleRecoverAccount({ request, DB, corsHeaders, checkRateLimit }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid request body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const rawCode = String(body?.recoveryCode || '').trim().toUpperCase();
  if (!/^ZX-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(rawCode)) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid recovery code format' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'recover-client';
  if (!await checkRateLimit('recover', ip, 10, 3600)) {
    return new Response(JSON.stringify({ success: false, error: 'Too many recovery attempts. Try again later.' }), {
      status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const recoveryHash = await sha256Hex(rawCode);
    const user = await DB.prepare(
      'SELECT user_id, credits, lifetime FROM user_credits WHERE recovery_hash = ? LIMIT 1'
    ).bind(recoveryHash).first();

    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Recovery code not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const purchasedRows = await DB.prepare(
      'SELECT photo_id FROM purchased_images WHERE user_id = ? ORDER BY purchased_at DESC LIMIT 5000'
    ).bind(user.user_id).all();

    return new Response(JSON.stringify({
      success:   true,
      userToken: user.user_id,
      credits:   user.credits || 0,
      lifetime:  !!user.lifetime,
      purchased: purchasedRows.results.map(r => r.photo_id),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('/api/credits/recover error:', e.message);
    return new Response(JSON.stringify({ success: false, error: 'Database error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// ================================================================
// ENDPOINT: Purchase credits
// ================================================================
export async function handleCreditPurchase({ request, DB, corsHeaders, getUserToken, checkRateLimit, getPayPalAccessToken, verifyPayPalOrder }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken });
  const userId = auth.authenticated ? auth.userId : 'anonymous';

  if (!userId || userId === 'anonymous') {
    return new Response(JSON.stringify({
      success: false,
      requiresLogin: !!auth.requiresLogin,
      error: auth.requiresLogin ? 'Please sign in to your account first' : 'Invalid user token',
    }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (typeof checkRateLimit === 'function') {
    const ip = request.headers.get('CF-Connecting-IP') || userId;
    if (!await checkRateLimit('purchase', ip, 20, 3600)) {
      return new Response(JSON.stringify({ success: false, error: 'Too many payment attempts. Please wait and try again.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid request body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { pack, orderId: rawOrderId } = body;

  if (!pack || !rawOrderId || typeof rawOrderId !== 'string' || !/^[A-Za-z0-9_-]{6,64}$/.test(rawOrderId.trim())) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid or missing pack or orderId' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const orderId = rawOrderId.trim();

  const packData = PACKS[pack];
  if (!packData) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid pack' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const existingPayment = await DB.prepare(
      'SELECT user_id, pack_key, status FROM payment_orders WHERE order_id = ? LIMIT 1'
    ).bind(orderId).first();

    if (existingPayment) {
      if (existingPayment.user_id && existingPayment.user_id !== userId) {
        return new Response(JSON.stringify({
          success: false,
          error:   'Order belongs to a different user',
        }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (existingPayment.pack_key && existingPayment.pack_key !== pack) {
        return new Response(JSON.stringify({
          success: false,
          error:   'Order pack mismatch',
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (existingPayment.status === 'completed') {
        const user = await DB.prepare(
          'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
        ).bind(userId).first();
        return new Response(JSON.stringify({
          success:    true,
          message:    'Order already processed',
          newBalance: user?.credits || 0,
          lifetime:   !!user?.lifetime,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (existingPayment.status === 'refunded' || existingPayment.status === 'reversed' || existingPayment.status === 'disputed') {
        return new Response(JSON.stringify({
          success: false,
          error:   `Order has been ${existingPayment.status}.`,
        }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const accessToken  = await getPayPalAccessToken();
    const orderDetails = await verifyPayPalOrder(orderId, accessToken);

    if (!orderDetails) {
      await DB.prepare(`
        INSERT INTO payment_orders (id, user_id, order_id, pack_key, amount, status, error_message)
        VALUES (?, ?, ?, ?, ?, 'failed', ?)
        ON CONFLICT(id) DO UPDATE SET
          status        = CASE WHEN payment_orders.status IN ('completed', 'refunded', 'reversed', 'disputed') THEN payment_orders.status ELSE 'failed' END,
          error_message = CASE WHEN payment_orders.status IN ('completed', 'refunded', 'reversed', 'disputed') THEN payment_orders.error_message ELSE excluded.error_message END
      `).bind(`order:${orderId}`, userId, orderId, pack, PACK_PRICES[pack], 'Order not found in PayPal').run();

      return new Response(JSON.stringify({ success: false, error: 'PayPal order not found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (orderDetails.status !== 'COMPLETED') {
      await DB.prepare(`
        INSERT INTO payment_orders (id, user_id, order_id, pack_key, amount, status, error_message)
        VALUES (?, ?, ?, ?, ?, 'failed', ?)
        ON CONFLICT(id) DO UPDATE SET
          status        = CASE WHEN payment_orders.status IN ('completed', 'refunded', 'reversed', 'disputed') THEN payment_orders.status ELSE 'failed' END,
          error_message = CASE WHEN payment_orders.status IN ('completed', 'refunded', 'reversed', 'disputed') THEN payment_orders.error_message ELSE excluded.error_message END
      `).bind(
        `order:${orderId}`, userId, orderId, pack, PACK_PRICES[pack],
        `Order status is ${orderDetails.status}, not COMPLETED`
      ).run();

      return new Response(JSON.stringify({
        success: false,
        error:   `Payment status invalid: ${orderDetails.status}. Please try again or contact support.`,
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const purchaseUnit     = orderDetails.purchase_units?.[0];
    const capture          = purchaseUnit?.payments?.captures?.[0];
    const captureId        = capture?.id || null;
    const orderCustomId    = purchaseUnit?.custom_id || null;
    const expectedPublicId = await derivePublicPayerRef(userId);

    if (orderCustomId && orderCustomId !== expectedPublicId && orderCustomId !== userId) {
      return new Response(JSON.stringify({
        success: false,
        error:   'Order user mismatch',
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const verifiedUserId   = userId;
    const verifiedAmount   = capture?.amount?.value !== undefined ? parseFloat(capture.amount.value) : null;
    const verifiedCurrency = capture?.amount?.currency_code || null;
    const captureStatus    = capture?.status || null;

    if (
      verifiedAmount === null ||
      !Number.isFinite(verifiedAmount) ||
      verifiedCurrency !== 'USD' ||
      captureStatus !== 'COMPLETED'
    ) {
      await DB.prepare(`
        INSERT INTO payment_orders (id, user_id, order_id, capture_id, pack_key, amount, status, error_message)
        VALUES (?, ?, ?, ?, ?, ?, 'failed', ?)
        ON CONFLICT(id) DO UPDATE SET
          status        = CASE WHEN payment_orders.status IN ('completed', 'refunded', 'reversed', 'disputed') THEN payment_orders.status ELSE 'failed' END,
          error_message = CASE WHEN payment_orders.status IN ('completed', 'refunded', 'reversed', 'disputed') THEN payment_orders.error_message ELSE excluded.error_message END
      `).bind(
        `order:${orderId}`, verifiedUserId, orderId, captureId, pack, PACK_PRICES[pack],
        `Missing/invalid capture details (currency=${verifiedCurrency}, status=${captureStatus})`
      ).run();

      return new Response(JSON.stringify({
        success: false,
        error:   'PayPal capture details missing or invalid currency.',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const actualCents   = Math.round(verifiedAmount * 100);
    const expectedCents = Math.round(PACK_PRICES[pack] * 100);
    if (actualCents !== expectedCents) {
      const roundedAmount = actualCents / 100;
      await DB.prepare(`
        INSERT INTO payment_orders (id, user_id, order_id, capture_id, pack_key, amount, status, error_message)
        VALUES (?, ?, ?, ?, ?, ?, 'failed', ?)
        ON CONFLICT(id) DO UPDATE SET
          status        = CASE WHEN payment_orders.status IN ('completed', 'refunded', 'reversed', 'disputed') THEN payment_orders.status ELSE 'failed' END,
          error_message = CASE WHEN payment_orders.status IN ('completed', 'refunded', 'reversed', 'disputed') THEN payment_orders.error_message ELSE excluded.error_message END
      `).bind(
        `order:${orderId}`, verifiedUserId, orderId, captureId, pack, roundedAmount,
        `Amount mismatch: expected $${PACK_PRICES[pack]}, got $${roundedAmount}`
      ).run();

      return new Response(JSON.stringify({
        success: false,
        error:   `Amount mismatch. Expected $${PACK_PRICES[pack]}, received $${roundedAmount}.`,
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const nowIso         = new Date().toISOString();
    const staleCutoffIso = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
    const claim = await DB.prepare(`
      INSERT INTO payment_orders (id, user_id, order_id, capture_id, pack_key, amount, status, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'processing', NULL, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id       = excluded.user_id,
        capture_id    = COALESCE(excluded.capture_id, payment_orders.capture_id),
        pack_key      = excluded.pack_key,
        amount        = excluded.amount,
        status        = 'processing',
        error_message = NULL,
        created_at    = excluded.created_at
      WHERE payment_orders.status IN ('created', 'failed')
         OR (payment_orders.status = 'processing' AND payment_orders.created_at < ?)
    `).bind(`order:${orderId}`, verifiedUserId, orderId, captureId, pack, PACK_PRICES[pack], nowIso, staleCutoffIso).run();

    if (!claim.meta || claim.meta.changes === 0) {
      await new Promise(r => setTimeout(r, 1500));

      const settled = await DB.prepare(
        'SELECT user_id, status FROM payment_orders WHERE id = ?'
      ).bind(`order:${orderId}`).first();

      if (settled?.user_id && settled.user_id !== userId) {
        return new Response(JSON.stringify({
          success: false,
          error:   'Order belongs to a different user',
        }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const user = await DB.prepare(
        'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
      ).bind(verifiedUserId).first();

      if (settled?.status === 'completed') {
        return new Response(JSON.stringify({
          success:    true,
          message:    'Order already processed',
          newBalance: user?.credits || 0,
          lifetime:   !!user?.lifetime,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({
        success: false,
        error:   'Order is being processed by another request. Please refresh in a few seconds.',
      }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    try {
      const { account } = await ensureAutoAccount(DB, { userId: verifiedUserId, request, issueSession: false });
      const totalCredits = packData.lifetime ? 0 : (packData.credits + (packData.bonus || 0));

      const creditStmt = packData.lifetime
        ? DB.prepare(
            `INSERT INTO user_credits (user_id, public_id, credits, lifetime)
             VALUES (?, ?, 0, 1)
             ON CONFLICT(user_id) DO UPDATE SET lifetime = 1, public_id = COALESCE(user_credits.public_id, excluded.public_id)`
          ).bind(verifiedUserId, expectedPublicId)
        : DB.prepare(
            `INSERT INTO user_credits (user_id, public_id, credits, lifetime)
             VALUES (?, ?, ?, 0)
             ON CONFLICT(user_id) DO UPDATE SET credits = credits + ?, public_id = COALESCE(user_credits.public_id, excluded.public_id)`
          ).bind(verifiedUserId, expectedPublicId, totalCredits, totalCredits);

      const completedAt = new Date().toISOString();
      const completeStmt = DB.prepare(
        `UPDATE payment_orders SET status = 'completed', completed_at = ?, capture_id = COALESCE(?, capture_id) WHERE id = ?`
      ).bind(completedAt, captureId, `order:${orderId}`);

      const ledgerStmt = appendCreditLedgerStatement(DB, {
        id: `led:order:${orderId}`,
        accountId: account?.account_id,
        userId: verifiedUserId,
        txType: packData.lifetime ? 'lifetime_unlock' : 'purchase',
        amount: totalCredits,
        referenceType: 'paypal_order',
        referenceId: orderId,
        description: packData.lifetime
          ? `Lifetime DTREASURE Pass (${pack})`
          : `Purchased ${totalCredits} credits (${pack})`,
        metadata: { pack, captureId, amountUsd: PACK_PRICES[pack] },
        createdAt: completedAt,
      });

      await DB.batch([creditStmt, completeStmt, ledgerStmt]);

      const user = await DB.prepare(
        'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
      ).bind(verifiedUserId).first();

      const maskedRef = await maskTokenForLog(verifiedUserId);
      console.log(`Payment success: User ${maskedRef}, Order ${orderId}, Pack ${pack}`);

      return new Response(JSON.stringify({
        success:    true,
        newBalance: user?.credits || 0,
        lifetime:   !!user?.lifetime,
        accountId:  account?.account_id || null,
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
export async function handleCreditSpend({ request, DB, corsHeaders, getUserToken, checkRateLimit }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken });
  const userId = auth.authenticated ? auth.userId : 'anonymous';

  if (!userId || userId === 'anonymous') {
    return new Response(JSON.stringify({
      success: false,
      requiresLogin: !!auth.requiresLogin,
      error: auth.requiresLogin ? 'Please sign in to your account to unlock items' : 'Authentication required',
    }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (typeof checkRateLimit === 'function') {
    const ip = request.headers.get('CF-Connecting-IP') || userId;
    if (!await checkRateLimit('spend', ip, 120, 3600)) {
      return new Response(JSON.stringify({ success: false, error: 'Too many requests. Please slow down.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
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
  if (!photoId || typeof photoId !== 'string') {
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

    const dtreasureItem = await DB.prepare(
      "SELECT id FROM images WHERE id = ? AND bucket = 'dtreasure' LIMIT 1"
    ).bind(photoId).first();

    if (!dtreasureItem) {
      return new Response(JSON.stringify({ success: false, error: 'DTREASURE item not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userRecord = await DB.prepare(
      'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
    ).bind(userId).first();

    if (!userRecord) {
      return new Response(JSON.stringify({ success: false, error: 'User not found. Please refresh.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { account } = await ensureAutoAccount(DB, { userId, request, issueSession: false });

    if (userRecord.lifetime) {
      const insertLifetime = await DB.prepare(
        'INSERT OR IGNORE INTO purchased_images (user_id, photo_id) VALUES (?, ?)'
      ).bind(userId, photoId).run();
      if (insertLifetime?.meta?.changes > 0) {
        await appendCreditLedgerStatement(DB, {
          id: `led:spend:${userId}:${photoId}`,
          accountId: account?.account_id,
          userId,
          txType: 'lifetime_access',
          amount: 0,
          referenceType: 'dtreasure_photo',
          referenceId: photoId,
          description: `Unlocked DTREASURE item via Lifetime Pass (${photoId})`,
        }).run();
      }
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

    // Catat pembelian dulu dengan INSERT OR IGNORE untuk mencegah double-spend pada request paralel
    const insertPurchase = await DB.prepare(
      'INSERT OR IGNORE INTO purchased_images (user_id, photo_id) VALUES (?, ?)'
    ).bind(userId, photoId).run();

    if (!insertPurchase.meta || insertPurchase.meta.changes === 0) {
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

    const deductResult = await DB.prepare(
      'UPDATE user_credits SET credits = credits - 10 WHERE user_id = ? AND credits >= 10'
    ).bind(userId).run();

    if (!deductResult.meta || deductResult.meta.changes === 0) {
      await DB.prepare(
        'DELETE FROM purchased_images WHERE user_id = ? AND photo_id = ?'
      ).bind(userId, photoId).run();
      return new Response(JSON.stringify({
        success: false,
        error:   'Insufficient credits (concurrent request detected)',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await appendCreditLedgerStatement(DB, {
      id: `led:spend:${userId}:${photoId}`,
      accountId: account?.account_id,
      userId,
      txType: 'spend',
      amount: -10,
      referenceType: 'dtreasure_photo',
      referenceId: photoId,
      description: `Unlocked DTREASURE item (${photoId})`,
    }).run();

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
