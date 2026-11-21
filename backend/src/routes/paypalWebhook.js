import { PACK_BY_CENTS } from '../config/packs.js';

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

    if (!orderId || !Number.isFinite(capturedAmount) || capturedAmount <= 0 || currencyCode !== 'USD') {
      return new Response('OK', { status: 200 });
    }

    const existingOrder = await DB.prepare(
      'SELECT status FROM payment_orders WHERE order_id = ? LIMIT 1'
    ).bind(orderId).first();

    if (existingOrder) {
      console.log(`Webhook: order ${orderId} already processed (status: ${existingOrder.status})`);
      return new Response('OK', { status: 200 });
    }

    const amountCents = Math.round(capturedAmount * 100);
    const packData    = PACK_BY_CENTS[amountCents];

    if (!packData) {
      console.error(`Unknown pack amount from webhook: $${capturedAmount}`);
      return new Response('OK', { status: 200 });
    }

    let userId = webhookEvent.resource?.custom_id || null;

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

    const packDollarKey = `${amountCents / 100}$`;
    const claim = await DB.prepare(`
      INSERT INTO payment_orders (id, user_id, order_id, pack_key, amount, status)
      VALUES (?, ?, ?, ?, ?, 'processing')
      ON CONFLICT(id) DO NOTHING
    `).bind(`order:${orderId}`, userId, orderId, packDollarKey, capturedAmount).run();

    if (!claim.meta || claim.meta.changes === 0) {
      console.log(`Webhook: order ${orderId} already claimed — skipping duplicate credit`);
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
      console.error(`Webhook: failed to credit user ${userId} for order ${orderId}:`, creditError.message);
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
