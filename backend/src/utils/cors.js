import { ALLOWED_ORIGINS } from '../config/constants.js';

export function resolveAllowedOrigin(origin) {
  if (!origin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return origin;
  return ALLOWED_ORIGINS[0];
}

// Header CORS: hanya origin whitelist yang dipantulkan; selain itu → origin pertama.
export function buildCorsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin':  resolveAllowedOrigin(origin),
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Token, X-Admin-Token',
    'Access-Control-Max-Age':       '86400',
    'Vary':                         'Origin',
  };
}
