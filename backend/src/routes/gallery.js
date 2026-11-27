import { ensureAutoSync, buildUpsertStatement } from '../services/r2Sync.js';
import { parseImageMeta, extractImageDimensions, decodeBase64DataUrl } from '../services/imageMeta.js';
import { ensureAutoAccount, resolveSessionAuth } from '../services/accountAuth.js';
import { generateOpaqueId } from '../utils/userToken.js';
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
// Verified Creator Platform Helpers
// ================================================================
export function slugifyCreatorName(rawName) {
  return String(rawName || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function inferSocialPlatform(hostname = '') {
  const host = hostname.toLowerCase();
  if (host.includes('twitter.com') || host === 'x.com' || host.endsWith('.x.com')) return 'X / Twitter';
  if (host.includes('instagram.com')) return 'Instagram';
  if (host.includes('pixiv.net')) return 'Pixiv';
  if (host.includes('artstation.com')) return 'ArtStation';
  if (host.includes('deviantart.com')) return 'DeviantArt';
  if (host.includes('youtube.com') || host.includes('youtu.be')) return 'YouTube';
  if (host.includes('tiktok.com')) return 'TikTok';
  if (host.includes('discord.gg') || host.includes('discord.com')) return 'Discord';
  if (host.includes('behance.net')) return 'Behance';
  if (host.includes('github.com')) return 'GitHub';
  return 'Website';
}

export function normalizeSocialLinks(input) {
  let rawItems = [];
  if (Array.isArray(input)) {
    rawItems = input;
  } else if (typeof input === 'string') {
    rawItems = input.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  }

  const normalized = [];
  const seen = new Set();

  for (const item of rawItems) {
    const rawUrl = typeof item === 'string'
      ? item.trim()
      : String(item?.url || '').trim();
    if (!rawUrl) continue;

    let candidate = rawUrl;
    if (!/^https?:\/\//i.test(candidate)) {
      if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(candidate)) {
        candidate = `https://${candidate}`;
      } else {
        continue;
      }
    }

    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') continue;
      if (!parsed.hostname || !parsed.hostname.includes('.')) continue;
      const href = parsed.toString();
      if (seen.has(href)) continue;
      seen.add(href);

      const labelInput = typeof item === 'object' && item?.label ? String(item.label).trim().slice(0, 32) : '';
      normalized.push({
        label: labelInput || inferSocialPlatform(parsed.hostname),
        url: href,
      });
      if (normalized.length >= 6) break;
    } catch {
      continue;
    }
  }

  return normalized;
}

export function parseStoredSocialLinks(jsonText) {
  if (!jsonText) return [];
  try {
    const parsed = JSON.parse(jsonText);
    return normalizeSocialLinks(parsed);
  } catch {
    return [];
  }
}

function buildCreatorStatsMap(creatorRows, comitbaseRows) {
  const byCreatorId = new Map();
  const byName = new Map();

  for (const cp of creatorRows) {
    byCreatorId.set(cp.creator_id, cp);
    if (cp.profile_name) byName.set(cp.profile_name.trim().toLowerCase(), cp);
  }

  const statsMap = new Map();
  for (const cp of creatorRows) {
    statsMap.set(cp.creator_id, {
      artworkCount: 0,
      totalLoves: 0,
      totalFires: 0,
      totalDownloads: 0,
      totalViews: 0,
      coverUrl: cp.avatar_url || null,
      samplePhotos: [],
    });
  }

  for (const img of comitbaseRows) {
    const matched = (img.creator_id && byCreatorId.get(img.creator_id))
      || (img.uploader && byName.get(String(img.uploader).trim().toLowerCase()))
      || null;
    if (!matched) continue;

    const bucketStats = statsMap.get(matched.creator_id);
    if (!bucketStats) continue;

    bucketStats.artworkCount += 1;
    bucketStats.totalLoves += Number(img.love_count || 0);
    bucketStats.totalFires += Number(img.fire_count || 0);
    bucketStats.totalDownloads += Number(img.download_count || 0);
    bucketStats.totalViews += Number(img.view_count || 0);

    const imgUrl = buildVersionedImagePath('/api/comitbase/img/', img.r2_key, img);
    if (!bucketStats.coverUrl) bucketStats.coverUrl = imgUrl;
    if (bucketStats.samplePhotos.length < 3) {
      bucketStats.samplePhotos.push({
        id: img.id,
        title: img.title,
        url: imgUrl,
        width: Number(img.width) || 0,
        height: Number(img.height) || 0,
      });
    }
  }

  return statsMap;
}

function serializeCreatorProfile(cp, stats = null, { includeReviewNote = false } = {}) {
  const s = stats || {
    artworkCount: 0,
    totalLoves: 0,
    totalFires: 0,
    totalDownloads: 0,
    totalViews: 0,
    coverUrl: cp.avatar_url || null,
    samplePhotos: [],
  };
  const weeklyScore = (s.totalLoves * 3) + (s.totalFires * 3) + (s.totalDownloads * 2) + s.totalViews + (s.artworkCount * 5);

  return {
    creatorId: cp.creator_id,
    slug: cp.slug,
    profileName: cp.profile_name,
    description: cp.description,
    socialLinks: parseStoredSocialLinks(cp.social_links_json),
    avatarUrl: cp.avatar_url || null,
    coverUrl: s.coverUrl || cp.avatar_url || null,
    status: cp.status || 'pending',
    ...(includeReviewNote && cp.reviewed_note ? { reviewedNote: cp.reviewed_note } : {}),
    approvedAt: cp.approved_at || null,
    createdAt: cp.created_at || null,
    artworkCount: s.artworkCount,
    totalLoves: s.totalLoves,
    totalFires: s.totalFires,
    totalDownloads: s.totalDownloads,
    totalViews: s.totalViews,
    weeklyScore,
    samplePhotos: s.samplePhotos || [],
  };
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
      width:         Number(row.width) || 0,
      height:        Number(row.height) || 0,
      uploader:      row.uploader || null,
      creatorId:     row.creator_id || null,
      uploaded:      row.uploaded,
      path:          row.r2_key,
      viewCount:     row.view_count     || 0,
      downloadCount: row.download_count || 0,
      loveCount:     row.love_count     || 0,
      fireCount:     row.fire_count     || 0,
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
      `SELECT sub_category, COUNT(*) AS count, MIN(r2_key) AS sample_key, MAX(uploaded) AS sample_uploaded
       FROM images
       WHERE bucket = 'main' AND LOWER(category) = 'anime' AND sub_category IS NOT NULL
       GROUP BY sub_category
       ORDER BY sub_category ASC`
    ).all();

    const albums = (results || []).map(row => ({
      sub_category: row.sub_category,
      count:        Number(row.count || 0),
      sample_url:   row.sample_key
        ? buildVersionedImagePath('/api/img/', row.sample_key, { uploaded: row.sample_uploaded })
        : null,
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
// ENDPOINT: COMITBASE list (returns community artworks with creatorId & fireCount)
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
      category:      'COMITBASE',
      uploader:      row.uploader || 'Community',
      creatorId:     row.creator_id || null,
      url:           buildVersionedImagePath('/api/comitbase/img/', row.r2_key, row),
      width:         Number(row.width) || 0,
      height:        Number(row.height) || 0,
      uploaded:      row.uploaded,
      viewCount:     row.view_count     || 0,
      downloadCount: row.download_count || 0,
      loveCount:     row.love_count     || 0,
      fireCount:     row.fire_count     || 0,
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
// ENDPOINT: Verified Creator Directory (GET /api/comitbase/creators)
// ================================================================
export async function handleListComitbaseCreators({ url, env, ctx, DB, corsHeaders }) {
  try {
    if (env) await ensureAutoSync({ env, ctx, DB, bucketName: 'comitbase' });
    const q = String(url.searchParams.get('q') || '').trim().toLowerCase();

    const [creatorsRes, imgsRes] = await Promise.all([
      DB.prepare(
        "SELECT creator_id, user_id, slug, profile_name, description, social_links_json, avatar_url, status, approved_at, created_at FROM creator_profiles WHERE status = 'approved' ORDER BY approved_at DESC, created_at DESC"
      ).all(),
      DB.prepare(
        "SELECT id, title, r2_key, uploaded, size, width, height, uploader, creator_id, view_count, download_count, love_count, fire_count FROM images WHERE bucket = 'comitbase' ORDER BY uploaded DESC, id DESC"
      ).all(),
    ]);

    const creatorRows = creatorsRes?.results || [];
    const comitbaseRows = imgsRes?.results || [];
    const statsMap = buildCreatorStatsMap(creatorRows, comitbaseRows);

    let creators = creatorRows.map((cp) => serializeCreatorProfile(cp, statsMap.get(cp.creator_id)));
    if (q) {
      creators = creators.filter((c) =>
        c.profileName.toLowerCase().includes(q)
        || c.description.toLowerCase().includes(q)
        || c.slug.toLowerCase().includes(q)
      );
    }

    creators.sort((a, b) => b.artworkCount - a.artworkCount || b.weeklyScore - a.weeklyScore);

    return jsonResponse({
      success: true,
      creators,
      total: creators.length,
    }, 200, corsHeaders, { 'Cache-Control': 'public, max-age=30' });
  } catch (err) {
    console.error('/api/comitbase/creators error:', err.message);
    return jsonResponse({ success: false, creators: [], error: 'Failed to load verified creators' }, 500, corsHeaders);
  }
}

// ================================================================
// ENDPOINT: Current User's Creator Profile (GET /api/comitbase/creators/me)
// ================================================================
export async function handleMyCreatorProfile({ request, DB, corsHeaders, getUserToken }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken });
  if (!auth.authenticated || !auth.userId || auth.userId === 'anonymous') {
    return jsonResponse({
      success: true,
      authenticated: false,
      requiresLogin: !!auth.requiresLogin,
      creator: null,
    }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
  }

  try {
    const creator = await DB.prepare(
      'SELECT creator_id, user_id, slug, profile_name, description, social_links_json, avatar_url, status, reviewed_note, approved_at, created_at FROM creator_profiles WHERE user_id = ? LIMIT 1'
    ).bind(auth.userId).first();

    if (!creator) {
      return jsonResponse({ success: true, authenticated: true, creator: null }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
    }

    const imgsRes = await DB.prepare(
      "SELECT id, title, r2_key, uploaded, size, width, height, uploader, creator_id, view_count, download_count, love_count, fire_count FROM images WHERE bucket = 'comitbase' ORDER BY uploaded DESC, id DESC"
    ).all();
    const statsMap = buildCreatorStatsMap([creator], imgsRes?.results || []);

    return jsonResponse({
      success: true,
      authenticated: true,
      creator: serializeCreatorProfile(creator, statsMap.get(creator.creator_id), { includeReviewNote: true }),
    }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('/api/comitbase/creators/me error:', err.message);
    return jsonResponse({ success: false, error: 'Failed to load your creator profile' }, 500, corsHeaders);
  }
}

// ================================================================
// ENDPOINT: Submit Creator Application (POST /api/comitbase/creators/apply)
// ================================================================
export async function handleApplyComitbaseCreator({ request, DB, corsHeaders, getUserToken, checkRateLimit }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken });
  if (!auth.authenticated || !auth.userId || auth.userId === 'anonymous') {
    return jsonResponse({
      success: false,
      requiresLogin: !!auth.requiresLogin,
      error: auth.requiresLogin ? 'Please sign in to apply as a Verified Creator.' : 'Valid user session required.',
    }, 401, corsHeaders);
  }

  const ip = (request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '').split(',')[0].trim() || auth.userId;
  if (typeof checkRateLimit === 'function' && !await checkRateLimit('creator_apply', ip, 10, 3600)) {
    return jsonResponse({ success: false, error: 'Too many creator application requests. Please try again later.' }, 429, corsHeaders);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON request body' }, 400, corsHeaders);
  }

  const profileName = String(body?.profileName || body?.name || '').trim().replace(/\s+/g, ' ').slice(0, 50);
  const description = String(body?.description || body?.bio || '').trim().replace(/\s+/g, ' ').slice(0, 500);
  const socialLinks = normalizeSocialLinks(body?.socialLinks ?? body?.socialLink);

  if (profileName.length < 2) {
    return jsonResponse({ success: false, error: 'Profile name must be at least 2 characters.' }, 400, corsHeaders);
  }
  if (description.length < 10) {
    return jsonResponse({ success: false, error: 'Profile description must be at least 10 characters.' }, 400, corsHeaders);
  }
  if (socialLinks.length === 0) {
    return jsonResponse({ success: false, error: 'Provide at least one valid social media URL (https://...).' }, 400, corsHeaders);
  }

  try {
    const { account } = await ensureAutoAccount(DB, { userId: auth.userId, request, issueSession: false });
    const existing = await DB.prepare(
      'SELECT creator_id, user_id, slug, profile_name, description, social_links_json, status, created_at FROM creator_profiles WHERE user_id = ? LIMIT 1'
    ).bind(auth.userId).first();

    const nowIso = new Date().toISOString();
    const socialLinksJson = JSON.stringify(socialLinks);

    if (existing) {
      if (existing.status === 'approved') {
        return jsonResponse({
          success: false,
          error: 'You already have an approved creator profile.',
          creator: serializeCreatorProfile(existing),
        }, 409, corsHeaders);
      }

      await DB.prepare(`
        UPDATE creator_profiles
        SET profile_name = ?, description = ?, social_links_json = ?, status = 'pending', reviewed_note = NULL, updated_at = ?
        WHERE creator_id = ?
      `).bind(profileName, description, socialLinksJson, nowIso, existing.creator_id).run();

      const updated = await DB.prepare(
        'SELECT creator_id, user_id, slug, profile_name, description, social_links_json, avatar_url, status, reviewed_note, approved_at, created_at FROM creator_profiles WHERE creator_id = ? LIMIT 1'
      ).bind(existing.creator_id).first();

      return jsonResponse({
        success: true,
        message: 'Creator application updated and submitted for admin approval.',
        creator: serializeCreatorProfile(updated || existing),
      }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
    }

    let baseSlug = slugifyCreatorName(profileName) || 'creator';
    let slug = baseSlug;
    const collision = await DB.prepare('SELECT creator_id FROM creator_profiles WHERE slug = ? LIMIT 1').bind(slug).first();
    if (collision) {
      slug = `${baseSlug.slice(0, 38)}-${Date.now().toString(36).slice(-5)}`;
    }

    const creatorId = generateOpaqueId('cr');
    await DB.prepare(`
      INSERT INTO creator_profiles (creator_id, user_id, account_id, slug, profile_name, description, social_links_json, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).bind(
      creatorId,
      auth.userId,
      account?.account_id || null,
      slug,
      profileName,
      description,
      socialLinksJson,
      nowIso,
      nowIso
    ).run();

    const created = await DB.prepare(
      'SELECT creator_id, user_id, slug, profile_name, description, social_links_json, avatar_url, status, approved_at, created_at FROM creator_profiles WHERE creator_id = ? LIMIT 1'
    ).bind(creatorId).first();

    return jsonResponse({
      success: true,
      message: 'Creator application submitted for admin approval.',
      creator: serializeCreatorProfile(created),
    }, 201, corsHeaders, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('/api/comitbase/creators/apply error:', err.message);
    return jsonResponse({ success: false, error: 'Failed to submit creator application' }, 500, corsHeaders);
  }
}

// ================================================================
// ROUTER PREFIX DISPATCHER FOR /api/comitbase/creators/:slug*
// ================================================================
export async function handleComitbaseCreatorDetailOrAction(ctx) {
  const { path, method } = ctx;
  const prefix = '/api/comitbase/creators/';
  if (!path.startsWith(prefix)) return null;

  const rest = path.slice(prefix.length);
  const parts = rest.split('/').filter(Boolean);
  if (parts.length === 0) return null;

  let slug;
  try {
    slug = decodeURIComponent(parts[0]).trim().toLowerCase();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid creator slug' }, 400, ctx.corsHeaders);
  }
  if (!slug || slug === 'me' || slug === 'apply') return null;

  if (parts.length === 1 && method === 'GET') {
    return handleGetComitbaseCreator({ ...ctx, creatorSlug: slug });
  }
  if (parts.length === 2 && parts[1] === 'upload' && method === 'POST') {
    return handleUploadComitbaseCreatorImage({ ...ctx, creatorSlug: slug });
  }
  if (parts.length === 3 && parts[1] === 'images' && method === 'DELETE') {
    let encodedId = parts[2];
    try {
      encodedId = decodeURIComponent(parts[2]);
    } catch {}
    return handleDeleteComitbaseCreatorImage({ ...ctx, creatorSlug: slug, targetImageId: encodedId });
  }

  return jsonResponse({ success: false, error: 'Unsupported creator route' }, 404, ctx.corsHeaders);
}

export async function handleGetComitbaseCreator({ request, env, ctx, DB, corsHeaders, getUserToken, creatorSlug }) {
  try {
    if (env) await ensureAutoSync({ env, ctx, DB, bucketName: 'comitbase' });
    const creator = await DB.prepare(
      'SELECT creator_id, user_id, slug, profile_name, description, social_links_json, avatar_url, status, reviewed_note, approved_at, created_at FROM creator_profiles WHERE LOWER(slug) = LOWER(?) LIMIT 1'
    ).bind(creatorSlug).first();

    if (!creator) {
      return jsonResponse({ success: false, error: 'Creator profile not found' }, 404, corsHeaders);
    }

    const auth = await resolveSessionAuth({ request, DB, getUserToken });
    const isOwner = Boolean(auth.authenticated && auth.userId && auth.userId === creator.user_id);

    if (creator.status !== 'approved' && !isOwner) {
      return jsonResponse({ success: false, error: 'Creator profile is awaiting approval' }, 404, corsHeaders);
    }

    const imgsRes = await DB.prepare(
      "SELECT id, title, r2_key, uploaded, size, width, height, uploader, creator_id, view_count, download_count, love_count, fire_count FROM images WHERE bucket = 'comitbase' ORDER BY uploaded DESC, id DESC"
    ).all();

    const allComitbase = imgsRes?.results || [];
    const matchingImages = allComitbase.filter((img) =>
      img.creator_id === creator.creator_id
      || (!img.creator_id && img.uploader && img.uploader.trim().toLowerCase() === creator.profile_name.trim().toLowerCase())
    );

    const statsMap = buildCreatorStatsMap([creator], matchingImages);
    const photos = matchingImages.map((row) => ({
      id: row.id,
      title: row.title,
      category: 'COMITBASE',
      uploader: creator.profile_name,
      creatorId: creator.creator_id,
      creatorSlug: creator.slug,
      url: buildVersionedImagePath('/api/comitbase/img/', row.r2_key, row),
      width: Number(row.width) || 0,
      height: Number(row.height) || 0,
      uploaded: row.uploaded,
      viewCount: row.view_count || 0,
      downloadCount: row.download_count || 0,
      loveCount: row.love_count || 0,
      fireCount: row.fire_count || 0,
    }));

    return jsonResponse({
      success: true,
      isOwner,
      creator: serializeCreatorProfile(creator, statsMap.get(creator.creator_id), { includeReviewNote: isOwner }),
      photos,
    }, 200, corsHeaders, { 'Cache-Control': isOwner ? 'no-store' : 'public, max-age=30' });
  } catch (err) {
    console.error('/api/comitbase/creators/:slug error:', err.message);
    return jsonResponse({ success: false, error: 'Failed to load creator profile' }, 500, corsHeaders);
  }
}

export async function handleUploadComitbaseCreatorImage({ request, comitbaseBucket, DB, corsHeaders, getUserToken, checkRateLimit, creatorSlug }) {
  if (!comitbaseBucket || !DB) {
    return jsonResponse({ success: false, error: 'COMITBASE storage is unavailable' }, 503, corsHeaders);
  }

  const auth = await resolveSessionAuth({ request, DB, getUserToken });
  if (!auth.authenticated || !auth.userId || auth.userId === 'anonymous') {
    return jsonResponse({
      success: false,
      requiresLogin: !!auth.requiresLogin,
      error: auth.requiresLogin ? 'Please sign in to upload artworks to your creator profile.' : 'Authentication required.',
    }, 401, corsHeaders);
  }

  const creator = await DB.prepare(
    'SELECT creator_id, user_id, slug, profile_name, status FROM creator_profiles WHERE LOWER(slug) = LOWER(?) LIMIT 1'
  ).bind(creatorSlug).first();

  if (!creator) {
    return jsonResponse({ success: false, error: 'Creator profile not found' }, 404, corsHeaders);
  }
  if (creator.user_id !== auth.userId) {
    return jsonResponse({ success: false, error: 'Forbidden: Only the owner of this creator profile can upload artworks here.' }, 403, corsHeaders);
  }
  if (creator.status !== 'approved') {
    return jsonResponse({ success: false, error: 'Forbidden: Your creator profile must be approved by an admin before uploading.' }, 403, corsHeaders);
  }

  const ip = (request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '').split(',')[0].trim() || auth.userId;
  if (typeof checkRateLimit === 'function' && !await checkRateLimit('creator_upload', ip, 30, 3600)) {
    return jsonResponse({ success: false, error: 'Upload rate limit exceeded. Please try again later.' }, 429, corsHeaders);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON request body' }, 400, corsHeaders);
  }

  const title = String(body?.title || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (title.length < 2) {
    return jsonResponse({ success: false, error: 'Artwork title must be at least 2 characters.' }, 400, corsHeaders);
  }

  const decoded = decodeBase64DataUrl(body?.imageData, { maxBytes: 8 * 1024 * 1024 });
  if (decoded.error) {
    return jsonResponse({ success: false, error: decoded.error }, decoded.status || 400, corsHeaders);
  }
  if (decoded.ext === 'svg') {
    return jsonResponse({ success: false, error: 'Only raster images (PNG, JPEG, WebP, GIF, AVIF) are allowed.' }, 400, corsHeaders);
  }

  const imgSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'artwork';
  const r2Key = `creators/${creator.slug}/${imgSlug}_${Date.now()}.${decoded.ext}`;
  const uploadedIso = new Date().toISOString();
  const dims = extractImageDimensions(decoded.bytes, decoded.mimeType);

  try {
    await comitbaseBucket.put(r2Key, decoded.bytes, {
      contentType: decoded.mimeType,
      size: decoded.bytes.byteLength,
      uploaded: uploadedIso,
    });

    const parsed = parseImageMeta(r2Key, 'comitbase') || {
      id: `comitbase:${r2Key}`,
      r2_key: r2Key,
      bucket: 'comitbase',
      title,
      category: creator.profile_name,
      sub_category: null,
    };
    const meta = { ...parsed, title };

    await buildUpsertStatement(DB, meta, decoded.bytes.byteLength, uploadedIso, uploadedIso, {
      width: dims.width,
      height: dims.height,
      uploader: creator.profile_name,
      creatorId: creator.creator_id,
    }).run();

    const photo = {
      id: meta.id,
      title,
      category: 'COMITBASE',
      uploader: creator.profile_name,
      creatorId: creator.creator_id,
      creatorSlug: creator.slug,
      url: buildVersionedImagePath('/api/comitbase/img/', r2Key, { uploaded: uploadedIso, size: decoded.bytes.byteLength }),
      width: dims.width,
      height: dims.height,
      uploaded: uploadedIso,
      viewCount: 0,
      downloadCount: 0,
      loveCount: 0,
      fireCount: 0,
    };

    return jsonResponse({ success: true, photo }, 201, corsHeaders, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('[COMITBASE Creator Upload] Error:', err.message);
    return jsonResponse({ success: false, error: 'Failed to upload artwork to creator collection' }, 500, corsHeaders);
  }
}

export async function handleDeleteComitbaseCreatorImage({ request, comitbaseBucket, DB, corsHeaders, getUserToken, creatorSlug, targetImageId }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken });
  if (!auth.authenticated || !auth.userId || auth.userId === 'anonymous') {
    return jsonResponse({ success: false, error: 'Authentication required' }, 401, corsHeaders);
  }

  const creator = await DB.prepare(
    'SELECT creator_id, user_id, slug, profile_name, status FROM creator_profiles WHERE LOWER(slug) = LOWER(?) LIMIT 1'
  ).bind(creatorSlug).first();

  if (!creator) {
    return jsonResponse({ success: false, error: 'Creator profile not found' }, 404, corsHeaders);
  }
  if (creator.user_id !== auth.userId || creator.status !== 'approved') {
    return jsonResponse({ success: false, error: 'Forbidden: Only the verified owner can manage this collection.' }, 403, corsHeaders);
  }

  try {
    const img = await DB.prepare(
      'SELECT id, r2_key, bucket, creator_id, uploader FROM images WHERE id = ? LIMIT 1'
    ).bind(targetImageId).first();

    if (!img || img.bucket !== 'comitbase') {
      return jsonResponse({ success: false, error: 'Artwork not found' }, 404, corsHeaders);
    }
    const ownsImage = img.creator_id === creator.creator_id
      || (!img.creator_id && img.uploader && img.uploader.trim().toLowerCase() === creator.profile_name.trim().toLowerCase());
    if (!ownsImage) {
      return jsonResponse({ success: false, error: 'Forbidden: Artwork does not belong to this creator profile.' }, 403, corsHeaders);
    }

    if (comitbaseBucket && img.r2_key) {
      await comitbaseBucket.delete(img.r2_key).catch(() => {});
    }
    await DB.prepare('DELETE FROM images WHERE id = ?').bind(img.id).run();

    return jsonResponse({ success: true, deletedId: img.id }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('[COMITBASE Creator Delete] Error:', err.message);
    return jsonResponse({ success: false, error: 'Failed to delete creator artwork' }, 500, corsHeaders);
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
      width:         Number(row.width) || 0,
      height:        Number(row.height) || 0,
      uploaded:      row.uploaded,
      viewCount:     row.view_count     || 0,
      downloadCount: row.download_count || 0,
      loveCount:     row.love_count     || 0,
      fireCount:     row.fire_count     || 0,
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
// ENDPOINT: Weekly Leaderboard — Top Creators / Most Loved / Most Downloaded / Trending
// ================================================================
export async function handleTrending({ request, url, env, ctx, DB, corsHeaders }) {
  const { limit } = parseGalleryQuery(url, { defaultLimit: 20, maxLimit: 50 });
  const rawBy = String(url.searchParams.get('by') || 'trending').trim().toLowerCase();
  const sortBy = ['loved', 'downloaded', 'creators'].includes(rawBy) ? rawBy : 'trending';

  try {
    if (request) {
      const cached = await matchEdgeCache(request);
      if (cached) return cached;
    }

    if (sortBy === 'creators') {
      if (env) await ensureAutoSync({ env, ctx, DB, bucketName: 'comitbase' });
      const [creatorsRes, imgsRes] = await Promise.all([
        DB.prepare(
          "SELECT creator_id, user_id, slug, profile_name, description, social_links_json, avatar_url, status, approved_at, created_at FROM creator_profiles WHERE status = 'approved' ORDER BY approved_at DESC, created_at DESC"
        ).all(),
        DB.prepare(
          "SELECT id, title, r2_key, uploaded, size, width, height, uploader, creator_id, view_count, download_count, love_count, fire_count FROM images WHERE bucket = 'comitbase' ORDER BY uploaded DESC, id DESC"
        ).all(),
      ]);

      const creatorRows = creatorsRes?.results || [];
      const comitbaseRows = imgsRes?.results || [];
      const statsMap = buildCreatorStatsMap(creatorRows, comitbaseRows);
      const leaderboard = creatorRows
        .map((cp) => serializeCreatorProfile(cp, statsMap.get(cp.creator_id)))
        .sort((a, b) => b.weeklyScore - a.weeklyScore || b.totalLoves - a.totalLoves || b.artworkCount - a.artworkCount)
        .slice(0, limit);

      return sendCachedJson({
        payload: leaderboard,
        cacheControl: 'public, max-age=120',
        corsHeaders,
        request,
        ctx,
      });
    }

    if (env) await ensureAutoSync({ env, ctx, DB, bucketName: 'main' });

    const orderClause = sortBy === 'loved'
      ? 'COALESCE(love_count, 0) DESC, COALESCE(fire_count, 0) DESC, score DESC, uploaded DESC, id DESC'
      : sortBy === 'downloaded'
        ? 'COALESCE(download_count, 0) DESC, score DESC, uploaded DESC, id DESC'
        : 'score DESC, uploaded DESC, id DESC';

    const bucketFilter = sortBy === 'trending'
      ? "bucket = 'main'"
      : "bucket IN ('main', 'comitbase')";

    const { results } = await DB.prepare(`
      SELECT id, title, r2_key, bucket, category, sub_category, size, width, height, uploaded,
             uploader, creator_id, view_count, download_count, love_count, fire_count,
             (COALESCE(view_count, 0) + COALESCE(download_count, 0) + (COALESCE(love_count, 0) * 2) + (COALESCE(fire_count, 0) * 2)) AS score
      FROM images
      WHERE ${bucketFilter}
        AND category != 'Header'
      ORDER BY ${orderClause}
      LIMIT ?
    `).bind(limit).all();

    const photos = (results || []).map(row => ({
      id:            row.id,
      title:         row.title,
      category:      row.bucket === 'comitbase' ? 'COMITBASE' : row.category,
      subCategory:   row.sub_category,
      uploader:      row.uploader || null,
      creatorId:     row.creator_id || null,
      url:           buildVersionedImagePath(row.bucket === 'comitbase' ? '/api/comitbase/img/' : '/api/img/', row.r2_key, row),
      width:         Number(row.width) || 0,
      height:        Number(row.height) || 0,
      uploaded:      row.uploaded,
      viewCount:     row.view_count     || 0,
      downloadCount: row.download_count || 0,
      loveCount:     row.love_count     || 0,
      fireCount:     row.fire_count     || 0,
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

// ================================================================
// ENDPOINT: Community COMITBASE artwork upload (POST /api/comitbase/submit)
// Preserved for API backward compatibility; links creatorId if caller is approved creator
// ================================================================
export async function handleSubmitComitbase({ request, comitbaseBucket, DB, corsHeaders, checkRateLimit, getUserToken }) {
  if (!comitbaseBucket || !DB) {
    return jsonResponse({ success: false, error: 'COMITBASE storage is unavailable' }, 503, corsHeaders);
  }

  const ip = (request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '').split(',')[0].trim()
    || (typeof getUserToken === 'function' ? getUserToken(request) : 'anonymous');
  if (typeof checkRateLimit === 'function' && !await checkRateLimit('comitbase_submit', ip, 10, 3600)) {
    return jsonResponse({ success: false, error: 'Too many community submissions. Please try again later.' }, 429, corsHeaders);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON request body' }, 400, corsHeaders);
  }

  const title = String(body?.title || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const creator = String(body?.creator || body?.uploader || 'Community').trim().replace(/\s+/g, ' ').slice(0, 48) || 'Community';
  if (title.length < 2) {
    return jsonResponse({ success: false, error: 'Please enter an artwork title (at least 2 characters).' }, 400, corsHeaders);
  }

  const decoded = decodeBase64DataUrl(body?.imageData, { maxBytes: 5 * 1024 * 1024 });
  if (decoded.error) {
    return jsonResponse({ success: false, error: decoded.error }, decoded.status || 400, corsHeaders);
  }
  if (decoded.ext === 'svg') {
    return jsonResponse({ success: false, error: 'Only raster images (PNG, JPEG, WebP, GIF) are allowed for COMITBASE submissions.' }, 400, corsHeaders);
  }

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'artwork';
  const r2Key = `community/${slug}_${Date.now()}.${decoded.ext}`;
  const uploadedIso = new Date().toISOString();
  const dims = extractImageDimensions(decoded.bytes, decoded.mimeType);

  try {
    let linkedCreatorId = null;
    try {
      const auth = await resolveSessionAuth({ request, DB, getUserToken });
      if (auth.authenticated && auth.userId && auth.userId !== 'anonymous') {
        const cp = await DB.prepare(
          "SELECT creator_id FROM creator_profiles WHERE user_id = ? AND status = 'approved' LIMIT 1"
        ).bind(auth.userId).first();
        if (cp?.creator_id) linkedCreatorId = cp.creator_id;
      }
    } catch {}

    await comitbaseBucket.put(r2Key, decoded.bytes, {
      contentType: decoded.mimeType,
      size: decoded.bytes.byteLength,
      uploaded: uploadedIso,
    });

    const parsed = parseImageMeta(r2Key, 'comitbase') || {
      id: `comitbase:${r2Key}`,
      r2_key: r2Key,
      bucket: 'comitbase',
      title,
      category: 'Community',
      sub_category: null,
    };
    const meta = { ...parsed, title };

    await buildUpsertStatement(DB, meta, decoded.bytes.byteLength, uploadedIso, uploadedIso, {
      width: dims.width,
      height: dims.height,
      uploader: creator,
      creatorId: linkedCreatorId,
    }).run();

    const photo = {
      id: meta.id,
      title,
      uploader: creator,
      creatorId: linkedCreatorId,
      url: buildVersionedImagePath('/api/comitbase/img/', r2Key, { uploaded: uploadedIso, size: decoded.bytes.byteLength }),
      width: dims.width,
      height: dims.height,
      uploaded: uploadedIso,
      viewCount: 0,
      downloadCount: 0,
      loveCount: 0,
      fireCount: 0,
    };

    return jsonResponse({ success: true, photo }, 201, corsHeaders, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('[COMITBASE] Submit error:', err.message);
    return jsonResponse({ success: false, error: 'Failed to store community submission' }, 500, corsHeaders);
  }
}
