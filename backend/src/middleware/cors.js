/**
 * CORS policy for the existing Pages frontend origins.
 * Header values and fallback origin remain unchanged.
 */
const ALLOWED_ORIGINS = [
  'https://zxaion-verse.pages.dev',
  'https://zxaionverse.com',
];

export function createCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Token',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
