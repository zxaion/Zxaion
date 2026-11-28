// Rate limit berbasis D1 (tabel rate_limits) dengan identifier IP yang di-hash SHA-256. Fail-open jika DB error.
import { sha256Hex } from '../utils/userToken.js';

export function extractTrustedClientIp(request, fallback = 'anon') {
  const cfIp = request?.headers?.get?.('CF-Connecting-IP');
  if (cfIp && typeof cfIp === 'string') {
    const clean = cfIp.trim().slice(0, 64);
    if (clean) return clean;
  }
  return fallback;
}

export async function resolveHashedRateKey(request, fallback = 'anon') {
  const raw = extractTrustedClientIp(request, fallback);
  const digest = await sha256Hex(`rl:${raw}`);
  return digest.slice(0, 32);
}

export async function checkRateLimitStatus(DB, endpoint, identifier, limit = 50, windowSec = 3600) {
  const normalizedId = /^[0-9a-f]{32}$/.test(String(identifier || ''))
    ? String(identifier)
    : (await sha256Hex(`rl:${String(identifier || 'anon')}`)).slice(0, 32);
  const key = `rate:${endpoint}:${normalizedId}`;
  const now = Math.floor(Date.now() / 1000);
  try {
    await DB.prepare(`
      INSERT INTO rate_limits (id, count, reset_time) VALUES (?, 1, ?)
      ON CONFLICT(id) DO UPDATE SET
        count      = CASE WHEN reset_time < ? THEN 1    ELSE count + 1 END,
        reset_time = CASE WHEN reset_time < ? THEN ?    ELSE reset_time END
    `).bind(key, now + windowSec, now, now, now + windowSec).run();

    const record = await DB.prepare(
      'SELECT count, reset_time FROM rate_limits WHERE id = ?'
    ).bind(key).first();

    if (!record) return { allowed: true, retryAfter: 0 };
    const allowed = record.count <= limit;
    const retryAfter = allowed ? 0 : Math.max(1, Number(record.reset_time || (now + windowSec)) - now);
    return { allowed, retryAfter };
  } catch (e) {
    console.error('[RateLimit] DB error:', e.message);
    return { allowed: true, retryAfter: 0 };
  }
}

export async function checkRateLimit(DB, endpoint, identifier, limit = 50, windowSec = 3600) {
  const res = await checkRateLimitStatus(DB, endpoint, identifier, limit, windowSec);
  return res.allowed;
}
