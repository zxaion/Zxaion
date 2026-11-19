/**
 * PayPal REST helpers. Credentials are injected from Worker environment
 * bindings; no secrets are stored in this module or repository.
 */
export function createPayPalService({ clientId, clientSecret, baseUrl = 'https://api-m.paypal.com' }) {
  async function getPayPalAccessToken() {
    if (!clientId || !clientSecret) {
      throw new Error('PayPal credentials not configured');
    }
    const credentials = btoa(`${clientId}:${clientSecret}`);
    const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
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

  async function verifyPayPalOrder(orderId, accessToken) {
    const res = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}`, {
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
    return await res.json();
  }

  return { getPayPalAccessToken, verifyPayPalOrder };
}
