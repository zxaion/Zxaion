/** POST /api/paypal/webhook */
export async function handlePayPalWebhook({ request, DB, getPayPalAccessToken, verifyPayPalOrder, PAYPAL_WEBHOOK_ID, PAYPAL_BASE }) {
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
