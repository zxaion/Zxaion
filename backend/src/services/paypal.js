// Helper PayPal: OAuth access token + verifikasi order (mendukung sandbox & live).
import { getPayPalBase } from '../config/constants.js';

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
