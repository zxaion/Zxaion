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

  for (const item of seedItems) {
    objects.set(item.key, {
      key: item.key,
      size: item.size || 245760,
      uploaded: item.uploaded || new Date(Date.now() - Math.random() * 86400000 * 30).toISOString(),
      httpEtag: `"${Buffer.from(item.key).toString('base64url').slice(0, 12)}"`,
      contentType: item.contentType || 'image/svg+xml',
      bodyText: item.bodyText ?? null,
    });
  }

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
      const text = typeof body === 'string' ? body : '';
      objects.set(key, {
        key,
        size: size ?? (Buffer.byteLength(text) || 245760),
        uploaded: uploaded || new Date().toISOString(),
        httpEtag: `"${Buffer.from(key).toString('base64url').slice(0, 12)}"`,
        contentType: contentType || 'image/jpeg',
        bodyText: text || null,
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
          };
        } else {
          return null;
        }
      }

      const bodyStr = entry.bodyText ?? createSvgArtwork(underlyingKey, name, { isPreview });
      const bytes = new TextEncoder().encode(bodyStr);
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
  const rateLimits = new Map();
  const accounts = new Map();
  const userSessions = new Map();
  const creditLedger = new Map();
  const emailVerifications = new Map();
  const backupSnapshots = new Map();

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
      const [id, r2_key, bucket, title, category, sub_category, size, uploaded, last_synced] = params;
      const existing = images.get(id);
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
        view_count: existing?.view_count ?? Math.floor(Math.random() * 1200) + 50,
        download_count: existing?.download_count ?? Math.floor(Math.random() * 400) + 10,
      });
      return { meta: { changes: 1 } };
    }

    if (q === 'SELECT id, size, uploaded FROM images WHERE bucket = ?') {
      const targetBucket = params[0];
      const results = Array.from(images.values())
        .filter((r) => r.bucket === targetBucket)
        .map((r) => ({ id: r.id, size: r.size, uploaded: r.uploaded }));
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
          const entry = grouped.get(r.sub_category) || { count: 0, sample_key: r.r2_key };
          entry.count += 1;
          if (!entry.sample_key || (r.r2_key && r.r2_key < entry.sample_key)) {
            entry.sample_key = r.r2_key;
          }
          grouped.set(r.sub_category, entry);
        }
      }
      const results = Array.from(grouped.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sub_category, info]) => ({ sub_category, count: info.count, sample_key: info.sample_key }));
      return { results };
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
      const results = Array.from(images.values())
        .filter((r) => r.bucket === 'main' && r.category !== 'Header')
        .map((r) => ({ ...r, score: (r.view_count || 0) + (r.download_count || 0) }))
        .sort((a, b) => b.score - a.score || (b.uploaded || '').localeCompare(a.uploaded || '') || b.id.localeCompare(a.id))
        .slice(0, limit);
      return { results };
    }

    if (q === "SELECT id FROM images WHERE id = ? AND bucket = 'dtreasure' LIMIT 1") {
      const row = images.get(params[0]);
      return { first: row && row.bucket === 'dtreasure' ? { id: row.id } : null };
    }

    if (q === 'SELECT view_count, download_count FROM images WHERE id = ?') {
      const row = images.get(params[0]) || null;
      return { first: row ? { view_count: row.view_count, download_count: row.download_count } : null };
    }

    if (q === 'SELECT id, title, category, sub_category, bucket, r2_key FROM images WHERE id = ? OR r2_key = ?') {
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

    if (q.startsWith('INSERT OR IGNORE INTO views')) {
      const key = `${params[0]}::${params[1]}`;
      const had = views.has(key);
      if (!had) views.set(key, params[2] || new Date().toISOString());
      return { meta: { changes: had ? 0 : 1 } };
    }

    if (q.startsWith('DELETE FROM views WHERE created_at < ?')) {
      const cutoff = params[0];
      let changes = 0;
      for (const [k, createdAt] of views.entries()) {
        if (createdAt && createdAt < cutoff) {
          views.delete(k);
          changes++;
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

    if (q.startsWith('DELETE FROM downloads WHERE created_at < ?')) {
      const cutoff = params[0];
      let changes = 0;
      for (const [k, createdAt] of downloads.entries()) {
        if (createdAt && createdAt < cutoff) {
          downloads.delete(k);
          changes++;
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

    if (q === 'SELECT count FROM rate_limits WHERE id = ?') {
      const row = rateLimits.get(params[0]) || null;
      return { first: row ? { count: row.count } : null };
    }

    if (q.startsWith('DELETE FROM rate_limits WHERE reset_time < ?')) {
      const cutoff = params[0];
      let changes = 0;
      for (const [id, row] of rateLimits.entries()) {
        if (row.reset_time < cutoff) {
          rateLimits.delete(id);
          changes++;
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
      accounts.set(account_id, {
        account_id,
        user_id,
        email,
        email_verified,
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

    if (q.startsWith('UPDATE accounts SET email_verified = 1, updated_at = ? WHERE account_id = ?')) {
      const [updated_at, account_id] = params;
      const acc = accounts.get(account_id);
      if (!acc) return { meta: { changes: 0 } };
      acc.email_verified = 1;
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

    if (q.startsWith('DELETE FROM user_sessions WHERE expires_at < ?')) {
      const [expCutoff, revCutoff] = params;
      let changes = 0;
      for (const [sid, s] of userSessions.entries()) {
        if ((s.expires_at && s.expires_at < expCutoff) || (s.revoked_at && s.revoked_at < revCutoff)) {
          userSessions.delete(sid);
          changes++;
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

    if (q.startsWith('DELETE FROM email_verifications WHERE expires_at < ?')) {
      const [expCutoff, usedCutoff] = params;
      let changes = 0;
      for (const [vid, v] of emailVerifications.entries()) {
        if ((v.expires_at && v.expires_at < expCutoff) || (v.used_at && v.used_at < usedCutoff)) {
          emailVerifications.delete(vid);
          changes++;
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
    IMAGES: createMockImagesBinding(),
    PAYPAL_ENV: process.env.PAYPAL_ENV || 'live',
    PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID || '',
    PAYPAL_CLIENT_SECRET_ID: process.env.PAYPAL_CLIENT_SECRET_ID || '',
    PAYPAL_WEBHOOK_ID: process.env.PAYPAL_WEBHOOK_ID || '',
    ADMIN_TOKEN: process.env.ADMIN_TOKEN || 'local-dev-admin',
    ALLOW_DEV_OTP_PREVIEW: 'true',
  };

  await handleScheduled(env);
  return env;
}
