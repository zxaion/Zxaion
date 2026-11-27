// HMAC-SHA256 Signed Time-Limited Download Tokens for DTREASURE Full-Resolution Access

const FALLBACK_DEV_SECRET = 'zxaion-dev-dtreasure-token-signing-secret';

function resolveSigningSecret(env) {
  const fromEnv = env?.DOWNLOAD_TOKEN_SECRET || env?.ADMIN_TOKEN;
  if (fromEnv && typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim();
  }
  if (typeof process !== 'undefined' && process?.env) {
    const procSecret = process.env.DOWNLOAD_TOKEN_SECRET || process.env.ADMIN_TOKEN;
    if (procSecret && procSecret.trim()) return procSecret.trim();
  }
  return FALLBACK_DEV_SECRET;
}

function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(str) {
  const padded = String(str || '').replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(str || '').length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importHmacKey(secret) {
  const raw = new TextEncoder().encode(secret);
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function issueDtreasureDownloadToken({
  env = {},
  photoId,
  key,
  userId,
  ttlSeconds = 900,
} = {}) {
  if (!userId || userId === 'anonymous' || (!key && !photoId)) {
    throw new Error('Cannot issue DTREASURE download token without userId and key/photoId');
  }

  const normalizedKey = key || String(photoId).replace(/^dtreasure:/, '');
  const normalizedPhotoId = photoId || `dtreasure:${normalizedKey}`;
  const exp = Math.floor(Date.now() / 1000) + Math.max(30, Math.min(3600, Number(ttlSeconds) || 900));
  const payload = {
    pid: normalizedPhotoId,
    key: normalizedKey,
    uid: userId,
    exp,
  };

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const payloadPart = toBase64Url(payloadBytes);
  const hmacKey = await importHmacKey(resolveSigningSecret(env));
  const sigBuf = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(payloadPart));
  const sigPart = toBase64Url(new Uint8Array(sigBuf));

  return {
    token: `${payloadPart}.${sigPart}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export async function verifyDtreasureDownloadToken({
  env = {},
  token,
  photoId,
  key,
  userId,
} = {}) {
  if (!token || typeof token !== 'string' || !userId || userId === 'anonymous') {
    return { valid: false, reason: 'missing_token_or_user' };
  }

  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0 || dotIdx === token.length - 1) {
    return { valid: false, reason: 'malformed_token' };
  }

  const payloadPart = token.slice(0, dotIdx);
  const sigPart = token.slice(dotIdx + 1);

  try {
    const sigBytes = fromBase64Url(sigPart);
    const hmacKey = await importHmacKey(resolveSigningSecret(env));
    const ok = await crypto.subtle.verify(
      'HMAC',
      hmacKey,
      sigBytes,
      new TextEncoder().encode(payloadPart)
    );
    if (!ok) {
      return { valid: false, reason: 'invalid_signature' };
    }

    const payloadJson = new TextDecoder().decode(fromBase64Url(payloadPart));
    const payload = JSON.parse(payloadJson);

    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload || typeof payload.exp !== 'number' || payload.exp < nowSec) {
      return { valid: false, reason: 'token_expired' };
    }

    if (payload.uid !== userId) {
      return { valid: false, reason: 'user_mismatch' };
    }

    const expectedKey = key || String(photoId || '').replace(/^dtreasure:/, '');
    const expectedPhotoId = photoId || `dtreasure:${expectedKey}`;
    if (payload.key !== expectedKey && payload.pid !== expectedPhotoId) {
      return { valid: false, reason: 'asset_mismatch' };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, reason: 'verification_error' };
  }
}
