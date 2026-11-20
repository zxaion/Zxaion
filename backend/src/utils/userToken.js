
// Ambil token user dari header X-User-Token (fallback: anonymous).
export function getUserToken(req) {
  return req.headers.get('X-User-Token') || 'anonymous';
}
