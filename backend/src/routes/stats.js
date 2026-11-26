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

// ================================================================
// ENDPOINT: Image stats
// ================================================================
export async function handleStats({ path, DB, corsHeaders }) {
  const photoId = extractPhotoId(path, '/api/stats/');
  if (!photoId) {
    return jsonResponse({ error: 'Invalid photo ID' }, 400, corsHeaders);
  }
  try {
    const row = await DB.prepare(
      'SELECT view_count, download_count FROM images WHERE id = ?'
    ).bind(photoId).first();

    return jsonResponse({
      views:     row?.view_count     || 0,
      downloads: row?.download_count || 0,
    }, 200, corsHeaders);
  } catch (e) {
    console.error('/api/stats error:', e.message);
    return jsonResponse({ views: 0, downloads: 0 }, 200, corsHeaders);
  }
}

function resolveStatsActor(request, getUserToken) {
  const ip     = (request.headers.get('CF-Connecting-IP') || '').trim();
  const userId = getUserToken(request);
  const rateLimitKey = ip || userId || 'anonymous';
  const dedupActor   = ip ? `ip:${ip}` : (userId !== 'anonymous' ? userId : 'anonymous');
  return { rateLimitKey, dedupActor };
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
