import { ensureAutoSync } from '../services/r2Sync.js';
import { matchEdgeCache, storeEdgeCache } from '../utils/edgeCache.js';
import { jsonResponse } from '../utils/cors.js';

function buildVersionedImagePath(prefix, r2Key, row) {
  const base = `${prefix}${encodeURIComponent(r2Key)}`;
  const verSource = row.uploaded || row.size;
  if (!verSource) return base;
  const ver = String(row.uploaded ? Date.parse(row.uploaded) || row.uploaded : row.size);
  return `${base}?v=${encodeURIComponent(ver)}`;
}

function parseGalleryQuery(url, { defaultLimit = 500, maxLimit = 500 } = {}) {
  const rawPage  = parseInt(url.searchParams.get('page')  ?? '1', 10);
  const rawLimit = parseInt(url.searchParams.get('limit') ?? String(defaultLimit), 10);
  const page     = Math.max(1, Number.isFinite(rawPage) ? rawPage : 1);
  const limit    = Math.min(maxLimit, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : defaultLimit));
  return {
    page,
    limit,
    offset:      (page - 1) * limit,
    searchQuery: (url.searchParams.get('q') || '').trim() || null,
  };
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

function sendCachedJson({ payload, cacheControl, totalCount, corsHeaders, request, ctx }) {
  const extraHeaders = { 'Cache-Control': cacheControl };
  if (totalCount !== undefined) extraHeaders['X-Total-Count'] = String(totalCount);
  const res = jsonResponse(payload, 200, corsHeaders, extraHeaders);
  if (request) storeEdgeCache(request, res, ctx);
  return res;
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
    const { limit, offset, searchQuery } = parseGalleryQuery(url);
    const category    = (url.searchParams.get('category') || '').trim() || null;
    const subCategory = (url.searchParams.get('subCategory') || '').trim() || null;

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

    return sendCachedJson({
      payload: photos,
      cacheControl: 'public, max-age=60',
      totalCount: total ?? photos.length,
      corsHeaders,
      request,
      ctx,
    });
  } catch (e) {
    console.error('/api/list error:', e.message);
    return jsonResponse({ error: 'Internal server error' }, 500, corsHeaders);
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

    return sendCachedJson({
      payload: albums,
      cacheControl: 'public, max-age=120',
      corsHeaders,
      request,
      ctx,
    });
  } catch (e) {
    console.error('/api/anime/albums error:', e.message);
    return jsonResponse({ error: 'Internal server error' }, 500, corsHeaders);
  }
}

// ================================================================
// ENDPOINT: COMITBASE list
// ================================================================
export async function handleListComitbase({ request, url, env, ctx, comitbaseBucket, DB, corsHeaders }) {
  if (!comitbaseBucket) return jsonResponse([], 200, corsHeaders);
  try {
    if (request) {
      const cached = await matchEdgeCache(request);
      if (cached) return cached;
    }
    if (env) await ensureAutoSync({ env, ctx, DB, bucketName: 'comitbase' });
    const { limit, offset, searchQuery } = parseGalleryQuery(url);

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

    return sendCachedJson({
      payload: photos,
      cacheControl: 'public, max-age=60',
      totalCount: total ?? photos.length,
      corsHeaders,
      request,
      ctx,
    });
  } catch (e) {
    console.error('/api/comitbase/list error:', e.message);
    return jsonResponse({ error: 'Internal server error' }, 500, corsHeaders);
  }
}

// ================================================================
// ENDPOINT: DTREASURE list
// ================================================================
export async function handleListDtreasure({ url, env, ctx, treasureBucket, DB, corsHeaders }) {
  if (!treasureBucket) return jsonResponse([], 200, corsHeaders);
  try {
    if (env) await ensureAutoSync({ env, ctx, DB, bucketName: 'dtreasure' });
    const { limit, offset, searchQuery } = parseGalleryQuery(url);

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

    return jsonResponse(photos, 200, corsHeaders, {
      'Cache-Control': 'private, max-age=30',
      'X-Total-Count': String(total ?? photos.length),
    });
  } catch (e) {
    console.error('/api/dtreasure/list error:', e.message);
    return jsonResponse({ error: 'Internal server error' }, 500, corsHeaders);
  }
}

// ================================================================
// ENDPOINT: Top trending images
// ================================================================
export async function handleTrending({ request, url, env, ctx, DB, corsHeaders }) {
  const { limit } = parseGalleryQuery(url, { defaultLimit: 20, maxLimit: 50 });

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

    return sendCachedJson({
      payload: photos,
      cacheControl: 'public, max-age=120',
      corsHeaders,
      request,
      ctx,
    });
  } catch (e) {
    console.error('/api/trending error:', e.message);
    return jsonResponse([], 200, corsHeaders);
  }
}
