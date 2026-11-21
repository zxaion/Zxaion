// Utilitas token user, hashing kode recovery (SHA-256), dan opsional HMAC-SHA256 token signing.

export function getUserToken(req) {
  const raw = (req.headers.get('X-User-Token') || '').trim();
  if (!/^[A-Za-z0-9._-]{8,128}$/.test(raw)) return 'anonymous';
  return raw;
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Hex(input) {
  const data   = new TextEncoder().encode(String(input));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
}

export async function derivePublicPayerRef(userId) {
  if (!userId || userId === 'anonymous') return null;
  const digest = await sha256Hex(`payer:${userId}`);
  return `pub_${digest.slice(0, 32)}`;
}

export async function maskTokenForLog(userId) {
  if (!userId || userId === 'anonymous') return 'anon';
  const digest = await sha256Hex(userId);
  return `u_${digest.slice(0, 10)}`;
}

export function generateRecoveryCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes    = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
  return `ZX-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

export async function signToken(userId, secret) {
  if (!secret) return userId;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(userId));
  return `${userId}.${toHex(sig).slice(0, 32)}`;
}

export async function verifySignedToken(token, secret) {
  if (!token || !secret) return null;
  const dotIdx = token.lastIndexOf('.');
  if (dotIdx <= 0) return null;
  const userId = token.slice(0, dotIdx);
  const sig    = token.slice(dotIdx + 1);
  const expected = await signToken(userId, secret);
  return expected === `${userId}.${sig}` ? userId : null;
}
