// backend/src/lib/request.js
// Ambil identitas pengguna dari header X-User-Token
export function getUserToken(req) {
  return req.headers.get('X-User-Token') || 'anonymous';
}
