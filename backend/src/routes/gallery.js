import { ensureAutoSync } from '../services/r2Sync.js';
import { matchEdgeCache, storeEdgeCache } from '../utils/edgeCache.js';

function buildVersionedImagePath(prefix, r2Key, row) {
  const base = `${prefix}${encodeURIComponent(r2Key)}`;
  const verSource = row.uploaded || row.size;
  if (!verSource) return base;
  const ver = String(row.uploaded ? Date.parse(row.uploaded) || row.uploaded : row.size);
  return `${base}?v=${encodeURIComponent(ver)}`;
}

function buildFtsMatchQuery(rawSearch) {
  const tokens = String(rawSearch || '')
    .trim()
    .split(/\s+/)
    .map(tok => tok.replace(/["'*()^:]/g, '').trim())
    .filter(tok => tok.length >= 2);
  if (tokens.length === 0) return null;
  return tokens.map(tok => `"${tok}"*`).join(' AND ');
}

async function queryImagesWithSearch({ DB, baseConditions, baseBindings, searchQuery, searchColumns, orderBy, limit, offset }) {
  if (searchQuery) {
    const ftsQuery = buildFtsMatchQuery(searchQuery);
    if (ftsQuery) {
      try {
        const ftsConditions = [...baseConditions, 'images.rowid IN (SELECT rowid FROM images_fts WHERE images_fts MATCH ?)'];
        const ftsBindings = [...baseBindings, ftsQuery];
        const ftsWhere = ftsConditions.join(' AND ');
        const [{ results }, countRow] = await Promise.all([
          DB.prepare(`SELECT * FROM images WHERE ${ftsWhere} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
            .bind(...ftsBindings, limit, offset)
            .all(),
          DB.prepare(`SELECT COUNT(*) AS total FROM images WHERE ${ftsWhere}`)
            .bind(...ftsBindings)
            .first(),
        ]);
        return { results: results || [], total: Number(countRow?.total ?? 0) };
      } catch {
        // Fallback cleanly to LIKE if images_fts is not initialized in an existing DB/MockD1
      }
    }
  }

  const conditions = [...baseConditions];
  const bindings = [...baseBindings];
  if (searchQuery) {
    const pattern = `%${searchQuery.toLowerCase()}%`;
    conditions.push(`(${searchColumns.join(' OR ')})`);
    for (let i = 0; i < searchColumns.length; i++) {
      bindings.push(pattern);
    }
  }

  const whereClause = conditions.join(' AND ');
  const [{ results }, countRow] = await Promise.all([
    DB.prepare(`SELECT * FROM images WHERE ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
      .bind(...bindings, limit, offset)
      .all(),
    DB.prepare(`SELECT COUNT(*) AS total FROM images WHERE ${whereClause}`)
      .bind(...bindings)
      .first(),
  ]);
  return { results: results || [], total: Number(countRow?.total ?? 0) };
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

    const { results, total } = await queryImagesWithSearch({
      DB,
      baseConditions: conditions,
      baseBindings: bindings,
      searchQuery,
      searchColumns: ['LOWER(title) LIKE ?', 'LOWER(category) LIKE ?', "LOWER(COALESCE(sub_category, '')) LIKE ?"],
      orderBy: 'uploaded DESC, id DESC',
      limit,
      offset,
    });

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
        'X-Total-Count': String(total ?? photos.length),
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
      `SELECT sub_category, COUNT(*) AS count, MIN(r2_key) AS sample_key
       FROM images
       WHERE bucket = 'main' AND LOWER(category) = 'anime' AND sub_category IS NOT NULL
       GROUP BY sub_category
       ORDER BY sub_category ASC`
    ).all();

    const albums = (results || []).map(row => ({
      sub_category: row.sub_category,
      count:        Number(row.count || 0),
      sample_url:   row.sample_key ? `/api/img/${encodeURIComponent(row.sample_key)}` : null,
    }));

    const res = new Response(JSON.stringify(albums), {
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

    const { results, total } = await queryImagesWithSearch({
      DB,
      baseConditions: ["bucket = 'comitbase'"],
      baseBindings: [],
      searchQuery,
      searchColumns: ['LOWER(title) LIKE ?'],
      orderBy: 'uploaded DESC, id DESC',
      limit,
      offset,
    });

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
        'X-Total-Count': String(total ?? photos.length),
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

    const { results, total } = await queryImagesWithSearch({
      DB,
      baseConditions: ["bucket = 'dtreasure'"],
      baseBindings: [],
      searchQuery,
      searchColumns: ['LOWER(title) LIKE ?'],
      orderBy: 'uploaded DESC, id DESC',
      limit,
      offset,
    });

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
        'X-Total-Count': String(total ?? photos.length),
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
