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
  const views = new Set();
  const downloads = new Set();
  const rateLimits = new Map();

  function filterImages(q, params) {
    let bucketFilter = null;
    if (q.includes("bucket = 'main'")) bucketFilter = 'main';
    else if (q.includes("bucket = 'comitbase'")) bucketFilter = 'comitbase';
    else if (q.includes("bucket = 'dtreasure'")) bucketFilter = 'dtreasure';

    let paramIdx = 0;
    const excludeHeader = q.includes("category != 'Header'");
    const targetCategory = q.includes('LOWER(category) = LOWER(?)') ? String(params[paramIdx++]).toLowerCase() : null;
    const targetSubCategory = q.includes('LOWER(sub_category) = LOWER(?)') ? String(params[paramIdx++]).toLowerCase() : null;

    let searchTerm = null;
    let searchTitleOnly = false;
    if (q.includes("LOWER(COALESCE(sub_category, '')) LIKE ?")) {
      searchTerm = String(params[paramIdx++]).replace(/^%|%$/g, '').toLowerCase();
      paramIdx += 2;
    } else if (q.includes('LOWER(title) LIKE ?')) {
      searchTerm = String(params[paramIdx++]).replace(/^%|%$/g, '').toLowerCase();
      searchTitleOnly = true;
    }

    const filtered = Array.from(images.values()).filter((r) => {
      if (bucketFilter && r.bucket !== bucketFilter) return false;
      if (excludeHeader && r.category === 'Header') return false;
      if (targetCategory && (r.category || '').toLowerCase() !== targetCategory) return false;
      if (targetSubCategory && (r.sub_category || '').toLowerCase() !== targetSubCategory) return false;
      if (searchTerm !== null) {
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
      const counts = new Map();
      for (const r of images.values()) {
        if (r.bucket === 'main' && (r.category || '').toLowerCase() === 'anime' && r.sub_category) {
          counts.set(r.sub_category, (counts.get(r.sub_category) || 0) + 1);
        }
      }
      const results = Array.from(counts.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sub_category, count]) => ({ sub_category, count }));
      return { results };
    }

    if (q.startsWith('SELECT COUNT(*) AS total FROM images')) {
      const { filtered } = filterImages(q, params);
      return { first: { total: filtered.length }, results: [{ total: filtered.length }] };
    }

    if (q.includes('FROM images WHERE bucket =') && q.includes('ORDER BY uploaded DESC')) {
      const { filtered, nextParamIdx } = filterImages(q, params);
      const limit = params[nextParamIdx] ?? 500;
      const offset = params[nextParamIdx + 1] ?? 0;
      const results = filtered
        .sort((a, b) => (b.uploaded || '').localeCompare(a.uploaded || ''))
        .slice(offset, offset + limit);
      return { results };
    }

    if (q.includes('AS score FROM images')) {
      const [limit] = params;
      const results = Array.from(images.values())
        .filter((r) => r.bucket === 'main' && r.category !== 'Header')
        .map((r) => ({ ...r, score: (r.view_count || 0) + (r.download_count || 0) }))
        .sort((a, b) => b.score - a.score || (b.uploaded || '').localeCompare(a.uploaded || ''))
        .slice(0, limit);
      return { results };
    }

    if (q === 'SELECT view_count, download_count FROM images WHERE id = ?') {
      const row = images.get(params[0]) || null;
      return { first: row ? { view_count: row.view_count, download_count: row.download_count } : null };
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
      views.add(key);
      return { meta: { changes: had ? 0 : 1 } };
    }

    if (q.startsWith('INSERT OR IGNORE INTO downloads')) {
      const key = `${params[0]}::${params[1]}`;
      const had = downloads.has(key);
      downloads.add(key);
      return { meta: { changes: had ? 0 : 1 } };
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
    if (q === 'SELECT credits, lifetime FROM user_credits WHERE user_id = ?') {
      const u = userCredits.get(params[0]);
      return { first: u ? { credits: u.credits, lifetime: u.lifetime } : null };
    }

    if (q === 'SELECT credits FROM user_credits WHERE user_id = ?') {
      const u = userCredits.get(params[0]);
      return { first: u ? { credits: u.credits } : null };
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

    if (q.startsWith('INSERT OR IGNORE INTO user_credits')) {
      const userId = params[0];
      if (!userCredits.has(userId)) {
        userCredits.set(userId, { user_id: userId, credits: 0, lifetime: 0, recovery_hash: null });
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }

    if (q.includes('ON CONFLICT(user_id) DO UPDATE SET lifetime = 1')) {
      const userId = params[0];
      const existing = userCredits.get(userId) || { user_id: userId, credits: 0, lifetime: 0, recovery_hash: null };
      existing.lifetime = 1;
      userCredits.set(userId, existing);
      return { meta: { changes: 1 } };
    }

    if (q.includes('ON CONFLICT(user_id) DO UPDATE SET credits = credits + ?')) {
      const [userId, initialCredits, addCredits] = params;
      const existing = userCredits.get(userId);
      if (existing) {
        existing.credits += addCredits;
      } else {
        userCredits.set(userId, { user_id: userId, credits: initialCredits, lifetime: 0, recovery_hash: null });
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

    // --- PAYMENT ORDERS ---
    if (q === 'SELECT status FROM payment_orders WHERE order_id = ? LIMIT 1' || q === 'SELECT user_id, status FROM payment_orders WHERE order_id = ? LIMIT 1') {
      for (const order of paymentOrders.values()) {
        if (order.order_id === params[0]) return { first: { user_id: order.user_id, status: order.status } };
      }
      return { first: null };
    }

    if (q === 'SELECT status FROM payment_orders WHERE id = ?' || q === 'SELECT user_id, status FROM payment_orders WHERE id = ?') {
      const order = paymentOrders.get(params[0]);
      return { first: order ? { user_id: order.user_id, status: order.status } : null };
    }

    if (q.startsWith('INSERT INTO payment_orders') && q.includes('ON CONFLICT(id) DO NOTHING')) {
      const [id, user_id, order_id, pack_key, amount] = params;
      if (paymentOrders.has(id)) return { meta: { changes: 0 } };
      paymentOrders.set(id, { id, user_id, order_id, pack_key, amount, status: 'processing' });
      return { meta: { changes: 1 } };
    }

    if (q.startsWith('INSERT INTO payment_orders') && q.includes('ON CONFLICT(id) DO UPDATE')) {
      const [id, user_id, order_id, pack_key, amount, error_message] = params;
      const existing = paymentOrders.get(id);
      if (existing && existing.status === 'completed') {
        return { meta: { changes: 0 } };
      }
      paymentOrders.set(id, { id, user_id, order_id, pack_key, amount, status: 'failed', error_message });
      return { meta: { changes: 1 } };
    }

    if (q.startsWith('INSERT OR REPLACE INTO payment_orders')) {
      const [id, user_id, order_id, pack_key, amount, error_message] = params;
      paymentOrders.set(id, { id, user_id, order_id, pack_key, amount, status: 'failed', error_message });
      return { meta: { changes: 1 } };
    }

    if (q.startsWith("UPDATE payment_orders SET status = 'completed'")) {
      const [completed_at, id] = params;
      const order = paymentOrders.get(id);
      if (order) {
        order.status = 'completed';
        order.completed_at = completed_at;
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
  };

  await handleScheduled(env);
  return env;
} 