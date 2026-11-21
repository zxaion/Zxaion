import { ensureAutoSync } from '../services/r2Sync.js';
import { matchEdgeCache, storeEdgeCache } from '../utils/edgeCache.js';

function buildVersionedImagePath(prefix, r2Key, row) {
  const base = `${prefix}${encodeURIComponent(r2Key)}`;
  const verSource = row.uploaded || row.size;
  if (!verSource) return base;
  const ver = String(row.uploaded ? Date.parse(row.uploaded) || row.uploaded : row.size);
  return `${base}?v=${encodeURIComponent(ver)}`;
}

// ================================================================
// ENDPOINT: List main gallery (supports category, subCategory, q search, pagination)
// ================================================================
export async function handleListMain({ request, url, env, ctx, DB, corsHeaders }) {
  try {
    if (request) {
      const cached = await matchEdgeCache(request);
      if (cached) return cached;
    }
    if (env) await ensureAutoSync({ env, ctx, DB, bucketName: 'main' });
    const rawPage     = parseInt(url.searchParams.get('page')  ?? '1',  10);
    const rawLimit    = parseInt(url.searchParams.get('limit') ?? '500', 10);
    const page        = Math.max(1,   Number.isFinite(rawPage)  ? rawPage  : 1);
    const limit       = Math.min(500, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 500));
    const offset      = (page - 1) * limit;
    const category    = (url.searchParams.get('category') || '').trim() || null;
    const subCategory = (url.searchParams.get('subCategory') || '').trim() || null;
    const searchQuery = (url.searchParams.get('q') || '').trim() || null;

    const conditions = ["bucket = 'main'"];
    const bindings   = [];

    if (category && category.toLowerCase() !== 'all') {
      conditions.push('LOWER(category) = LOWER(?)');
      bindings.push(category);
    } else {
      conditions.push("category != 'Header'");
    }

    if (subCategory) {
      conditions.push('LOWER(sub_category) = LOWER(?)');
      bindings.push(subCategory);
    }

    if (searchQuery) {
      const pattern = `%${searchQuery.toLowerCase()}%`;
      conditions.push('(LOWER(title) LIKE ? OR LOWER(category) LIKE ? OR LOWER(COALESCE(sub_category, \'\')) LIKE ?)');
      bindings.push(pattern, pattern, pattern);
    }

    const whereClause = conditions.join(' AND ');
    const query       = `SELECT * FROM images WHERE ${whereClause} ORDER BY uploaded DESC, id DESC LIMIT ? OFFSET ?`;
    const countQuery  = `SELECT COUNT(*) AS total FROM images WHERE ${whereClause}`;

    const [{ results }, countRow] = await Promise.all([
      DB.prepare(query).bind(...bindings, limit, offset).all(),
      DB.prepare(countQuery).bind(...bindings).first(),
    ]);

    const photos = results.map(row => ({
      id:            row.id,
      title:         row.title,
      category:      row.category,
      subCategory:   row.sub_category,
      url:           buildVersionedImagePath('/api/img/', row.r2_key, row),
      size:          row.size,
      uploaded:      row.uploaded,
      path:          row.r2_key,
      viewCount:     row.view_count     || 0,
      downloadCount: row.download_count || 0,
    }));

    const res = new Response(JSON.stringify(photos), {
      headers: {
        ...corsHeaders,
        'Content-Type':  'application/json',
        'Cache-Control': 'public, max-age=60',
        'X-Total-Count': String(countRow?.total ?? photos.length),
      },
    });
    if (request) storeEdgeCache(request, res, ctx);
    return res;
  } catch (e) {
    console.error('/api/list error:', e.message);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// ================================================================
// ENDPOINT: Anime sub-albums summary
// ================================================================
export async function handleAnimeAlbums({ request, env, ctx, DB, corsHeaders }) {
  try {
    if (request) {
      const cached = await matchEdgeCache(request);
      if (cached) return cached;
    }
    if (env) await ensureAutoSync({ env, ctx, DB, bucketName: 'main' });
    const { results } = await DB.prepare(
      `SELECT sub_category, COUNT(*) AS count
       FROM images
       WHERE bucket = 'main' AND LOWER(category) = 'anime' AND sub_category IS NOT NULL
       GROUP BY sub_category
       ORDER BY sub_category ASC`
    ).all();

    const res = new Response(JSON.stringify(results), {
      headers: {
        ...corsHeaders,
        'Content-Type':  'application/json',
        'Cache-Control': 'public, max-age=120',
      },
    });
    if (request) storeEdgeCache(request, res, ctx);
    return res;
  } catch (e) {
    console.error('/api/anime/albums error:', e.message);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// ================================================================
// ENDPOINT: COMITBASE list
// ================================================================
export async function handleListComitbase({ request, url, env, ctx, comitbaseBucket, DB, corsHeaders }) {
  if (!comitbaseBucket) return new Response('[]', {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
  try {
    if (request) {
      const cached = await matchEdgeCache(request);
      if (cached) return cached;
    }
    if (env) await ensureAutoSync({ env, ctx, DB, bucketName: 'comitbase' });
    const rawPage     = parseInt(url.searchParams.get('page')  ?? '1',   10);
    const rawLimit    = parseInt(url.searchParams.get('limit') ?? '500', 10);
    const page        = Math.max(1,   Number.isFinite(rawPage)  ? rawPage  : 1);
    const limit       = Math.min(500, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 500));
    const offset      = (page - 1) * limit;
    const searchQuery = (url.searchParams.get('q') || '').trim() || null;

    const conditions = ["bucket = 'comitbase'"];
    const bindings   = [];
    if (searchQuery) {
      conditions.push('LOWER(title) LIKE ?');
      bindings.push(`%${searchQuery.toLowerCase()}%`);
    }

    const { results } = await DB.prepare(
      `SELECT id, title, r2_key, size, uploaded, view_count, download_count
       FROM images WHERE ${conditions.join(' AND ')}
       ORDER BY uploaded DESC, id DESC LIMIT ? OFFSET ?`
    ).bind(...bindings, limit, offset).all();

    const photos = results.map(row => ({
      id:            row.id,
      title:         row.title,
      uploader:      'Community',
      url:           buildVersionedImagePath('/api/comitbase/img/', row.r2_key, row),
      uploaded:      row.uploaded,
      viewCount:     row.view_count     || 0,
      downloadCount: row.download_count || 0,
    }));

    const res = new Response(JSON.stringify(photos), {
      headers: {
        ...corsHeaders,
        'Content-Type':  'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    });
    if (request) storeEdgeCache(request, res, ctx);
    return res;
  } catch (e) {
    console.error('/api/comitbase/list error:', e.message);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// ================================================================
// ENDPOINT: DTREASURE list
// ================================================================
export async function handleListDtreasure({ url, env, ctx, treasureBucket, DB, corsHeaders }) {
  if (!treasureBucket) return new Response('[]', {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
  try {
    if (env) await ensureAutoSync({ env, ctx, DB, bucketName: 'dtreasure' });
    const rawPage     = parseInt(url.searchParams.get('page')  ?? '1',   10);
    const rawLimit    = parseInt(url.searchParams.get('limit') ?? '500', 10);
    const page        = Math.max(1,   Number.isFinite(rawPage)  ? rawPage  : 1);
    const limit       = Math.min(500, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 500));
    const offset      = (page - 1) * limit;
    const searchQuery = (url.searchParams.get('q') || '').trim() || null;

    const conditions = ["bucket = 'dtreasure'"];
    const bindings   = [];
    if (searchQuery) {
      conditions.push('LOWER(title) LIKE ?');
      bindings.push(`%${searchQuery.toLowerCase()}%`);
    }

    const { results } = await DB.prepare(
      `SELECT id, title, r2_key, uploaded, view_count, download_count
       FROM images WHERE ${conditions.join(' AND ')}
       ORDER BY uploaded DESC, id DESC LIMIT ? OFFSET ?`
    ).bind(...bindings, limit, offset).all();

    const photos = results.map(row => ({
      id:            row.id,
      title:         row.title,
      category:      'DTREASURE',
      url:           `/api/dtreasure/img/${encodeURIComponent(row.r2_key)}`,
      uploaded:      row.uploaded,
      viewCount:     row.view_count     || 0,
      downloadCount: row.download_count || 0,
    }));

    return new Response(JSON.stringify(photos), {
      headers: {
        ...corsHeaders,
        'Content-Type':  'application/json',
        'Cache-Control': 'private, max-age=30',
      },
    });
  } catch (e) {
    console.error('/api/dtreasure/list error:', e.message);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// ================================================================
// ENDPOINT: Top trending images
// ================================================================
export async function handleTrending({ request, url, env, ctx, DB, corsHeaders }) {
  const rawLimit = parseInt(url.searchParams.get('limit') ?? '20', 10);
  const limit    = Math.min(50, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 20));

  try {
    if (request) {
      const cached = await matchEdgeCache(request);
      if (cached) return cached;
    }
    if (env) await ensureAutoSync({ env, ctx, DB, bucketName: 'main' });
    const { results } = await DB.prepare(`
      SELECT id, title, r2_key, bucket, category, sub_category, size, uploaded,
             view_count, download_count,
             (COALESCE(view_count, 0) + COALESCE(download_count, 0)) AS score
      FROM images
      WHERE bucket = 'main'
        AND category != 'Header'
      ORDER BY score DESC, uploaded DESC, id DESC
      LIMIT ?
    `).bind(limit).all();

    const photos = results.map(row => ({
      id:            row.id,
      title:         row.title,
      category:      row.category,
      subCategory:   row.sub_category,
      url:           buildVersionedImagePath('/api/img/', row.r2_key, row),
      viewCount:     row.view_count     || 0,
      downloadCount: row.download_count || 0,
      score:         row.score          || 0,
    }));

    const res = new Response(JSON.stringify(photos), {
      headers: {
        ...corsHeaders,
        'Content-Type':  'application/json',
        'Cache-Control': 'public, max-age=120',
      },
    });
    if (request) storeEdgeCache(request, res, ctx);
    return res;
  } catch (e) {
    console.error('/api/trending error:', e.message);
    return new Response(JSON.stringify([]), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
