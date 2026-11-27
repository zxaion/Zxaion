// Parsing key R2 → metadata gambar (id stabil, kategori, sub-kategori, url).
export function parseImageMeta(key, bucket) {
  const allowedExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const lower = key.toLowerCase();

  if (!allowedExt.some(ext => lower.endsWith(ext))) return null;

  if (lower.startsWith('_')) return null;
  if (lower.startsWith('header/') || lower.includes('/header/')) return null;

  const parts = key.split('/');
  let category = 'Other', subCategory = null;
  if (parts.length >= 2) {
    category = parts[0];
    if (parts.length > 2) subCategory = parts[1];
  }
  category = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
  if (subCategory) subCategory = subCategory.toLowerCase();

  const filename = parts[parts.length - 1];
  const title = filename
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());

  const urlPrefix = bucket === 'main'
    ? '/api/img/'
    : bucket === 'comitbase'
      ? '/api/comitbase/img/'
      : '/api/dtreasure/img/';

  return {
    // FIX: id stabil berbasis path (bucket:key), BUKAN content-hash (httpEtag).
    // ETag berubah setiap file di-replace di key yang sama → purchased_images/
    // views/downloads kehilangan relasinya. id berbasis path tetap konsisten
    // walau isi file diganti.
    id:           `${bucket}:${key}`,
    r2_key:       key,
    bucket,
    title,
    category,
    sub_category: subCategory,
    url:          `${urlPrefix}${encodeURIComponent(key)}`,
  };
}

function readUint16BE(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32BE(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function readUint24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

export function extractImageDimensions(rawBytes, contentType = '') {
  try {
    const bytes = rawBytes instanceof Uint8Array
      ? rawBytes
      : (rawBytes?.buffer ? new Uint8Array(rawBytes.buffer) : null);
    if (!bytes || bytes.length < 8) return { width: 0, height: 0 };

    // 1. SVG text inspection
    const lowerCt = String(contentType || '').toLowerCase();
    if (lowerCt.includes('svg') || (bytes[0] === 0x3c && bytes.length < 512 * 1024)) {
      const headText = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
      if (headText.includes('<svg')) {
        const vbMatch = headText.match(/viewBox=["'][\s,]*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
        if (vbMatch) {
          const w = Math.round(Number(vbMatch[1]));
          const h = Math.round(Number(vbMatch[2]));
          if (w > 0 && h > 0) return { width: w, height: h };
        }
        const wMatch = headText.match(/\bwidth=["']([\d.]+)/i);
        const hMatch = headText.match(/\bheight=["']([\d.]+)/i);
        if (wMatch && hMatch) {
          const w = Math.round(Number(wMatch[1]));
          const h = Math.round(Number(hMatch[1]));
          if (w > 0 && h > 0) return { width: w, height: h };
        }
      }
    }

    // 2. PNG (IHDR at bytes 16..23)
    if (
      bytes.length >= 24 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    ) {
      const width = readUint32BE(bytes, 16);
      const height = readUint32BE(bytes, 20);
      if (width > 0 && height > 0) return { width, height };
    }

    // 3. GIF (bytes 6..9 little-endian)
    if (
      bytes.length >= 10 &&
      bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38
    ) {
      const width = readUint16LE(bytes, 6);
      const height = readUint16LE(bytes, 8);
      if (width > 0 && height > 0) return { width, height };
    }

    // 4. WebP (RIFF....WEBP)
    if (
      bytes.length >= 30 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    ) {
      const chunkId = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
      if (chunkId === 'VP8X' && bytes.length >= 30) {
        const width = 1 + readUint24LE(bytes, 24);
        const height = 1 + readUint24LE(bytes, 27);
        if (width > 0 && height > 0) return { width, height };
      } else if (chunkId === 'VP8L' && bytes.length >= 25) {
        const b0 = bytes[21], b1 = bytes[22], b2 = bytes[23], b3 = bytes[24];
        const bits = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
        const width = (bits & 0x3fff) + 1;
        const height = ((bits >> 14) & 0x3fff) + 1;
        if (width > 0 && height > 0) return { width, height };
      } else if (chunkId === 'VP8 ' && bytes.length >= 30) {
        const width = readUint16LE(bytes, 26) & 0x3fff;
        const height = readUint16LE(bytes, 28) & 0x3fff;
        if (width > 0 && height > 0) return { width, height };
      }
    }

    // 5. JPEG (scan SOFn markers 0xFFC0..0xFFCF except DHT/DAC/JPG)
    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      let offset = 2;
      while (offset + 4 < bytes.length) {
        if (bytes[offset] !== 0xff) {
          offset++;
          continue;
        }
        while (offset < bytes.length && bytes[offset] === 0xff) offset++;
        if (offset >= bytes.length) break;
        const marker = bytes[offset++];
        if (marker === 0xd9 || marker === 0xda) break; // EOI / SOS
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
        if (offset + 2 > bytes.length) break;
        const segLen = readUint16BE(bytes, offset);
        if (segLen < 2 || offset + segLen > bytes.length) break;
        const isSof =
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf);
        if (isSof && offset + 7 <= bytes.length) {
          const height = readUint16BE(bytes, offset + 3);
          const width = readUint16BE(bytes, offset + 5);
          if (width > 0 && height > 0) return { width, height };
        }
        offset += segLen;
      }
    }
  } catch {
    return { width: 0, height: 0 };
  }
  return { width: 0, height: 0 };
}

export function decodeBase64DataUrl(dataUrl, { maxBytes = 8 * 1024 * 1024 } = {}) {
  const raw = String(dataUrl || '').trim();
  const match = raw.match(/^data:(image\/(?:png|jpeg|jpg|webp|gif|svg\+xml));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) {
    return { error: 'Unsupported or invalid image data URL. Allowed formats: PNG, JPEG, WebP, GIF.', status: 400 };
  }

  let mimeType = match[1].toLowerCase();
  if (mimeType === 'image/jpg') mimeType = 'image/jpeg';
  const extMap = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
  };
  const ext = extMap[mimeType] || 'jpg';

  const cleanB64 = match[2].replace(/\s+/g, '');
  const estimatedBytes = Math.floor((cleanB64.length * 3) / 4);
  if (estimatedBytes > maxBytes) {
    return { error: `Image exceeds maximum allowed size (${Math.round(maxBytes / (1024 * 1024))} MB).`, status: 413 };
  }

  const binary = atob(cleanB64);
  if (binary.length === 0) {
    return { error: 'Uploaded image file is empty.', status: 400 };
  }
  if (binary.length > maxBytes) {
    return { error: `Image exceeds maximum allowed size (${Math.round(maxBytes / (1024 * 1024))} MB).`, status: 413 };
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { mimeType, ext, bytes };
}

export function buildWatermarkedPreviewSvg({ title = 'Exclusive Edition', category = 'DTREASURE', previewDataUri = '', width = 480, height = 640 } = {}) {
  const safeW = Math.max(240, Math.min(480, Number(width) || 480));
  const rawH = height && width ? Math.round((safeW / Number(width)) * Number(height)) : 640;
  const safeH = Math.max(240, Math.min(720, rawH));

  const esc = (s) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const safeDataUri = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(String(previewDataUri || '').trim())
    ? String(previewDataUri).trim()
    : '';

  const imgLayer = safeDataUri
    ? `<image href="${safeDataUri}" width="${safeW}" height="${safeH}" preserveAspectRatio="xMidYMid slice" filter="url(#zx-preview-blur)" opacity="0.88"/>`
    : `<rect width="${safeW}" height="${safeH}" fill="url(#zx-preview-bg)"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${safeW} ${safeH}" width="${safeW}" height="${safeH}">
  <defs>
    <linearGradient id="zx-preview-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1c1207"/>
      <stop offset="100%" stop-color="#78350f"/>
    </linearGradient>
    <filter id="zx-preview-blur" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="8"/>
    </filter>
  </defs>
  ${imgLayer}
  <rect width="${safeW}" height="${safeH}" fill="#000000" fill-opacity="0.32"/>
  <g opacity="0.46" transform="rotate(-28 ${safeW / 2} ${safeH / 2})">
    <text x="${safeW / 2}" y="${safeH / 2 - 70}" text-anchor="middle" fill="#ffffff" font-family="Inter,system-ui,sans-serif" font-size="34" font-weight="900" letter-spacing="5">ZXAION PREVIEW</text>
    <text x="${safeW / 2}" y="${safeH / 2}" text-anchor="middle" fill="#fbbf24" font-family="Inter,system-ui,sans-serif" font-size="20" font-weight="800" letter-spacing="4">WATERMARKED EDITION</text>
    <text x="${safeW / 2}" y="${safeH / 2 + 70}" text-anchor="middle" fill="#ffffff" font-family="Inter,system-ui,sans-serif" font-size="26" font-weight="900" letter-spacing="4">UNLOCK FOR 4K</text>
  </g>
  <rect x="20" y="20" width="144" height="28" rx="14" fill="#000000" fill-opacity="0.72" stroke="#fbbf24" stroke-width="1.5"/>
  <text x="92" y="38" text-anchor="middle" fill="#fbbf24" font-family="Inter,system-ui,sans-serif" font-size="11" font-weight="800" letter-spacing="1.5">PREVIEW ONLY</text>
  <rect x="20" y="${safeH - 66}" width="${safeW - 40}" height="46" rx="10" fill="#000000" fill-opacity="0.58"/>
  <text x="34" y="${safeH - 46}" fill="#fbbf24" font-family="Inter,system-ui,sans-serif" font-size="11" font-weight="800" letter-spacing="1.5">${esc(category)}</text>
  <text x="34" y="${safeH - 28}" fill="#ffffff" font-family="Inter,system-ui,sans-serif" font-size="15" font-weight="700">${esc(title)}</text>
</svg>`;
}

