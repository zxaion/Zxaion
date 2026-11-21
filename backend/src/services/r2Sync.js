import { parseImageMeta } from './imageMeta.js';

// ============================================================
// Scheduled Handler: Auto-scan R2 → D1 + cleanup rate_limits
// wrangler.toml: [triggers] crons = ["0 * * * *"]
// ============================================================
export async function handleScheduled(env) {
  const DB = env.DB;
  const buckets = [
    { bucket: env.Zxaion_B,  name: 'main' },
    { bucket: env.ZX_BUCKET, name: 'comitbase' },
    { bucket: env.TREASURE,  name: 'dtreasure' },
  ];

  const BATCH_CHUNK_SIZE = 200;

  for (const { bucket, name } of buckets) {
    if (!bucket) continue;
    const syncStartedAt = new Date().toISOString();

    try {
      let cursor      = undefined;
      let totalSynced = 0;
      let pending     = [];

      const flush = async () => {
        if (pending.length === 0) return;
        await DB.batch(pending);
        pending = [];
      };

      do {
        const listResult = await bucket.list({ cursor, limit: 1000 });

        for (const obj of listResult.objects) {
          const meta = parseImageMeta(obj.key, name);
          if (!meta) continue;

          pending.push(
            DB.prepare(`
              INSERT INTO images (id, r2_key, bucket, title, category, sub_category, size, uploaded, last_synced)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                title        = excluded.title,
                category     = excluded.category,
                sub_category = excluded.sub_category,
                size         = excluded.size,
                uploaded     = excluded.uploaded,
                last_synced  = excluded.last_synced
            `).bind(
              meta.id,
              obj.key,
              name,
              meta.title,
              meta.category,
              meta.sub_category,
              obj.size,
              obj.uploaded ? new Date(obj.uploaded).toISOString() : null,
              syncStartedAt
            )
          );
          totalSynced++;

          if (pending.length >= BATCH_CHUNK_SIZE) await flush();
        }

        cursor = listResult.truncated ? listResult.cursor : undefined;
      } while (cursor);

      await flush();

      const cleanup = await DB.prepare(
        'DELETE FROM images WHERE bucket = ? AND (last_synced IS NULL OR last_synced < ?)'
      ).bind(name, syncStartedAt).run();

      const removed = cleanup?.meta?.changes || 0;
      console.log(`[Scheduled] Synced ${totalSynced} images, removed ${removed} stale rows from bucket: ${name}`);
    } catch (e) {
      console.error(`[Scheduled] Error syncing bucket ${name}:`, e.message);
    }
  }

  // Cleanup expired rate_limits rows to keep D1 table compact
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    await DB.prepare('DELETE FROM rate_limits WHERE reset_time < ?').bind(nowSec).run();
  } catch (e) {
    console.error('[Scheduled] Rate limit cleanup error:', e.message);
  }
}
