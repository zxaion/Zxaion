// Rate limit berbasis D1 (tabel rate_limits). Fail-open jika DB error.
export async function checkRateLimit(DB, endpoint, identifier, limit = 50, windowSec = 3600) {
  const key = `rate:${endpoint}:${identifier}`;
  const now = Math.floor(Date.now() / 1000);
  try {
    await DB.prepare(`
      INSERT INTO rate_limits (id, count, reset_time) VALUES (?, 1, ?)
      ON CONFLICT(id) DO UPDATE SET
        count      = CASE WHEN reset_time < ? THEN 1    ELSE count + 1 END,
        reset_time = CASE WHEN reset_time < ? THEN ?    ELSE reset_time END
    `).bind(key, now + windowSec, now, now, now + windowSec).run();

    const record = await DB.prepare(
      'SELECT count FROM rate_limits WHERE id = ?'
    ).bind(key).first();

    return !record || record.count <= limit;
  } catch (e) {
    console.error('[RateLimit] DB error:', e.message);
    return true; // fail open
  }
}
