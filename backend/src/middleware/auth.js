/** Read the existing anonymous/user token header contract. */
export function getUserToken(req) {
  return req.headers.get('X-User-Token') || 'anonymous';
}
