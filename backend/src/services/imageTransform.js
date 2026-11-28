// Image transformation preset validation & Cloudflare fetch({ cf: { image } }) option builder.
export const ALLOWED_IMAGE_WIDTHS = new Set([400, 800, 1600]);
const ALLOWED_FITS = new Set(['scale-down', 'contain', 'cover', 'crop', 'pad']);
const FORMAT_TO_MIME = {
  webp: 'image/webp',
  avif: 'image/avif',
  jpeg: 'image/jpeg',
  jpg:  'image/jpeg',
  png:  'image/png',
};

function parseStrictPresetDim(raw, label) {
  if (raw === null || raw === undefined || raw === '') return { value: null };
  if (!/^\d+$/.test(String(raw).trim())) {
    return { error: `Invalid ${label} parameter; allowed presets: 400, 800, 1600` };
  }
  const parsed = parseInt(String(raw).trim(), 10);
  if (!ALLOWED_IMAGE_WIDTHS.has(parsed)) {
    return { error: `Unsupported ${label}=${parsed}; allowed presets: 400, 800, 1600` };
  }
  return { value: parsed };
}

function clampInt(raw, min, max) {
  if (raw === null || raw === undefined || raw === '') return null;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(min, parsed));
}

export function negotiateOutputMime(fmt, acceptHeader = '') {
  const normalized = String(fmt || 'auto').trim().toLowerCase();
  if (FORMAT_TO_MIME[normalized]) {
    return FORMAT_TO_MIME[normalized];
  }

  const accept = String(acceptHeader || '').toLowerCase();
  if (accept.includes('image/avif')) return 'image/avif';
  if (accept.includes('image/webp')) return 'image/webp';
  return 'image/jpeg';
}

export function parseTransformOptions(searchParams, acceptHeader = '') {
  if (!searchParams || searchParams.get('raw') === '1') return null;

  const rawW    = searchParams.get('w') ?? searchParams.get('width');
  const rawH    = searchParams.get('h') ?? searchParams.get('height');
  const rawQ    = searchParams.get('q') ?? searchParams.get('quality');
  const rawFit  = searchParams.get('fit');
  const rawFmt  = searchParams.get('fmt') ?? searchParams.get('format');
  const rawBlur = searchParams.get('blur');

  const hasAny = [rawW, rawH, rawQ, rawFit, rawFmt, rawBlur].some(v => v !== null && v !== '');
  if (!hasAny) return null;

  const wCheck = parseStrictPresetDim(rawW, 'width');
  if (wCheck.error) return { error: wCheck.error, status: 400 };
  const hCheck = parseStrictPresetDim(rawH, 'height');
  if (hCheck.error) return { error: hCheck.error, status: 400 };

  const width   = wCheck.value ?? (hCheck.value ? null : 800);
  const height  = hCheck.value;
  const quality = clampInt(rawQ, 30, 100) ?? 80;
  const blur    = clampInt(rawBlur, 1, 250);
  const fitNorm = String(rawFit || '').trim().toLowerCase();
  const fit     = ALLOWED_FITS.has(fitNorm) ? fitNorm : 'scale-down';
  const outputMime = negotiateOutputMime(rawFmt || 'auto', acceptHeader);

  return {
    width,
    height,
    quality,
    fit,
    blur,
    outputMime,
  };
}

export function buildCfImageOptions(transformOpts) {
  if (!transformOpts || transformOpts.error) return null;
  const cfImage = {
    fit:     transformOpts.fit || 'scale-down',
    quality: transformOpts.quality || 80,
    format:  'auto',
  };
  if (transformOpts.width)  cfImage.width  = transformOpts.width;
  if (transformOpts.height) cfImage.height = transformOpts.height;
  if (transformOpts.blur)   cfImage.blur   = transformOpts.blur;
  return cfImage;
}
