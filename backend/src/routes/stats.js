// backend/src/routes/stats.js
// Route: statistik, view, dan download
import { getUserToken } from '../lib/request.js';
import { checkRateLimit } from '../middleware/rateLimit.js';

/** GET /api/stats/:id */
export async function handleStats(c) {
  const { path, DB } = c;
  const rawSegment = path.split('/').filter(Boolean).pop() || '';
  const photoId    = decodeURIComponent(rawSegment);
  if (!photoId) {
    return new Response(JSON.stringify({ error: 'Invalid photo ID' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  try {
    const row = await DB.prepare(
      'SELECT view_count, download_count FROM images WHERE id = ?'
    ).bind(photoId).first();

    return new Response(JSON.stringify({
      views:     row?.view_count     || 0,
      downloads: row?.download_count || 0,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('/api/stats error:', e.message);
    return new Response(JSON.stringify({ views: 0, downloads: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

/** POST /api/view/:id */
export async function handleView(c) {
  const { request, ctx, path, corsHeaders, DB } = c;
  const rawSegment = path.split('/').filter(Boolean).pop() || '';
  const photoId    = decodeURIComponent(rawSegment);
  if (!photoId) {
    return new Response(null, { status: 400, headers: corsHeaders });
  }
  const userId = getUserToken(request);
  if (!await checkRateLimit(DB, 'view', userId, 100, 3600)) {
    return new Response(null, { status: 429, headers: corsHeaders });
  }

  ctx.waitUntil(
    DB.batch([
      DB.prepare(
        'UPDATE images SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?'
      ).bind(photoId),
      DB.prepare(
        'INSERT OR IGNORE INTO views (photo_id, user_id) VALUES (?, ?)'
      ).bind(photoId, userId),
    ]).catch(e => console.error('[view] DB batch error:', e.message))
  );

  return new Response(null, { status: 204, headers: corsHeaders });
}

/** POST /api/download/:id */
export async function handleDownload(c) {
  const { request, ctx, path, corsHeaders, DB } = c;
  const rawSegment = path.split('/').filter(Boolean).pop() || '';
  const photoId    = decodeURIComponent(rawSegment);
  if (!photoId) {
    return new Response(null, { status: 400, headers: corsHeaders });
  }
  const userId = getUserToken(request);
  if (!await checkRateLimit(DB, 'download', userId, 50, 3600)) {
    return new Response(null, { status: 429, headers: corsHeaders });
  }

  ctx.waitUntil(
    DB.batch([
      DB.prepare(
        'UPDATE images SET download_count = COALESCE(download_count, 0) + 1 WHERE id = ?'
      ).bind(photoId),
      DB.prepare(
        'INSERT OR IGNORE INTO downloads (photo_id, user_id) VALUES (?, ?)'
      ).bind(photoId, userId),
    ]).catch(e => console.error('[download] DB batch error:', e.message))
  );

  return new Response(null, { status: 204, headers: corsHeaders });
}
