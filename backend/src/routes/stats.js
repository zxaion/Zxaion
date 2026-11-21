function extractPhotoId(path, prefix) {
  if (!path.startsWith(prefix)) return null;
  const raw = path.slice(prefix.length);
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    return decoded || null;
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

function resolveStatsActor(request, getUserToken) {
  const ip     = (request.headers.get('CF-Connecting-IP') || '').trim();
  const userId = getUserToken(request);
  const rateLimitKey = ip || userId || 'anonymous';
  const dedupActor   = ip ? `ip:${ip}` : (userId !== 'anonymous' ? userId : 'anonymous');
  return { rateLimitKey, dedupActor };
}

// ================================================================
// ENDPOINT: Record unique view per actor/IP
// ================================================================
export async function handleRecordView({ request, ctx, path, DB, corsHeaders, getUserToken, checkRateLimit }) {
  const photoId = extractPhotoId(path, '/api/view/');
  if (!photoId) {
    return new Response(null, { status: 400, headers: corsHeaders });
  }
  const { rateLimitKey, dedupActor } = resolveStatsActor(request, getUserToken);

  if (!await checkRateLimit('view', rateLimitKey, 100, 3600)) {
    return new Response(null, { status: 429, headers: corsHeaders });
  }

  ctx.waitUntil((async () => {
    try {
      const inserted = await DB.prepare(
        'INSERT OR IGNORE INTO views (photo_id, user_id) VALUES (?, ?)'
      ).bind(photoId, dedupActor).run();

      if (inserted?.meta?.changes > 0) {
        await DB.prepare(
          'UPDATE images SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?'
        ).bind(photoId).run();
      }
    } catch (e) {
      console.error('[view] DB error:', e.message);
    }
  })());

  return new Response(null, { status: 204, headers: corsHeaders });
}

// ================================================================
// ENDPOINT: Record unique download per actor/IP
// ================================================================
export async function handleRecordDownload({ request, ctx, path, DB, corsHeaders, getUserToken, checkRateLimit }) {
  const photoId = extractPhotoId(path, '/api/download/');
  if (!photoId) {
    return new Response(null, { status: 400, headers: corsHeaders });
  }
  const { rateLimitKey, dedupActor } = resolveStatsActor(request, getUserToken);

  if (!await checkRateLimit('download', rateLimitKey, 50, 3600)) {
    return new Response(null, { status: 429, headers: corsHeaders });
  }

  ctx.waitUntil((async () => {
    try {
      const inserted = await DB.prepare(
        'INSERT OR IGNORE INTO downloads (photo_id, user_id) VALUES (?, ?)'
      ).bind(photoId, dedupActor).run();

      if (inserted?.meta?.changes > 0) {
        await DB.prepare(
          'UPDATE images SET download_count = COALESCE(download_count, 0) + 1 WHERE id = ?'
        ).bind(photoId).run();
      }
    } catch (e) {
      console.error('[download] DB error:', e.message);
    }
  })());

  return new Response(null, { status: 204, headers: corsHeaders });
}
