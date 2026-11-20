
import { ALLOWED_ORIGINS } from '../config/constants.js';

// Header CORS: hanya origin whitelist yang dipantulkan; selain itu → origin pertama.
export function buildCorsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Token',
    'Access-Control-Max-Age':       '86400',
    'Vary':                         'Origin',
  };
}
