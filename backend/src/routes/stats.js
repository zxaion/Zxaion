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
// ENDPOINT: Image stats (views, downloads, loves, fires, loved, fired)
// ================================================================
export async function handleStats({ request, path, DB, corsHeaders, getUserToken }) {
  const photoId = extractPhotoId(path, '/api/stats/');
  if (!photoId) {
    return jsonResponse({ error: 'Invalid photo ID' }, 400, corsHeaders);
  }
  try {
    const row = await DB.prepare(
      'SELECT view_count, download_count, love_count, fire_count FROM images WHERE id = ?'
    ).bind(photoId).first();

    let loved = false;
    let fired = false;
    if (request) {
      const { dedupActor } = resolveStatsActor(request, getUserToken);
      if (dedupActor && dedupActor !== 'anonymous') {
        const rxRes = await DB.prepare(
          'SELECT reaction_type FROM reactions WHERE photo_id = ? AND user_id = ?'
        ).bind(photoId, dedupActor).all();
        const types = new Set((rxRes?.results || []).map((r) => r.reaction_type || 'love'));
        loved = types.has('love');
        fired = types.has('fire');
      }
    }

    return jsonResponse({
      views:     row?.view_count     || 0,
      downloads: row?.download_count || 0,
      loves:     row?.love_count     || 0,
      fires:     row?.fire_count     || 0,
      loved,
      fired,
    }, 200, corsHeaders);
  } catch (e) {
    console.error('/api/stats error:', e.message);
    return jsonResponse({ views: 0, downloads: 0, loves: 0, fires: 0, loved: false, fired: false }, 200, corsHeaders);
  }
}

// ================================================================
// ENDPOINT: Toggle Love or Fire reaction (POST /api/react/:id)
// ================================================================
export async function handleToggleReaction({ request, path, url, DB, corsHeaders, getUserToken, checkRateLimit }) {
  const photoId = extractPhotoId(path, '/api/react/');
  if (!photoId) {
    return jsonResponse({ success: false, error: 'Invalid photo ID' }, 400, corsHeaders);
  }

  let requestedType = '';
  try {
    requestedType = url?.searchParams?.get('type') || '';
    if (!requestedType && request.headers.get('Content-Type')?.includes('application/json')) {
      const body = await request.clone().json().catch(() => null);
      if (body?.type) requestedType = String(body.type);
    }
  } catch {}
  const reactionType = (requestedType || 'love').trim().toLowerCase();
  if (reactionType !== 'love' && reactionType !== 'fire') {
    return jsonResponse({ success: false, error: 'Reaction type must be love or fire' }, 400, corsHeaders);
  }

  const { rateLimitKey, dedupActor } = resolveStatsActor(request, getUserToken);
  if (typeof checkRateLimit === 'function' && !await checkRateLimit('react', rateLimitKey, 120, 3600)) {
    return jsonResponse({ success: false, error: 'Rate limit exceeded' }, 429, corsHeaders);
  }

  try {
    const imageRow = await DB.prepare(
      'SELECT view_count, download_count, love_count, fire_count FROM images WHERE id = ?'
    ).bind(photoId).first();
    if (!imageRow) {
      return jsonResponse({ success: false, error: 'Image not found' }, 404, corsHeaders);
    }

    const countCol = reactionType === 'fire' ? 'fire_count' : 'love_count';
    const existing = await DB.prepare(
      'SELECT 1 FROM reactions WHERE photo_id = ? AND user_id = ? AND reaction_type = ?'
    ).bind(photoId, dedupActor, reactionType).first();

    if (existing) {
      await DB.batch([
        DB.prepare('DELETE FROM reactions WHERE photo_id = ? AND user_id = ? AND reaction_type = ?')
          .bind(photoId, dedupActor, reactionType),
        DB.prepare(`UPDATE images SET ${countCol} = MAX(0, COALESCE(${countCol}, 0) - 1) WHERE id = ?`)
          .bind(photoId),
      ]);
    } else {
      await DB.batch([
        DB.prepare('INSERT OR IGNORE INTO reactions (photo_id, user_id, reaction_type, created_at) VALUES (?, ?, ?, ?)')
          .bind(photoId, dedupActor, reactionType, new Date().toISOString()),
        DB.prepare(`UPDATE images SET ${countCol} = COALESCE(${countCol}, 0) + 1 WHERE id = ?`)
          .bind(photoId),
      ]);
    }

    const updated = await DB.prepare(
      'SELECT view_count, download_count, love_count, fire_count FROM images WHERE id = ?'
    ).bind(photoId).first();
    const rxRes = await DB.prepare(
      'SELECT reaction_type FROM reactions WHERE photo_id = ? AND user_id = ?'
    ).bind(photoId, dedupActor).all();
    const activeTypes = new Set((rxRes?.results || []).map((r) => r.reaction_type || 'love'));

    return jsonResponse({
      success: true,
      type:    reactionType,
      loved:   activeTypes.has('love'),
      fired:   activeTypes.has('fire'),
      loves:   updated?.love_count || 0,
      fires:   updated?.fire_count || 0,
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
