import { PACK_BY_CENTS, PACKS, PACK_BY_PRICE } from '../config/packs.js';
import { maskTokenForLog } from '../utils/userToken.js';
import { appendCreditLedgerStatement, ensureAutoAccount } from '../services/accountAuth.js';
import { claimPayPalOrderProcessing, settleClaimedPayPalOrder } from '../services/paypal.js';

const STALE_PROCESSING_MS = 5 * 60 * 1000;

const TRUSTED_PAYPAL_CERT_HOSTS = new Set([
  'api.paypal.com',
  'api-m.paypal.com',
  'api.sandbox.paypal.com',
]);

function isTrustedPayPalCertUrl(certUrl) {
  try {
    const parsed = new URL(certUrl);
    return parsed.protocol === 'https:' && TRUSTED_PAYPAL_CERT_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

function extractCaptureIdFromLinks(links) {
  if (!Array.isArray(links)) return null;
  for (const link of links) {
    if (link?.rel === 'up' && typeof link?.href === 'string') {
      const m = link.href.match(/\/captures\/([A-Za-z0-9_-]+)/);
      if (m) return m[1];
    }
  }
  return null;
}

async function resolveUserIdFromCustomId(DB, customId) {
  if (!customId || typeof customId !== 'string') return null;
  if (customId.startsWith('pub_')) {
    const row = await DB.prepare(
      'SELECT user_id FROM user_credits WHERE public_id = ? LIMIT 1'
    ).bind(customId).first();
    return row?.user_id || null;
  }
  // Kompatibilitas mundur untuk order lama sebelum transisi ke pub_ hash
  return customId;
}

async function handlePayPalReversalEvent({ DB, eventType, webhookEvent }) {
  const resource = webhookEvent.resource || {};
  let captureId  = resource.supplementary_data?.related_ids?.capture_id || null;
  let orderId    = resource.supplementary_data?.related_ids?.order_id || null;

  if (eventType === 'PAYMENT.CAPTURE.REFUNDED') {
    captureId = captureId || extractCaptureIdFromLinks(resource.links);
  } else if (eventType === 'PAYMENT.CAPTURE.REVERSED') {
    captureId = captureId || resource.id || null;
  } else if (eventType === 'CUSTOMER.DISPUTE.CREATED') {
    const tx  = Array.isArray(resource.disputed_transactions) ? resource.disputed_transactions[0] : null;
    captureId = captureId || tx?.seller_transaction_id || null;
    orderId   = orderId || tx?.buyer_transaction_id || null;
  }

  let order = null;
  if (orderId) {
    order = await DB.prepare(
      'SELECT id, user_id, order_id, pack_key, amount, status FROM payment_orders WHERE order_id = ? LIMIT 1'
    ).bind(orderId).first();
  }
  if (!order && captureId) {
    order = await DB.prepare(
      'SELECT id, user_id, order_id, pack_key, amount, status FROM payment_orders WHERE capture_id = ? LIMIT 1'
    ).bind(captureId).first();
  }

  if (!order || order.status !== 'completed') {
    return new Response('OK', { status: 200 });
  }

  const packData = PACKS[order.pack_key] || PACK_BY_PRICE[order.amount];
  if (!packData) {
    console.error(`Reversal webhook: unknown pack for order ${order.order_id}`);
    return new Response('OK', { status: 200 });
  }

  const targetStatus =
    eventType === 'PAYMENT.CAPTURE.REFUNDED' ? 'refunded'
    : eventType === 'PAYMENT.CAPTURE.REVERSED' ? 'reversed'
    : 'disputed';

  const { account } = await ensureAutoAccount(DB, { userId: order.user_id, request: null, issueSession: false });
  const creditsDeducted = packData.lifetime ? 0 : -(packData.credits + (packData.bonus || 0));

  const revokeStmt = packData.lifetime
    ? DB.prepare('UPDATE user_credits SET lifetime = 0 WHERE user_id = ?').bind(order.user_id)
    : (() => {
        const creditsToDeduct = packData.credits + (packData.bonus || 0);
        return DB.prepare(
          'UPDATE user_credits SET credits = MAX(0, credits - ?) WHERE user_id = ?'
        ).bind(creditsToDeduct, order.user_id);
      })();

  const orderStmt = DB.prepare(
    'UPDATE payment_orders SET status = ?, error_message = ? WHERE id = ?'
  ).bind(targetStatus, `PayPal event: ${eventType}`, order.id);

  const ledgerStmt = appendCreditLedgerStatement(DB, {
    id: `led:rev:${order.order_id}`,
    accountId: account?.account_id,
    userId: order.user_id,
    txType: targetStatus,
    amount: creditsDeducted,
    referenceType: 'paypal_order',
    referenceId: order.order_id,
    description: `Order ${targetStatus} via PayPal (${eventType})`,
    metadata: { eventType, packKey: order.pack_key },
  });

  await DB.batch([revokeStmt, orderStmt, ledgerStmt]);
  const maskedRef = await maskTokenForLog(order.user_id);
  console.log(`Webhook: ${targetStatus} order ${order.order_id} for user ${maskedRef}`);
  return new Response('OK', { status: 200 });
}

// ================================================================
// ENDPOINT: PayPal Webhook
// ================================================================
export async function handlePayPalWebhook({ request, DB, PAYPAL_WEBHOOK_ID, PAYPAL_BASE, getPayPalAccessToken, verifyPayPalOrder }) {
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

    if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
      console.error('Missing required PayPal webhook headers');
      return new Response('Unauthorized', { status: 401 });
    }

    if (!isTrustedPayPalCertUrl(certUrl)) {
      console.error('Webhook certUrl domain not trusted:', certUrl);
      return new Response('Unauthorized', { status: 401 });
    }

    if (!PAYPAL_WEBHOOK_ID) {
      console.error('PAYPAL_WEBHOOK_ID is not configured');
      return new Response('Webhook not configured', { status: 500 });
    }

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
      if (!verifyRes.ok) {
        console.error('Webhook signature API HTTP error:', verifyRes.status);
        return new Response('Verification failed', { status: 500 });
      }
      const verifyData = await verifyRes.json();
      if (verifyData.verification_status !== 'SUCCESS') {
        console.error('Webhook signature verification failed:', verifyData);
        return new Response('Unauthorized', { status: 401 });
      }
    } catch (e) {
      console.error('Webhook verification error:', e.message);
      return new Response('Verification failed', { status: 500 });
    }

    const eventType = webhookEvent.event_type;

    if (
      eventType === 'PAYMENT.CAPTURE.REFUNDED' ||
      eventType === 'PAYMENT.CAPTURE.REVERSED' ||
      eventType === 'CUSTOMER.DISPUTE.CREATED'
    ) {
      return await handlePayPalReversalEvent({ DB, eventType, webhookEvent });
    }

    if (eventType !== 'PAYMENT.CAPTURE.COMPLETED') {
      return new Response('OK', { status: 200 });
    }

    const orderId        = webhookEvent.resource?.supplementary_data?.related_ids?.order_id;
    const captureId      = webhookEvent.resource?.id || null;
    const capturedAmount = parseFloat(webhookEvent.resource?.amount?.value || '0');
    const currencyCode   = webhookEvent.resource?.amount?.currency_code;

    if (!orderId || !Number.isFinite(capturedAmount) || capturedAmount <= 0 || currencyCode !== 'USD') {
      return new Response('OK', { status: 200 });
    }

    const staleCutoffIso = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
    const existingOrder  = await DB.prepare(
      'SELECT status, created_at FROM payment_orders WHERE order_id = ? LIMIT 1'
    ).bind(orderId).first();

    const isStaleProcessing =
      existingOrder?.status === 'processing' &&
      existingOrder.created_at &&
      existingOrder.created_at < staleCutoffIso;

    if (existingOrder && existingOrder.status !== 'created' && existingOrder.status !== 'failed' && !isStaleProcessing) {
      console.log(`Webhook: order ${orderId} already processed (status: ${existingOrder.status})`);
      return new Response('OK', { status: 200 });
    }

    const amountCents = Math.round(capturedAmount * 100);
    const packData    = PACK_BY_CENTS[amountCents];

    if (!packData) {
      console.error(`Unknown pack amount from webhook: $${capturedAmount}`);
      return new Response('OK', { status: 200 });
    }

    let rawCustomId = webhookEvent.resource?.custom_id || null;

    if (!rawCustomId && orderId) {
      try {
        const orderDetails = await verifyPayPalOrder(orderId, accessToken);
        if (orderDetails?.status === 'COMPLETED' && orderDetails?.purchase_units?.length > 0) {
          rawCustomId = orderDetails.purchase_units[0].custom_id || null;
        }
      } catch (fetchErr) {
        console.error('Failed to fetch order for custom_id:', fetchErr.message);
      }
    }

    const userId = await resolveUserIdFromCustomId(DB, rawCustomId);
    if (!userId) {
      console.error('No userId found in webhook event for orderId:', orderId);
      return new Response('OK', { status: 200 });
    }

    const publicId      = rawCustomId && rawCustomId.startsWith('pub_') ? rawCustomId : null;
    const packDollarKey = `${amountCents / 100}$`;

    const claim = await claimPayPalOrderProcessing({
      DB,
      orderId,
      userId,
      captureId,
      packKey: packDollarKey,
      amount: capturedAmount,
      staleProcessingMs: STALE_PROCESSING_MS,
    });

    if (!claim.meta || claim.meta.changes === 0) {
      console.log(`Webhook: order ${orderId} already claimed — skipping duplicate credit`);
      return new Response('OK', { status: 200 });
    }

    try {
      await settleClaimedPayPalOrder({
        DB,
        orderId,
        userId,
        publicId,
        captureId,
        packKey: packDollarKey,
        amountUsd: capturedAmount,
        packData,
        request: null,
        viaWebhook: true,
      });

      const maskedRef = await maskTokenForLog(userId);
      console.log(`Webhook: credited user ${maskedRef} for order ${orderId} ($${capturedAmount})`);
    } catch (creditError) {
      console.error(`Webhook: failed to credit order ${orderId}:`, creditError.message);
      // Kembalikan 500 agar PayPal menjadwalkan retry otomatis
      return new Response('Credit processing error', { status: 500 });
    }

    return new Response('OK', { status: 200 });

  } catch (e) {
    console.error('Webhook handler error:', e.message);
    return new Response('Internal error', { status: 500 });
  }
}
