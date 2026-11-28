// Membangun "context" satu request — handler di routes/*.js menerima object ini.
import { getPayPalBase, ALLOWED_ORIGINS } from './config/constants.js';
import { buildCorsHeaders } from './utils/cors.js';
import { getUserToken } from './utils/userToken.js';
import { checkRateLimit, checkRateLimitStatus } from './services/rateLimit.js';
import { getPayPalAccessToken, createPayPalOrder, verifyPayPalOrder } from './services/paypal.js';
import { dispatchTransactionalEmail } from './services/email.js';

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
  const PAYPAL_BASE             = getPayPalBase(env);

  const origin      = request.headers.get('Origin') || '';
  const corsHeaders = buildCorsHeaders(origin);

  return {
    request, env, ctx, url, path, method,
    mainBucket, comitbaseBucket, treasureBucket, DB,
    PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET_ID, PAYPAL_WEBHOOK_ID, PAYPAL_BASE,
    ALLOWED_ORIGINS, origin, corsHeaders,
    getUserToken,
    checkRateLimit:         (endpoint, identifier, limit, windowSec) => checkRateLimit(DB, endpoint, identifier, limit, windowSec),
    checkRateLimitStatus:   (endpoint, identifier, limit, windowSec) => checkRateLimitStatus(DB, endpoint, identifier, limit, windowSec),
    sendEmail:              (emailOpts) => dispatchTransactionalEmail(env, emailOpts),
    getPayPalAccessToken:   () => getPayPalAccessToken(env),
    createPayPalOrder:      (orderInput, accessToken) => createPayPalOrder(orderInput, accessToken, PAYPAL_BASE),
    verifyPayPalOrder:      (orderId, accessToken) => verifyPayPalOrder(orderId, accessToken, PAYPAL_BASE),
  };
}
