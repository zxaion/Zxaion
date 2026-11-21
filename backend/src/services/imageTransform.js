// Helper Cloudflare Workers Images Transformation Binding (env.IMAGES).
const ALLOWED_FITS = new Set(['scale-down', 'contain', 'cover', 'crop', 'pad']);
const FORMAT_TO_MIME = {
  webp: 'image/webp',
  avif: 'image/avif',
  jpeg: 'image/jpeg',
  jpg:  'image/jpeg',
  png:  'image/png',
};

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
  const rawW   = searchParams.get('w') ?? searchParams.get('width');
  const rawH   = searchParams.get('h') ?? searchParams.get('height');
  const rawQ   = searchParams.get('q') ?? searchParams.get('quality');
  const rawFit = searchParams.get('fit');
  const rawFmt = searchParams.get('fmt') ?? searchParams.get('format');
  const rawBlur = searchParams.get('blur');

  const hasAny = [rawW, rawH, rawQ, rawFit, rawFmt, rawBlur].some(v => v !== null && v !== '');
  if (!hasAny) return null;

  const width   = clampInt(rawW, 64, 2400);
  const height  = clampInt(rawH, 64, 2400);
  const quality = clampInt(rawQ, 30, 100) ?? 82;
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

export async function applyImageTransform({ IMAGES, object, contentType, transformOpts }) {
  if (!IMAGES || !transformOpts || !object?.body) return null;

  const mime = String(contentType || '').toLowerCase();
  // Lewati SVG (vektor) karena Cloudflare Images binding memproses format raster.
  if (mime.includes('svg')) return null;

  let pipeline = IMAGES.input(object.body);
  const step = {};
  if (transformOpts.width)  step.width  = transformOpts.width;
  if (transformOpts.height) step.height = transformOpts.height;
  if (transformOpts.fit)    step.fit    = transformOpts.fit;
  if (transformOpts.blur)   step.blur   = transformOpts.blur;

  if (Object.keys(step).length > 0) {
    pipeline = pipeline.transform(step);
  }

  const output = await pipeline.output({
    format:  transformOpts.outputMime,
    quality: transformOpts.quality,
  });

  return output.response();
}
