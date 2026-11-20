
// Membangun "context" satu request — semua variabel yang dulu ada di dalam fetch() worker.js.
// Handler di routes/*.js menerima object ini dan mengambil yang dibutuhkan via destructuring.
import { PAYPAL_BASE, ALLOWED_ORIGINS } from './config/constants.js';
import { buildCorsHeaders } from './utils/cors.js';
import { getUserToken } from './utils/userToken.js';
import { checkRateLimit } from './services/rateLimit.js';
import { getPayPalAccessToken, verifyPayPalOrder } from './services/paypal.js';

export function createContext(request, env, ctx) {
  const url    = new URL(request.url);
  const path   = url.pathname;
  const method = request.method;

  const mainBucket      = env.Zxaion_B;
  const comitbaseBucket = env.ZX_BUCKET;
  const treasureBucket  = env.TREASURE;
  const DB              = env.DB;

  const PAYPAL_CLIENT_ID        = env.PAYPAL_CLIENT_ID;
  const PAYPAL_CLIENT_SECRET_ID = env.PAYPAL_CLIENT_SECRET_ID;
  const PAYPAL_WEBHOOK_ID       = env.PAYPAL_WEBHOOK_ID;

  const origin      = request.headers.get('Origin') || '';
  const corsHeaders = buildCorsHeaders(origin);

  return {
    request, env, ctx, url, path, method,
    mainBucket, comitbaseBucket, treasureBucket, DB,
    PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET_ID, PAYPAL_WEBHOOK_ID, PAYPAL_BASE,
    ALLOWED_ORIGINS, origin, corsHeaders,
    getUserToken,
    // helper yang butuh DB / env dibungkus supaya pemanggilan di handler tidak berubah
    checkRateLimit:       (endpoint, identifier, limit, windowSec) => checkRateLimit(DB, endpoint, identifier, limit, windowSec),
    getPayPalAccessToken: () => getPayPalAccessToken(env),
    verifyPayPalOrder,
  };
}
