import { parseImageMeta, extractImageDimensions, buildWatermarkedPreviewSvg } from './imageMeta.js';
import { createD1Snapshot, listBackupSnapshots } from './backup.js';

const BATCH_CHUNK_SIZE = 200;
const DEFAULT_AUTOSYNC_COOLDOWN_MS = 15_000;
const AUTO_BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const HEADER_INSPECT_BYTES = 65536;

let activeSyncPromise = null;
let lastAutoSyncAt = 0;
let lastAutoBackupAt = 0;
const nonEmptyBucketCache = new Set();

export function resetSyncStateForTests() {
  activeSyncPromise = null;
  lastAutoSyncAt = 0;
  nonEmptyBucketCache.clear();
}

function getConfiguredBuckets(env) {
  return [
    { bucket: env.Zxaion_B,  name: 'main',      aliases: ['main', 'zxaionverse', env.MAIN_BUCKET_NAME].filter(Boolean) },
    { bucket: env.ZX_BUCKET, name: 'comitbase', aliases: ['comitbase', 'zx-cloud2', env.COMITBASE_BUCKET_NAME].filter(Boolean) },
    { bucket: env.TREASURE,  name: 'dtreasure', aliases: ['dtreasure', 'd-treasures', env.TREASURE_BUCKET_NAME].filter(Boolean) },
  ];
}

export function resolveBucketTarget(rawBucketName, env) {
  const needle = String(rawBucketName || '').trim().toLowerCase();
  if (!needle) return null;
  for (const entry of getConfiguredBuckets(env)) {
    if (entry.aliases.some((alias) => alias.toLowerCase() === needle)) {
      return entry;
    }
  }
  return null;
}

async function readHeadBytes(object, maxBytes = HEADER_INSPECT_BYTES) {
  if (!object || !object.body) return null;
  const body = object.body;
  if (body instanceof Uint8Array) return body.subarray(0, maxBytes);
  if (body instanceof ArrayBuffer) return new Uint8Array(body).subarray(0, maxBytes);
  if (typeof body === 'string') return new TextEncoder().encode(body.slice(0, maxBytes));
  if (typeof body.getReader === 'function') {
    const reader = body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (total < maxBytes) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        const part = value instanceof Uint8Array ? value : new Uint8Array(value);
        chunks.push(part);
        total += part.byteLength;
      }
    } finally {
      try { await reader.cancel?.(); } catch {}
    }
    const merged = new Uint8Array(Math.min(total, maxBytes));
    let offset = 0;
    for (const chunk of chunks) {
      const remaining = merged.length - offset;
      if (remaining <= 0) break;
      const slice = chunk.subarray(0, remaining);
      merged.set(slice, offset);
      offset += slice.length;
    }
    return merged;
  }
  return null;
}

async function detectR2Dimensions(bucket, key) {
  if (!bucket || typeof bucket.get !== 'function' || !key) return { width: 0, height: 0 };
  try {
    const obj = await bucket.get(key, { range: { offset: 0, length: HEADER_INSPECT_BYTES } });
    if (!obj) return { width: 0, height: 0 };
    const bytes = await readHeadBytes(obj, HEADER_INSPECT_BYTES);
    if (!bytes || bytes.byteLength < 8) return { width: 0, height: 0 };
    const mime = obj.httpMetadata?.contentType || '';
    return extractImageDimensions(bytes, mime);
  } catch {
    return { width: 0, height: 0 };
  }
}

async function ensureDtreasureWatermarkedPreview(bucket, meta, dims = { width: 480, height: 640 }, uploadedIso = new Date().toISOString()) {
  if (!bucket || typeof bucket.put !== 'function' || meta?.bucket !== 'dtreasure') return;
  const previewKey = `_preview/${meta.r2_key}`;
  try {
    if (typeof bucket.head === 'function') {
      const existing = await bucket.head(previewKey);
      if (existing) return;
    }
    const previewSvg = buildWatermarkedPreviewSvg({
      title: meta.title || 'Exclusive Edition',
      category: 'DTREASURE',
      width: dims?.width || 480,
      height: dims?.height || 640,
    });
    await bucket.put(previewKey, previewSvg, {
      contentType: 'image/svg+xml',
      size: previewSvg.length,
      uploaded: uploadedIso,
    });
  } catch {
    // Non-fatal in case bucket binding is read-only
  }
}

export function buildUpsertStatement(DB, meta, size, uploadedIso, syncIso, extra = {}) {
  const width = Math.max(0, Math.round(Number(extra?.width) || 0));
  const height = Math.max(0, Math.round(Number(extra?.height) || 0));
  const uploader = extra?.uploader ? String(extra.uploader).trim().slice(0, 80) : null;
  const creatorId = extra?.creatorId ? String(extra.creatorId).trim().slice(0, 80) : null;

  return DB.prepare(`
    INSERT INTO images (id, r2_key, bucket, title, category, sub_category, size, uploaded, last_synced, width, height, uploader, creator_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title        = excluded.title,
      category     = excluded.category,
      sub_category = excluded.sub_category,
      size         = excluded.size,
      uploaded     = excluded.uploaded,
      last_synced  = excluded.last_synced,
      width        = CASE WHEN excluded.width > 0 THEN excluded.width ELSE images.width END,
      height       = CASE WHEN excluded.height > 0 THEN excluded.height ELSE images.height END,
      uploader     = COALESCE(NULLIF(excluded.uploader, ''), images.uploader),
      creator_id   = COALESCE(NULLIF(excluded.creator_id, ''), images.creator_id)
  `).bind(
    meta.id,
    meta.r2_key,
    meta.bucket,
    meta.title,
    meta.category,
    meta.sub_category,
    Number(size) || 0,
    uploadedIso,
    syncIso,
    width,
    height,
    uploader,
    creatorId
  );
}

/**
 * Sinkronisasi inkremental R2 → D1 untuk satu bucket:
 * hanya menulis gambar baru/lama yang belum terscan atau berubah ukuran/dimensi kosong,
 * mengekstrak dimensi gambar asli, serta menghapus row yang sudah dihapus dari R2.
 */
export async function syncBucket({ bucket, name, DB }) {
  if (!bucket || !DB) {
    return { bucket: name, scanned: 0, upserted: 0, skipped: 0, removed: 0 };
  }

  const syncStartedAt = new Date().toISOString();

  // Muat index yang sudah ada agar file lama yang tidak berubah tidak menulis ulang ke D1 setiap menit
  const existingMap = new Map();
  let usedExistingMap = false;
  try {
    const existingRes = await DB.prepare(
      'SELECT id, size, uploaded, width, height FROM images WHERE bucket = ?'
    ).bind(name).all();
    if (Array.isArray(existingRes?.results)) {
      usedExistingMap = true;
      for (const row of existingRes.results) {
        existingMap.set(row.id, {
          size:     Number(row.size || 0),
          uploaded: row.uploaded || null,
          width:    Number(row.width || 0),
          height:   Number(row.height || 0),
        });
      }
    }
  } catch {
    usedExistingMap = false;
  }

  let cursor   = undefined;
  let scanned  = 0;
  let upserted = 0;
  let skipped  = 0;
  let pending  = [];
  const seenIds = new Set();

  const flush = async () => {
    if (pending.length === 0) return;
    await DB.batch(pending);
    pending = [];
  };

  do {
    const listResult = await bucket.list({ cursor, limit: 1000 });

    for (const obj of listResult.objects || []) {
      const meta = parseImageMeta(obj.key, name);
      if (!meta) continue;

      scanned++;
      seenIds.add(meta.id);

      const objSize     = Number(obj.size || 0);
      const uploadedIso = obj.uploaded ? new Date(obj.uploaded).toISOString() : null;
      const prev        = existingMap.get(meta.id);

      const needsWrite =
        !prev ||
        prev.size !== objSize ||
        (uploadedIso && prev.uploaded !== uploadedIso);

      if (!needsWrite) {
        skipped++;
        continue;
      }

      let dims = (prev && prev.size === objSize && prev.width > 0 && prev.height > 0)
        ? { width: prev.width, height: prev.height }
        : { width: 0, height: 0 };

      if (dims.width === 0 || dims.height === 0) {
        dims = await detectR2Dimensions(bucket, obj.key);
      }

      if (name === 'dtreasure') {
        await ensureDtreasureWatermarkedPreview(bucket, meta, dims, uploadedIso || syncStartedAt);
      }

      pending.push(buildUpsertStatement(DB, meta, objSize, uploadedIso, syncStartedAt, dims));
      upserted++;

      if (pending.length >= BATCH_CHUNK_SIZE) await flush();
    }

    cursor = listResult.truncated ? listResult.cursor : undefined;
  } while (cursor);

  await flush();

  let removed = 0;
  if (usedExistingMap) {
    const staleIds = [];
    for (const id of existingMap.keys()) {
      if (!seenIds.has(id)) staleIds.push(id);
    }
    for (let i = 0; i < staleIds.length; i += BATCH_CHUNK_SIZE) {
      const chunk = staleIds.slice(i, i + BATCH_CHUNK_SIZE).map((id) =>
        DB.prepare('DELETE FROM images WHERE id = ?').bind(id)
      );
      if (chunk.length > 0) {
        await DB.batch(chunk);
        removed += chunk.length;
      }
    }
  } else {
    const cleanup = await DB.prepare(
      'DELETE FROM images WHERE bucket = ? AND (last_synced IS NULL OR last_synced < ?)'
    ).bind(name, syncStartedAt).run();
    removed = cleanup?.meta?.changes || 0;
  }

  console.log(
    `[Scheduled] Synced ${upserted} new/updated (${skipped} unchanged, ${scanned} total), removed ${removed} stale rows from bucket: ${name}`
  );
  return { bucket: name, scanned, upserted, skipped, removed };
}

// ============================================================
// Scheduled / Full Auto-Scan Handler: R2 → D1 + cleanup rate_limits
// wrangler.toml: [triggers] crons = ["*/15 * * * *"]
// ============================================================
export async function handleScheduled(env) {
  const startedAt = Date.now();
  const DB        = env.DB;
  const stats     = [];

  for (const { bucket, name } of getConfiguredBuckets(env)) {
    if (!bucket) continue;
    try {
      const res = await syncBucket({ bucket, name, DB });
      if ((res?.scanned || 0) > 0) nonEmptyBucketCache.add(name);
      stats.push(res);
    } catch (e) {
      console.error(`[Scheduled] Error syncing bucket ${name}:`, e.message);
      stats.push({ bucket: name, error: e.message });
    }
  }

  // Data retention cleanup: keep ephemeral D1 tables compact (bounded per cron run)
  let retentionCleaned = 0;
  try {
    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    const cutoff7dIso = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();
    const cutoff30dIso = new Date(nowMs - 30 * 24 * 60 * 60 * 1000).toISOString();

    const cleanupRes = await Promise.all([
      DB.prepare('DELETE FROM rate_limits WHERE rowid IN (SELECT rowid FROM rate_limits WHERE reset_time < ? LIMIT 1000)').bind(nowSec).run(),
      DB.prepare('DELETE FROM email_verifications WHERE rowid IN (SELECT rowid FROM email_verifications WHERE expires_at < ? OR (used_at IS NOT NULL AND used_at < ?) LIMIT 1000)').bind(cutoff7dIso, cutoff7dIso).run(),
      DB.prepare('DELETE FROM user_sessions WHERE rowid IN (SELECT rowid FROM user_sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?) LIMIT 1000)').bind(cutoff7dIso, cutoff7dIso).run(),
      DB.prepare('DELETE FROM views WHERE rowid IN (SELECT rowid FROM views WHERE created_at < ? LIMIT 1000)').bind(cutoff30dIso).run(),
      DB.prepare('DELETE FROM downloads WHERE rowid IN (SELECT rowid FROM downloads WHERE created_at < ? LIMIT 1000)').bind(cutoff30dIso).run(),
    ]);
    for (const r of cleanupRes) retentionCleaned += Number(r?.meta?.changes || 0);
  } catch (e) {
    console.error('[Scheduled] Retention cleanup error:', e.message);
  }

  // Periodic automatic D1 wallet/account/ledger snapshot (throttled to every 6 hours)
  try {
    const nowMs = Date.now();
    if (DB && nowMs - lastAutoBackupAt >= AUTO_BACKUP_INTERVAL_MS) {
      const existing = await listBackupSnapshots(DB, 1);
      const latestAt = existing[0]?.created_at ? Date.parse(existing[0].created_at) : 0;
      if (!latestAt || (nowMs - latestAt >= AUTO_BACKUP_INTERVAL_MS)) {
        await createD1Snapshot(env, 'cron-auto');
      }
      lastAutoBackupAt = nowMs;
    }
  } catch (e) {
    console.warn('[Scheduled] Auto-backup skipped:', e.message);
  }

  const durationMs = Date.now() - startedAt;
  const totals = stats.reduce(
    (acc, item) => ({
      scanned: acc.scanned + Number(item?.scanned || 0),
      upserted: acc.upserted + Number(item?.upserted || 0),
      removed: acc.removed + Number(item?.removed || 0),
    }),
    { scanned: 0, upserted: 0, removed: 0 }
  );
  console.log(
    `[Scheduled] Finished in ${durationMs}ms: scanned=${totals.scanned}, upserted=${totals.upserted}, removed=${totals.removed}, retentionCleaned=${retentionCleaned}`
  );

  lastAutoSyncAt = Date.now();
  return stats;
}

// ============================================================
// Zero-delay single-object sync / delete (R2 Event Notifications → Queue)
// ============================================================
export async function syncSingleObject(env, rawBucketName, key, objMeta = null) {
  const target = resolveBucketTarget(rawBucketName, env);
  if (!target || !target.bucket || !env.DB || !key) return { status: 'ignored' };

  const meta = parseImageMeta(key, target.name);
  if (!meta) return { status: 'ignored' };

  let size = objMeta?.size;
  let uploaded = objMeta?.uploaded || objMeta?.eventTime;

  if ((size === undefined || size === null) && typeof target.bucket.head === 'function') {
    const headObj = await target.bucket.head(key);
    if (!headObj) {
      return deleteSingleObject(env, rawBucketName, key);
    }
    size = headObj.size;
    uploaded = headObj.uploaded || uploaded;
  }

  const nowIso      = new Date().toISOString();
  const uploadedIso = uploaded ? new Date(uploaded).toISOString() : nowIso;
  const dims        = await detectR2Dimensions(target.bucket, key);

  if (target.name === 'dtreasure') {
    await ensureDtreasureWatermarkedPreview(target.bucket, meta, dims, uploadedIso);
  }

  await buildUpsertStatement(env.DB, meta, size || 0, uploadedIso, nowIso, dims).run();
  return { status: 'upserted', id: meta.id, width: dims.width, height: dims.height };
}

export async function deleteSingleObject(env, rawBucketName, key) {
  const target = resolveBucketTarget(rawBucketName, env);
  if (!target || !env.DB || !key || key.startsWith('_preview/')) return { status: 'ignored' };

  const id  = `${target.name}:${key}`;
  const res = await env.DB.prepare('DELETE FROM images WHERE id = ?').bind(id).run();
  return { status: 'deleted', id, changes: res?.meta?.changes || 0 };
}

export async function handleR2QueueBatch(batch, env) {
  if (!batch?.messages?.length) return { processed: 0 };

  let processed = 0;
  for (const msg of batch.messages) {
    try {
      const payload = typeof msg.body === 'string' ? JSON.parse(msg.body) : (msg.body || {});
      const action  = String(payload.action || '');
      const bucket  = payload.bucket;
      const key     = payload.object?.key;

      if (!bucket || !key) {
        msg.ack?.();
        continue;
      }

      if (action === 'DeleteObject' || action === 'LifecycleDeletion' || action === 'AbortMultipartUpload') {
        await deleteSingleObject(env, bucket, key);
      } else {
        await syncSingleObject(env, bucket, key, {
          size:      payload.object?.size,
          uploaded:  payload.eventTime,
        });
      }

      msg.ack?.();
      processed++;
    } catch (e) {
      console.error('[R2Queue] Failed processing message:', e.message);
      msg.retry?.();
    }
  }

  return { processed };
}

// ============================================================
// Bootstrap sync saat request masuk:
// - Hanya jika bucket target di D1 masih kosong, jalankan sync single-bucket (sekali saja).
// - Sync periodik berjalan di handler scheduled() (*/15 * * * *), tidak di traffic user biasa.
// ============================================================
export async function ensureAutoSync({ env, DB, bucketName = 'main' } = {}) {
  if (!env || !DB) return;
  if (nonEmptyBucketCache.has(bucketName)) return;

  let hasAnyRow = false;
  try {
    const row = await DB.prepare(
      'SELECT 1 AS present FROM images WHERE bucket = ? LIMIT 1'
    ).bind(bucketName).first();
    hasAnyRow = Boolean(row);
  } catch {
    hasAnyRow = false;
  }

  if (hasAnyRow) {
    nonEmptyBucketCache.add(bucketName);
    return;
  }

  if (!activeSyncPromise) {
    const target = getConfiguredBuckets(env).find((b) => b.name === bucketName);
    if (target?.bucket) {
      activeSyncPromise = syncBucket({ bucket: target.bucket, name: target.name, DB })
        .then((res) => {
          if ((res?.scanned || 0) > 0) nonEmptyBucketCache.add(bucketName);
        })
        .finally(() => {
          activeSyncPromise = null;
        });
    } else {
      activeSyncPromise = handleScheduled(env).finally(() => {
        activeSyncPromise = null;
      });
    }
  }
  await activeSyncPromise;
}
