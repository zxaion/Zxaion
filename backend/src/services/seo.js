/**
 * services/seo.js — Dynamic OpenGraph, Twitter Cards, Schema.org metadata injection,
 * plus dynamic /robots.txt and /sitemap.xml endpoints.
 */
import { escapeHtml } from '../utils/userToken.js';

export async function findPhotoForSeo(DB, photoId) {
  if (!DB || !photoId) return null;
  return DB.prepare(
    'SELECT id, title, category, sub_category, bucket, r2_key, width, height, uploaded FROM images WHERE id = ? OR r2_key = ?'
  ).bind(photoId, photoId).first();
}

export function resolvePublicOrigin(origin, env = null) {
  const configured = env?.APP_URL ? String(env.APP_URL).trim() : '';
  const raw = configured || origin || 'https://zxaionverse.site';
  return String(raw).replace(/\/+$/, '');
}

export function buildPhotoCanonicalUrl(photoId, origin = 'https://zxaionverse.site') {
  const base = String(origin || '').replace(/\/+$/, '');
  return `${base}/?photo=${encodeURIComponent(photoId)}`;
}

export function buildPhotoImageUrl(photo, origin = '') {
  if (!photo) return '';
  const base = String(origin || '').replace(/\/+$/, '');
  let rawUrl = photo.url || '';
  if (!rawUrl && photo.r2_key) {
    const bucket = photo.bucket || 'main';
    const prefix = bucket === 'dtreasure' ? '/api/dtreasure/img/' : (bucket === 'comitbase' ? '/api/comitbase/img/' : '/api/img/');
    rawUrl = `${prefix}${encodeURIComponent(photo.r2_key)}`;
  }
  if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
    rawUrl = `${base}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
  }
  return rawUrl;
}

export function generateSchemaJsonLd(photo, imageUrl, canonicalUrl) {
  const title = photo.title || 'ZXAION Wallpaper';
  const category = photo.category || photo.sub_category || 'Wallpaper';
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ImageObject',
    'name': title,
    'caption': title,
    'description': `Curated 4K ${category} wallpaper on ZXAION GALLERY. High resolution visual artwork.`,
    'contentUrl': imageUrl,
    'thumbnailUrl': imageUrl,
    'acquireLicensePage': canonicalUrl,
    'author': {
      '@type': 'Organization',
      'name': 'ZXAION GALLERY',
      'url': canonicalUrl.split('?')[0],
    },
  };
  return JSON.stringify(schema, null, 2);
}

function inferMimeFromKey(r2Key = '') {
  const lower = String(r2Key).toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'image/jpeg';
}

export function injectBaseSeoOrigin(html, origin = '') {
  if (!html || typeof html !== 'string' || !origin) return html;
  const base = String(origin).replace(/\/+$/, '');
  const logoAbs = `${base}/assets/brand-logo.jpg`;
  let updated = html;

  updated = updated.replace(
    /<meta\s+property=["']og:image["']\s+content=["'](?:\/assets\/brand-logo\.jpg|\/api\/img\/HEADER\/Logo\.png)["'][^>]*>/i,
    `<meta property="og:image" content="${escapeHtml(logoAbs)}">`
  );
  updated = updated.replace(
    /<meta\s+name=["']twitter:image["']\s+content=["'](?:\/assets\/brand-logo\.jpg|\/api\/img\/HEADER\/Logo\.png)["'][^>]*>/i,
    `<meta name="twitter:image" content="${escapeHtml(logoAbs)}">`
  );
  updated = updated.replace(
    /<meta\s+property=["']og:url["']\s+content=["'][^"']*["'][^>]*>/i,
    `<meta property="og:url" content="${escapeHtml(`${base}/`)}">`
  );
  updated = updated.replace(
    /<link\s+rel=["']canonical["']\s+href=["'][^"']*["'][^>]*>/i,
    `<link rel="canonical" href="${escapeHtml(`${base}/`)}">`
  );
  return updated;
}

export function injectOpenGraphMetadata(html, photo, origin = '') {
  if (!html || typeof html !== 'string' || !photo) return html;

  const title = photo.title ? `${photo.title} — ZXAION GALLERY` : 'ZXAION GALLERY';
  const pageTitle = photo.title ? `${photo.title} — 4K Wallpaper | ZXAION GALLERY` : 'ZXAION GALLERY';
  const category = photo.category || photo.sub_category || 'Wallpaper';
  const description = `Download 4K "${photo.title || 'Artwork'}" (${category}) wallpaper on ZXAION GALLERY. High-resolution visual collection for desktop and mobile.`;
  const canonicalUrl = buildPhotoCanonicalUrl(photo.id, origin);
  const imageUrl = buildPhotoImageUrl(photo, origin);
  const jsonLd = generateSchemaJsonLd(photo, imageUrl, canonicalUrl);

  let updated = html;

  // 1. Update <title>
  if (updated.includes('<title>')) {
    updated = updated.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(pageTitle)}</title>`);
  }

  // 2. Update or inject meta description
  if (/name=["']description["']/i.test(updated)) {
    updated = updated.replace(/<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${escapeHtml(description)}">`);
  }

  const photoWidth = Number(photo.width) > 0 ? Math.round(Number(photo.width)) : 0;
  const photoHeight = Number(photo.height) > 0 ? Math.round(Number(photo.height)) : 0;
  const imageMime = inferMimeFromKey(photo.r2_key || photo.url || '');

  // 3. Update or inject OpenGraph meta tags
  const ogTagLines = [
    `<meta property="og:type" content="article">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`,
    `<meta property="og:image" content="${escapeHtml(imageUrl)}">`,
    `<meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}">`,
    `<meta property="og:image:type" content="${escapeHtml(imageMime)}">`,
    photoWidth > 0 ? `<meta property="og:image:width" content="${photoWidth}">` : null,
    photoHeight > 0 ? `<meta property="og:image:height" content="${photoHeight}">` : null,
    `<meta property="og:image:alt" content="${escapeHtml(photo.title || 'Wallpaper Preview')}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">`,
    `<meta name="twitter:image:alt" content="${escapeHtml(photo.title || 'Wallpaper Preview')}">`,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`,
    `<script type="application/ld+json" id="zx-schema-photo">\n${jsonLd}\n</script>`,
  ].filter(Boolean);
  const ogTags = ogTagLines.join('\n    ');

  // Replace existing og/twitter/canonical/photo-schema tags if present
  updated = updated.replace(/<meta\s+property=["']og:type["'][^>]*>/gi, '');
  updated = updated.replace(/<meta\s+property=["']og:url["'][^>]*>/gi, '');
  updated = updated.replace(/<meta\s+property=["']og:title["'][^>]*>/gi, '');
  updated = updated.replace(/<meta\s+property=["']og:description["'][^>]*>/gi, '');
  updated = updated.replace(/<meta\s+property=["']og:image(?::[\w-]+)?["'][^>]*>/gi, '');
  updated = updated.replace(/<meta\s+name=["']twitter:[\w:-]+["'][^>]*>/gi, '');
  updated = updated.replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '');
  updated = updated.replace(/<script\s+type=["']application\/ld\+json["']\s+id=["']zx-schema-photo["']>[\s\S]*?<\/script>/gi, '');

  if (updated.includes('</head>')) {
    updated = updated.replace('</head>', `    ${ogTags}\n</head>`);
  }

  return updated;
}

export async function handleRobotsTxt({ origin, url, env, corsHeaders = {} } = {}) {
  const base = resolvePublicOrigin(origin || url?.origin, env);
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');

  return new Response(body, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

export async function handleSitemapXml({ DB, env, origin, url, corsHeaders = {} } = {}) {
  try {
    const base = resolvePublicOrigin(origin || url?.origin, env);
    let rows = [];
    if (DB) {
      const res = await DB.prepare(
        `SELECT id, r2_key, bucket, title, category, uploaded
         FROM images
         WHERE bucket IN ('main', 'comitbase', 'dtreasure')
           AND category != 'Header'
         ORDER BY uploaded DESC, id DESC
         LIMIT 5000`
      ).all();
      rows = Array.isArray(res?.results) ? res.results : [];
    }

    const nowIso = new Date().toISOString().split('T')[0];
    const urlEntries = [
      `  <url>\n    <loc>${escapeXml(`${base}/`)}</loc>\n    <lastmod>${nowIso}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    ];

    for (const row of rows) {
      if (!row?.id) continue;
      const loc = buildPhotoCanonicalUrl(row.id, base);
      const lastmod = row.uploaded && !Number.isNaN(Date.parse(row.uploaded))
        ? new Date(row.uploaded).toISOString().split('T')[0]
        : nowIso;
      const includeImageTag = row.bucket !== 'dtreasure';
      const imageBlock = includeImageTag
        ? `\n    <image:image>\n      <image:loc>${escapeXml(buildPhotoImageUrl(row, base))}</image:loc>\n      <image:title>${escapeXml(row.title || 'ZXAION Wallpaper')}</image:title>\n    </image:image>`
        : '';

      urlEntries.push(
        `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>${imageBlock}\n  </url>`
      );
    }

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
      ...urlEntries,
      '</urlset>',
      '',
    ].join('\n');

    return new Response(xml, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=1800',
      },
    });
  } catch (e) {
    console.error('/sitemap.xml error:', e.message);
    return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/xml; charset=utf-8',
      },
    });
  }
}

function escapeXml(str) {
  if (!str || typeof str !== 'string') return '';
  return escapeHtml(str).replace(/&#39;/g, '&apos;');
}
