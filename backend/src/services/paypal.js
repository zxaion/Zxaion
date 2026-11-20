// Helper PayPal: OAuth access token + verifikasi order.
import { PAYPAL_BASE } from '../config/constants.js';

export async function getPayPalAccessToken(env) {
  const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET_ID } = env;
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET_ID) {
    throw new Error('PayPal credentials not configured');
  }
  const credentials = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET_ID}`);
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
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

export async function verifyPayPalOrder(orderId, accessToken) {
  const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}`, {
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
