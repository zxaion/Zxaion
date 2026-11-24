/**
 * services/seo.js — Dynamic OpenGraph, Twitter Cards, and Schema.org metadata injection.
 * Supports SSR crawler previews when shared via ?photo=<id> or direct deep-links.
 */

export function buildPhotoCanonicalUrl(photoId, origin = 'https://zxaionverse.workers.dev') {
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

export function injectOpenGraphMetadata(html, photo, origin = '') {
  if (!html || typeof html !== 'string' || !photo) return html;

  const title = photo.title ? `${photo.title} — ZXAION GALLERY` : 'ZXAION GALLERY';
  const pageTitle = photo.title ? `${photo.title} — 4K Wallpaper | ZXAION GALLERY` : 'ZXAION GALLERY';
  const category = photo.category || photo.sub_category || 'Wallpaper';
  const description = `Unduh wallpaper 4K "${photo.title || 'Artwork'}" (${category}) di ZXAION GALLERY. Koleksi visual resolusi tinggi untuk desktop dan smartphone.`;
  const canonicalUrl = buildPhotoCanonicalUrl(photo.id, origin);
  const imageUrl = buildPhotoImageUrl(photo, origin);
  const jsonLd = generateSchemaJsonLd(photo, imageUrl, canonicalUrl);

  let updated = html;

  // 1. Update <title>
  if (updated.includes('<title>')) {
    updated = updated.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtmlAttr(pageTitle)}</title>`);
  }

  // 2. Update or inject meta description
  if (/name=["']description["']/i.test(updated)) {
    updated = updated.replace(/<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${escapeHtmlAttr(description)}">`);
  }

  // 3. Update or inject OpenGraph meta tags
  const ogTags = [
    `<meta property="og:type" content="article">`,
    `<meta property="og:title" content="${escapeHtmlAttr(title)}">`,
    `<meta property="og:description" content="${escapeHtmlAttr(description)}">`,
    `<meta property="og:url" content="${escapeHtmlAttr(canonicalUrl)}">`,
    `<meta property="og:image" content="${escapeHtmlAttr(imageUrl)}">`,
    `<meta property="og:image:alt" content="${escapeHtmlAttr(photo.title || 'Wallpaper Preview')}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtmlAttr(title)}">`,
    `<meta name="twitter:description" content="${escapeHtmlAttr(description)}">`,
    `<meta name="twitter:image" content="${escapeHtmlAttr(imageUrl)}">`,
    `<link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}">`,
    `<script type="application/ld+json" id="zx-schema-photo">\n${jsonLd}\n</script>`,
  ].join('\n    ');

  // Replace existing og:title and og:description if present
  updated = updated.replace(/<meta\s+property=["']og:title["'][^>]*>/gi, '');
  updated = updated.replace(/<meta\s+property=["']og:description["'][^>]*>/gi, '');
  updated = updated.replace(/<meta\s+property=["']og:image["'][^>]*>/gi, '');
  updated = updated.replace(/<meta\s+name=["']twitter:[\w:-]+["'][^>]*>/gi, '');
  updated = updated.replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '');
  updated = updated.replace(/<script\s+type=["']application\/ld\+json["']\s+id=["']zx-schema-photo["']>[\s\S]*?<\/script>/gi, '');

  if (updated.includes('</head>')) {
    updated = updated.replace('</head>', `    ${ogTags}\n</head>`);
  }

  return updated;
}

function escapeHtmlAttr(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
