// In-memory D1 database & R2 bucket adapters for running the Cloudflare Worker backend in Node.js.
import { handleScheduled } from './services/r2Sync.js';

export function createSvgArtwork(key, bucketName, { isPreview = false } = {}) {
  const parts = key.split('/');
  const filename = parts[parts.length - 1] || key;
  const title = filename
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
  const folder = parts.length > 1 ? parts[0].toUpperCase() : bucketName.toUpperCase();
  const sub = parts.length > 2 ? parts[1].toUpperCase() : '';

  const palettes = {
    ANIME: ['#312e81', '#db2777', '#f472b6'],
    FANTASY: ['#1e1b4b', '#7c3aed', '#fbbf24'],
    ABSTRACT: ['#0f172a', '#06b6d4', '#a855f7'],
    PHOTOGRAPHY: ['#111827', '#059669', '#34d399'],
    ZMEME: ['#451a03', '#f59e0b', '#fde047'],
    OVERLAY: ['#171717', '#6366f1', '#22d3ee'],
    COMITBASE: ['#1e293b', '#ec4899', '#8b5cf6'],
    DTREASURE: ['#271705', '#d97706', '#fcd34d'],
    HEADER: ['#09090b', '#4f46e5', '#f59e0b'],
  };
  const [bg1, bg2, accent] = palettes[folder] || ['#111827', '#3b82f6', '#fbbf24'];

  const esc = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const cx1 = 160 + (hash % 480);
  const cy1 = 180 + ((hash >> 4) % 520);
  const cx2 = 120 + ((hash >> 8) % 560);
  const cy2 = 200 + ((hash >> 12) % 600);
  const isHeader = folder === 'HEADER';
  const ratioSlot = hash % 3;
  const width  = isHeader ? 1200 : (ratioSlot === 1 ? 1280 : ratioSlot === 2 ? 900 : 800);
  const height = isHeader ? 420  : (ratioSlot === 1 ? 720  : ratioSlot === 2 ? 900 : 1100);

  const watermarkLayer = isPreview
    ? `
  <g opacity="0.42" transform="rotate(-28 ${width / 2} ${height / 2})">
    <text x="${width / 2}" y="${height / 2 - 140}" text-anchor="middle" fill="#ffffff" font-family="Inter,system-ui,sans-serif" font-size="68" font-weight="900" letter-spacing="8">ZXAION PREVIEW</text>
    <text x="${width / 2}" y="${height / 2 + 20}" text-anchor="middle" fill="${accent}" font-family="Inter,system-ui,sans-serif" font-size="38" font-weight="800" letter-spacing="6">WATERMARKED EDITION</text>
    <text x="${width / 2}" y="${height / 2 + 170}" text-anchor="middle" fill="#ffffff" font-family="Inter,system-ui,sans-serif" font-size="52" font-weight="900" letter-spacing="8">UNLOCK FOR 4K</text>
  </g>
  <rect x="36" y="36" width="230" height="44" rx="22" fill="#000000" fill-opacity="0.72" stroke="${accent}" stroke-width="2"/>
  <text x="151" y="64" text-anchor="middle" fill="${accent}" font-family="Inter,system-ui,sans-serif" font-size="16" font-weight="800" letter-spacing="2">PREVIEW ONLY</text>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bg1}"/>
      <stop offset="100%" stop-color="${bg2}"/>
    </linearGradient>
    <radialGradient id="glow1" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <circle cx="${cx1}" cy="${cy1}" r="${isHeader ? 260 : 320}" fill="url(#glow1)"/>
  <circle cx="${cx2}" cy="${cy2}" r="${isHeader ? 180 : 240}" fill="${accent}" fill-opacity="0.14"/>
  <path d="M0 ${height * 0.72} Q ${width * 0.35} ${height * 0.6} ${width} ${height * 0.78} L ${width} ${height} L 0 ${height} Z" fill="#000000" fill-opacity="0.28"/>
  <rect x="36" y="${height - 132}" width="${width - 72}" height="96" rx="18" fill="#000000" fill-opacity="0.45"/>
  <text x="64" y="${height - 86}" fill="${accent}" font-family="Inter,system-ui,sans-serif" font-size="22" font-weight="800" letter-spacing="2">${esc(sub ? `${folder} / ${sub}` : folder)}</text>
  <text x="64" y="${height - 52}" fill="#ffffff" font-family="Inter,system-ui,sans-serif" font-size="30" font-weight="700">${esc(title)}</text>
  ${watermarkLayer}
</svg>`;
}

export function createMockR2Bucket(name, seedItems = []) {
  const objects = new Map();

  const baseTs = Date.now();
  seedItems.forEach((item, idx) => {
    objects.set(item.key, {
      key: item.key,
      size: item.size || 245760,
      uploaded: item.uploaded || new Date(baseTs - idx * 3600_000).toISOString(),
      httpEtag: `"${Buffer.from(item.key).toString('base64url').slice(0, 12)}"`,
      contentType: item.contentType || 'image/svg+xml',
      bodyText: item.bodyText ?? null,
    });
  });

  return {
    async list({ cursor, limit = 1000 } = {}) {
      const list = Array.from(objects.values())
        .filter((item) => !item.key.startsWith('_preview/'))
        .slice(0, limit);
      return {
        objects: list.map(({ key, size, uploaded, httpEtag }) => ({ key, size, uploaded, httpEtag })),
        truncated: false,
        cursor: undefined,
      };
    },
    async head(key) {
      const entry = objects.get(key);
      if (!entry) return null;
      return { key: entry.key, size: entry.size, uploaded: entry.uploaded, httpEtag: entry.httpEtag };
    },
    async put(key, body = '', { size, uploaded, contentType } = {}) {
      const isBinary = body instanceof Uint8Array || Buffer.isBuffer(body);
      const bodyBytes = isBinary ? new Uint8Array(body) : null;
      const text = typeof body === 'string' ? body : '';
      objects.set(key, {
        key,
        size: size ?? (bodyBytes ? bodyBytes.byteLength : (Buffer.byteLength(text) || 245760)),
        uploaded: uploaded || new Date().toISOString(),
        httpEtag: `"${Buffer.from(key).toString('base64url').slice(0, 12)}"`,
        contentType: contentType || 'image/jpeg',
        bodyText: text || null,
        bodyBytes,
      });
    },
    async delete(key) {
      objects.delete(key);
    },
    async get(key) {
      const isPreview = key.startsWith('_preview/');
      const underlyingKey = isPreview ? key.slice('_preview/'.length) : key;
      let entry = objects.get(key);

      if (!entry && isPreview && name === 'dtreasure') {
        const original = objects.get(underlyingKey);
        if (original) {
          const svg = createSvgArtwork(underlyingKey, name, { isPreview: true });
          entry = {
            key,
            size: Buffer.byteLength(svg),
            uploaded: original.uploaded,
            httpEtag: `"${Buffer.from(key).toString('base64url').slice(0, 12)}"`,
            contentType: 'image/svg+xml',
            bodyText: svg,
            bodyBytes: null,
          };
        }
      }

      if (!entry) {
        // Synthesize fallback artwork for header thumbnails, logos, or icons
        if (underlyingKey.startsWith('HEADER/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(underlyingKey)) {
          const svg = createSvgArtwork(underlyingKey, name, { isPreview });
          entry = {
            key,
            size: Buffer.byteLength(svg),
            uploaded: new Date().toISOString(),
            httpEtag: `"${Buffer.from(key).toString('base64url').slice(0, 12)}"`,
            contentType: 'image/svg+xml',
            bodyText: svg,
            bodyBytes: null,
          };
        } else {
          return null;
        }
      }

      const bytes = entry.bodyBytes
        ? entry.bodyBytes
        : new TextEncoder().encode(entry.bodyText ?? createSvgArtwork(underlyingKey, name, { isPreview }));
      return {
        key: entry.key,
        size: bytes.byteLength,
        httpEtag: entry.httpEtag,
        httpMetadata: { contentType: entry.contentType || 'image/svg+xml' },
        body: bytes,
        writeHttpMetadata(headers) {
          headers.set('Content-Type', entry.contentType || 'image/svg+xml');
        },
      };
    },
  };
}

export function createMockImagesBinding() {
  return {
    input(streamOrBytes) {
      const transforms = [];
      const chain = {
        transform(opts) {
          transforms.push(opts);
          return chain;
        },
        async output(outputOpts = {}) {
          const payload = streamOrBytes instanceof Uint8Array
            ? streamOrBytes
            : new TextEncoder().encode('mock-transformed-image');
          const mime = outputOpts.format || 'image/webp';
          return {
            response() {
              return new Response(payload, {
                status: 200,
                headers: {
                  'Content-Type': mime,
                  'X-Mock-Transforms': JSON.stringify(transforms),
                  'X-Mock-Output': JSON.stringify(outputOpts),
                },
              });
            },
          };
        },
      };
      return chain;
    },
  };
}

export function createMockD1() {
  const images = new Map();
  const userCredits = new Map();
  const purchasedImages = new Set();
  const paymentOrders = new Map();
  const views = new Map();
  const downloads = new Map();
  const reactions = new Map();
  const rateLimits = new Map();
  const accounts = new Map();
  const userSessions = new Map();
  const creditLedger = new Map();
  const emailVerifications = new Map();
  const backupSnapshots = new Map();
  const creatorProfiles = new Map();

  function inferArtworkDimensions(r2Key = '') {
    let hash = 0;
    for (let i = 0; i < r2Key.length; i++) hash = (hash * 31 + r2Key.charCodeAt(i)) >>> 0;
    const isHeader = String(r2Key).toUpperCase().startsWith('HEADER/');
    const ratioSlot = hash % 3;
    return {
      width:  isHeader ? 1200 : (ratioSlot === 1 ? 1280 : ratioSlot === 2 ? 900 : 800),
      height: isHeader ? 420  : (ratioSlot === 1 ? 720  : ratioSlot === 2 ? 900 : 1100),
      hash,
    };
  }

  function filterImages(q, params) {
    let bucketFilter = null;
    let bucketList = null;
    if (q.includes("bucket IN ('main', 'comitbase', 'dtreasure')")) {
      bucketList = new Set(['main', 'comitbase', 'dtreasure']);
    } else if (q.includes("bucket = 'main'")) bucketFilter = 'main';
    else if (q.includes("bucket = 'comitbase'")) bucketFilter = 'comitbase';
    else if (q.includes("bucket = 'dtreasure'")) bucketFilter = 'dtreasure';

    let paramIdx = 0;
    const excludeHeader = q.includes("category != 'Header'");
    const targetCategory = q.includes('LOWER(category) = LOWER(?)') ? String(params[paramIdx++]).toLowerCase() : null;
    const targetSubCategory = q.includes('LOWER(sub_category) = LOWER(?)') ? String(params[paramIdx++]).toLowerCase() : null;

    let searchTokens = null;
    let searchTerm = null;
    let searchTitleOnly = false;
    if (q.includes('images_fts MATCH ?')) {
      const rawFts = String(params[paramIdx++] || '');
      searchTokens = rawFts
        .split(/\s+AND\s+/i)
        .map(t => t.replace(/^"|"|\*$/g, '').toLowerCase())
        .filter(Boolean);
      searchTitleOnly = bucketFilter === 'comitbase' || bucketFilter === 'dtreasure';
    } else if (q.includes("LOWER(COALESCE(sub_category, '')) LIKE ?")) {
      searchTerm = String(params[paramIdx++]).replace(/^%|%$/g, '').toLowerCase();
      paramIdx += 2;
    } else if (q.includes('LOWER(title) LIKE ?')) {
      searchTerm = String(params[paramIdx++]).replace(/^%|%$/g, '').toLowerCase();
      searchTitleOnly = true;
    }

    const filtered = Array.from(images.values()).filter((r) => {
      if (bucketList && !bucketList.has(r.bucket)) return false;
      if (bucketFilter && r.bucket !== bucketFilter) return false;
      if (excludeHeader && r.category === 'Header') return false;
      if (targetCategory && (r.category || '').toLowerCase() !== targetCategory) return false;
      if (targetSubCategory && (r.sub_category || '').toLowerCase() !== targetSubCategory) return false;
      if (searchTokens && searchTokens.length > 0) {
        const hay = searchTitleOnly
          ? (r.title || '').toLowerCase()
          : `${r.title || ''} ${r.category || ''} ${r.sub_category || ''} ${r.r2_key || ''}`.toLowerCase();
        if (!searchTokens.every(tok => hay.includes(tok))) return false;
      } else if (searchTerm !== null) {
        const inTitle = (r.title || '').toLowerCase().includes(searchTerm);
        if (searchTitleOnly) return inTitle;
        const inCat = (r.category || '').toLowerCase().includes(searchTerm);
        const inSub = (r.sub_category || '').toLowerCase().includes(searchTerm);
        if (!inTitle && !inCat && !inSub) return false;
      }
      return true;
    });

    return { filtered, nextParamIdx: paramIdx };
  }

  function execute(sql, params) {
    const q = sql.replace(/\s+/g, ' ').trim();

    if (q === 'SELECT 1') {
      return { first: { 1: 1 }, results: [{ 1: 1 }], meta: { changes: 0 } };
    }

    // --- IMAGES ---
    if (q.startsWith('INSERT INTO images')) {
      const [id, r2_key, bucket, title, category, sub_category, size, uploaded, last_synced, rawWidth = 0, rawHeight = 0, rawUploader = null, rawCreatorId = null] = params;
      const existing = images.get(id);
      const inferred = inferArtworkDimensions(r2_key || '');
      const width = Number(rawWidth) > 0 ? Number(rawWidth) : (existing?.width > 0 ? existing.width : inferred.width);
      const height = Number(rawHeight) > 0 ? Number(rawHeight) : (existing?.height > 0 ? existing.height : inferred.height);
      const uploader = (rawUploader && String(rawUploader).trim()) ? String(rawUploader).trim() : (existing?.uploader || null);
      const creator_id = (rawCreatorId && String(rawCreatorId).trim()) ? String(rawCreatorId).trim() : (existing?.creator_id || null);
      images.set(id, {
        id,
        r2_key,
        bucket,
        title,
        category,
        sub_category,
        size,
        uploaded,
        last_synced,
        width,
        height,
        uploader,
        creator_id,
        view_count: existing?.view_count ?? ((inferred.hash % 1150) + 50),
        download_count: existing?.download_count ?? ((inferred.hash % 390) + 10),
        love_count: existing?.love_count ?? ((inferred.hash % 160) + 5),
        fire_count: existing?.fire_count ?? ((inferred.hash % 95) + 3),
      });
      return { meta: { changes: 1 } };
    }

    if (q === 'UPDATE images SET creator_id = ?, uploader = ? WHERE id = ?') {
      const [creator_id, uploader, id] = params;
      const row = images.get(id);
      if (row) {
        row.creator_id = creator_id;
        row.uploader = uploader;
      }
      return { meta: { changes: row ? 1 : 0 } };
    }

    if (q === 'SELECT id, size, uploaded FROM images WHERE bucket = ?' || q === 'SELECT id, size, uploaded, width, height FROM images WHERE bucket = ?') {
      const targetBucket = params[0];
      const results = Array.from(images.values())
        .filter((r) => r.bucket === targetBucket)
        .map((r) => ({ id: r.id, size: r.size, uploaded: r.uploaded, width: r.width || 0, height: r.height || 0 }));
      return { results };
    }

    if (q === "SELECT creator_id, LOWER(TRIM(COALESCE(uploader, ''))) AS uploader_norm, COUNT(*) AS cnt FROM images WHERE bucket = 'comitbase' GROUP BY creator_id, LOWER(TRIM(COALESCE(uploader, '')))") {
      const grouped = new Map();
      for (const r of images.values()) {
        if (r.bucket !== 'comitbase') continue;
        const creator_id = r.creator_id || null;
        const uploader_norm = String(r.uploader || '').trim().toLowerCase();
        const k = `${creator_id || ''}::${uploader_norm}`;
        const prev = grouped.get(k) || { creator_id, uploader_norm, cnt: 0 };
        prev.cnt += 1;
        grouped.set(k, prev);
      }
      return { results: Array.from(grouped.values()) };
    }

    if (q.includes("AS artwork_count") && q.includes("FROM images WHERE bucket = 'comitbase'")) {
      const grouped = new Map();
      for (const r of images.values()) {
        if (r.bucket !== 'comitbase') continue;
        const creator_id = r.creator_id || null;
        const uploader_norm = String(r.uploader || '').trim().toLowerCase();
        const k = `${creator_id || ''}::${uploader_norm}`;
        const prev = grouped.get(k) || {
          creator_id,
          uploader_norm,
          artwork_count: 0,
          total_loves: 0,
          total_fires: 0,
          total_downloads: 0,
          total_views: 0,
        };
        prev.artwork_count += 1;
        prev.total_loves += Number(r.love_count || 0);
        prev.total_fires += Number(r.fire_count || 0);
        prev.total_downloads += Number(r.download_count || 0);
        prev.total_views += Number(r.view_count || 0);
        grouped.set(k, prev);
      }
      return { results: Array.from(grouped.values()) };
    }

    if (q.includes("WHERE bucket = 'comitbase' AND (creator_id = ?")) {
      const [cid, pname] = params;
      const normName = String(pname || '').trim().toLowerCase();
      const results = Array.from(images.values())
        .filter((r) => r.bucket === 'comitbase' && (
          r.creator_id === cid
          || (!r.creator_id && String(r.uploader || '').trim().toLowerCase() === normName)
        ))
        .sort((a, b) => (b.uploaded || '').localeCompare(a.uploaded || '') || b.id.localeCompare(a.id))
        .slice(0, 200);
      return { results };
    }

    if (q.endsWith("FROM images WHERE bucket = 'comitbase' ORDER BY uploaded DESC, id DESC LIMIT 150")) {
      const results = Array.from(images.values())
        .filter((r) => r.bucket === 'comitbase')
        .sort((a, b) => (b.uploaded || '').localeCompare(a.uploaded || '') || b.id.localeCompare(a.id))
        .slice(0, 150);
      return { results };
    }

    if (q === "SELECT creator_id, uploader FROM images WHERE bucket = 'comitbase'") {
      const results = Array.from(images.values())
        .filter((r) => r.bucket === 'comitbase')
        .map((r) => ({ creator_id: r.creator_id || null, uploader: r.uploader || null }));
      return { results };
    }

    if (q === 'DELETE FROM images WHERE id = ?') {
      const existed = images.delete(params[0]);
      return { meta: { changes: existed ? 1 : 0 } };
    }

    if (q.startsWith('DELETE FROM images WHERE bucket = ?')) {
      const [bucket, syncStartedAt] = params;
      let changes = 0;
      for (const [id, row] of images.entries()) {
        if (row.bucket === bucket && (!row.last_synced || row.last_synced < syncStartedAt)) {
          images.delete(id);
          changes++;
        }
      }
      return { meta: { changes } };
    }

    if (q.includes('GROUP BY sub_category') && q.includes('FROM images')) {
      const grouped = new Map();
      for (const r of images.values()) {
        if (r.bucket === 'main' && (r.category || '').toLowerCase() === 'anime' && r.sub_category) {
          const entry = grouped.get(r.sub_category) || { count: 0, sample_key: r.r2_key, sample_uploaded: r.uploaded || null };
          entry.count += 1;
          if (!entry.sample_key || (r.r2_key && r.r2_key < entry.sample_key)) {
            entry.sample_key = r.r2_key;
          }
          if (r.uploaded && (!entry.sample_uploaded || r.uploaded > entry.sample_uploaded)) {
            entry.sample_uploaded = r.uploaded;
          }
          grouped.set(r.sub_category, entry);
        }
      }
      const results = Array.from(grouped.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sub_category, info]) => ({
          sub_category,
          count: info.count,
          sample_key: info.sample_key,
          sample_uploaded: info.sample_uploaded,
        }));
      return { results };
    }

    if (q === 'SELECT 1 AS present FROM images WHERE bucket = ? LIMIT 1') {
      const targetBucket = params[0];
      let present = false;
      for (const r of images.values()) {
        if (r.bucket === targetBucket) {
          present = true;
          break;
        }
      }
      return { first: present ? { present: 1 } : null, results: present ? [{ present: 1 }] : [] };
    }

    if (/^SELECT COUNT\(\*\) AS total FROM images WHERE bucket = (?:\?|'[^']+')$/i.test(q)) {
      let targetBucket = params[0];
      if (!targetBucket) {
        const m = q.match(/bucket\s*=\s*'([^']+)'/i);
        if (m) targetBucket = m[1];
      }
      let total = 0;
      for (const r of images.values()) {
        if (r.bucket === targetBucket) total++;
      }
      return { first: { total }, results: [{ total }] };
    }

    if (q.startsWith('SELECT COUNT(*) AS total FROM images')) {
      const { filtered } = filterImages(q, params);
      return { first: { total: filtered.length }, results: [{ total: filtered.length }] };
    }

    if ((q.includes('FROM images WHERE bucket =') || q.includes("FROM images WHERE bucket IN ('main', 'comitbase', 'dtreasure')")) && q.includes('ORDER BY uploaded DESC')) {
      const { filtered, nextParamIdx } = filterImages(q, params);
      const limit = params[nextParamIdx] ?? 5000;
      const offset = params[nextParamIdx + 1] ?? 0;
      const results = filtered
        .sort((a, b) => (b.uploaded || '').localeCompare(a.uploaded || '') || b.id.localeCompare(a.id))
        .slice(offset, offset + limit);
      return { results };
    }

    if (q.includes('AS score FROM images')) {
      const [limit] = params;
      const sortLoved = q.includes('ORDER BY COALESCE(love_count, 0) DESC');
      const sortDownloaded = q.includes('ORDER BY COALESCE(download_count, 0) DESC');
      const allowComitbase = q.includes("bucket IN ('main', 'comitbase')");
      const results = Array.from(images.values())
        .filter((r) => (allowComitbase ? (r.bucket === 'main' || r.bucket === 'comitbase') : r.bucket === 'main') && r.category !== 'Header')
        .map((r) => ({
          ...r,
          score: (r.view_count || 0) + (r.download_count || 0) + ((r.love_count || 0) * 2) + ((r.fire_count || 0) * 2),
        }))
        .sort((a, b) => {
          if (sortLoved) {
            return (b.love_count || 0) - (a.love_count || 0) || (b.fire_count || 0) - (a.fire_count || 0) || b.score - a.score || (b.uploaded || '').localeCompare(a.uploaded || '') || b.id.localeCompare(a.id);
          }
          if (sortDownloaded) {
            return (b.download_count || 0) - (a.download_count || 0) || b.score - a.score || (b.uploaded || '').localeCompare(a.uploaded || '') || b.id.localeCompare(a.id);
          }
          return b.score - a.score || (b.uploaded || '').localeCompare(a.uploaded || '') || b.id.localeCompare(a.id);
        })
        .slice(0, limit);
      return { results };
    }

    if (q === "SELECT id FROM images WHERE id = ? AND bucket = 'dtreasure' LIMIT 1") {
      const row = images.get(params[0]);
      return { first: row && row.bucket === 'dtreasure' ? { id: row.id } : null };
    }

    if (q === 'SELECT id, r2_key, bucket, creator_id, uploader FROM images WHERE id = ? LIMIT 1') {
      const row = images.get(params[0]);
      return {
        first: row
          ? { id: row.id, r2_key: row.r2_key, bucket: row.bucket, creator_id: row.creator_id || null, uploader: row.uploader || null }
          : null,
      };
    }

    if (
      q === 'SELECT view_count, download_count FROM images WHERE id = ?' ||
      q === 'SELECT view_count, download_count, love_count FROM images WHERE id = ?' ||
      q === 'SELECT view_count, download_count, love_count, fire_count FROM images WHERE id = ?'
    ) {
      const row = images.get(params[0]) || null;
      return {
        first: row
          ? {
              view_count: row.view_count || 0,
              download_count: row.download_count || 0,
              love_count: row.love_count || 0,
              fire_count: row.fire_count || 0,
            }
          : null,
      };
    }

    if (
      q === 'SELECT id, title, category, sub_category, bucket, r2_key FROM images WHERE id = ? OR r2_key = ?' ||
      q === 'SELECT id, title, category, sub_category, bucket, r2_key, width, height, uploaded FROM images WHERE id = ? OR r2_key = ?'
    ) {
      const [idParam, keyParam] = params;
      let match = images.get(idParam) || null;
      if (!match && keyParam) {
        for (const r of images.values()) {
          if (r.id === idParam || r.r2_key === keyParam) {
            match = r;
            break;
          }
        }
      }
      return {
        first: match
          ? {
              id: match.id,
              title: match.title,
              category: match.category,
              sub_category: match.sub_category,
              bucket: match.bucket,
              r2_key: match.r2_key,
              width: match.width || 0,
              height: match.height || 0,
              uploaded: match.uploaded || null,
            }
          : null,
      };
    }

    if (q.startsWith('UPDATE images SET view_count')) {
      const row = images.get(params[0]);
      if (row) row.view_count = (row.view_count || 0) + 1;
      return { meta: { changes: row ? 1 : 0 } };
    }

    if (q.startsWith('UPDATE images SET download_count')) {
      const row = images.get(params[0]);
      if (row) row.download_count = (row.download_count || 0) + 1;
      return { meta: { changes: row ? 1 : 0 } };
    }

    if (q === 'UPDATE images SET love_count = COALESCE(love_count, 0) + 1 WHERE id = ?') {
      const row = images.get(params[0]);
      if (row) row.love_count = (row.love_count || 0) + 1;
      return { meta: { changes: row ? 1 : 0 } };
    }

    if (q === 'UPDATE images SET love_count = MAX(0, COALESCE(love_count, 0) - 1) WHERE id = ?') {
      const row = images.get(params[0]);
      if (row) row.love_count = Math.max(0, (row.love_count || 0) - 1);
      return { meta: { changes: row ? 1 : 0 } };
    }

    if (q === 'UPDATE images SET fire_count = COALESCE(fire_count, 0) + 1 WHERE id = ?') {
      const row = images.get(params[0]);
      if (row) row.fire_count = (row.fire_count || 0) + 1;
      return { meta: { changes: row ? 1 : 0 } };
    }

    if (q === 'UPDATE images SET fire_count = MAX(0, COALESCE(fire_count, 0) - 1) WHERE id = ?') {
      const row = images.get(params[0]);
      if (row) row.fire_count = Math.max(0, (row.fire_count || 0) - 1);
      return { meta: { changes: row ? 1 : 0 } };
    }

    // --- REACTIONS ---
    if (q === 'SELECT reaction_type FROM reactions WHERE photo_id = ? AND user_id = ?') {
      const [photoId, userId] = params;
      const prefix = `${photoId}::${userId}::`;
      const results = [];
      for (const [k, v] of reactions.entries()) {
        if (k.startsWith(prefix)) {
          results.push({ reaction_type: v?.reaction_type || k.slice(prefix.length) || 'love' });
        }
      }
      return { results };
    }

    if (q === 'SELECT 1 FROM reactions WHERE photo_id = ? AND user_id = ? AND reaction_type = ?') {
      const has = reactions.has(`${params[0]}::${params[1]}::${params[2]}`);
      return { first: has ? { 1: 1 } : null };
    }

    if (q === 'SELECT 1 FROM reactions WHERE photo_id = ? AND user_id = ?') {
      const has = reactions.has(`${params[0]}::${params[1]}::love`);
      return { first: has ? { 1: 1 } : null };
    }

    if (q.startsWith('INSERT OR IGNORE INTO reactions')) {
      const hasType = q.includes('reaction_type');
      const photoId = params[0];
      const userId = params[1];
      const reactionType = hasType ? (params[2] || 'love') : 'love';
      const createdAt = hasType ? (params[3] || new Date().toISOString()) : (params[2] || new Date().toISOString());
      const key = `${photoId}::${userId}::${reactionType}`;
      const had = reactions.has(key);
      if (!had) reactions.set(key, { reaction_type: reactionType, created_at: createdAt });
      return { meta: { changes: had ? 0 : 1 } };
    }

    if (q === 'DELETE FROM reactions WHERE photo_id = ? AND user_id = ? AND reaction_type = ?') {
      const key = `${params[0]}::${params[1]}::${params[2]}`;
      const existed = reactions.delete(key);
      return { meta: { changes: existed ? 1 : 0 } };
    }

    if (q === 'DELETE FROM reactions WHERE photo_id = ? AND user_id = ?') {
      const key = `${params[0]}::${params[1]}::love`;
      const existed = reactions.delete(key);
      return { meta: { changes: existed ? 1 : 0 } };
    }

    // --- CREATOR PROFILES (COMITBASE) ---
    if (q.startsWith('INSERT INTO creator_profiles')) {
      const [
        creator_id,
        user_id,
        account_id,
        slug,
        profile_name,
        description,
        social_links_json,
        ...rest
      ] = params;
      const isApprovedInsert = q.includes("'approved'");
      const status = isApprovedInsert ? 'approved' : 'pending';
      const created_at = rest[0] || new Date().toISOString();
      const approved_at = isApprovedInsert ? (rest[1] || created_at) : null;
      const updated_at = rest[isApprovedInsert ? 2 : 1] || created_at;
      creatorProfiles.set(creator_id, {
        creator_id,
        user_id,
        account_id,
        slug,
        profile_name,
        description,
        social_links_json,
        avatar_url: null,
        status,
        reviewed_note: null,
        created_at,
        approved_at,
        updated_at,
      });
      return { meta: { changes: 1 } };
    }

    if (q.startsWith('UPDATE creator_profiles SET profile_name = ?, description = ?, social_links_json = ?')) {
      const [profile_name, description, social_links_json, updated_at, creator_id] = params;
      const cp = creatorProfiles.get(creator_id);
      if (!cp) return { meta: { changes: 0 } };
      cp.profile_name = profile_name;
      cp.description = description;
      cp.social_links_json = social_links_json;
      cp.status = 'pending';
      cp.reviewed_note = null;
      cp.updated_at = updated_at;
      return { meta: { changes: 1 } };
    }

    if (q === 'UPDATE creator_profiles SET status = ?, approved_at = ?, reviewed_note = ?, updated_at = ? WHERE creator_id = ?') {
      const [status, approved_at, reviewed_note, updated_at, creator_id] = params;
      const cp = creatorProfiles.get(creator_id);
      if (!cp) return { meta: { changes: 0 } };
      cp.status = status;
      cp.approved_at = approved_at;
      cp.reviewed_note = reviewed_note;
      cp.updated_at = updated_at;
      return { meta: { changes: 1 } };
    }

    if (q.includes("FROM creator_profiles WHERE status = 'approved'")) {
      const hasSearch = q.includes('LOWER(profile_name) LIKE ?');
      const needle = hasSearch ? String(params[0] || '').replace(/^%|%$/g, '').toLowerCase() : '';
      const results = Array.from(creatorProfiles.values())
        .filter((cp) => {
          if (cp.status !== 'approved') return false;
          if (!needle) return true;
          return (cp.profile_name || '').toLowerCase().includes(needle)
            || (cp.description || '').toLowerCase().includes(needle)
            || (cp.slug || '').toLowerCase().includes(needle);
        })
        .sort((a, b) => (b.approved_at || b.created_at || '').localeCompare(a.approved_at || a.created_at || ''))
        .slice(0, 100)
        .map((cp) => ({ ...cp }));
      return { results };
    }

    if (q.includes("FROM creator_profiles WHERE user_id = ? AND status = 'approved' LIMIT 1")) {
      const uid = params[0];
      for (const cp of creatorProfiles.values()) {
        if (cp.user_id === uid && cp.status === 'approved') return { first: { ...cp } };
      }
      return { first: null };
    }

    if (q.includes('FROM creator_profiles WHERE user_id = ? LIMIT 1')) {
      const uid = params[0];
      for (const cp of creatorProfiles.values()) {
        if (cp.user_id === uid) return { first: { ...cp } };
      }
      return { first: null };
    }

    if (q.includes('FROM creator_profiles WHERE slug = ? LIMIT 1')) {
      const slug = params[0];
      for (const cp of creatorProfiles.values()) {
        if (cp.slug === slug) return { first: { ...cp } };
      }
      return { first: null };
    }

    if (q.includes('FROM creator_profiles WHERE LOWER(slug) = LOWER(?) LIMIT 1')) {
      const slug = String(params[0] || '').toLowerCase();
      for (const cp of creatorProfiles.values()) {
        if (String(cp.slug || '').toLowerCase() === slug) return { first: { ...cp } };
      }
      return { first: null };
    }

    if (q.includes('FROM creator_profiles WHERE creator_id = ? LIMIT 1')) {
      const cp = creatorProfiles.get(params[0]);
      return { first: cp ? { ...cp } : null };
    }

    if (q.includes('FROM creator_profiles ORDER BY created_at DESC LIMIT ?')) {
      const limit = params[0] || 200;
      const results = Array.from(creatorProfiles.values())
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        .slice(0, limit)
        .map((cp) => ({ ...cp }));
      return { results };
    }

    if (q.startsWith('INSERT OR IGNORE INTO views')) {
      const key = `${params[0]}::${params[1]}`;
      const had = views.has(key);
      if (!had) views.set(key, params[2] || new Date().toISOString());
      return { meta: { changes: had ? 0 : 1 } };
    }

    if (q.startsWith('DELETE FROM views WHERE created_at < ?') || q.startsWith('DELETE FROM views WHERE rowid IN (SELECT rowid FROM views WHERE created_at < ?')) {
      const cutoff = params[0];
      let changes = 0;
      for (const [k, createdAt] of views.entries()) {
        if (createdAt && createdAt < cutoff) {
          views.delete(k);
          changes++;
          if (q.includes('LIMIT 1000') && changes >= 1000) break;
        }
      }
      return { meta: { changes } };
    }

    if (q.startsWith('INSERT OR IGNORE INTO downloads')) {
      const key = `${params[0]}::${params[1]}`;
      const had = downloads.has(key);
      if (!had) downloads.set(key, params[2] || new Date().toISOString());
      return { meta: { changes: had ? 0 : 1 } };
    }

    if (q.startsWith('DELETE FROM downloads WHERE created_at < ?') || q.startsWith('DELETE FROM downloads WHERE rowid IN (SELECT rowid FROM downloads WHERE created_at < ?')) {
      const cutoff = params[0];
      let changes = 0;
      for (const [k, createdAt] of downloads.entries()) {
        if (createdAt && createdAt < cutoff) {
          downloads.delete(k);
          changes++;
          if (q.includes('LIMIT 1000') && changes >= 1000) break;
        }
      }
      return { meta: { changes } };
    }

    // --- RATE LIMITS ---
    if (q.startsWith('INSERT INTO rate_limits')) {
      const [id, reset1, now1, now2, reset2] = params;
      const existing = rateLimits.get(id);
      if (!existing) {
        rateLimits.set(id, { id, count: 1, reset_time: reset1 });
      } else if (existing.reset_time < now1) {
        existing.count = 1;
        existing.reset_time = reset2;
      } else {
        existing.count += 1;
      }
      return { meta: { changes: 1 } };
    }

    if (q === 'SELECT count FROM rate_limits WHERE id = ?' || q === 'SELECT count, reset_time FROM rate_limits WHERE id = ?') {
      const row = rateLimits.get(params[0]) || null;
      return { first: row ? { count: row.count, reset_time: row.reset_time } : null };
    }

    if (q === 'SELECT id FROM rate_limits WHERE id LIKE ?') {
      const needle = String(params[0] || '').replace(/^%|%$/g, '');
      let found = null;
      for (const id of rateLimits.keys()) {
        if (id.includes(needle)) {
          found = { id };
          break;
        }
      }
      return { first: found };
    }

    if (q.startsWith('DELETE FROM rate_limits WHERE reset_time < ?') || q.startsWith('DELETE FROM rate_limits WHERE rowid IN (SELECT rowid FROM rate_limits WHERE reset_time < ?')) {
      const cutoff = params[0];
      let changes = 0;
      for (const [id, row] of rateLimits.entries()) {
        if (row.reset_time < cutoff) {
          rateLimits.delete(id);
          changes++;
          if (q.includes('LIMIT 1000') && changes >= 1000) break;
        }
      }
      return { meta: { changes } };
    }

    // --- USER CREDITS ---
    if (q === 'SELECT credits, lifetime, recovery_hash FROM user_credits WHERE user_id = ?') {
      const u = userCredits.get(params[0]);
      return { first: u ? { credits: u.credits, lifetime: u.lifetime, recovery_hash: u.recovery_hash || null } : null };
    }

    if (q === 'SELECT credits, lifetime FROM user_credits WHERE user_id = ?') {
      const u = userCredits.get(params[0]);
      return { first: u ? { credits: u.credits, lifetime: u.lifetime } : null };
    }

    if (q === 'SELECT credits FROM user_credits WHERE user_id = ?') {
      const u = userCredits.get(params[0]);
      return { first: u ? { credits: u.credits } : null };
    }

    if (q === 'SELECT user_id FROM user_credits WHERE user_id = ?') {
      const u = userCredits.get(params[0]);
      return { first: u ? { user_id: u.user_id } : null };
    }

    if (q === 'SELECT user_id FROM user_credits WHERE public_id = ? LIMIT 1') {
      const publicId = params[0];
      for (const u of userCredits.values()) {
        if (u.public_id && u.public_id === publicId) {
          return { first: { user_id: u.user_id } };
        }
      }
      return { first: null };
    }

    if (q === 'SELECT user_id, credits, lifetime FROM user_credits WHERE recovery_hash = ? LIMIT 1') {
      const hash = params[0];
      for (const u of userCredits.values()) {
        if (u.recovery_hash && u.recovery_hash === hash) {
          return { first: { user_id: u.user_id, credits: u.credits, lifetime: u.lifetime } };
        }
      }
      return { first: null };
    }

    if (q.startsWith('UPDATE user_credits SET recovery_hash = ? WHERE user_id = ?')) {
      const [hash, userId] = params;
      const existing = userCredits.get(userId);
      if (!existing) return { meta: { changes: 0 } };
      existing.recovery_hash = hash;
      return { meta: { changes: 1 } };
    }

    if (q.startsWith('INSERT INTO user_credits (user_id, public_id, credits, lifetime) VALUES (?, ?, 0, 0)')) {
      const [userId, publicId] = params;
      const existing = userCredits.get(userId);
      if (!existing) {
        userCredits.set(userId, { user_id: userId, public_id: publicId || null, credits: 0, lifetime: 0, recovery_hash: null });
      } else {
        existing.public_id = q.includes('COALESCE(') ? (existing.public_id || publicId) : publicId;
      }
      return { meta: { changes: 1 } };
    }

    if (q.startsWith('INSERT OR REPLACE INTO user_credits')) {
      const [user_id, public_id, credits, lifetime, recovery_hash] = params;
      userCredits.set(user_id, {
        user_id,
        public_id: public_id || null,
        credits: Number(credits) || 0,
        lifetime: Number(lifetime) || 0,
        recovery_hash: recovery_hash || null,
      });
      return { meta: { changes: 1 } };
    }

    if (q.startsWith('INSERT OR IGNORE INTO user_credits')) {
      const userId = params[0];
      if (!userCredits.has(userId)) {
        userCredits.set(userId, { user_id: userId, public_id: null, credits: 0, lifetime: 0, recovery_hash: null });
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }

    if (q.includes('ON CONFLICT(user_id) DO UPDATE SET credits = excluded.credits, lifetime = excluded.lifetime')) {
      const [userId, publicId, credits, lifetime] = params;
      const existing = userCredits.get(userId);
      if (existing) {
        existing.credits = Number(credits) || 0;
        existing.lifetime = Number(lifetime) ? 1 : 0;
        existing.public_id = existing.public_id || publicId || null;
      } else {
        userCredits.set(userId, {
          user_id: userId,
          public_id: publicId || null,
          credits: Number(credits) || 0,
          lifetime: Number(lifetime) ? 1 : 0,
          recovery_hash: null,
        });
      }
      return { meta: { changes: 1 } };
    }

    if (q.includes('ON CONFLICT(user_id) DO UPDATE SET lifetime = 1')) {
      const [userId, publicId] = params;
      const existing = userCredits.get(userId) || { user_id: userId, public_id: publicId || null, credits: 0, lifetime: 0, recovery_hash: null };
      existing.lifetime = 1;
      existing.public_id = existing.public_id || publicId || null;
      userCredits.set(userId, existing);
      return { meta: { changes: 1 } };
    }

    if (q.includes('ON CONFLICT(user_id) DO UPDATE SET credits = credits + ?')) {
      const [userId, publicId, initialCredits, addCredits] = params;
      const existing = userCredits.get(userId);
      if (existing) {
        existing.credits += addCredits;
        existing.public_id = existing.public_id || publicId || null;
      } else {
        userCredits.set(userId, { user_id: userId, public_id: publicId || null, credits: initialCredits, lifetime: 0, recovery_hash: null });
      }
      return { meta: { changes: 1 } };
    }

    if (q.startsWith('UPDATE user_credits SET credits = credits - 10')) {
      const user = userCredits.get(params[0]);
      if (user && user.credits >= 10) {
        user.credits -= 10;
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }

    if (q === 'UPDATE user_credits SET lifetime = 0 WHERE user_id = ?') {
      const user = userCredits.get(params[0]);
      if (!user) return { meta: { changes: 0 } };
      user.lifetime = 0;
      return { meta: { changes: 1 } };
    }

    if (q === 'UPDATE user_credits SET credits = MAX(0, credits - ?) WHERE user_id = ?') {
      const [deduct, userId] = params;
      const user = userCredits.get(userId);
      if (!user) return { meta: { changes: 0 } };
      user.credits = Math.max(0, user.credits - deduct);
      return { meta: { changes: 1 } };
    }

    if (q === 'UPDATE user_credits SET credits = ? WHERE user_id = ?') {
      const [credits, userId] = params;
      const user = userCredits.get(userId);
      if (!user) return { meta: { changes: 0 } };
      user.credits = Number(credits) || 0;
      return { meta: { changes: 1 } };
    }

    if (q === 'UPDATE user_credits SET credits = ?, public_id = COALESCE(public_id, ?) WHERE user_id = ?') {
      const [credits, publicId, userId] = params;
      const user = userCredits.get(userId);
      if (!user) return { meta: { changes: 0 } };
      user.credits = Number(credits) || 0;
      user.public_id = user.public_id || publicId || null;
      return { meta: { changes: 1 } };
    }

    if (q === 'DELETE FROM user_credits WHERE user_id = ?') {
      const deleted = userCredits.delete(params[0]);
      return { meta: { changes: deleted ? 1 : 0 } };
    }

    // --- PURCHASED IMAGES ---
    if (q.startsWith('SELECT photo_id FROM purchased_images WHERE user_id = ?')) {
      const userId = params[0];
      const prefix = `${userId}::`;
      const results = [];
      for (const k of purchasedImages) {
        if (k.startsWith(prefix)) {
          results.push({ photo_id: k.slice(prefix.length) });
        }
      }
      return { results };
    }

    if (q === 'SELECT 1 FROM purchased_images WHERE user_id = ? AND photo_id = ?') {
      const has = purchasedImages.has(`${params[0]}::${params[1]}`);
      return { first: has ? { 1: 1 } : null };
    }

    if (q.startsWith('INSERT OR IGNORE INTO purchased_images')) {
      const key = `${params[0]}::${params[1]}`;
      const had = purchasedImages.has(key);
      purchasedImages.add(key);
      return { meta: { changes: had ? 0 : 1 } };
    }

    if (q === 'DELETE FROM purchased_images WHERE user_id = ? AND photo_id = ?') {
      const key = `${params[0]}::${params[1]}`;
      const deleted = purchasedImages.delete(key);
      return { meta: { changes: deleted ? 1 : 0 } };
    }

    // --- PAYMENT ORDERS ---
    if (q.startsWith('SELECT') && q.includes('FROM payment_orders WHERE order_id = ? LIMIT 1')) {
      for (const order of paymentOrders.values()) {
        if (order.order_id === params[0]) return { first: { ...order } };
      }
      return { first: null };
    }

    if (q.startsWith('SELECT') && q.includes('FROM payment_orders WHERE capture_id = ? LIMIT 1')) {
      for (const order of paymentOrders.values()) {
        if (order.capture_id && order.capture_id === params[0]) return { first: { ...order } };
      }
      return { first: null };
    }

    if (q === 'SELECT status FROM payment_orders WHERE id = ?' || q === 'SELECT user_id, status FROM payment_orders WHERE id = ?') {
      const order = paymentOrders.get(params[0]);
      return { first: order ? { user_id: order.user_id, status: order.status } : null };
    }

    if (q.startsWith('INSERT INTO payment_orders') && (q.includes("WHERE payment_orders.status = 'failed'") || q.includes("WHERE payment_orders.status IN ('created', 'failed')"))) {
      const [id, user_id, order_id, capture_id, pack_key, amount, created_at, staleCutoffIso] = params;
      const existing = paymentOrders.get(id);
      const isStaleProcessing = existing?.status === 'processing' && existing.created_at && existing.created_at < staleCutoffIso;
      if (existing && existing.status !== 'created' && existing.status !== 'failed' && !isStaleProcessing) {
        return { meta: { changes: 0 } };
      }
      paymentOrders.set(id, {
        id,
        user_id,
        order_id,
        capture_id: capture_id || existing?.capture_id || null,
        pack_key,
        amount,
        status: 'processing',
        error_message: null,
        created_at,
      });
      return { meta: { changes: 1 } };
    }

    if (q.startsWith('INSERT INTO payment_orders') && q.includes('ON CONFLICT(id) DO NOTHING')) {
      const [id, user_id, order_id, pack_key, amount, created_at] = params;
      if (paymentOrders.has(id)) return { meta: { changes: 0 } };
      const initialStatus = q.includes("'created'") ? 'created' : 'processing';
      paymentOrders.set(id, {
        id,
        user_id,
        order_id,
        capture_id: null,
        pack_key,
        amount,
        status: initialStatus,
        error_message: null,
        created_at: created_at || new Date().toISOString(),
      });
      return { meta: { changes: 1 } };
    }

    if (q.startsWith('INSERT INTO payment_orders') && q.includes('ON CONFLICT(id) DO UPDATE')) {
      const existing = paymentOrders.get(params[0]);
      if (existing && ['completed', 'refunded', 'reversed', 'disputed'].includes(existing.status)) {
        return { meta: { changes: 0 } };
      }
      if (params.length === 7) {
        const [id, user_id, order_id, capture_id, pack_key, amount, error_message] = params;
        paymentOrders.set(id, { id, user_id, order_id, capture_id, pack_key, amount, status: 'failed', error_message, created_at: new Date().toISOString() });
      } else {
        const [id, user_id, order_id, pack_key, amount, error_message] = params;
        paymentOrders.set(id, { id, user_id, order_id, capture_id: null, pack_key, amount, status: 'failed', error_message, created_at: new Date().toISOString() });
      }
      return { meta: { changes: 1 } };
    }

    if (q.startsWith('INSERT OR REPLACE INTO payment_orders')) {
      if (params.length === 7) {
        const [id, user_id, order_id, pack_key, amount, status, created_at] = params;
        paymentOrders.set(id, { id, user_id, order_id, capture_id: null, pack_key, amount, status, error_message: null, created_at: created_at || new Date().toISOString() });
      } else {
        const [id, user_id, order_id, pack_key, amount, error_message] = params;
        paymentOrders.set(id, { id, user_id, order_id, pack_key, amount, status: 'failed', error_message, created_at: new Date().toISOString() });
      }
      return { meta: { changes: 1 } };
    }

    if (q.startsWith("UPDATE payment_orders SET status = 'completed'")) {
      const [completed_at, capture_id, id] = params.length === 3 ? params : [params[0], null, params[1]];
      const order = paymentOrders.get(id);
      if (order) {
        order.status = 'completed';
        order.completed_at = completed_at;
        if (capture_id) order.capture_id = capture_id;
      }
      return { meta: { changes: order ? 1 : 0 } };
    }

    if (q === 'UPDATE payment_orders SET status = ?, error_message = ? WHERE id = ?') {
      const [status, error_message, id] = params;
      const order = paymentOrders.get(id);
      if (order) {
        order.status = status;
        order.error_message = error_message;
      }
      return { meta: { changes: order ? 1 : 0 } };
    }

    if (q.startsWith("UPDATE payment_orders SET status = 'failed'")) {
      const [error_message, id] = params;
      const order = paymentOrders.get(id);
      if (order) {
        order.status = 'failed';
        order.error_message = error_message;
      }
      return { meta: { changes: order ? 1 : 0 } };
    }

    // --- ACCOUNTS ---
    if (q.startsWith('SELECT') && q.includes('FROM accounts WHERE user_id = ?')) {
      const uid = params[0];
      for (const acc of accounts.values()) {
        if (acc.user_id === uid) return { first: { ...acc } };
      }
      return { first: null };
    }

    if (q.startsWith('SELECT') && q.includes('FROM accounts WHERE account_id = ? LIMIT 1')) {
      const acc = accounts.get(params[0]);
      return { first: acc ? { ...acc } : null };
    }

    if (q.startsWith('SELECT') && q.includes('FROM accounts WHERE email = ? LIMIT 1')) {
      const email = params[0];
      for (const acc of accounts.values()) {
        if (acc.email && acc.email === email) return { first: { ...acc } };
      }
      return { first: null };
    }

    if (q.startsWith('INSERT INTO accounts') && q.includes('ON CONFLICT(user_id) DO NOTHING')) {
      const [account_id, user_id, created_at, updated_at] = params;
      for (const acc of accounts.values()) {
        if (acc.user_id === user_id) return { meta: { changes: 0 } };
      }
      accounts.set(account_id, {
        account_id,
        user_id,
        email: null,
        email_verified: 0,
        verify_bonus_claimed: 0,
        checkin_streak: 0,
        last_checkin_date: null,
        password_hash: null,
        display_name: null,
        status: 'active',
        failed_login_attempts: 0,
        locked_until: null,
        created_at,
        updated_at,
        last_login_at: null,
      });
      return { meta: { changes: 1 } };
    }

    if (q.startsWith('INSERT OR REPLACE INTO accounts')) {
      const [
        account_id, user_id, email, email_verified, password_hash,
        display_name, status, failed_login_attempts, locked_until,
        created_at, updated_at, last_login_at,
      ] = params;
      const existingAcc = accounts.get(account_id);
      accounts.set(account_id, {
        account_id,
        user_id,
        email,
        email_verified,
        verify_bonus_claimed: existingAcc?.verify_bonus_claimed ?? 0,
        checkin_streak: existingAcc?.checkin_streak ?? 0,
        last_checkin_date: existingAcc?.last_checkin_date ?? null,
        password_hash,
        display_name,
        status,
        failed_login_attempts,
        locked_until,
        created_at,
        updated_at,
        last_login_at,
      });
      return { meta: { changes: 1 } };
    }

    if (q.startsWith('UPDATE accounts SET email = ?, email_verified = 0, password_hash = ?, display_name = ?, updated_at = ? WHERE account_id = ?')) {
      const [email, password_hash, display_name, updated_at, account_id] = params;
      const acc = accounts.get(account_id);
      if (!acc) return { meta: { changes: 0 } };
      acc.email = email;
      acc.email_verified = 0;
      acc.password_hash = password_hash;
      acc.display_name = display_name;
      acc.updated_at = updated_at;
      return { meta: { changes: 1 } };
    }

    if (q.startsWith('UPDATE accounts SET failed_login_attempts = ?, locked_until = ?, updated_at = ? WHERE account_id = ?')) {
      const [attempts, locked_until, updated_at, account_id] = params;
      const acc = accounts.get(account_id);
      if (!acc) return { meta: { changes: 0 } };
      acc.failed_login_attempts = attempts;
      acc.locked_until = locked_until;
      acc.updated_at = updated_at;
      return { meta: { changes: 1 } };
    }

    if (q.startsWith('UPDATE accounts SET failed_login_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE account_id = ?')) {
      const [last_login_at, updated_at, account_id] = params;
      const acc = accounts.get(account_id);
      if (!acc) return { meta: { changes: 0 } };
      acc.failed_login_attempts = 0;
      acc.locked_until = null;
      acc.last_login_at = last_login_at;
      acc.updated_at = updated_at;
      return { meta: { changes: 1 } };
    }

    if (q === 'UPDATE accounts SET email_verified = 1, verify_bonus_claimed = 1, updated_at = ? WHERE account_id = ? AND verify_bonus_claimed = 0') {
      const [updated_at, account_id] = params;
      const acc = accounts.get(account_id);
      if (!acc || acc.verify_bonus_claimed) return { meta: { changes: 0 } };
      acc.email_verified = 1;
      acc.verify_bonus_claimed = 1;
      acc.updated_at = updated_at;
      return { meta: { changes: 1 } };
    }

    if (
      q.startsWith('UPDATE accounts SET email_verified = 1, updated_at = ? WHERE account_id = ?') ||
      q.startsWith('UPDATE accounts SET email_verified = 1, verify_bonus_claimed = 1, updated_at = ? WHERE account_id = ?')
    ) {
      const [updated_at, account_id] = params;
      const acc = accounts.get(account_id);
      if (!acc) return { meta: { changes: 0 } };
      acc.email_verified = 1;
      if (q.includes('verify_bonus_claimed = 1')) acc.verify_bonus_claimed = 1;
      acc.updated_at = updated_at;
      return { meta: { changes: 1 } };
    }

    if (q === 'UPDATE accounts SET checkin_streak = ?, last_checkin_date = ?, updated_at = ? WHERE account_id = ? AND (last_checkin_date IS NULL OR last_checkin_date != ?)') {
      const [checkin_streak, last_checkin_date, updated_at, account_id, guardDate] = params;
      const acc = accounts.get(account_id);
      if (!acc || acc.last_checkin_date === guardDate) return { meta: { changes: 0 } };
      acc.checkin_streak = Number(checkin_streak) || 0;
      acc.last_checkin_date = last_checkin_date;
      acc.updated_at = updated_at;
      return { meta: { changes: 1 } };
    }

    if (q.startsWith('UPDATE accounts SET checkin_streak = ?, last_checkin_date = ?, updated_at = ? WHERE account_id = ?')) {
      const [checkin_streak, last_checkin_date, updated_at, account_id] = params;
      const acc = accounts.get(account_id);
      if (!acc) return { meta: { changes: 0 } };
      acc.checkin_streak = Number(checkin_streak) || 0;
      acc.last_checkin_date = last_checkin_date;
      acc.updated_at = updated_at;
      return { meta: { changes: 1 } };
    }

    if (q.startsWith('UPDATE accounts SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE account_id = ?')) {
      const [password_hash, last_login_at, updated_at, account_id] = params;
      const acc = accounts.get(account_id);
      if (!acc) return { meta: { changes: 0 } };
      acc.password_hash = password_hash;
      acc.failed_login_attempts = 0;
      acc.locked_until = null;
      acc.last_login_at = last_login_at;
      acc.updated_at = updated_at;
      return { meta: { changes: 1 } };
    }

    if (q === 'UPDATE accounts SET failed_login_attempts = 0, locked_until = NULL WHERE email = ?') {
      const targetEmail = params[0];
      let changes = 0;
      for (const acc of accounts.values()) {
        if (acc.email === targetEmail) {
          acc.failed_login_attempts = 0;
          acc.locked_until = null;
          changes++;
        }
      }
      return { meta: { changes } };
    }

    if (q === 'DELETE FROM accounts WHERE user_id = ?') {
      let changes = 0;
      for (const [acctId, acc] of accounts.entries()) {
        if (acc.user_id === params[0]) {
          accounts.delete(acctId);
          changes++;
        }
      }
      return { meta: { changes } };
    }

    if (q.startsWith('SELECT account_id, user_id, email, email_verified') && q.includes('FROM accounts ORDER BY created_at DESC')) {
      const limit = params[0] || 200;
      const results = Array.from(accounts.values())
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        .slice(0, limit)
        .map((acc) => ({
          account_id: acc.account_id,
          user_id: acc.user_id,
          email: acc.email,
          email_verified: acc.email_verified,
          has_password: Boolean(acc.password_hash),
          display_name: acc.display_name,
          status: acc.status,
          created_at: acc.created_at,
          last_login_at: acc.last_login_at,
        }));
      return { results };
    }

    if (q.startsWith('SELECT account_id, user_id, email, email_verified, password_hash') && q.includes('FROM accounts') && !q.includes('WHERE')) {
      return { results: Array.from(accounts.values()).map((a) => ({ ...a })) };
    }

    // --- USER SESSIONS ---
    if (q.includes('FROM user_sessions WHERE token_hash = ? LIMIT 1')) {
      const hash = params[0];
      for (const s of userSessions.values()) {
        if (s.token_hash === hash) return { first: { ...s } };
      }
      return { first: null };
    }

    if (q.startsWith('INSERT INTO user_sessions')) {
      const [session_id, account_id, token_hash, user_agent, ip_hash, expires_at, last_seen_at, created_at] = params;
      userSessions.set(session_id, {
        session_id,
        account_id,
        token_hash,
        user_agent,
        ip_hash,
        expires_at,
        revoked_at: null,
        last_seen_at,
        created_at,
      });
      return { meta: { changes: 1 } };
    }

    if (q === 'UPDATE user_sessions SET last_seen_at = ? WHERE session_id = ?') {
      const [last_seen_at, session_id] = params;
      const s = userSessions.get(session_id);
      if (s) s.last_seen_at = last_seen_at;
      return { meta: { changes: s ? 1 : 0 } };
    }

    if (q === 'UPDATE user_sessions SET revoked_at = ? WHERE session_id = ? AND account_id = ? AND revoked_at IS NULL') {
      const [revoked_at, session_id, account_id] = params;
      const s = userSessions.get(session_id);
      if (s && s.account_id === account_id && !s.revoked_at) {
        s.revoked_at = revoked_at;
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }

    if (q === 'UPDATE user_sessions SET revoked_at = ? WHERE account_id = ? AND session_id != ? AND revoked_at IS NULL') {
      const [revoked_at, account_id, keepSessionId] = params;
      let changes = 0;
      for (const s of userSessions.values()) {
        if (s.account_id === account_id && s.session_id !== keepSessionId && !s.revoked_at) {
          s.revoked_at = revoked_at;
          changes++;
        }
      }
      return { meta: { changes } };
    }

    if (q === 'UPDATE user_sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL') {
      const [revoked_at, account_id] = params;
      let changes = 0;
      for (const s of userSessions.values()) {
        if (s.account_id === account_id && !s.revoked_at) {
          s.revoked_at = revoked_at;
          changes++;
        }
      }
      return { meta: { changes } };
    }

    if (q.includes('FROM user_sessions WHERE account_id = ? AND revoked_at IS NULL AND expires_at > ?')) {
      const [account_id, nowIso] = params;
      const results = Array.from(userSessions.values())
        .filter((s) => s.account_id === account_id && !s.revoked_at && s.expires_at > nowIso)
        .sort((a, b) => (b.last_seen_at || '').localeCompare(a.last_seen_at || ''))
        .slice(0, 20)
        .map(({ session_id, user_agent, ip_hash, expires_at, revoked_at, last_seen_at, created_at }) => ({
          session_id,
          user_agent,
          ip_hash,
          expires_at,
          revoked_at,
          last_seen_at,
          created_at,
        }));
      return { results };
    }

    if (q.startsWith('DELETE FROM user_sessions WHERE expires_at < ?') || q.startsWith('DELETE FROM user_sessions WHERE rowid IN (SELECT rowid FROM user_sessions WHERE expires_at < ?')) {
      const [expCutoff, revCutoff] = params;
      let changes = 0;
      for (const [sid, s] of userSessions.entries()) {
        if ((s.expires_at && s.expires_at < expCutoff) || (s.revoked_at && s.revoked_at < revCutoff)) {
          userSessions.delete(sid);
          changes++;
          if (q.includes('LIMIT 1000') && changes >= 1000) break;
        }
      }
      return { meta: { changes } };
    }

    // --- EMAIL VERIFICATIONS ---
    if (q.startsWith('UPDATE email_verifications SET used_at = ? WHERE email = ? AND purpose = ? AND used_at IS NULL')) {
      const [used_at, email, purpose] = params;
      let changes = 0;
      for (const v of emailVerifications.values()) {
        if (v.email === email && v.purpose === purpose && !v.used_at) {
          v.used_at = used_at;
          changes++;
        }
      }
      return { meta: { changes } };
    }

    if (q.startsWith('INSERT INTO email_verifications')) {
      const [id, account_id, email, purpose, code_hash, expires_at, created_at] = params;
      emailVerifications.set(id, {
        id,
        account_id,
        email,
        purpose,
        code_hash,
        attempts: 0,
        expires_at,
        used_at: null,
        created_at,
      });
      return { meta: { changes: 1 } };
    }

    if (q.includes('FROM email_verifications WHERE email = ? AND purpose = ? AND used_at IS NULL')) {
      const [email, purpose] = params;
      const matches = Array.from(emailVerifications.values())
        .filter((v) => v.email === email && v.purpose === purpose && !v.used_at)
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      return { first: matches[0] ? { ...matches[0] } : null };
    }

    if (q === 'UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?') {
      const v = emailVerifications.get(params[0]);
      if (v) v.attempts = (v.attempts || 0) + 1;
      return { meta: { changes: v ? 1 : 0 } };
    }

    if (q === 'UPDATE email_verifications SET used_at = ? WHERE id = ?') {
      const [used_at, id] = params;
      const v = emailVerifications.get(id);
      if (v) v.used_at = used_at;
      return { meta: { changes: v ? 1 : 0 } };
    }

    if (q.startsWith('DELETE FROM email_verifications WHERE expires_at < ?') || q.startsWith('DELETE FROM email_verifications WHERE rowid IN (SELECT rowid FROM email_verifications WHERE expires_at < ?')) {
      const [expCutoff, usedCutoff] = params;
      let changes = 0;
      for (const [vid, v] of emailVerifications.entries()) {
        if ((v.expires_at && v.expires_at < expCutoff) || (v.used_at && v.used_at < usedCutoff)) {
          emailVerifications.delete(vid);
          changes++;
          if (q.includes('LIMIT 1000') && changes >= 1000) break;
        }
      }
      return { meta: { changes } };
    }

    // --- CREDIT LEDGER (IMMUTABLE) ---
    if (q.startsWith('INSERT OR IGNORE INTO credit_ledger') && q.includes('FROM user_credits WHERE user_id = ?')) {
      const [id, account_id, user_id, tx_type, amount, reference_type, reference_id, description, metadata_json, created_at, targetUserId] = params;
      if (creditLedger.has(id)) return { meta: { changes: 0 } };
      const wallet = userCredits.get(targetUserId || user_id);
      if (!wallet) return { meta: { changes: 0 } };
      creditLedger.set(id, {
        id,
        account_id,
        user_id,
        tx_type,
        amount: Number(amount) || 0,
        balance_after: Number(wallet.credits) || 0,
        reference_type,
        reference_id,
        description,
        metadata_json,
        created_at,
      });
      return { meta: { changes: 1 } };
    }

    if (q.startsWith('INSERT OR IGNORE INTO credit_ledger')) {
      const [id, account_id, user_id, tx_type, amount, balance_after, reference_type, reference_id, description, metadata_json, created_at] = params;
      if (creditLedger.has(id)) return { meta: { changes: 0 } };
      creditLedger.set(id, {
        id,
        account_id,
        user_id,
        tx_type,
        amount: Number(amount) || 0,
        balance_after: Number(balance_after) || 0,
        reference_type,
        reference_id,
        description,
        metadata_json,
        created_at,
      });
      return { meta: { changes: 1 } };
    }

    if (q.includes('FROM credit_ledger WHERE user_id = ? AND tx_type = ?')) {
      const [user_id, tx_type, limit = 50, offset = 0] = params;
      const results = Array.from(creditLedger.values())
        .filter((r) => r.user_id === user_id && r.tx_type === tx_type)
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        .slice(offset, offset + limit);
      return { results };
    }

    if (q.includes('FROM credit_ledger WHERE user_id = ?')) {
      const [user_id, limit = 50, offset = 0] = params;
      const results = Array.from(creditLedger.values())
        .filter((r) => r.user_id === user_id)
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        .slice(offset, offset + limit);
      return { results };
    }

    if (q.includes('FROM credit_ledger ORDER BY created_at DESC LIMIT ?')) {
      const limit = params[0] || 100;
      const results = Array.from(creditLedger.values())
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        .slice(0, limit);
      return { results };
    }

    if (q.startsWith('SELECT id, account_id, user_id, tx_type') && q.includes('FROM credit_ledger') && !q.includes('WHERE')) {
      return { results: Array.from(creditLedger.values()).map((r) => ({ ...r })) };
    }

    // --- BACKUP SNAPSHOTS & EXPORT TABLE READS ---
    if (q === 'SELECT user_id, public_id, credits, lifetime, recovery_hash FROM user_credits') {
      return { results: Array.from(userCredits.values()).map((u) => ({ ...u })) };
    }

    if (q === 'SELECT user_id, photo_id, purchased_at FROM purchased_images') {
      const results = [];
      for (const k of purchasedImages) {
        const idx = k.indexOf('::');
        results.push({ user_id: k.slice(0, idx), photo_id: k.slice(idx + 2), purchased_at: new Date().toISOString() });
      }
      return { results };
    }

    if (q.startsWith('SELECT id, user_id, order_id, capture_id') && q.includes('FROM payment_orders') && !q.includes('WHERE')) {
      return { results: Array.from(paymentOrders.values()).map((o) => ({ ...o })) };
    }

    if (q.startsWith('INSERT INTO backup_snapshots')) {
      const [snapshot_id, created_by, accounts_cnt, wallets_cnt, ledger_cnt, orders_cnt, checksum_sha, payload_json, created_at] = params;
      backupSnapshots.set(snapshot_id, {
        snapshot_id,
        created_by,
        accounts_cnt,
        wallets_cnt,
        ledger_cnt,
        orders_cnt,
        checksum_sha,
        payload_json,
        created_at,
      });
      return { meta: { changes: 1 } };
    }

    if (q.includes('FROM backup_snapshots ORDER BY created_at DESC LIMIT ?')) {
      const limit = params[0] || 25;
      const results = Array.from(backupSnapshots.values())
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        .slice(0, limit)
        .map(({ payload_json, ...meta }) => meta);
      return { results };
    }

    if (q.includes('FROM backup_snapshots WHERE snapshot_id = ? LIMIT 1')) {
      const snap = backupSnapshots.get(params[0]);
      return { first: snap ? { ...snap } : null };
    }

    // --- ADMIN / USER ORDERS QUERIES ---
    if (q.includes('FROM payment_orders WHERE user_id = ? ORDER BY created_at DESC')) {
      const [uid] = params;
      const results = Array.from(paymentOrders.values())
        .filter((o) => o.user_id === uid)
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        .slice(0, 50);
      return { results };
    }

    if (q.includes('FROM payment_orders') && q.includes('ORDER BY created_at DESC')) {
      const limit = params[0] || 200;
      const results = Array.from(paymentOrders.values())
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        .slice(0, limit);
      return { results };
    }

    if (q.includes('FROM user_credits') && q.includes('ORDER BY credits DESC')) {
      const limit = params[0] || 200;
      const results = Array.from(userCredits.values())
        .map((u) => ({
          user_id: u.user_id,
          public_id: u.public_id,
          credits: u.credits,
          lifetime: u.lifetime,
          recovery_hash: u.recovery_hash,
        }))
        .sort((a, b) => b.credits - a.credits)
        .slice(0, limit);
      return { results };
    }

    if (q.includes('FROM purchased_images') && q.includes('GROUP BY user_id')) {
      const counts = new Map();
      for (const k of purchasedImages) {
        const [uid] = k.split('::');
        counts.set(uid, (counts.get(uid) || 0) + 1);
      }
      const results = Array.from(counts.entries()).map(([user_id, count]) => ({ user_id, count }));
      return { results };
    }

    console.warn('[MockD1] Unhandled query:', q);
    return { first: null, results: [], meta: { changes: 0 } };
  }

  function makeStatement(sql, bound = []) {
    return {
      sql,
      bound,
      bind(...args) {
        return makeStatement(sql, args);
      },
      async first() {
        const res = execute(sql, bound);
        return res.first !== undefined ? res.first : (res.results?.[0] ?? null);
      },
      async all() {
        const res = execute(sql, bound);
        return { results: res.results || [], meta: res.meta || { changes: 0 } };
      },
      async run() {
        const res = execute(sql, bound);
        return { meta: res.meta || { changes: 0 } };
      },
    };
  }

  return {
    prepare(sql) {
      return makeStatement(sql);
    },
    async batch(statements) {
      const out = [];
      for (const stmt of statements) {
        out.push(await stmt.run());
      }
      return out;
    },
  };
}

const MAIN_SEED = [
  { key: 'ANIME/Attack on Titan/crimson_wings_4k.jpg' },
  { key: 'ANIME/Attack on Titan/shiganshina_sunset.jpg' },
  { key: 'ANIME/Demon slayer/ai_generated_by_zxaionverse_djco3hq.jpg' },
  { key: 'ANIME/Demon slayer/hinokami_kagura_night.jpg' },
  { key: 'ANIME/Demon slayer/mugen_train_flame_edge.jpg' },
  { key: 'ANIME/Demon slayer/hashira_moonlit_garden.jpg' },
  { key: 'ANIME/Jujutsu Kaisen/domain_expansion_void.jpg' },
  { key: 'ANIME/Jujutsu Kaisen/shibuya_neon_eclipse.jpg' },
  { key: 'ANIME/Jujutsu Kaisen/hollow_purple_horizon.jpg' },
  { key: 'ANIME/Jujutsu Kaisen/cursed_shrine_ember.jpg' },
  { key: 'ANIME/One Piece/sunny_horizon_4k.jpg' },
  { key: 'ANIME/One Piece/wano_sakura_rooftop.jpg' },
  { key: 'ANIME/One Piece/gear_five_cloudburst.jpg' },
  { key: 'ANIME/Solo Leveling/arise_shadow_monarch.jpg' },
  { key: 'ANIME/Solo Leveling/jeju_purple_aura.jpg' },
  { key: 'ANIME/Solo Leveling/crimson_dungeon_gate.jpg' },
  { key: 'ANIME/Chainsaw Man/tokyo_dusk_blade.jpg' },
  { key: 'ANIME/Chainsaw Man/blood_moon_alley.jpg' },
  { key: 'ANIME/GENSHIN/inazuma_thunder_shrine.jpg' },
  { key: 'ANIME/GENSHIN/liyue_lantern_harbor.jpg' },
  { key: 'ANIME/GENSHIN/fontaine_crystal_opera.jpg' },
  { key: 'ANIME/HSR/astral_express_nebula.jpg' },
  { key: 'ANIME/HSR/penacony_neon_dreamscape.jpg' },
  { key: 'ANIME/HSR/xianzhou_jade_starskiff.jpg' },
  { key: 'ANIME/Sousou no Frieren/starlight_meadow.jpg' },
  { key: 'ANIME/Sousou no Frieren/northern_aurora_camp.jpg' },
  { key: 'ANIME/Naruto/konoha_crimson_evening.jpg' },
  { key: 'ANIME/Naruto/valley_of_the_end_storm.jpg' },
  { key: 'ANIME/Bleach/soul_society_moon.jpg' },
  { key: 'ANIME/Bleach/hueco_mundo_eclipse.jpg' },
  { key: 'ANIME/Evangelion/tokyo3_sunset_horizon.jpg' },
  { key: 'ANIME/Evangelion/lcl_nebula_reflection.jpg' },
  { key: 'ANIME/Black Clover/clover_grimoire_dawn.jpg' },
  { key: 'ANIME/Fate Series/avalon_golden_citadel.jpg' },
  { key: 'ANIME/Tokyo Ghoul/anteiku_rain_neon.jpg' },
  { key: 'ANIME/WUWA/jinzhou_wind_ridge.jpg' },
  { key: 'ANIME/random/cyber_valkyrie_original.jpg' },
  { key: 'ANIME/random/neon_ronin_original.jpg' },
  { key: 'FANTASY/astral_citadel_dragons.jpg' },
  { key: 'FANTASY/celestial_knight_eclipse.jpg' },
  { key: 'FANTASY/emerald_sanctuary_falls.jpg' },
  { key: 'ABSTRACT/prismatic_fluid_waves.jpg' },
  { key: 'ABSTRACT/obsidian_gold_geometry.jpg' },
  { key: 'ABSTRACT/chromatic_aurora_pulse.jpg' },
  { key: 'PHOTOGRAPHY/PSX_207.jpg' },
  { key: 'PHOTOGRAPHY/alpine_mist_dawn.jpg' },
  { key: 'PHOTOGRAPHY/kyoto_rain_lanterns.jpg' },
  { key: 'ZMEME/monday_deploy_mood.jpg' },
  { key: 'ZMEME/coffee_overflow_vibes.jpg' },
  { key: 'OVERLAY/hud_cyber_frame.png' },
  { key: 'OVERLAY/glass_stream_border.png' },
];

const COMITBASE_SEED = [
  { key: 'community/aurora_skyline_edit.jpg' },
  { key: 'community/mecha_hangar_concept.jpg' },
  { key: 'community/vaporwave_expressway.jpg' },
  { key: 'community/midnight_shrine_rain.jpg' },
];

const DTREASURE_SEED = [
  { key: 'vault/imperial_dragon_8k.jpg' },
  { key: 'vault/eclipse_seraphim_pro.jpg' },
  { key: 'vault/chronos_mech_edition.jpg' },
  { key: 'vault/celestial_lotus_gold.jpg' },
];

export async function createLocalEnv() {
  const env = {
    DB: createMockD1(),
    Zxaion_B: createMockR2Bucket('main', MAIN_SEED),
    ZX_BUCKET: createMockR2Bucket('comitbase', COMITBASE_SEED),
    TREASURE: createMockR2Bucket('dtreasure', DTREASURE_SEED),
    PAYPAL_ENV: process.env.PAYPAL_ENV || 'live',
    PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID || '',
    PAYPAL_CLIENT_SECRET_ID: process.env.PAYPAL_CLIENT_SECRET_ID || '',
    PAYPAL_WEBHOOK_ID: process.env.PAYPAL_WEBHOOK_ID || '',
    ADMIN_TOKEN: process.env.ADMIN_TOKEN || 'local-dev-admin',
    ALLOW_DEV_OTP_PREVIEW: 'true',
  };

  await handleScheduled(env);

  // Seed verified creators and pending demo application for COMITBASE Platform
  const nowIso = new Date().toISOString();
  const approvedAt1 = new Date(Date.now() - 86400_000 * 5).toISOString();
  const approvedAt2 = new Date(Date.now() - 86400_000 * 3).toISOString();
  const approvedAt3 = new Date(Date.now() - 86400_000 * 1).toISOString();

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO creator_profiles (creator_id, user_id, account_id, slug, profile_name, description, social_links_json, status, created_at, approved_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?)
    `).bind(
      'cr_kurogane',
      'seed_creator_kurogane',
      'ZXA-SEED-0001',
      'kurogane-atelier',
      'Kurogane Atelier',
      'High-contrast cyberpunk & mecha matte painter crafting 4K neon key visuals.',
      JSON.stringify([
        { label: 'X / Twitter', url: 'https://x.com/kuroganeatelier' },
        { label: 'Pixiv', url: 'https://www.pixiv.net/en/' },
      ]),
      approvedAt1,
      approvedAt1,
      approvedAt1
    ),
    env.DB.prepare(`
      INSERT INTO creator_profiles (creator_id, user_id, account_id, slug, profile_name, description, social_links_json, status, created_at, approved_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?)
    `).bind(
      'cr_sora',
      'seed_creator_sora',
      'ZXA-SEED-0002',
      'sora-visuals',
      'Sora Visuals',
      'Atmospheric anime skies, rain-lit shrines, and dreamy nocturnalscapes.',
      JSON.stringify([
        { label: 'Instagram', url: 'https://www.instagram.com/soravisuals/' },
        { label: 'ArtStation', url: 'https://www.artstation.com/' },
      ]),
      approvedAt2,
      approvedAt2,
      approvedAt2
    ),
    env.DB.prepare(`
      INSERT INTO creator_profiles (creator_id, user_id, account_id, slug, profile_name, description, social_links_json, status, created_at, approved_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?)
    `).bind(
      'cr_velvet',
      'seed_creator_velvet',
      'ZXA-SEED-0003',
      'velvet-frame',
      'Velvet Frame',
      'Synthwave expressways, iridescent glassmorphism overlays, and widescreen art.',
      JSON.stringify([
        { label: 'YouTube', url: 'https://www.youtube.com/@zxaionart' },
      ]),
      approvedAt3,
      approvedAt3,
      approvedAt3
    ),
    env.DB.prepare(`
      INSERT INTO creator_profiles (creator_id, user_id, account_id, slug, profile_name, description, social_links_json, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).bind(
      'cr_pending_demo',
      'seed_creator_pending',
      'ZXA-SEED-0004',
      'pending-artist-demo',
      'Nova Ink Studio',
      'Original dark fantasy character illustrator applying to showcase curated wallpaper series.',
      JSON.stringify([
        { label: 'X / Twitter', url: 'https://x.com/novainkstudio' },
      ]),
      nowIso,
      nowIso
    ),
    env.DB.prepare('UPDATE images SET creator_id = ?, uploader = ? WHERE id = ?')
      .bind('cr_kurogane', 'Kurogane Atelier', 'comitbase:community/mecha_hangar_concept.jpg'),
    env.DB.prepare('UPDATE images SET creator_id = ?, uploader = ? WHERE id = ?')
      .bind('cr_sora', 'Sora Visuals', 'comitbase:community/midnight_shrine_rain.jpg'),
    env.DB.prepare('UPDATE images SET creator_id = ?, uploader = ? WHERE id = ?')
      .bind('cr_sora', 'Sora Visuals', 'comitbase:community/aurora_skyline_edit.jpg'),
    env.DB.prepare('UPDATE images SET creator_id = ?, uploader = ? WHERE id = ?')
      .bind('cr_velvet', 'Velvet Frame', 'comitbase:community/vaporwave_expressway.jpg'),
  ]);

  return env;
}
