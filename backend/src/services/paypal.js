// Helper PayPal: OAuth access token + verifikasi order (mendukung sandbox & live).
import { getPayPalBase } from '../config/constants.js';
import { appendCreditLedgerStatement, ensureAutoAccount } from './accountAuth.js';

export async function getPayPalAccessToken(env) {
  const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET_ID } = env;
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET_ID) {
    throw new Error('PayPal credentials not configured');
  }
  const paypalBase  = getPayPalBase(env);
  const credentials = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET_ID}`);
  const res = await fetch(`${paypalBase}/v1/oauth2/token`, {
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

export async function createPayPalOrder({ packKey, price, payerRef, requestId }, accessToken, paypalBase = 'https://api-m.paypal.com') {
  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    throw new Error('Invalid pack price for PayPal order');
  }
  const reqId = requestId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `zx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

  const res = await fetch(`${paypalBase}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Authorization':     `Bearer ${accessToken}`,
      'Content-Type':      'application/json',
      'PayPal-Request-Id': reqId,
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: String(packKey),
          description:  `ZXAION Credits: ${packKey}`,
          custom_id:    String(payerRef),
          amount: {
            currency_code: 'USD',
            value:         numericPrice.toFixed(2),
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`PayPal createOrder failed (HTTP ${res.status}): ${errText.slice(0, 200)}`);
  }

  return await res.json();
}

export async function verifyPayPalOrder(orderId, accessToken, paypalBase = 'https://api-m.paypal.com') {
  const res = await fetch(`${paypalBase}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
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

export async function markPayPalOrderFailed({ DB, orderId, userId, captureId = null, packKey, amount, errorMessage }) {
  return DB.prepare(`
    INSERT INTO payment_orders (id, user_id, order_id, capture_id, pack_key, amount, status, error_message)
    VALUES (?, ?, ?, ?, ?, ?, 'failed', ?)
    ON CONFLICT(id) DO UPDATE SET
      status        = CASE WHEN payment_orders.status IN ('completed', 'refunded', 'reversed', 'disputed') THEN payment_orders.status ELSE 'failed' END,
      error_message = CASE WHEN payment_orders.status IN ('completed', 'refunded', 'reversed', 'disputed') THEN payment_orders.error_message ELSE excluded.error_message END
  `).bind(`order:${orderId}`, userId, orderId, captureId, packKey, amount, errorMessage).run();
}

export async function claimPayPalOrderProcessing({
  DB,
  orderId,
  userId,
  captureId = null,
  packKey,
  amount,
  staleProcessingMs = 5 * 60 * 1000,
}) {
  const nowIso         = new Date().toISOString();
  const staleCutoffIso = new Date(Date.now() - staleProcessingMs).toISOString();
  return DB.prepare(`
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
  `).bind(`order:${orderId}`, userId, orderId, captureId, packKey, amount, nowIso, staleCutoffIso).run();
}

export async function settleClaimedPayPalOrder({
  DB,
  orderId,
  userId,
  publicId = null,
  captureId = null,
  packKey,
  amountUsd,
  packData,
  request = null,
  viaWebhook = false,
}) {
  try {
    const { account } = await ensureAutoAccount(DB, { userId, request, issueSession: false });
    const totalCredits = packData.lifetime ? 0 : (packData.credits + (packData.bonus || 0));

    const creditStmt = packData.lifetime
      ? DB.prepare(
          `INSERT INTO user_credits (user_id, public_id, credits, lifetime)
           VALUES (?, ?, 0, 1)
           ON CONFLICT(user_id) DO UPDATE SET lifetime = 1, public_id = COALESCE(user_credits.public_id, excluded.public_id)`
        ).bind(userId, publicId)
      : DB.prepare(
          `INSERT INTO user_credits (user_id, public_id, credits, lifetime)
           VALUES (?, ?, ?, 0)
           ON CONFLICT(user_id) DO UPDATE SET credits = credits + ?, public_id = COALESCE(user_credits.public_id, excluded.public_id)`
        ).bind(userId, publicId, totalCredits, totalCredits);

    const completedAt = new Date().toISOString();
    const completeStmt = DB.prepare(
      `UPDATE payment_orders SET status = 'completed', completed_at = ?, capture_id = COALESCE(?, capture_id) WHERE id = ?`
    ).bind(completedAt, captureId, `order:${orderId}`);

    const ledgerDescription = packData.lifetime
      ? `Lifetime DTREASURE Pass (${packKey})`
      : `Purchased ${totalCredits} credits (${packKey})${viaWebhook ? ' via PayPal Webhook' : ''}`;

    const ledgerStmt = appendCreditLedgerStatement(DB, {
      id: `led:order:${orderId}`,
      accountId: account?.account_id,
      userId,
      txType: packData.lifetime ? 'lifetime_unlock' : 'purchase',
      amount: totalCredits,
      referenceType: 'paypal_order',
      referenceId: orderId,
      description: ledgerDescription,
      metadata: { pack: packKey, captureId, amountUsd },
      createdAt: completedAt,
    });

    await DB.batch([creditStmt, completeStmt, ledgerStmt]);
    return { account, totalCredits };
  } catch (err) {
    await DB.prepare(
      `UPDATE payment_orders SET status = 'failed', error_message = ? WHERE id = ?`
    ).bind(err.message, `order:${orderId}`).run().catch(() => {});
    throw err;
  }
}
