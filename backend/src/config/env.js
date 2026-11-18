// backend/src/config/env.js
// Konfigurasi bindings, CORS, dan pembentukan konteks request
export const PAYPAL_BASE = 'https://api-m.paypal.com';

export const ALLOWED_ORIGINS = [
  'https://zxaion-verse.pages.dev',
  'https://zxaionverse.com',
];

export function buildContext(request, env, ctx) {
  const url    = new URL(request.url);
  const path   = url.pathname;
  const method = request.method;

  const origin = request.headers.get('Origin') || '';
  const corsHeaders = {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Token',
    'Access-Control-Max-Age':       '86400',
    'Vary':                         'Origin',
  };
  return {
    request, env, ctx, url, path, method, origin, corsHeaders, ALLOWED_ORIGINS,
    mainBucket:              env.Zxaion_B,
    comitbaseBucket:         env.ZX_BUCKET,
    treasureBucket:          env.TREASURE,
    DB:                      env.DB,
    PAYPAL_CLIENT_ID:        env.PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET_ID: env.PAYPAL_CLIENT_SECRET_ID,
    PAYPAL_WEBHOOK_ID:       env.PAYPAL_WEBHOOK_ID,
    PAYPAL_BASE,
    paypal: { clientId: env.PAYPAL_CLIENT_ID, clientSecret: env.PAYPAL_CLIENT_SECRET_ID, base: PAYPAL_BASE },
  };
}
