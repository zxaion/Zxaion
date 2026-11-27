import { jsonResponse } from '../utils/cors.js';

function extractPhotoId(path, prefix) {
  if (!path.startsWith(prefix)) return null;
  const raw = path.slice(prefix.length);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw) || null;
  } catch {
    return null;
  }
}

function resolveStatsActor(request, getUserToken) {
  const ip     = (request?.headers?.get('CF-Connecting-IP') || '').trim();
  const userId = typeof getUserToken === 'function' ? getUserToken(request) : 'anonymous';
  const rateLimitKey = ip || userId || 'anonymous';
  const dedupActor   = ip ? `ip:${ip}` : (userId !== 'anonymous' ? userId : 'anonymous');
  return { rateLimitKey, dedupActor };
}

// ================================================================
// ENDPOINT: Image stats (views, downloads, loves, loved)
// ================================================================
export async function handleStats({ request, path, DB, corsHeaders, getUserToken }) {
  const photoId = extractPhotoId(path, '/api/stats/');
  if (!photoId) {
    return jsonResponse({ error: 'Invalid photo ID' }, 400, corsHeaders);
  }
  try {
    const row = await DB.prepare(
      'SELECT view_count, download_count, love_count FROM images WHERE id = ?'
    ).bind(photoId).first();

    let loved = false;
    if (request) {
      const { dedupActor } = resolveStatsActor(request, getUserToken);
      if (dedupActor && dedupActor !== 'anonymous') {
        const rx = await DB.prepare(
          'SELECT 1 FROM reactions WHERE photo_id = ? AND user_id = ?'
        ).bind(photoId, dedupActor).first();
        loved = !!rx;
      }
    }

    return jsonResponse({
      views:     row?.view_count     || 0,
      downloads: row?.download_count || 0,
      loves:     row?.love_count     || 0,
      loved,
    }, 200, corsHeaders);
  } catch (e) {
    console.error('/api/stats error:', e.message);
    return jsonResponse({ views: 0, downloads: 0, loves: 0, loved: false }, 200, corsHeaders);
  }
}

// ================================================================
// ENDPOINT: Toggle Love reaction (POST /api/react/:id)
// ================================================================
export async function handleToggleReaction({ request, path, DB, corsHeaders, getUserToken, checkRateLimit }) {
  const photoId = extractPhotoId(path, '/api/react/');
  if (!photoId) {
    return jsonResponse({ success: false, error: 'Invalid photo ID' }, 400, corsHeaders);
  }

  const { rateLimitKey, dedupActor } = resolveStatsActor(request, getUserToken);
  if (typeof checkRateLimit === 'function' && !await checkRateLimit('react', rateLimitKey, 120, 3600)) {
    return jsonResponse({ success: false, error: 'Rate limit exceeded' }, 429, corsHeaders);
  }

  try {
    const imageRow = await DB.prepare(
      'SELECT view_count, download_count, love_count FROM images WHERE id = ?'
    ).bind(photoId).first();
    if (!imageRow) {
      return jsonResponse({ success: false, error: 'Image not found' }, 404, corsHeaders);
    }

    const existing = await DB.prepare(
      'SELECT 1 FROM reactions WHERE photo_id = ? AND user_id = ?'
    ).bind(photoId, dedupActor).first();

    let loved;
    if (existing) {
      await DB.batch([
        DB.prepare('DELETE FROM reactions WHERE photo_id = ? AND user_id = ?').bind(photoId, dedupActor),
        DB.prepare('UPDATE images SET love_count = MAX(0, COALESCE(love_count, 0) - 1) WHERE id = ?').bind(photoId),
      ]);
      loved = false;
    } else {
      await DB.batch([
        DB.prepare('INSERT OR IGNORE INTO reactions (photo_id, user_id, created_at) VALUES (?, ?, ?)').bind(photoId, dedupActor, new Date().toISOString()),
        DB.prepare('UPDATE images SET love_count = COALESCE(love_count, 0) + 1 WHERE id = ?').bind(photoId),
      ]);
      loved = true;
    }

    const updated = await DB.prepare(
      'SELECT view_count, download_count, love_count FROM images WHERE id = ?'
    ).bind(photoId).first();

    return jsonResponse({
      success: true,
      loved,
      loves: updated?.love_count || 0,
    }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
  } catch (e) {
    console.error('/api/react error:', e.message);
    return jsonResponse({ success: false, error: 'Failed to toggle reaction' }, 500, corsHeaders);
  }
}

async function handleRecordEngagement({
  kind,
  prefix,
  rateLimitMax,
  tableName,
  countColumn,
  request,
  ctx,
  path,
  DB,
  corsHeaders,
  getUserToken,
  checkRateLimit,
}) {
  const photoId = extractPhotoId(path, prefix);
  if (!photoId) {
    return new Response(null, { status: 400, headers: corsHeaders });
  }
  const { rateLimitKey, dedupActor } = resolveStatsActor(request, getUserToken);

  if (!await checkRateLimit(kind, rateLimitKey, rateLimitMax, 3600)) {
    return new Response(null, { status: 429, headers: corsHeaders });
  }

  ctx.waitUntil((async () => {
    try {
      const inserted = await DB.prepare(
        `INSERT OR IGNORE INTO ${tableName} (photo_id, user_id) VALUES (?, ?)`
      ).bind(photoId, dedupActor).run();

      if (inserted?.meta?.changes > 0) {
        await DB.prepare(
          `UPDATE images SET ${countColumn} = COALESCE(${countColumn}, 0) + 1 WHERE id = ?`
        ).bind(photoId).run();
      }
    } catch (e) {
      console.error(`[${kind}] DB error:`, e.message);
    }
  })());

  return new Response(null, { status: 204, headers: corsHeaders });
}

// ================================================================
// ENDPOINT: Record unique view per actor/IP
// ================================================================
export function handleRecordView(args) {
  return handleRecordEngagement({
    ...args,
    kind: 'view',
    prefix: '/api/view/',
    rateLimitMax: 100,
    tableName: 'views',
    countColumn: 'view_count',
  });
}

// ================================================================
// ENDPOINT: Record unique download per actor/IP
// ================================================================
export function handleRecordDownload(args) {
  return handleRecordEngagement({
    ...args,
    kind: 'download',
    prefix: '/api/download/',
    rateLimitMax: 50,
    tableName: 'downloads',
    countColumn: 'download_count',
  });
}
