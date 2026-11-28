import { PACK_PRICES, PACKS } from '../config/packs.js';
import { generateRecoveryCode, sha256Hex, derivePublicPayerRef, maskTokenForLog } from '../utils/userToken.js';
import { appendCreditLedgerStatement, ensureAutoAccount, resolveSessionAuth } from '../services/accountAuth.js';
import { claimPayPalOrderProcessing, markPayPalOrderFailed, settleClaimedPayPalOrder } from '../services/paypal.js';
import { issueDtreasureDownloadToken } from '../services/downloadToken.js';
import { isUserAuthorizedForDtreasure } from './media.js';
import { jsonResponse } from '../utils/cors.js';
import { readJsonBody } from '../utils/requestBody.js';
import { checkRateLimitStatus as defaultCheckRateLimitStatus, resolveHashedRateKey } from '../services/rateLimit.js';

const STALE_PROCESSING_MS = 5 * 60 * 1000;

async function enforceCreditRateLimit({ DB, checkRateLimitStatus, checkRateLimit, request, endpoint, fallbackId, limit, windowSec }) {
  const key = await resolveHashedRateKey(request, fallbackId);
  if (typeof checkRateLimitStatus === 'function') {
    return await checkRateLimitStatus(endpoint, key, limit, windowSec);
  }
  if (typeof checkRateLimit === 'function') {
    const allowed = await checkRateLimit(endpoint, key, limit, windowSec);
    return { allowed, retryAfter: allowed ? 0 : windowSec };
  }
  if (DB) {
    return await defaultCheckRateLimitStatus(DB, endpoint, key, limit, windowSec);
  }
  return { allowed: true, retryAfter: 0 };
}

function requireAuthError(auth, defaultMsg, corsHeaders) {
  return jsonResponse({
    success: false,
    requiresLogin: !!auth.requiresLogin,
    error: auth.requiresLogin ? defaultMsg.login : defaultMsg.unauth,
  }, 401, corsHeaders);
}

// ================================================================
// ENDPOINT: Credit balance (read-only; respects session-protected accounts)
// ================================================================
export async function handleCreditBalance({ request, ctx, DB, corsHeaders, getUserToken }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken, ctx });
  const userId = auth.authenticated ? auth.userId : 'anonymous';

  if (!userId || userId === 'anonymous') {
    return jsonResponse({
      credits: 0,
      lifetime: false,
      purchased: [],
      accountId: null,
      requiresLogin: !!auth.requiresLogin,
    }, 200, corsHeaders);
  }

  try {
    const user = await DB.prepare(
      'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
    ).bind(userId).first();

    const account = auth.account || await DB.prepare(
      'SELECT account_id, email, email_verified, password_hash FROM accounts WHERE user_id = ? LIMIT 1'
    ).bind(userId).first();

    if (!user) {
      return jsonResponse({
        credits: 0,
        lifetime: false,
        purchased: [],
        accountId: account?.account_id || null,
        email: account?.email || null,
        emailVerified: !!account?.email_verified,
        hasPassword: !!account?.password_hash,
      }, 200, corsHeaders);
    }

    const purchasedRows = await DB.prepare(
      'SELECT photo_id FROM purchased_images WHERE user_id = ? ORDER BY purchased_at DESC LIMIT 5000'
    ).bind(userId).all();
    const purchased = purchasedRows.results.map(r => r.photo_id);

    return jsonResponse({
      credits: user.credits,
      lifetime: !!user.lifetime,
      purchased,
      accountId: account?.account_id || null,
      email: account?.email || null,
      emailVerified: !!account?.email_verified,
      hasPassword: !!account?.password_hash,
    }, 200, corsHeaders);
  } catch (e) {
    console.error('/api/credits/balance error:', e.message);
    return jsonResponse({ error: 'Database error' }, 500, corsHeaders);
  }
}

// ================================================================
// ENDPOINT: Prepare public payer reference & automatic Account ID
// ================================================================
export async function handlePreparePayer({ request, ctx, DB, corsHeaders, getUserToken, checkRateLimit, checkRateLimitStatus }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken, ctx });
  if (!auth.authenticated || !auth.userId || auth.userId === 'anonymous') {
    return requireAuthError(auth, {
      login: 'Please sign in to your account to continue',
      unauth: 'Authentication required',
    }, corsHeaders);
  }
  const userId = auth.userId;

  const rl = await enforceCreditRateLimit({
    DB,
    checkRateLimitStatus,
    checkRateLimit,
    request,
    endpoint: 'prepare_payer',
    fallbackId: userId,
    limit: 60,
    windowSec: 3600,
  });
  if (!rl.allowed) {
    return jsonResponse(
      { success: false, error: 'Too many requests. Please slow down.' },
      429,
      corsHeaders,
      { 'Retry-After': String(rl.retryAfter || 60) }
    );
  }

  try {
    const { account } = await ensureAutoAccount(DB, { userId, request, issueSession: false });
    const payerRef = await derivePublicPayerRef(userId);
    await DB.prepare(
      `INSERT INTO user_credits (user_id, public_id, credits, lifetime)
       VALUES (?, ?, 0, 0)
       ON CONFLICT(user_id) DO UPDATE SET public_id = excluded.public_id`
    ).bind(userId, payerRef).run();

    return jsonResponse({
      success: true,
      payerRef,
      accountId: account?.account_id || null,
    }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
  } catch (e) {
    console.error('/api/credits/prepare error:', e.message);
    return jsonResponse({ success: false, error: 'Failed to prepare checkout' }, 500, corsHeaders);
  }
}

// ================================================================
// ENDPOINT: Create PayPal Order server-side (auto-provisions Account ID first)
// ================================================================
export async function handleCreatePayPalOrder({ request, ctx, DB, corsHeaders, getUserToken, checkRateLimit, checkRateLimitStatus, getPayPalAccessToken, createPayPalOrder }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken, ctx });
  if (!auth.authenticated || !auth.userId || auth.userId === 'anonymous') {
    return requireAuthError(auth, {
      login: 'Please sign in to your account before purchasing credits',
      unauth: 'Authentication required',
    }, corsHeaders);
  }
  const userId = auth.userId;

  const rl = await enforceCreditRateLimit({
    DB,
    checkRateLimitStatus,
    checkRateLimit,
    request,
    endpoint: 'create_order',
    fallbackId: userId,
    limit: 30,
    windowSec: 3600,
  });
  if (!rl.allowed) {
    return jsonResponse(
      { success: false, error: 'Too many checkout attempts. Please slow down.' },
      429,
      corsHeaders,
      { 'Retry-After': String(rl.retryAfter || 60) }
    );
  }

  const parsed = await readJsonBody(request, { maxBytes: 1024 * 1024 });
  if (!parsed.ok) {
    return jsonResponse({ success: false, error: parsed.error }, parsed.status, corsHeaders);
  }
  const body = parsed.data;

  const pack = typeof body?.pack === 'string' ? body.pack.trim() : '';
  const packData = PACKS[pack];
  const packPrice = PACK_PRICES[pack];
  if (!pack || !packData || !Number.isFinite(packPrice) || packPrice <= 0) {
    return jsonResponse({ success: false, error: 'Invalid credit pack' }, 400, corsHeaders);
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
      return jsonResponse({ success: false, error: 'Failed to create PayPal order' }, 502, corsHeaders);
    }

    await DB.prepare(`
      INSERT INTO payment_orders (id, user_id, order_id, pack_key, amount, status, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, 'created', NULL, ?)
      ON CONFLICT(id) DO NOTHING
    `).bind(`order:${orderId}`, userId, orderId, pack, packPrice, new Date().toISOString()).run();

    return jsonResponse({
      success:   true,
      orderId,
      accountId: account?.account_id || null,
      pack,
      amount:    packPrice,
      currency:  'USD',
    }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
  } catch (e) {
    console.error('/api/credits/create-order error:', e.message);
    return jsonResponse({ success: false, error: 'Failed to initialize PayPal checkout' }, 502, corsHeaders);
  }
}

// ================================================================
// ENDPOINT: Generate / rotate Recovery Code for current token
// ================================================================
export async function handleCreateRecoveryCode({ request, ctx, DB, corsHeaders, getUserToken, checkRateLimit, checkRateLimitStatus }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken, ctx });
  if (!auth.authenticated || !auth.userId || auth.userId === 'anonymous') {
    return jsonResponse({ success: false, error: 'Authentication required' }, 401, corsHeaders);
  }
  const userId = auth.userId;

  const rl = await enforceCreditRateLimit({
    DB,
    checkRateLimitStatus,
    checkRateLimit,
    request,
    endpoint: 'recovery_create',
    fallbackId: userId,
    limit: 10,
    windowSec: 60,
  });
  if (!rl.allowed) {
    return jsonResponse(
      { success: false, error: 'Too many requests. Try again later.' },
      429,
      corsHeaders,
      { 'Retry-After': String(rl.retryAfter || 60) }
    );
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

    return jsonResponse({
      success: true,
      recoveryCode,
      accountId: account?.account_id || null,
    }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
  } catch (e) {
    console.error('/api/credits/recovery error:', e.message);
    return jsonResponse({ success: false, error: 'Failed to generate recovery code' }, 500, corsHeaders);
  }
}

// ================================================================
// ENDPOINT: Restore account token via Recovery Code
// ================================================================
export async function handleRecoverAccount({ request, DB, corsHeaders, checkRateLimit, checkRateLimitStatus }) {
  const rl = await enforceCreditRateLimit({
    DB,
    checkRateLimitStatus,
    checkRateLimit,
    request,
    endpoint: 'recover',
    fallbackId: 'recover-client',
    limit: 10,
    windowSec: 60,
  });
  if (!rl.allowed) {
    return jsonResponse(
      { success: false, error: 'Too many recovery attempts. Try again later.' },
      429,
      corsHeaders,
      { 'Retry-After': String(rl.retryAfter || 60) }
    );
  }

  const parsed = await readJsonBody(request, { maxBytes: 1024 * 1024 });
  if (!parsed.ok) {
    return jsonResponse({ success: false, error: parsed.error }, parsed.status, corsHeaders);
  }
  const body = parsed.data;

  const rawCode = String(body?.recoveryCode || '').trim().toUpperCase();
  if (!/^ZX-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(rawCode)) {
    return jsonResponse({ success: false, error: 'Invalid recovery code format' }, 400, corsHeaders);
  }

  try {
    const recoveryHash = await sha256Hex(rawCode);
    const user = await DB.prepare(
      'SELECT user_id, credits, lifetime FROM user_credits WHERE recovery_hash = ? LIMIT 1'
    ).bind(recoveryHash).first();

    if (!user) {
      return jsonResponse({ success: false, error: 'Recovery code not found' }, 404, corsHeaders);
    }

    const purchasedRows = await DB.prepare(
      'SELECT photo_id FROM purchased_images WHERE user_id = ? ORDER BY purchased_at DESC LIMIT 5000'
    ).bind(user.user_id).all();

    return jsonResponse({
      success:   true,
      userToken: user.user_id,
      credits:   user.credits || 0,
      lifetime:  !!user.lifetime,
      purchased: purchasedRows.results.map(r => r.photo_id),
    }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
  } catch (e) {
    console.error('/api/credits/recover error:', e.message);
    return jsonResponse({ success: false, error: 'Database error' }, 500, corsHeaders);
  }
}

// ================================================================
// ENDPOINT: Purchase credits
// ================================================================
export async function handleCreditPurchase({ request, ctx, DB, corsHeaders, getUserToken, checkRateLimit, checkRateLimitStatus, getPayPalAccessToken, verifyPayPalOrder }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken, ctx });
  const userId = auth.authenticated ? auth.userId : 'anonymous';

  if (!userId || userId === 'anonymous') {
    return requireAuthError(auth, {
      login: 'Please sign in to your account first',
      unauth: 'Invalid user token',
    }, corsHeaders);
  }

  const rl = await enforceCreditRateLimit({
    DB,
    checkRateLimitStatus,
    checkRateLimit,
    request,
    endpoint: 'purchase',
    fallbackId: userId,
    limit: 20,
    windowSec: 3600,
  });
  if (!rl.allowed) {
    return jsonResponse(
      { success: false, error: 'Too many payment attempts. Please wait and try again.' },
      429,
      corsHeaders,
      { 'Retry-After': String(rl.retryAfter || 60) }
    );
  }

  const parsed = await readJsonBody(request, { maxBytes: 1024 * 1024 });
  if (!parsed.ok) {
    return jsonResponse({ success: false, error: parsed.error }, parsed.status, corsHeaders);
  }
  const body = parsed.data;

  const { pack, orderId: rawOrderId } = body;

  if (!pack || !rawOrderId || typeof rawOrderId !== 'string' || !/^[A-Za-z0-9_-]{6,64}$/.test(rawOrderId.trim())) {
    return jsonResponse({ success: false, error: 'Invalid or missing pack or orderId' }, 400, corsHeaders);
  }
  const orderId = rawOrderId.trim();

  const packData = PACKS[pack];
  if (!packData) {
    return jsonResponse({ success: false, error: 'Invalid pack' }, 400, corsHeaders);
  }

  try {
    const existingPayment = await DB.prepare(
      'SELECT user_id, pack_key, status FROM payment_orders WHERE order_id = ? LIMIT 1'
    ).bind(orderId).first();

    if (existingPayment) {
      if (existingPayment.user_id && existingPayment.user_id !== userId) {
        return jsonResponse({ success: false, error: 'Order belongs to a different user' }, 403, corsHeaders);
      }
      if (existingPayment.pack_key && existingPayment.pack_key !== pack) {
        return jsonResponse({ success: false, error: 'Order pack mismatch' }, 400, corsHeaders);
      }
      if (existingPayment.status === 'completed') {
        const user = await DB.prepare(
          'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
        ).bind(userId).first();
        return jsonResponse({
          success:    true,
          message:    'Order already processed',
          newBalance: user?.credits || 0,
          lifetime:   !!user?.lifetime,
        }, 200, corsHeaders);
      }
      if (['refunded', 'reversed', 'disputed'].includes(existingPayment.status)) {
        return jsonResponse({ success: false, error: `Order has been ${existingPayment.status}.` }, 403, corsHeaders);
      }
    }

    const accessToken  = await getPayPalAccessToken();
    const orderDetails = await verifyPayPalOrder(orderId, accessToken);

    if (!orderDetails) {
      await markPayPalOrderFailed({
        DB, orderId, userId, packKey: pack, amount: PACK_PRICES[pack], errorMessage: 'Order not found in PayPal',
      });
      return jsonResponse({ success: false, error: 'PayPal order not found' }, 400, corsHeaders);
    }

    if (orderDetails.status !== 'COMPLETED') {
      await markPayPalOrderFailed({
        DB, orderId, userId, packKey: pack, amount: PACK_PRICES[pack], errorMessage: `Order status is ${orderDetails.status}, not COMPLETED`,
      });
      return jsonResponse({
        success: false,
        error:   `Payment status invalid: ${orderDetails.status}. Please try again or contact support.`,
      }, 400, corsHeaders);
    }

    const purchaseUnit     = orderDetails.purchase_units?.[0];
    const capture          = purchaseUnit?.payments?.captures?.[0];
    const captureId        = capture?.id || null;
    const orderCustomId    = purchaseUnit?.custom_id || null;
    const expectedPublicId = await derivePublicPayerRef(userId);

    if (orderCustomId && orderCustomId !== expectedPublicId && orderCustomId !== userId) {
      return jsonResponse({ success: false, error: 'Order user mismatch' }, 403, corsHeaders);
    }

    const verifiedAmount   = capture?.amount?.value !== undefined ? parseFloat(capture.amount.value) : null;
    const verifiedCurrency = capture?.amount?.currency_code || null;
    const captureStatus    = capture?.status || null;

    if (
      verifiedAmount === null ||
      !Number.isFinite(verifiedAmount) ||
      verifiedCurrency !== 'USD' ||
      captureStatus !== 'COMPLETED'
    ) {
      await markPayPalOrderFailed({
        DB, orderId, userId, captureId, packKey: pack, amount: PACK_PRICES[pack],
        errorMessage: `Missing/invalid capture details (currency=${verifiedCurrency}, status=${captureStatus})`,
      });
      return jsonResponse({
        success: false,
        error:   'PayPal capture details missing or invalid currency.',
      }, 400, corsHeaders);
    }

    const actualCents   = Math.round(verifiedAmount * 100);
    const expectedCents = Math.round(PACK_PRICES[pack] * 100);
    if (actualCents !== expectedCents) {
      const roundedAmount = actualCents / 100;
      await markPayPalOrderFailed({
        DB, orderId, userId, captureId, packKey: pack, amount: roundedAmount,
        errorMessage: `Amount mismatch: expected $${PACK_PRICES[pack]}, got $${roundedAmount}`,
      });
      return jsonResponse({
        success: false,
        error:   `Amount mismatch. Expected $${PACK_PRICES[pack]}, received $${roundedAmount}.`,
      }, 400, corsHeaders);
    }

    const claim = await claimPayPalOrderProcessing({
      DB,
      orderId,
      userId,
      captureId,
      packKey: pack,
      amount: PACK_PRICES[pack],
      staleProcessingMs: STALE_PROCESSING_MS,
    });

    if (!claim.meta || claim.meta.changes === 0) {
      await new Promise(r => setTimeout(r, 1500));

      const settled = await DB.prepare(
        'SELECT user_id, status FROM payment_orders WHERE id = ?'
      ).bind(`order:${orderId}`).first();

      if (settled?.user_id && settled.user_id !== userId) {
        return jsonResponse({ success: false, error: 'Order belongs to a different user' }, 403, corsHeaders);
      }

      const user = await DB.prepare(
        'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
      ).bind(userId).first();

      if (settled?.status === 'completed') {
        return jsonResponse({
          success:    true,
          message:    'Order already processed',
          newBalance: user?.credits || 0,
          lifetime:   !!user?.lifetime,
        }, 200, corsHeaders);
      }

      return jsonResponse({
        success: false,
        error:   'Order is being processed by another request. Please refresh in a few seconds.',
      }, 409, corsHeaders);
    }

    const { account } = await settleClaimedPayPalOrder({
      DB,
      orderId,
      userId,
      publicId: expectedPublicId,
      captureId,
      packKey: pack,
      amountUsd: PACK_PRICES[pack],
      packData,
      request,
      viaWebhook: false,
    });

    const user = await DB.prepare(
      'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
    ).bind(userId).first();

    const maskedRef = await maskTokenForLog(userId);
    console.log(`Payment success: User ${maskedRef}, Order ${orderId}, Pack ${pack}`);

    return jsonResponse({
      success:    true,
      newBalance: user?.credits || 0,
      lifetime:   !!user?.lifetime,
      accountId:  account?.account_id || null,
    }, 200, corsHeaders);

  } catch (e) {
    console.error('Credit purchase error:', e.message, 'OrderID:', orderId);
    return jsonResponse({
      success: false,
      error:   'Payment processing error. Please contact support with Order ID: ' + orderId,
      orderId,
    }, 500, corsHeaders);
  }
}

// ================================================================
// ENDPOINT: Spend credits
// ================================================================
export async function handleCreditSpend({ request, ctx, env = {}, DB, corsHeaders, getUserToken, checkRateLimit, checkRateLimitStatus }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken, ctx });
  const userId = auth.authenticated ? auth.userId : 'anonymous';

  if (!userId || userId === 'anonymous') {
    return requireAuthError(auth, {
      login: 'Please sign in to your account to unlock items',
      unauth: 'Authentication required',
    }, corsHeaders);
  }

  const rl = await enforceCreditRateLimit({
    DB,
    checkRateLimitStatus,
    checkRateLimit,
    request,
    endpoint: 'spend',
    fallbackId: userId,
    limit: 120,
    windowSec: 3600,
  });
  if (!rl.allowed) {
    return jsonResponse(
      { success: false, error: 'Too many requests. Please slow down.' },
      429,
      corsHeaders,
      { 'Retry-After': String(rl.retryAfter || 60) }
    );
  }

  const parsed = await readJsonBody(request, { maxBytes: 1024 * 1024 });
  if (!parsed.ok) {
    return jsonResponse({ success: false, error: parsed.error }, parsed.status, corsHeaders);
  }
  const body = parsed.data;

  const { photoId } = body;
  if (!photoId || typeof photoId !== 'string') {
    return jsonResponse({ success: false, error: 'Missing photoId' }, 400, corsHeaders);
  }

  try {
    const alreadyPurchased = await DB.prepare(
      'SELECT 1 FROM purchased_images WHERE user_id = ? AND photo_id = ?'
    ).bind(userId, photoId).first();

    if (alreadyPurchased) {
      const user = await DB.prepare(
        'SELECT credits FROM user_credits WHERE user_id = ?'
      ).bind(userId).first();
      const issued = await issueDtreasureDownloadToken({ env, photoId, userId });
      return jsonResponse({
        success:      true,
        newBalance:   user?.credits || 0,
        purchased:    true,
        alreadyOwned: true,
        downloadToken: issued.token,
        downloadTokenExpiresAt: issued.expiresAt,
      }, 200, corsHeaders);
    }

    const dtreasureItem = await DB.prepare(
      "SELECT id FROM images WHERE id = ? AND bucket = 'dtreasure' LIMIT 1"
    ).bind(photoId).first();

    if (!dtreasureItem) {
      return jsonResponse({ success: false, error: 'DTREASURE item not found' }, 404, corsHeaders);
    }

    const userRecord = await DB.prepare(
      'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
    ).bind(userId).first();

    if (!userRecord) {
      return jsonResponse({ success: false, error: 'User not found. Please refresh.' }, 404, corsHeaders);
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
      const issued = await issueDtreasureDownloadToken({ env, photoId, userId });
      return jsonResponse({
        success:    true,
        newBalance: userRecord.credits || 0,
        purchased:  true,
        downloadToken: issued.token,
        downloadTokenExpiresAt: issued.expiresAt,
      }, 200, corsHeaders);
    }

    if (userRecord.credits < 10) {
      return jsonResponse({
        success:        false,
        error:          'Insufficient credits',
        currentCredits: userRecord.credits,
        required:       10,
      }, 400, corsHeaders);
    }

    // Catat pembelian dulu dengan INSERT OR IGNORE untuk mencegah double-spend pada request paralel
    const insertPurchase = await DB.prepare(
      'INSERT OR IGNORE INTO purchased_images (user_id, photo_id) VALUES (?, ?)'
    ).bind(userId, photoId).run();

    if (!insertPurchase.meta || insertPurchase.meta.changes === 0) {
      const user = await DB.prepare(
        'SELECT credits FROM user_credits WHERE user_id = ?'
      ).bind(userId).first();
      const issued = await issueDtreasureDownloadToken({ env, photoId, userId });
      return jsonResponse({
        success:      true,
        newBalance:   user?.credits || 0,
        purchased:    true,
        alreadyOwned: true,
        downloadToken: issued.token,
        downloadTokenExpiresAt: issued.expiresAt,
      }, 200, corsHeaders);
    }

    const deductResult = await DB.prepare(
      'UPDATE user_credits SET credits = credits - 10 WHERE user_id = ? AND credits >= 10'
    ).bind(userId).run();

    if (!deductResult.meta || deductResult.meta.changes === 0) {
      await DB.prepare(
        'DELETE FROM purchased_images WHERE user_id = ? AND photo_id = ?'
      ).bind(userId, photoId).run();
      return jsonResponse({
        success: false,
        error:   'Insufficient credits (concurrent request detected)',
      }, 400, corsHeaders);
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

    const issued = await issueDtreasureDownloadToken({ env, photoId, userId });

    return jsonResponse({
      success:    true,
      newBalance: newUser?.credits || 0,
      purchased:  true,
      downloadToken: issued.token,
      downloadTokenExpiresAt: issued.expiresAt,
    }, 200, corsHeaders);

  } catch (e) {
    console.error('Spend credit error:', e.message);
    return jsonResponse({ success: false, error: 'Database error' }, 500, corsHeaders);
  }
}

// ================================================================
// ENDPOINT: Issue verified short-lived download token for owned DTREASURE asset
// POST /api/dtreasure/download-token
// ================================================================
export async function handleDtreasureDownloadToken({ request, ctx, env = {}, DB, corsHeaders, getUserToken, checkRateLimit, checkRateLimitStatus }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken, ctx });
  const userId = auth.authenticated ? auth.userId : 'anonymous';

  if (!userId || userId === 'anonymous') {
    return requireAuthError(auth, {
      login: 'Please sign in to your account to download DTREASURE originals',
      unauth: 'Authentication required',
    }, corsHeaders);
  }

  const rl = await enforceCreditRateLimit({
    DB,
    checkRateLimitStatus,
    checkRateLimit,
    request,
    endpoint: 'dtreasure_dl_token',
    fallbackId: userId,
    limit: 120,
    windowSec: 3600,
  });
  if (!rl.allowed) {
    return jsonResponse(
      { success: false, error: 'Too many download token requests' },
      429,
      corsHeaders,
      { 'Retry-After': String(rl.retryAfter || 60) }
    );
  }

  const parsed = await readJsonBody(request, { maxBytes: 1024 * 1024 });
  if (!parsed.ok) {
    return jsonResponse({ success: false, error: parsed.error }, parsed.status, corsHeaders);
  }
  const body = parsed.data;

  const rawPhotoId = String(body?.photoId || '').trim();
  const rawKey = String(body?.key || rawPhotoId.replace(/^dtreasure:/, '')).trim();
  if (!rawKey || rawKey.includes('..') || rawKey.includes('\0') || rawKey.startsWith('/')) {
    return jsonResponse({ success: false, error: 'Invalid DTREASURE asset identifier' }, 400, corsHeaders);
  }

  const normalizedPhotoId = rawPhotoId.startsWith('dtreasure:') ? rawPhotoId : `dtreasure:${rawKey}`;

  try {
    const authorized = await isUserAuthorizedForDtreasure(DB, userId, rawKey);
    if (!authorized) {
      return jsonResponse({
        success: false,
        error: 'Unlock this DTREASURE edition with credits or Lifetime Pass first.',
      }, 403, corsHeaders);
    }

    const issued = await issueDtreasureDownloadToken({
      env,
      photoId: normalizedPhotoId,
      key: rawKey,
      userId,
    });

    return jsonResponse({
      success: true,
      photoId: normalizedPhotoId,
      downloadToken: issued.token,
      expiresAt: issued.expiresAt,
      downloadUrl: `/api/dtreasure/img/${encodeURIComponent(rawKey)}?download=true&dt_token=${encodeURIComponent(issued.token)}`,
    }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
  } catch (e) {
    console.error('/api/dtreasure/download-token error:', e.message);
    return jsonResponse({ success: false, error: 'Failed to generate download token' }, 500, corsHeaders);
  }
}
